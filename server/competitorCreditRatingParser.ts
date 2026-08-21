import type { CompetitorMetric } from '../src/types/competitorAnalysis';
import type { DocumentAmountUnit } from './competitorFinancialNormalize';
import {
  parseFinancialAmountToken,
  type FinancialAmountAccount,
} from './competitorAmountParse';
import {
  extractFinancialStatementSections,
  extractYearColumns,
  INCOME_STATEMENT_LINE_PATTERNS,
  readIncomeLineAmounts,
  readLatestYearAmount,
} from './competitorFinancialStatementExtract';
import {
  extractCompanyNameFromCover,
  extractCompanyNameFromFileName,
} from './competitorDocumentIdentity';

function pushAmountMetric(
  metrics: CompetitorMetric[],
  key: string,
  label: string,
  value: number | null,
  amountUnit: DocumentAmountUnit,
  priorKey?: string,
  priorValue?: number | null,
): void {
  if (value != null) {
    metrics.push({
      key,
      label: `${label}(당기)`,
      value,
      amountUnit,
      unit: amountUnit,
    });
  }
  if (priorKey && priorValue != null) {
    metrics.push({
      key: priorKey,
      label: `${label}(전기)`,
      value: priorValue,
      amountUnit,
      unit: amountUnit,
    });
  }
}

function pushPercentMetric(metrics: CompetitorMetric[], key: string, label: string, value: number | null): void {
  if (value == null) return;
  metrics.push({ key, label, value, unit: '%' });
}

function parseNumeric(value: string, account: FinancialAmountAccount = 'generic'): number | null {
  return parseFinancialAmountToken(value, account);
}

function normalizeCreditReportText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n');
}

/** 손익계산서 (단위:…) 본문에서만 실적 추출 — '항목 금액 구성비' 요약표 제외 */
function parseFormalIncomeStatementSection(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const { income } = extractFinancialStatementSections(text);
  if (!income) return metrics;

  const { text: section, amountUnit } = income;

  for (const line of INCOME_STATEMENT_LINE_PATTERNS) {
    const { latest: current, prior } = readIncomeLineAmounts(section, line.patterns);
    if (current == null && prior == null) continue;

    pushAmountMetric(
      metrics,
      line.key,
      line.label,
      current,
      amountUnit,
      `${line.key}Prior`,
      prior,
    );
  }

  const revenue = metrics.find((metric) => metric.key === 'revenue')?.value;
  const cogs = metrics.find((metric) => metric.key === 'costOfGoodsSold')?.value;
  const sga = metrics.find((metric) => metric.key === 'sga')?.value;
  const operating = metrics.find((metric) => metric.key === 'operatingIncome')?.value;

  if (typeof revenue === 'number' && typeof cogs === 'number' && revenue !== 0) {
    pushPercentMetric(metrics, 'cogsRatio', '매출원가율', Math.round((cogs / revenue) * 10_000) / 100);
  }
  if (typeof revenue === 'number' && typeof sga === 'number' && revenue !== 0) {
    pushPercentMetric(metrics, 'sgaRatio', '판관비율', Math.round((sga / revenue) * 10_000) / 100);
  }
  if (typeof revenue === 'number' && typeof operating === 'number' && revenue !== 0) {
    pushPercentMetric(
      metrics,
      'operatingMargin',
      '영업이익률',
      Math.round((operating / revenue) * 10_000) / 100,
    );
  }

  return metrics;
}

