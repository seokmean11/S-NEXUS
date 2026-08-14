import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  buildProductivityChartData,
  buildRevenueRankingChartData,
  formatCostStructureAveragePeriodLabel,
  formatProductivityPerEmployeeEok,
  resolveRevenueRankingChartYears,
  safeNumber,
} from '@/utils/competitorExecutiveDashboard';
import { formatCompetitorDisplayCompanyName } from '@/utils/competitorCompanyName';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';
import {
  computeMarketSizeCagr,
  formatMarketSizeTrillion,
  MARKET_SIZE_TREND_DISPLAY,
  MARKET_SIZE_TREND_FROM_YEAR,
  MARKET_SIZE_TREND_TO_YEAR,
} from '@/utils/marketSizeTrend';

function displayName(r: { company_name: string; metadata: { source_file?: string | null } }): string {
  return formatCompetitorDisplayCompanyName(r.company_name, r.metadata.source_file);
}

export interface ExecutiveInsightItem {
  severity: 'info' | 'warning' | 'risk';
  title: string;
  detail: string;
}

export interface ExecutiveInsightsBySection {
  timeline: ExecutiveInsightItem[];
  revenueRanking: ExecutiveInsightItem[];
  costStructure: ExecutiveInsightItem[];
  productivity: ExecutiveInsightItem[];
}

const UNIT_ANOMALY_MILLION = 1_000_000;

export function buildExecutiveInsightsBySection(
  summary: CompetitorExecutiveMultiYearSummary,
): ExecutiveInsightsBySection {
  const result: ExecutiveInsightsBySection = {
    timeline: [],
    revenueRanking: [],
    costStructure: [],
    productivity: [],
  };

  const records = summary.records;
  const rankYear = summary.effectiveToYear ?? summary.toYear;

  if (records.length === 0) {
    const emptyItem: ExecutiveInsightItem = {
      severity: 'warning',
      title: '데이터 없음',
      detail: '선택 기간에 추출된 재무 데이터가 없습니다.',
    };
    result.timeline.push(emptyItem);
    return result;
  }

  const marketCagr = computeMarketSizeCagr();
  const marketFirst = MARKET_SIZE_TREND_DISPLAY[0];
  const marketLast = MARKET_SIZE_TREND_DISPLAY[MARKET_SIZE_TREND_DISPLAY.length - 1];

  result.timeline.push({
    severity: 'info',
    title: '시장규모 추이 요약',
    detail:
      marketCagr != null && marketFirst && marketLast
        ? `${MARKET_SIZE_TREND_FROM_YEAR}–${MARKET_SIZE_TREND_TO_YEAR}년 시장규모 ${formatMarketSizeTrillion(marketFirst.sizeTrillion)} → ${formatMarketSizeTrillion(marketLast.sizeTrillion)} · 연평균 ${marketCagr.toFixed(1)}% 성장`
        : `${MARKET_SIZE_TREND_FROM_YEAR}–${MARKET_SIZE_TREND_TO_YEAR}년 인테리어 업종 시장규모 추이`,
  });

  const unitAnomalies = records.filter(
    (r) => safeNumber(resolveStandardFinancialView(r).revenue) >= UNIT_ANOMALY_MILLION,
  );
  if (unitAnomalies.length > 0) {
    result.timeline.push({
      severity: 'risk',
      title: '단위 이상치 감지',
      detail: `${unitAnomalies.map(displayName).join(', ')} — 매출이 조 단위로 추정됩니다. PDF 단위(원/천원/백만원) 재확인이 필요합니다.`,
    });
  }

  const revenueRanking = buildRevenueRankingChartData(summary);
  if (revenueRanking.length > 0) {
    const rankingYears = revenueRanking[0]?.revenuesByYear.map((point) => point.year) ?? [];
    result.revenueRanking.push({
      severity: 'info',
      title: '매출 순위 요약',
      detail: `${rankYear}년 기준 상위 ${revenueRanking.length}개사 · ${rankingYears.join(', ')}년 매출 추이 비교`,
    });
  }

  const zeroRevenue = records.filter((r) => safeNumber(resolveStandardFinancialView(r).revenue) <= 0);
  if (zeroRevenue.length > 0) {
    result.revenueRanking.push({
      severity: 'warning',
      title: '매출 미추출',
      detail: `${zeroRevenue.map((r) => r.metadata.source_file ?? r.company_name).join(', ')}`,
    });
  }

  const lowMargin = records.filter((r) => {
    const m = safeNumber(resolveStandardFinancialView(r).operating_margin);
    return m > 0 && m < 3;
  });
  if (lowMargin.length > 0) {
    result.costStructure.push({
      severity: 'warning',
      title: '영업이익률 저조',
      detail: `${lowMargin.map(displayName).join(', ')} — 영업이익률 3% 미만.`,
    });
  }

  const missingCogs = records.filter((r) => {
    const view = resolveStandardFinancialView(r);
    return (
      safeNumber(view.revenue) > 0 &&
      safeNumber(view.cogs_ratio) <= 0 &&
      safeNumber(view.operating_margin) > 0
    );
  });
  if (missingCogs.length > 0) {
    result.costStructure.push({
      severity: 'warning',
      title: '원가 구조 미추출',
      detail: `${missingCogs.map(displayName).join(', ')} — 매출원가/판관비가 재무제표에서 누락되어 원가율 차트가 왜곡될 수 있습니다.`,
    });
  }

  const productivityItems = buildProductivityChartData(summary, revenueRanking);
  const productivityReady = productivityItems.filter((item) => item.hasProductivityData);
  const productivityPeriod = formatCostStructureAveragePeriodLabel(
    resolveRevenueRankingChartYears(summary.fromYear, summary.toYear, rankYear),
  );

  if (productivityReady.length > 0) {
    const topRevenuePerEmployee = [...productivityReady].sort(
      (a, b) => (b.revenuePerEmployeeEok ?? 0) - (a.revenuePerEmployeeEok ?? 0),
    )[0];
    result.productivity.push({
      severity: 'info',
      title: '생산성 요약',
      detail: `${productivityPeriod} · 인당 매출 1위 ${topRevenuePerEmployee.companyName} · ${formatProductivityPerEmployeeEok(topRevenuePerEmployee.revenuePerEmployeeEok)}`,
    });
  }

  const missingEmployees = productivityItems.filter((item) => !item.hasProductivityData);
  if (missingEmployees.length > 0) {
    result.productivity.push({
      severity: 'warning',
      title: '종업원 수 미추출',
      detail: `${missingEmployees.map((item) => item.companyName).join(', ')} — 인당 생산성 산출 불가.`,
    });
  }

  const lowProductivity = productivityReady.filter(
    (item) => (item.revenuePerEmployeeEok ?? 0) > 0 && (item.revenuePerEmployeeEok ?? 0) < 1,
  );
  if (lowProductivity.length > 0) {
    result.productivity.push({
      severity: 'warning',
      title: '인당 매출 저조',
      detail: `${lowProductivity.map((item) => `${item.companyName}(${formatProductivityPerEmployeeEok(item.revenuePerEmployeeEok)})`).join(', ')}`,
    });
  }

  return result;
}

/** @deprecated 섹션별 인사이트는 buildExecutiveInsightsBySection 사용 */
export function buildExecutiveInsights(
  summary: CompetitorExecutiveMultiYearSummary,
): ExecutiveInsightItem[] {
  const bySection = buildExecutiveInsightsBySection(summary);
  return [
    ...bySection.timeline,
    ...bySection.revenueRanking,
    ...bySection.costStructure,
    ...bySection.productivity,
  ];
}
