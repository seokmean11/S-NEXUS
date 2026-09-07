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
  ensureProjectMonthReport,
  findReportForMonth,
  sanitizeFundBillingReports,
  seedFundBillingReportsFromImported,
  upsertFundBillingReport,
} from '@/utils/fundBillingReport';

interface FundBillingContextValue {
  ready: boolean;
  driveWritable: boolean;
  reports: FundBillingReport[];
  summaryRows: FundBillingProjectRow[];
  getReport: (projectId: string, monthKey?: string) => FundBillingReport | undefined;
  commitReport: (report: FundBillingReport) => void;
  createReport: () => FundBillingReport;
  ensureMonthReport: (projectId: string, monthKey: string) => void;
}

const FundBillingContext = createContext<FundBillingContextValue | null>(null);

export function FundBillingProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<FundBillingReport[]>([]);
  const [ready, setReady] = useState(false);
  const [driveWritable, setDriveWritable] = useState(false);
  const persistTimer = useRef<number>();
  const pendingReportRef = useRef<FundBillingReport | null>(null);

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
      const writable = Boolean(remote?.writable);
      setDriveWritable(writable);
      if (remote?.ledger?.reports?.length) {
        const cleaned = sanitizeFundBillingReports(remote.ledger.reports);
        setReports(cleaned);
        if (
          cleaned.length !== remote.ledger.reports.length ||
          cleaned.some((item, index) => item !== remote.ledger!.reports[index])
        ) {
          void saveFundBillingLedger({ reports: cleaned, updatedAt: new Date().toISOString() });
        }
      } else if (!writable) {
        const seeded = seedFundBillingReportsFromImported();
        setReports(seeded);
        void saveFundBillingLedger({ reports: seeded, updatedAt: new Date().toISOString() });
      } else {
        setReports([]);
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
      pendingReportRef.current = report;
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
    pendingReportRef.current = created;
    commitReport(created);
    return created;
  }, [commitReport]);

  const ensureMonthReport = useCallback(
    (projectId: string, monthKey: string) => {
      setReports((current) => {
        const result = ensureProjectMonthReport(current, projectId, monthKey);
        if (result.created) persist(result.reports);
        return result.reports;
      });
    },
    [persist],
  );

  const getReport = useCallback(
    (projectId: string, monthKey?: string) => {
      const found = findReportForMonth(reports, projectId, monthKey);
      if (found) return found;
      const pending = pendingReportRef.current;
      if (
        pending &&
        pending.id === projectId &&
        (!monthKey || pending.monthKey === monthKey)
      ) {
        return pending;
      }
      return undefined;
    },
    [reports],
  );

  const summaryRows = useMemo(
    () => buildSummaryRowsFromLedger({ reports }),
    [reports],
  );

  const value = useMemo(
    () => ({
      ready,
      driveWritable,
      reports,
      summaryRows,
      getReport,
      commitReport,
      createReport,
      ensureMonthReport,
    }),
    [ready, driveWritable, reports, summaryRows, getReport, commitReport, createReport, ensureMonthReport],
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
