import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type {
  CompetitorDocumentType,
  CompetitorMetric,
  CompetitorParsedDocument,
  CompetitorSector,
} from '../src/types/competitorAnalysis';
import {
  inferCompanyNameFromAuditReport,
  isKoreanAuditReportText,
  parseKoreanAuditReportText,
} from './competitorAuditReportParser';
import {
  isKoreanCreditRatingText,
  parseKoreanCreditRatingText,
} from './competitorCreditRatingParser';
import {
  COMPETITOR_PARSE_PIPELINE_VERSION,
  financialsToMetrics,
  metricsAppearNormalizedToWon,
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';
import { extractCompetitorMetadata } from './competitorMetadataExtract';
import {
  resolveDocumentIdentity,
} from './competitorDocumentIdentity';

const PARSED_ANALYSIS_FILE = '.parsed-analysis.json';

const METRIC_PATTERNS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'revenue', label: '매출액', pattern: /매출\s*액?|매출액|영업수익|총\s*매출/u },
  { key: 'operatingIncome', label: '영업이익', pattern: /영업\s*이익|영업손익/u },
  { key: 'netIncome', label: '당기순이익', pattern: /당기\s*순\s*이익|순\s*이익|당기순손익/u },
  { key: 'totalAssets', label: '자산총계', pattern: /자산\s*총\s*계|총\s*자산/u },
  { key: 'totalLiabilities', label: '부채총계', pattern: /부채\s*총\s*계|총\s*부채/u },
  { key: 'equity', label: '자본총계', pattern: /자본\s*총\s*계|총\s*자본|자기\s*자본/u },
  { key: 'creditRating', label: '신용등급', pattern: /신용\s*등급|등급/u },
  { key: 'employees', label: '종업원수', pattern: /종업원\s*수|임직원\s*수|직원\s*수/u },
];

const COMPANY_NAME_PATTERNS = [
  /\[([^\]]+)\]/u,
  /(?:회사명|업체명|기업명|상호)\s*[:：]?\s*([가-힣A-Za-z0-9()（）·\s]{2,40})/u,
  /(?:\(주\)|㈜|주식회사)\s*([가-힣A-Za-z0-9()（）·\s&]{2,30})/u,
];

function normalizeCell(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[,，]/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferDocumentType(fileName: string, text: string): CompetitorDocumentType {
  if (/감사보고서|감\s*사\s*보\s*고\s*서/u.test(fileName) || isKoreanAuditReportText(text)) {
    return 'audit-report';
  }
  if (/사업보고서|사\s*업\s*보\s*고\s*서/u.test(fileName)) {
    return 'business-report';
  }

  const haystack = `${fileName} ${text}`.toLowerCase();
  if (/신용평가|credit rating|기업신용|company rating/i.test(haystack)) return 'credit-rating';
  if (/감사|audit|재무제표|손익계산서|재무상태표/i.test(haystack)) return 'audit-report';
  if (/손익|재무|balance|income/i.test(haystack)) return 'financial-sheet';
  return 'unknown';
}

function isBoilerplateCompanyName(name: string): boolean {
  return /신용정보|보호에\s*관한|법률|report\s*no|이용\s*및/i.test(name);
}

export function inferCompanyNameFromFileName(fileName: string): string | undefined {
  const bracketMatch = fileName.match(/\[([^\]]+)\]/u);
  if (bracketMatch?.[1]) {
    return bracketMatch[1]
      .replace(/감사보고서.*$/u, '')
      .replace(/\(\d{4}[^)]*\)/g, '')
      .trim();
  }

  const stockMatch = fileName.match(/\(?(?:주|유|㈜)\)?([^().]+?)(?:\(|\[|\.|$)/u);
  if (stockMatch?.[1]) {
    return stockMatch[1].trim();
  }

  const baseName = path.basename(fileName, path.extname(fileName));
  const stripped = baseName
    .replace(/^\[[^\]]+\]/, '')
    .replace(/[_-]?(감사보고서|신용평가서|신용평가|평가서|\(\d{4}[^)]*\)|\d{4})/g, '')
    .trim();
  return stripped.length >= 2 ? stripped : undefined;
}

