import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { PersonnelRow } from '@/utils/personnelSearch';
import { formatPersonnelGradeCell } from '@/utils/personnelSearch';
import type { PersonnelResourceShareItem, PersonnelResourceStats } from '@/utils/personnelResourceStats';
import { exportPersonnelResourceStatusPdf } from '@/utils/personnelResourceStatusExport';
import {
  getPersonnelDivisionGradeChartColor,
  getPersonnelResourceChartColor,
  getPersonnelResourceGroupMembers,
  PERSONNEL_DIVISION_GRADE_BUCKETS,
  PERSONNEL_DIVISION_ORDER,
  PERSONNEL_RANK_BUCKETS,
  sortPersonnelResourceDetailMembers,
  type PersonnelResourceGroupKind,
} from '@/utils/personnelResourceStats';

interface PersonnelResourceStatusPanelProps {
  stats: PersonnelResourceStats;
  rows: PersonnelRow[];
}

interface ResourceDetailSelection {
  kind: PersonnelResourceGroupKind;
  chartTitle: string;
  label: string;
  divisionName?: string;
}

function formatStatValue(value: number): string {
  return value.toLocaleString('ko-KR');
}

type DistributionShapeHint = 'pyramid' | 'inverted' | 'balanced';

function getRankDistributionShapeHint(items: PersonnelResourceShareItem[]): DistributionShapeHint {
  const countByLabel = new Map(items.map((item) => [item.label, item.count]));
  const counts = PERSONNEL_RANK_BUCKETS.map((label) => countByLabel.get(label) ?? 0);
  const top = counts[0] + counts[1] + counts[2];
  const bottom = counts[4] + counts[5];
  if (bottom > top * 1.15) return 'pyramid';
  if (top > bottom * 1.15) return 'inverted';
  return 'balanced';
}

const DISTRIBUTION_SHAPE_HINT_LABEL: Record<DistributionShapeHint, string> = {
  pyramid: '피라미드형 — 하위 직급에 인력 집중',
  inverted: '역피라미드형 — 상위 직급에 인력 집중',
  balanced: '균형형 — 직급별 인력 분포가 고르게 분산',
};

interface PersonnelDistributionBarChartProps {
  title: string;
  groupKind: PersonnelResourceGroupKind;
  items: PersonnelResourceShareItem[];
  totalValue: number;
  labelOrder: readonly string[];
  onItemSelect: (selection: ResourceDetailSelection) => void;
  compact?: boolean;
  divisionName?: string;
  getColor?: (label: string, index: number) => string;
  showShapeHint?: boolean;
  /** 사업본부별 인원 비중과 동일한 총원·전체 대비 비율 */
  headerShare?: Pick<PersonnelResourceShareItem, 'count' | 'sharePercent'>;
}

