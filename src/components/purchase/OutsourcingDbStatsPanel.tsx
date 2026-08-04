import { memo, useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';

import type { OutsourcingLoadResult } from '@/services/outsourcingLocalData';

import { formatOutsourcingSourceLabel } from '@/services/outsourcingLocalData';

import type { OutsourcingDbStats, OutsourcingDivisionShare } from '@/utils/outsourcingDbStats';

import {

  formatOutsourcingAmountInMillions,

  OUTSOURCING_DIVISION_CHART_COLORS,

} from '@/utils/outsourcingDbStats';



interface OutsourcingDbStatsPanelProps {

  stats: OutsourcingDbStats;

  loadResult: OutsourcingLoadResult;

  updatedAtLabel?: string;

}



interface DonutSegment {

  division: string;

  count: number;

  sharePercent: number;

  color: string;

  startAngle: number;

  endAngle: number;

}



interface DbDonutChartProps {

  title: string;

  shares: OutsourcingDivisionShare[];

  totalValue: number;

  formatValue: (value: number) => string;

  valueUnit: string;

}



function formatStatValue(value: number): string {

  return value.toLocaleString('ko-KR');

}



function buildDonutSegments(shares: OutsourcingDivisionShare[]): DonutSegment[] {

  if (shares.length === 0) return [];



  let cursor = 0;

  return shares.map((item, index) => {

    const sweep = (item.sharePercent / 100) * 360;

    const segment: DonutSegment = {

      division: item.division,

      count: item.count,

      sharePercent: item.sharePercent,

      color: OUTSOURCING_DIVISION_CHART_COLORS[index % OUTSOURCING_DIVISION_CHART_COLORS.length],

      startAngle: cursor,

      endAngle: cursor + sweep,

    };

    cursor += sweep;

    return segment;

  });

}



function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {

  const rad = ((angleDeg - 90) * Math.PI) / 180;

  return {

    x: cx + radius * Math.cos(rad),

    y: cy + radius * Math.sin(rad),

  };

}



function describeDonutSlice(

  cx: number,

  cy: number,

  outerRadius: number,

  innerRadius: number,

  startAngle: number,

  endAngle: number,

): string {

  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);

  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);

  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);

  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;



  return [

    `M ${startOuter.x} ${startOuter.y}`,

    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,

    `L ${startInner.x} ${startInner.y}`,

    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,

    'Z',

  ].join(' ');

}



