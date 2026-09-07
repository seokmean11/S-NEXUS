import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingSummary } from '@/components/fund/FundBillingSummary';
import { useFundBilling } from '@/context/FundBillingContext';

export function FundCashAnalysisPage() {
  const { ready } = useFundBilling();

  return (
    <ErrorBoundary fallbackTitle="자금수지 화면 오류">
      <div className="fund-billing-page">
        <div className="page-header no-print page-header--row fund-billing-page__header">
          <div>
            <h2>자금수지</h2>
            <p>연월은 필수입니다. 선택한 달의 월별 기성보고서만 자금수지 검색결과와 집계현황에 나타납니다.</p>
          </div>
        </div>

        <div className="fund-billing-page__body">
          {ready ? (
            <FundBillingSummary variant="analysis" />
          ) : (
            <p className="fund-billing-info-hint">월별 기성보고서를 불러오는 중입니다.</p>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
