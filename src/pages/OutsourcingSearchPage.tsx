import { useCallback, useDeferredValue, useMemo, useRef } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';

import { OutsourcingDbStatsPanel } from '@/components/purchase/OutsourcingDbStatsPanel';

import { OutsourcingDetailPanel } from '@/components/purchase/OutsourcingDetailPanel';

import { OutsourcingFilterPanel } from '@/components/purchase/OutsourcingFilterPanel';

import { OutsourcingKpiPanel } from '@/components/purchase/OutsourcingKpiPanel';

import { OutsourcingVendorChart } from '@/components/purchase/OutsourcingVendorChart';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { useOutsourcingSearch } from '@/context/OutsourcingSearchContext';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import {

  formatOutsourcingSourceLabel,

  getLocalOutsourcingSetupHint,

} from '@/services/outsourcingLocalData';

import type { OutsourcingDateRange, OutsourcingFilters } from '@/types/outsourcing';

import {

  buildVendorChartData,

  filterOutsourcingRecords,

  summarizeOutsourcingKpi,

} from '@/utils/outsourcingAnalysis';

import { summarizeOutsourcingDbStats } from '@/utils/outsourcingDbStats';



function formatUpdatedAt(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR');
}

function isOutsourcingDataStale(updatedAt?: string): boolean {
  if (!updatedAt) return false;
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return false;

  const staleAfter = new Date(updated);
  staleAfter.setMonth(staleAfter.getMonth() + 1);
  return Date.now() >= staleAfter.getTime();
}



