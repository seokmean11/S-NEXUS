import { AnalyticsReport } from '@/components/reports/AnalyticsReport';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function ReportsPage() {
  return (
    <ErrorBoundary fallbackTitle="분석 보고서 화면 오류">
      <AnalyticsReport />
    </ErrorBoundary>
  );
}
