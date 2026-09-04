import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FundBillingProjectRow } from '@/types/fundBilling';
import type { FundBillingReport } from '@/types/fundBillingReport';
import { fetchFundBillingLedger, saveFundBillingLedger } from '@/services/fundBillingApi';
import {
  buildSummaryRowsFromLedger,
  createEmptyFundBillingReport,
  findLatestReport,
  seedFundBillingReportsFromImported,
  upsertFundBillingReport,
} from '@/utils/fundBillingReport';

interface FundBillingContextValue {
  ready: boolean;
  reports: FundBillingReport[];
  summaryRows: FundBillingProjectRow[];
  getReport: (projectId: string) => FundBillingReport | undefined;
  commitReport: (report: FundBillingReport) => void;
  createReport: () => FundBillingReport;
}

const FundBillingContext = createContext<FundBillingContextValue | null>(null);

export function FundBillingProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<FundBillingReport[]>([]);
  const [ready, setReady] = useState(false);
  const persistTimer = useRef<number>();

  const persist = useCallback((next: FundBillingReport[]) => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveFundBillingLedger({ reports: next, updatedAt: new Date().toISOString() });
    }, 500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchFundBillingLedger();
      if (cancelled) return;
      if (remote?.reports?.length) {
        setReports(remote.reports);
      } else {
        const seeded = seedFundBillingReportsFromImported();
        setReports(seeded);
        void saveFundBillingLedger({ reports: seeded, updatedAt: new Date().toISOString() });
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, []);

  const commitReport = useCallback(
    (report: FundBillingReport) => {
      setReports((current) => {
        const next = upsertFundBillingReport(current, report);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const createReport = useCallback(() => {
    const created = createEmptyFundBillingReport();
    commitReport(created);
    return created;
  }, [commitReport]);

  const getReport = useCallback(
    (projectId: string) => findLatestReport(reports, projectId),
    [reports],
  );

  const summaryRows = useMemo(
    () => buildSummaryRowsFromLedger({ reports }),
    [reports],
  );

  const value = useMemo(
    () => ({ ready, reports, summaryRows, getReport, commitReport, createReport }),
    [ready, reports, summaryRows, getReport, commitReport, createReport],
  );

  return <FundBillingContext.Provider value={value}>{children}</FundBillingContext.Provider>;
}

export function useFundBilling(): FundBillingContextValue {
  const value = useContext(FundBillingContext);
  if (!value) {
    throw new Error('useFundBilling must be used within FundBillingProvider');
  }
  return value;
}
