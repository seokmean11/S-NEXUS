import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';

import { OutsourcingDbStatsPanel } from '@/components/purchase/OutsourcingDbStatsPanel';

import { OutsourcingFilterPanel } from '@/components/purchase/OutsourcingFilterPanel';

import { OutsourcingSearchResults } from '@/components/purchase/OutsourcingSearchResults';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { useOutsourcingSearch } from '@/context/OutsourcingSearchContext';

import { useDeferredFacetedFilterOptions } from '@/hooks/useDeferredFacetedFilterOptions';

import {

  formatOutsourcingSourceLabel,

  getLocalOutsourcingSetupHint,

} from '@/services/outsourcingLocalData';

import type { OutsourcingDateRange, OutsourcingFilters } from '@/types/outsourcing';

import {

  filterOutsourcingRecords,

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const dbStatsPanelRef = useRef<HTMLDivElement>(null);

  const hasLoadedData = records.length > 0 && loadResult != null;

  useEffect(() => {
    if (!dbStatsOpen) return;

    const body = bodyRef.current;
    const panel = dbStatsPanelRef.current;
    if (!body || !panel) return;

    requestAnimationFrame(() => {
      const scrollTop =
        panel.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop;
      body.scrollTo({ top: Math.max(0, scrollTop - 8), behavior: 'smooth' });
    });
  }, [dbStatsOpen]);



  const dbStats = useMemo(() => summarizeOutsourcingDbStats(records), [records]);

  const deferredFilters = useDeferredValue(filters);
  const deferredDateRange = useDeferredValue(dateRange);

  const filteredRecords = useMemo(
    () => filterOutsourcingRecords(records, deferredFilters, { dateRange: deferredDateRange }),
    [records, deferredFilters, deferredDateRange],
  );

  const isResultsPending =
    deferredFilters !== filters || deferredDateRange !== dateRange;

  const facetedOptions = useDeferredFacetedFilterOptions(
    records,
    deferredFilters,
    deferredDateRange,
  );

  const showStaleDataAlert = useMemo(
    () => Boolean(loadResult?.updatedAt && isOutsourcingDataStale(loadResult.updatedAt)),
    [loadResult?.updatedAt],
  );



  const handleFiltersChange = useCallback(
    (nextFilters: OutsourcingFilters | ((prev: OutsourcingFilters) => OutsourcingFilters)) => {
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

        <div className="page-header no-print outsourcing-search-page__header">

          <h2>외주정보검색</h2>

          <p>
            외주계약 이력 통합 검색 및 금액·단가 KPI·업체별 현황 분석 제공. 기간·조직·업체 등
            다중 조건 필터와 상세 내역 조회로 외주 정보 확인과 업무 검토 시간을 단축합니다.
          </p>

        </div>

        {hasLoadedData && (
          <div className="outsourcing-search-page__toolbar no-print">
            <div className="outsourcing-search-page__meta-group">
              <span className="outsourcing-search-page__meta">
                전체 {records.length.toLocaleString('ko-KR')}건 ·{' '}
                {formatOutsourcingSourceLabel(loadResult!)}
                {loading ? ' · 갱신 중…' : ''}
              </span>

              {loadResult!.updatedAt && (
                <span className="outsourcing-search-page__meta-sub">
                  갱신 {formatUpdatedAt(loadResult!.updatedAt)}
                </span>
              )}

              {localInfo?.configuredPath && loadResult!.source === 'local-folder' && (
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
        )}

        <div className="outsourcing-search-page__body" ref={bodyRef}>

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



        {hasLoadedData && (
          <>
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
              <div ref={dbStatsPanelRef} className="outsourcing-search-page__db-stats">
                <OutsourcingDbStatsPanel
                  stats={dbStats}
                  loadResult={loadResult!}
                  updatedAtLabel={
                    loadResult!.updatedAt ? formatUpdatedAt(loadResult!.updatedAt) : undefined
                  }
                />
              </div>
            )}



            <OutsourcingFilterPanel

              allRecords={records}

              filters={filters}

              dateRange={dateRange}

              facetedOptions={facetedOptions}

              filteredCount={filteredRecords.length}

              isFiltering={isResultsPending}

              onFiltersChange={handleFiltersChange}

              onDateRangeChange={handleDateRangeChange}

            />



            <OutsourcingSearchResults
              records={filteredRecords}
              loading={loading}
              isPending={isResultsPending}
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

      </div>

    </ErrorBoundary>

  );

}


