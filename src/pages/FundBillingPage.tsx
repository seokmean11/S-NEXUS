import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingSummary } from '@/components/fund/FundBillingSummary';
import { useFundBilling } from '@/context/FundBillingContext';

export function FundBillingPage() {
  const { ready, driveWritable } = useFundBilling();

  return (
    <ErrorBoundary fallbackTitle="기성관리 화면 오류">
      <div className="fund-billing-page">
        <div className="page-header no-print page-header--row fund-billing-page__header">
          <div>
            <h2>기성관리</h2>
            <p>월별 기성보고서 작성·조회입니다. 자금수지 검색은 자금수지 메뉴에서 확인하세요.</p>
            {driveWritable ? null : (
              <p className="fund-billing-sandbox-note">
                개발웹입니다. 기능은 서비스웹과 같고, 저장은 공용 드라이브에 반영되지 않습니다.
                새로고침하면 서비스웹이 저장한 Drive 최신을 다시 불러옵니다.
              </p>
            )}
          </div>
        </div>

        <div className="fund-billing-page__body">
          {ready ? (
            <FundBillingSummary />
          ) : (
            <p className="fund-billing-info-hint">월별 기성보고서를 불러오는 중입니다.</p>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
