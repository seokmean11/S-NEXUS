import { ProjectAllocationForm } from '@/components/allocation/ProjectAllocationForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function ProjectAllocationPage() {
  return (
    <ErrorBoundary fallbackTitle="프로젝트 팀 배분 화면 오류">
      <ProjectAllocationForm />
    </ErrorBoundary>
  );
}
