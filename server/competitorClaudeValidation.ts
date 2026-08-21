import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { CompetitorNormalizedFinancials, CompetitorParsedDocument } from '../src/types/competitorAnalysis';
import {
  extractJsonFromClaudeText,
  isClaudeConfigured,
  sendClaudeServerMessage,
  type ClaudeDocumentContent,
} from './claudeServer';
import {
  financialsToMetrics,
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';
import type { CompetitorRecordValidation, CompetitorValidationIssue } from './competitorParseValidation';
import {
  cleanCompanyLabel,
  extractCompanyNameFromFileName,
  isAgencyOrBoilerplateCompanyName,
} from './competitorDocumentIdentity';

export interface ClaudeFinancialExtract {
  company_name?: string;
  raw_text_excerpt?: string;
  metadata?: {
    ceo_name?: string | null;
    biz_no?: string | null;
  };
  financials?: {
    unit?: '백만원';
    revenue?: number | null;
    cogs?: number | null;
    gross_profit?: number | null;
    sga?: number | null;
    operating_profit?: number | null;
    net_income?: number | null;
    total_assets?: number | null;
    total_liabilities?: number | null;
    total_equity?: number | null;
    cash_assets?: number | null;
    total_debt?: number | null;
  };
  validation?: {
    trust?: 'ok' | 'review' | 'reparse';
    issues?: string[];
  };
}

const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024;
const MAX_PLAIN_TEXT_CHARS = 400_000;

const EXTRACT_SYSTEM = `당신은 한국어 재무·신용평가 문서 분석 전문가입니다.
첨부된 원본 파일(PDF 또는 텍스트)을 직접 읽고 원문·사명·재무를 추출합니다.
반드시 JSON만 출력하세요. 설명 문장은 금지합니다.

규칙:
- 첨부 문서에서 원문을 읽고 company_name·financials를 채울 것 (로컬 전처리 텍스트에 의존하지 말 것)
- company_name은 기업개요·회사개요·업체명·회사명·사명·기업명·기업체명 등 피분석 기업 표기에서만 추출 (첫 페이지/표지 라벨 우선)
- SCI평가정보·NICE·한국기업평가·이크레더블 등 신용평가사/발행기관 이름은 company_name으로 쓰지 말 것
- company_name을 못 찾으면 빈 문자열 금지 — 반드시 피분석 기업명 또는 null
- raw_text_excerpt에는 표지·기업개요·주요 재무 표가 드러나는 원문 발췌(가능하면 3000자 내외)
- 연결재무제표(연결손익계산서·연결재무상태표)는 제외하고, 별도·개별 또는 비연결 당기 재무제표만 사용
- 금액 단위는 반드시 백만원으로 저장
- (단위: 원) → /1,000,000, (단위: 천원) → /1,000 변환
- 매출·자산·부채 등 기본 항목의 괄호 ()는 차감/표시용 — 절대값 사용
- 손실·비용 계정만 음수 허용
- 폴더 연도의 당기(제XX기) 1열만 추출 — 전기 열 무시
- 추출 대상 항목은 기존과 동일: 매출·매출원가·매출총이익·판관비·영업이익·당기순이익·자산·부채·자본 등
- 추출 불가 필드는 null`;

function millionToWon(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.round(value * 1_000_000);
}

export function claudeExtractToFinancials(extract: ClaudeFinancialExtract): CompetitorNormalizedFinancials {
  const f = extract.financials ?? {};
  return {
    revenue: millionToWon(f.revenue),
    costOfGoodsSold: millionToWon(f.cogs),
    grossProfit: millionToWon(f.gross_profit),
    sga: millionToWon(f.sga),
    operatingIncome: millionToWon(f.operating_profit),
    netIncome: millionToWon(f.net_income),
    totalAssets: millionToWon(f.total_assets),
    totalLiabilities: millionToWon(f.total_liabilities),
    equity: millionToWon(f.total_equity),
    cashAndEquivalents: millionToWon(f.cash_assets),
    shortTermDebt: millionToWon(f.total_debt),
    currencyUnit: 'KRW',
    amountScale: '원',
  };
}

function hasNumericFinancials(financials: CompetitorNormalizedFinancials): boolean {
  return (
    (typeof financials.revenue === 'number' && Number.isFinite(financials.revenue)) ||
    (typeof financials.operatingIncome === 'number' && Number.isFinite(financials.operatingIncome)) ||
    (typeof financials.netIncome === 'number' && Number.isFinite(financials.netIncome)) ||
    (typeof financials.totalAssets === 'number' && Number.isFinite(financials.totalAssets)) ||
    (typeof financials.equity === 'number' && Number.isFinite(financials.equity))
  );
}

function resolveClaudeCompanyName(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = cleanCompanyLabel(raw);
  if (cleaned && !isAgencyOrBoilerplateCompanyName(cleaned)) {
    return cleaned.replace(/(?<=[가-힣A-Za-z)])\d{2,4}$/u, '');
  }
  const soft = raw
    .replace(/(?:주식회사|유한회사|\(주\)|\(유\)|㈜)/gu, '')
    .replace(/\s+/g, '')
    .replace(/(?<=[가-힣A-Za-z)])\d{2,4}$/u, '')
    .trim();
  if (soft.length >= 2 && !isAgencyOrBoilerplateCompanyName(soft)) return soft;
  return null;
}

