import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OutsourcingDetailPanel } from '@/components/purchase/OutsourcingDetailPanel';
import { OutsourcingFilterPanel } from '@/components/purchase/OutsourcingFilterPanel';
import { OutsourcingKpiPanel } from '@/components/purchase/OutsourcingKpiPanel';
import { OutsourcingVendorChart } from '@/components/purchase/OutsourcingVendorChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';import {
  fetchLocalOutsourcingInfo,
  fetchLocalOutsourcingRecords,
  formatOutsourcingSourceLabel,
  getLocalOutsourcingSetupHint,
  loadOutsourcingRecords,
  parseOutsourcingUploadFile,
  type OutsourcingLoadResult,
  type OutsourcingLocalInfo,
} from '@/services/outsourcingLocalData';
import { EMPTY_OUTSOURCING_DATE_RANGE, EMPTY_OUTSOURCING_FILTERS, type OutsourcingDateRange, type OutsourcingFilters } from '@/types/outsourcing';
import type { OutsourcingRecord } from '@/types/outsourcing';
import {
  buildVendorChartData,
  filterOutsourcingRecords,
  summarizeOutsourcingKpi,
} from '@/utils/outsourcingAnalysis';

function formatUpdatedAt(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR');
}

export function OutsourcingSearchPage() {
  const [records, setRecords] = useState<OutsourcingRecord[]>([]);
  const [filters, setFilters] = useState<OutsourcingFilters>(EMPTY_OUTSOURCING_FILTERS);
  const [dateRange, setDateRange] = useState<OutsourcingDateRange>(EMPTY_OUTSOURCING_DATE_RANGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadResult, setLoadResult] = useState<OutsourcingLoadResult | null>(null);
  const [localInfo, setLocalInfo] = useState<OutsourcingLocalInfo | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyLoadResult = (result: OutsourcingLoadResult) => {
    startTransition(() => {
      setRecords(result.records);
      setLoadResult(result);
      setFilters(EMPTY_OUTSOURCING_FILTERS);
      setDateRange(EMPTY_OUTSOURCING_DATE_RANGE);
    });
  };

  const loadFromLocalFolder = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const info = await fetchLocalOutsourcingInfo();
      setLocalInfo(info);

      if (!info.configured) {
        const fallback = await loadOutsourcingRecords();
        applyLoadResult(fallback);
        setNotice('로컬 폴더가 설정되지 않아 기본 샘플 CSV를 표시합니다.');
        return;
      }

      if (info.error) {
        throw new Error(info.error);
      }

      const result = await fetchLocalOutsourcingRecords();
      applyLoadResult(result);
    } catch (loadError) {
      try {
        const fallback = await loadOutsourcingRecords();
        applyLoadResult(fallback);
        setError(
          loadError instanceof Error
            ? `${loadError.message} (기본 샘플 CSV로 표시 중)`
            : '로컬 데이터 로드 실패 (기본 샘플 CSV로 표시 중)',
        );
      } catch {
        setRecords([]);
        setLoadResult(null);
        setError(loadError instanceof Error ? loadError.message : '외주 데이터를 불러오지 못했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFromLocalFolder();
  }, []);

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

  const handleFiltersChange = useCallback((nextFilters: OutsourcingFilters) => {
    startTransition(() => setFilters(nextFilters));
  }, []);

  const handleDateRangeChange = useCallback((nextDateRange: OutsourcingDateRange) => {
    setDateRange(nextDateRange);
  }, []);

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await parseOutsourcingUploadFile(file);
      applyLoadResult(result);
      setNotice('선택한 CSV 파일을 불러왔습니다. (Google Sheets / AppSheet 연동 없음)');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'CSV 파일을 읽지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters(EMPTY_OUTSOURCING_FILTERS);
    setDateRange(EMPTY_OUTSOURCING_DATE_RANGE);
    void loadFromLocalFolder();
  };

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
                  onChange={(event) => void handleFilePick(event)}
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
                <Button variant="outline" size="sm" onClick={handleReset}>
                  필터 초기화
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
