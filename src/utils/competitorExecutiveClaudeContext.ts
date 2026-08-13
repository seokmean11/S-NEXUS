import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  buildExecutiveFromMultiYear,
  safeNumber,
} from '@/utils/competitorExecutiveDashboard';
import { buildExecutiveInsightsBySection } from '@/utils/competitorExecutiveInsight';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';

export interface ExecutiveInsightClaudeContext {
  sector: string;
  fromYear: number;
  toYear: number;
  baseYear: number;
  rankYear: number;
  companyCount: number;
  timeline: Array<{
    year: number;
    totalRevenue: number | null;
    companyCount: number;
    avgOperatingMargin: number | null;
  }>;
  revenueRanking: Array<{
    rank: number;
    name: string;
    latestRevenue: number;
    revenuesByYear: Array<{ year: number; revenue: number }>;
  }>;
  costStructure: Array<{
    rank: number;
    name: string;
    cogsRatio: number | null;
    sgaRatio: number | null;
    operatingMargin: number | null;
  }>;
  stabilityRisk: Array<{
    name: string;
    debtRatio: number;
    leverageAmount: number;
  }>;
  dataQualityHints?: string[];
}

export function buildExecutiveInsightClaudeContext(
  summary: CompetitorExecutiveMultiYearSummary,
): ExecutiveInsightClaudeContext {
  const dashboard = buildExecutiveFromMultiYear(summary);
  const rankYear = dashboard.rankYear;
  const ruleHints = buildExecutiveInsightsBySection(summary);

  const dataQualityHints = [
    ...ruleHints.timeline,
    ...ruleHints.revenueRanking,
    ...ruleHints.costStructure,
    ...ruleHints.stabilityRisk,
  ]
    .filter((item) => item.severity !== 'info')
    .map((item) => `${item.title}: ${item.detail}`)
    .slice(0, 6);

  return {
    sector: summary.sector,
    fromYear: summary.fromYear,
    toYear: summary.toYear,
    baseYear: summary.baseYear,
    rankYear,
    companyCount: summary.records.length,
    timeline: dashboard.timeline.map((point) => ({
      year: point.year,
      totalRevenue: point.totalRevenue,
      companyCount: point.companyCount,
      avgOperatingMargin: point.avgOperatingMargin,
    })),
    revenueRanking: dashboard.revenueRanking.map((item) => ({
      rank: item.rank,
      name: item.companyName,
      latestRevenue: item.latestRevenue,
      revenuesByYear: item.revenuesByYear.map((point) => ({
        year: point.year,
        revenue: point.revenue,
      })),
    })),
    costStructure: dashboard.costStructure.map((item) => ({
      rank: item.rank,
      name: item.companyName,
      cogsRatio: item.sourceCogsRatio,
      sgaRatio: item.sourceSgaRatio,
      operatingMargin: item.sourceOperatingMargin,
    })),
    stabilityRisk: dashboard.stabilityRisk.map((item) => ({
      name: item.companyName,
      debtRatio: item.debtRatio,
      leverageAmount: item.leverageAmount,
    })),
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

  return [
    summary.sector,
    summary.fromYear,
    summary.toYear,
    summary.baseYear,
    summary.updatedAt,
    summary.records.length,
    fingerprint,
  ].join('::');
}