/** 스프레드시트 → Claude text/plain 문서용 직렬화 (API가 xlsx 바이너리를 받지 않음) */
function serializeSpreadsheetForClaude(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    parts.push(`[시트: ${sheetName}]`);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(csv);
  }
  return parts.join('\n');
}

export function buildClaudeDocumentFromFile(
  filePath: string,
  fileName: string,
): ClaudeDocumentContent {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${fileName}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`파일이 너무 큽니다 (${Math.round(stat.size / 1024 / 1024)}MB). 28MB 이하만 지원합니다.`);
  }

  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') {
    return {
      type: 'document',
      title: fileName,
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: fs.readFileSync(filePath).toString('base64'),
      },
    };
  }

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    const data = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '').slice(0, MAX_PLAIN_TEXT_CHARS);
    return {
      type: 'document',
      title: fileName,
      source: { type: 'text', media_type: 'text/plain', data },
    };
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const data = serializeSpreadsheetForClaude(filePath).slice(0, MAX_PLAIN_TEXT_CHARS);
    return {
      type: 'document',
      title: fileName,
      source: { type: 'text', media_type: 'text/plain', data },
    };
  }

  throw new Error(`Claude 첨부를 지원하지 않는 형식입니다: ${ext}`);
}

export function applyClaudeExtractToDocument(
  doc: CompetitorParsedDocument,
  extract: ClaudeFinancialExtract,
): CompetitorParsedDocument {
  const claudeName = resolveClaudeCompanyName(extract.company_name);
  const fileName = extractCompanyNameFromFileName(doc.fileName);
  const companyName = claudeName ?? fileName ?? doc.companyName;

  const financials = claudeExtractToFinancials(extract);
  const excerpt = extract.raw_text_excerpt?.trim();
  const next: CompetitorParsedDocument = {
    ...doc,
    companyName,
    parsedAt: new Date().toISOString(),
  };

  if (excerpt) {
    next.unitContextText = excerpt.slice(0, 50_000);
    next.rawTextPreview = excerpt.slice(0, 400);
  }

  if (extract.metadata?.ceo_name) {
    next.metadata = {
      ...(doc.metadata ?? {}),
      ceo_name: extract.metadata.ceo_name,
    };
  }

  if (hasNumericFinancials(financials)) {
    const baseMetrics = financialsToMetrics(financials);
    const normalizedFinancials = normalizeFinancialMetrics(baseMetrics, { metricsInWon: true });
    next.metrics = financialsToMetrics(normalizedFinancials);
    next.warnings = (doc.warnings ?? []).filter((w) => !/추출하지 못했습니다|대기/u.test(w));
  }

  return next;
}

