import { PersonnelDashboard } from '@/components/personnel/PersonnelDashboard';
import { useApp } from '@/context/AppContext';

export function OrgChartForm() {
  const { orgDriveWritable } = useApp();

  return (
    <div className="org-page">
      <div className="page-header no-print org-page__header">
        <h2>조직관리</h2>
        <p>
          S-NEXUS 메뉴를 개인별로 부여하는 화면입니다. 인원별로 사용 가능한 메뉴와 읽기·수정 권한을
          설정합니다.
        </p>
        {orgDriveWritable ? null : (
          <p className="fund-billing-sandbox-note">
            개발웹입니다. 기능은 서비스웹과 같고, 여기서 저장해도 공용 드라이브 조직인원데이터는 바뀌지 않습니다.
            새로고침하면 서비스웹이 저장한 Drive 최신을 다시 불러옵니다.
          </p>
        )}
      </div>

      <PersonnelDashboard embedded />
    </div>
  );
}
