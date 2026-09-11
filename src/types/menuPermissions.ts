/** 조직관리에서 개인별로 부여하는 메뉴 권한 */
export type PersonnelMenuPermissionKey =
  | 'analysis'
  | 'org'
  | 'purchase'
  | 'bidding'
  | 'outsourcing'
  | 'competitor'
  | 'fundBilling'
  | 'fundCash'
  | 'projectRegister'
  | 'projectAllocation';

export type MenuPermissionMode = 'read' | 'edit';

export interface MenuPermissionEntry {
  mode: MenuPermissionMode;
}

export type PersonnelMenuPermissions = Partial<
  Record<PersonnelMenuPermissionKey, MenuPermissionEntry>
>;

export type PersonnelMenuPermissionLeaf = {
  kind: 'leaf';
  key: PersonnelMenuPermissionKey;
  label: string;
  icon?: string;
  modes: readonly MenuPermissionMode[];
};

export type PersonnelMenuPermissionGroup = {
  kind: 'group';
  id: string;
  label: string;
  icon: string;
  children: PersonnelMenuPermissionLeaf[];
};

export type PersonnelMenuPermissionNode =
  | PersonnelMenuPermissionLeaf
  | PersonnelMenuPermissionGroup;

/** 좌측 메인메뉴(LNB)와 같은 순서·트리. 그룹은 펼침만, 권한은 하위 메뉴에 부여 */
export const PERSONNEL_MENU_PERMISSION_TREE: PersonnelMenuPermissionNode[] = [
  {
    kind: 'leaf',
    key: 'analysis',
    label: 'NEXUS AI',
    icon: '🤖',
    modes: ['read'],
  },
  {
    kind: 'leaf',
    key: 'org',
    label: '조직관리',
    icon: '🏢',
    modes: ['read', 'edit'],
  },
  {
    kind: 'group',
    id: 'project',
    label: '프로젝트 관리',
    icon: '📋',
    children: [
      { kind: 'leaf', key: 'projectRegister', label: '프로젝트 등록', modes: ['read'] },
      { kind: 'leaf', key: 'projectAllocation', label: 'PM 인력 배분', modes: ['read'] },
    ],
  },
  {
    kind: 'group',
    id: 'purchase',
    label: '구매관리',
    icon: '🛒',
    children: [
      { kind: 'leaf', key: 'bidding', label: '입찰도우미', modes: ['read'] },
      { kind: 'leaf', key: 'outsourcing', label: '외주정보검색', modes: ['read'] },
    ],
  },
  {
    kind: 'group',
    id: 'fund',
    label: '자금관리',
    icon: '💰',
    children: [
      { kind: 'leaf', key: 'fundBilling', label: '기성관리', modes: ['read', 'edit'] },
      { kind: 'leaf', key: 'fundCash', label: '자금수지', modes: ['read'] },
    ],
  },
  {
    kind: 'group',
    id: 'misc',
    label: '기타정보',
    icon: '📁',
    children: [
      { kind: 'leaf', key: 'competitor', label: '경쟁사분석', modes: ['read'] },
    ],
  },
];

export const PERSONNEL_MENU_PERMISSION_ITEMS = PERSONNEL_MENU_PERMISSION_TREE.flatMap((node) =>
  node.kind === 'group' ? node.children : [node],
);

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
  return key === 'org' || key === 'fundBilling';
}
