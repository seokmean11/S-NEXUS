import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useApp } from '@/context/AppContext';
import type { PermissionFlags, RoleConfig } from '@/types';

const NAV_ITEMS = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/analysis', label: '분석', icon: '🤖' },
  { path: '/admin', label: '프로젝트 관리', icon: '⚙️', adminOnly: true },
  { path: '/org', label: '조직관리', icon: '🏢', adminOnly: true },
  { path: '/allocation', label: 'PM 인력 배분', icon: '👥', managerOnly: true },
];

export function AppLayout() {
  const { permissions, roleConfig, divisions, teams, role, syncPPM } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [ppmConfirmOpen, setPpmConfirmOpen] = useState(false);
  const [ppmSyncing, setPpmSyncing] = useState(false);
  const [ppmMessage, setPpmMessage] = useState('');

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
  }, [
    role,
    location.pathname,
    permissions.canCreateProject,
    permissions.canAccessAllocationForm,
    navigate,
  ]);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return permissions.canCreateProject;
    if (item.managerOnly) return permissions.canAccessAllocationForm;
    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  const handlePpmSyncConfirm = async () => {
    setPpmSyncing(true);
    try {
      await syncPPM();
      setPpmMessage('PPM(DB) 원가정보 동기화가 완료되었습니다.');
      setPpmConfirmOpen(false);
      setTimeout(() => setPpmMessage(''), 3000);
    } finally {
      setPpmSyncing(false);
    }
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

          <div className="lnb__bottom">
            <div className="lnb__scope">
              <p className="lnb__scope-label">데이터 범위</p>
              <p className="lnb__scope-value">
                {getScopeLabel(roleConfig, permissions, divisions, teams)}
              </p>
            </div>

            {permissions.canSyncPPM && (
              <Button
                variant="secondary"
                size="sm"
                className="lnb__sync-btn"
                onClick={() => setPpmConfirmOpen(true)}
              >
                PPM(DB) 동기화
              </Button>
            )}
          </div>
        </aside>

        <main className="main-content">
          {ppmMessage && (
            <div className="toast toast--success no-print app-toast">{ppmMessage}</div>
          )}
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={ppmConfirmOpen}
        title="PPM(DB) 동기화"
        message="원가정보를 불러오시겠습니까?"
        confirmLabel="네"
        cancelLabel="아니오"
        loading={ppmSyncing}
        onConfirm={handlePpmSyncConfirm}
        onCancel={() => !ppmSyncing && setPpmConfirmOpen(false)}
      />
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
