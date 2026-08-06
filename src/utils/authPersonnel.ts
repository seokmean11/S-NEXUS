import type { Division, Employee, ExecutiveAdmin, Team } from '@/types';
import type { LoginFailure, LoginResult, PersonnelAuthMap } from '@/types/auth';
import { DEFAULT_LOGIN_PIN } from '@/types/auth';
import {
  buildPersonnelRows,
  type PersonnelRow,
} from '@/utils/personnelSearch';
import { inferAccessRoleFromEmployee } from '@/utils/webAccessRole';

export function findPersonnelByName(
  name: string,
  executives: ExecutiveAdmin[],
  employees: Employee[],
  divisions: Division[],
  teams: Team[],
): PersonnelRow[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  return buildPersonnelRows(executives, employees, divisions, teams).filter(
    (row) => row.name.trim() === trimmed,
  );
}

export function findPersonnelById(
  personId: string,
  executives: ExecutiveAdmin[],
  employees: Employee[],
  divisions: Division[],
  teams: Team[],
): PersonnelRow | undefined {
  return buildPersonnelRows(executives, employees, divisions, teams).find(
    (row) => row.id === personId,
  );
}

export function getPersonnelAuthRecord(
  authMap: PersonnelAuthMap | undefined,
  personId: string,
): { pin: string; pinChanged: boolean } {
  const record = authMap?.[personId];
  return {
    pin: record?.pin ?? DEFAULT_LOGIN_PIN,
    pinChanged: record?.pinChanged ?? false,
  };
}

export function isValidLoginPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function mustChangePassword(
  authMap: PersonnelAuthMap | undefined,
  personId: string,
  submittedPin: string,
): boolean {
  const { pin, pinChanged } = getPersonnelAuthRecord(authMap, personId);
  return !pinChanged && submittedPin === pin && pin === DEFAULT_LOGIN_PIN;
}

export function validateLogin(
  name: string,
  pin: string,
  authMap: PersonnelAuthMap | undefined,
  executives: ExecutiveAdmin[],
  employees: Employee[],
  divisions: Division[],
  teams: Team[],
): LoginResult | LoginFailure {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, message: '이름을 입력해 주세요.' };
  }
  if (!isValidLoginPin(pin)) {
    return { ok: false, message: '비밀번호는 4자리 숫자입니다.' };
  }

  const matches = findPersonnelByName(trimmedName, executives, employees, divisions, teams);
  if (matches.length === 0) {
    return { ok: false, message: '등록되지 않은 사용자입니다. 조직관리에서 인원을 확인해 주세요.' };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: '동명이인이 있습니다. 관리자에게 문의해 주세요.',
    };
  }

  const person = matches[0]!;
  const { pin: storedPin } = getPersonnelAuthRecord(authMap, person.id);
  if (pin !== storedPin) {
    return { ok: false, message: '비밀번호가 올바르지 않습니다.' };
  }

  return {
    ok: true,
    session: {
      personId: person.id,
      personKind: person.kind,
      name: person.name,
      loggedInAt: new Date().toISOString(),
    },
    mustChangePassword: mustChangePassword(authMap, person.id, pin),
    person,
  };
}

export function isDeveloperPerson(
  person: PersonnelRow,
  employees: Employee[],
  executives: ExecutiveAdmin[],
): boolean {
  if (person.kind === 'employee') {
    const employee = employees.find((item) => item.id === person.id);
    if (!employee) return false;
    const accessRole = employee.accessRole ?? inferAccessRoleFromEmployee(employee);
    return accessRole === '개발자';
  }
  if (person.kind === 'executive') {
    const admin = executives.find((item) => item.id === person.id);
    return admin?.accessRole === '개발자';
  }
  return false;
}

export function resolvePersonAccessRole(
  person: PersonnelRow,
  employees: Employee[],
  executives: ExecutiveAdmin[],
): import('@/types').WebAccessRole {
  if (person.kind === 'employee') {
    const employee = employees.find((item) => item.id === person.id);
    if (employee) {
      return employee.accessRole ?? inferAccessRoleFromEmployee(employee);
    }
  }
  if (person.kind === 'executive') {
    const admin = executives.find((item) => item.id === person.id);
    if (admin?.accessRole) return admin.accessRole;
  }
  if (person.kind === 'division_head') return '본부장';
  if (person.kind === 'team_head') return '팀장';
  return '직원';
}

export function resolvePersonOrgIds(
  person: PersonnelRow,
): { userId: string; divisionId?: string; teamId?: string } {
  if (person.kind === 'employee') {
    return {
      userId: person.id,
      divisionId: person.divisionId,
      teamId: person.teamId,
    };
  }
  if (person.kind === 'executive') {
    return {
      userId: person.id,
      divisionId: person.divisionId,
      teamId: person.teamId,
    };
  }
  if (person.kind === 'division_head') {
    return {
      userId: person.id,
      divisionId: person.divisionId,
    };
  }
  return {
    userId: person.id,
    divisionId: person.divisionId,
    teamId: person.teamId,
  };
}
