import { useEffect, useState } from 'react';

import type { CompetitorSector } from '@/types/competitorAnalysis';

import type {

  CompetitorExecutiveMultiYearSummary,

  ProductivityEmployeeEntry,

} from '@/types/competitorStandard';

import { fetchProductivityEmployeesOverlay } from '@/services/competitorDriveApi';

import { resolveProductivityAnalysisYear } from './competitorExecutiveDashboard';



function filterProductivityOverlayByPeriod(

  byYear: Record<string, Record<string, ProductivityEmployeeEntry>> | undefined,

  fromYear: number,

  toYear: number,

): Record<string, Record<string, ProductivityEmployeeEntry>> {

  if (!byYear) return {};



  const filtered: Record<string, Record<string, ProductivityEmployeeEntry>> = {};

  for (let year = fromYear; year <= toYear; year += 1) {

    const key = String(year);

    if (byYear[key]) {

      filtered[key] = byYear[key];

    }

  }

  return filtered;

}



export function countProductivityOverlayEntries(

  summary: CompetitorExecutiveMultiYearSummary | null | undefined,

): number {

  if (!summary?.productivityEmployeesByYear) return 0;

  return Object.values(summary.productivityEmployeesByYear).reduce(

    (sum, yearMap) => sum + Object.keys(yearMap).length,

    0,

  );

}



function countProductivityOverlayEntriesForYears(

  summary: CompetitorExecutiveMultiYearSummary,

  years: number[],

): number {

  return years.reduce(

    (sum, year) => sum + Object.keys(summary.productivityEmployeesByYear?.[String(year)] ?? {}).length,

    0,

  );

}



export function executiveNeedsProductivityOverlayRefresh(

  summary: CompetitorExecutiveMultiYearSummary | null | undefined,

): boolean {

  if (!summary || summary.records.length === 0) return false;



  const productivityYear = resolveProductivityAnalysisYear(summary);

  const periodStart = summary.requestedFromYear ?? summary.fromYear;

  const periodEnd = summary.requestedToYear ?? summary.toYear;

  const overlayYears: number[] = [];

  for (let year = periodEnd; year >= periodStart; year -= 1) {

    overlayYears.push(year);

  }



  if (countProductivityOverlayEntriesForYears(summary, overlayYears) > 0) return false;



  const yearRecords = summary.recordsByYear[String(productivityYear)] ?? summary.records;

  return yearRecords.some((record) => (record.financials.revenue ?? 0) > 0);

}



export function mergeProductivityOverlayIntoExecutive(

  summary: CompetitorExecutiveMultiYearSummary,

  productivityEmployeesByYear: Record<string, Record<string, ProductivityEmployeeEntry>>,

  fromYear: number,

  toYear: number,

): CompetitorExecutiveMultiYearSummary {

  if (Object.keys(productivityEmployeesByYear).length === 0) {

    return {

      ...summary,

      productivityEmployeesByYear: filterProductivityOverlayByPeriod(

        summary.productivityEmployeesByYear,

        fromYear,

        toYear,

      ),

    };

  }



  const scopedExisting = filterProductivityOverlayByPeriod(

    summary.productivityEmployeesByYear,

    fromYear,

    toYear,

  );



  return {

    ...summary,

    productivityEmployeesByYear: {

      ...scopedExisting,

      ...productivityEmployeesByYear,

    },

  };

}



export async function enrichExecutiveSummaryWithProductivityOverlay(

  summary: CompetitorExecutiveMultiYearSummary,

  sector: CompetitorSector,

  fromYear: number,

  toYear: number,

  options?: { force?: boolean },

): Promise<CompetitorExecutiveMultiYearSummary> {

  const needsRefresh = executiveNeedsProductivityOverlayRefresh(summary);

  if (!needsRefresh && !options?.force) {

    return mergeProductivityOverlayIntoExecutive(summary, {}, fromYear, toYear);

  }



  try {

    const overlay = await fetchProductivityEmployeesOverlay({

      sector,

      fromYear,

      toYear,

      force: options?.force ?? needsRefresh,

    });

    const merged = mergeProductivityOverlayIntoExecutive(

      summary,

      overlay.productivityEmployeesByYear,

      fromYear,

      toYear,

    );

    if (countProductivityOverlayEntries(merged) > countProductivityOverlayEntries(summary)) {

      return merged;

    }

    return mergeProductivityOverlayIntoExecutive(summary, {}, fromYear, toYear);

  } catch {

    return mergeProductivityOverlayIntoExecutive(summary, {}, fromYear, toYear);

  }

}



/** 생산성 전용 오버레이가 빠진 executive summary를 API로 보강 — competitor-data.json 비접촉 */

export function useProductivityEnrichedSummary(

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

    setResolvedSummary(mergeProductivityOverlayIntoExecutive(summary, {}, fromYear, toYear));

  }, [summary, fromYear, toYear]);



  useEffect(() => {

    if (!summary || !sector || fromYear == null || toYear == null) return;

    if (!executiveNeedsProductivityOverlayRefresh(summary)) return;



    let cancelled = false;

    setOverlayLoading(true);



    void enrichExecutiveSummaryWithProductivityOverlay(summary, sector, fromYear, toYear, {

      force: true,

    })

      .then((enriched) => {

        if (cancelled) return;

        if (countProductivityOverlayEntries(enriched) > countProductivityOverlayEntries(summary)) {

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


