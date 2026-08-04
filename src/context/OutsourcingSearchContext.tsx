import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchLocalOutsourcingInfo,
  fetchLocalOutsourcingRecords,
  loadOutsourcingRecords,
  parseOutsourcingUploadFile,
  type OutsourcingLoadResult,
  type OutsourcingLocalInfo,
} from '@/services/outsourcingLocalData';
import {
  EMPTY_OUTSOURCING_DATE_RANGE,
  EMPTY_OUTSOURCING_FILTERS,
  type OutsourcingDateRange,
  type OutsourcingFilters,
} from '@/types/outsourcing';
import type { OutsourcingRecord } from '@/types/outsourcing';

const AUTO_REFRESH_INTERVAL_MS = 60_000;

interface OutsourcingSearchContextValue {
  records: OutsourcingRecord[];
  filters: OutsourcingFilters;
  dateRange: OutsourcingDateRange;
  loading: boolean;
  error: string | null;
  notice: string | null;
  loadResult: OutsourcingLoadResult | null;
  localInfo: OutsourcingLocalInfo | null;
  setupOpen: boolean;
  setSetupOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  dbStatsOpen: boolean;
  setDbStatsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setFilters: (filters: OutsourcingFilters) => void;
  setDateRange: (dateRange: OutsourcingDateRange) => void;
  loadFromLocalFolder: () => Promise<void>;
  handleFilePick: (file: File) => Promise<void>;
}

const OutsourcingSearchContext = createContext<OutsourcingSearchContextValue | null>(null);

export function OutsourcingSearchProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<OutsourcingRecord[]>([]);
  const [filters, setFiltersState] = useState<OutsourcingFilters>(EMPTY_OUTSOURCING_FILTERS);
  const [dateRange, setDateRangeState] = useState<OutsourcingDateRange>(EMPTY_OUTSOURCING_DATE_RANGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadResult, setLoadResult] = useState<OutsourcingLoadResult | null>(null);
  const [localInfo, setLocalInfo] = useState<OutsourcingLocalInfo | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [dbStatsOpen, setDbStatsOpen] = useState(false);

  const loadResultRef = useRef<OutsourcingLoadResult | null>(null);
  const initialLoadStartedRef = useRef(false);

  useEffect(() => {
    loadResultRef.current = loadResult;
  }, [loadResult]);

  const applyLoadResult = useCallback((result: OutsourcingLoadResult, resetFilters = true) => {
    startTransition(() => {
      setRecords(result.records);
      setLoadResult(result);
      if (resetFilters) {
        setFiltersState(EMPTY_OUTSOURCING_FILTERS);
        setDateRangeState(EMPTY_OUTSOURCING_DATE_RANGE);
      }
    });
  }, []);

  const loadFromLocalFolder = useCallback(async () => {
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
  }, [applyLoadResult]);

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void loadFromLocalFolder();
  }, [loadFromLocalFolder]);

  useEffect(() => {
    if (!localInfo?.configured || localInfo.error) return undefined;

    const syncIfFileUpdated = async () => {
      try {
        const info = await fetchLocalOutsourcingInfo();
        if (!info.configured || info.error || !info.updatedAt) return;

        const current = loadResultRef.current;
        if (current?.updatedAt === info.updatedAt) return;

        const result = await fetchLocalOutsourcingRecords();
        applyLoadResult(result, false);
        setNotice('외주 DB 파일 변경을 감지해 데이터를 자동 갱신했습니다.');
      } catch {
        // 자동 갱신 실패는 조용히 무시 (수동 새로고침 가능)
      }
    };

    const timer = window.setInterval(() => {
      void syncIfFileUpdated();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [applyLoadResult, localInfo?.configured, localInfo?.error]);

  const setFilters = useCallback((nextFilters: OutsourcingFilters) => {
    startTransition(() => setFiltersState(nextFilters));
  }, []);

  const setDateRange = useCallback((nextDateRange: OutsourcingDateRange) => {
    setDateRangeState(nextDateRange);
  }, []);

  const handleFilePick = useCallback(
    async (file: File) => {
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
    },
    [applyLoadResult],
  );

  const value: OutsourcingSearchContextValue = {
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
  };

  return (
    <OutsourcingSearchContext.Provider value={value}>{children}</OutsourcingSearchContext.Provider>
  );
}

export function useOutsourcingSearch(): OutsourcingSearchContextValue {
  const context = useContext(OutsourcingSearchContext);
  if (!context) {
    throw new Error('useOutsourcingSearch must be used within OutsourcingSearchProvider');
  }
  return context;
}
