import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ExhibitionBusinessCostDashboard } from '@/components/misc/ExhibitionBusinessCostDashboard';
import { MOCK_EXHIBITION_BUSINESS_COST } from '@/data/mockExhibitionBusinessCost';

export function ExhibitionBusinessCostPage() {
  return (
    <ErrorBoundary fallbackTitle="유형별사업비(전시) 화면 오류">
      <div className="exhibition-business-cost-page">
        <div className="page-header no-print page-header--row">
          <div>
            <h2>유형별사업비(전시)</h2>
            <p>전시 사업 유형별 사업비 현황을 확인합니다.</p>
          </div>
        </div>

        <ExhibitionBusinessCostDashboard summary={MOCK_EXHIBITION_BUSINESS_COST} />
      </div>
    </ErrorBoundary>
  );
}
