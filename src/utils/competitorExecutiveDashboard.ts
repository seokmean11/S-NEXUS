import type {
  CompetitorExecutiveMultiYearSummary,
  CompetitorStandardRecord,
  ExecutiveTimelinePoint,
  IndustryAnalysisEntry,
  ProductivityEmployeeEntry,
} from '@/types/competitorStandard';
import { formatExecutiveKRW } from '@/utils/formatKRW';
import {
  formatCompetitorDisplayCompanyName,
  normalizeCompetitorBizNo,
  normalizeCompetitorCompanyKey,
  resolveCompetitorRecordGroupKey,
} from '@/utils/competitorCompanyName';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';

export { formatKRW, formatKRWCompact, formatExecutiveKRW, formatExecutiveKRWCompact } from '@/utils/formatKRW';

export const EXECUTIVE_DEBT_RATIO_WARNING = 200;
export const EXECUTIVE_DEBT_RATIO_CAUTION = 150;
export const EXECUTIVE_DEBT_RATIO_WATCH = 100;
export const EXECUTIVE_SOUNDNESS_SCORE_HEALTHY = 70;
export const EXECUTIVE_SOUNDNESS_SCORE_CAUTION = 45;
export const EXECUTIVE_YEAR_MIN = 2021;
export const EXECUTIVE_YEAR_MAX = 2025;

/** 원가 구조 스택 차트 — 범례(불투명) / 막대(투명) */
export const COST_STRUCTURE_CHART_COLORS = {
  cogs: 'rgba(100, 116, 139, 0.82)',
  sga: 'rgba(139, 92, 246, 0.82)',
  margin: 'rgba(255, 122, 0, 0.82)',
  marginNegative: 'rgba(220, 38, 38, 0.82)',
  other: 'rgba(209, 213, 219, 0.82)',
  marginLegend: '#ff7a00',
} as const;

export function safeNumber(value: number | null | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value;
}

export function safePercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

