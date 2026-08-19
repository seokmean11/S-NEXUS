import { useEffect, useState } from 'react';

import type { CompetitorSector } from '@/types/competitorAnalysis';
import type {
  CompetitorExecutiveMultiYearSummary,
  IndustryAnalysisEntry,
} from '@/types/competitorStandard';
import { fetchIndustryAnalysisOverlay } from '@/services/competitorDriveApi';

function filterIndustryOverlayByPeriod(
  byYear: Record<string, Record<string, IndustryAnalysisEntry>> | undefined,
  fromYear: number,
  toYear: number,
): Record<string, Record<string, IndustryAnalysisEntry>> {
  if (!byYear) return {};

  const filtered: Record<string, Record<string, IndustryAnalysisEntry>> = {};
  for (let year = fromYear; year <= toYear; year += 1) {
    const key = String(year);
    if (byYear[key]) {
      filtered[key] = byYear[key];
    }
  }
  return filtered;
}

export function countIndustryAnalysisOverlayEntries(
  summary: CompetitorExecutiveMultiYearSummary | null | undefined,
): number {
  if (!summary?.industryAnalysisByYear) return 0;
  return Object.values(summary.industryAnalysisByYear).reduce(
    (sum, yearMap) => sum + Object.keys(yearMap).length,
    0,
  );
}

/** v1(한국은행 업종평균) 등 구 포맷 — industryDebtRatioByYear 없으면 재조회 */
export function industryAnalysisOverlayNeedsRefresh(
  summary: CompetitorExecutiveMultiYearSummary | null | undefined,
  fromYear: number,
  toYear: number,
): boolean {
  if (!summary || countIndustryAnalysisOverlayEntries(summary) === 0) return true;

  for (let year = fromYear; year <= toYear; year += 1) {
    const entries = Object.values(summary.industryAnalysisByYear?.[String(year)] ?? {});
    if (entries.length === 0) continue;
    if (
      entries.some(
        (entry) =>
          !entry.industryDebtRatioByYear || Object.keys(entry.industryDebtRatioByYear).length === 0,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function mergeIndustryAnalysisOverlayIntoExecutive(
  summary: CompetitorExecutiveMultiYearSummary,
  industryAnalysisByYear: Record<string, Record<string, IndustryAnalysisEntry>>,
  fromYear: number,
  toYear: number,
): CompetitorExecutiveMultiYearSummary {
  if (Object.keys(industryAnalysisByYear).length === 0) {
    return {
      ...summary,
      industryAnalysisByYear: filterIndustryOverlayByPeriod(summary.industryAnalysisByYear, fromYear, toYear),
    };
  }

  const existing = filterIndustryOverlayByPeriod(summary.industryAnalysisByYear, fromYear, toYear);
  const mergedByYear: Record<string, Record<string, IndustryAnalysisEntry>> = { ...existing };

  for (const [yearKey, entries] of Object.entries(industryAnalysisByYear)) {
    mergedByYear[yearKey] = {
      ...(mergedByYear[yearKey] ?? {}),
      ...entries,
    };
  }

  return {
    ...summary,
    industryAnalysisByYear: mergedByYear,
  };
}

export async function enrichExecutiveSummaryWithIndustryAnalysisOverlay(
  summary: CompetitorExecutiveMultiYearSummary,
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  options?: { force?: boolean },
): Promise<CompetitorExecutiveMultiYearSummary> {
  const needsRefresh =
    options?.force ?? industryAnalysisOverlayNeedsRefresh(summary, fromYear, toYear);

  if (!needsRefresh && countIndustryAnalysisOverlayEntries(summary) > 0) {
    return mergeIndustryAnalysisOverlayIntoExecutive(summary, {}, fromYear, toYear);
  }

  try {
    const overlay = await fetchIndustryAnalysisOverlay({
      sector,
      fromYear,
      toYear,
      force: needsRefresh,
    });
    if (Object.keys(overlay.industryAnalysisByYear).length === 0) {
      return mergeIndustryAnalysisOverlayIntoExecutive(summary, {}, fromYear, toYear);
    }
    return mergeIndustryAnalysisOverlayIntoExecutive(
      summary,
      overlay.industryAnalysisByYear,
      fromYear,
      toYear,
    );
  } catch {
    return mergeIndustryAnalysisOverlayIntoExecutive(summary, {}, fromYear, toYear);
  }
}

/** 소속산업 분석 오버레이 보강 — competitor-data.json 비접촉 */
export function useIndustryAnalysisEnrichedSummary(
  summary: CompetitorExecutiveMultiYearSummary | null,
  sector: CompetitorSector | undefined,
  fromYear: number | undefined,
  toYear: number | undefined,
): {
  summary: CompetitorExecutiveMultiYearSummary | null;
  overlayLoading: boolean;
} {
  const [resolvedSummary, setResolvedSummary] = useState(summary);
  const [overlayLoading, setOverlayLoading] = useState(false);

  useEffect(() => {
    if (!summary || fromYear == null || toYear == null) {
      setResolvedSummary(summary);
      return;
    }
    setResolvedSummary(mergeIndustryAnalysisOverlayIntoExecutive(summary, {}, fromYear, toYear));
  }, [summary, fromYear, toYear]);

  useEffect(() => {
    if (!summary || !sector || fromYear == null || toYear == null) return;
    if (!industryAnalysisOverlayNeedsRefresh(summary, fromYear, toYear)) return;

    let cancelled = false;
    setOverlayLoading(true);

    void enrichExecutiveSummaryWithIndustryAnalysisOverlay(summary, sector, fromYear, toYear, {
      force: true,
    })
      .then((enriched) => {
        if (cancelled) return;
        if (countIndustryAnalysisOverlayEntries(enriched) > 0) {
          setResolvedSummary(enriched);
        }
      })
      .finally(() => {
        if (!cancelled) setOverlayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [summary, sector, fromYear, toYear]);

  return { summary: resolvedSummary, overlayLoading };
}
