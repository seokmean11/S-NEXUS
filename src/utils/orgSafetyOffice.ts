import type { Division, Team } from '@/types';

export const SAFETY_DIVISION_ID = 'div-safety';
export const SAFETY_DIVISION_NAME = '안전관리실';
export const SAFETY_TEAM_ID = 'team-div-safety-안전관리실';
export const SAFETY_TEAM_NAME = '안전관리실';

/** 안전관리실 사업본부·팀이 없으면 추가 (기존 조직·인원 데이터는 변경하지 않음) */
export function ensureSafetyManagementOrg<T extends { divisions: Division[]; teams: Team[] }>(
  org: T,
): T {
  let divisions = org.divisions;
  let teams = org.teams;

  let safetyDivision = divisions.find(
    (division) =>
      division.id === SAFETY_DIVISION_ID || division.name === SAFETY_DIVISION_NAME,
  );

  if (!safetyDivision) {
    safetyDivision = { id: SAFETY_DIVISION_ID, name: SAFETY_DIVISION_NAME };
    divisions = [...divisions, safetyDivision];
  }

  const divisionId = safetyDivision.id;
  const hasSafetyTeam = teams.some(
    (team) =>
      team.id === SAFETY_TEAM_ID ||
      (team.name === SAFETY_TEAM_NAME && team.divisionId === divisionId),
  );

  if (!hasSafetyTeam) {
    teams = [
      ...teams,
      {
        id: SAFETY_TEAM_ID,
        name: SAFETY_TEAM_NAME,
        divisionId,
      },
    ];
  }

  if (divisions === org.divisions && teams === org.teams) {
    return org;
  }

  return { ...org, divisions, teams };
}
