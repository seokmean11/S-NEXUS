import type { Division, Employee, ExecutiveOffice, Team } from '@/types';

/** 계열사·별도 법인 조직 (S-NEXUS 대상 외) */
const AFFILIATE_DIVISION_PATTERN = /시공문화|아이스크림미디어/i;

const AFFILIATE_TEAM_PATTERN = /시공문화|아이스크림미디어|^경영관리실$/i;

/** 내선전화표 PDF — 아이스크림미디어(판교 4F) 블록 인원 */
const AFFILIATE_EMPLOYEE_NAMES = new Set([
  '허주환',
  '현준우',
  '김형준',
  '장재영',
  '문희아',
  '윤지예',
  '우해준',
  '이안나',
  '이두연',
  '김효진',
  '노영준',
  '이성준',
  '한정화',
  '박재용',
  '이영미',
  '이정수',
  '최현규',
]);

export interface OrgSnapshot {
  executiveOffice: ExecutiveOffice;
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
}

export function isAffiliateEmployee(name: string): boolean {
  return AFFILIATE_EMPLOYEE_NAMES.has(name);
}

export function filterAffiliateOrg<T extends OrgSnapshot>(org: T): T {
  const excludedDivisionIds = new Set(
    org.divisions.filter((d) => AFFILIATE_DIVISION_PATTERN.test(d.name)).map((d) => d.id),
  );

  const excludedTeamIds = new Set(
    org.teams
      .filter(
        (t) =>
          excludedDivisionIds.has(t.divisionId) || AFFILIATE_TEAM_PATTERN.test(t.name),
      )
      .map((t) => t.id),
  );

  const employees = org.employees.filter(
    (e) =>
      !excludedDivisionIds.has(e.divisionId) &&
      !excludedTeamIds.has(e.teamId) &&
      !AFFILIATE_EMPLOYEE_NAMES.has(e.name),
  );

  const teams = org.teams.filter((t) => !excludedTeamIds.has(t.id));

  const divisions = org.divisions.filter((d) => !excludedDivisionIds.has(d.id));

  const admins = (org.executiveOffice.admins ?? []).filter(
    (admin) => !AFFILIATE_EMPLOYEE_NAMES.has(admin.name),
  );

  return {
    ...org,
    executiveOffice: { admins },
    divisions,
    teams,
    employees,
  };
}

export function countAffiliateRemovals(before: OrgSnapshot, after: OrgSnapshot) {
  return {
    divisions: before.divisions.length - after.divisions.length,
    teams: before.teams.length - after.teams.length,
    employees: before.employees.length - after.employees.length,
    executives: (before.executiveOffice.admins?.length ?? 0) - (after.executiveOffice.admins?.length ?? 0),
  };
}
