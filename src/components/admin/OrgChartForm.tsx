import { PersonnelDashboard } from '@/components/personnel/PersonnelDashboard';
import { useApp } from '@/context/AppContext';

export function OrgChartForm() {
  const { permissions } = useApp();

  if (!permissions.canCreateProject) {
    return null;
  }

  return (
    <div className="org-page">
      <div className="page-header no-print">
        <h2>조직관리</h2>
        <p>인원 검색 · 등록 · 수정 · 전출 및 조직 구조 변경은 자동 기록되며 분석 보고서에서 확인할 수 있습니다.</p>
      </div>

      <PersonnelDashboard embedded />
    </div>
  );
}
