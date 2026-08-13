import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fetchCompetitorAiInsights } from '@/services/competitorDriveApi';
import type { CompetitorSector } from '@/types/competitorAnalysis';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import { getClaudeApiKey, hasClaudeApiKey } from '@/utils/claudeApiKey';
import { resolveStandardFinancialView } from '@/utils/competitorStandardView';

interface CompetitorAiInsightsPanelProps {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  summary: CompetitorExecutiveMultiYearSummary | null;
  hasResult?: boolean;
}

export function CompetitorAiInsightsPanel({
  sector,
  fromYear,
  toYear,
  summary,
  hasResult = false,
}: CompetitorAiInsightsPanelProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!summary?.records.length) return;

    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      setError('Claude API 키가 필요합니다. Analysis 페이지 또는 API 설정에서 키를 저장하세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const records = summary.records.map((record) => {
        const view = resolveStandardFinancialView(record);
        return {
          company_name: record.company_name,
          year: record.year,
          financials: {
            unit: '백만원',
            revenue: view.revenue,
            operating_profit: view.operating_profit,
            net_income: view.net_income,
            total_assets: view.total_assets,
            total_liabilities: view.total_liabilities,
            debt_ratio: view.debt_ratio,
            operating_margin: view.operating_margin,
          },
          source_file: record.metadata.source_file,
        };
      });

      const result = await fetchCompetitorAiInsights({
        sector,
        fromYear,
        toYear,
        records,
        apiKey,
      });
      setInsights(result.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fromYear, sector, summary, toYear]);

  if (!hasResult || !summary?.records.length) {
    return null;
  }

  return (
    <Card
      title="AI 분석 이슈"
      subtitle={`Claude · ${Math.min(fromYear, toYear)}~${Math.max(fromYear, toYear)} · ${sector}`}
      className="competitor-ai-insights-card"
    >
      <div className="competitor-ai-insights__actions">
        <Button type="button" variant="secondary" onClick={() => void handleGenerate()} disabled={loading}>
          {loading ? 'AI 분석 생성 중…' : 'AI 인사이트 생성'}
        </Button>
        {!hasClaudeApiKey() && (
          <p className="competitor-ai-insights__hint">
            Claude API 키가 없습니다. 키 저장 후 사용 가능하며 크레딧이 발생합니다.
          </p>
        )}
      </div>

      {error && <p className="competitor-ai-insights__error">{error}</p>}

      {insights ? (
        <div className="competitor-ai-insights__body">
          {insights.split('\n').map((line) => (
            <p key={line.slice(0, 40)} className="competitor-ai-insights__line">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="competitor-ai-insights__placeholder">
          「AI 인사이트 생성」을 누르면 추출된 재무 데이터를 Claude가 대조·분석하여 급격한 변화, 리스크, 데이터
          품질 이슈를 요약합니다.
        </p>
      )}
    </Card>
  );
}
