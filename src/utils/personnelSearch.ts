import type {
  Division,
  Employee,
  ExecutiveAdmin,
  PersonnelGradeLevel,
  PersonnelPermissionLevel,
  Team,
} from '@/types';
import {
  EXECUTIVE_OFFICE_DIVISION_ID,
  EXECUTIVE_OFFICE_DIVISION_NAME,
  EXECUTIVE_OFFICE_TEAM_ID,
  EXECUTIVE_OFFICE_TEAM_NAME,
  LEGACY_EXECUTIVE_DIVISION_FILTER,
  normalizePersonnelDivisionFilterValue,
} from '@/utils/orgExecutiveOffice';

export type PersonnelKind = 'executive' | 'employee' | 'division_head' | 'team_head';

export interface PersonnelRow {
  id: string;
  kind: PersonnelKind;
  name: string;
  gradeLevel?: PersonnelGradeLevel;
  gradeRank?: string;
  rank: string;
  position?: string;
  permissionLevel?: PersonnelPermissionLevel;
  divisionName: string;
  teamName: string;
  divisionId?: string;
  teamId?: string;
}

/** 본부장 등 소속 팀이 없는 인원의 팀 선택값 */
export const PERSONNEL_TEAM_NONE_VALUE = '__none__';

export const PERSONNEL_EXECUTIVE_GRADE_LABELS = [
  '회장',
  '부회장',
  '부사장',
  '전무',
  '상무',
  '상무보',
  '실장',
  '감사',
] as const;

export const PERSONNEL_RANK_LABELS = [
  '회장',
  '부회장',
  '부사장',
  '전무',
  '상무',
  '상무보',
  '실장',
  '감사',
  '본부장',
  '수석',
  '책임',
  '선임',
  '사원',
] as const;

/** 자원정보현황·상세 목록 정렬용 (Select 옵션 + 팀장) */
const PERSONNEL_RANK_SORT_ORDER = [
  ...PERSONNEL_RANK_LABELS.slice(0, 9),
  '팀장',
  ...PERSONNEL_RANK_LABELS.slice(9),
] as const;

export const PERSONNEL_POSITION_LABELS = [
  '회장',
  '부회장',
  '대표',
  '부사장',
  '전무',
  '상무',
  '상무보',
  '실장',
  '감사',
  '본부장',
  '팀장',
  '팀원',
] as const;

export const PERSONNEL_GRADE_SELECT_OPTIONS = [
  ...PERSONNEL_EXECUTIVE_GRADE_LABELS.map((label) => ({ value: label, label })),
  ...([1, 2, 3, 4, 5, 6, 7] as const).map((level) => ({
    value: `${level}급`,
    label: `${level}급`,
  })),
];

export const PERSONNEL_RANK_SELECT_OPTIONS = PERSONNEL_RANK_LABELS.map((label) => ({
  value: label,
  label,
}));

function getPersonnelRankSortIndex(rank: string): number {
  const normalized = rank.replace(/\s*\(기존\)$/, '').trim();
  const index = (PERSONNEL_RANK_SORT_ORDER as readonly string[]).indexOf(normalized);
  return index >= 0 ? index : PERSONNEL_RANK_SORT_ORDER.length;
}

/** 직급 순서(회장→사원, 팀장 포함) 후 동일 직급은 이름순 */
export function comparePersonnelRowsByRank(a: PersonnelRow, b: PersonnelRow): number {
  const rankDiff = getPersonnelRankSortIndex(a.rank) - getPersonnelRankSortIndex(b.rank);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name, 'ko');
}

export function sortPersonnelRowsByRank(rows: PersonnelRow[]): PersonnelRow[] {
  return [...rows].sort(comparePersonnelRowsByRank);
}

const PERSONNEL_GRADE_SORT_ORDER = [
  ...PERSONNEL_EXECUTIVE_GRADE_LABELS,
  '1급',
  '2급',
  '3급',
  '4급',
  '5급',
  '6급',
  '7급',
] as const;

