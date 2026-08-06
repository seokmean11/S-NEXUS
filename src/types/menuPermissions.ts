/** 조직관리에서 개인별로 부여하는 메뉴 권한 (1차: 4개 메뉴) */
export type PersonnelMenuPermissionKey = 'org' | 'purchase' | 'bidding' | 'outsourcing';

export type MenuPermissionMode = 'read' | 'edit';

export interface MenuPermissionEntry {
  mode: MenuPermissionMode;
}

export type PersonnelMenuPermissions = Partial<
  Record<PersonnelMenuPermissionKey, MenuPermissionEntry>
>;

export const PERSONNEL_MENU_PERMISSION_ITEMS = [
  { key: 'org' as const, label: '조직관리' },
  { key: 'purchase' as const, label: '구매관리' },
  { key: 'bidding' as const, label: '입찰도우미' },
  { key: 'outsourcing' as const, label: '외주정보검색' },
];

export const MENU_PERMISSION_MODE_LABELS: Record<MenuPermissionMode, string> = {
  read: '읽기전용',
  edit: '수정권한',
};
