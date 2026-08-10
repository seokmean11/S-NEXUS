import { useEffect, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { Select } from '@/components/ui/Input';

import type { VendorChartItem } from '@/types/outsourcing';

import { formatOutsourcingAmount } from '@/utils/outsourcingAnalysis';

import { buildLinearChartScale } from '@/utils/chartScale';

import {
  exportOutsourcingVendorChart,
  OUTSOURCING_VENDOR_EXPORT_FORMAT_OPTIONS,
  type OutsourcingVendorExportFormat,
} from '@/utils/outsourcingVendorExport';
import { resolveOutsourcingTooltipWidth } from '@/utils/outsourcingMobileLayout';



interface OutsourcingVendorChartProps {

  items: VendorChartItem[];

}



function formatShare(value: number): string {

  return `${value.toFixed(1)}%`;

}



function formatContractBreakdownLabel(project: string, contract: string): string {

  if (project && contract) return `${project} · ${contract}`;

  return contract || project || '-';

}



export function OutsourcingVendorChart({ items }: OutsourcingVendorChartProps) {

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [exportFormat, setExportFormat] = useState<OutsourcingVendorExportFormat>('excel');

  const [exporting, setExporting] = useState(false);

  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const exportRef = useRef<HTMLDivElement | null>(null);



  const maxAmount = useMemo(

    () => (items.length > 0 ? Math.max(...items.map((item) => item.amount)) : 0),

    [items],

  );



  const chartScale = useMemo(() => buildLinearChartScale(maxAmount, 4), [maxAmount]);

  const topVendors = useMemo(() => items.slice(0, 5), [items]);

  const selectedItem = selectedIndex != null ? items[selectedIndex] : null;



  const updateTooltipPosition = (index: number) => {

    const barGroup = barRefs.current[index];

    if (!barGroup) return;



    const rect = barGroup.getBoundingClientRect();

    const tooltipWidth = resolveOutsourcingTooltipWidth(320);

    const inset = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, inset),
      window.innerWidth - tooltipWidth - inset,
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



  useEffect(() => {

    if (selectedIndex != null && selectedIndex >= items.length) {

      setSelectedIndex(null);

    }

  }, [items.length, selectedIndex]);



  useEffect(() => {

    if (selectedIndex == null) return undefined;



    const handlePointerDown = (event: MouseEvent) => {

      const target = event.target as Node;

      if (tooltipRef.current?.contains(target)) return;

      if (barRefs.current.some((bar) => bar?.contains(target))) return;

      setSelectedIndex(null);

    };



    const handleEscape = (event: KeyboardEvent) => {

      if (event.key === 'Escape') setSelectedIndex(null);

    };



    document.addEventListener('mousedown', handlePointerDown);

    document.addEventListener('keydown', handleEscape);

    return () => {

      document.removeEventListener('mousedown', handlePointerDown);

      document.removeEventListener('keydown', handleEscape);

    };

  }, [selectedIndex]);



  useEffect(() => {

    if (selectedIndex == null) return undefined;



    const reposition = () => updateTooltipPosition(selectedIndex);

    window.addEventListener('resize', reposition);

    window.addEventListener('scroll', reposition, true);

    return () => {

      window.removeEventListener('resize', reposition);

      window.removeEventListener('scroll', reposition, true);

    };

  }, [selectedIndex]);



  const handleBarClick = (index: number) => {

    setSelectedIndex(index);

    updateTooltipPosition(index);

  };



  const handleExport = async () => {

    if (!exportRef.current || items.length === 0) return;

    setExporting(true);

    setSelectedIndex(null);

    try {

      await exportOutsourcingVendorChart({

        format: exportFormat,

        items,

        chartElement: exportRef.current,

      });

    } catch (error) {

      console.error(error);

      window.alert('내보내기에 실패했습니다.');

    } finally {

      setExporting(false);

    }

  };



  const tooltip =

    selectedItem && selectedIndex != null ? (

      <div

        ref={tooltipRef}

        className="outsourcing-chart__tooltip outsourcing-chart__tooltip--pinned"

        style={tooltipStyle}

        role="dialog"

        aria-label={`${selectedItem.vendorLabel} 외주 정보`}

      >

        <div className="outsourcing-chart__tooltip-title">{selectedItem.vendorLabel}</div>

        <div className="outsourcing-chart__tooltip-body">

          <div className="outsourcing-chart__tooltip-row outsourcing-chart__tooltip-row--emphasized">

            <span className="outsourcing-chart__tooltip-row-label">

              <span className="outsourcing-chart__tooltip-swatch" aria-hidden />

              업체별_외주합계

            </span>

            <span className="outsourcing-chart__tooltip-value">

              {formatOutsourcingAmount(selectedItem.amount)}

            </span>

          </div>

          <div className="outsourcing-chart__tooltip-row">

            <span className="outsourcing-chart__tooltip-row-label">점유율</span>

            <span className="outsourcing-chart__tooltip-value">
              {formatShare(selectedItem.sharePercent)} (
              {selectedItem.contractCount.toLocaleString('ko-KR')}건)
            </span>

          </div>

          <div className="outsourcing-chart__tooltip-row">

            <span className="outsourcing-chart__tooltip-row-label">

              외주액 평균

            </span>

            <span className="outsourcing-chart__tooltip-value">

              {formatOutsourcingAmount(selectedItem.projectAverageAmount)}

            </span>

          </div>

        </div>



        <div className="outsourcing-chart__tooltip-section">

          <div className="outsourcing-chart__tooltip-section-title">

            계약건별_외주액 ({selectedItem.contractCount.toLocaleString('ko-KR')}건)

          </div>

          {selectedItem.contractBreakdown.length === 0 ? (

            <p className="outsourcing-chart__tooltip-empty">표시할 계약 데이터가 없습니다.</p>

          ) : (

            <ul className="outsourcing-chart__tooltip-contract-list">

              {selectedItem.contractBreakdown.map((contractItem) => (

                <li

                  key={`${contractItem.project}\0${contractItem.contract}`}

                  className="outsourcing-chart__tooltip-contract-item"

                >

                  <span

                    className="outsourcing-chart__tooltip-contract-label"

                    title={formatContractBreakdownLabel(contractItem.project, contractItem.contract)}

                  >

                    {formatContractBreakdownLabel(contractItem.project, contractItem.contract)}

                  </span>

                  <span className="outsourcing-chart__tooltip-value">

                    {formatOutsourcingAmount(contractItem.amount)}

                  </span>

                </li>

              ))}

            </ul>

          )}

        </div>

      </div>

    ) : null;



  return (

    <div className="outsourcing-chart-card-section">

      <div className="outsourcing-chart-card-section__toolbar no-print">

        <Select

          label="내보내기 형식"

          value={exportFormat}

          onChange={(event) => setExportFormat(event.target.value as OutsourcingVendorExportFormat)}

          options={OUTSOURCING_VENDOR_EXPORT_FORMAT_OPTIONS.map((option) => ({

            value: option.value,

            label: option.label,

          }))}

        />

        <Button

          variant="outline"

          size="sm"

          onClick={handleExport}

          disabled={exporting || items.length === 0}

        >

          {exporting ? '내보내는 중…' : '점유율 내보내기'}

        </Button>

      </div>

      <div ref={exportRef}>

        <Card

          title="점유율 차트"

          className="outsourcing-chart-card"

          subtitle="막대 클릭 시 상세 정보가 고정 표시됩니다 · Y축 금액 구간에 맞춰 막대 높이가 표시됩니다"

        >

      {items.length === 0 ? (

        <p className="outsourcing-chart__empty">표시할 업체 데이터가 없습니다.</p>

      ) : (
        <div className="outsourcing-chart-card__content">
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

                        const isSelected = selectedIndex === index;



                        return (

                          <div

                            key={`${item.vendorLabel}-${index}`}

                            ref={(element) => {

                              barRefs.current[index] = element;

                            }}

                            className="outsourcing-chart__bar-group"

                            onClick={() => handleBarClick(index)}

                            onKeyDown={(event) => {

                              if (event.key === 'Enter' || event.key === ' ') {

                                event.preventDefault();

                                handleBarClick(index);

                              }

                            }}

                            role="button"

                            tabIndex={0}

                            aria-pressed={isSelected}

                            aria-label={`${item.vendorLabel} ${formatOutsourcingAmount(item.amount)}`}

                          >

                            <div

                              className={`outsourcing-chart__bar ${isSelected ? 'outsourcing-chart__bar--active' : ''}`}

                              style={{

                                height: `${Math.max(heightPercent, item.amount > 0 ? 1 : 0)}%`,

                              }}

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

          {topVendors.length > 0 && (
            <section className="outsourcing-chart__top-vendors" aria-label="점유율 상위 업체">
              <h4 className="outsourcing-chart__top-vendors-title">
                점유율 TOP {topVendors.length}
              </h4>
              <ol className="outsourcing-chart__top-vendors-list">
                {topVendors.map((item, index) => (
                  <li key={`${item.vendorLabel}-${index}`}>
                    <button
                      type="button"
                      className={`outsourcing-chart__top-vendors-item ${selectedIndex === index ? 'outsourcing-chart__top-vendors-item--active' : ''}`}
                      onClick={() => handleBarClick(index)}
                    >
                      <span className="outsourcing-chart__top-vendors-rank">{index + 1}위</span>
                      <span className="outsourcing-chart__top-vendors-name">{item.vendorLabel}</span>
                      <span className="outsourcing-chart__top-vendors-metrics">
                        <span>
                          {formatShare(item.sharePercent)} (
                          {item.contractCount.toLocaleString('ko-KR')}건)
                        </span>
                        <span>{formatOutsourcingAmount(item.amount)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}



      {tooltip && createPortal(tooltip, document.body)}

        </Card>

      </div>

    </div>

  );

}


