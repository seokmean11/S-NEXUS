import { ROLE_CONFIGS } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import type { Role } from '@/types';

export function RoleSwitcher() {
  const { role, setRole, roleConfig } = useApp();

  return (
    <div className="role-switcher no-print">
      <span className="role-switcher__label">권한</span>
      <select
        className="role-switcher__select"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        aria-label="권한 선택"
      >
        {ROLE_CONFIGS.map((config) => (
          <option key={config.id} value={config.id}>
            {config.label}
          </option>
        ))}
      </select>
      <span className="role-switcher__user">
        {roleConfig.userName} · {roleConfig.label}
      </span>
    </div>
  );
}
