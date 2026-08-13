import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  buildRevenueRankingChartData,
  EXECUTIVE_DEBT_RATIO_WARNING,
  safeNumber,
} from '@/utils/competitorExecutiveDashboard';
import { formatCompetitorDisplayCompanyName } from '@/utils/competitorCompanyName';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';
import { formatExecutiveKRW } from '@/utils/formatKRW';

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
  stabilityRisk: ExecutiveInsightItem[];
}

const UNIT_ANOMALY_MILLION = 1_000_000;

export function buildExecutiveInsightsBySection(
  summary: CompetitorExecutiveMultiYearSummary,
): ExecutiveInsightsBySection {
  const result: ExecutiveInsightsBySection = {
    timeline: [],
    revenueRanking: [],
    costStructure: [],
    stabilityRisk: [],
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

  const avgMargin =
    records.reduce((s, r) => s + safeNumber(resolveStandardFinancialView(r).operating_margin), 0) /
    records.length;
  const totalRev = records.reduce((s, r) => s + safeNumber(resolveStandardFinancialView(r).revenue), 0);

  result.timeline.push({
    severity: 'info',
    title: '매출 추이 요약',
    detail: `${summary.fromYear}–${summary.toYear}년 · ${records.length}개사 · 합산 매출 ${formatExecutiveKRW(totalRev)} · 평균 영업이익률 ${avgMargin.toFixed(1)}%`,
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

  const highDebt = records.filter(
    (r) => safeNumber(resolveStandardFinancialView(r).debt_ratio) > EXECUTIVE_DEBT_RATIO_WARNING,
  );
  if (highDebt.length > 0) {
    result.stabilityRisk.push({
      severity: 'risk',
      title: '부채비율 고위험',
      detail: `${highDebt.map((r) => `${displayName(r)}(${safeNumber(resolveStandardFinancialView(r).debt_ratio).toFixed(0)}%)`).join(', ')} — ${EXECUTIVE_DEBT_RATIO_WARNING}% 초과.`,
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
    ...bySection.stabilityRisk,
  ];
}
