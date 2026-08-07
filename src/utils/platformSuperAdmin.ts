import type { Employee, WebAccessRole } from '@/types';
import type { PersonnelRow } from '@/utils/personnelSearch';

/** S-NEXUS 플랫폼 통합관리자 — accessRole 개발자 고정 */
export const PLATFORM_SUPER_ADMIN_NAME = '서석민';

export function isPlatformSuperAdminIdentity(name: string, id?: string): boolean {
  const trimmed = name.trim();
  if (trimmed === PLATFORM_SUPER_ADMIN_NAME) return true;
  if (id === 'emp-admin') return true;
  if (id?.includes('서석민')) return true;
  return false;
}

export function isPlatformSuperAdminPerson(
  person: Pick<PersonnelRow, 'name' | 'id'>,
): boolean {
  return isPlatformSuperAdminIdentity(person.name, person.id);
}

export function resolvePlatformSuperAdminAccessRole(
  name: string,
  id: string | undefined,
  accessRole: WebAccessRole | undefined,
): WebAccessRole | undefined {
  if (!isPlatformSuperAdminIdentity(name, id)) return accessRole;
  return '개발자';
}

export function applyPlatformSuperAdminEmployee(employee: Employee): Employee {
  if (!isPlatformSuperAdminIdentity(employee.name, employee.id)) return employee;
  return { ...employee, accessRole: '개발자' };
}

export function applyPlatformSuperAdminEmployees(employees: Employee[]): Employee[] {
  return employees.map(applyPlatformSuperAdminEmployee);
}

export const PLATFORM_SUPER_ADMIN_PERMISSION_LABEL = '개발자 (통합관리)';