function getPersonnelGradeSortIndex(row: Pick<PersonnelRow, 'gradeLevel' | 'gradeRank'>): number {
  const gradeValue = getPersonnelGradeFormValue(row);
  if (!gradeValue) return PERSONNEL_GRADE_SORT_ORDER.length;
  const normalized = gradeValue.replace(/\s*\(기존\)$/, '').trim();
  const index = (PERSONNEL_GRADE_SORT_ORDER as readonly string[]).indexOf(normalized);
  return index >= 0 ? index : PERSONNEL_GRADE_SORT_ORDER.length;
}

/** 급수 순서(회장→감사→1급→7급) 후 동일 급수는 이름순 */
export function comparePersonnelRowsByGrade(a: PersonnelRow, b: PersonnelRow): number {
  const gradeDiff = getPersonnelGradeSortIndex(a) - getPersonnelGradeSortIndex(b);
  if (gradeDiff !== 0) return gradeDiff;
  return a.name.localeCompare(b.name, 'ko');
}

export function sortPersonnelRowsByGrade(rows: PersonnelRow[]): PersonnelRow[] {
  return [...rows].sort(comparePersonnelRowsByGrade);
}

export const PERSONNEL_POSITION_SELECT_OPTIONS = PERSONNEL_POSITION_LABELS.map((label) => ({
  value: label,
  label,
}));

/** @deprecated PERSONNEL_GRADE_SELECT_OPTIONS 사용 */
export const PERSONNEL_GRADE_LEVEL_OPTIONS = ([1, 2, 3, 4, 5, 6, 7] as const).map((level) => ({
  value: String(level),
  label: `${level}급`,
}));

export const PERSONNEL_PERMISSION_LEVEL_OPTIONS = (
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
).map((level) => ({
  value: String(level),
  label: `${level}급`,
}));

export function getPersonnelGradeFormValue(
  row: Pick<PersonnelRow, 'gradeLevel' | 'gradeRank'>,
): string {
  if (row.gradeRank) return row.gradeRank;
  if (row.gradeLevel) return `${row.gradeLevel}급`;
  return '';
}

export function appendLegacySelectOption(
  options: Array<{ value: string; label: string }>,
  currentValue: string,
): Array<{ value: string; label: string }> {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }
  return [{ value: currentValue, label: `${currentValue} (기존)` }, ...options];
}

export function parsePersonnelGradeSelection(value: string):
  | { ok: true; gradeLevel?: PersonnelGradeLevel; gradeRank?: string }
  | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: true, gradeLevel: undefined, gradeRank: undefined };
  }

  const numericMatch = value.match(/^([1-7])급$/);
  if (numericMatch) {
    return {
      ok: true,
      gradeLevel: Number(numericMatch[1]) as PersonnelGradeLevel,
      gradeRank: undefined,
    };
  }

  if ((PERSONNEL_EXECUTIVE_GRADE_LABELS as readonly string[]).includes(value)) {
    return { ok: true, gradeRank: value, gradeLevel: undefined };
  }

  return { ok: false, message: '급수는 목록에서 선택해 주세요.' };
}