/** 차트 세그먼트/뱃지용 — 0이면 '-' */
export function formatPercentLabel(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

export function marginTone(value: number): 'positive' | 'negative' | 'neutral' {
  if (!Number.isFinite(value) || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
}

export interface ExecutiveKpiSummary {
  companyCount: number;
  avgRevenue: number | null;
  avgOperatingMargin: number | null;
  topRevenueCompany: string | null;
  topRevenueAmount: number | null;
}

export function buildExecutiveKpis(
  records: CompetitorStandardRecord[],
  sector?: string,
): ExecutiveKpiSummary {
  const withRevenue = records.filter((r) => {
    const view = resolveStandardFinancialView(r);
    return view.revenue != null && view.revenue > 0;
  });
  const withMargin = records.filter((r) => resolveStandardFinancialView(r).operating_margin != null);

  const avgRevenue =
    withRevenue.length > 0
      ? withRevenue.reduce((sum, r) => sum + safeNumber(resolveStandardFinancialView(r).revenue), 0) /
        withRevenue.length
      : null;

  const avgOperatingMargin =
    withMargin.length > 0
      ? withMargin.reduce(
          (sum, r) => sum + safeNumber(resolveStandardFinancialView(r).operating_margin),
          0,
        ) / withMargin.length
      : null;

  const top =
    withRevenue.length > 0
      ? withRevenue.reduce((best, r) =>
          safeNumber(resolveStandardFinancialView(r).revenue) >
          safeNumber(resolveStandardFinancialView(best).revenue)
            ? r
            : best,
        )
      : null;

  return {
    companyCount: records.length,
    avgRevenue: avgRevenue != null ? Math.round(avgRevenue * 100) / 100 : null,
    avgOperatingMargin: avgOperatingMargin != null ? Math.round(avgOperatingMargin * 100) / 100 : null,
    topRevenueCompany: top
      ? formatCompetitorDisplayCompanyName(top.company_name, top.metadata.source_file, sector)
      : null,
    topRevenueAmount: top ? resolveStandardFinancialView(top).revenue : null,
  };
}

export interface RevenueMarginChartItem {
  companyName: string;
  revenue: number;
  operatingMargin: number;
}

export function buildRevenueMarginChartData(records: CompetitorStandardRecord[]): RevenueMarginChartItem[] {
  return records
    .filter((r) => resolveStandardFinancialView(r).revenue != null)
    .map((r) => {
      const view = resolveStandardFinancialView(r);
      return {
        companyName: formatCompetitorDisplayCompanyName(r.company_name, r.metadata.source_file),
        revenue: safeNumber(view.revenue),
        operatingMargin: safeNumber(view.operating_margin),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export const REVENUE_RANKING_CHART_LIMIT = 10;

export interface RevenueRankingYearPoint {
  year: number;
  revenue: number;
}

export interface RevenueRankingChartItem {
  rank: number;
  companyName: string;
  companyKey: string;
  latestRevenue: number;
  revenuesByYear: RevenueRankingYearPoint[];
}

function resolveRevenueRankingCompanyKey(
  record: CompetitorStandardRecord,
  sector?: string,
): string {
  return resolveCompetitorRecordGroupKey(record, sector);
}

function scoreStandardRecordQuality(record: CompetitorStandardRecord): number {
  const view = resolveStandardFinancialView(record);
  const fin = record.financials;
  let score = 0;

  if (view.revenue != null && view.revenue > 0) score += 30;
  if (view.operating_profit != null) score += 18;
  if (view.net_income != null) score += 12;
  if (fin.total_assets != null && fin.total_assets > 0) score += 20;
  if (fin.cogs != null) score += 10;
  if (fin.gross_profit != null) score += 8;
  if (view.operating_margin != null) score += 6;
  if (record.metadata.ceo_name) score += 3;
  if (record.metadata.credit_rating) score += 2;

  const docType = record.document_type ?? '';
  if (docType === 'audit-report') score += 15;
  else if (docType === 'financial-sheet') score += 10;
  else if (docType === 'credit-rating') score += 5;

  if (/대\s*표|사업자\s*번호|\n/u.test(record.company_name)) score -= 8;
  if (view.revenue != null && view.revenue < 0) score -= 20;

  return score;
}

function pickBestStandardRecord(records: CompetitorStandardRecord[]): CompetitorStandardRecord {
  return records.reduce((best, candidate) => {
    const bestScore = scoreStandardRecordQuality(best);
    const candidateScore = scoreStandardRecordQuality(candidate);
    if (candidateScore > bestScore) return candidate;
    if (candidateScore < bestScore) return best;

    const bestRevenue = safeNumber(resolveStandardFinancialView(best).revenue);
    const candidateRevenue = safeNumber(resolveStandardFinancialView(candidate).revenue);
    return candidateRevenue > bestRevenue ? candidate : best;
  });
}

export function dedupeRecordsByCompany(
  records: CompetitorStandardRecord[],
  sector?: string,
): Map<string, CompetitorStandardRecord> {
  const groups = new Map<string, CompetitorStandardRecord[]>();

  for (const record of records) {
    const key = resolveRevenueRankingCompanyKey(record, sector);
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }

  const deduped = new Map<string, CompetitorStandardRecord>();
  for (const [key, bucket] of groups) {
    deduped.set(key, pickBestStandardRecord(bucket));
  }
  return deduped;
}

export function resolveRevenueRankingChartYears(
  fromYear: number,
  toYear: number,
  rankYear: number,
): number[] {
  const years: number[] = [];
  for (let offset = 2; offset >= 0; offset -= 1) {
    const year = rankYear - offset;
    if (year >= fromYear && year <= toYear) {
      years.push(year);
    }
  }
  return years;
}

export function resolveExecutiveRankYear(summary: CompetitorExecutiveMultiYearSummary): number {
  const periodStart = summary.requestedFromYear ?? summary.fromYear;
  const periodEnd = summary.requestedToYear ?? summary.toYear;
  const effectiveEnd = summary.effectiveToYear;

  if (
    effectiveEnd != null &&
    effectiveEnd >= periodStart &&
    effectiveEnd <= periodEnd
  ) {
    return effectiveEnd;
  }

  return periodEnd;
}

export function buildRevenueRankingChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  limit = REVENUE_RANKING_CHART_LIMIT,
): RevenueRankingChartItem[] {
  const rankYear = resolveExecutiveRankYear(summary);
  const chartYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);
  const rankYearRecords = summary.recordsByYear[String(rankYear)] ?? [];
  const dedupedRankYear = dedupeRecordsByCompany(rankYearRecords, summary.sector);

  const topCompanies = [...dedupedRankYear.entries()]
    .map(([companyKey, record]) => ({
      companyKey,
      companyName: formatCompetitorDisplayCompanyName(
        record.company_name,
        record.metadata.source_file,
        summary.sector,
      ),
      latestRevenue: safeNumber(resolveStandardFinancialView(record).revenue),
    }))
    .filter((item) => item.latestRevenue > 0)
    .sort((a, b) => b.latestRevenue - a.latestRevenue)
    .slice(0, limit);

  return topCompanies.map((company, index) => {
    const revenuesByYear = chartYears.map((year) => {
      const yearRecords = summary.recordsByYear[String(year)] ?? [];
      const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);
      const record = dedupedYear.get(company.companyKey);
      return {
        year,
        revenue: record ? safeNumber(resolveStandardFinancialView(record).revenue) : 0,
      };
    });

    return {
      rank: index + 1,
      companyName: company.companyName,
      companyKey: company.companyKey,
      latestRevenue: company.latestRevenue,
      revenuesByYear,
    };
  });
}

export interface CostStructureChartItem {
  companyName: string;
  companyKey: string;
  rank: number;
  /** 스택 차트 세그먼트 높이(%) — 합계 100% 기준 */
  cogsRatio: number;
  sgaRatio: number;
  operatingMargin: number;
  otherRatio: number;
  /** 업체 원본 추출 비율(%) */
  sourceCogsRatio: number | null;
  sourceSgaRatio: number | null;
  sourceOperatingMargin: number | null;
  hasRatioData: boolean;
}

function normalizeCostStructure(
  ratios: {
    cogs_ratio?: number | null;
    sga_ratio?: number | null;
    operating_margin?: number | null;
  },
): {
  cogsRatio: number;
  sgaRatio: number;
  operatingMargin: number;
  otherRatio: number;
} {
  const cogsRatio = Math.max(0, safeNumber(ratios.cogs_ratio));
  const sgaRatio = Math.max(0, safeNumber(ratios.sga_ratio));
  const operatingMarginRaw = safeNumber(ratios.operating_margin);
  const positiveOp = Math.max(0, operatingMarginRaw);
  const positiveTotal = cogsRatio + sgaRatio + positiveOp;

  if (positiveTotal <= 0) {
    return { cogsRatio: 0, sgaRatio: 0, operatingMargin: 0, otherRatio: 100 };
  }

  if (Math.abs(positiveTotal - 100) <= 2) {
    const otherRatio = Math.max(0, 100 - cogsRatio - sgaRatio - positiveOp);
    return {
      cogsRatio,
      sgaRatio,
      operatingMargin: positiveOp,
      otherRatio,
    };
  }

  const scale = 100 / positiveTotal;
  const scaledCogs = cogsRatio * scale;
  const scaledSga = sgaRatio * scale;
  const scaledOp = positiveOp * scale;
  const otherRatio = Math.max(0, 100 - scaledCogs - scaledSga - scaledOp);

  return {
    cogsRatio: scaledCogs,
    sgaRatio: scaledSga,
    operatingMargin: scaledOp,
    otherRatio,
  };
}

function averageSimpleRatio(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Math.round(average * 100) / 100;
}

function resolveCostStructureAverageRatios(
  summary: CompetitorExecutiveMultiYearSummary,
  companyKey: string,
  chartYears: number[],
): {
  sourceCogsRatio: number | null;
  sourceSgaRatio: number | null;
  sourceOperatingMargin: number | null;
} {
  const cogsSamples: (number | null | undefined)[] = [];
  const sgaSamples: (number | null | undefined)[] = [];
  const operatingMarginSamples: (number | null | undefined)[] = [];

  for (const year of chartYears) {
    const yearRecords = summary.recordsByYear[String(year)] ?? [];
    const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);
    const record = dedupedYear.get(companyKey);
    if (!record) continue;

    const view = resolveStandardFinancialView(record);
    cogsSamples.push(view.cogs_ratio);
    sgaSamples.push(view.sga_ratio);
    operatingMarginSamples.push(view.operating_margin);
  }

  return {
    sourceCogsRatio: averageSimpleRatio(cogsSamples),
    sourceSgaRatio: averageSimpleRatio(sgaSamples),
    sourceOperatingMargin: averageSimpleRatio(operatingMarginSamples),
  };
}

export function formatCostStructureAveragePeriodLabel(years: number[]): string {
  if (years.length === 0) return '단순 평균';
  if (years.length === 1) return `${years[0]}년`;
  return `${years[0]}–${years[years.length - 1]}년 ${years.length}년 단순 평균`;
}

export function buildCostStructureChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  revenueRanking: RevenueRankingChartItem[],
): CostStructureChartItem[] {
  if (revenueRanking.length === 0) return [];

  const rankYear = resolveExecutiveRankYear(summary);
  const chartYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);

  return revenueRanking.map((company) => {
    const { sourceCogsRatio, sourceSgaRatio, sourceOperatingMargin } =
      resolveCostStructureAverageRatios(summary, company.companyKey, chartYears);
    const hasRatioData =
      sourceCogsRatio != null || sourceSgaRatio != null || sourceOperatingMargin != null;

    if (!hasRatioData || company.latestRevenue <= 0) {
      return {
        companyName: company.companyName,
        companyKey: company.companyKey,
        rank: company.rank,
        cogsRatio: 0,
        sgaRatio: 0,
        operatingMargin: 0,
        otherRatio: 100,
        sourceCogsRatio,
        sourceSgaRatio,
        sourceOperatingMargin,
        hasRatioData: false,
      };
    }

    const normalized = normalizeCostStructure({
      cogs_ratio: sourceCogsRatio,
      sga_ratio: sourceSgaRatio,
      operating_margin: sourceOperatingMargin,
    });

    return {
      companyName: company.companyName,
      companyKey: company.companyKey,
      rank: company.rank,
      ...normalized,
      sourceCogsRatio,
      sourceSgaRatio,
      sourceOperatingMargin,
      hasRatioData,
    };
  });
}

