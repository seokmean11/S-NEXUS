import {
  MENU_PERMISSION_MODE_LABELS,
  PERSONNEL_MENU_PERMISSION_ITEMS,
  menuPermissionSupportsEdit,
  type MenuPermissionMode,
  type PersonnelMenuPermissionKey,
  type PersonnelMenuPermissions,
} from '@/types/menuPermissions';

function resolvedMode(
  key: PersonnelMenuPermissionKey,
  mode: MenuPermissionMode | undefined,
): MenuPermissionMode {
  if (menuPermissionSupportsEdit(key) && mode === 'edit') return 'edit';
  return 'read';
}

export function createAllReadMenuPermissions(): PersonnelMenuPermissions {
  return Object.fromEntries(
    PERSONNEL_MENU_PERMISSION_ITEMS.map((item) => [item.key, { mode: 'read' as MenuPermissionMode }]),
  ) as PersonnelMenuPermissions;
}

export function createAllEditMenuPermissions(): PersonnelMenuPermissions {
  return Object.fromEntries(
    PERSONNEL_MENU_PERMISSION_ITEMS.map((item) => [
      item.key,
      { mode: resolvedMode(item.key, 'edit') },
    ]),
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

  return PERSONNEL_MENU_PERMISSION_ITEMS.filter((item) =>
    isMenuPermissionEnabled(permissions, item.key) ||
    ((item.key === 'bidding' || item.key === 'outsourcing') &&
      isMenuPermissionEnabled(permissions, 'purchase')),
  )
    .map((item) => {
      const mode = resolvedMode(item.key, permissions[item.key]?.mode);
      if (!menuPermissionSupportsEdit(item.key)) return item.label;
      return `${item.label}(${MENU_PERMISSION_MODE_LABELS[mode]})`;
    })
    .join(', ');
}

export function normalizeMenuPermissions(
  permissions: PersonnelMenuPermissions | undefined,
): PersonnelMenuPermissions | undefined {
  if (!permissions) return undefined;
  const next: PersonnelMenuPermissions = {};

  for (const [rawKey, entry] of Object.entries(permissions)) {
    if (entry?.mode !== 'read' && entry?.mode !== 'edit') continue;
    const key = rawKey as PersonnelMenuPermissionKey;
    next[key] = { mode: resolvedMode(key, entry.mode) };
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