/** 급수 선택값에 대응하는 직급 (숫자 급수·임원급 규칙) */
export function derivePersonnelRankFromGrade(grade: string): string | null {
  const trimmed = grade.trim();
  if (!trimmed) return null;

  if ((PERSONNEL_EXECUTIVE_GRADE_LABELS as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  const numericMatch = trimmed.match(/^([1-7])급$/);
  if (!numericMatch) return null;

  const level = Number(numericMatch[1]);
  if (level <= 2) return '수석';
  if (level === 3) return '책임';
  if (level <= 5) return '선임';
  return '사원';
}

export function resolvePersonnelRankForSave(
  formGrade: string,
  formRank: string,
):
  | { ok: true; rank: string }
  | { ok: false; message: string } {
  const derivedRank = derivePersonnelRankFromGrade(formGrade);
  if (derivedRank) {
    return { ok: true, rank: derivedRank };
  }
  return parsePersonnelRankSelection(formRank);
}

export function parsePersonnelRankSelection(value: string):
  | { ok: true; rank: string }
  | { ok: false; message: string } {
  const rank = value.trim();
  if (!rank) {
    return { ok: false, message: '직급을 선택해 주세요.' };
  }
  return { ok: true, rank };
}

/** 폼 값 기준 급수 업데이트 — 미입력·미저장 값은 기존 데이터 유지 */
export function buildPersonnelGradeUpdates(
  formGrade: string,
  row: Pick<PersonnelRow, 'gradeLevel' | 'gradeRank'>,
):
  | { ok: true; updates: Partial<Pick<PersonnelRow, 'gradeLevel' | 'gradeRank'>> | null }
  | { ok: false; message: string } {
  const trimmed = formGrade.trim();
  const hadStoredGrade = Boolean(row.gradeRank || row.gradeLevel);

  if (!trimmed) {
    if (hadStoredGrade) {
      return { ok: true, updates: { gradeLevel: undefined, gradeRank: undefined } };
    }
    return { ok: true, updates: null };
  }

  const parsed = parsePersonnelGradeSelection(trimmed);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    updates: { gradeLevel: parsed.gradeLevel, gradeRank: parsed.gradeRank },
  };
}

/** 폼 값 기준 권한 업데이트 — 미입력·미저장 값은 기존 데이터 유지 */
export function buildPersonnelPermissionUpdates(
  formValue: string,
  row: Pick<PersonnelRow, 'permissionLevel'>,
):
  | {
      ok: true;
      updates: Partial<Pick<PersonnelRow, 'permissionLevel'>> | null;
      level?: PersonnelPermissionLevel;
    }
  | { ok: false; message: string } {
  const trimmed = formValue.trim();
  const hadStoredPermission = row.permissionLevel != null;

  if (!trimmed) {
    if (hadStoredPermission) {
      return { ok: true, updates: { permissionLevel: undefined }, level: undefined };
    }
    return { ok: true, updates: null, level: undefined };
  }

  const level = parsePersonnelPermissionLevel(trimmed);
  if (!level) {
    return { ok: false, message: '권한은 1~10급 중에서 선택해 주세요.' };
  }

  return { ok: true, updates: { permissionLevel: level }, level };
}

/** 폼 값 기준 지위 업데이트 — 미입력·미저장 값은 기존 데이터 유지 */
export function buildPersonnelPositionUpdates(
  formValue: string,
  row: Pick<PersonnelRow, 'position'>,
):
  | { ok: true; updates: Partial<Pick<PersonnelRow, 'position'>> | null }
  | { ok: false; message: string } {
  const trimmed = formValue.trim();
  const hadStoredPosition = Boolean(row.position?.trim());

  if (!trimmed) {
    if (hadStoredPosition) {
      return { ok: true, updates: { position: undefined } };
    }
    return { ok: true, updates: null };
  }

  const normalized = normalizePersonnelPosition(trimmed) ?? trimmed;

  if (!(PERSONNEL_POSITION_LABELS as readonly string[]).includes(normalized)) {
    return { ok: false, message: '지위는 목록에서 선택해 주세요.' };
  }

  return { ok: true, updates: { position: normalized } };
}

export function parsePersonnelGradeLevel(value: string): PersonnelGradeLevel | undefined {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 7) return undefined;
  return level as PersonnelGradeLevel;
}

export function parsePersonnelPermissionLevel(value: string): PersonnelPermissionLevel | undefined {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 10) return undefined;
  return level as PersonnelPermissionLevel;
}

export function normalizePersonnelPosition(position?: string): string | undefined {
  const trimmed = position?.trim();
  if (!trimmed) return undefined;
  if (trimmed === '직원') return '팀원';
  return trimmed;
}

