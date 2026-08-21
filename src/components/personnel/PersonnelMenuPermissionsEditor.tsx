import {
  MENU_PERMISSION_MODE_LABELS,
  PERSONNEL_MENU_PERMISSION_ITEMS,
  menuPermissionSupportsEdit,
  type MenuPermissionMode,
  type PersonnelMenuPermissionKey,
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
}

export function PersonnelMenuPermissionsEditor({
  value,
  onChange,
  compact = false,
}: PersonnelMenuPermissionsEditorProps) {
  const setMenuEnabled = (key: PersonnelMenuPermissionKey, enabled: boolean) => {
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
    if (!isMenuPermissionEnabled(value, key)) return;
    if (!menuPermissionSupportsEdit(key)) return;
    onChange({ ...value, [key]: { mode } });
  };

  return (
    <div className={`personnel-menu-perms${compact ? ' personnel-menu-perms--compact' : ''}`}>
      <div className="personnel-menu-perms__toolbar">
        <button
          type="button"
          className="personnel-menu-perms__bulk-btn"
          onClick={() => onChange(createAllReadMenuPermissions())}
        >
          모두 선택
        </button>
        <button
          type="button"
          className="personnel-menu-perms__bulk-btn"
          onClick={() => onChange(clearMenuPermissions())}
        >
          모두 삭제
        </button>
      </div>

      <ul className="personnel-menu-perms__list">
        {PERSONNEL_MENU_PERMISSION_ITEMS.map((item) => {
          const enabled = isMenuPermissionEnabled(value, item.key);
          const mode = value[item.key]?.mode ?? 'read';
          const showModeSelect = item.modes.length > 1;

          return (
            <li key={item.key} className="personnel-menu-perms__item">
              <label className="personnel-menu-perms__menu-check">
                <input
                  type="checkbox"
                  checked={enabled}
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
                        onChange={() => setMenuMode(item.key, option)}
                      />
                      <span>{MENU_PERMISSION_MODE_LABELS[option]}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="personnel-menu-perms__hint">
        조직관리만 읽기전용/수정권한을 나눕니다. NEXUS AI · 입찰도우미 · 외주정보검색 · 경쟁사분석은
        선택 시 해당 메뉴를 그대로 사용할 수 있습니다.
      </p>
    </div>
  );
}
