import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  buildExecutiveFromMultiYear,
  dedupeRecordsByCompany,
  resolveExecutiveRankYear,
  resolveIndustryDebtRatioBenchmark,
  resolveRevenueRankingChartYears,
  safeNumber,
} from '@/utils/competitorExecutiveDashboard';
import { buildExecutiveInsightsBySection } from '@/utils/competitorExecutiveInsight';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';

const REVENUE_TIER_THRESHOLD_EOK = 200;
const INSIGHT_PROMPT_VERSION = 'v3';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toEok(revenueMillions: number): number {
  return round1(revenueMillions / 100);
}

function average(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return round1(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

export interface ExecutiveInsightClaudeContext {
  sector: string;
  fromYear: number;
  toYear: number;
  baseYear: number;
  rankYear: number;
  productivityYear: number;
  companyCount: number;
  timeline: Array<{
    year: number;
    totalRevenueEok: number | null;
    companyCount: number;
    avgOperatingMargin: number | null;
  }>;
  revenueRanking: Array<{
    rank: number;
    name: string;
    latestRevenueEok: number;
    revenuesByYear: Array<{ year: number; revenueEok: number }>;
    revenueCagrPct: number | null;
  }>;
  costStructure: Array<{
    rank: number;
    name: string;
    avgCogsRatio: number | null;
    avgSgaRatio: number | null;
    avgOperatingMargin: number | null;
    marginByYear: Array<{ year: number; operatingMargin: number | null; cogsRatio: number | null }>;
  }>;
  productivity: Array<{
    rank: number;
    name: string;
    avgEmployees: number | null;
    employeesReferenceYear: number | null;
    revenuePerEmployeeEok: number | null;
    operatingProfitPerEmployeeEok: number | null;
  }>;
  financialHealth: Array<{
    rank: number;
    name: string;
    riskLevel: string;
    latestDebtRatio: number | null;
    debtRatioTrend: string;
    latestOperatingMargin: number | null;
    revenueRank: number;
    latestRevenueEok: number;
    debtRatioByYear: Array<{ year: number; debtRatio: number | null }>;
  }>;
  analytics: {
    industryAvgRevenueEok: number | null;
    revenueTierThresholdEok: number;
    aboveTierAvgOperatingMargin: number | null;
    belowTierAvgOperatingMargin: number | null;
    sustainedGrowthCompanies: string[];
    wideningGapPairs: Array<{ leader: string; follower: string; gapEok: number; leaderCagrPct: number | null }>;
    operatingLossDespiteGrowth: string[];
    consecutiveLossCompanies: string[];
    improvingCogsCompanies: string[];
    productivityWithHeadcountGrowth: Array<{ name: string; employeesFrom: number; employeesTo: number; fromYear: number; toYear: number }>;
    industryBenchmarkDebtRatio: number | null;
    industryBenchmarkYear: number | null;
    aboveIndustryDebtBenchmark: string[];
    belowIndustryDebtBenchmark: string[];
    highRevenueHighDebtRisk: Array<{ name: string; revenueRank: number; latestDebtRatio: number }>;
    improvingDebtTrend: string[];
    worseningDebtTrend: string[];
    operatingLossWithHighDebt: string[];
    strongRevenueWeakBalance: Array<{
      name: string;
      revenueRank: number;
      latestDebtRatio: number;
      latestOperatingMargin: number | null;
    }>;
    productivityLeaderFinancialRisk: Array<{
      name: string;
      revenuePerEmployeeEok: number;
      latestDebtRatio: number;
      debtRatioTrend: string;
    }>;
  };
  dataQualityHints?: string[];
}

function buildCostMarginByYear(
  summary: CompetitorExecutiveMultiYearSummary,
  companyKey: string,
  chartYears: number[],
): Array<{ year: number; operatingMargin: number | null; cogsRatio: number | null }> {
  return chartYears.map((year) => {
    const yearRecords = summary.recordsByYear[String(year)] ?? [];
    const deduped = dedupeRecordsByCompany(yearRecords, summary.sector);
    const record = deduped.get(companyKey);
    if (!record) {
      return { year, operatingMargin: null, cogsRatio: null };
    }
    const view = resolveStandardFinancialView(record);
    return {
      year,
      operatingMargin: view.operating_margin ?? null,
      cogsRatio: view.cogs_ratio ?? null,
    };
  });
}

function computeRevenueCagr(
  points: Array<{ year: number; revenue: number }>,
): number | null {
  const valid = points.filter((point) => point.revenue > 0);
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  const span = last.year - first.year;
  if (span <= 0) return null;
  return round1((Math.pow(last.revenue / first.revenue, 1 / span) - 1) * 100);
}

function buildInsightAnalytics(
  summary: CompetitorExecutiveMultiYearSummary,
  dashboard: ReturnType<typeof buildExecutiveFromMultiYear>,
): ExecutiveInsightClaudeContext['analytics'] {
  const ranking = dashboard.revenueRanking;
  const rankYear = dashboard.rankYear;
  const chartYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);
  const thresholdMillions = REVENUE_TIER_THRESHOLD_EOK * 100;

  const latestRevenues = ranking.map((item) => item.latestRevenue).filter((value) => value > 0);
  const industryAvgRevenueEok =
    latestRevenues.length > 0
      ? toEok(latestRevenues.reduce((sum, value) => sum + value, 0) / latestRevenues.length)
      : null;

  const rankingWithGrowth = ranking.map((item) => ({
    ...item,
    revenueCagrPct: computeRevenueCagr(item.revenuesByYear),
  }));

  const sustainedGrowthCompanies = rankingWithGrowth
    .filter((item) => (item.revenueCagrPct ?? 0) >= 15)
    .map((item) => item.companyName);

  const sortedByRevenue = [...rankingWithGrowth].sort((a, b) => b.latestRevenue - a.latestRevenue);
  const leader = sortedByRevenue[0];
  const runnerUp = sortedByRevenue[1];
  const wideningGapPairs =
    leader && runnerUp
      ? [
          {
            leader: leader.companyName,
            follower: runnerUp.companyName,
            gapEok: round1(toEok(leader.latestRevenue) - toEok(runnerUp.latestRevenue)),
            leaderCagrPct: leader.revenueCagrPct,
          },
        ]
      : [];

  const marginByTier = { above: [] as number[], below: [] as number[] };
  for (const item of dashboard.costStructure) {
    if (item.sourceOperatingMargin == null) continue;
    const revenue = ranking.find((row) => row.companyName === item.companyName)?.latestRevenue ?? 0;
    if (revenue <= 0) continue;
    if (revenue >= thresholdMillions) {
      marginByTier.above.push(item.sourceOperatingMargin);
    } else {
      marginByTier.below.push(item.sourceOperatingMargin);
    }
  }

  const operatingLossDespiteGrowth: string[] = [];
  const consecutiveLossCompanies: string[] = [];
  const improvingCogsCompanies: string[] = [];

  for (const item of ranking) {
    const margins = buildCostMarginByYear(summary, item.companyKey, chartYears)
      .map((row) => row.operatingMargin)
      .filter((value): value is number => value != null);
    const revenues = item.revenuesByYear.filter((point) => point.revenue > 0);
    if (revenues.length >= 2) {
      const firstRev = revenues[0].revenue;
      const lastRev = revenues[revenues.length - 1].revenue;
      const latestMargin = margins[margins.length - 1];
      if (lastRev > firstRev && latestMargin != null && latestMargin < 0) {
        operatingLossDespiteGrowth.push(item.companyName);
      }
    }
    if (margins.length >= 2 && margins.every((value) => value < 0)) {
      consecutiveLossCompanies.push(item.companyName);
    }

    const cogsSeries = buildCostMarginByYear(summary, item.companyKey, chartYears)
      .map((row) => row.cogsRatio)
      .filter((value): value is number => value != null);
    if (cogsSeries.length >= 2 && cogsSeries[cogsSeries.length - 1] < cogsSeries[0] - 0.5) {
      improvingCogsCompanies.push(item.companyName);
    }
  }

  const productivityWithHeadcountGrowth: ExecutiveInsightClaudeContext['analytics']['productivityWithHeadcountGrowth'] =
    [];
  for (const item of dashboard.productivity) {
    if (!item.hasProductivityData || item.avgEmployees == null) continue;
    const overlayYears = Object.keys(summary.productivityEmployeesByYear ?? {})
      .map(Number)
      .filter((year) => year >= summary.fromYear && year <= summary.toYear)
      .sort((a, b) => a - b);
    if (overlayYears.length < 2) continue;

    const firstYear = overlayYears[0];
    const lastYear = overlayYears[overlayYears.length - 1];
    const firstEntry = Object.values(summary.productivityEmployeesByYear?.[String(firstYear)] ?? {}).find(
      (entry) => entry.companyName === item.companyName || entry.companyKey === item.companyKey,
    );
    const lastEntry = Object.values(summary.productivityEmployeesByYear?.[String(lastYear)] ?? {}).find(
      (entry) => entry.companyName === item.companyName || entry.companyKey === item.companyKey,
    );
    if (!firstEntry || !lastEntry) continue;
    if (lastEntry.employees > firstEntry.employees) {
      productivityWithHeadcountGrowth.push({
        name: item.companyName,
        employeesFrom: firstEntry.employees,
        employeesTo: lastEntry.employees,
        fromYear: firstYear,
        toYear: lastYear,
      });
    }
  }

  return {
    industryAvgRevenueEok,
    revenueTierThresholdEok: REVENUE_TIER_THRESHOLD_EOK,
    aboveTierAvgOperatingMargin: average(marginByTier.above),
    belowTierAvgOperatingMargin: average(marginByTier.below),
    sustainedGrowthCompanies,
    wideningGapPairs,
    operatingLossDespiteGrowth,
    consecutiveLossCompanies,
    improvingCogsCompanies,
    productivityWithHeadcountGrowth,
    industryBenchmarkDebtRatio: null,
    industryBenchmarkYear: null,
    aboveIndustryDebtBenchmark: [],
    belowIndustryDebtBenchmark: [],
    highRevenueHighDebtRisk: [],
    improvingDebtTrend: [],
    worseningDebtTrend: [],
    operatingLossWithHighDebt: [],
    strongRevenueWeakBalance: [],
    productivityLeaderFinancialRisk: [],
  };
}

function buildFinancialHealthInsightAnalytics(
  summary: CompetitorExecutiveMultiYearSummary,
  dashboard: ReturnType<typeof buildExecutiveFromMultiYear>,
): Pick<
  ExecutiveInsightClaudeContext['analytics'],
  | 'industryBenchmarkDebtRatio'
  | 'industryBenchmarkYear'
  | 'aboveIndustryDebtBenchmark'
  | 'belowIndustryDebtBenchmark'
  | 'highRevenueHighDebtRisk'
  | 'improvingDebtTrend'
  | 'worseningDebtTrend'
  | 'operatingLossWithHighDebt'
  | 'strongRevenueWeakBalance'
  | 'productivityLeaderFinancialRisk'
> {
  const financialHealth = dashboard.financialHealth;
  const chartYears = dashboard.financialHealthYears;
  const industryBenchmark = resolveIndustryDebtRatioBenchmark(summary, chartYears);
  const benchmarkValue = industryBenchmark?.value ?? null;
  const benchmarkYear = industryBenchmark?.referenceYear ?? null;

  const aboveIndustryDebtBenchmark: string[] = [];
  const belowIndustryDebtBenchmark: string[] = [];
  const highRevenueHighDebtRisk: Array<{ name: string; revenueRank: number; latestDebtRatio: number }> =
    [];
  const improvingDebtTrend: string[] = [];
  const worseningDebtTrend: string[] = [];
  const operatingLossWithHighDebt: string[] = [];
  const strongRevenueWeakBalance: Array<{
    name: string;
    revenueRank: number;
    latestDebtRatio: number;
    latestOperatingMargin: number | null;
  }> = [];

  for (const item of financialHealth) {
    const debtRatio = item.latestDebtRatio;
    if (debtRatio == null || debtRatio <= 0) continue;

    if (benchmarkValue != null) {
      if (debtRatio > benchmarkValue) aboveIndustryDebtBenchmark.push(item.companyName);
      else belowIndustryDebtBenchmark.push(item.companyName);
    }

    if (item.debtRatioTrend === 'improving') improvingDebtTrend.push(item.companyName);
    if (item.debtRatioTrend === 'worsening') worseningDebtTrend.push(item.companyName);

    if (item.revenueRank <= 3 && (item.riskLevel === 'high' || item.riskLevel === 'medium')) {
      highRevenueHighDebtRisk.push({
        name: item.companyName,
        revenueRank: item.revenueRank,
        latestDebtRatio: round1(debtRatio),
      });
    }

    if (
      item.revenueRank <= 5 &&
      (item.riskLevel === 'high' || (benchmarkValue != null && debtRatio > benchmarkValue))
    ) {
      strongRevenueWeakBalance.push({
        name: item.companyName,
        revenueRank: item.revenueRank,
        latestDebtRatio: round1(debtRatio),
        latestOperatingMargin: item.latestOperatingMargin,
      });
    }

    if (
      (item.riskLevel === 'high' || (benchmarkValue != null && debtRatio > benchmarkValue)) &&
      item.metricsByYear.some((point) => point.isOperatingLoss)
    ) {
      operatingLossWithHighDebt.push(item.companyName);
    }
  }

  const productivityLeaderFinancialRisk: ExecutiveInsightClaudeContext['analytics']['productivityLeaderFinancialRisk'] =
    [];
  const productivityByKey = new Map(
    dashboard.productivity.map((item) => [item.companyKey, item]),
  );
  for (const item of financialHealth) {
    const productivity = productivityByKey.get(item.companyKey);
    if (!productivity?.hasProductivityData || (productivity.revenuePerEmployeeEok ?? 0) <= 0) continue;
    if (item.latestDebtRatio == null || item.latestDebtRatio <= 0) continue;
    if (productivity.rank > 3) continue;
    if (item.riskLevel !== 'high' && item.debtRatioTrend !== 'worsening') continue;
    productivityLeaderFinancialRisk.push({
      name: item.companyName,
      revenuePerEmployeeEok: productivity.revenuePerEmployeeEok ?? 0,
      latestDebtRatio: round1(item.latestDebtRatio),
      debtRatioTrend: item.debtRatioTrend ?? 'stable',
    });
  }

  return {
    industryBenchmarkDebtRatio: benchmarkValue != null ? round1(benchmarkValue) : null,
    industryBenchmarkYear: benchmarkYear,
    aboveIndustryDebtBenchmark,
    belowIndustryDebtBenchmark,
    highRevenueHighDebtRisk,
    improvingDebtTrend,
    worseningDebtTrend,
    operatingLossWithHighDebt,
    strongRevenueWeakBalance,
    productivityLeaderFinancialRisk,
  };
}

export function buildExecutiveInsightClaudeContext(
  summary: CompetitorExecutiveMultiYearSummary,
): ExecutiveInsightClaudeContext {
  const dashboard = buildExecutiveFromMultiYear(summary);
  const rankYear = resolveExecutiveRankYear(summary);
  const chartYears = resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear);
  const ruleHints = buildExecutiveInsightsBySection(summary);
  const baseAnalytics = buildInsightAnalytics(summary, dashboard);
  const financialHealthAnalytics = buildFinancialHealthInsightAnalytics(summary, dashboard);

  const dataQualityHints = [
    ...ruleHints.timeline,
    ...ruleHints.revenueRanking,
    ...ruleHints.costStructure,
    ...ruleHints.productivity,
    ...ruleHints.financialHealth,
  ]
    .filter((item) => item.severity !== 'info')
    .map((item) => `${item.title}: ${item.detail}`)
    .slice(0, 8);

  const revenueByKey = new Map(
    dashboard.revenueRanking.map((item) => [item.companyKey, item]),
  );

  return {
    sector: summary.sector,
    fromYear: summary.fromYear,
    toYear: summary.toYear,
    baseYear: summary.baseYear,
    rankYear,
    productivityYear: dashboard.productivityYear,
    companyCount: summary.records.length,
    timeline: dashboard.timeline.map((point) => ({
      year: point.year,
      totalRevenueEok: point.totalRevenue != null ? toEok(point.totalRevenue) : null,
      companyCount: point.companyCount,
      avgOperatingMargin: point.avgOperatingMargin,
    })),
    revenueRanking: dashboard.revenueRanking.map((item) => ({
      rank: item.rank,
      name: item.companyName,
      latestRevenueEok: toEok(item.latestRevenue),
      revenuesByYear: item.revenuesByYear.map((point) => ({
        year: point.year,
        revenueEok: toEok(point.revenue),
      })),
      revenueCagrPct: computeRevenueCagr(item.revenuesByYear),
    })),
    costStructure: dashboard.costStructure.map((item) => ({
      rank: item.rank,
      name: item.companyName,
      avgCogsRatio: item.sourceCogsRatio,
      avgSgaRatio: item.sourceSgaRatio,
      avgOperatingMargin: item.sourceOperatingMargin,
      marginByYear: buildCostMarginByYear(summary, item.companyKey, chartYears),
    })),
    productivity: dashboard.productivity.map((item) => ({
      rank: item.rank,
      name: item.companyName,
      avgEmployees: item.avgEmployees,
      employeesReferenceYear: item.employeesReferenceYear,
      revenuePerEmployeeEok: item.revenuePerEmployeeEok,
      operatingProfitPerEmployeeEok: item.operatingProfitPerEmployeeEok,
    })),
    financialHealth: dashboard.financialHealth.map((item) => {
      const revenue = revenueByKey.get(item.companyKey);
      return {
        rank: item.rank,
        name: item.companyName,
        riskLevel: item.riskLevel,
        latestDebtRatio: item.latestDebtRatio,
        debtRatioTrend: item.debtRatioTrend ?? 'stable',
        latestOperatingMargin: item.latestOperatingMargin,
        revenueRank: item.revenueRank,
        latestRevenueEok: revenue ? toEok(revenue.latestRevenue) : 0,
        debtRatioByYear: item.metricsByYear.map((point) => ({
          year: point.year,
          debtRatio: point.debtRatio,
        })),
      };
    }),
    analytics: {
      ...baseAnalytics,
      ...financialHealthAnalytics,
    },
    dataQualityHints,
  };
}

export function buildExecutiveInsightCacheKey(summary: CompetitorExecutiveMultiYearSummary): string {
  const fingerprint = summary.records
    .map((record) => {
      const view = resolveStandardFinancialView(record);
      return [
        record.company_name,
        record.year,
        safeNumber(view.revenue),
        safeNumber(view.operating_margin),
        safeNumber(view.debt_ratio),
      ].join(':');
    })
    .sort()
    .join('|')
    .slice(0, 500);

  const overlayFingerprint = Object.entries(summary.productivityEmployeesByYear ?? {})
    .map(([year, entries]) => `${year}:${Object.keys(entries).length}`)
    .sort()
    .join(',');

  return [
    INSIGHT_PROMPT_VERSION,
    summary.sector,
    summary.fromYear,
    summary.toYear,
    summary.baseYear,
    summary.updatedAt,
    summary.records.length,
    overlayFingerprint,
    fingerprint,
  ].join('::');
}
