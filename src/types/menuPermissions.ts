/** 조직관리에서 개인별로 부여하는 메뉴 권한 */
export type PersonnelMenuPermissionKey =
  | 'analysis'
  | 'org'
  | 'purchase'
  | 'bidding'
  | 'outsourcing'
  | 'competitor';

export type MenuPermissionMode = 'read' | 'edit';

export interface MenuPermissionEntry {
  mode: MenuPermissionMode;
}

export type PersonnelMenuPermissions = Partial<
  Record<PersonnelMenuPermissionKey, MenuPermissionEntry>
>;

export const PERSONNEL_MENU_PERMISSION_ITEMS = [
  { key: 'analysis' as const, label: 'NEXUS AI', modes: ['read'] as const },
  { key: 'org' as const, label: '조직관리', modes: ['read', 'edit'] as const },
  { key: 'bidding' as const, label: '입찰도우미', modes: ['read'] as const },
  { key: 'outsourcing' as const, label: '외주정보검색', modes: ['read'] as const },
  { key: 'competitor' as const, label: '경쟁사분석', modes: ['read'] as const },
];

export const PERSONNEL_MENU_PERMISSION_KEYS = PERSONNEL_MENU_PERMISSION_ITEMS.map(
  (item) => item.key,
);

export const MENU_PERMISSION_MODE_LABELS: Record<MenuPermissionMode, string> = {
  read: '읽기전용',
  edit: '수정권한',
};

export function menuPermissionSupportsEdit(
  key: PersonnelMenuPermissionKey,
): boolean {
  return key === 'org';
}
