import type { Employee, ExecutiveOffice } from '@/types';
import type { OrgSnapshot } from '@/utils/orgAffiliateFilter';
import { inferAccessRoleFromEmployee } from '@/utils/webAccessRole';

const DIV_SELFSTORAGE = 'div-selfstorage';
const TEAM_SELFSTORAGE = 'team-div-selfstorage-셀프스토리지사업팀';
const TEAM_ESTIMATE = 'team-div-in-견적팀';
const TEAM_PRODUCTION = 'team-div-ex-제작연출팀';
const TEAM_BIZ3 = 'team-div-in-사업3팀';

function slugify(value: string): string {
  return value.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function inferAccessRole(rank: string, name: string): Employee['accessRole'] {
  if (name === '서석민') return '개발자';
  if (/본부장|사업실장/.test(rank)) return '본부장';
  if (/회장|부회장|부사장|전무|상무|상무보|감사|사장|대표/.test(rank)) return '경영진';
  if (/^팀장$|^실장$/.test(rank)) return '팀장';
  return '직원';
}

function makeEmployee(
  name: string,
  rank: string,
  divisionId: string,
  divisionName: string,
  teamId: string,
  teamName: string,
): Employee {
  return {
    id: `emp-${slugify(name)}-${slugify(teamName)}`,
    name,
    divisionId,
    divisionName,
    teamId,
    teamName,
    role: rank,
    accessRole: inferAccessRole(rank, name),
  };
}

/** 팀·본부 조합으로 특정 배치만 제거 */
const TEAM_MEMBER_REMOVALS: Array<{ name: string; teamId: string }> = [
  { name: '남경우', teamId: 'team-div-plan-경영지원팀' },
  { name: '박대민', teamId: 'team-div-plan-사업관리팀' },
  { name: '정형철', teamId: 'team-div-os-해외영업팀' },
  { name: '차중호', teamId: 'team-div-ex-전시디자인1팀' },
  { name: '정우중', teamId: 'team-div-ex-전시컨설팅팀' },
  { name: '이용석', teamId: 'team-div-in-인테리어디자인팀' },
  { name: '신상면', teamId: 'team-div-in-인테리어디자인팀' },
  { name: '신강준', teamId: 'team-div-nm-문화기술연구소' },
];

const EXECUTIVE_REMOVALS = new Set(['김빛나']);

const MOVE_TO_SELFSTORAGE = new Set(['박주연', '윤다연', '윤보라', '이우택', '지상민', '최준우']);

const MOVE_TO_ESTIMATE = new Set(['고빛남', '노희태', '김종현']);

const ADD_TO_PRODUCTION: Array<{ name: string; rank: string }> = [
  { name: '이희민', rank: '선임' },
  { name: '유정원', rank: '선임' },
  { name: '최현수', rank: '수석' },
];

const ADD_TO_BIZ3: Array<{ name: string; rank: string }> = [
  { name: '백성민', rank: '책임' },
  { name: '호상열', rank: '책임' },
  { name: '정광열', rank: '선임' },
  { name: '최진욱', rank: '선임' },
  { name: '김선우', rank: '사원' },
  { name: '서혜민', rank: '사원' },
  { name: '송민석', rank: '사원' },
  { name: '조용근', rank: '사원' },
];

function ensureStructure(org: OrgSnapshot): OrgSnapshot {
  const divisions = [...org.divisions];
  const teams = [...org.teams];

  if (!divisions.some((d) => d.id === DIV_SELFSTORAGE)) {
    divisions.push({ id: DIV_SELFSTORAGE, name: '셀프스토리지사업팀' });
  }

  if (!teams.some((t) => t.id === TEAM_SELFSTORAGE)) {
    teams.push({
      id: TEAM_SELFSTORAGE,
      name: '셀프스토리지사업팀',
      divisionId: DIV_SELFSTORAGE,
    });
  }

  if (!teams.some((t) => t.id === TEAM_ESTIMATE)) {
    teams.push({
      id: TEAM_ESTIMATE,
      name: '견적팀',
      divisionId: 'div-in',
    });
  }

  return { ...org, divisions, teams };
}

function shouldRemoveEmployee(employee: Employee): boolean {
  return TEAM_MEMBER_REMOVALS.some(
    (rule) => rule.name === employee.name && rule.teamId === employee.teamId,
  );
}

function reassignEmployee(employee: Employee): Employee | null {
  if (
    employee.teamId === 'team-div-plan-사업관리팀' &&
    MOVE_TO_SELFSTORAGE.has(employee.name)
  ) {
    return makeEmployee(
      employee.name,
      employee.role,
      DIV_SELFSTORAGE,
      '셀프스토리지사업팀',
      TEAM_SELFSTORAGE,
      '셀프스토리지사업팀',
    );
  }

  if (
    employee.teamId === 'team-div-in-인테리어디자인팀' &&
    MOVE_TO_ESTIMATE.has(employee.name)
  ) {
    return makeEmployee(
      employee.name,
      employee.role,
      'div-in',
      '인테리어사업본부',
      TEAM_ESTIMATE,
      '견적팀',
    );
  }

  return employee;
}

function appendMissingEmployees(employees: Employee[]): Employee[] {
  const seen = new Set(employees.map((e) => `${e.name}::${e.teamId}`));
  const next = [...employees];

  for (const { name, rank } of ADD_TO_PRODUCTION) {
    const key = `${name}::${TEAM_PRODUCTION}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(
      makeEmployee(name, rank, 'div-ex', '전시사업본부', TEAM_PRODUCTION, '제작연출팀'),
    );
  }

  for (const { name, rank } of ADD_TO_BIZ3) {
    const key = `${name}::${TEAM_BIZ3}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(makeEmployee(name, rank, 'div-in', '인테리어사업본부', TEAM_BIZ3, '사업3팀'));
  }

  return next;
}

function filterExecutives(office: ExecutiveOffice): ExecutiveOffice {
  const admins = (office.admins ?? []).filter((admin) => !EXECUTIVE_REMOVALS.has(admin.name));
  return { admins };
}

/** 내선연락망 파싱 후 수동 조직 보정 (2026.08 피드백) */
export function applyOrgManualOverrides<T extends OrgSnapshot>(org: T): T {
  const structured = ensureStructure(org);

  let employees = structured.employees
    .filter((employee) => !shouldRemoveEmployee(employee))
    .map((employee) => reassignEmployee(employee))
    .filter((employee): employee is Employee => employee != null);

  employees = appendMissingEmployees(employees);

  employees.sort(
    (a, b) =>
      a.divisionName.localeCompare(b.divisionName, 'ko') ||
      a.teamName.localeCompare(b.teamName, 'ko') ||
      a.name.localeCompare(b.name, 'ko'),
  );

  return {
    ...structured,
    executiveOffice: filterExecutives(structured.executiveOffice),
    employees: employees.map((employee) => ({
      ...employee,
      accessRole: employee.accessRole ?? inferAccessRoleFromEmployee(employee),
    })),
  } as T;
}

export const ORG_MANUAL_OVERRIDE_VERSION = 1;