/** 재무상태표 (단위:…) 본문 */
function parseFormalBalanceSheetSection(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const { balance } = extractFinancialStatementSections(text);
  if (!balance) return metrics;

  const { text: section, amountUnit } = balance;
  if (!extractYearColumns(section)) return metrics;

  const readAmountAt = (index: number): number | null => readLatestYearAmount(section, index);

  const useMillionKeys = amountUnit === '백만원';

  if (useMillionKeys) {
    pushAmountMetric(metrics, 'currentAssets', '유동자산', readAmountAt(0), amountUnit);
    pushAmountMetric(metrics, 'cashAndEquivalentsMillion', '현금및현금성자산', readAmountAt(2), amountUnit);
    pushAmountMetric(metrics, 'accountsReceivable', '매출채권', readAmountAt(4), amountUnit);
    pushAmountMetric(metrics, 'totalAssets', '자산총계', readAmountAt(12), amountUnit);
    pushAmountMetric(metrics, 'currentLiabilities', '유동부채', readAmountAt(13), amountUnit);
    pushAmountMetric(metrics, 'shortTermDebtMillion', '단기차입금', readAmountAt(15), amountUnit);
    pushAmountMetric(metrics, 'currentPortionLongTermDebtMillion', '유동성장기부채', readAmountAt(16), amountUnit);
    pushAmountMetric(metrics, 'longTermDebtMillion', '장기차입금', readAmountAt(18), amountUnit);
    pushAmountMetric(metrics, 'totalLiabilities', '부채총계', readAmountAt(21), amountUnit);
    pushAmountMetric(metrics, 'equity', '자본총계', readAmountAt(23), amountUnit);
  } else {
    pushAmountMetric(metrics, 'currentAssets', '유동자산', readAmountAt(0), amountUnit);
    pushAmountMetric(metrics, 'cashAndEquivalents', '현금및현금성자산', readAmountAt(2), amountUnit);
    pushAmountMetric(metrics, 'accountsReceivable', '매출채권', readAmountAt(4), amountUnit);
    pushAmountMetric(metrics, 'totalAssets', '자산총계', readAmountAt(12), amountUnit);
    pushAmountMetric(metrics, 'currentLiabilities', '유동부채', readAmountAt(13), amountUnit);
    pushAmountMetric(metrics, 'shortTermDebt', '단기차입금', readAmountAt(15), amountUnit);
    pushAmountMetric(metrics, 'currentPortionLongTermDebt', '유동성장기부채', readAmountAt(16), amountUnit);
    pushAmountMetric(metrics, 'longTermDebt', '장기차입금', readAmountAt(18), amountUnit);
    pushAmountMetric(metrics, 'totalLiabilities', '부채총계', readAmountAt(21), amountUnit);
    pushAmountMetric(metrics, 'equity', '자본총계', readAmountAt(23), amountUnit);
  }

  const currentAssets = readAmountAt(0);
  const currentLiabilities = readAmountAt(13);
  if (currentAssets != null && currentLiabilities != null && currentLiabilities !== 0) {
    pushPercentMetric(
      metrics,
      'currentRatio',
      '유동비율',
      Math.round((currentAssets / currentLiabilities) * 10_000) / 100,
    );
  }

  return metrics;
}

function parseEmployees(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const sectionIdx = text.indexOf('종업원현황');
  if (sectionIdx < 0) return metrics;

  const section = text.slice(sectionIdx, sectionIdx + 600);
  const rows = [...section.matchAll(/(\d{4}-\d{2}-\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/gu)];
  if (rows.length === 0) return metrics;

  const latest = rows[0];
  const total = parseNumeric(latest[5]);
  if (total != null) {
    metrics.push({ key: 'employees', label: '직원수', value: total, unit: '명' });
  }

  if (rows.length >= 2) {
    const priorTotal = parseNumeric(rows[1][5]);
    if (priorTotal != null) {
      metrics.push({ key: 'employeesPrior', label: '직원수(전기)', value: priorTotal, unit: '명' });
    }
  }

  return metrics;
}

function parseBizNo(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const match =
    text.match(/사업자(?:등록)?(?:번호|번호)\s*[:：]?\s*(\d{3}-\d{2}-[\d*]{5})/u) ??
    text.match(/(\d{3}-\d{2}-\d{5})/u);
  if (match?.[1]) {
    metrics.push({ key: 'bizNo', label: '사업자번호', value: match[1].trim() });
  }
  return metrics;
}

function parseCreditRatingGrade(text: string): CompetitorMetric[] {
  const metrics: CompetitorMetric[] = [];
  const patterns = [
    /기\s*업\s*등\s*급\s*[:：]?\s*([A-Za-z]{1,3}[+-]?|\d+[+-]?)/u,
    /신\s*용\s*등\s*급\s*[:：]?\s*([A-Za-z]{1,3}[+-]?|\d+[+-]?)/u,
    /등급\s*브리핑[\s\S]{0,120}?([A-Za-z]{1,3}[+-]?|\d+[+-]?)/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] && !/report|법률|유의/i.test(match[1])) {
      metrics.push({ key: 'creditRating', label: '신용등급', value: match[1].trim() });
      break;
    }
  }

  return metrics;
}

