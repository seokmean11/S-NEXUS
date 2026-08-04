import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { VendorChartItem } from '@/types/outsourcing';
import { formatOutsourcingAmount } from '@/utils/outsourcingAnalysis';
import { buildLinearChartScale } from '@/utils/chartScale';
import type { ExportTable } from '@/utils/reportExport';
import { downloadCsv } from '@/utils/reportExport';

interface OutsourcingVendorChartProps {
  items: VendorChartItem[];
}

function formatShare(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function OutsourcingVendorChart({ items }: OutsourcingVendorChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  const maxAmount = useMemo(
    () => (items.length > 0 ? Math.max(...items.map((item) => item.amount)) : 0),
    [items],
  );

  const chartScale = useMemo(() => buildLinearChartScale(maxAmount, 4), [maxAmount]);

  const hoveredItem = hoveredIndex != null ? items[hoveredIndex] : null;

  const updateTooltipPosition = (index: number) => {
    const barGroup = barRefs.current[index];
    if (!barGroup) return;

    const rect = barGroup.getBoundingClientRect();
    const tooltipWidth = 240;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, 12),
      window.innerWidth - tooltipWidth - 12,
    );

    setTooltipStyle({
      position: 'fixed',
      left,
      top: Math.max(rect.top - 12, 12),
      transform: 'translateY(-100%)',
      width: tooltipWidth,
      zIndex: 1000,
    });
  };

  const handleExport = () => {
    const table: ExportTable = {
      headers: ['업체명', '외주합계', '점유율(%)'],
      rows: items.map((item) => [
        item.vendorLabel,
        String(Math.round(item.amount)),
        item.sharePercent.toFixed(1),
      ]),
    };
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`업체별외주액_${today}.csv`, table);
  };

  const tooltip =
    hoveredItem && hoveredIndex != null ? (
      <div className="outsourcing-chart__tooltip" style={tooltipStyle} role="tooltip">
        <div className="outsourcing-chart__tooltip-title">{hoveredItem.vendorLabel}</div>
        <div className="outsourcing-chart__tooltip-body">
          <div className="outsourcing-chart__tooltip-row outsourcing-chart__tooltip-row--emphasized">
            <span className="outsourcing-chart__tooltip-row-label">
              <span className="outsourcing-chart__tooltip-swatch" aria-hidden />
              업체별_외주합계
            </span>
            <span className="outsourcing-chart__tooltip-value">
              {formatOutsourcingAmount(hoveredItem.amount)}
            </span>
          </div>
          <div className="outsourcing-chart__tooltip-row">
            <span className="outsourcing-chart__tooltip-row-label">점유율</span>
            <span className="outsourcing-chart__tooltip-value">{formatShare(hoveredItem.sharePercent)}</span>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <Card
      title="업체별외주액(차트)"
      subtitle="업체별_외주합계 · Y축 금액 구간에 맞춰 막대 높이가 표시됩니다"
      headerAction={
        <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
          CSV_내보내기
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="outsourcing-chart__empty">표시할 업체 데이터가 없습니다.</p>
      ) : (
        <div className="outsourcing-chart">
          <div className="outsourcing-chart__legend">
            <span className="outsourcing-chart__legend-swatch" aria-hidden />
            업체별_외주합계
          </div>

          <div className="outsourcing-chart__plot">
            <div className="outsourcing-chart__y-axis" aria-hidden>
              {[...chartScale.ticks].reverse().map((tick) => (
                <span key={tick}>{formatOutsourcingAmount(tick)}</span>
              ))}
            </div>

            <div className="outsourcing-chart__chart-panel">
              <div className="outsourcing-chart__scroll">
                <div
                  className="outsourcing-chart__scroll-inner"
                  style={{ minWidth: `${Math.max(items.length * 80, 320)}px` }}
                >
                  <div className="outsourcing-chart__plot-area">
                    {chartScale.ticks.map((tick) => (
                      <div
                        key={`grid-${tick}`}
                        className="outsourcing-chart__grid-line"
                        style={{ bottom: `${(tick / chartScale.scaleMax) * 100}%` }}
                      />
                    ))}

                    <div className="outsourcing-chart__bars">
                      {items.map((item, index) => {
                        const heightPercent =
                          chartScale.scaleMax > 0 ? (item.amount / chartScale.scaleMax) * 100 : 0;
                        const isHovered = hoveredIndex === index;

                        return (
                          <div
                            key={`${item.vendorLabel}-${index}`}
                            ref={(element) => {
                              barRefs.current[index] = element;
                            }}
                            className="outsourcing-chart__bar-group"
                            onMouseEnter={() => {
                              setHoveredIndex(index);
                              updateTooltipPosition(index);
                            }}
                            onMouseMove={() => updateTooltipPosition(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            <div
                              className={`outsourcing-chart__bar ${isHovered ? 'outsourcing-chart__bar--active' : ''}`}
                              style={{
                                height: `${Math.max(heightPercent, item.amount > 0 ? 1 : 0)}%`,
                              }}
                              aria-label={`${item.vendorLabel} ${formatOutsourcingAmount(item.amount)}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="outsourcing-chart__x-labels">
                    {items.map((item, index) => {
                      const label = `${item.vendorLabel} (${formatShare(item.sharePercent)})`;
                      return (
                        <span
                          key={`${item.vendorLabel}-${index}-label`}
                          className="outsourcing-chart__x-label"
                          title={label}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tooltip && createPortal(tooltip, document.body)}
    </Card>
  );
}
