import { PersonnelDashboard } from '@/components/personnel/PersonnelDashboard';

export function OrgChartForm() {
  return (
    <div className="org-page">
      <div className="page-header no-print org-page__header">
        <h2>조직관리</h2>
        <p>
          S-NEXUS 메뉴를 개인별로 부여하는 화면입니다. 인원별로 사용 가능한 메뉴와 읽기·수정 권한을
          설정합니다.
        </p>
      </div>

      <PersonnelDashboard embedded />
    </div>
  );
}
