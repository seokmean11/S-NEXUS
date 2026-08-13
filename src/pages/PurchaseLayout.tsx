import { Outlet } from 'react-router-dom';

export function PurchaseLayout() {
  return (
    <div className="purchase-page">
      <div className="page-header no-print purchase-page__header">
        <h2>입찰도우미</h2>
        <p>
          참여업체 견적 비교·검토 양식과 검토 이슈를 자동으로 생성합니다. 실무 검토·분석
          시간 단축에 활용하세요.
        </p>
      </div>

      <div className="purchase-page__body">
        <Outlet />
      </div>
    </div>
  );
}
