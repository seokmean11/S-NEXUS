import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import type { PersonnelResourceShareItem, PersonnelResourceStats } from '@/utils/personnelResourceStats';
import { getPersonnelResourceChartColor } from '@/utils/personnelResourceStats';

interface PersonnelResourceStatusPanelProps {
  stats: PersonnelResourceStats;
}

interface DonutSegment {
  label: string;
  count: number;
  sharePercent: number;
  color: string;
  startAngle: number;
  endAngle: number;
}

interface PersonnelDonutChartProps {
  title: string;
  items: PersonnelResourceShareItem[];
  totalValue: number;
}

function formatStatValue(value: number): string {
  return value.toLocaleString('ko-KR');
}

function buildDonutSegments(items: PersonnelResourceShareItem[]): DonutSegment[] {
  if (items.length === 0) return [];

  let cursor = 0;
  return items.map((item, index) => {
    const sweep = (item.sharePercent / 100) * 360;
    const segment: DonutSegment = {
      label: item.label,
      count: item.count,
      sharePercent: item.sharePercent,
      color: getPersonnelResourceChartColor(index),
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

function PersonnelDonutChart({ title, items, totalValue }: PersonnelDonutChartProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const segments = useMemo(() => buildDonutSegments(items), [items]);
  const hoveredSegment = segments.find((segment) => segment.label === hoveredLabel);

  if (segments.length === 0) {
    return (
      <div className="personnel-resource-chart">
        <h4 className="personnel-resource-chart__title">{title}</h4>
        <p className="personnel-resource-chart__empty">표시할 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="personnel-resource-chart">
      <div className="personnel-resource-chart__header">
        <h4 className="personnel-resource-chart__title">{title}</h4>
      </div>

      <div className="personnel-resource-chart__body">
        <div className="personnel-resource-donut">
          <svg viewBox="0 0 220 220" className="personnel-resource-donut__svg" role="img">
            <title>{title}</title>
            {segments.map((segment) => (
              <path
                key={segment.label}
                d={describeDonutSlice(110, 110, 96, 58, segment.startAngle, segment.endAngle)}
                fill={segment.color}
                opacity={hoveredLabel && hoveredLabel !== segment.label ? 0.45 : 1}
                onMouseEnter={() => setHoveredLabel(segment.label)}
                onMouseLeave={() => setHoveredLabel(null)}
              />
            ))}
          </svg>
          <div className="personnel-resource-donut__center">
            {hoveredSegment ? (
              <>
                <strong>{hoveredSegment.label}</strong>
                <span>
                  {formatStatValue(hoveredSegment.count)}
                  <span className="personnel-resource-metric__unit">명</span>
                </span>
                <span>{hoveredSegment.sharePercent.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <strong>전체</strong>
                <span>
                  {formatStatValue(totalValue)}
                  <span className="personnel-resource-metric__unit">명</span>
                </span>
              </>
            )}
          </div>
        </div>

        <ul className="personnel-resource-legend">
          {segments.map((segment) => (
            <li
              key={segment.label}
              className={`personnel-resource-legend__item ${hoveredLabel === segment.label ? 'personnel-resource-legend__item--active' : ''}`}
              onMouseEnter={() => setHoveredLabel(segment.label)}
              onMouseLeave={() => setHoveredLabel(null)}
            >
              <span
                className="personnel-resource-legend__swatch"
                style={{ backgroundColor: segment.color }}
                aria-hidden
              />
              <span className="personnel-resource-legend__label" title={segment.label}>
                {segment.label}
              </span>
              <span className="personnel-resource-legend__value">
                <span className="personnel-resource-legend__amount">
                  {formatStatValue(segment.count)}
                  <span className="personnel-resource-metric__unit">명</span>
                </span>
                <span className="personnel-resource-legend__percent">
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

export function PersonnelResourceStatusPanel({ stats }: PersonnelResourceStatusPanelProps) {
  const statItems = [
    { label: '전체 인적자원', value: formatStatValue(stats.totalCount), unit: '명' },
    { label: '직급 구분', value: formatStatValue(stats.rankShares.length), unit: '종' },
    { label: '사업본부 구분', value: formatStatValue(stats.divisionShares.length), unit: '개' },
  ];

  return (
    <Card title="자원정보현황" className="personnel-resource-status-card">
      <div className="personnel-resource-status__metrics">
        {statItems.map((item) => (
          <div key={item.label} className="personnel-resource-metric">
            <span className="personnel-resource-metric__label">{item.label}</span>
            <strong className="personnel-resource-metric__value">
              {item.value}
              {item.unit && <span className="personnel-resource-metric__unit">{item.unit}</span>}
            </strong>
          </div>
        ))}
      </div>

      <div className="personnel-resource-status__chart-section">
        <h3 className="personnel-resource-status__charts-heading">직급·사업본부 구성비</h3>
        <div className="personnel-resource-status__charts">
          <PersonnelDonutChart
            title="직급별 인원 비중"
            items={stats.rankShares}
            totalValue={stats.totalCount}
          />
          <PersonnelDonutChart
            title="사업본부별 인원 비중"
            items={stats.divisionShares}
            totalValue={stats.totalCount}
          />
        </div>
      </div>
    </Card>
  );
}