function DbDonutChart({ title, shares, totalValue, formatValue, valueUnit }: DbDonutChartProps) {

  const [hoveredDivision, setHoveredDivision] = useState<string | null>(null);

  const segments = useMemo(() => buildDonutSegments(shares), [shares]);

  const hoveredSegment = segments.find((segment) => segment.division === hoveredDivision);



  if (segments.length === 0) {

    return (

      <div className="outsourcing-db-stats-chart">

        <h4 className="outsourcing-db-stats-card__chart-title">{title}</h4>

        <p className="outsourcing-db-stats-card__empty">표시할 사업부 데이터가 없습니다.</p>

      </div>

    );

  }



  return (
    <div className="outsourcing-db-stats-chart">
      <div className="outsourcing-db-stats-chart__header">
        <h4 className="outsourcing-db-stats-card__chart-title">{title}</h4>
      </div>

      <div className="outsourcing-db-stats-chart__body">
        <div className="outsourcing-db-stats-donut">
          <svg viewBox="0 0 220 220" className="outsourcing-db-stats-donut__svg" role="img">
            <title>{title}</title>
            {segments.map((segment) => (
              <path
                key={segment.division}
                d={describeDonutSlice(110, 110, 96, 58, segment.startAngle, segment.endAngle)}
                fill={segment.color}
                opacity={hoveredDivision && hoveredDivision !== segment.division ? 0.45 : 1}
                onMouseEnter={() => setHoveredDivision(segment.division)}
                onMouseLeave={() => setHoveredDivision(null)}
              />
            ))}
          </svg>
          <div className="outsourcing-db-stats-donut__center">
            {hoveredSegment ? (
              <>
                <strong>{hoveredSegment.division}</strong>
                <span>
                  {formatValue(hoveredSegment.count)}
                  <span className="outsourcing-db-stats-metric__unit">{valueUnit}</span>
                </span>
                <span>{hoveredSegment.sharePercent.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <strong>전체</strong>
                <span>
                  {formatValue(totalValue)}
                  <span className="outsourcing-db-stats-metric__unit">{valueUnit}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <ul className="outsourcing-db-stats-legend">
          {segments.map((segment) => (
            <li
              key={segment.division}
              className={`outsourcing-db-stats-legend__item ${hoveredDivision === segment.division ? 'outsourcing-db-stats-legend__item--active' : ''}`}
              onMouseEnter={() => setHoveredDivision(segment.division)}
              onMouseLeave={() => setHoveredDivision(null)}
            >
              <span
                className="outsourcing-db-stats-legend__swatch"
                style={{ backgroundColor: segment.color }}
                aria-hidden
              />
              <span className="outsourcing-db-stats-legend__label" title={segment.division}>
                {segment.division}
              </span>
              <span className="outsourcing-db-stats-legend__value">
                <span className="outsourcing-db-stats-legend__amount">
                  {formatValue(segment.count)}
                  <span className="outsourcing-db-stats-metric__unit">{valueUnit}</span>
                </span>
                <span className="outsourcing-db-stats-legend__percent">
                  {segment.sharePercent.toFixed(1)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

}



function OutsourcingDbStatsPanelComponent({

  stats,

  loadResult,

  updatedAtLabel,

}: OutsourcingDbStatsPanelProps) {

  const statItems = [

    {

      label: '외주총액',

      value: formatOutsourcingAmountInMillions(stats.overall.totalAmount),

      unit: '백만원',

    },

    { label: '데이터 입력', value: formatStatValue(stats.overall.dataEntries), unit: '건' },

    { label: '프로젝트', value: formatStatValue(stats.overall.projects), unit: '건' },

    { label: '외주계약', value: formatStatValue(stats.overall.contracts), unit: '건' },

    { label: '협력사', value: formatStatValue(stats.overall.vendors), unit: '개' },

    { label: '외주품목', value: formatStatValue(stats.overall.items), unit: '개' },

  ];



  return (

    <Card title="DB 정보량" className="outsourcing-db-stats-card">

      <div className="outsourcing-db-stats-card__meta">

        <p className="outsourcing-db-stats-card__source">

          연결 파일 · {formatOutsourcingSourceLabel(loadResult)}

        </p>

        <p className="outsourcing-db-stats-card__updated">

          최종 업데이트 · {updatedAtLabel ?? '확인 중'}

        </p>

        <p className="outsourcing-db-stats-card__cycle">

          갱신 주기 · 외주 DB 파일(CSV) 수정 시 자동 반영 (약 1분마다 변경 확인)

        </p>

      </div>



      <div className="outsourcing-db-stats-card__metrics">

        {statItems.map((item) => (

          <div key={item.label} className="outsourcing-db-stats-metric">

            <span className="outsourcing-db-stats-metric__label">{item.label}</span>

            <strong className="outsourcing-db-stats-metric__value">

              {item.value}

              {item.unit && (

                <span className="outsourcing-db-stats-metric__unit">{item.unit}</span>

              )}

            </strong>

          </div>

        ))}

      </div>



      <div className="outsourcing-db-stats-card__chart-section">
        <h3 className="outsourcing-db-stats-card__charts-heading">사업부별 비중</h3>
        <div className="outsourcing-db-stats-card__charts">

          <DbDonutChart

            title="외주총액 비중"

            shares={stats.divisionAmountShares}

            totalValue={stats.overall.totalAmount}

            formatValue={formatOutsourcingAmountInMillions}

            valueUnit="백만원"

          />

          <DbDonutChart

            title="데이터 입력량 비중"

            shares={stats.divisionEntryShares}

            totalValue={stats.overall.dataEntries}

            formatValue={formatStatValue}

            valueUnit="건"

          />

          <DbDonutChart

            title="프로젝트 수 비중"

            shares={stats.divisionProjectShares}

            totalValue={stats.overall.projects}

            formatValue={formatStatValue}

            valueUnit="건"

          />

        </div>

      </div>

    </Card>

  );

}



export const OutsourcingDbStatsPanel = memo(OutsourcingDbStatsPanelComponent);


