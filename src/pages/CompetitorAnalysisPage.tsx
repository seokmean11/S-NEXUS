import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CompetitorAnalysisDashboard } from '@/components/misc/CompetitorAnalysisDashboard';

export function CompetitorAnalysisPage() {
  return (
    <ErrorBoundary fallbackTitle="경쟁사 분석 화면 오류">
      <div className="competitor-analysis-page">
        <div className="competitor-analysis-page__header page-header no-print page-header--row">
          <div>
            <h2>경쟁사 분석</h2>
            <p>
              경쟁사 실적 데이터를 기반으로 매출·원가·생산성 등 기간별 비교와 순위·추세 인사이트를 제공합니다.
            </p>
          </div>
        </div>

        <div className="competitor-analysis-page__scroll">
          <CompetitorAnalysisDashboard />
        </div>
      </div>
    </ErrorBoundary>
  );
}