export interface ProductivityChartItem {
  companyName: string;
  companyKey: string;
  rank: number;
  avgEmployees: number | null;
  revenuePerEmployeeEok: number | null;
  operatingProfitPerEmployeeEok: number | null;
  hasProductivityData: boolean;
  employeesReferenceYear: number | null;
  employeesSource: 'credit-report' | 'metadata' | null;
}

export function toProductivityPerEmployeeEok(
  amountMillions: number | null,
  employees: number | null,
): number | null {
  if (amountMillions == null || employees == null || employees <= 0) return null;
  return Math.round((amountMillions / employees / 100) * 10) / 10;
}

export function resolveProductivityAnalysisYear(
  summary: CompetitorExecutiveMultiYearSummary,
): number {
  const periodStart = summary.requestedFromYear ?? summary.fromYear;
  const periodEnd = summary.requestedToYear ?? summary.toYear;

  const hasRecords = (year: number): boolean =>
    (summary.recordsByYear[String(year)] ?? []).some(
      (record) => safeNumber(resolveStandardFinancialView(record).revenue) > 0,
    );

  if (hasRecords(periodEnd)) return periodEnd;

  const effectiveEnd = summary.effectiveToYear;
  if (
    effectiveEnd != null &&
    effectiveEnd >= periodStart &&
    effectiveEnd <= periodEnd &&
    hasRecords(effectiveEnd)
  ) {
    return effectiveEnd;
  }

  for (let year = periodEnd; year >= periodStart; year -= 1) {
    if (hasRecords(year)) return year;
  }

  return periodEnd;
}

