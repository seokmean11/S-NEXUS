import type { PersonnelAuthMap, PersonnelAuthRecord } from '@/types/auth';
import { DEFAULT_LOGIN_PIN } from '@/types/auth';
import type { Employee, ExecutiveAdmin } from '@/types';
import type { PersonnelMenuPermissions } from '@/types/menuPermissions';

export function withPersonnelAuthMenuPermissions(
  record: PersonnelAuthRecord | undefined,
  menuPermissions: PersonnelMenuPermissions | undefined,
): PersonnelAuthRecord {
  return {
    pin: record?.pin ?? DEFAULT_LOGIN_PIN,
    pinChanged: record?.pinChanged ?? false,
    menuPermissions: menuPermissions ?? record?.menuPermissions,
  };
}

export function applyPersonnelAuthToEmployees(
  employees: Employee[],
  personnelAuth: PersonnelAuthMap | undefined,
): Employee[] {
  if (!personnelAuth) return employees;

  return employees.map((employee) => {
    const authMenu = personnelAuth[employee.id]?.menuPermissions;
    if (!authMenu) return employee;

    return {
      ...employee,
      menuPermissions: employee.menuPermissions ?? authMenu,
    };
  });
}

export function applyPersonnelAuthToExecutives(
  admins: ExecutiveAdmin[],
  personnelAuth: PersonnelAuthMap | undefined,
): ExecutiveAdmin[] {
  if (!personnelAuth) return admins;

  return admins.map((admin) => {
    const authMenu = personnelAuth[admin.id]?.menuPermissions;
    if (!authMenu) return admin;

    return {
      ...admin,
      menuPermissions: admin.menuPermissions ?? authMenu,
    };
  });
}

export function backfillPersonnelAuthMenuPermissions(
  employees: Employee[],
  admins: ExecutiveAdmin[],
  personnelAuth: PersonnelAuthMap,
): PersonnelAuthMap {
  let next = { ...personnelAuth };

  for (const employee of employees) {
    if (!employee.menuPermissions) continue;
    const existing = next[employee.id];
    if (existing?.menuPermissions) continue;
    next = {
      ...next,
      [employee.id]: withPersonnelAuthMenuPermissions(existing, employee.menuPermissions),
    };
  }

  for (const admin of admins) {
    if (!admin.menuPermissions) continue;
    const existing = next[admin.id];
    if (existing?.menuPermissions) continue;
    next = {
      ...next,
      [admin.id]: withPersonnelAuthMenuPermissions(existing, admin.menuPermissions),
    };
  }

  return next;
}

export function resolvePersonMenuPermissions(
  personId: string,
  rowMenuPermissions: PersonnelMenuPermissions | undefined,
  personnelAuth: PersonnelAuthMap | undefined,
): PersonnelMenuPermissions | undefined {
  return rowMenuPermissions ?? personnelAuth?.[personId]?.menuPermissions;
}
