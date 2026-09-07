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
            개발웹입니다. 여기서 저장해도 공용 드라이브 조직인원데이터는 바뀌지 않습니다. 실제 권한
            부여는 서비스웹에서 하세요. Drive가 비어 보이면 저장하지 마세요.
          </p>
        )}
      </div>

      <PersonnelDashboard embedded />
    </div>
  );
}
