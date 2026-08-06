import type { PersonnelMenuPermissionKey, PersonnelMenuPermissions } from '@/types/menuPermissions';
import { isMenuPermissionEnabled } from '@/utils/menuPermissions';

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

export function canAccessPathWithMenuPermissions(
  pathname: string,
  permissions: PersonnelMenuPermissions | undefined,
  isDeveloper: boolean,
): boolean {
  const key = pathnameToMenuPermissionKey(pathname);
  if (!key) return true;
  return canAccessMenuPermission(permissions, key, isDeveloper);
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