function inferFiscalYearFromCreditReport(text: string, folderYear: number): number | undefined {
  const { income, balance } = extractFinancialStatementSections(text);
  const fromSection = income?.latestYear ?? balance?.latestYear;
  if (fromSection) return fromSection;

  const allDates = [...text.matchAll(/20(\d{2})-12-31/gu)].map((m) => Number(`20${m[1]}`));
  if (allDates.length > 0) return Math.max(...allDates);
  return folderYear;
}

export function inferCompanyNameFromCreditReport(fileName: string, text: string): string | undefined {
  const fromCover = extractCompanyNameFromCover(text, fileName);
  if (fromCover) return fromCover;

  const fromFile = extractCompanyNameFromFileName(fileName);
  if (fromFile) return fromFile;

  return undefined;
}

export function isKoreanCreditRatingText(text: string): boolean {
  const normalized = normalizeCreditReportText(text);
  return (
    /Report\s*No/u.test(normalized) &&
    (/신용정보의\s*이용\s*및\s*보호/u.test(normalized) || /기업신용분석/u.test(normalized)) &&
    (/손익계산서/u.test(normalized) || /재무상태표/u.test(normalized))
  );
}

export function parseKoreanCreditRatingText(
  text: string,
  fileName: string,
  folderYear: number,
): {
  companyName?: string;
  fiscalYear?: number;
  metrics: CompetitorMetric[];
  warnings: string[];
} {
  const normalized = normalizeCreditReportText(text);
  const warnings: string[] = [];

  const incomeMetrics = parseFormalIncomeStatementSection(normalized);
  const balanceMetrics = parseFormalBalanceSheetSection(normalized);

  if (incomeMetrics.length === 0) {
    warnings.push(
      '신용평가서에서 손익계산서(재무제표) 본문을 찾지 못했습니다. 요약표(항목·금액·구성비)는 사용하지 않습니다.',
    );
  }
  if (balanceMetrics.length === 0) {
    warnings.push('신용평가서에서 재무상태표 본문을 찾지 못했습니다.');
  }

  const metrics = [
    ...incomeMetrics,
    ...balanceMetrics,
    ...parseEmployees(normalized),
    ...parseBizNo(normalized),
    ...parseCreditRatingGrade(normalized),
  ];

  const revenueMetric = metrics.find((metric) => metric.key === 'revenue');
  const receivables = metrics.find((metric) => metric.key === 'accountsReceivable')?.value;
  if (typeof revenueMetric?.value === 'number' && typeof receivables === 'number' && receivables !== 0) {
    if (!metrics.some((metric) => metric.key === 'accountsReceivableTurnover')) {
      metrics.push({
        key: 'accountsReceivableTurnover',
        label: '매출채권회전율',
        value: Math.round((revenueMetric.value / receivables) * 100) / 100,
        unit: '회',
      });
    }
  }

  return {
    companyName: inferCompanyNameFromCreditReport(fileName, normalized),
    fiscalYear: inferFiscalYearFromCreditReport(normalized, folderYear),
    metrics,
    warnings,
  };
}
