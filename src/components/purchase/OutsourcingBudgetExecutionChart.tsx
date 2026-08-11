import { useMemo } from 'react';

import { Card } from '@/components/ui/Card';

import type { OutsourcingExecutionRateSummary } from '@/types/outsourcing';

import { buildLinearChartScale } from '@/utils/chartScale';
import {
  formatExecutionRatePercent,
  formatOutsourcingAmount,
} from '@/utils/outsourcingAnalysis';

interface OutsourcingBudgetExecutionChartProps {
  summary: OutsourcingExecutionRateSummary;
}

const RATE_WARNING_THRESHOLD = 90;

const CHART_BARS = [
  {
    key: 'contract',
    label: '계약금액',
    amountKey: 'totalContractAmount' as const,
    barClass: 'outsourcing-chart__bar--contract',
    legendClass: 'outsourcing-budget-chart__legend-swatch--contract',
  },
  {
    key: 'execution',
    label: '실행예산',
    amountKey: 'totalExecutionAmount' as const,
    barClass: 'outsourcing-chart__bar--execution',
    legendClass: 'outsourcing-budget-chart__legend-swatch--execution',
  },
  {
    key: 'outsourcing',
    label: '외주금액',
    amountKey: 'totalOutsourcingAmount' as const,
    barClass: 'outsourcing-chart__bar--outsourcing',
    legendClass: 'outsourcing-budget-chart__legend-swatch--outsourcing',
  },
] as const;

function isRateOverThreshold(rate: number | null): boolean {
  return rate != null && rate > RATE_WARNING_THRESHOLD;
}

function rateValueClass(rate: number | null, warnWhenOver = false): string {
  if (warnWhenOver && isRateOverThreshold(rate)) {
    return 'outsourcing-budget-chart__rate-value--warn';
  }
  if (rate == null) return 'outsourcing-budget-chart__rate-value--empty';
  return 'outsourcing-budget-chart__rate-value--ok';
}

export function OutsourcingBudgetExecutionChart({ summary }: OutsourcingBudgetExecutionChartProps) {
  const bars = useMemo(
    () =>
      CHART_BARS.map((bar) => ({
        ...bar,
        amount: summary[bar.amountKey],
      })),
    [summary],
  );

  const hasData = bars.some((bar) => bar.amount > 0);

  const maxAmount = useMemo(
    () => (hasData ? Math.max(...bars.map((bar) => bar.amount)) : 0),
    [bars, hasData],
  );

  const chartScale = useMemo(() => buildLinearChartScale(maxAmount, 4), [maxAmount]);

  const contractOutsourcingOverThreshold = isRateOverThreshold(
    summary.outsourcingExecutionRatePercent,
  );

  return (
    <Card
      title="실행률 분석"
      subtitle="해당 분석은 외주계약명, 실행예산명 상세 단위 분석에 유효합니다."
      className="outsourcing-chart-card outsourcing-budget-chart-card"
    >
      {!hasData ? (
        <p className="outsourcing-chart__empty">표시할 계약·실행·외주 비교 데이터가 없습니다.</p>
      ) : (
        <div className="outsourcing-budget-chart">
          <div className="outsourcing-budget-chart__rate-section">
            <div className="outsourcing-budget-chart__rate-cards">
              <article className="outsourcing-budget-chart__rate-card outsourcing-budget-chart__rate-card--internal">
                <span className="outsourcing-budget-chart__rate-card-label">실행률(내부)</span>
                <strong
                  className={`outsourcing-budget-chart__rate-value ${rateValueClass(summary.internalExecutionRatePercent)}`}
                >
                  {formatExecutionRatePercent(summary.internalExecutionRatePercent)}
                </strong>
                <span className="outsourcing-budget-chart__rate-card-formula">실행금액 ÷ 계약금액</span>
              </article>

              <article className="outsourcing-budget-chart__rate-card outsourcing-budget-chart__rate-card--outsourcing">
                <span className="outsourcing-budget-chart__rate-card-label">실행률(외주)</span>
                <strong
                  className={`outsourcing-budget-chart__rate-value ${rateValueClass(summary.outsourcingExecutionRatePercent, true)}`}
                >
                  {formatExecutionRatePercent(summary.outsourcingExecutionRatePercent)}
                </strong>
                <span className="outsourcing-budget-chart__rate-card-formula">외주금액 ÷ 계약금액</span>
              </article>
            </div>

            {contractOutsourcingOverThreshold && (
              <p className="outsourcing-budget-chart__rate-warning" role="alert">
                계약금액 대비 외주금액이 90%를 초과했습니다. 검색 결과 항목의 원가율 개선이 필요합니다.
              </p>
            )}
          </div>

          <div
            className="outsourcing-budget-chart__chart-legend"
            aria-label="그래프 범례"
          >
            {bars.map((bar) => (
              <span key={bar.key} className="outsourcing-budget-chart__legend-item">
                <span className={`outsourcing-budget-chart__legend-swatch ${bar.legendClass}`} aria-hidden />
                {bar.label}
              </span>
            ))}
          </div>

          <div className="outsourcing-chart__plot">
            <div className="outsourcing-chart__y-axis" aria-hidden>
              {[...chartScale.ticks].reverse().map((tick) => (
                <span key={tick}>{formatOutsourcingAmount(tick)}</span>
              ))}
            </div>

            <div className="outsourcing-chart__chart-panel">
              <div className="outsourcing-chart__scroll">
                <div className="outsourcing-chart__scroll-inner outsourcing-budget-chart__scroll-inner">
                  <div className="outsourcing-chart__plot-area">
                    {chartScale.ticks.map((tick) => (
                      <div
                        key={`grid-${tick}`}
                        className="outsourcing-chart__grid-line"
                        style={{ bottom: `${(tick / chartScale.scaleMax) * 100}%` }}
                      />
                    ))}

                    <div className="outsourcing-chart__bars outsourcing-budget-chart__bars outsourcing-budget-chart__bars--compare">
                      {bars.map((bar) => {
                        const heightPercent =
                          chartScale.scaleMax > 0 ? (bar.amount / chartScale.scaleMax) * 100 : 0;

                        return (
                          <div
                            key={bar.key}
                            className="outsourcing-budget-chart__bar-group outsourcing-budget-chart__bar-group--single"
                            title={`${bar.label} ${formatOutsourcingAmount(bar.amount)}`}
                          >
                            <div
                              className={`outsourcing-chart__bar ${bar.barClass}`}
                              style={{
                                height: `${Math.max(heightPercent, bar.amount > 0 ? 1 : 0)}%`,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="outsourcing-chart__x-labels outsourcing-budget-chart__x-labels">
                    {bars.map((bar) => (
                      <span key={bar.key} className="outsourcing-chart__x-label">
                        {bar.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