export function OutsourcingSearchPage() {

  const {

    records,

    filters,

    dateRange,

    loading,

    error,

    notice,

    loadResult,

    localInfo,

    setupOpen,

    setSetupOpen,

    dbStatsOpen,

    setDbStatsOpen,

    setFilters,

    setDateRange,

    loadFromLocalFolder,

    handleFilePick,

  } = useOutsourcingSearch();



  const fileInputRef = useRef<HTMLInputElement>(null);



  const dbStats = useMemo(() => summarizeOutsourcingDbStats(records), [records]);

  const debouncedDateRange = useDebouncedValue(dateRange, 180);



  const filteredRecords = useMemo(

    () => filterOutsourcingRecords(records, filters, { dateRange: debouncedDateRange }),

    [records, filters, debouncedDateRange],

  );

  const deferredFilteredRecords = useDeferredValue(filteredRecords);

  const isDetailPending = deferredFilteredRecords !== filteredRecords;

  const isDateFiltering = debouncedDateRange !== dateRange;



  const kpiSummary = useMemo(() => summarizeOutsourcingKpi(deferredFilteredRecords), [deferredFilteredRecords]);

  const vendorChartItems = useMemo(
    () => buildVendorChartData(deferredFilteredRecords),
    [deferredFilteredRecords],
  );

  const showStaleDataAlert = useMemo(
    () => Boolean(loadResult?.updatedAt && isOutsourcingDataStale(loadResult.updatedAt)),
    [loadResult?.updatedAt],
  );



  const handleFiltersChange = useCallback(

    (nextFilters: OutsourcingFilters) => {

      setFilters(nextFilters);

    },

    [setFilters],

  );



  const handleDateRangeChange = useCallback(

    (nextDateRange: OutsourcingDateRange) => {

      setDateRange(nextDateRange);

    },

    [setDateRange],

  );



  return (

    <ErrorBoundary fallbackTitle="외주정보검색 화면 오류">

      <div className="outsourcing-search-page">

        <div className="page-header no-print">

          <h2>외주정보검색</h2>

          <p>

            PC 로컬 폴더의 AppSheet CSV 내보내기 파일을 읽어 검색·KPI·차트를 분석합니다. Google

            스프레드시트/API는 사용하지 않으며 기존 AppSheet 업무에는 영향이 없습니다.

          </p>

        </div>

        {showStaleDataAlert && (
          <div className="outsourcing-stale-data-alert no-print" role="alert">
            데이터를 갱신해 주세요.
          </div>
        )}

        {loading && records.length === 0 && (

          <Card>

            <p className="outsourcing-status">외주 데이터를 불러오는 중…</p>

          </Card>

        )}



        {records.length > 0 && loadResult && (

          <>

            <div className="outsourcing-search-page__toolbar no-print">

              <div className="outsourcing-search-page__meta-group">

                <span className="outsourcing-search-page__meta">

                  전체 {records.length.toLocaleString('ko-KR')}건 ·{' '}

                  {formatOutsourcingSourceLabel(loadResult)}

                  {loading ? ' · 갱신 중…' : ''}

                </span>

                {loadResult.updatedAt && (

                  <span className="outsourcing-search-page__meta-sub">

                    갱신 {formatUpdatedAt(loadResult.updatedAt)}

                  </span>

                )}

                {localInfo?.configuredPath && loadResult.source === 'local-folder' && (

                  <span className="outsourcing-search-page__meta-sub">{localInfo.configuredPath}</span>

                )}

              </div>

              <div className="outsourcing-search-page__toolbar-actions">

                <input

                  ref={fileInputRef}

                  type="file"

                  accept=".csv,text/csv"

                  className="outsourcing-file-input"

                  onChange={(event) => {

                    const file = event.target.files?.[0];

                    event.target.value = '';

                    if (file) void handleFilePick(file);

                  }}

                />

                <Button variant="ghost" size="sm" onClick={() => setSetupOpen((open) => !open)}>

                  {setupOpen ? '로컬 설정 닫기' : '로컬 폴더 설정'}

                </Button>

                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>

                  CSV 파일 선택

                </Button>

                <Button variant="ghost" size="sm" onClick={() => void loadFromLocalFolder()}>

                  폴더 새로고침

                </Button>

                <Button

                  variant={dbStatsOpen ? 'primary' : 'outline'}

                  size="sm"

                  onClick={() => setDbStatsOpen((open) => !open)}

                >

                  {dbStatsOpen ? 'DB정보량 닫기' : 'DB정보량보기'}

                </Button>

              </div>

            </div>



            {notice && (

              <Card title="데이터 안내" className="outsourcing-notice-card">

                <p className="outsourcing-status outsourcing-status--warn">{notice}</p>

              </Card>

            )}



            {error && (

              <Card title="데이터 안내" className="outsourcing-notice-card">

                <p className="outsourcing-status outsourcing-status--warn">{error}</p>

              </Card>

            )}



            {setupOpen && (

              <Card title="로컬 CSV 폴더 설정" className="outsourcing-setup-card">

                <p className="outsourcing-setup-card__message">

                  AppSheet에서 주기적으로 CSV를 내보내 지정 폴더에 두면, 개발 서버가 해당 파일(폴더

                  내 최신 CSV)을 자동으로 읽습니다. Google Sheets 연동은 하지 않습니다.

                </p>

                <pre className="outsourcing-setup-card__hint">{getLocalOutsourcingSetupHint()}</pre>

              </Card>

            )}



            {dbStatsOpen && (

              <OutsourcingDbStatsPanel

                stats={dbStats}

                loadResult={loadResult}

                updatedAtLabel={loadResult.updatedAt ? formatUpdatedAt(loadResult.updatedAt) : undefined}

              />

            )}



            <OutsourcingFilterPanel

              allRecords={records}

              filters={filters}

              dateRange={dateRange}

              filteredCount={filteredRecords.length}

              isFiltering={isDetailPending || isDateFiltering}

              onFiltersChange={handleFiltersChange}

              onDateRangeChange={handleDateRangeChange}

            />



            <div className="outsourcing-search-page__results">

              <OutsourcingKpiPanel summary={kpiSummary} rowCount={deferredFilteredRecords.length} />

              <OutsourcingVendorChart items={vendorChartItems} />

            </div>



            <OutsourcingDetailPanel

              records={deferredFilteredRecords}

              isPending={isDetailPending || loading}

            />

          </>

        )}



        {!loading && records.length === 0 && error && (

          <Card title="데이터 로드 오류">

            <p className="outsourcing-status outsourcing-status--error">{error}</p>

            <Button variant="outline" size="sm" onClick={() => void loadFromLocalFolder()}>

              다시 불러오기

            </Button>

          </Card>

        )}

      </div>

    </ErrorBoundary>

  );

}


