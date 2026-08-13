import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CompetitorAnalysisDashboard } from '@/components/misc/CompetitorAnalysisDashboard';

export function CompetitorAnalysisPage() {
  return (
    <ErrorBoundary fallbackTitle="경쟁사 분석 화면 오류">
      <div className="competitor-analysis-page">
        <div className="competitor-analysis-page__header page-header no-print page-header--row">
          <div>
            <h2>경쟁사 분석</h2>
            <p>경쟁사 정보를 비교·분석합니다.</p>
          </div>
        </div>

        <div className="competitor-analysis-page__scroll">
          <CompetitorAnalysisDashboard />
        </div>
      </div>
    </ErrorBoundary>
  );
}
