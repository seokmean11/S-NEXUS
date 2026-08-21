import type { CompetitorMetric } from '../src/types/competitorAnalysis';
import {
  detectDocumentAmountUnits,
  normalizeFinancialMetrics,
  resolveMetricAmountUnit,
} from './competitorFinancialNormalize';
import {
  extractFinancialStatementSections,
  INCOME_STATEMENT_LINE_PATTERNS,
  mapLineKeyToAccount,
  readAmountForFolderYear,
  readIncomeLineAmounts,
  readIncomeLineLatestAmount,
} from './competitorFinancialStatementExtract';
import {
  cleanCompanyLabel,
  extractCompanyNameFromCover,
  extractCompanyNameFromFileName,
} from './competitorDocumentIdentity';

const BALANCE_LINE_PATTERNS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'totalAssets', label: '자산총계', pattern: /자\s*산\s*총\s*계/u },
  { key: 'totalLiabilities', label: '부채총계', pattern: /부\s*채\s*총\s*계/u },
  { key: 'equity', label: '자본총계', pattern: /자\s*본\s*총\s*계/u },
  {
    key: 'cashAndEquivalents',
    label: '현금및현금성자산',
    pattern: /현금및현금성자산(?:\([^)]*\))?/u,
  },
  { key: 'accountsReceivable', label: '매출채권', pattern: /매출채권(?:\([^)]*\))?/u },
  { key: 'currentAssets', label: '유동자산', pattern: /(?:Ⅰ\.?\s*유동자산|유\s*동\s*자\s*산)/u },
  { key: 'currentLiabilities', label: '유동부채', pattern: /(?:Ⅰ\.?\s*유동부채|유\s*동\s*부\s*채)/u },
  { key: 'shortTermDebt', label: '단기차입금', pattern: /단기차입금(?:\([^)]*\))?/u },
  { key: 'longTermDebt', label: '장기차입금', pattern: /장기차입금(?:\([^)]*\))?/u },
  {
    key: 'currentPortionLongTermDebt',
    label: '유동성장기부채',
    pattern: /유동성장기부채(?:\([^)]*\))?/u,
  },
];

const NUMERIC_TAIL = /.*?(-?\d[\d,]+(?:\s+-?\d[\d,]+)*)/u;

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[,，]/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAuditReportText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, ' ')
    .replace(/[ \t]+/g, ' ');
}

function linePatternWithNumbers(labelPattern: RegExp): RegExp {
  return new RegExp(`${labelPattern.source}${NUMERIC_TAIL.source}`, 'u');
}

export function inferCompanyNameFromAuditReport(fileName: string, text: string): string | undefined {
  const fromCover = extractCompanyNameFromCover(text, fileName);
  if (fromCover) return fromCover;

  const fromFile = extractCompanyNameFromFileName(fileName);
  if (fromFile) return fromFile;

  const bracketMatch = fileName.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1]) {
    return cleanCompanyLabel(bracketMatch[1]) ?? undefined;
  }

  return undefined;
}

export function inferFiscalYearFromAuditReport(text: string): number | undefined {
  const periodMatch = text.match(
    /(\d{4})년\s*0?1월\s*0?1일\s*부터\s*(\d{4})년\s*12월\s*31일\s*까지/u,
  );
  if (periodMatch?.[2]) return Number(periodMatch[2]);

  const closingMatch = text.match(/(\d{4})년\s*12월\s*31일\s*현재/u);
  if (closingMatch?.[1]) return Number(closingMatch[1]);

  return undefined;
}

export function inferAuditFirmFromAuditReport(text: string): string | undefined {
  const match = text.match(/([가-힣A-Za-z0-9&]+회계법인)/u);
  return match?.[1]?.trim();
}

export function inferBizNoFromAuditReport(text: string): string | undefined {
  const match =
    text.match(/사업자(?:등록)?(?:번호|번호)\s*[:：]?\s*(\d{3}-\d{2}-[\d*]{5})/u) ??
    text.match(/(\d{3}-\d{2}-\d{5})/u);
  return match?.[1]?.trim();
}

