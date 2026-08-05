import type { Division, Team } from '@/types';

export const EXECUTIVE_OFFICE_DIVISION_ID = 'div-exec';
export const EXECUTIVE_OFFICE_DIVISION_NAME = '임원실';
export const EXECUTIVE_OFFICE_TEAM_ID = 'team-div-exec-임원실';
export const EXECUTIVE_OFFICE_TEAM_NAME = '임원실';

/** @deprecated div-exec 사용 */
export const LEGACY_EXECUTIVE_DIVISION_FILTER = '__executive__';

/** 임원실 사업본부·팀이 없으면 추가 (기존 조직·인원 데이터는 변경하지 않음) */
export function ensureExecutiveOfficeOrg<T extends { divisions: Division[]; teams: Team[] }>(
  org: T,
): T {
  let divisions = org.divisions;
  let teams = org.teams;

  let executiveDivision = divisions.find(
    (division) =>
      division.id === EXECUTIVE_OFFICE_DIVISION_ID ||
      division.name === EXECUTIVE_OFFICE_DIVISION_NAME,
  );

  if (!executiveDivision) {
    executiveDivision = {
      id: EXECUTIVE_OFFICE_DIVISION_ID,
      name: EXECUTIVE_OFFICE_DIVISION_NAME,
    };
    divisions = [...divisions, executiveDivision];
  }

  const divisionId = executiveDivision.id;
  const hasExecutiveTeam = teams.some(
    (team) =>
      team.id === EXECUTIVE_OFFICE_TEAM_ID ||
      (team.name === EXECUTIVE_OFFICE_TEAM_NAME && team.divisionId === divisionId),
  );

  if (!hasExecutiveTeam) {
    teams = [
      ...teams,
      {
        id: EXECUTIVE_OFFICE_TEAM_ID,
        name: EXECUTIVE_OFFICE_TEAM_NAME,
        divisionId,
      },
    ];
  }

  if (divisions === org.divisions && teams === org.teams) {
    return org;
  }

  return { ...org, divisions, teams };
}

export function normalizePersonnelDivisionFilterValue(value: string): string {
  if (value === LEGACY_EXECUTIVE_DIVISION_FILTER) {
    return EXECUTIVE_OFFICE_DIVISION_ID;
  }
  return value;
}
