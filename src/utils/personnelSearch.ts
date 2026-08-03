import type { Division, Employee, ExecutiveAdmin, Team, WebAccessRole } from '@/types';
import { inferAccessRoleFromEmployee } from '@/utils/webAccessRole';

export type PersonnelKind = 'executive' | 'employee' | 'division_head' | 'team_head';

export interface PersonnelRow {
  id: string;
  kind: PersonnelKind;
  name: string;
  rank: string;
  accessRole: WebAccessRole;
  divisionName: string;
  teamName: string;
  divisionId?: string;
  teamId?: string;
}

/** 사업본부 필터에서 경영관리 선택값 */
export const EXECUTIVE_DIVISION_FILTER = '__executive__';

export interface PersonnelFilters {
  keyword: string;
  divisionId: string;
  teamId: string;
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
  const executiveRows: PersonnelRow[] = executives.map((admin) => ({
    id: admin.id,
    kind: 'executive',
    name: admin.name,
    rank: admin.rank,
    accessRole: admin.accessRole ?? '경영진',
    divisionName: '경영관리',
    teamName: '-',
  }));

  const employeeRows: PersonnelRow[] = employees.map((employee) => ({
    id: employee.id,
    kind: 'employee',
    name: employee.name,
    rank: employee.role,
    accessRole: employee.accessRole ?? inferAccessRoleFromEmployee(employee),
    divisionName: employee.divisionName,
    teamName: employee.teamName,
    divisionId: employee.divisionId,
    teamId: employee.teamId,
  }));

  const divisionHeadRows: PersonnelRow[] = divisions
    .filter((division) => normalizeName(division.headName))
    .filter((division) => !isDuplicateDivisionHead(division, employees))
    .map((division) => ({
      id: `div-head-${division.id}`,
      kind: 'division_head',
      name: division.headName!,
      rank: division.headRank ?? '본부장',
      accessRole: '본부장',
      divisionName: division.name,
      teamName: '-',
      divisionId: division.id,
    }));

  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));

  const teamHeadRows: PersonnelRow[] = teams
    .filter((team) => normalizeName(team.headName))
    .filter((team) => !isDuplicateTeamHead(team, employees))
    .map((team) => ({
      id: `team-head-${team.id}`,
      kind: 'team_head',
      name: team.headName!,
      rank: team.headRank ?? '팀장',
      accessRole: '팀장',
      divisionName: divisionNameById.get(team.divisionId) ?? '-',
      teamName: team.name,
      divisionId: team.divisionId,
      teamId: team.id,
    }));

  return [...executiveRows, ...divisionHeadRows, ...teamHeadRows, ...employeeRows].sort(
    (a, b) => a.name.localeCompare(b.name, 'ko'),
  );
}

function matchesKeyword(row: PersonnelRow, keyword: string): boolean {
  if (!keyword) return true;

  const haystack = [
    row.name,
    row.rank,
    row.accessRole,
    row.divisionName,
    row.teamName,
    row.kind === 'division_head' ? '본부장 사업본부장' : '',
    row.kind === 'team_head' ? '팀장' : '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword);
}

export function filterPersonnelRows(rows: PersonnelRow[], filters: PersonnelFilters): PersonnelRow[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.divisionId === EXECUTIVE_DIVISION_FILTER) {
      if (row.kind !== 'executive') return false;
    } else if (filters.divisionId) {
      if (row.kind === 'executive') return false;
      if (row.divisionId !== filters.divisionId) return false;
    }

    if (filters.teamId) {
      if (row.kind === 'executive' || row.kind === 'division_head') return false;
      if (row.teamId !== filters.teamId) return false;
    }

    return matchesKeyword(row, keyword);
  });
}

export function getTeamsForDivision(teams: Team[], divisionId: string): Team[] {
  if (!divisionId) return teams;
  return teams.filter((team) => team.divisionId === divisionId);
}

export function getPersonnelDivisionOptions(divisions: Division[]) {
  return [
    { value: EXECUTIVE_DIVISION_FILTER, label: '경영관리' },
    ...divisions.map((division) => ({ value: division.id, label: division.name })),
  ];
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
