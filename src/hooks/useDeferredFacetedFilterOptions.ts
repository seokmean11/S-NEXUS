import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { OutsourcingDateRange, OutsourcingFilterKey, OutsourcingFilters } from '@/types/outsourcing';
import { OUTSOURCING_FILTER_ORDER } from '@/types/outsourcing';
import type { OutsourcingRecord } from '@/types/outsourcing';
import {
  buildAllFacetedFilterOptions,
  buildFacetedOptionsRebuildKey,
} from '@/utils/outsourcingAnalysis';

const EMPTY_FACETED_OPTIONS = Object.fromEntries(
  OUTSOURCING_FILTER_ORDER.map((key) => [key, [] as string[]]),
) as Record<OutsourcingFilterKey, string[]>;

export function useDeferredFacetedFilterOptions(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  dateRange: OutsourcingDateRange,
): Record<OutsourcingFilterKey, string[]> {
  const rebuildKey = useMemo(
    () => buildFacetedOptionsRebuildKey(filters, dateRange),
    [filters, dateRange],
  );

  const recordsRef = useRef(allRecords);
  const filtersRef = useRef(filters);
  const dateRangeRef = useRef(dateRange);
  recordsRef.current = allRecords;
  filtersRef.current = filters;
  dateRangeRef.current = dateRange;

  const [facetedOptions, setFacetedOptions] = useState<Record<OutsourcingFilterKey, string[]>>(() => {
    if (allRecords.length === 0) return EMPTY_FACETED_OPTIONS;
    return buildAllFacetedFilterOptions(allRecords, filters, dateRange, { skipFieldKeyword: true });
  });

  useEffect(() => {
    if (allRecords.length === 0) {
      setFacetedOptions(EMPTY_FACETED_OPTIONS);
      return undefined;
    }

    let cancelled = false;
    const rebuildKeySnapshot = rebuildKey;

    const timer = window.setTimeout(() => {
      if (cancelled) return;

      startTransition(() => {
        if (cancelled) return;

        const next = buildAllFacetedFilterOptions(
          recordsRef.current,
          filtersRef.current,
          dateRangeRef.current,
          { skipFieldKeyword: true },
        );

        if (!cancelled && rebuildKeySnapshot === rebuildKey) {
          setFacetedOptions(next);
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [allRecords, rebuildKey]);

  return facetedOptions;
}
