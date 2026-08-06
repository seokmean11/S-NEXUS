import {
  MENU_PERMISSION_MODE_LABELS,
  PERSONNEL_MENU_PERMISSION_ITEMS,
  type MenuPermissionMode,
  type PersonnelMenuPermissionKey,
  type PersonnelMenuPermissions,
} from '@/types/menuPermissions';

export function createAllReadMenuPermissions(): PersonnelMenuPermissions {
  return Object.fromEntries(
    PERSONNEL_MENU_PERMISSION_ITEMS.map((item) => [item.key, { mode: 'read' as MenuPermissionMode }]),
  ) as PersonnelMenuPermissions;
}

export function createAllEditMenuPermissions(): PersonnelMenuPermissions {
  return Object.fromEntries(
    PERSONNEL_MENU_PERMISSION_ITEMS.map((item) => [item.key, { mode: 'edit' as MenuPermissionMode }]),
  ) as PersonnelMenuPermissions;
}

export function clearMenuPermissions(): PersonnelMenuPermissions {
  return {};
}

export function isMenuPermissionEnabled(
  permissions: PersonnelMenuPermissions | undefined,
  key: PersonnelMenuPermissionKey,
): boolean {
  return Boolean(permissions?.[key]);
}

export function formatPersonnelMenuPermissionsCell(
  permissions: PersonnelMenuPermissions | undefined,
): string {
  if (!permissions || Object.keys(permissions).length === 0) return '-';

  return PERSONNEL_MENU_PERMISSION_ITEMS.filter((item) => permissions[item.key])
    .map((item) => {
      const mode = permissions[item.key]!.mode;
      return `${item.label}(${MENU_PERMISSION_MODE_LABELS[mode]})`;
    })
    .join(', ');
}

export function normalizeMenuPermissions(
  permissions: PersonnelMenuPermissions | undefined,
): PersonnelMenuPermissions | undefined {
  if (!permissions) return undefined;
  const next: PersonnelMenuPermissions = {};
  for (const item of PERSONNEL_MENU_PERMISSION_ITEMS) {
    const entry = permissions[item.key];
    if (entry?.mode === 'read' || entry?.mode === 'edit') {
      next[item.key] = { mode: entry.mode };
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
