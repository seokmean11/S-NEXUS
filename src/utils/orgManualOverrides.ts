import type { Employee, ExecutiveOffice } from '@/types';
import type { OrgSnapshot } from '@/utils/orgAffiliateFilter';
import { isPlatformSuperAdminIdentity } from '@/utils/platformSuperAdmin';
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
  if (isPlatformSuperAdminIdentity(name)) return '개발자';
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
    return {
      ...employee,
      divisionId: DIV_SELFSTORAGE,
      divisionName: '셀프스토리지사업팀',
      teamId: TEAM_SELFSTORAGE,
      teamName: '셀프스토리지사업팀',
    };
  }

  if (
    employee.teamId === 'team-div-in-인테리어디자인팀' &&
    MOVE_TO_ESTIMATE.has(employee.name)
  ) {
    return {
      ...employee,
      divisionId: 'div-in',
      divisionName: '인테리어사업본부',
      teamId: TEAM_ESTIMATE,
      teamName: '견적팀',
    };
  }

  return employee;
}

function mergeEmployeeMetadata(primary: Employee, others: Employee[]): Employee {
  const pool = [primary, ...others.filter((employee) => employee.id !== primary.id)];

  const pick = <K extends keyof Employee>(key: K): Employee[K] | undefined => {
    for (const employee of pool) {
      const value = employee[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return undefined;
  };

  return {
    ...primary,
    gradeLevel: pick('gradeLevel'),
    gradeRank: pick('gradeRank'),
    permissionLevel: pick('permissionLevel'),
    position: pick('position'),
    accessRole: pick('accessRole') ?? primary.accessRole,
    menuPermissions: pick('menuPermissions') ?? primary.menuPermissions,
  };
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

function pickCanonicalEmployee(group: Employee[]): Employee {
  const nonExecDivision = group.filter((employee) => employee.divisionId !== 'div-exec');
  const pool = nonExecDivision.length > 0 ? nonExecDivision : group;
  const teamHead = pool.find(
    (employee) => employee.accessRole === '팀장' || employee.role === '팀장',
  );
  if (teamHead) return teamHead;
  return [...pool].sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko'))[0];
}

/** 경영진·팀 중복 등 동일 이름 직원 레코드는 1건만 유지 */
function deduplicateEmployeesByName(
  employees: Employee[],
  executiveOffice: ExecutiveOffice,
): Employee[] {
  const executiveNames = new Set((executiveOffice.admins ?? []).map((admin) => admin.name));
  const withoutExecutiveDuplicates = employees.filter(
    (employee) => !executiveNames.has(employee.name),
  );

  const byName = new Map<string, Employee[]>();
  for (const employee of withoutExecutiveDuplicates) {
    const group = byName.get(employee.name) ?? [];
    group.push(employee);
    byName.set(employee.name, group);
  }

  const deduped: Employee[] = [];
  for (const group of byName.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    const canonical = pickCanonicalEmployee(group);
    deduped.push(mergeEmployeeMetadata(canonical, group));
  }

  return deduped;
}

export function shouldApplyOrgManualOverrides(manualOverrideVersion?: number): boolean {
  return (manualOverrideVersion ?? 0) < ORG_MANUAL_OVERRIDE_VERSION;
}

/** 내선연락망 파싱 후 수동 조직 보정 (2026.08 피드백) */
export function applyOrgManualOverrides<T extends OrgSnapshot>(org: T): T {
  const structured = ensureStructure(org);
  const executiveOffice = filterExecutives(structured.executiveOffice);

  let employees = structured.employees
    .filter((employee) => !shouldRemoveEmployee(employee))
    .map((employee) => reassignEmployee(employee))
    .filter((employee): employee is Employee => employee != null);

  employees = appendMissingEmployees(employees);
  employees = deduplicateEmployeesByName(employees, executiveOffice);

  employees.sort(
    (a, b) =>
      a.divisionName.localeCompare(b.divisionName, 'ko') ||
      a.teamName.localeCompare(b.teamName, 'ko') ||
      a.name.localeCompare(b.name, 'ko'),
  );

  return {
    ...structured,
    executiveOffice,
    employees: employees.map((employee) => ({
      ...employee,
      accessRole: employee.accessRole ?? inferAccessRoleFromEmployee(employee),
    })),
  } as T;
}

export const ORG_MANUAL_OVERRIDE_VERSION = 3;