export async function claudeReparseDocument(
  projectRoot: string,
  doc: CompetitorParsedDocument,
  folderYear: number,
  options?: {
    apiKey?: string;
    localIssues?: CompetitorValidationIssue[];
    /** 캐시 디렉터리의 원본 파일 경로 — Claude가 원문 직접 추출 */
    filePath?: string;
  },
): Promise<{ extract: ClaudeFinancialExtract; patched: CompetitorParsedDocument } | null> {
  if (!isClaudeConfigured(projectRoot) && !options?.apiKey) return null;

  const issueLines = (options?.localIssues ?? [])
    .map((i) => `- [${i.severity}] ${i.message}`)
    .join('\n');

  const user = `폴더 연도: ${folderYear}
파일명: ${doc.fileName}
문서유형: ${doc.documentType}

참고 이슈:
${issueLines || '(없음)'}

중요:
- 첨부 원본 파일을 직접 읽고 원문·사명·재무를 추출할 것
- 첫 페이지부터 기업체명·업체명·회사명·사명·기업명 라벨의 피분석 기업명을 company_name에 반드시 채울 것
- SCI평가정보·NICE 등 신용평가사/발행기관 이름은 company_name으로 쓰지 말 것
- 연결재무제표 제외, 별도·개별·비연결 당기만 사용 (폴더 연도 ${folderYear})
- 재무 항목을 못 찾으면 null로 두되 company_name·raw_text_excerpt는 반드시 채울 것

다음 JSON 스키마로 추출:
{
  "company_name": "회사명",
  "raw_text_excerpt": "원문 발췌",
  "metadata": { "ceo_name": null, "biz_no": null },
  "financials": {
    "unit": "백만원",
    "revenue": 0, "cogs": 0, "gross_profit": 0, "sga": 0,
    "operating_profit": 0, "net_income": 0,
    "total_assets": 0, "total_liabilities": 0, "total_equity": 0,
    "cash_assets": 0, "total_debt": 0
  },
  "validation": { "trust": "ok", "issues": [] }
}`;

  let documents: ClaudeDocumentContent[] | undefined;
  if (options?.filePath) {
    documents = [buildClaudeDocumentFromFile(options.filePath, doc.fileName)];
  } else {
    // 하위 호환: 파일 경로 없으면 기존 캐시 텍스트 사용
    const fallback = doc.unitContextText ?? doc.rawTextPreview ?? '';
    if (fallback.length < 80) return null;
    documents = [
      {
        type: 'document',
        title: doc.fileName,
        source: { type: 'text', media_type: 'text/plain', data: fallback.slice(0, MAX_PLAIN_TEXT_CHARS) },
      },
    ];
  }

  const result = await sendClaudeServerMessage(projectRoot, {
    system: EXTRACT_SYSTEM,
    user,
    maxTokens: 4096,
    apiKey: options?.apiKey,
    documents,
    timeoutMs: 180_000,
  });

  const extract = extractJsonFromClaudeText(result.text) as ClaudeFinancialExtract;
  const hasName = Boolean(resolveClaudeCompanyName(extract.company_name) ?? extract.company_name?.trim());
  const hasFin =
    extract.financials != null &&
    Object.values(extract.financials).some((v) => typeof v === 'number' && Number.isFinite(v));
  if (!hasName && !hasFin) return null;

  return {
    extract,
    patched: applyClaudeExtractToDocument(doc, extract),
  };
}

export async function claudeAuditRecord(
  projectRoot: string,
  validation: CompetitorRecordValidation,
  parsedJson: Record<string, unknown>,
  options?: { apiKey?: string; priorYearJson?: Record<string, unknown> | null },
): Promise<{ trust: 'ok' | 'review' | 'reparse'; issues: string[] } | null> {
  if (!isClaudeConfigured(projectRoot) && !options?.apiKey) return null;
  if (validation.trust === 'ok') return null;

  const user = `파싱 결과를 감사하세요. JSON만 응답.

폴더연도: ${validation.folderYear}
회사: ${validation.companyName}
파일: ${validation.sourceFile ?? '-'}

이슈:
${validation.issues.map((i) => `- ${i.message}`).join('\n')}

당기 파싱 JSON:
${JSON.stringify(parsedJson, null, 2)}

${options?.priorYearJson ? `전년 JSON:\n${JSON.stringify(options.priorYearJson, null, 2)}` : ''}

응답 형식:
{"trust":"ok|review|reparse","issues":["..."],"reason":"..."}`;

  const result = await sendClaudeServerMessage(projectRoot, {
    system:
      '재무 데이터 감사관. 회사명이 신용평가사(SCI 등)인지, 연결재무제표를 썼는지, 단위·부호·전년 대비 급변을 검토. JSON만 출력.',
    user,
    maxTokens: 1024,
    apiKey: options?.apiKey,
  });

  return extractJsonFromClaudeText(result.text) as { trust: 'ok' | 'review' | 'reparse'; issues: string[] };
}

export async function generateCompetitorAiInsights(
  projectRoot: string,
  params: {
    sector: string;
    fromYear: number;
    toYear: number;
    records: Array<Record<string, unknown>>;
    validationSummary?: { review: number; reparse: number; claudeReparsed: number };
    apiKey?: string;
  },
): Promise<string> {
  const user = `경쟁사 재무 분석 인사이트를 작성하세요.

사업분야: ${params.sector}
분석기간: ${params.fromYear}~${params.toYear}
검증: review ${params.validationSummary?.review ?? 0}건, reparse ${params.validationSummary?.reparse ?? 0}건

기업별 재무 JSON (백만원):
${JSON.stringify(params.records.slice(0, 40), null, 2)}

다음 형식으로 5~8개 bullet 작성 (한국어):
- 🔴 급격한 악화 / 리스크
- 🟡 주의 / 구조적 이슈
- 🟢 성장 / 개선
- ⚠️ 데이터 신뢰도 주의 (파싱 이슈)

경영진 보고용 간결한 문체.`;

  const result = await sendClaudeServerMessage(projectRoot, {
    system: '한국어 재무·경쟁사 분석 전문가. 수치 근거를 명시하고 과장하지 않음.',
    user,
    maxTokens: 2048,
    apiKey: params.apiKey,
  });

  return result.text.trim();
}
