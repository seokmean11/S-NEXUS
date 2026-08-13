import type { CompetitorMetric, CompetitorDocumentType, CompetitorNormalizedFinancials } from '../src/types/competitorAnalysis';
import type {
  CompetitorStandardAmounts,
  CompetitorStandardMetadata,
  CompetitorStandardRatios,
  CompetitorStandardRecord,
} from '../src/types/competitorStandard';
import {
  getMetricNumber,
  getMetricString,
  metricsAppearNormalizedToWon,
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';
import { toSourceTypeLabel, type SourceTypeLabel } from './competitorDocumentDedup';
import {
  extractCompetitorMetadata,
  type CompetitorDocumentMetadata,
} from './competitorMetadataExtract';

export const STANDARD_COMPETITOR_DATA_FILE = 'standard-competitor-data.json';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMillionFromWon(won: number | undefined | null): number | null {
  if (won == null || !Number.isFinite(won)) return null;
  return round2(won / 1_000_000);
}

function safeRatioPercent(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return round2((numerator / denominator) * 100);
}

function safeTurnover(revenue: number | null, receivables: number | null): number | null {
  if (revenue == null || receivables == null || receivables === 0) return null;
  return round2(revenue / receivables);
}

function sumNullable(...values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return round2(nums.reduce((acc, v) => acc + v, 0));
}

/** 차트 안정성 — 미추출 항목은 null 대신 0 */
function amountZero(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return round2(value);
}

function ratioZero(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return round2(value);
}

export function inferBizNoFromText(text: string): string | null {
  const patterns = [
    /사업자(?:등록)?(?:번호|번호)\s*[:：]?\s*(\d{3}-\d{2}-[\d*]{5})/u,
    /사업자\s*번호\s*[:：]?\s*(\d{3}-\d{2}-[\d*]{5})/u,
    /(\d{3}-\d{2}-\d{5})/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function inferBizNoFromMetrics(metrics: CompetitorMetric[]): string | null {
  const fromMetric = getMetricString(metrics, 'bizNo');
  return fromMetric ?? null;
}

export function buildStandardAmounts(financials: CompetitorNormalizedFinancials): CompetitorStandardAmounts {
  const revenue =
    financials.revenue != null ? toMillionFromWon(financials.revenue) : null;
  const cogsDirect =
    financials.costOfGoodsSold != null ? toMillionFromWon(financials.costOfGoodsSold) : null;
  const grossProfitDirect =
    financials.grossProfit != null ? toMillionFromWon(financials.grossProfit) : null;
  const gross_profit =
    grossProfitDirect ??
    (revenue != null && cogsDirect != null ? round2(revenue - cogsDirect) : null);
  const cogs =
    cogsDirect ??
    (revenue != null && gross_profit != null ? round2(revenue - gross_profit) : null);
  const sga = financials.sga != null ? toMillionFromWon(financials.sga) : null;
  const operating_profit =
    financials.operatingIncome != null ? toMillionFromWon(financials.operatingIncome) : null;
  const net_income =
    financials.netIncome != null ? toMillionFromWon(financials.netIncome) : null;
  const total_assets =
    financials.totalAssets != null ? toMillionFromWon(financials.totalAssets) : null;
  const current_assets =
    financials.currentAssets != null ? toMillionFromWon(financials.currentAssets) : null;
  const total_liabilities =
    financials.totalLiabilities != null ? toMillionFromWon(financials.totalLiabilities) : null;
  const current_liabilities =
    financials.currentLiabilities != null ? toMillionFromWon(financials.currentLiabilities) : null;
  const total_equity = financials.equity != null ? toMillionFromWon(financials.equity) : null;
  const cash_assets =
    financials.cashAndEquivalentsMillion ??
    (financials.cashAndEquivalents != null ? toMillionFromWon(financials.cashAndEquivalents) : null);
  const receivables =
    financials.accountsReceivable != null ? toMillionFromWon(financials.accountsReceivable) : null;

  const short_term_debt =
    financials.shortTermDebtMillion ??
    (financials.shortTermDebt != null ? toMillionFromWon(financials.shortTermDebt) : null);
  const longTermOnly =
    financials.longTermDebtMillion ??
    (financials.longTermDebt != null ? toMillionFromWon(financials.longTermDebt) : null);
  const currentPortion =
    financials.currentPortionLongTermDebtMillion ??
    (financials.currentPortionLongTermDebt != null
      ? toMillionFromWon(financials.currentPortionLongTermDebt)
      : null);
  const long_term_debt = sumNullable(longTermOnly, currentPortion);
  const total_debt = sumNullable(short_term_debt, long_term_debt);

  return {
    unit: '백만원',
    revenue: amountZero(revenue),
    cogs: amountZero(cogs),
    gross_profit: amountZero(gross_profit),
    sga: amountZero(sga),
    operating_profit: amountZero(operating_profit),
    net_income: amountZero(net_income),
    total_assets: amountZero(total_assets),
    current_assets: amountZero(current_assets),
    cash_assets: amountZero(cash_assets),
    total_liabilities: amountZero(total_liabilities),
    current_liabilities: amountZero(current_liabilities),
    short_term_debt: amountZero(short_term_debt),
    long_term_debt: amountZero(long_term_debt),
    total_equity: amountZero(total_equity),
    total_debt: amountZero(total_debt),
    receivables: amountZero(receivables),
  };
}

export function buildStandardRatios(
  amounts: CompetitorStandardAmounts,
  financials: CompetitorNormalizedFinancials,
): CompetitorStandardRatios {
  const { revenue, cogs, sga, operating_profit, total_liabilities, total_equity, receivables } =
    amounts;

  return {
    cogs_ratio: ratioZero(
      safeRatioPercent(cogs, revenue) ??
        (financials.cogsRatio != null ? round2(financials.cogsRatio) : null),
    ),
    sga_ratio: ratioZero(
      safeRatioPercent(sga, revenue) ??
        (financials.sgaRatio != null ? round2(financials.sgaRatio) : null),
    ),
    operating_margin: ratioZero(
      safeRatioPercent(operating_profit, revenue) ??
        (financials.operatingMargin != null ? round2(financials.operatingMargin) : null),
    ),
    debt_ratio: ratioZero(safeRatioPercent(total_liabilities, total_equity)),
    receivables_turnover: ratioZero(safeTurnover(revenue, receivables)),
  };
}

export function buildStandardMetadata(input: {
  companyName: string;
  metrics: CompetitorMetric[];
  text?: string;
  sourceFile?: string;
  sourceType?: SourceTypeLabel | string;
  documentType?: string;
  metadata?: CompetitorDocumentMetadata;
}): CompetitorStandardMetadata {
  const extracted =
    input.metadata ??
    extractCompetitorMetadata({
      text: input.text,
      fileName: input.sourceFile,
      companyName: input.companyName,
      documentType: input.documentType as CompetitorDocumentType | undefined,
      metrics: input.metrics,
    });

  const source_type =
    input.sourceType ??
    extracted.source_type ??
    (input.documentType
      ? toSourceTypeLabel(input.documentType as CompetitorDocumentType, input.sourceFile)
      : null);

  return {
    ceo_name: extracted.ceo_name ?? null,
    foundation_year: extracted.foundation_year ?? null,
    employees: extracted.employees ?? null,
    employees_change: extracted.employees_change ?? null,
    credit_rating:
      extracted.credit_rating ?? getMetricString(input.metrics, 'creditRating') ?? null,
    source_type,
    source_file: input.sourceFile ?? extracted.source_file ?? null,
  };
}

/** @deprecated buildStandardAmounts + buildStandardRatios 사용 */
export function buildStandardFinancials(financials: CompetitorNormalizedFinancials) {
  const amounts = buildStandardAmounts(financials);
  const ratios = buildStandardRatios(amounts, financials);
  return { ...amounts, ...ratios };
}

/** 백만원 기준 — 약 1조원 초과 시 단위 오인으로 간주하고 재정규화 */
const PLAUSIBLE_MAX_REVENUE_MILLION = 1_000_000;

function normalizeRecordFinancials(
  metrics: CompetitorMetric[],
  financials: CompetitorNormalizedFinancials | undefined,
  text?: string,
): CompetitorNormalizedFinancials {
  let resolved =
    financials ??
    normalizeFinancialMetrics(metrics, {
      documentText: text,
      metricsInWon: metricsAppearNormalizedToWon(metrics),
    });

  const revenueMillion =
    resolved.revenue != null ? round2(resolved.revenue / 1_000_000) : null;
  if (revenueMillion != null && revenueMillion > PLAUSIBLE_MAX_REVENUE_MILLION) {
    resolved = normalizeFinancialMetrics(metrics, {
      documentText: text,
      metricsInWon: false,
    });
  }

  return resolved;
}

export function buildStandardRecord(input: {
  companyName: string;
  year: number;
  metrics: CompetitorMetric[];
  financials?: CompetitorNormalizedFinancials;
  bizNo?: string | null;
  text?: string;
  sourceFile?: string;
  sourceType?: SourceTypeLabel | string;
  documentType?: string;
  metadata?: CompetitorDocumentMetadata;
}): CompetitorStandardRecord {
  const normalized = normalizeRecordFinancials(input.metrics, input.financials, input.text);
  const financials = buildStandardAmounts(normalized);
  const ratios = buildStandardRatios(financials, normalized);
  const metadata = buildStandardMetadata({
    companyName: input.companyName,
    metrics: input.metrics,
    text: input.text,
    sourceFile: input.sourceFile,
    sourceType: input.sourceType,
    documentType: input.documentType,
    metadata: input.metadata,
  });

  const biz_no =
    input.bizNo ??
    inferBizNoFromMetrics(input.metrics) ??
    (input.text ? inferBizNoFromText(input.text) : null);

  const has_data = financials.revenue > 0 || financials.operating_profit !== 0;

  return {
    company_name: input.companyName,
    biz_no,
    year: input.year,
    metadata,
    financials,
    ratios,
    has_data,
    source_file: metadata.source_file ?? undefined,
    source_type: metadata.source_type ?? undefined,
    document_type: input.documentType,
  };
}

export function buildStandardRecordsFromMetricsList(
  items: Array<{
    companyName: string;
    year: number;
    metrics: CompetitorMetric[];
    bizNo?: string | null;
    text?: string;
    sourceFile?: string;
    documentType?: string;
  }>,
): CompetitorStandardRecord[] {
  return items.map((item) => buildStandardRecord(item));
}

/** API/저장용 canonical JSON (요청 규격) */
export function toCanonicalStandardJson(record: CompetitorStandardRecord): {
  company_name: string;
  year: number;
  metadata: CompetitorStandardMetadata;
  financials: CompetitorStandardAmounts;
  ratios: Pick<
    CompetitorStandardRatios,
    'cogs_ratio' | 'operating_margin' | 'debt_ratio'
  > &
    Partial<Pick<CompetitorStandardRatios, 'sga_ratio' | 'receivables_turnover'>>;
} {
  return {
    company_name: record.company_name,
    year: record.year,
    metadata: record.metadata,
    financials: record.financials,
    ratios: {
      cogs_ratio: record.ratios.cogs_ratio,
      operating_margin: record.ratios.operating_margin,
      debt_ratio: record.ratios.debt_ratio,
      sga_ratio: record.ratios.sga_ratio,
      receivables_turnover: record.ratios.receivables_turnover,
    },
  };
}
