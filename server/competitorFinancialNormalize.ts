import type { CompetitorMetric } from '../src/types/competitorAnalysis';

/** Canonical financial keys stored in competitor-data.json (v2+) */
export interface CompetitorNormalizedFinancials {
  revenue?: number;
  revenuePrior?: number;
  costOfGoodsSold?: number;
  costOfGoodsSoldPrior?: number;
  grossProfit?: number;
  grossProfitPrior?: number;
  sga?: number;
  sgaPrior?: number;
  operatingIncome?: number;
  operatingIncomePrior?: number;
  netIncome?: number;
  netIncomePrior?: number;
  totalAssets?: number;
  totalAssetsPrior?: number;
  totalLiabilities?: number;
  equity?: number;
  cashAndEquivalents?: number;
  cashAndEquivalentsMillion?: number;
  shortTermDebt?: number;
  shortTermDebtMillion?: number;
  longTermDebt?: number;
  longTermDebtMillion?: number;
  currentPortionLongTermDebt?: number;
  currentPortionLongTermDebtMillion?: number;
  accountsReceivable?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  cogsRatio?: number;
  sgaRatio?: number;
  operatingMargin?: number;
  currentRatio?: number;
  accountsReceivableTurnover?: number;
  employees?: number;
  creditRating?: string;
  currencyUnit: 'KRW';
  amountScale: '원' | '백만원';
}

/** PDF 재무제표에서 감지되는 원시 금액 단위 */
export type DocumentAmountUnit = '원' | '천원' | '백만원';

/** 원(won) 기준 매출 규모 상한 — 초과 시 단위 재추정 (천원↔백만원 오인 방지) */
const MAX_PLAUSIBLE_REVENUE_WON = 5_000_000_000_000;

function pickPlausibleAmountUnit(rawValue: number, preferred: DocumentAmountUnit): DocumentAmountUnit {
  const candidates: DocumentAmountUnit[] = [preferred, '백만원', '천원', '원'];
  const seen = new Set<DocumentAmountUnit>();

  for (const unit of candidates) {
    if (seen.has(unit)) continue;
    seen.add(unit);

    let won = rawValue;
    if (unit === '천원') won = rawValue * 1_000;
    else if (unit === '백만원') won = rawValue * 1_000_000;

    if (won > 0 && won <= MAX_PLAUSIBLE_REVENUE_WON) return unit;
  }

  return preferred;
}

export interface NormalizeFinancialMetricsOptions {
  /** PDF/문서 전체 텍스트 — 표 헤더 `(단위: 천원)` 등 감지용 */
  documentText?: string;
  /** applyNormalizedMetrics 이후 원(won) 단위 metrics — 재변환 방지 */
  metricsInWon?: boolean;
}

export const COMPETITOR_PARSE_PIPELINE_VERSION = 'unit-normalize-v8';

