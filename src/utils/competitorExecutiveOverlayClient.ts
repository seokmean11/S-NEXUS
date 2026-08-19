import { useEffect, useMemo, useRef, useState } from 'react';

import type { CompetitorSector } from '@/types/competitorAnalysis';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import {
  countIndustryAnalysisOverlayEntries,
  enrichExecutiveSummaryWithIndustryAnalysisOverlay,
  industryAnalysisOverlayNeedsRefresh,
  mergeIndustryAnalysisOverlayIntoExecutive,
} from '@/utils/competitorIndustryAnalysisOverlayClient';
import {
  countProductivityOverlayEntries,
  enrichExecutiveSummaryWithProductivityOverlay,
  executiveNeedsProductivityOverlayRefresh,
  mergeProductivityOverlayIntoExecutive,
} from '@/utils/competitorProductivityOverlayClient';

export function scopeExecutiveSummaryToPeriod(
  summary: CompetitorExecutiveMultiYearSummary,
  fromYear: number,
  toYear: number,
): CompetitorExecutiveMultiYearSummary {
  return mergeIndustryAnalysisOverlayIntoExecutive(
    mergeProductivityOverlayIntoExecutive(summary, {}, fromYear, toYear),
    {},
    fromYear,
    toYear,
  );
}

function countAllOverlayEntries(summary: CompetitorExecutiveMultiYearSummary | null | undefined): number {
  return countProductivityOverlayEntries(summary) + countIndustryAnalysisOverlayEntries(summary);
}

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
  if (executiveNeedsProductivityOverlayRefresh(summary)) return true;
  if (fromYear == null || toYear == null) {
    return countIndustryAnalysisOverlayEntries(summary) === 0;
  }
  return industryAnalysisOverlayNeedsRefresh(summary, fromYear, toYear);
}

/** 생산성·소속산업 오버레이를 한 번만 보강 — 연쇄 state 갱신·중복 API 호출 방지 */
export function useExecutiveOverlayEnrichedSummary(
  summary: CompetitorExecutiveMultiYearSummary | null,
  sector: CompetitorSector | undefined,
  fromYear: number | undefined,
  toYear: number | undefined,
): {
  summary: CompetitorExecutiveMultiYearSummary | null;
  overlayLoading: boolean;
} {
  const scopedSummary = useMemo(() => {
    if (!summary || fromYear == null || toYear == null) return summary;
    return scopeExecutiveSummaryToPeriod(summary, fromYear, toYear);
  }, [summary, fromYear, toYear]);

  const needsProductivityRefresh = scopedSummary
    ? executiveNeedsProductivityOverlayRefresh(scopedSummary)
    : false;
  const needsIndustryRefresh =
    scopedSummary && fromYear != null && toYear != null
      ? industryAnalysisOverlayNeedsRefresh(scopedSummary, fromYear, toYear)
      : false;
  const needsFetch = needsProductivityRefresh || needsIndustryRefresh;

  const [fetchedSummary, setFetchedSummary] = useState<CompetitorExecutiveMultiYearSummary | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    setFetchedSummary(null);
    fetchGenerationRef.current += 1;
  }, [summary, sector, fromYear, toYear]);

  useEffect(() => {
    if (!needsFetch || !scopedSummary || !sector || fromYear == null || toYear == null) {
      setOverlayLoading(false);
      return;
    }

    const generation = fetchGenerationRef.current;
    let cancelled = false;
    setOverlayLoading(true);

    void enrichExecutiveSummaryWithAllOverlays(scopedSummary, sector, fromYear, toYear, {
      force: true,
    })
      .then((enriched) => {
        if (cancelled || generation !== fetchGenerationRef.current) return;
        setFetchedSummary(enriched);
      })
      .finally(() => {
        if (!cancelled && generation === fetchGenerationRef.current) {
          setOverlayLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [needsFetch, needsProductivityRefresh, needsIndustryRefresh, scopedSummary, sector, fromYear, toYear]);

  const resolvedSummary = useMemo(() => {
    if (!scopedSummary) return scopedSummary;
    if (!fetchedSummary || fromYear == null || toYear == null) return scopedSummary;

    const scopedFetched = scopeExecutiveSummaryToPeriod(fetchedSummary, fromYear, toYear);
    if (countAllOverlayEntries(scopedFetched) > countAllOverlayEntries(scopedSummary)) {
      return scopedFetched;
    }
    return scopedSummary;
  }, [scopedSummary, fetchedSummary, fromYear, toYear]);

  return { summary: resolvedSummary, overlayLoading: needsFetch && overlayLoading };
}
