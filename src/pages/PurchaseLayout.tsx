import { Outlet } from 'react-router-dom';

export function PurchaseLayout() {
  return (
    <div className="purchase-page">
      <div className="page-header no-print purchase-page__header">
        <h2>입찰도우미</h2>
        <p>
          입찰 참여업체 견적서 검토양식 자동작성 및 검토이슈 제공. 외주발주 입찰 정보 입력 시
          비교검토 양식 생성과 검토이슈 분석으로 실무자의 검토·분석 시간을 단축합니다.
        </p>
      </div>

      <div className="purchase-page__body">
        <Outlet />
      </div>
    </div>
  );
}
