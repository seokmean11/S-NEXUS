import type { PersonnelGradeLevel } from '@/types';
import type { PersonnelRow } from '@/utils/personnelSearch';

export interface PersonnelResourceShareItem {
  label: string;
  count: number;
  sharePercent: number;
}

export interface PersonnelResourceStats {
  totalCount: number;
  rankShares: PersonnelResourceShareItem[];
  divisionShares: PersonnelResourceShareItem[];
}

export const PERSONNEL_RANK_BUCKETS = ['임원', '수석', '책임', '선임', '사원'] as const;

export const PERSONNEL_DIVISION_ORDER = [
  '임원실',
  '경영기획본부',
  '전시사업본부',
  '뉴미디어사업실',
  '해외사업실',
  '인테리어사업본부',
  '셀프스토리지사업팀',
] as const;

/** 자원정보현황 분석 전용 — 1~7급(gradeLevel) 보유 여부로 직급 구간 분류 */
function hasResourceNumericGradeLevel(row: PersonnelRow): boolean {
  return row.gradeLevel != null && row.gradeLevel >= 1 && row.gradeLevel <= 7;
}

function mapResourceGradeLevelToRankBucket(
  gradeLevel: PersonnelGradeLevel,
): (typeof PERSONNEL_RANK_BUCKETS)[number] {
  if (gradeLevel <= 2) return '수석';
  if (gradeLevel === 3) return '책임';
  if (gradeLevel <= 5) return '선임';
  return '사원';
}

function mapPersonnelRankBucket(row: PersonnelRow): (typeof PERSONNEL_RANK_BUCKETS)[number] {
  if (!hasResourceNumericGradeLevel(row)) {
    return '임원';
  }
  return mapResourceGradeLevelToRankBucket(row.gradeLevel!);
}

function mapPersonnelDivisionLabel(row: PersonnelRow): string {
  if (row.kind === 'executive' || row.divisionName === '경영관리') {
    return '임원실';
  }
  return row.divisionName.trim() || '미등록';
}

function buildOrderedShareItems(
  rows: PersonnelRow[],
  getLabel: (row: PersonnelRow) => string,
  order: readonly string[],
): PersonnelResourceShareItem[] {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const label = getLabel(row);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  });

  const totalCount = rows.length;
  const orderedLabels = [
    ...order.filter((label) => (totals.get(label) ?? 0) > 0),
    ...[...totals.keys()]
      .filter((label) => !order.includes(label))
      .sort((a, b) => a.localeCompare(b, 'ko')),
  ];

  return orderedLabels.map((label) => {
    const count = totals.get(label) ?? 0;
    return {
      label,
      count,
      sharePercent: totalCount > 0 ? (count / totalCount) * 100 : 0,
    };
  });
}

export function summarizePersonnelResourceStats(rows: PersonnelRow[]): PersonnelResourceStats {
  return {
    totalCount: rows.length,
    rankShares: buildOrderedShareItems(rows, mapPersonnelRankBucket, PERSONNEL_RANK_BUCKETS),
    divisionShares: buildOrderedShareItems(
      rows,
      mapPersonnelDivisionLabel,
      PERSONNEL_DIVISION_ORDER,
    ),
  };
}

export const PERSONNEL_RESOURCE_CHART_COLORS = [
  '#3182f6',
  '#00a870',
  '#f59e0b',
  '#8b5cf6',
  '#64748b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
] as const;

export function getPersonnelResourceChartColor(index: number): string {
  return PERSONNEL_RESOURCE_CHART_COLORS[index % PERSONNEL_RESOURCE_CHART_COLORS.length];
}