export function getPersonnelPositionFormValue(position?: string): string {
  return normalizePersonnelPosition(position) ?? '';
}

export function formatPersonnelGradeCell(row: PersonnelRow): string {
  if (row.gradeRank) return row.gradeRank;
  if (row.gradeLevel) return `${row.gradeLevel}급`;
  return '-';
}

export function formatPersonnelPositionCell(row: PersonnelRow): string {
  return normalizePersonnelPosition(row.position) ?? '-';
}

export function formatPersonnelPermissionCell(row: PersonnelRow): string {
  if (row.permissionLevel) return `${row.permissionLevel}급`;
  return '-';
}

/** @deprecated LEGACY_EXECUTIVE_DIVISION_FILTER — div-exec 로 통합 */
export const EXECUTIVE_DIVISION_FILTER = LEGACY_EXECUTIVE_DIVISION_FILTER;

export interface PersonnelFilterFieldState {
  keyword: string;
  selected: string[];
}

export interface PersonnelFilters {
  division: PersonnelFilterFieldState;
  team: PersonnelFilterFieldState;
  person: PersonnelFilterFieldState;
}

export type PersonnelFilterKey = keyof PersonnelFilters;

export interface PersonnelFilterOption {
  value: string;
  label: string;
  chipLabel?: string;
}

export const EMPTY_PERSONNEL_FILTERS: PersonnelFilters = {
  division: { keyword: '', selected: [] },
  team: { keyword: '', selected: [] },
  person: { keyword: '', selected: [] },
};

interface FieldPredicate {
  active: boolean;
  selectedSet: Set<string>;
  keyword: string;
}

function buildFieldPredicate(field: PersonnelFilterFieldState): FieldPredicate {
  return {
    active: field.selected.length > 0 || field.keyword.trim().length > 0,
    selectedSet: new Set(field.selected),
    keyword: field.keyword.trim().toLowerCase(),
  };
}

function matchesValueAndLabel(
  value: string,
  label: string,
  predicate: FieldPredicate,
): boolean {
  if (!predicate.active) return true;

  const hasSelected = predicate.selectedSet.size > 0;
  const hasKeyword = predicate.keyword.length > 0;
  const selectedMatch = hasSelected && predicate.selectedSet.has(value);
  const keywordMatch =
    hasKeyword &&
    (label.toLowerCase().includes(predicate.keyword) ||
      value.toLowerCase().includes(predicate.keyword));

  if (hasSelected && hasKeyword) return selectedMatch && keywordMatch;
  if (hasSelected) return selectedMatch;
  return keywordMatch;
}

function resolveExecutiveDivisionId(row: PersonnelRow): string {
  if (row.divisionId) return row.divisionId;
  return EXECUTIVE_OFFICE_DIVISION_ID;
}

function resolveExecutiveTeamId(row: PersonnelRow): string | undefined {
  if (row.teamId) return row.teamId;
  return PERSONNEL_TEAM_NONE_VALUE;
}

function getRowDivisionValue(row: PersonnelRow): string {
  if (row.kind === 'executive') {
    return resolveExecutiveDivisionId(row);
  }
  return row.divisionId ?? '';
}

function getRowDivisionLabel(row: PersonnelRow): string {
  if (row.kind === 'executive') {
    if (row.divisionName && row.divisionName !== '경영관리') {
      return row.divisionName;
    }
    return EXECUTIVE_OFFICE_DIVISION_NAME;
  }
  return row.divisionName;
}

function getRowTeamValue(row: PersonnelRow): string {
  if (row.kind === 'division_head') {
    return row.teamId ?? PERSONNEL_TEAM_NONE_VALUE;
  }
  if (row.kind === 'executive') {
    return resolveExecutiveTeamId(row) ?? '';
  }
  return row.teamId ?? '';
}

function getRowTeamLabel(row: PersonnelRow): string {
  if (row.kind === 'division_head' && !row.teamId) {
    return '없음';
  }
  if (row.kind === 'executive' && !row.teamId) {
    return '없음';
  }
  return row.teamName;
}