export function resolveProductivityOverlaySearchYears(
  summary: CompetitorExecutiveMultiYearSummary,
  productivityYear: number,
): number[] {
  const periodStart = summary.requestedFromYear ?? summary.fromYear;
  const periodEnd = summary.requestedToYear ?? summary.toYear;
  const years: number[] = [];

  for (let year = periodEnd; year >= periodStart; year -= 1) {
    years.push(year);
  }

  if (years.length === 0) {
    return [productivityYear];
  }

  return years;
}

export function buildProductivityRevenueRanking(
  summary: CompetitorExecutiveMultiYearSummary,
  limit = REVENUE_RANKING_CHART_LIMIT,
): RevenueRankingChartItem[] {
  const productivityYear = resolveProductivityAnalysisYear(summary);
  const yearRecords = summary.recordsByYear[String(productivityYear)] ?? [];
  const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);

  const topCompanies = [...dedupedYear.entries()]
    .map(([companyKey, record]) => ({
      companyKey,
      companyName: formatCompetitorDisplayCompanyName(
        record.company_name,
        record.metadata.source_file,
        summary.sector,
      ),
      latestRevenue: safeNumber(resolveStandardFinancialView(record).revenue),
    }))
    .filter((item) => item.latestRevenue > 0)
    .sort((a, b) => b.latestRevenue - a.latestRevenue)
    .slice(0, limit);

  return topCompanies.map((company, index) => ({
    rank: index + 1,
    companyName: company.companyName,
    companyKey: company.companyKey,
    latestRevenue: company.latestRevenue,
    revenuesByYear: [{ year: productivityYear, revenue: company.latestRevenue }],
  }));
}

export function formatProductivityEmployeesBasisLabel(
  summary: CompetitorExecutiveMultiYearSummary,
  productivityYear: number,
): string {
  const overlayYears = resolveProductivityOverlaySearchYears(summary, productivityYear);
  for (const year of overlayYears) {
    const count = Object.keys(summary.productivityEmployeesByYear?.[String(year)] ?? {}).length;
    if (count > 0) {
      return `${productivityYear}년 실적 · ${year}년 신용분석보고서 종업원`;
    }
  }

  return `${productivityYear}년 실적 · 종업원 기준`;
}

