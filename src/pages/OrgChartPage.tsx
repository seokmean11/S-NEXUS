import { OrgChartForm } from '@/components/admin/OrgChartForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function OrgChartPage() {
  return (
    <ErrorBoundary fallbackTitle="조직관리 화면 오류">
      <OrgChartForm />
    </ErrorBoundary>
  );
}
