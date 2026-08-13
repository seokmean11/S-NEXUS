import type { PersonnelMenuPermissionKey, PersonnelMenuPermissions } from '@/types/menuPermissions';
import { isMenuPermissionEnabled } from '@/utils/menuPermissions';

/** 조직관리에서 부여하지 않은 메뉴 — 일반 사용자 기본 차단 */
const RESTRICTED_PATH_PREFIXES = ['/analysis', '/misc-info', '/data-folder'] as const;

export function isRestrictedPathForRegularUser(pathname: string): boolean {
  return RESTRICTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function hasAnyMenuPermission(permissions: PersonnelMenuPermissions | undefined): boolean {
  if (!permissions) return false;
  return PERSONNEL_MENU_PERMISSION_KEYS.some((key) => isMenuPermissionEnabled(permissions, key));
}

const PERSONNEL_MENU_PERMISSION_KEYS: PersonnelMenuPermissionKey[] = [
  'org',
  'purchase',
  'bidding',
  'outsourcing',
];

export function pathnameToMenuPermissionKey(pathname: string): PersonnelMenuPermissionKey | null {
  if (pathname === '/org' || pathname.startsWith('/org/')) return 'org';
  if (pathname.startsWith('/outsourcing')) return 'outsourcing';
  if (pathname.startsWith('/purchase/bidding')) return 'bidding';
  if (pathname.startsWith('/purchase')) return 'purchase';
  return null;
}

export function canAccessMenuPermission(
  permissions: PersonnelMenuPermissions | undefined,
  key: PersonnelMenuPermissionKey,
  isDeveloper: boolean,
): boolean {
  if (isDeveloper) return true;
  return isMenuPermissionEnabled(permissions, key);
}

export type ProjectManagementRoleFlags = {
  canCreateProject: boolean;
  canAccessAllocationForm: boolean;
};

function canAccessProjectManagementPath(
  pathname: string,
  roleFlags: ProjectManagementRoleFlags,
): boolean {
  if (pathname === '/project/register' || pathname === '/admin') {
    return roleFlags.canCreateProject;
  }
  if (pathname === '/project/allocation' || pathname === '/allocation') {
    return roleFlags.canAccessAllocationForm;
  }
  if (pathname.startsWith('/project')) {
    return roleFlags.canCreateProject || roleFlags.canAccessAllocationForm;
  }
  return false;
}

export function canAccessPathWithMenuPermissions(
  pathname: string,
  permissions: PersonnelMenuPermissions | undefined,
  isDeveloper: boolean,
  roleFlags?: ProjectManagementRoleFlags,
): boolean {
  if (isDeveloper) return true;

  if (pathname === '/' || pathname.startsWith('/dashboard')) return true;

  if (isRestrictedPathForRegularUser(pathname)) return false;

  if (
    pathname.startsWith('/project') ||
    pathname === '/admin' ||
    pathname === '/allocation'
  ) {
    if (!roleFlags) return false;
    return canAccessProjectManagementPath(pathname, roleFlags);
  }

  const key = pathnameToMenuPermissionKey(pathname);
  if (!key) return false;
  return canAccessMenuPermission(permissions, key, false);
}

export function canShowSidebarNavItem(
  path: string,
  permissions: PersonnelMenuPermissions | undefined,
  isDeveloper: boolean,
): boolean {
  if (isDeveloper) return true;

  if (path === '/') return true;

  if (path === '/analysis' || path === '/data-folder') return false;

  if (path === '/org') {
    return canAccessMenuPermission(permissions, 'org', false);
  }

  return false;
}

export function shouldShowProjectManagementNav(
  roleFlags: ProjectManagementRoleFlags,
  isDeveloper: boolean,
): boolean {
  if (isDeveloper) return true;
  return roleFlags.canCreateProject || roleFlags.canAccessAllocationForm;
}

export function shouldShowProjectManagementSubItem(
  path: string,
  roleFlags: ProjectManagementRoleFlags,
  isDeveloper: boolean,
): boolean {
  if (isDeveloper) return true;
  if (path === '/project/register') return roleFlags.canCreateProject;
  if (path === '/project/allocation') return roleFlags.canAccessAllocationForm;
  return false;
}

export function shouldShowMiscInfoNav(isDeveloper: boolean): boolean {
  return isDeveloper;
}

export function shouldShowDataFolderNav(isDeveloper: boolean): boolean {
  return isDeveloper;
}

export function isMenuPermissionReadOnly(
  permissions: PersonnelMenuPermissions | undefined,
  key: PersonnelMenuPermissionKey,
): boolean {
  const entry = permissions?.[key];
  return entry?.mode === 'read';
}

export function pathnameMenuReadOnly(
  pathname: string,
  permissions: PersonnelMenuPermissions | undefined,
): boolean {
  const key = pathnameToMenuPermissionKey(pathname);
  if (!key) return false;
  return isMenuPermissionReadOnly(permissions, key);
}

export function shouldShowPurchaseNav(
  permissions: PersonnelMenuPermissions | undefined,
  isDeveloper: boolean,
): boolean {
  if (isDeveloper) return true;
  return (
    canAccessMenuPermission(permissions, 'purchase', false) ||
    canAccessMenuPermission(permissions, 'bidding', false) ||
    canAccessMenuPermission(permissions, 'outsourcing', false)
  );
}

export function shouldShowPurchaseSubItem(
  path: string,
  permissions: PersonnelMenuPermissions | undefined,
  isDeveloper: boolean,
): boolean {
  if (path.startsWith('/outsourcing')) {
    return canAccessMenuPermission(permissions, 'outsourcing', isDeveloper);
  }
  if (path.startsWith('/purchase/bidding')) {
    return canAccessMenuPermission(permissions, 'bidding', isDeveloper);
  }
  return canAccessMenuPermission(permissions, 'purchase', isDeveloper);
}
