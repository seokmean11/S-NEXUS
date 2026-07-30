import { AdminProjectForm } from '@/components/admin/AdminProjectForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function AdminPage() {
  return (
    <ErrorBoundary fallbackTitle="프로젝트 관리 화면 오류">
      <AdminProjectForm />
    </ErrorBoundary>
  );
}
