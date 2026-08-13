import { useMemo } from 'react';

import { Card } from '@/components/ui/Card';
import type { CompetitorAnalysisSummary } from '@/types/competitorAnalysis';
import { buildLinearChartScale } from '@/utils/chartScale';
import {
  buildTopRevenueOperatingChartData,
  COMPETITOR_REVENUE_CHART_LIMIT,
  formatCompetitorFinancialAmount,
} from '@/utils/competitorFinancialChart';

interface CompetitorRevenueOperatingChartProps {
  analysis: CompetitorAnalysisSummary | null;
  loading?: boolean;
  refreshing?: boolean;
}

export function CompetitorRevenueOperatingChart({
  analysis,
  loading = false,
  refreshing = false,
}: CompetitorRevenueOperatingChartProps) {
  const chartItems = useMemo(
    () => buildTopRevenueOperatingChartData(analysis, COMPETITOR_REVENUE_CHART_LIMIT),
    [analysis],
  );

  const maxAmount = useMemo(() => {
    if (chartItems.length === 0) return 0;
    return Math.max(
      ...chartItems.flatMap((item) => [item.revenue, Math.max(item.operatingIncome, 0)]),
    );
  }, [chartItems]);

  const chartScale = useMemo(() => buildLinearChartScale(maxAmount, 4), [maxAmount]);

  const subtitle =
    analysis != null
      ? `${analysis.year}년 기준 · 매출액 상위 ${Math.min(chartItems.length, COMPETITOR_REVENUE_CHART_LIMIT)}개사`
      : '사업분야·연도 선택 후 분석';

  return (
    <Card
      title={`매출액 상위 ${COMPETITOR_REVENUE_CHART_LIMIT}개사 · 매출액·영업이익`}
      subtitle={subtitle}
      className="competitor-revenue-chart-card"
    >
      {refreshing && chartItems.length > 0 && (
        <p className="competitor-revenue-chart__refreshing">최신 분석 데이터를 반영하는 중…</p>
      )}
      {loading ? (
        <p className="competitor-revenue-chart__empty">차트 데이터를 불러오는 중…</p>
      ) : chartItems.length === 0 ? (
        <p className="competitor-revenue-chart__empty">
          선택한 연도 기준 감사보고서·재무자료에서 매출액을 추출한 회사가 없습니다. 감사보고서 PDF 포함 여부를 확인하거나 Drive 동기화 후 다시 시도하세요.
        </p>
      ) : (
        <div className="competitor-revenue-chart">
          <div className="competitor-revenue-chart__legend" aria-label="그래프 범례">
            <span className="competitor-revenue-chart__legend-item">
              <span
                className="competitor-revenue-chart__legend-swatch competitor-revenue-chart__legend-swatch--revenue"
                aria-hidden
              />
              매출액
            </span>
            <span className="competitor-revenue-chart__legend-item">
              <span
                className="competitor-revenue-chart__legend-swatch competitor-revenue-chart__legend-swatch--operating"
                aria-hidden
              />
              영업이익
            </span>
          </div>

          <div className="outsourcing-chart__plot competitor-revenue-chart__plot">
            <div className="outsourcing-chart__y-axis" aria-hidden>
              {[...chartScale.ticks].reverse().map((tick) => (
                <span key={tick}>{formatCompetitorFinancialAmount(tick)}</span>
              ))}
            </div>

            <div className="outsourcing-chart__chart-panel">
              <div className="outsourcing-chart__scroll">
                <div
                  className="outsourcing-chart__scroll-inner"
                  style={{ minWidth: `${Math.max(chartItems.length * 96, 640)}px` }}
                >
                  <div className="outsourcing-chart__plot-area">
                    {chartScale.ticks.map((tick) => (
                      <div
                        key={`grid-${tick}`}
                        className="outsourcing-chart__grid-line"
                        style={{ bottom: `${(tick / chartScale.scaleMax) * 100}%` }}
                      />
                    ))}

                    <div className="outsourcing-chart__bars competitor-revenue-chart__bars">
                      {chartItems.map((item) => {
                        const revenueHeight =
                          chartScale.scaleMax > 0 ? (item.revenue / chartScale.scaleMax) * 100 : 0;
                        const operatingHeight =
                          chartScale.scaleMax > 0 && item.operatingIncome > 0
                            ? (item.operatingIncome / chartScale.scaleMax) * 100
                            : 0;

                        return (
                          <div
                            key={item.companyName}
                            className="competitor-revenue-chart__bar-group"
                            title={`${item.companyName} · 매출 ${formatCompetitorFinancialAmount(item.revenue)} · 영업이익 ${formatCompetitorFinancialAmount(item.operatingIncome)}`}
                          >
                            <div className="competitor-revenue-chart__bar-pair">
                              <div
                                className="outsourcing-chart__bar competitor-revenue-chart__bar competitor-revenue-chart__bar--revenue"
                                style={{
                                  height: `${Math.max(revenueHeight, item.revenue > 0 ? 1 : 0)}%`,
                                }}
                              />
                              <div
                                className={`outsourcing-chart__bar competitor-revenue-chart__bar competitor-revenue-chart__bar--operating ${
                                  item.operatingIncome < 0
                                    ? 'competitor-revenue-chart__bar--operating-negative'
                                    : ''
                                }`}
                                style={{
                                  height: `${Math.max(operatingHeight, item.operatingIncome > 0 ? 1 : 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="outsourcing-chart__x-labels competitor-revenue-chart__x-labels">
                    {chartItems.map((item) => (
                      <span
                        key={`${item.companyName}-label`}
                        className="outsourcing-chart__x-label"
                        title={item.companyName}
                      >
                        {item.rank}위 {item.companyName}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="table-wrap competitor-revenue-chart__table-wrap">
            <table className="data-table competitor-revenue-chart__table">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>회사</th>
                  <th>매출액</th>
                  <th>영업이익</th>
                </tr>
              </thead>
              <tbody>
                {chartItems.map((item) => (
                  <tr key={`${item.companyName}-row`}>
                    <td>{item.rank}</td>
                    <td>{item.companyName}</td>
                    <td>{formatCompetitorFinancialAmount(item.revenue)}</td>
                    <td
                      className={
                        item.operatingIncome < 0
                          ? 'competitor-revenue-chart__negative-value'
                          : undefined
                      }
                    >
                      {formatCompetitorFinancialAmount(item.operatingIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
