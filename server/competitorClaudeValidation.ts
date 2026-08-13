import type { CompetitorMetric, CompetitorNormalizedFinancials, CompetitorParsedDocument } from '../src/types/competitorAnalysis';
import {
  extractJsonFromClaudeText,
  isClaudeConfigured,
  sendClaudeServerMessage,
} from './claudeServer';
import {
  financialsToMetrics,
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';
import type { CompetitorRecordValidation, CompetitorValidationIssue } from './competitorParseValidation';

export interface ClaudeFinancialExtract {
  company_name?: string;
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

const EXTRACT_SYSTEM = `당신은 한국어 재무제표 PDF 분석 전문가입니다.
반드시 JSON만 출력하세요. 설명 문장은 금지합니다.

규칙:
- 금액 단위는 반드시 백만원으로 저장
- (단위: 원) → /1,000,000, (단위: 천원) → /1,000 변환
- 매출·자산·부채 등 기본 항목의 괄호 ()는 차감/표시용 — 절대값 사용
- 손실·비용 계정만 음수 허용
- 폴더 연도의 당기(제XX기) 1열만 추출 — 전기 열 무시
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

export function applyClaudeExtractToDocument(
  doc: CompetitorParsedDocument,
  extract: ClaudeFinancialExtract,
): CompetitorParsedDocument {
  const financials = claudeExtractToFinancials(extract);
  const baseMetrics = financialsToMetrics(financials);
  const normalizedFinancials = normalizeFinancialMetrics(baseMetrics, { metricsInWon: true });
  const metrics = financialsToMetrics(normalizedFinancials);

  return {
    ...doc,
    companyName: extract.company_name?.trim() || doc.companyName,
    metrics,
    warnings: (doc.warnings ?? []).filter((w) => !/추출하지 못했습니다/u.test(w)),
    parsedAt: new Date().toISOString(),
  };
}

export async function claudeReparseDocument(
  projectRoot: string,
  doc: CompetitorParsedDocument,
  folderYear: number,
  options?: { apiKey?: string; localIssues?: CompetitorValidationIssue[] },
): Promise<{ extract: ClaudeFinancialExtract; patched: CompetitorParsedDocument } | null> {
  if (!isClaudeConfigured(projectRoot) && !options?.apiKey) return null;

  const pdfText = doc.unitContextText ?? doc.rawTextPreview ?? '';
  if (pdfText.length < 80) return null;

  const issueLines = (options?.localIssues ?? [])
    .map((i) => `- [${i.severity}] ${i.message}`)
    .join('\n');

  const user = `폴더 연도: ${folderYear}
파일명: ${doc.fileName}
문서유형: ${doc.documentType}

로컬 파싱 이슈:
${issueLines || '(없음)'}

PDF 텍스트(발췌):
${pdfText.slice(0, 12_000)}

다음 JSON 스키마로 재추출:
{
  "company_name": "회사명",
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

  const result = await sendClaudeServerMessage(projectRoot, {
    system: EXTRACT_SYSTEM,
    user,
    maxTokens: 2048,
    apiKey: options?.apiKey,
  });

  const extract = extractJsonFromClaudeText(result.text) as ClaudeFinancialExtract;
  if (!extract.financials) return null;

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

  const user = `로컬 파싱 결과를 감사하세요. JSON만 응답.

폴더연도: ${validation.folderYear}
회사: ${validation.companyName}
파일: ${validation.sourceFile ?? '-'}

로컬 이슈:
${validation.issues.map((i) => `- ${i.message}`).join('\n')}

당기 파싱 JSON:
${JSON.stringify(parsedJson, null, 2)}

${options?.priorYearJson ? `전년 JSON:\n${JSON.stringify(options.priorYearJson, null, 2)}` : ''}

응답 형식:
{"trust":"ok|review|reparse","issues":["..."],"reason":"..."}`;

  const result = await sendClaudeServerMessage(projectRoot, {
    system: '재무 데이터 감사관. 단위·부호·전년 대비 급변을 검토. JSON만 출력.',
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

기업별 재무 JSON (백million원):
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