export function formatProductivityPerEmployeeEok(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}억/인`;
}

function findProductivityEmployeeOverlay(
  summary: CompetitorExecutiveMultiYearSummary,
  companyKey: string,
  companyName: string,
  bizNo: string | null | undefined,
  preferredYears: number[],
): ProductivityEmployeeEntry | null {
  const byYear = summary.productivityEmployeesByYear;
  if (!byYear) return null;

  const normalizedBizNo = normalizeCompetitorBizNo(bizNo);
  const normalizedName = normalizeCompetitorCompanyKey(companyName);

  const matchesEntry = (entry: ProductivityEmployeeEntry): boolean => {
    if (entry.employees <= 0) return false;
    if (entry.companyKey === companyKey) return true;
    if (normalizedBizNo && normalizeCompetitorBizNo(entry.biz_no) === normalizedBizNo) return true;
    if (normalizeCompetitorCompanyKey(entry.companyName) === normalizedName) return true;
    if (normalizeCompetitorCompanyKey(entry.companyKey) === normalizeCompetitorCompanyKey(companyKey)) {
      return true;
    }
    return false;
  };

  for (const year of preferredYears) {
    const yearMap = byYear[String(year)];
    if (!yearMap) continue;
    const direct = yearMap[companyKey];
    if (direct && matchesEntry(direct)) return direct;
    for (const entry of Object.values(yearMap)) {
      if (matchesEntry(entry)) return entry;
    }
  }

  return null;
}

function resolveProductivityEmployeeCount(
  summary: CompetitorExecutiveMultiYearSummary,
  companyKey: string,
  companyName: string,
  bizNo: string | null | undefined,
  productivityYear: number,
  overlayYears: number[],
): { employees: number | null; referenceYear: number | null; source: ProductivityChartItem['employeesSource'] } {
  const overlay = findProductivityEmployeeOverlay(
    summary,
    companyKey,
    companyName,
    bizNo,
    overlayYears,
  );
  if (overlay) {
    return {
      employees: overlay.employees,
      referenceYear: overlay.referenceYear,
      source: 'credit-report',
    };
  }

  const yearRecords = summary.recordsByYear[String(productivityYear)] ?? [];
  const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);
  const record = dedupedYear.get(companyKey);
  if (record?.metadata.employees != null && record.metadata.employees > 0) {
    return {
      employees: record.metadata.employees,
      referenceYear: productivityYear,
      source: 'metadata',
    };
  }

  return { employees: null, referenceYear: null, source: null };
}

function resolveProductivityYearInputs(
  summary: CompetitorExecutiveMultiYearSummary,
  companyKey: string,
  companyName: string,
  bizNo: string | null | undefined,
  productivityYear: number,
  overlayYears: number[],
): {
  revenue: number | null;
  operatingProfit: number | null;
  avgEmployees: number | null;
  employeesReferenceYear: number | null;
  employeesSource: ProductivityChartItem['employeesSource'];
} {
  const yearRecords = summary.recordsByYear[String(productivityYear)] ?? [];
  const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);
  const record = dedupedYear.get(companyKey);
  const view = record ? resolveStandardFinancialView(record) : null;

  const employeeResolution = resolveProductivityEmployeeCount(
    summary,
    companyKey,
    companyName,
    bizNo ?? record?.biz_no,
    productivityYear,
    overlayYears,
  );

  return {
    revenue: view?.revenue ?? null,
    operatingProfit: view?.operating_profit ?? null,
    avgEmployees: employeeResolution.employees,
    employeesReferenceYear: employeeResolution.referenceYear,
    employeesSource: employeeResolution.source,
  };
}

export function buildProductivityChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  revenueRanking?: RevenueRankingChartItem[],
): ProductivityChartItem[] {
  const productivityYear = resolveProductivityAnalysisYear(summary);
  const overlayYears = resolveProductivityOverlaySearchYears(summary, productivityYear);
  const ranking = revenueRanking ?? buildProductivityRevenueRanking(summary);
  if (ranking.length === 0) return [];

  const yearRecords = summary.recordsByYear[String(productivityYear)] ?? [];
  const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);

  return ranking.map((company) => {
    const record = dedupedYear.get(company.companyKey);
    const {
      revenue,
      operatingProfit,
      avgEmployees,
      employeesReferenceYear,
      employeesSource,
    } = resolveProductivityYearInputs(
      summary,
      company.companyKey,
      company.companyName,
      record?.biz_no,
      productivityYear,
      overlayYears,
    );
    const revenuePerEmployeeEok = toProductivityPerEmployeeEok(revenue, avgEmployees);
    const operatingProfitPerEmployeeEok = toProductivityPerEmployeeEok(
      operatingProfit,
      avgEmployees,
    );
    const hasProductivityData =
      avgEmployees != null &&
      avgEmployees > 0 &&
      revenuePerEmployeeEok != null &&
      safeNumber(revenue) > 0;

    return {
      companyName: company.companyName,
      companyKey: company.companyKey,
      rank: company.rank,
      avgEmployees: avgEmployees != null ? Math.round(avgEmployees) : null,
      revenuePerEmployeeEok,
      operatingProfitPerEmployeeEok,
      hasProductivityData,
      employeesReferenceYear,
      employeesSource,
    };
  });
}

export interface FinancialHealthYearPoint {
  year: number;
  debtRatio: number | null;
  operatingMargin: number | null;
  netIncomeEok: number | null;
  isOperatingLoss: boolean;
  isNetLoss: boolean;
}

export interface FinancialHealthChartItem {
  companyName: string;
  companyKey: string;
  rank: number;
  revenueRank: number;
  soundnessScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasonTags: FinancialHealthReasonTag[];
  metricsByYear: FinancialHealthYearPoint[];
  latestDebtRatio: number | null;
  latestOperatingMargin: number | null;
  debtRatioTrend: 'improving' | 'worsening' | 'stable' | null;
  hasFinancialHealthData: boolean;
}

export type FinancialHealthReasonTagTone = 'risk' | 'warning' | 'positive' | 'neutral';

export interface FinancialHealthReasonTag {
  key: string;
  label: string;
  tone: FinancialHealthReasonTagTone;
}

const FINANCIAL_HEALTH_REASON_TAG_LIMIT = 3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveDebtRatioTrend(
  points: FinancialHealthYearPoint[],
): 'improving' | 'worsening' | 'stable' | null {
  const valid = points.filter((point) => point.debtRatio != null && point.debtRatio > 0);
  if (valid.length < 2) return null;
  const delta = valid[valid.length - 1].debtRatio! - valid[0].debtRatio!;
  if (delta >= 10) return 'worsening';
  if (delta <= -10) return 'improving';
  return 'stable';
}

function computeSoundnessScore(
  latest: FinancialHealthYearPoint | undefined,
  debtRatioTrend: FinancialHealthChartItem['debtRatioTrend'],
): number {
  if (!latest) return 0;

  let score = 100;
  const debtRatio = latest.debtRatio ?? 0;

  if (debtRatio >= EXECUTIVE_DEBT_RATIO_WARNING) score -= 35;
  else if (debtRatio >= EXECUTIVE_DEBT_RATIO_CAUTION) score -= 20;
  else if (debtRatio >= EXECUTIVE_DEBT_RATIO_WATCH) score -= 10;

  if (latest.isOperatingLoss) score -= 25;
  if (latest.isNetLoss) score -= 20;
  if (debtRatioTrend === 'worsening') score -= 10;
  if (debtRatioTrend === 'improving') score += 5;

  return Math.max(0, Math.min(100, score));
}

function resolveFinancialHealthRiskLevel(score: number): FinancialHealthChartItem['riskLevel'] {
  if (score >= EXECUTIVE_SOUNDNESS_SCORE_HEALTHY) return 'low';
  if (score >= EXECUTIVE_SOUNDNESS_SCORE_CAUTION) return 'medium';
  return 'high';
}

/** 재무 건전성 대시보드 — 부채비율·종합점수 기준 안내 (짧은 문구) */
export function formatFinancialHealthDebtRatioCriteria(): string {
  return `총부채÷자본×100(%) · ${EXECUTIVE_DEBT_RATIO_WATCH}%↑ 주의 · ${EXECUTIVE_DEBT_RATIO_CAUTION}%↑ 경계 · ${EXECUTIVE_DEBT_RATIO_WARNING}%↑ 고위험(빨간 막대)`;
}

export function formatFinancialHealthGradeCriteria(): string {
  return `부채·적자·부채 추세로 양호/주의/위험 분류 · 옆 태그=판단 사유(최대 ${FINANCIAL_HEALTH_REASON_TAG_LIMIT}개)`;
}

export function formatFinancialHealthGradeLabel(
  riskLevel: FinancialHealthChartItem['riskLevel'],
): string {
  if (riskLevel === 'high') return '위험';
  if (riskLevel === 'medium') return '주의';
  return '양호';
}

export function buildFinancialHealthReasonTags(
  latestPoint: FinancialHealthYearPoint | undefined,
  debtRatioTrend: FinancialHealthChartItem['debtRatioTrend'],
  latestDebtRatio: number | null,
): FinancialHealthReasonTag[] {
  const tags: FinancialHealthReasonTag[] = [];
  const debtRatio = latestDebtRatio ?? latestPoint?.debtRatio ?? 0;

  if (debtRatio >= EXECUTIVE_DEBT_RATIO_WARNING) {
    tags.push({ key: 'debt-danger', label: '고부채', tone: 'risk' });
  } else if (debtRatio >= EXECUTIVE_DEBT_RATIO_CAUTION) {
    tags.push({ key: 'debt-caution', label: '부채 많음', tone: 'warning' });
  } else if (debtRatio >= EXECUTIVE_DEBT_RATIO_WATCH) {
    tags.push({ key: 'debt-watch', label: '부채 주의', tone: 'warning' });
  }

  if (latestPoint?.isOperatingLoss) {
    tags.push({ key: 'op-loss', label: '영업적자', tone: 'risk' });
  }

  if (latestPoint?.isNetLoss) {
    tags.push({ key: 'net-loss', label: '순손실', tone: 'risk' });
  }

  if (debtRatioTrend === 'worsening') {
    tags.push({ key: 'debt-up', label: '부채 증가', tone: 'warning' });
  } else if (debtRatioTrend === 'improving' && tags.length === 0) {
    tags.push({ key: 'debt-down', label: '부채 개선', tone: 'positive' });
  }

  if (tags.length === 0) {
    tags.push({ key: 'ok', label: '특이사항 없음', tone: 'neutral' });
  }

  return tags.slice(0, FINANCIAL_HEALTH_REASON_TAG_LIMIT);
}

/** @deprecated 등급 기준 안내는 formatFinancialHealthGradeCriteria 사용 */
export function formatFinancialHealthScoreCriteria(_rankYear?: number): string {
  return formatFinancialHealthGradeCriteria();
}

export type DebtRatioRiskTier = 'healthy' | 'watch' | 'caution' | 'danger';

export function resolveDebtRatioRiskTier(
  debtRatio: number | null | undefined,
): DebtRatioRiskTier {
  if (debtRatio == null || debtRatio <= 0) return 'healthy';
  if (debtRatio >= EXECUTIVE_DEBT_RATIO_WARNING) return 'danger';
  if (debtRatio >= EXECUTIVE_DEBT_RATIO_CAUTION) return 'caution';
  if (debtRatio >= EXECUTIVE_DEBT_RATIO_WATCH) return 'watch';
  return 'healthy';
}

export function formatFinancialHealthDebtRatioTierLabel(tier: DebtRatioRiskTier): string {
  if (tier === 'danger') return '고위험';
  if (tier === 'caution') return '경계';
  if (tier === 'watch') return '주의';
  return '양호';
}

export const FINANCIAL_HEALTH_DEBT_RATIO_TIER_ORDER: DebtRatioRiskTier[] = [
  'healthy',
  'watch',
  'caution',
  'danger',
];

export function formatFinancialHealthTrendLabel(
  trend: FinancialHealthChartItem['debtRatioTrend'],
): string {
  if (trend === 'improving') return '부채비율 개선';
  if (trend === 'worsening') return '부채비율 악화';
  if (trend === 'stable') return '부채비율 유지';
  return '추세 미확인';
}

function resolveEntryIndustryDebtRatioForYear(
  entry: IndustryAnalysisEntry,
  targetYear: number,
): number | null {
  const byYear = entry.industryDebtRatioByYear;
  if (byYear) {
    const direct = byYear[String(targetYear)];
    if (direct != null) return direct;

    const years = Object.keys(byYear)
      .map(Number)
      .filter((year) => year <= targetYear && byYear[String(year)] != null)
      .sort((a, b) => b - a);
    if (years.length > 0) {
      return byYear[String(years[0])] ?? null;
    }
  }

  return entry.industryAverage.debt_ratio;
}

function medianPercentValues(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function collectIndustryDebtBenchmarkValues(
  entries: IndustryAnalysisEntry[],
  targetYear: number,
): number[] {
  return entries
    .filter(
      (entry) =>
        entry.industryDebtRatioByYear != null &&
        Object.keys(entry.industryDebtRatioByYear).length > 0,
    )
    .map((entry) => resolveEntryIndustryDebtRatioForYear(entry, targetYear))
    .filter((value): value is number => value != null && value > 0);
}

/** 신용분석 03. 소속산업 분석 — 분석기간 최신연도 업종평균 부채비율(중앙값) */
export function resolveIndustryDebtRatioBenchmark(
  summary: CompetitorExecutiveMultiYearSummary,
  chartYears: number[],
): { referenceYear: number; value: number } | null {
  if (chartYears.length === 0) return null;

  const referenceYear = Math.max(...chartYears);

  for (let folderYear = referenceYear; folderYear >= summary.fromYear; folderYear -= 1) {
    const entries = Object.values(summary.industryAnalysisByYear?.[String(folderYear)] ?? {});
    const values = collectIndustryDebtBenchmarkValues(entries, referenceYear);
    const median = medianPercentValues(values);
    if (median != null) {
      return { referenceYear, value: median };
    }
  }

  return null;
}

export function buildFinancialHealthChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  revenueRanking: RevenueRankingChartItem[],
): FinancialHealthChartItem[] {
  const rankYear = resolveExecutiveRankYear(summary);
  const chartYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);

  const items = revenueRanking.map((company) => {
    const metricsByYear = chartYears.map((year) => {
      const yearRecords = summary.recordsByYear[String(year)] ?? [];
      const dedupedYear = dedupeRecordsByCompany(yearRecords, summary.sector);
      const record = dedupedYear.get(company.companyKey);
      if (!record) {
        return {
          year,
          debtRatio: null,
          operatingMargin: null,
          netIncomeEok: null,
          isOperatingLoss: false,
          isNetLoss: false,
        };
      }

      const view = resolveStandardFinancialView(record);
      const operatingMargin = view.operating_margin ?? null;
      const netIncome = view.net_income ?? null;

      return {
        year,
        debtRatio: view.debt_ratio ?? null,
        operatingMargin,
        netIncomeEok: netIncome != null ? round1(netIncome / 100) : null,
        isOperatingLoss: operatingMargin != null && operatingMargin < 0,
        isNetLoss: netIncome != null && netIncome < 0,
      };
    });

    const latestPoint =
      [...metricsByYear].reverse().find((point) => point.debtRatio != null && point.debtRatio > 0) ??
      metricsByYear[metricsByYear.length - 1];
    const debtRatioTrend = resolveDebtRatioTrend(metricsByYear);
    const soundnessScore = computeSoundnessScore(latestPoint, debtRatioTrend);
    const latestDebtRatio = latestPoint?.debtRatio ?? null;
    const reasonTags = buildFinancialHealthReasonTags(latestPoint, debtRatioTrend, latestDebtRatio);
    const hasFinancialHealthData = metricsByYear.some(
      (point) => point.debtRatio != null && point.debtRatio > 0,
    );

    return {
      companyName: company.companyName,
      companyKey: company.companyKey,
      rank: 0,
      revenueRank: company.rank,
      soundnessScore,
      riskLevel: resolveFinancialHealthRiskLevel(soundnessScore),
      reasonTags,
      metricsByYear,
      latestDebtRatio,
      latestOperatingMargin: latestPoint?.operatingMargin ?? null,
      debtRatioTrend,
      hasFinancialHealthData,
    };
  });

  return items
    .filter((item) => item.hasFinancialHealthData)
    .map((item) => ({
      ...item,
      rank: item.revenueRank,
    }));
}

export interface StabilityRiskChartItem {
  companyName: string;
  debtRatio: number;
  totalDebt: number;
  leverageAmount: number;
  isHighRisk: boolean;
}

/** @deprecated 재무 안정성 리스크맵 대시보드 제거 — 생산성 분석으로 대체 */
function resolveLeverageAmount(financials: ReturnType<typeof resolveStandardFinancialView>): number {
  const totalDebt = safeNumber(financials.total_debt, NaN);
  if (Number.isFinite(totalDebt) && totalDebt > 0) return totalDebt;

  const liabilities = safeNumber(financials.total_liabilities, NaN);
  if (Number.isFinite(liabilities) && liabilities > 0) return liabilities;

  return 0;
}

/** @deprecated 재무 안정성 리스크맵 대시보드 제거 — 생산성 분석으로 대체 */
export function buildStabilityRiskChartData(
  records: CompetitorStandardRecord[],
  sector?: string,
): StabilityRiskChartItem[] {
  return records
    .map((r) => {
      const view = resolveStandardFinancialView(r);
      const debtRatio = safeNumber(view.debt_ratio);
      const totalDebt = safeNumber(view.total_debt);
      const leverageAmount = resolveLeverageAmount(view);
      return {
        companyName: formatCompetitorDisplayCompanyName(
          r.company_name,
          r.metadata.source_file,
          sector,
        ),
        debtRatio,
        totalDebt,
        leverageAmount,
        isHighRisk: debtRatio > EXECUTIVE_DEBT_RATIO_WARNING,
      };
    })
    .filter((item) => item.debtRatio > 0 || item.leverageAmount > 0)
    .sort((a, b) => b.debtRatio - a.debtRatio);
}

export interface TimelineChartItem extends ExecutiveTimelinePoint {
  label: string;
}

export function buildTimelineChartData(timeline: ExecutiveTimelinePoint[]): TimelineChartItem[] {
  return timeline.map((point) => ({
    ...point,
    label: `${point.year}년`,
  }));
}

export function buildExecutiveFromMultiYear(summary: CompetitorExecutiveMultiYearSummary): {
  revenueRanking: RevenueRankingChartItem[];
  revenueRankingYears: number[];
  rankYear: number;
  productivityYear: number;
  costStructure: CostStructureChartItem[];
  productivity: ProductivityChartItem[];
  financialHealth: FinancialHealthChartItem[];
  financialHealthYears: number[];
  timeline: TimelineChartItem[];
} {
  const rankYear = resolveExecutiveRankYear(summary);
  const productivityYear = resolveProductivityAnalysisYear(summary);
  const revenueRanking = buildRevenueRankingChartData(summary);
  const productivityRanking = buildProductivityRevenueRanking(summary);
  const financialHealthYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);

  return {
    revenueRanking,
    revenueRankingYears: financialHealthYears,
    rankYear,
    productivityYear,
    costStructure: buildCostStructureChartData(summary, revenueRanking),
    productivity: buildProductivityChartData(summary, productivityRanking),
    financialHealth: buildFinancialHealthChartData(summary, revenueRanking),
    financialHealthYears,
    timeline: buildTimelineChartData(summary.timeline),
  };
}

export function buildExecutiveTooltipAmount(value: number | null | undefined): string {
  return formatExecutiveKRW(value);
}