export function parseKoreanAuditReportText(
  text: string,
  fileName: string,
  folderYear?: number,
): { companyName?: string; fiscalYear?: number; auditFirm?: string; metrics: CompetitorMetric[]; warnings: string[] } {
  const normalizedText = normalizeAuditReportText(text);
  const warnings: string[] = [];
  const metrics: CompetitorMetric[] = [];

  if (!/감\s*사\s*보\s*고\s*서|재\s*무\s*상\s*태\s*표|손\s*익\s*계\s*산\s*서/u.test(normalizedText)) {
    return { metrics, warnings: ['한국어 감사보고서 재무제표 형식으로 인식되지 않았습니다.'] };
  }

  const sections = extractFinancialStatementSections(normalizedText);
  if (!sections.income && !sections.balance) {
    return { metrics, warnings: ['재무제표(손익계산서·재무상태표) 본문을 찾지 못했습니다.'] };
  }

  const sectionUnits = detectDocumentAmountUnits(normalizedText);
  let revenueHint: number | null = null;

  const incomeSection = sections.income?.text ?? '';
  for (const line of INCOME_STATEMENT_LINE_PATTERNS) {
    const account = mapLineKeyToAccount(line.key);
    let current: number | null = null;

    if (folderYear != null) {
      for (const pattern of line.patterns) {
        current = readAmountForFolderYear(incomeSection, pattern, folderYear, account);
        if (current != null) break;
      }
    } else {
      const amounts = readIncomeLineAmounts(incomeSection, line.patterns);
      current = amounts.latest;
    }

    if (current == null) continue;

    if (line.key === 'revenue') revenueHint = current;

    metrics.push({
      key: line.key,
      label: `${line.label}(당기)`,
      value: current,
      amountUnit: resolveMetricAmountUnit(line.key, sectionUnits, revenueHint),
    });
  }

  const balanceSection = sections.balance?.text ?? '';
  for (const line of BALANCE_LINE_PATTERNS) {
    const pattern = linePatternWithNumbers(line.pattern);
    const account = mapLineKeyToAccount(line.key);
    let current: number | null = null;

    if (folderYear != null) {
      current = readAmountForFolderYear(balanceSection, pattern, folderYear, account);
    } else {
      current = readIncomeLineLatestAmount(balanceSection, pattern);
    }

    if (current == null) continue;

    metrics.push({
      key: line.key,
      label: `${line.label}(당기)`,
      value: current,
      amountUnit: resolveMetricAmountUnit(line.key, sectionUnits, revenueHint),
    });
  }

  if (metrics.length === 0) {
    warnings.push('재무제표 본문에서 재무 항목을 찾지 못했습니다.');
  }

  const bizNo = inferBizNoFromAuditReport(normalizedText);
  if (bizNo) {
    metrics.push({ key: 'bizNo', label: '사업자번호', value: bizNo });
  }

  const financials = normalizeFinancialMetrics(metrics, { documentText: normalizedText });
  const ratioMetrics: CompetitorMetric[] = [];
  if (financials.cogsRatio != null) {
    ratioMetrics.push({ key: 'cogsRatio', label: '매출원가율', value: financials.cogsRatio, unit: '%' });
  }
  if (financials.sgaRatio != null) {
    ratioMetrics.push({ key: 'sgaRatio', label: '판관비율', value: financials.sgaRatio, unit: '%' });
  }
  if (financials.operatingMargin != null) {
    ratioMetrics.push({ key: 'operatingMargin', label: '영업이익률', value: financials.operatingMargin, unit: '%' });
  }
  if (financials.currentRatio != null) {
    ratioMetrics.push({ key: 'currentRatio', label: '유동비율', value: financials.currentRatio, unit: '%' });
  }
  if (financials.accountsReceivableTurnover != null) {
    ratioMetrics.push({
      key: 'accountsReceivableTurnover',
      label: '매출채권회전율',
      value: financials.accountsReceivableTurnover,
      unit: '회',
    });
  }

  return {
    companyName: inferCompanyNameFromAuditReport(fileName, normalizedText),
    fiscalYear: folderYear ?? inferFiscalYearFromAuditReport(normalizedText),
    auditFirm: inferAuditFirmFromAuditReport(normalizedText),
    metrics: [...metrics, ...ratioMetrics],
    warnings,
  };
}

export function isKoreanAuditReportText(text: string): boolean {
  const normalized = normalizeAuditReportText(text);
  return /감\s*사\s*보\s*고\s*서/u.test(normalized) && /재\s*무\s*상\s*태\s*표/u.test(normalized);
}
