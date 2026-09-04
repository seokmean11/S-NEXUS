import { useMemo } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingSummary } from '@/components/fund/FundBillingSummary';
import { useFundBilling } from '@/context/FundBillingContext';

export function FundBillingPage() {
  const { summaryRows, ready } = useFundBilling();
  const divisions = useMemo(
    () =>
      [...new Map(summaryRows.map((row) => [row.divisionId, row.divisionName])).entries()].map(
        ([id, name]) => ({ id, name }),
      ),
    [summaryRows],
  );

  return (
    <ErrorBoundary fallbackTitle="기성관리 화면 오류">
      <div className="fund-billing-page">
        <div className="page-header no-print page-header--row fund-billing-page__header">
          <div>
            <h2>기성관리</h2>
            <p>
              집계현황은 월별 기성보고서에서 작성·수정한 프로젝트별 최신 내용을 보여 줍니다.
            </p>
          </div>
        </div>

        <div className="fund-billing-page__body">
          {ready ? (
            <FundBillingSummary rows={summaryRows} divisions={divisions} />
          ) : (
            <p className="fund-billing-info-hint">월별 기성보고서를 불러오는 중입니다.</p>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