const FINANCIAL_STATEMENT_UNIT_PATTERNS: Array<{ unit: DocumentAmountUnit; pattern: RegExp }> = [
  { unit: '백만원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*백\s*만\s*원/u },
  { unit: '백만원', pattern: /[\(（\[]\s*단\s*위\s*[:：]\s*백\s*만\s*원\s*[\)）\]]/u },
  { unit: '천원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*천\s*원/u },
  { unit: '천원', pattern: /[\(（\[]\s*단\s*위\s*[:：]\s*천\s*원\s*[\)）\]]/u },
  { unit: '원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*원(?![\s\S]{0,6}(?:천|백\s*만))/u },
  { unit: '원', pattern: /[\(（\[]\s*단\s*위\s*[:：]\s*원\s*[\)）\]]/u },
];

export const INCOME_STATEMENT_METRIC_KEYS = new Set([
  'revenue',
  'revenuePrior',
  'costOfGoodsSold',
  'costOfGoodsSoldPrior',
  'grossProfit',
  'grossProfitPrior',
  'sga',
  'sgaPrior',
  'operatingIncome',
  'operatingIncomePrior',
  'netIncome',
  'netIncomePrior',
]);

export const BALANCE_SHEET_METRIC_KEYS = new Set([
  'totalAssets',
  'totalAssetsPrior',
  'totalLiabilities',
  'equity',
  'cashAndEquivalents',
  'accountsReceivable',
  'currentAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'currentPortionLongTermDebt',
  'cashAndEquivalentsMillion',
  'shortTermDebtMillion',
  'longTermDebtMillion',
  'currentPortionLongTermDebtMillion',
]);

const METRIC_KEYS_ALREADY_IN_MILLION = new Set([
  'cashAndEquivalentsMillion',
  'shortTermDebtMillion',
  'longTermDebtMillion',
  'currentPortionLongTermDebtMillion',
]);

const NON_AMOUNT_METRIC_KEYS = new Set([
  'cogsRatio',
  'sgaRatio',
  'operatingMargin',
  'currentRatio',
  'accountsReceivableTurnover',
  'employees',
  'employeesPrior',
  'creditRating',
  'bizNo',
]);

export function getMetricNumber(metrics: CompetitorMetric[], key: string): number | null {
  const metric = metrics.find((item) => item.key === key);
  if (metric?.value == null || metric.value === '') return null;
  if (typeof metric.value === 'number') return metric.value;
  const parsed = Number(String(metric.value).replace(/[,，]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getMetricString(metrics: CompetitorMetric[], key: string): string | undefined {
  const metric = metrics.find((item) => item.key === key);
  if (metric?.value == null || metric.value === '') return undefined;
  return String(metric.value).trim();
}

function normalizeDocumentTextForUnitScan(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** 표 상단/주석 `(단위: 천원)` 등 명시 단위 감지 */
export function detectAmountUnitFromDocumentText(text: string): DocumentAmountUnit | null {
  if (!text.trim()) return null;

  const normalized = normalizeDocumentTextForUnitScan(text);

  const statementAnchors = [
    normalized.search(/재\s*무\s*상\s*태\s*표/u),
    normalized.search(/손\s*익\s*계\s*산\s*서/u),
    normalized.search(/재무상태표/u),
    normalized.search(/손익계산서/u),
  ].filter((index) => index >= 0);

  const searchWindows: string[] = [];
  if (statementAnchors.length > 0) {
    for (const anchor of statementAnchors) {
      searchWindows.push(normalized.slice(Math.max(0, anchor - 40), anchor + 120));
    }
  }
  searchWindows.push(normalized.slice(0, 12_000));

  for (const window of searchWindows) {
    for (const { unit, pattern } of FINANCIAL_STATEMENT_UNIT_PATTERNS) {
      if (pattern.test(window)) return unit;
    }
  }

  return null;
}

/** 재무제표 섹션(손익/재무상태) 주변 단위 감지 */
export function detectSectionAmountUnit(text: string, sectionPattern: RegExp): DocumentAmountUnit | null {
  if (!text.trim()) return null;

  const normalized = normalizeDocumentTextForUnitScan(text);
  const match = normalized.match(sectionPattern);
  if (!match || match.index == null) return null;

  const window = normalized.slice(Math.max(0, match.index - 24), match.index + 180);
  for (const { unit, pattern } of FINANCIAL_STATEMENT_UNIT_PATTERNS) {
    if (pattern.test(window)) return unit;
  }
  return null;
}

export function detectDocumentAmountUnits(text: string): {
  defaultUnit: DocumentAmountUnit | null;
  incomeUnit: DocumentAmountUnit | null;
  balanceUnit: DocumentAmountUnit | null;
} {
  const defaultUnit = detectAmountUnitFromDocumentText(text);
  const incomeUnit =
    detectSectionAmountUnit(text, /손\s*익\s*계\s*산\s*서|손익계산서/u) ?? defaultUnit;
  const balanceUnit =
    detectSectionAmountUnit(text, /재\s*무\s*상\s*태\s*표|재무상태표/u) ?? defaultUnit;

  return { defaultUnit, incomeUnit, balanceUnit };
}

export function resolveMetricAmountUnit(
  metricKey: string,
  units: {
    defaultUnit: DocumentAmountUnit | null;
    incomeUnit: DocumentAmountUnit | null;
    balanceUnit: DocumentAmountUnit | null;
  },
  revenueFallback?: number | null,
): DocumentAmountUnit {
  if (INCOME_STATEMENT_METRIC_KEYS.has(metricKey)) {
    return units.incomeUnit ?? units.defaultUnit ?? inferAmountUnitFromRevenueMagnitude(revenueFallback ?? 0);
  }
  if (BALANCE_SHEET_METRIC_KEYS.has(metricKey)) {
    return units.balanceUnit ?? units.defaultUnit ?? inferAmountUnitFromRevenueMagnitude(revenueFallback ?? 0);
  }
  return units.defaultUnit ?? inferAmountUnitFromRevenueMagnitude(revenueFallback ?? 0);
}

function metricUnitHint(unit?: string): DocumentAmountUnit | null {
  if (!unit) return null;
  const compact = unit.replace(/\s+/g, '');
  if (/백만/u.test(compact)) return '백만원';
  if (/천/u.test(compact)) return '천원';
  if (compact === '원') return '원';
  return null;
}

/** 단위 미기재 시 매출액 규모로 단위 유추 (Strict Guardrail) */
export function inferAmountUnitFromRevenueMagnitude(revenue: number): DocumentAmountUnit {
  const abs = Math.abs(revenue);
  if (abs >= 100_000_000) return '원';
  if (abs >= 100_000) return '천원';
  if (abs <= 10_000) return '백만원';
  return '천원';
}

/** financialsToMetrics 이후 won 단위 metrics 여부 */
export function metricsAppearNormalizedToWon(metrics: CompetitorMetric[]): boolean {
  const revenueMetric = metrics.find((item) => item.key === 'revenue');
  const revenue = getMetricNumber(metrics, 'revenue');
  if (revenue == null || !Number.isFinite(revenue)) return false;
  if (revenueMetric?.amountUnit != null) return false;
  if (revenueMetric?.unit !== '원') return false;
  return Math.abs(revenue) >= 1_000_000_000;
}

export function inferAmountUnit(
  metrics: CompetitorMetric[],
  documentText?: string,
): DocumentAmountUnit {
  const hasPerMetricUnits = metrics.some(
    (metric) => metric.amountUnit != null && !NON_AMOUNT_METRIC_KEYS.has(metric.key),
  );
  if (hasPerMetricUnits) {
    const revenue = getMetricNumber(metrics, 'revenue');
    if (revenue != null) return inferAmountUnitFromRevenueMagnitude(revenue);
    return '백만원';
  }

  if (documentText) {
    const { defaultUnit, incomeUnit, balanceUnit } = detectDocumentAmountUnits(documentText);
    if (incomeUnit && balanceUnit && incomeUnit !== balanceUnit) {
      const revenue = getMetricNumber(metrics, 'revenue');
      return incomeUnit ?? inferAmountUnitFromRevenueMagnitude(revenue ?? 0);
    }
    if (defaultUnit) return defaultUnit;
    if (incomeUnit) return incomeUnit;
    if (balanceUnit) return balanceUnit;
  }

  const revenueMetric = metrics.find((item) => item.key === 'revenue');
  const fromMetricUnit = metricUnitHint(revenueMetric?.unit);
  if (fromMetricUnit && fromMetricUnit !== '원') return fromMetricUnit;

  for (const metric of metrics) {
    if (NON_AMOUNT_METRIC_KEYS.has(metric.key) || METRIC_KEYS_ALREADY_IN_MILLION.has(metric.key)) {
      continue;
    }
    const hinted = metricUnitHint(metric.unit);
    if (hinted && hinted !== '원') return hinted;
  }

  const revenue = getMetricNumber(metrics, 'revenue');
  if (revenue != null) return inferAmountUnitFromRevenueMagnitude(revenue);

  return '백만원';
}

/** 원시 추출값 → 백만원 (표준 JSON 저장 단위) */
export function rawAmountToMillion(value: number, unit: DocumentAmountUnit): number {
  if (unit === '천원') return Math.round((value / 1_000) * 100) / 100;
  if (unit === '원') return Math.round((value / 1_000_000) * 100) / 100;
  return Math.round(value * 100) / 100;
}

/** 원시 추출값 → 원 (내부 정규화·비율 계산용) */
export function rawAmountToWon(value: number, unit: DocumentAmountUnit): number {
  return Math.round(rawAmountToMillion(value, unit) * 1_000_000);
}

function toWonFromRaw(
  value: number | null | undefined,
  unit: DocumentAmountUnit,
  alreadyInMillion = false,
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (alreadyInMillion) return Math.round(value * 1_000_000);
  return rawAmountToWon(value, unit);
}

function toMillionFromWon(won: number | undefined): number | undefined {
  if (won == null || !Number.isFinite(won)) return undefined;
  return Math.round((won / 1_000_000) * 100) / 100;
}

function ratioPercent(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator == null || denominator == null || denominator === 0) return undefined;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function marginPercent(numerator: number | undefined, denominator: number | undefined): number | undefined {
  return ratioPercent(numerator, denominator);
}

function turnover(revenue: number | undefined, receivables: number | undefined): number | undefined {
  if (revenue == null || receivables == null || receivables === 0) return undefined;
  return Math.round((revenue / receivables) * 100) / 100;
}

function currentRatioPct(
  currentAssets: number | undefined,
  currentLiabilities: number | undefined,
): number | undefined {
  if (currentAssets == null || currentLiabilities == null || currentLiabilities === 0) return undefined;
  return Math.round((currentAssets / currentLiabilities) * 10_000) / 100;
}

function inferAmountScale(unit: DocumentAmountUnit): '원' | '백만원' {
  return unit === '백만원' ? '백만원' : '원';
}

function readAmountMetric(
  metrics: CompetitorMetric[],
  key: string,
  unit: DocumentAmountUnit,
  options: NormalizeFinancialMetricsOptions = {},
): number | undefined {
  if (METRIC_KEYS_ALREADY_IN_MILLION.has(key)) {
    const metric = metrics.find((item) => item.key === key);
    const millionValue = getMetricNumber(metrics, key);
    if (millionValue == null) return undefined;
    if (options.metricsInWon || metric?.unit === '백만원') {
      return Math.round(millionValue * 1_000_000);
    }
    const millionUnit = metric?.amountUnit ?? metricUnitHint(metric?.unit) ?? '백만원';
    return toWonFromRaw(millionValue, millionUnit, millionUnit === '백만원');
  }

  const metric = metrics.find((item) => item.key === key);
  const raw = getMetricNumber(metrics, key);
  if (raw == null) return undefined;

  if (options.metricsInWon || (metric?.unit === '원' && metric.amountUnit == null)) {
    return Math.round(raw);
  }

  let resolvedUnit: DocumentAmountUnit = unit;
  if (metric?.amountUnit) {
    resolvedUnit = metric.amountUnit;
  } else {
    const hinted = metricUnitHint(metric?.unit);
    if (hinted && hinted !== '원') resolvedUnit = hinted;
  }

  if (key === 'revenue') {
    resolvedUnit = pickPlausibleAmountUnit(raw, resolvedUnit);
  }

  const won = toWonFromRaw(raw, resolvedUnit);
  if (key === 'revenue' && won != null && won > MAX_PLAUSIBLE_REVENUE_WON) {
    for (const fallback of ['천원', '백만원', '원'] as const) {
      if (fallback === resolvedUnit) continue;
      const retry = toWonFromRaw(raw, fallback);
      if (retry != null && retry <= MAX_PLAUSIBLE_REVENUE_WON) return retry;
    }
  }

  return won;
}

export function normalizeFinancialMetrics(
  metrics: CompetitorMetric[],
  options: NormalizeFinancialMetricsOptions = {},
): CompetitorNormalizedFinancials {
  const metricsInWon = options.metricsInWon ?? metricsAppearNormalizedToWon(metrics);
  const documentUnit = metricsInWon ? '원' : inferAmountUnit(metrics, options.documentText);
  const scale: '원' | '백만원' = metricsInWon ? '원' : inferAmountScale(documentUnit);

  const revenue = readAmountMetric(metrics, 'revenue', documentUnit, options);
  const revenuePrior = readAmountMetric(metrics, 'revenuePrior', documentUnit, options);
  const costOfGoodsSold = readAmountMetric(metrics, 'costOfGoodsSold', documentUnit, options);
  const costOfGoodsSoldPrior = readAmountMetric(metrics, 'costOfGoodsSoldPrior', documentUnit, options);
  const grossProfit = readAmountMetric(metrics, 'grossProfit', documentUnit, options);
  const grossProfitPrior = readAmountMetric(metrics, 'grossProfitPrior', documentUnit, options);
  const sga = readAmountMetric(metrics, 'sga', documentUnit, options);
  const sgaPrior = readAmountMetric(metrics, 'sgaPrior', documentUnit, options);
  const operatingIncome = readAmountMetric(metrics, 'operatingIncome', documentUnit, options);
  const operatingIncomePrior = readAmountMetric(metrics, 'operatingIncomePrior', documentUnit, options);
  const netIncome = readAmountMetric(metrics, 'netIncome', documentUnit, options);
  const netIncomePrior = readAmountMetric(metrics, 'netIncomePrior', documentUnit, options);
  const totalAssets = readAmountMetric(metrics, 'totalAssets', documentUnit, options);
  const totalAssetsPrior = readAmountMetric(metrics, 'totalAssetsPrior', documentUnit, options);
  const totalLiabilities = readAmountMetric(metrics, 'totalLiabilities', documentUnit, options);
  const equity = readAmountMetric(metrics, 'equity', documentUnit, options);
  const accountsReceivable = readAmountMetric(metrics, 'accountsReceivable', documentUnit, options);
  const currentAssets = readAmountMetric(metrics, 'currentAssets', documentUnit, options);
  const currentLiabilities = readAmountMetric(metrics, 'currentLiabilities', documentUnit, options);

  const cashAndEquivalentsWon =
    readAmountMetric(metrics, 'cashAndEquivalentsMillion', documentUnit, options) ??
    readAmountMetric(metrics, 'cashAndEquivalents', documentUnit, options);
  const shortTermDebtWon =
    readAmountMetric(metrics, 'shortTermDebtMillion', documentUnit, options) ??
    readAmountMetric(metrics, 'shortTermDebt', documentUnit, options);
  const longTermDebtWon =
    readAmountMetric(metrics, 'longTermDebtMillion', documentUnit, options) ??
    readAmountMetric(metrics, 'longTermDebt', documentUnit, options);
  const currentPortionLongTermDebtWon =
    readAmountMetric(metrics, 'currentPortionLongTermDebtMillion', documentUnit, options) ??
    readAmountMetric(metrics, 'currentPortionLongTermDebt', documentUnit, options);

  const cashAndEquivalentsMillion = toMillionFromWon(cashAndEquivalentsWon);
  const shortTermDebtMillion = toMillionFromWon(shortTermDebtWon);
  const longTermDebtMillion = toMillionFromWon(longTermDebtWon);
  const currentPortionLongTermDebtMillion = toMillionFromWon(currentPortionLongTermDebtWon);

  const cashAndEquivalents = cashAndEquivalentsWon;
  const shortTermDebt = shortTermDebtWon;
  const longTermDebt = longTermDebtWon;
  const currentPortionLongTermDebt = currentPortionLongTermDebtWon;

  const cogsRatio =
    getMetricNumber(metrics, 'cogsRatio') ?? ratioPercent(costOfGoodsSold, revenue);
  const sgaRatio = getMetricNumber(metrics, 'sgaRatio') ?? ratioPercent(sga, revenue);
  const operatingMargin =
    getMetricNumber(metrics, 'operatingMargin') ?? marginPercent(operatingIncome, revenue);
  const currentRatio =
    getMetricNumber(metrics, 'currentRatio') ??
    currentRatioPct(currentAssets, currentLiabilities);
  const accountsReceivableTurnover =
    getMetricNumber(metrics, 'accountsReceivableTurnover') ??
    turnover(revenue, accountsReceivable);

  const employees = getMetricNumber(metrics, 'employees') ?? undefined;
  const creditRating = getMetricString(metrics, 'creditRating');

  return {
    revenue,
    revenuePrior,
    costOfGoodsSold,
    costOfGoodsSoldPrior,
    grossProfit,
    grossProfitPrior,
    sga,
    sgaPrior,
    operatingIncome,
    operatingIncomePrior,
    netIncome,
    netIncomePrior,
    totalAssets,
    totalAssetsPrior,
    totalLiabilities,
    equity,
    cashAndEquivalents,
    cashAndEquivalentsMillion,
    shortTermDebt,
    shortTermDebtMillion,
    longTermDebt,
    longTermDebtMillion,
    currentPortionLongTermDebt,
    currentPortionLongTermDebtMillion,
    accountsReceivable,
    currentAssets,
    currentLiabilities,
    cogsRatio,
    sgaRatio,
    operatingMargin,
    currentRatio,
    accountsReceivableTurnover,
    employees: employees != null ? Math.round(employees) : undefined,
    creditRating,
    currencyUnit: 'KRW',
    amountScale: scale,
  };
}

export function mergeNormalizedFinancials(
  primary: CompetitorNormalizedFinancials,
  secondary: CompetitorNormalizedFinancials,
): CompetitorNormalizedFinancials {
  const merged: CompetitorNormalizedFinancials = { ...primary };

  for (const [key, value] of Object.entries(secondary) as Array<
    [keyof CompetitorNormalizedFinancials, CompetitorNormalizedFinancials[keyof CompetitorNormalizedFinancials]]
  >) {
    if (key === 'currencyUnit' || key === 'amountScale') continue;
    if (value == null || value === '') continue;
    if (merged[key] == null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return normalizeFinancialMetrics(financialsToMetrics(merged), { metricsInWon: true });
}

export function financialsToMetrics(financials: CompetitorNormalizedFinancials): CompetitorMetric[] {
  const entries: Array<[string, string, number | string | undefined, string?]> = [
    ['revenue', '매출액', financials.revenue, '원'],
    ['revenuePrior', '매출액(전기)', financials.revenuePrior, '원'],
    ['costOfGoodsSold', '매출원가', financials.costOfGoodsSold, '원'],
    ['costOfGoodsSoldPrior', '매출원가(전기)', financials.costOfGoodsSoldPrior, '원'],
    ['grossProfit', '매출총이익', financials.grossProfit, '원'],
    ['grossProfitPrior', '매출총이익(전기)', financials.grossProfitPrior, '원'],
    ['sga', '판매비와관리비', financials.sga, '원'],
    ['sgaPrior', '판매비와관리비(전기)', financials.sgaPrior, '원'],
    ['operatingIncome', '영업이익', financials.operatingIncome, '원'],
    ['operatingIncomePrior', '영업이익(전기)', financials.operatingIncomePrior, '원'],
    ['netIncome', '당기순이익', financials.netIncome, '원'],
    ['netIncomePrior', '당기순이익(전기)', financials.netIncomePrior, '원'],
    ['totalAssets', '자산총계', financials.totalAssets, '원'],
    ['totalAssetsPrior', '자산총계(전기)', financials.totalAssetsPrior, '원'],
    ['totalLiabilities', '부채총계', financials.totalLiabilities, '원'],
    ['equity', '자본총계', financials.equity, '원'],
    ['cashAndEquivalents', '현금및현금성자산', financials.cashAndEquivalents, '원'],
    ['cashAndEquivalentsMillion', '현금및현금성자산', financials.cashAndEquivalentsMillion, '백만원'],
    ['shortTermDebt', '단기차입금', financials.shortTermDebt, '원'],
    ['shortTermDebtMillion', '단기차입금', financials.shortTermDebtMillion, '백만원'],
    ['longTermDebt', '장기차입금', financials.longTermDebt, '원'],
    ['longTermDebtMillion', '장기차입금', financials.longTermDebtMillion, '백만원'],
    [
      'currentPortionLongTermDebt',
      '유동성장기부채',
      financials.currentPortionLongTermDebt,
      '원',
    ],
    [
      'currentPortionLongTermDebtMillion',
      '유동성장기부채',
      financials.currentPortionLongTermDebtMillion,
      '백만원',
    ],
    ['accountsReceivable', '매출채권', financials.accountsReceivable, '원'],
    ['currentAssets', '유동자산', financials.currentAssets, '원'],
    ['currentLiabilities', '유동부채', financials.currentLiabilities, '원'],
    ['cogsRatio', '매출원가율', financials.cogsRatio, '%'],
    ['sgaRatio', '판관비율', financials.sgaRatio, '%'],
    ['operatingMargin', '영업이익률', financials.operatingMargin, '%'],
    ['currentRatio', '유동비율', financials.currentRatio, '%'],
    ['accountsReceivableTurnover', '매출채권회전율', financials.accountsReceivableTurnover, '회'],
    ['employees', '직원수', financials.employees, '명'],
    ['creditRating', '신용등급', financials.creditRating],
  ];

  return entries
    .filter(([, , value]) => value != null && value !== '')
    .map(([key, label, value, unit]) => ({
      key,
      label,
      value: value as string | number,
      unit,
    }));
}
