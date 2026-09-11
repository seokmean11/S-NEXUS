import { useMemo, useState } from 'react';
import {
  MENU_PERMISSION_MODE_LABELS,
  PERSONNEL_MENU_PERMISSION_TREE,
  menuPermissionSupportsEdit,
  type MenuPermissionMode,
  type PersonnelMenuPermissionKey,
  type PersonnelMenuPermissionLeaf,
  type PersonnelMenuPermissions,
} from '@/types/menuPermissions';
import {
  clearMenuPermissions,
  createAllReadMenuPermissions,
  isMenuPermissionEnabled,
} from '@/utils/menuPermissions';

interface PersonnelMenuPermissionsEditorProps {
  value: PersonnelMenuPermissions;
  onChange: (next: PersonnelMenuPermissions) => void;
  compact?: boolean;
  disabled?: boolean;
  sandbox?: boolean;
}

export function PersonnelMenuPermissionsEditor({
  value,
  onChange,
  compact = false,
  disabled = false,
  sandbox = false,
}: PersonnelMenuPermissionsEditorProps) {
  const initiallyOpen = useMemo(() => {
    const open: Record<string, boolean> = {};
    for (const node of PERSONNEL_MENU_PERMISSION_TREE) {
      if (node.kind !== 'group') continue;
      open[node.id] = node.children.some((child) => isMenuPermissionEnabled(value, child.key));
    }
    return open;
  }, []);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initiallyOpen);

  const setMenuEnabled = (key: PersonnelMenuPermissionKey, enabled: boolean) => {
    if (disabled) return;
    const next = { ...value };
    if (enabled) {
      const currentMode = next[key]?.mode;
      next[key] = {
        mode: menuPermissionSupportsEdit(key) && currentMode === 'edit' ? 'edit' : 'read',
      };
    } else {
      delete next[key];
    }
    onChange(next);
  };

  const setMenuMode = (key: PersonnelMenuPermissionKey, mode: MenuPermissionMode) => {
    if (disabled) return;
    if (!isMenuPermissionEnabled(value, key)) return;
    if (!menuPermissionSupportsEdit(key)) return;
    onChange({ ...value, [key]: { mode } });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderLeaf = (item: PersonnelMenuPermissionLeaf, nested: boolean) => {
    const enabled = isMenuPermissionEnabled(value, item.key);
    const mode = value[item.key]?.mode ?? 'read';
    const showModeSelect = item.modes.length > 1;

    return (
      <li
        key={item.key}
        className={`personnel-menu-perms__item${nested ? ' personnel-menu-perms__item--nested' : ''}`}
      >
        <label className="personnel-menu-perms__menu-check">
          {item.icon ? <span className="personnel-menu-perms__icon">{item.icon}</span> : null}
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => setMenuEnabled(item.key, event.target.checked)}
          />
          <span>{item.label}</span>
        </label>

        {enabled && showModeSelect && (
          <div className="personnel-menu-perms__modes" role="radiogroup" aria-label={`${item.label} 권한`}>
            {item.modes.map((option) => (
              <label key={option} className="personnel-menu-perms__mode">
                <input
                  type="radio"
                  name={`menu-perm-${item.key}`}
                  checked={mode === option}
                  disabled={disabled}
                  onChange={() => setMenuMode(item.key, option)}
                />
                <span>{MENU_PERMISSION_MODE_LABELS[option]}</span>
              </label>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={`personnel-menu-perms${compact ? ' personnel-menu-perms--compact' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="personnel-menu-perms__toolbar">
          <button
            type="button"
            className="personnel-menu-perms__bulk-btn"
            disabled={disabled}
            onClick={() => onChange(createAllReadMenuPermissions())}
          >
            모두 선택
          </button>
          <button
            type="button"
            className="personnel-menu-perms__bulk-btn"
            disabled={disabled}
            onClick={() => onChange(clearMenuPermissions())}
          >
            모두 삭제
          </button>
        </div>

        <ul className="personnel-menu-perms__nav">
          {PERSONNEL_MENU_PERMISSION_TREE.map((node) => {
            if (node.kind === 'leaf') {
              return renderLeaf(node, false);
            }

            const open = Boolean(openGroups[node.id]);
            return (
              <li key={node.id} className={`personnel-menu-perms__group${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="personnel-menu-perms__group-toggle"
                  onClick={() => toggleGroup(node.id)}
                  aria-expanded={open}
                >
                  <span className="personnel-menu-perms__icon">{node.icon}</span>
                  <span className="personnel-menu-perms__group-label">{node.label}</span>
                  <span className="personnel-menu-perms__group-chevron">{open ? '▾' : '▸'}</span>
                </button>
                {open ? (
                  <ul className="personnel-menu-perms__subnav">
                    {node.children.map((child) => renderLeaf(child, true))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

      <p className="personnel-menu-perms__hint">
        {disabled
          ? '메뉴 권한은 서비스웹에서 개발자만 부여·변경할 수 있습니다.'
          : sandbox
            ? '좌측 메인메뉴와 같은 트리입니다. 그룹을 펼쳐 하위 메뉴에 권한을 부여하세요. 개발웹에서 바꾼 권한·인원 정보는 공용 드라이브에 반영되지 않습니다.'
            : '좌측 메인메뉴와 같은 구성입니다. 그룹을 클릭하면 하위 메뉴가 펼쳐집니다. 조직관리·기성관리는 읽기전용/수정권한을 나누고, 나머지 메뉴는 선택 시 사용할 수 있습니다.'}
      </p>
    </div>
  );
}