function inferCompanyName(fileName: string, text: string): string | undefined {
  const fromAudit = inferCompanyNameFromAuditReport(fileName, text);
  if (fromAudit) return fromAudit;

  const fromFileName = inferCompanyNameFromFileName(fileName);
  if (fromFileName) return fromFileName;

  for (const pattern of COMPANY_NAME_PATTERNS) {
    const match = fileName.match(pattern) ?? text.match(pattern);
    if (match?.[1] && !isBoilerplateCompanyName(match[1])) {
      return match[1].trim();
    }
  }

  return inferCompanyNameFromGenericSource(fileName, text);
}

function inferCompanyNameFromGenericSource(fileName: string, text: string): string | undefined {
  for (const pattern of COMPANY_NAME_PATTERNS) {
    const match = fileName.match(pattern) ?? text.match(pattern);
    if (match?.[1] && !isBoilerplateCompanyName(match[1])) {
      return match[1].trim();
    }
  }

  const fromFileName = inferCompanyNameFromFileName(fileName);
  if (fromFileName) return fromFileName;

  return undefined;
}

function extractMetricsFromText(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    for (const { key, label, pattern } of METRIC_PATTERNS) {
      if (!pattern.test(line)) continue;
      const valueMatch = line.match(/(-?\d[\d,，.]*)\s*(억|백만|천|원|%|명|등급|[A-Za-z+-]+)?/u);
      const rawValue = valueMatch?.[0]?.replace(label, '').trim() ?? line.replace(pattern, '').trim();
      const numeric = parseNumeric(rawValue);
      metrics.push({
        key,
        label,
        value: key === 'creditRating' ? (rawValue || line) : (numeric ?? rawValue ?? null),
        unit: valueMatch?.[2],
      });
      break;
    }
  }

  return dedupeMetrics(metrics);
}

function applyNormalizedMetrics(metrics: CompetitorMetric[], documentText?: string): CompetitorMetric[] {
  const normalized = normalizeFinancialMetrics(metrics, { documentText });
  return financialsToMetrics(normalized);
}

const UNIT_CONTEXT_TEXT_LIMIT = 50_000;

function dedupeMetrics(metrics: CompetitorMetric[]): CompetitorMetric[] {
  const merged = new Map<string, CompetitorMetric>();

  for (const metric of metrics) {
    if (metric.value == null || String(metric.value).length === 0) continue;

    const previous = merged.get(metric.key);
    if (!previous) {
      merged.set(metric.key, metric);
      continue;
    }

    const previousNumeric = typeof previous.value === 'number';
    const nextNumeric = typeof metric.value === 'number';
    if (nextNumeric && !previousNumeric) {
      merged.set(metric.key, metric);
      continue;
    }

    if (
      nextNumeric &&
      previousNumeric &&
      Math.abs(metric.value as number) > Math.abs(previous.value as number)
    ) {
      merged.set(metric.key, metric);
    }
  }

  return [...merged.values()];
}

function resolveDocumentCompanyKey(doc: CompetitorParsedDocument): string {
  return (
    inferCompanyNameFromFileName(doc.fileName) ??
    (doc.companyName && !isBoilerplateCompanyName(doc.companyName) ? doc.companyName : undefined) ??
    path.basename(doc.fileName, path.extname(doc.fileName))
  );
}

function parseSpreadsheet(filePath: string): { text: string; metrics: CompetitorMetric[]; warnings: string[] } {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const warnings: string[] = [];
  const metrics: CompetitorMetric[] = [];
  const textParts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    for (const row of rows) {
      const cells = row.map(normalizeCell).filter(Boolean);
      if (cells.length === 0) continue;
      textParts.push(cells.join(' | '));

      if (cells.length >= 2) {
        const label = cells[0];
        const valueCell = cells[1];
        const matched = METRIC_PATTERNS.find(({ pattern }) => pattern.test(label));
        if (matched) {
          const numeric = parseNumeric(valueCell);
          metrics.push({
            key: matched.key,
            label: matched.label,
            value: matched.key === 'creditRating' ? valueCell : numeric ?? valueCell,
          });
        }
      }
    }
  }

  if (metrics.length === 0) {
    warnings.push('표 형식에서 표준 재무 지표를 찾지 못했습니다. 텍스트 패턴으로 재시도합니다.');
    metrics.push(...extractMetricsFromText(textParts.join('\n')));
  }

  return { text: textParts.join('\n'), metrics: dedupeMetrics(metrics), warnings };
}

