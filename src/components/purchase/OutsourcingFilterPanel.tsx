import { memo, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OutsourcingDateRangeField } from '@/components/purchase/OutsourcingDateRangeField';
import { OutsourcingMultiSelectFilter } from '@/components/purchase/OutsourcingMultiSelectFilter';
import type {
  OutsourcingDateRange,
  OutsourcingFilterFieldState,
  OutsourcingFilterKey,
  OutsourcingFilters,
} from '@/types/outsourcing';
import { EMPTY_OUTSOURCING_DATE_RANGE, EMPTY_OUTSOURCING_FILTERS, OUTSOURCING_FILTER_ORDER } from '@/types/outsourcing';
import type { OutsourcingRecord } from '@/types/outsourcing';
import { buildAllFacetedFilterOptions, countActiveOutsourcingFilters } from '@/utils/outsourcingAnalysis';

interface OutsourcingFilterPanelProps {
  allRecords: OutsourcingRecord[];
  filters: OutsourcingFilters;
  dateRange: OutsourcingDateRange;
  filteredCount: number;
  isFiltering?: boolean;
  onFiltersChange: (filters: OutsourcingFilters) => void;
  onDateRangeChange: (dateRange: OutsourcingDateRange) => void;
}

function OutsourcingFilterPanelComponent({
  allRecords,
  filters,
  dateRange,
  filteredCount,
  isFiltering = false,
  onFiltersChange,
  onDateRangeChange,
}: OutsourcingFilterPanelProps) {
  const activeFilterCount = useMemo(
    () => countActiveOutsourcingFilters(filters, dateRange),
    [filters, dateRange],
  );

  const facetedOptions = useMemo(
    () => buildAllFacetedFilterOptions(allRecords, filters, dateRange),
    [allRecords, filters, dateRange],
  );

  const setField = useCallback(
    (key: OutsourcingFilterKey, field: OutsourcingFilterFieldState) => {
      onFiltersChange({ ...filters, [key]: field });
    },
    [filters, onFiltersChange],
  );

  const handleResetAll = () => {
    onFiltersChange(EMPTY_OUTSOURCING_FILTERS);
    onDateRangeChange({ ...EMPTY_OUTSOURCING_DATE_RANGE });
  };

  return (
    <Card
      title="실시간 필터 검색"
      className="outsourcing-filter-card"
      subtitle="한 입력창에서 키워드 검색과 항목 선택(체크)을 동시에 사용합니다. 필터 간 교차 검색이 적용됩니다."
      headerAction={
        <Button variant="ghost" size="sm" onClick={handleResetAll}>
          전체 초기화
        </Button>
      }
    >
      <p className="outsourcing-filter-summary" aria-live="polite">
        전체 {allRecords.length.toLocaleString('ko-KR')}건 · 필터 {activeFilterCount}개 적용 · 결과{' '}
        {filteredCount.toLocaleString('ko-KR')}건
        {isFiltering ? ' · 갱신 중…' : ''}
      </p>

      <div className="outsourcing-filter-grid">
        <OutsourcingDateRangeField dateRange={dateRange} onChange={onDateRangeChange} />

        {OUTSOURCING_FILTER_ORDER.map((key) => (
          <OutsourcingMultiSelectFilter
            key={key}
            filterKey={key}
            options={facetedOptions[key]}
            field={filters[key]}
            onChange={(field) => setField(key, field)}
          />
        ))}
      </div>
    </Card>
  );
}

export const OutsourcingFilterPanel = memo(OutsourcingFilterPanelComponent);
