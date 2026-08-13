import type {
  CompetitorExecutiveMultiYearSummary,
  CompetitorStandardRecord,
  ExecutiveTimelinePoint,
} from '@/types/competitorStandard';
import { formatExecutiveKRW } from '@/utils/formatKRW';
import {
  formatCompetitorDisplayCompanyName,
  resolveCompetitorRecordGroupKey,
} from '@/utils/competitorCompanyName';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';

export { formatKRW, formatKRWCompact, formatExecutiveKRW, formatExecutiveKRWCompact } from '@/utils/formatKRW';

export const EXECUTIVE_DEBT_RATIO_WARNING = 200;
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

function dedupeRecordsByCompany(
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

export function buildRevenueRankingChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  limit = REVENUE_RANKING_CHART_LIMIT,
): RevenueRankingChartItem[] {
  const rankYear = summary.effectiveToYear ?? summary.toYear;
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
  view: ReturnType<typeof resolveStandardFinancialView>,
): {
  cogsRatio: number;
  sgaRatio: number;
  operatingMargin: number;
  otherRatio: number;
} {
  const cogsRatio = Math.max(0, safeNumber(view.cogs_ratio));
  const sgaRatio = Math.max(0, safeNumber(view.sga_ratio));
  const operatingMarginRaw = safeNumber(view.operating_margin);
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

export function buildCostStructureChartData(
  summary: CompetitorExecutiveMultiYearSummary,
  revenueRanking: RevenueRankingChartItem[],
): CostStructureChartItem[] {
  if (revenueRanking.length === 0) return [];

  const rankYear = summary.effectiveToYear ?? summary.toYear;
  const rankYearRecords = summary.recordsByYear[String(rankYear)] ?? [];
  const dedupedRankYear = dedupeRecordsByCompany(rankYearRecords, summary.sector);

  return revenueRanking.map((company) => {
    const record = dedupedRankYear.get(company.companyKey);
    const view = record ? resolveStandardFinancialView(record) : null;
    const hasRevenue = view != null && view.revenue != null && view.revenue > 0;

    if (!hasRevenue || !view) {
      return {
        companyName: company.companyName,
        companyKey: company.companyKey,
        rank: company.rank,
        cogsRatio: 0,
        sgaRatio: 0,
        operatingMargin: 0,
        otherRatio: 100,
        sourceCogsRatio: view?.cogs_ratio ?? null,
        sourceSgaRatio: view?.sga_ratio ?? null,
        sourceOperatingMargin: view?.operating_margin ?? null,
        hasRatioData: false,
      };
    }

    const normalized = normalizeCostStructure(view);
    const hasRatioData =
      view.cogs_ratio != null || view.sga_ratio != null || view.operating_margin != null;

    return {
      companyName: company.companyName,
      companyKey: company.companyKey,
      rank: company.rank,
      ...normalized,
      sourceCogsRatio: view.cogs_ratio,
      sourceSgaRatio: view.sga_ratio,
      sourceOperatingMargin: view.operating_margin,
      hasRatioData,
    };
  });
}

export interface StabilityRiskChartItem {
  companyName: string;
  debtRatio: number;
  totalDebt: number;
  leverageAmount: number;
  isHighRisk: boolean;
}

/** 총차입금 없을 때 부채총계를 레버리지 규모 대용값으로 사용 */
export function resolveLeverageAmount(
  financials: ReturnType<typeof resolveStandardFinancialView>,
): number {
  const totalDebt = safeNumber(financials.total_debt, NaN);
  if (Number.isFinite(totalDebt) && totalDebt > 0) return totalDebt;

  const liabilities = safeNumber(financials.total_liabilities, NaN);
  if (Number.isFinite(liabilities) && liabilities > 0) return liabilities;

  return 0;
}

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
  costStructure: CostStructureChartItem[];
  stabilityRisk: StabilityRiskChartItem[];
  timeline: TimelineChartItem[];
} {
  const rankYear = summary.effectiveToYear ?? summary.toYear;
  const revenueRanking = buildRevenueRankingChartData(summary);

  return {
    revenueRanking,
    revenueRankingYears: resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear),
    rankYear,
    costStructure: buildCostStructureChartData(summary, revenueRanking),
    stabilityRisk: buildStabilityRiskChartData(summary.records, summary.sector),
    timeline: buildTimelineChartData(summary.timeline),
  };
}

export function buildExecutiveTooltipAmount(value: number | null | undefined): string {
  return formatExecutiveKRW(value);
}