async function parsePdf(filePath: string): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    await parser.destroy();
    return { text: textResult.text?.replace(/\r/g, '') ?? '', warnings };
  } catch (error) {
    warnings.push(
      `PDF 텍스트 추출에 실패했습니다. ${error instanceof Error ? error.message : '파일 형식을 확인하세요.'}`,
    );
    return { text: '', warnings };
  }
}

export async function parseCompetitorDocument(
  filePath: string,
  options: { fileName: string; year: number; sector: CompetitorSector },
): Promise<CompetitorParsedDocument> {
  const ext = path.extname(options.fileName).toLowerCase();
  const warnings: string[] = [];
  let text = '';
  let metrics: CompetitorMetric[] = [];
  let companyName: string | undefined;
  let fiscalYear: number | undefined;
  let auditFirm: string | undefined;

  if (ext === '.pdf') {
    const pdf = await parsePdf(filePath);
    text = pdf.text;
    warnings.push(...pdf.warnings);

    if (isKoreanAuditReportText(text)) {
      const audit = parseKoreanAuditReportText(text, options.fileName, options.year);
      metrics = applyNormalizedMetrics(audit.metrics, text);
      companyName = audit.companyName;
      fiscalYear = audit.fiscalYear;
      auditFirm = audit.auditFirm;
      warnings.push(...audit.warnings);
    } else if (isKoreanCreditRatingText(text)) {
      const credit = parseKoreanCreditRatingText(text, options.fileName, options.year);
      metrics = applyNormalizedMetrics(credit.metrics, text);
      companyName = credit.companyName;
      fiscalYear = credit.fiscalYear;
      warnings.push(...credit.warnings);
    } else if (/손\s*익\s*계\s*산\s*서|재\s*무\s*상\s*태\s*표|손익계산서|재무상태표/u.test(text)) {
      const audit = parseKoreanAuditReportText(text, options.fileName, options.year);
      metrics = applyNormalizedMetrics(audit.metrics, text);
      companyName = audit.companyName;
      fiscalYear = audit.fiscalYear;
      warnings.push(...audit.warnings);
    } else {
      metrics = applyNormalizedMetrics(extractMetricsFromText(text), text);
    }
  } else if (ext === '.csv' || ext === '.xlsx' || ext === '.xls') {
    const sheet = parseSpreadsheet(filePath);
    text = sheet.text;
    metrics = applyNormalizedMetrics(sheet.metrics, text);
    warnings.push(...sheet.warnings);
  } else {
    warnings.push(`지원하지 않는 파일 형식입니다: ${ext}`);
  }

  const documentType =
    ext === '.pdf' && isKoreanAuditReportText(text)
      ? 'audit-report'
      : ext === '.pdf' && isKoreanCreditRatingText(text)
        ? 'credit-rating'
        : inferDocumentType(options.fileName, text);
  companyName = companyName ?? inferCompanyName(options.fileName, text);

  const identity = resolveDocumentIdentity(
    text.slice(0, UNIT_CONTEXT_TEXT_LIMIT),
    options.fileName,
    options.year,
    companyName,
  );
  companyName = identity.companyName;
  fiscalYear = identity.fiscalYear;

  if (documentType === 'credit-rating') {
    metrics = metrics.filter(
      (metric) =>
        metric.key === 'creditRating' ||
        (typeof metric.value === 'number' &&
          (Math.abs(metric.value) >= 1 ||
            ['cogsRatio', 'sgaRatio', 'operatingMargin', 'currentRatio', 'accountsReceivableTurnover'].includes(
              metric.key,
            ) ||
            metric.unit === '%' ||
            metric.unit === '회' ||
            metric.unit === '명')),
    );
  }

  if (metrics.length === 0) {
    warnings.push('분석 가능한 지표를 추출하지 못했습니다. 파일 형식·항목명을 확인하세요.');
  }

  const unitContextText = text.slice(0, UNIT_CONTEXT_TEXT_LIMIT);
  const metadata = extractCompetitorMetadata({
    text: unitContextText,
    fileName: options.fileName,
    companyName,
    documentType,
    metrics,
  });

  return {
    fileName: options.fileName,
    sector: options.sector,
    year: options.year,
    fiscalYear,
    documentType,
    companyName,
    auditFirm,
    metrics,
    metadata,
    rawTextPreview: text.slice(0, 400),
    unitContextText,
    parsedAt: new Date().toISOString(),
    warnings,
  };
}

