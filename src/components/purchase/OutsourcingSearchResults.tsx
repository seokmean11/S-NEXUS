import { memo, useDeferredValue, useMemo } from 'react';
import { OutsourcingDetailPanel } from '@/components/purchase/OutsourcingDetailPanel';
import { OutsourcingKpiPanel } from '@/components/purchase/OutsourcingKpiPanel';
import { OutsourcingVendorChart } from '@/components/purchase/OutsourcingVendorChart';
import type { OutsourcingRecord } from '@/types/outsourcing';
import {
  buildVendorChartData,
  summarizeOutsourcingKpi,
} from '@/utils/outsourcingAnalysis';

interface OutsourcingSearchResultsProps {
  records: OutsourcingRecord[];
  loading: boolean;
  isPending: boolean;
}

function OutsourcingSearchResultsComponent({
  records,
  loading,
  isPending,
}: OutsourcingSearchResultsProps) {
  const deferredRecords = useDeferredValue(records);
  const showPending = isPending || deferredRecords !== records;

  const kpiSummary = useMemo(
    () => summarizeOutsourcingKpi(deferredRecords),
    [deferredRecords],
  );

  const vendorChartItems = useMemo(
    () => buildVendorChartData(deferredRecords),
    [deferredRecords],
  );

  return (
    <>
      <div className="outsourcing-search-page__results">
        <OutsourcingKpiPanel summary={kpiSummary} rowCount={deferredRecords.length} />
        <OutsourcingVendorChart items={vendorChartItems} />
      </div>

      <OutsourcingDetailPanel records={deferredRecords} isPending={loading || showPending} />
    </>
  );
}

export const OutsourcingSearchResults = memo(OutsourcingSearchResultsComponent);