function getRowPersonLabel(row: PersonnelRow): string {
  return `${row.name} · ${row.rank}`;
}

export function isPersonnelFilterActive(field: PersonnelFilterFieldState): boolean {
  return field.selected.length > 0 || field.keyword.trim().length > 0;
}

export function divisionFilterTargetsExecutive(filters: PersonnelFilters): boolean {
  const { division } = filters;
  return division.selected.some(
    (value) =>
      value === EXECUTIVE_OFFICE_DIVISION_ID ||
      value === LEGACY_EXECUTIVE_DIVISION_FILTER,
  );
}

export function getPersonnelDivisionFilterOptions(divisions: Division[]): PersonnelFilterOption[] {
  const options = divisions.map((division) => ({ value: division.id, label: division.name }));
  if (options.some((option) => option.value === EXECUTIVE_OFFICE_DIVISION_ID)) {
    return options;
  }
  return [
    { value: EXECUTIVE_OFFICE_DIVISION_ID, label: EXECUTIVE_OFFICE_DIVISION_NAME },
    ...options,
  ];
}

export function getScopedTeamFilterOptions(
  teams: Team[],
  divisions: Division[],
  filters: PersonnelFilters,
): PersonnelFilterOption[] {
  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));
  const divisionPredicate = buildFieldPredicate({
    ...filters.division,
    selected: filters.division.selected.map(normalizePersonnelDivisionFilterValue),
  });

  let scopedTeams = teams;
  if (divisionPredicate.active) {
    scopedTeams = scopedTeams.filter((team) => {
      const divisionName = divisionNameById.get(team.divisionId) ?? '';
      return matchesValueAndLabel(team.divisionId, divisionName, divisionPredicate);
    });
  }

  const teamOptions = scopedTeams.map((team) => ({
    value: team.id,
    label: team.name,
  }));

  if (
    divisionFilterTargetsExecutive(filters) &&
    !teamOptions.some((option) => option.value === EXECUTIVE_OFFICE_TEAM_ID)
  ) {
    return [
      { value: EXECUTIVE_OFFICE_TEAM_ID, label: EXECUTIVE_OFFICE_TEAM_NAME },
      ...teamOptions,
    ];
  }

  return teamOptions;
}

export function getScopedPersonFilterOptions(
  rows: PersonnelRow[],
  filters: PersonnelFilters,
): PersonnelFilterOption[] {
  const divisionPredicate = buildFieldPredicate(filters.division);
  const teamPredicate = buildFieldPredicate(filters.team);

  const scopedRows = rows.filter((row) => {
    if (
      divisionPredicate.active &&
      !matchesValueAndLabel(
        getRowDivisionValue(row),
        getRowDivisionLabel(row),
        divisionPredicate,
      )
    ) {
      return false;
    }

    if (teamPredicate.active) {
      const teamValue = getRowTeamValue(row);
      const teamLabel = getRowTeamLabel(row);
      if (
        row.kind !== 'division_head' &&
        row.kind !== 'executive' &&
        !row.teamId &&
        teamValue !== PERSONNEL_TEAM_NONE_VALUE
      ) {
        return false;
      }
      if (!teamValue && row.kind !== 'executive') {
        return false;
      }
      if (!matchesValueAndLabel(teamValue, teamLabel, teamPredicate)) {
        return false;
      }
    }

    return true;
  });

  return scopedRows.map((row) => ({
    value: row.id,
    label: getRowPersonLabel(row),
  }));
}

