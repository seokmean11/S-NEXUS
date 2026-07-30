import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import type { PermissionFlags, RoleConfig } from '@/types';

const NAV_ITEMS = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/admin', label: '프로젝트 관리', icon: '⚙️', adminOnly: true },
  { path: '/org', label: '조직관리', icon: '🏢', adminOnly: true },
  { path: '/allocation', label: 'PM 인력 배분', icon: '👥', managerOnly: true },
];

export function AppLayout() {
  const { permissions, roleConfig, divisions, teams, role } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname;
    const adminRoute = path === '/admin' || path === '/org';
    const allocationRoute = path === '/allocation';

    if (adminRoute && !permissions.canCreateProject) {
      navigate('/', { replace: true });
      return;
    }
    if (allocationRoute && !permissions.canAccessAllocationForm) {
      navigate('/', { replace: true });
    }
  }, [role, location.pathname, permissions.canCreateProject, permissions.canAccessAllocationForm, navigate]);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return permissions.canCreateProject;
    if (item.managerOnly) return permissions.canAccessAllocationForm;
    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="app-layout">
      <header className="gnb no-print">
        <div className="gnb__brand">
          <span className="gnb__logo">P</span>
          <div>
            <h1 className="gnb__title">성과 · 기여도 관리</h1>
            <p className="gnb__subtitle">Performance Dashboard</p>
          </div>
        </div>
        <div className="gnb__actions">
          {permissions.canExportPDF && (
            <Button variant="outline" size="sm" onClick={handlePrint}>
              최고경영진 보고서 출력 (PDF)
            </Button>
          )}
          <RoleSwitcher />
        </div>
      </header>

      <div className="app-body">
        <aside className="lnb no-print">
          <nav className="lnb__nav">
            {visibleNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `lnb__link ${isActive ? 'lnb__link--active' : ''}`
                }
              >
                <span className="lnb__icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="lnb__scope">
            <p className="lnb__scope-label">데이터 범위</p>
            <p className="lnb__scope-value">{getScopeLabel(roleConfig, permissions, divisions, teams)}</p>
          </div>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function getScopeLabel(
  roleConfig: RoleConfig,
  permissions: PermissionFlags,
  divisions: { id: string; name: string }[],
  teams: { id: string; name: string }[],
): string {
  if (permissions.canViewAll) return '전사';
  if (roleConfig.id === 'division_head') {
    return divisions.find((d) => d.id === roleConfig.divisionId)?.name ?? '사업본부';
  }
  if (roleConfig.id === 'team_manager') {
    return teams.find((t) => t.id === roleConfig.teamId)?.name ?? '팀';
  }
  return '본인 참여 PJT';
}
