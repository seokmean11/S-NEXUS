import type { Employee, ExecutiveAdmin, Role, WebAccessRole } from '@/types';

export const WEB_ACCESS_ROLE_OPTIONS: { value: WebAccessRole; label: string }[] = [
  { value: '직원', label: '직원' },
  { value: '팀장', label: '팀장' },
  { value: '본부장', label: '본부장' },
  { value: '경영진', label: '경영진' },
  { value: '개발자', label: '개발자' },
];

export function isWebAccessRole(value?: string): value is WebAccessRole {
  return WEB_ACCESS_ROLE_OPTIONS.some((option) => option.value === value);
}

export function inferAccessRoleFromEmployee(employee: Pick<Employee, 'id' | 'role'>): WebAccessRole {
  if (employee.id === 'emp-admin' || employee.role.includes('개발')) return '개발자';
  if (employee.role.includes('본부장')) return '본부장';
  if (employee.role.includes('팀장')) return '팀장';
  if (employee.role.includes('경영')) return '경영진';
  return '직원';
}

export function normalizeEmployeeAccessRole(employee: Employee): Employee {
  return {
    ...employee,
    accessRole: employee.accessRole ?? inferAccessRoleFromEmployee(employee),
  };
}

export function normalizeExecutiveAccessRole(admin: ExecutiveAdmin): ExecutiveAdmin {
  return {
    ...admin,
    accessRole: admin.accessRole ?? '경영진',
  };
}

export function webAccessRoleToSystemRole(accessRole: WebAccessRole): Role {
  switch (accessRole) {
    case '개발자':
      return 'dev_admin';
    case '경영진':
      return 'c_level';
    case '본부장':
      return 'division_head';
    case '팀장':
      return 'team_manager';
    case '직원':
    default:
      return 'team_member';
  }
}

export function accessRoleBadgeClass(accessRole: WebAccessRole): string {
  switch (accessRole) {
    case '개발자':
      return 'access-role-badge--dev';
    case '경영진':
      return 'access-role-badge--exec';
    case '본부장':
      return 'access-role-badge--division';
    case '팀장':
      return 'access-role-badge--team';
    case '직원':
    default:
      return 'access-role-badge--member';
  }
}