export function prunePersonnelFilters(
  filters: PersonnelFilters,
  divisions: Division[],
  teams: Team[],
  rows: PersonnelRow[],
): PersonnelFilters {
  const teamOptions = new Set(
    getScopedTeamFilterOptions(teams, divisions, filters).map((option) => option.value),
  );
  const personOptions = new Set(
    getScopedPersonFilterOptions(rows, filters).map((option) => option.value),
  );

  return {
    division: {
      keyword: filters.division.keyword,
      selected: filters.division.selected
        .map(normalizePersonnelDivisionFilterValue)
        .filter((value) => value !== LEGACY_EXECUTIVE_DIVISION_FILTER),
    },
    team: {
      keyword: filters.team.keyword,
      selected: filters.team.selected.filter((value) => teamOptions.has(value)),
    },
    person: {
      keyword: filters.person.keyword,
      selected: filters.person.selected.filter((value) => personOptions.has(value)),
    },
  };
}

export function filterPersonnelRows(rows: PersonnelRow[], filters: PersonnelFilters): PersonnelRow[] {
  const divisionPredicate = buildFieldPredicate({
    ...filters.division,
    selected: filters.division.selected.map(normalizePersonnelDivisionFilterValue),
  });
  const teamPredicate = buildFieldPredicate(filters.team);
  const personPredicate = buildFieldPredicate(filters.person);

  return rows.filter((row) => {
    if (
      divisionPredicate.active &&
      !matchesValueAndLabel(
        getRowDivisionValue(row),
        getRowDivisionLabel(row),
        divisionPredicate,
      )
    ) {
      return false;
    }

    if (teamPredicate.active) {
      const teamValue = getRowTeamValue(row);
      const teamLabel = getRowTeamLabel(row);
      if (
        row.kind !== 'division_head' &&
        row.kind !== 'executive' &&
        !row.teamId &&
        teamValue !== PERSONNEL_TEAM_NONE_VALUE
      ) {
        return false;
      }
      if (!matchesValueAndLabel(teamValue, teamLabel, teamPredicate)) {
        return false;
      }
    }

    if (personPredicate.active) {
      const personLabel = getRowPersonLabel(row);
      const nameMatch = matchesValueAndLabel(row.id, personLabel, personPredicate);
      const altMatch = matchesValueAndLabel(row.name, personLabel, personPredicate);
      if (!nameMatch && !altMatch) return false;
    }

    return true;
  });
}

