import { memo, useDeferredValue, useMemo, useRef, useState } from 'react';

import { OutsourcingBudgetExecutionChart } from '@/components/purchase/OutsourcingBudgetExecutionChart';
import { OutsourcingDetailPanel } from '@/components/purchase/OutsourcingDetailPanel';
import { OutsourcingKpiPanel } from '@/components/purchase/OutsourcingKpiPanel';
import { OutsourcingVendorChart } from '@/components/purchase/OutsourcingVendorChart';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import type { OutsourcingRecord } from '@/types/outsourcing';
import {
  buildOutsourcingExecutionRateSummary,
  buildVendorChartData,
  summarizeOutsourcingKpi,
} from '@/utils/outsourcingAnalysis';
import {
  exportOutsourcingAnalysisResults,
  OUTSOURCING_ANALYSIS_EXPORT_FORMAT_OPTIONS,
  OUTSOURCING_PDF_VENDOR_CHART_LIMIT,
  waitForExportLayoutPaint,
  type OutsourcingAnalysisExportFormat,
} from '@/utils/outsourcingAnalysisExport';

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
  const displayRecords = isPending ? deferredRecords : records;
  const showPending = isPending && deferredRecords !== records;

  const [exportFormat, setExportFormat] = useState<OutsourcingAnalysisExportFormat>('excel');
  const [exporting, setExporting] = useState(false);
  const [pdfChartItemLimit, setPdfChartItemLimit] = useState<number | undefined>(undefined);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const kpiSummary = useMemo(
    () => summarizeOutsourcingKpi(displayRecords),
    [displayRecords],
  );

  const vendorChartItems = useMemo(
    () => buildVendorChartData(displayRecords),
    [displayRecords],
  );

  const executionRateSummary = useMemo(
    () => buildOutsourcingExecutionRateSummary(displayRecords),
    [displayRecords],
  );

  const handleExport = async () => {
    if (!exportRef.current || displayRecords.length === 0) return;

    setExporting(true);
    try {
      if (exportFormat === 'pdf') {
        setPdfChartItemLimit(OUTSOURCING_PDF_VENDOR_CHART_LIMIT);
        await waitForExportLayoutPaint();
      }

      await exportOutsourcingAnalysisResults({
        format: exportFormat,
        kpiSummary,
        rowCount: displayRecords.length,
        vendorItems: vendorChartItems,
        executionSummary: executionRateSummary,
        exportElement: exportRef.current,
      });
    } catch (error) {
      console.error(error);
      window.alert('내보내기에 실패했습니다.');
    } finally {
      setPdfChartItemLimit(undefined);
      setExporting(false);
    }
  };

  return (
    <>
      <div className="outsourcing-search-results-export">
        <div className="outsourcing-search-results-export__toolbar no-print">
          <Select
            label="내보내기 형식"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as OutsourcingAnalysisExportFormat)}
            options={OUTSOURCING_ANALYSIS_EXPORT_FORMAT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || displayRecords.length === 0}
          >
            {exporting ? '내보내는 중…' : '분석결과 내보내기'}
          </Button>
        </div>

        <div ref={exportRef} className="outsourcing-search-page__results">
          <OutsourcingKpiPanel summary={kpiSummary} rowCount={displayRecords.length} />
          <OutsourcingVendorChart
            items={vendorChartItems}
            exporting={exporting}
            chartItemLimit={pdfChartItemLimit}
          />
          <OutsourcingBudgetExecutionChart summary={executionRateSummary} />
        </div>
      </div>

      <OutsourcingDetailPanel records={displayRecords} isPending={loading || showPending} />
    </>
  );
}

export const OutsourcingSearchResults = memo(OutsourcingSearchResultsComponent);