export async function buildCompetitorAnalysisFromCache(
  cacheDir: string,
  year: number,
  sector: CompetitorSector,
) {
  const fileNames = fs
    .readdirSync(cacheDir)
    .filter((name) => !name.startsWith('.') && !name.endsWith('.json'))
    .filter((name) => {
      const lower = name.toLowerCase();
      return ['.pdf', '.csv', '.xlsx', '.xls'].some((ext) => lower.endsWith(ext));
    })
    .filter((name) => fs.statSync(path.join(cacheDir, name)).isFile());

  const cacheSignature = `${COMPETITOR_PARSE_PIPELINE_VERSION}|${fileNames
    .map((name) => {
      const stat = fs.statSync(path.join(cacheDir, name));
      return `${name}:${stat.size}:${stat.mtimeMs}`;
    })
    .sort()
    .join('|')}`;

  const parsedCachePath = path.join(cacheDir, PARSED_ANALYSIS_FILE);
  if (fs.existsSync(parsedCachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(parsedCachePath, 'utf8')) as {
        cacheSignature?: string;
        analysis?: {
          year: number;
          sector: CompetitorSector;
          documents: CompetitorParsedDocument[];
          companies: Array<{
            companyName: string;
            fileCount: number;
            documentTypes: CompetitorDocumentType[];
            metrics: CompetitorMetric[];
          }>;
        };
      };
      if (cached.cacheSignature === cacheSignature && cached.analysis) {
        return cached.analysis;
      }
    } catch {
      // cache miss — reparse
    }
  }

  const documents = await Promise.all(
    fileNames.map((fileName) =>
      parseCompetitorDocument(path.join(cacheDir, fileName), {
        fileName,
        year,
        sector,
      }),
    ),
  );

  const companyMap = new Map<
    string,
    {
      companyName: string;
      fileCount: number;
      documentTypes: Set<CompetitorDocumentType>;
      metrics: CompetitorMetric[];
    }
  >();

  for (const doc of documents) {
    const companyName = resolveDocumentCompanyKey(doc);
    doc.companyName = companyName;

    const current = companyMap.get(companyName) ?? {
      companyName,
      fileCount: 0,
      documentTypes: new Set<CompetitorDocumentType>(),
      metrics: [],
    };
    current.fileCount += 1;
    current.documentTypes.add(doc.documentType);
    current.metrics = dedupeMetrics([...current.metrics, ...doc.metrics]);
    companyMap.set(companyName, current);
  }

  const analysis = {
    year,
    sector,
    documents,
    companies: [...companyMap.values()].map((company) => ({
      companyName: company.companyName,
      fileCount: company.fileCount,
      documentTypes: [...company.documentTypes],
      metrics: company.metrics,
    })),
  };

  fs.writeFileSync(
    parsedCachePath,
    JSON.stringify({ cacheSignature, analysis }, null, 2),
    'utf8',
  );

  return analysis;
}

export function saveParsedAnalysisCache(
  cacheDir: string,
  cacheSignature: string,
  analysis: {
    year: number;
    sector: CompetitorSector;
    documents: CompetitorParsedDocument[];
    companies: Array<{
      companyName: string;
      fileCount: number;
      documentTypes: CompetitorDocumentType[];
      metrics: CompetitorMetric[];
    }>;
  },
): void {
  const parsedCachePath = path.join(cacheDir, PARSED_ANALYSIS_FILE);
  fs.writeFileSync(parsedCachePath, JSON.stringify({ cacheSignature, analysis }, null, 2), 'utf8');
}