export function filterDivisionEntities(
  divisions: Division[],
  teams: Team[],
  filters: PersonnelFilters,
): Division[] {
  const divisionPredicate = buildFieldPredicate(filters.division);
  const teamPredicate = buildFieldPredicate(filters.team);
  const personPredicate = buildFieldPredicate(filters.person);

  return divisions.filter((division) => {
    if (
      divisionPredicate.active &&
      !matchesValueAndLabel(division.id, division.name, divisionPredicate)
    ) {
      return false;
    }

    if (teamPredicate.active) {
      const relatedTeams = teams.filter((team) => team.divisionId === division.id);
      if (!relatedTeams.some((team) => matchesValueAndLabel(team.id, team.name, teamPredicate))) {
        return false;
      }
    }

    if (personPredicate.active) {
      const headLabel = `${division.headName ?? ''} · ${division.headRank ?? ''}`;
      if (
        !matchesValueAndLabel(division.headName ?? division.id, headLabel, personPredicate) &&
        !matchesValueAndLabel(division.id, division.name, personPredicate)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function filterTeamEntities(
  teams: Team[],
  divisions: Division[],
  filters: PersonnelFilters,
): Team[] {
  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));
  const divisionPredicate = buildFieldPredicate({
    ...filters.division,
    selected: filters.division.selected.map(normalizePersonnelDivisionFilterValue),
  });
  const teamPredicate = buildFieldPredicate(filters.team);
  const personPredicate = buildFieldPredicate(filters.person);

  return teams.filter((team) => {
    const divisionName = divisionNameById.get(team.divisionId) ?? '';
    const teamLabel = `${divisionName} · ${team.name}`;

    if (
      divisionPredicate.active &&
      !matchesValueAndLabel(team.divisionId, divisionName, divisionPredicate)
    ) {
      return false;
    }

    if (teamPredicate.active && !matchesValueAndLabel(team.id, teamLabel, teamPredicate)) {
      return false;
    }

    if (personPredicate.active) {
      const headLabel = `${team.headName ?? ''} · ${team.headRank ?? ''}`;
      if (
        !matchesValueAndLabel(team.headName ?? team.id, headLabel, personPredicate) &&
        !matchesValueAndLabel(team.id, teamLabel, personPredicate)
      ) {
        return false;
      }
    }

    return true;
  });
}

function normalizeName(value?: string): string {
  return value?.trim() ?? '';
}

function isDuplicateDivisionHead(division: Division, employees: Employee[]): boolean {
  const headName = normalizeName(division.headName);
  if (!headName) return true;
  return employees.some(
    (employee) =>
      employee.divisionId === division.id && normalizeName(employee.name) === headName,
  );
}

function isDuplicateTeamHead(team: Team, employees: Employee[]): boolean {
  const headName = normalizeName(team.headName);
  if (!headName) return true;
  return employees.some(
    (employee) => employee.teamId === team.id && normalizeName(employee.name) === headName,
  );
}

export function buildPersonnelRows(
  executives: ExecutiveAdmin[],
  employees: Employee[],
  divisions: Division[],
  teams: Team[],
): PersonnelRow[] {
  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  const executiveRows: PersonnelRow[] = executives.map((admin) => {
    const divisionId = admin.divisionId ?? EXECUTIVE_OFFICE_DIVISION_ID;
    const teamId = admin.teamId;

    return {
      id: admin.id,
      kind: 'executive',
      name: admin.name,
      gradeLevel: admin.gradeLevel,
      gradeRank: admin.gradeRank,
      rank: admin.rank,
      position: admin.position,
      permissionLevel: admin.permissionLevel,
      divisionId,
      teamId,
      divisionName: divisionNameById.get(divisionId) ?? EXECUTIVE_OFFICE_DIVISION_NAME,
      teamName: teamId ? (teamNameById.get(teamId) ?? '-') : '없음',
    };
  });

  const employeeRows: PersonnelRow[] = employees.map((employee) => ({
    id: employee.id,
    kind: 'employee',
    name: employee.name,
    gradeLevel: employee.gradeLevel,
    gradeRank: employee.gradeRank,
    rank: employee.role,
    position: employee.position,
    permissionLevel: employee.permissionLevel,
    divisionName: employee.divisionName,
    teamName: employee.teamId ? employee.teamName : '없음',
    divisionId: employee.divisionId,
    teamId: employee.teamId || undefined,
  }));

  const divisionHeadRows: PersonnelRow[] = divisions
    .filter((division) => normalizeName(division.headName))
    .filter((division) => !isDuplicateDivisionHead(division, employees))
    .map((division) => ({
      id: `div-head-${division.id}`,
      kind: 'division_head',
      name: division.headName!,
      gradeLevel: division.headGradeLevel,
      gradeRank: division.headGradeRank,
      rank: division.headRank ?? '본부장',
      position: division.headPosition,
      permissionLevel: division.headPermissionLevel,
      divisionName: division.name,
      teamName: '없음',
      divisionId: division.id,
    }));

  const teamHeadRows: PersonnelRow[] = teams
    .filter((team) => normalizeName(team.headName))
    .filter((team) => !isDuplicateTeamHead(team, employees))
    .map((team) => ({
      id: `team-head-${team.id}`,
      kind: 'team_head',
      name: team.headName!,
      gradeLevel: team.headGradeLevel,
      gradeRank: team.headGradeRank,
      rank: team.headRank ?? '팀장',
      position: team.headPosition,
      permissionLevel: team.headPermissionLevel,
      divisionName: divisionNameById.get(team.divisionId) ?? '-',
      teamName: team.name,
      divisionId: team.divisionId,
      teamId: team.id,
    }));

  return [...executiveRows, ...divisionHeadRows, ...teamHeadRows, ...employeeRows].sort(
    (a, b) => a.name.localeCompare(b.name, 'ko'),
  );
}

export function getTeamsForDivision(teams: Team[], divisionId: string): Team[] {
  if (!divisionId) return teams;
  return teams.filter((team) => team.divisionId === divisionId);
}

export function getPersonnelDivisionOptions(divisions: Division[]) {
  return getPersonnelDivisionFilterOptions(divisions);
}

export function getDivisionOptions(divisions: Division[]) {
  return divisions.map((division) => ({ value: division.id, label: division.name }));
}

export function getTeamOptions(teams: Team[], divisionId: string) {
  return getTeamsForDivision(teams, divisionId).map((team) => ({
    value: team.id,
    label: team.name,
  }));
}

export function isPersonnelOrgAffiliationEditable(kind: PersonnelKind): boolean {
  return (
    kind === 'employee' ||
    kind === 'executive' ||
    kind === 'division_head' ||
    kind === 'team_head'
  );
}

export function personnelEditorIncludesTeamNone(_kind: PersonnelKind): boolean {
  return true;
}

export function getPersonnelTeamFormValue(
  row: Pick<PersonnelRow, 'kind' | 'teamId'>,
): string {
  if (!row.teamId) {
    return PERSONNEL_TEAM_NONE_VALUE;
  }
  return row.teamId;
}

export function getPersonnelEditorTeamSelectOptions(
  teams: Team[],
  divisionId: string,
  options: { includeNone: boolean; currentTeamId?: string },
): Array<{ value: string; label: string }> {
  let teamOptions = getTeamOptions(teams, divisionId);

  if (
    options.currentTeamId &&
    options.currentTeamId !== PERSONNEL_TEAM_NONE_VALUE &&
    !teamOptions.some((option) => option.value === options.currentTeamId)
  ) {
    const currentTeam = teams.find((team) => team.id === options.currentTeamId);
    if (currentTeam) {
      teamOptions = [{ value: currentTeam.id, label: currentTeam.name }, ...teamOptions];
    }
  }

  const prefix: Array<{ value: string; label: string }> = [{ value: '', label: '선택' }];
  if (options.includeNone) {
    prefix.push({ value: PERSONNEL_TEAM_NONE_VALUE, label: '없음' });
  }

  return [...prefix, ...teamOptions];
}

export function parseDivisionHeadRowId(rowId: string): string | null {
  return rowId.startsWith('div-head-') ? rowId.slice('div-head-'.length) : null;
}

export function parseTeamHeadRowId(rowId: string): string | null {
  return rowId.startsWith('team-head-') ? rowId.slice('team-head-'.length) : null;
}

export interface PersonnelCoverageReport {
  ok: boolean;
  missing: string[];
  rowCount: number;
}

/** 조직 원본 데이터 대비 검색 리스트 포함 여부 검증 */
export function verifyPersonnelCoverage(
  executives: ExecutiveAdmin[],
  employees: Employee[],
  divisions: Division[],
  teams: Team[],
): PersonnelCoverageReport {
  const rows = buildPersonnelRows(executives, employees, divisions, teams);
  const missing: string[] = [];

  const hasPerson = (name: string) =>
    rows.some((row) => normalizeName(row.name) === normalizeName(name));

  for (const admin of executives) {
    if (!hasPerson(admin.name)) {
      missing.push(`경영진: ${admin.name}`);
    }
  }

  for (const division of divisions) {
    const headName = normalizeName(division.headName);
    if (headName && !hasPerson(headName)) {
      missing.push(`본부장(${division.name}): ${headName}`);
    }
  }

  for (const team of teams) {
    const headName = normalizeName(team.headName);
    if (headName && !hasPerson(headName)) {
      missing.push(`팀장(${team.name}): ${headName}`);
    }
  }

  for (const employee of employees) {
    if (!hasPerson(employee.name)) {
      missing.push(`팀원: ${employee.name}`);
    }
  }

  return { ok: missing.length === 0, missing, rowCount: rows.length };
}
