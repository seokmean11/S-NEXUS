import type { CompetitorSector } from '@/types/competitorAnalysis';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  countIndustryAnalysisOverlayEntries,
  enrichExecutiveSummaryWithIndustryAnalysisOverlay,
  industryAnalysisOverlayNeedsRefresh,
} from '@/utils/competitorIndustryAnalysisOverlayClient';
import {
  countProductivityOverlayEntries,
  enrichExecutiveSummaryWithProductivityOverlay,
} from '@/utils/competitorProductivityOverlayClient';

/** executive summary에 생산성·소속산업 오버레이를 순차 병합 (competitor-data.json 비접촉) */
export async function enrichExecutiveSummaryWithAllOverlays(
  summary: CompetitorExecutiveMultiYearSummary,
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  options?: { force?: boolean },
): Promise<CompetitorExecutiveMultiYearSummary> {
  const withProductivity = await enrichExecutiveSummaryWithProductivityOverlay(
    summary,
    sector,
    fromYear,
    toYear,
    {
      force:
        options?.force ||
        countProductivityOverlayEntries(summary) === 0,
    },
  );

  return enrichExecutiveSummaryWithIndustryAnalysisOverlay(
    withProductivity,
    sector,
    fromYear,
    toYear,
    {
      force:
        options?.force ||
        industryAnalysisOverlayNeedsRefresh(withProductivity, fromYear, toYear),
    },
  );
}

export function executiveNeedsOverlayRefresh(
  summary: CompetitorExecutiveMultiYearSummary | null | undefined,
  fromYear?: number,
  toYear?: number,
): boolean {
  if (!summary) return false;
  if (countProductivityOverlayEntries(summary) === 0) return true;
  if (fromYear == null || toYear == null) {
    return countIndustryAnalysisOverlayEntries(summary) === 0;
  }
  return industryAnalysisOverlayNeedsRefresh(summary, fromYear, toYear);
}
