import { AnalysisChatbot } from '@/components/analysis/AnalysisChatbot';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function AnalysisPage() {
  return (
    <ErrorBoundary fallbackTitle="분석 화면 오류">
      <div className="analysis-page">
        <div className="page-header no-print">
          <h2>분석</h2>
          <p>Gemini AI와 대화하며 등록 데이터를 분석·보고서화합니다. API 키 설정 후 자유롭게 질문·수정하세요.</p>
        </div>
        <AnalysisChatbot />
      </div>
    </ErrorBoundary>
  );
}
