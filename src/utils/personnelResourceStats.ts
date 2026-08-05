import type { PersonnelGradeLevel } from '@/types';
import type { PersonnelRow } from '@/utils/personnelSearch';
import { comparePersonnelRowsByGrade, comparePersonnelRowsByRank } from '@/utils/personnelSearch';
import {
  EXECUTIVE_OFFICE_DIVISION_ID,
  EXECUTIVE_OFFICE_DIVISION_NAME,
} from '@/utils/orgExecutiveOffice';

export interface PersonnelResourceShareItem {
  label: string;
  count: number;
  sharePercent: number;
}

export interface PersonnelDivisionComposition {
  divisionName: string;
  totalCount: number;
  gradeShares: PersonnelResourceShareItem[];
}

export interface PersonnelResourceStats {
  totalCount: number;
  rankShares: PersonnelResourceShareItem[];
  divisionShares: PersonnelResourceShareItem[];
  divisionCompositions: PersonnelDivisionComposition[];
}

export const PERSONNEL_RANK_BUCKETS = ['임원', '수석', '책임', '선임', '사원'] as const;

export const PERSONNEL_DIVISION_GRADE_BUCKETS = [
  '임원',
  '1급수석',
  '2급수석',
  '3급책임',
  '4급선임',
  '5급선임',
  '6급사원',
  '7급사원',
] as const;

export const PERSONNEL_DIVISION_COMPOSITION_TARGETS = [
  '경영기획본부',
  '전시사업본부',
  '뉴미디어사업실',
  '해외사업실',
  '인테리어사업본부',
  '셀프스토리지사업팀',
] as const;

export const PERSONNEL_DIVISION_ORDER = [
  '임원실',
  '경영기획본부',
  '전시사업본부',
  '뉴미디어사업실',
  '해외사업실',
  '인테리어사업본부',
  '셀프스토리지사업팀',
] as const;

export type PersonnelResourceGroupKind = 'rank' | 'division' | 'division_grade';

export function mapPersonnelDivisionGradeBucket(
  row: PersonnelRow,
): (typeof PERSONNEL_DIVISION_GRADE_BUCKETS)[number] {
  if (!hasResourceNumericGradeLevel(row)) {
    return '임원';
  }
  const bucketByLevel: Record<PersonnelGradeLevel, (typeof PERSONNEL_DIVISION_GRADE_BUCKETS)[number]> =
    {
      1: '1급수석',
      2: '2급수석',
      3: '3급책임',
      4: '4급선임',
      5: '5급선임',
      6: '6급사원',
      7: '7급사원',
    };
  return bucketByLevel[row.gradeLevel!];
}

export function getPersonnelResourceGroupLabel(  row: PersonnelRow,
  kind: PersonnelResourceGroupKind,
): string {
  return kind === 'rank' ? mapPersonnelRankBucket(row) : mapPersonnelDivisionLabel(row);
}

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

function isExecutiveOfficeDivision(row: PersonnelRow): boolean {
  if (row.divisionId === EXECUTIVE_OFFICE_DIVISION_ID) return true;
  const divisionName = row.divisionName.trim();
  return divisionName === EXECUTIVE_OFFICE_DIVISION_NAME || divisionName === '경영관리';
}

function mapPersonnelDivisionLabel(row: PersonnelRow): string {
  if (row.kind === 'executive') {
    if (!isExecutiveOfficeDivision(row)) {
      return row.divisionName.trim() || '미등록';
    }
    return EXECUTIVE_OFFICE_DIVISION_NAME;
  }
  if (row.divisionName.trim() === '경영관리') {
    return EXECUTIVE_OFFICE_DIVISION_NAME;
  }
  return row.divisionName.trim() || '미등록';
}

function buildOrderedShareItems(  rows: PersonnelRow[],
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

export function getPersonnelResourceGroupMembers(
  rows: PersonnelRow[],
  kind: PersonnelResourceGroupKind,
  label: string,
  options?: { divisionName?: string },
): PersonnelRow[] {
  if (kind === 'division_grade') {
    const divisionName = options?.divisionName;
    if (!divisionName) return [];
    return rows.filter(
      (row) =>
        mapPersonnelDivisionLabel(row) === divisionName &&
        mapPersonnelDivisionGradeBucket(row) === label,
    );
  }
  return rows.filter((row) => getPersonnelResourceGroupLabel(row, kind) === label);
}

/** 상세 모달 인원 — 사업본부별·급수구분은 급수순, 직급별·사업본부급수구분은 직급순 */
export function sortPersonnelResourceDetailMembers(
  members: PersonnelRow[],
  kind: PersonnelResourceGroupKind,
): PersonnelRow[] {
  return [...members].sort((a, b) => {
    if (kind === 'division') return comparePersonnelRowsByGrade(a, b);
    return comparePersonnelRowsByRank(a, b);
  });
}

function summarizeDivisionCompositions(rows: PersonnelRow[]): PersonnelDivisionComposition[] {
  return PERSONNEL_DIVISION_COMPOSITION_TARGETS.map((divisionName) => {
    const divisionRows = rows.filter((row) => mapPersonnelDivisionLabel(row) === divisionName);
    return {
      divisionName,
      totalCount: divisionRows.length,
      gradeShares: buildOrderedShareItems(
        divisionRows,
        mapPersonnelDivisionGradeBucket,
        PERSONNEL_DIVISION_GRADE_BUCKETS,
      ),
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
    divisionCompositions: summarizeDivisionCompositions(rows),
  };
}

export function getPersonnelDivisionGradeChartColor(label: string): string {
  const index = (PERSONNEL_DIVISION_GRADE_BUCKETS as readonly string[]).indexOf(label);
  return getPersonnelResourceChartColor(index >= 0 ? index : 0);
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
