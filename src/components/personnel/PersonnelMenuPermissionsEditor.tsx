import {
  MENU_PERMISSION_MODE_LABELS,
  PERSONNEL_MENU_PERMISSION_ITEMS,
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
      next[key] = { mode: next[key]?.mode ?? 'read' };
    } else {
      delete next[key];
    }
    onChange(next);
  };

  const setMenuMode = (key: PersonnelMenuPermissionKey, mode: MenuPermissionMode) => {
    if (!isMenuPermissionEnabled(value, key)) return;
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

              {enabled && (
                <div className="personnel-menu-perms__modes" role="radiogroup" aria-label={`${item.label} 권한`}>
                  {(['read', 'edit'] as const).map((option) => (
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
        읽기전용: 메뉴 사용·조회만 가능 · 수정권한: 사용과 수정 모두 가능 (추후 로그인 연동 시 적용)
      </p>
    </div>
  );
}