function PersonnelDistributionBarChart({
  title,
  groupKind,
  items,
  totalValue,
  labelOrder,
  onItemSelect,
  compact = false,
  divisionName,
  getColor = (_label, index) => getPersonnelResourceChartColor(index),
  showShapeHint = false,
  headerShare,
}: PersonnelDistributionBarChartProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const chartItems = useMemo(() => {
    const byLabel = new Map(items.map((item) => [item.label, item]));
    return labelOrder.map((label) => {
      const existing = byLabel.get(label);
      return (
        existing ?? {
          label,
          count: 0,
          sharePercent: 0,
        }
      );
    });
  }, [items, labelOrder]);

  const maxCount = useMemo(
    () => Math.max(...chartItems.map((item) => item.count), 1),
    [chartItems],
  );

  const shapeHint = useMemo(
    () => (showShapeHint ? getRankDistributionShapeHint(chartItems) : null),
    [showShapeHint, chartItems],
  );

  const handleSelect = (item: PersonnelResourceShareItem) => {
    if (item.count <= 0) return;
    onItemSelect({
      kind: groupKind,
      chartTitle: title,
      label: item.label,
      divisionName,
    });
  };

  if (totalValue <= 0) {
    return (
      <div
        className={`personnel-resource-chart personnel-resource-chart--bars ${compact ? 'personnel-resource-chart--bars-compact' : ''}`}
      >
        <div className="personnel-resource-chart__header">
          <div className="personnel-resource-chart__title-row">
            <h4 className="personnel-resource-chart__title">{title}</h4>
            {headerShare && (
              <span className="personnel-resource-chart__title-meta">
                {formatStatValue(headerShare.count)}
                <span className="personnel-resource-metric__unit">명</span>
                <span className="personnel-resource-chart__title-meta-sep">·</span>
                {headerShare.sharePercent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <p className="personnel-resource-chart__empty">표시할 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div
      className={`personnel-resource-chart personnel-resource-chart--bars ${compact ? 'personnel-resource-chart--bars-compact' : ''}`}
    >
      <div className="personnel-resource-chart__header">
        <div className="personnel-resource-chart__title-row">
          <h4 className="personnel-resource-chart__title">{title}</h4>
          {headerShare && (
            <span className="personnel-resource-chart__title-meta">
              {formatStatValue(headerShare.count)}
              <span className="personnel-resource-metric__unit">명</span>
              <span className="personnel-resource-chart__title-meta-sep">·</span>
              {headerShare.sharePercent.toFixed(1)}%
            </span>
          )}
        </div>
        {shapeHint && (
          <p
            className={`personnel-resource-bars__shape personnel-resource-bars__shape--${shapeHint}`}
          >
            {DISTRIBUTION_SHAPE_HINT_LABEL[shapeHint]}
          </p>
        )}
        {!compact && (
          <p className="personnel-resource-bars__summary">
            전체{' '}
            <strong>
              {formatStatValue(totalValue)}
              <span className="personnel-resource-metric__unit">명</span>
            </strong>
          </p>
        )}
      </div>

      <div className="personnel-resource-chart__body personnel-resource-chart__body--bars">
        <div className="personnel-resource-bars" role="img" aria-label={title}>
          {chartItems.map((item, index) => {
            const fillPercent = item.count > 0 ? (item.count / maxCount) * 100 : 0;
            const isHovered = hoveredLabel === item.label;
            const isDimmed = hoveredLabel != null && !isHovered;
            const color = getColor(item.label, index);

            return (
              <button
                key={item.label}
                type="button"
                className={`personnel-resource-bar-row ${item.count <= 0 ? 'personnel-resource-bar-row--empty' : ''} ${isHovered ? 'personnel-resource-bar-row--active' : ''}`}
                style={{ opacity: isDimmed ? 0.55 : 1 }}
                disabled={item.count <= 0}
                onMouseEnter={() => setHoveredLabel(item.label)}
                onMouseLeave={() => setHoveredLabel(null)}
                onFocus={() => setHoveredLabel(item.label)}
                onBlur={() => setHoveredLabel(null)}
                onClick={() => handleSelect(item)}
                aria-label={`${item.label} ${formatStatValue(item.count)}명 ${item.sharePercent.toFixed(1)}%`}
              >
                <span className="personnel-resource-bar-row__label" title={item.label}>
                  {item.label}
                </span>
                <span className="personnel-resource-bar-row__track" aria-hidden>
                  <span
                    className="personnel-resource-bar-row__fill"
                    style={{
                      width: `${fillPercent}%`,
                      backgroundColor: item.count > 0 ? color : undefined,
                    }}
                  />
                </span>
                <span className="personnel-resource-bar-row__stats">
                  <span className="personnel-resource-bar-row__count">
                    {formatStatValue(item.count)}
                    <span className="personnel-resource-metric__unit">명</span>
                  </span>
                  <span className="personnel-resource-bar-row__percent">
                    {item.sharePercent.toFixed(1)}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PersonnelResourceDetailDialog({
  selection,
  members,
  onClose,
}: {
  selection: ResourceDetailSelection;
  members: PersonnelRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const groupLabel =
    selection.kind === 'rank'
      ? '직급 구분'
      : selection.kind === 'division_grade'
        ? '급수 구분'
        : '사업본부';

  const subtitleParts = [selection.chartTitle, groupLabel, `${formatStatValue(members.length)}명`];
  if (selection.kind === 'division_grade' && selection.divisionName) {
    subtitleParts.unshift(selection.divisionName);
  }

  return (
    <div className="personnel-edit-backdrop no-print" onClick={onClose}>
      <div
        className="personnel-edit-dialog personnel-resource-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personnel-resource-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="personnel-edit-dialog__header">
          <h3 id="personnel-resource-detail-title" className="personnel-edit-dialog__title">
            {selection.label}
          </h3>
          <p className="personnel-edit-dialog__subtitle">{subtitleParts.join(' · ')}</p>
        </div>

        <div className="personnel-edit-dialog__body">
          {members.length === 0 ? (
            <p className="personnel-resource-detail-dialog__empty">해당 인원이 없습니다.</p>
          ) : (
            <div className="personnel-table-wrap personnel-resource-detail-dialog__table-wrap">
              <table className="personnel-table personnel-resource-detail-dialog__table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>급수</th>
                    <th>직급</th>
                    <th>사업본부</th>
                    <th>팀</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td>{row.name}</td>
                      <td>{formatPersonnelGradeCell(row)}</td>
                      <td>{row.rank}</td>
                      <td>{row.divisionName}</td>
                      <td>{row.teamName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="personnel-edit-dialog__footer">
          <div className="personnel-editor-actions">
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonnelResourceStatusPanel({ stats, rows }: PersonnelResourceStatusPanelProps) {
  const [detailSelection, setDetailSelection] = useState<ResourceDetailSelection | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const detailMembers = useMemo(() => {
    if (!detailSelection) return [];
    return sortPersonnelResourceDetailMembers(
      getPersonnelResourceGroupMembers(
        rows,
        detailSelection.kind,
        detailSelection.label,
        { divisionName: detailSelection.divisionName },
      ),
      detailSelection.kind,
    );
  }, [rows, detailSelection]);

  const divisionGradeColorGetter = useMemo(
    () => (label: string, _index: number) => getPersonnelDivisionGradeChartColor(label),
    [],
  );

  const divisionShareByName = useMemo(
    () => new Map(stats.divisionShares.map((item) => [item.label, item])),
    [stats.divisionShares],
  );

  const statItems = [
    { label: '전체 인적자원', value: formatStatValue(stats.totalCount), unit: '명' },
    { label: '직급 구분', value: formatStatValue(stats.rankShares.length), unit: '종' },
    { label: '사업본부 구분', value: formatStatValue(stats.divisionShares.length), unit: '개' },
  ];

  const handleExportPdf = async () => {
    if (!exportRef.current || exporting) return;

    setExporting(true);
    try {
      await exportPersonnelResourceStatusPdf(exportRef.current);
    } catch {
      window.alert('PDF 내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div ref={exportRef} className="personnel-resource-status-export-root">
      <Card
        title="자원정보현황"
        className="personnel-resource-status-card"
        headerAction={
          <Button
            variant="outline"
            size="sm"
            className="personnel-resource-status-export-hide no-print"
            onClick={() => void handleExportPdf()}
            disabled={exporting}
          >
            {exporting ? '내보내는 중…' : '내보내기'}
          </Button>
        }
      >
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
          <p className="personnel-resource-status__charts-hint">
            가로 막대 길이로 인원 규모를 비교합니다. 항목을 클릭하면 해당 인원 목록을 볼 수
            있습니다.
          </p>
          <div className="personnel-resource-status__charts">
            <PersonnelDistributionBarChart
              title="직급별 인원 비중"
              groupKind="rank"
              items={stats.rankShares}
              totalValue={stats.totalCount}
              labelOrder={PERSONNEL_RANK_BUCKETS}
              onItemSelect={setDetailSelection}
              showShapeHint
            />
            <PersonnelDistributionBarChart
              title="사업본부별 인원 비중"
              groupKind="division"
              items={stats.divisionShares}
              totalValue={stats.totalCount}
              labelOrder={PERSONNEL_DIVISION_ORDER}
              onItemSelect={setDetailSelection}
            />
          </div>
        </div>

        <div className="personnel-resource-status__chart-section">
          <h3 className="personnel-resource-status__charts-heading">사업본부별 급수 구성비</h3>
          <p className="personnel-resource-status__charts-hint">
            사업본부별 임원·1~7급 인원 분포입니다. 항목을 클릭하면 해당 인원 목록을 볼 수 있습니다.
          </p>
          <div className="personnel-resource-status__division-charts">
            {stats.divisionCompositions.map((composition) => {
              const divisionShare = divisionShareByName.get(composition.divisionName);
              const headerShare = {
                count: divisionShare?.count ?? 0,
                sharePercent: divisionShare?.sharePercent ?? 0,
              };

              return (
                <PersonnelDistributionBarChart
                  key={composition.divisionName}
                  title={composition.divisionName}
                  groupKind="division_grade"
                  items={composition.gradeShares}
                  totalValue={composition.totalCount}
                  labelOrder={PERSONNEL_DIVISION_GRADE_BUCKETS}
                  onItemSelect={setDetailSelection}
                  compact
                  divisionName={composition.divisionName}
                  getColor={divisionGradeColorGetter}
                  headerShare={headerShare}
                />
              );
            })}
          </div>
        </div>
      </Card>
      </div>

      {detailSelection && (
        <PersonnelResourceDetailDialog
          selection={detailSelection}
          members={detailMembers}
          onClose={() => setDetailSelection(null)}
        />
      )}
    </>
  );
}
