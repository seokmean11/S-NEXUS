import { useEffect, useState } from 'react';

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { GnbBrandMark } from '@/components/layout/GnbBrandMark';

import { Button } from '@/components/ui/Button';

import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  canShowSidebarNavItem,
  shouldShowCompetitorNav,
  shouldShowFundNav,
  shouldShowMiscInfoNav,
  shouldShowPurchaseNav,
  shouldShowPurchaseSubItem,
  shouldShowProjectManagementNav,
  shouldShowProjectManagementSubItem,
  isRestrictedPathForRegularUser,
} from '@/utils/menuAccess';

import type { PermissionFlags, RoleConfig } from '@/types';
import {
  FUND_MANAGEMENT_SUB_ITEMS,
  isFundManagementSectionPath,
} from '@/constants/fundManagementNav';
import { MISC_INFO_SUB_ITEMS } from '@/constants/miscInfoNav';
import {
  isProjectManagementSectionPath,
  PROJECT_MANAGEMENT_SUB_ITEMS,
} from '@/constants/projectManagementNav';



const NAV_ITEMS = [

  { path: '/analysis', label: 'NEXUS AI', icon: '🤖' },

  { path: '/org', label: '조직관리', icon: '🏢', adminOnly: true },

] as const;



const PURCHASE_SUB_ITEMS = [
  { path: '/purchase/bidding', label: '입찰도우미' },
  { path: '/outsourcing', label: '외주정보검색' },
] as const;

function isPurchaseSectionPath(pathname: string): boolean {
  return pathname.startsWith('/purchase') || pathname.startsWith('/outsourcing');
}

function isMiscInfoSectionPath(pathname: string): boolean {
  return pathname.startsWith('/misc-info');
}


export function AppLayout() {

  const { permissions, roleConfig, divisions, teams, role } = useApp();
  const { isDeveloper, menuPermissions, session, authPerson, logout, canAccessPath } = useAuth();

  const location = useLocation();

  const navigate = useNavigate();

  const [purchaseOpen, setPurchaseOpen] = useState(() => isPurchaseSectionPath(location.pathname));
  const [fundOpen, setFundOpen] = useState(() => isFundManagementSectionPath(location.pathname));
  const [miscInfoOpen, setMiscInfoOpen] = useState(() => isMiscInfoSectionPath(location.pathname));
  const [projectOpen, setProjectOpen] = useState(() =>
    isProjectManagementSectionPath(location.pathname),
  );

  const projectRoleFlags = {
    canCreateProject: permissions.canCreateProject,
    canAccessAllocationForm: permissions.canAccessAllocationForm,
  };

  const showPurchaseNav =
    isDeveloper || permissions.canCreateProject || permissions.canViewAll
      ? true
      : shouldShowPurchaseNav(menuPermissions, false);
  const showCompetitorNav = shouldShowCompetitorNav(menuPermissions, isDeveloper);
  const purchaseActive = isPurchaseSectionPath(location.pathname);
  const fundActive = isFundManagementSectionPath(location.pathname);
  const miscInfoActive = isMiscInfoSectionPath(location.pathname);
  const projectActive = isProjectManagementSectionPath(location.pathname);

  useEffect(() => {
    if (projectActive) setProjectOpen(true);
  }, [projectActive]);

  useEffect(() => {
    if (purchaseActive) setPurchaseOpen(true);
  }, [purchaseActive]);

  useEffect(() => {
    if (fundActive) setFundOpen(true);
  }, [fundActive]);

  useEffect(() => {
    if (miscInfoActive) setMiscInfoOpen(true);
  }, [miscInfoActive]);



  useEffect(() => {

    const path = location.pathname;

    const orgRoute = path === '/org';
    const projectRegisterRoute = path === '/project/register' || path === '/admin';
    const projectAllocationRoute = path === '/project/allocation' || path === '/allocation';
    const purchaseRoute = path.startsWith('/purchase');
    const outsourcingRoute = path.startsWith('/outsourcing');

    if (orgRoute && !canAccessPath('/org')) {
      navigate('/', { replace: true });
      return;
    }

    if ((path === '/analysis' || path.startsWith('/analysis/')) && !canAccessPath(path)) {
      navigate('/', { replace: true });
      return;
    }

    if (path.startsWith('/misc-info/competitor-analysis') && !canAccessPath(path)) {
      navigate('/', { replace: true });
      return;
    }

    if (projectRegisterRoute && !isDeveloper && !permissions.canCreateProject) {
      navigate('/', { replace: true });
      return;
    }

    if (projectAllocationRoute && !isDeveloper && !permissions.canAccessAllocationForm) {
      navigate('/', { replace: true });
      return;
    }

    if ((purchaseRoute || outsourcingRoute) && !canAccessPath(path)) {

      navigate('/', { replace: true });

    }

    if (isRestrictedPathForRegularUser(path) && !isDeveloper) {
      navigate('/', { replace: true });
    }

  }, [

    role,

    location.pathname,

    permissions.canCreateProject,

    permissions.canAccessAllocationForm,

    isDeveloper,

    canAccessPath,

    navigate,

  ]);



  const visibleNav = NAV_ITEMS.filter((item) =>
    canShowSidebarNavItem(item.path, menuPermissions, isDeveloper),
  );

  const showFundNav = shouldShowFundNav(isDeveloper);
  const showMiscInfoNav = shouldShowMiscInfoNav(isDeveloper);
  const showProjectNav = shouldShowProjectManagementNav(projectRoleFlags, isDeveloper);

  const visibleProjectSubItems = PROJECT_MANAGEMENT_SUB_ITEMS.filter((item) =>
    shouldShowProjectManagementSubItem(item.path, projectRoleFlags, isDeveloper),
  );

  const visiblePurchaseSubItems = PURCHASE_SUB_ITEMS.filter((item) =>
    isDeveloper || permissions.canCreateProject || permissions.canViewAll
      ? true
      : shouldShowPurchaseSubItem(item.path, menuPermissions, false),
  );



  const handlePrint = () => {

    window.print();

  };



  return (

    <div className="app-layout">

      <header className="gnb no-print">

        <div className="gnb__brand">

          <GnbBrandMark />

          <h1 className="gnb__title">
            <span className="gnb__title-primary">S-</span>
            <span className="gnb__title-secondary">NEXUS</span>
          </h1>

        </div>



        <div className="gnb__actions">

          {permissions.canExportPDF && (

            <Button variant="outline" size="sm" onClick={handlePrint}>

              최고경영진 보고서 출력 (PDF)

            </Button>

          )}

          {isDeveloper && <RoleSwitcher />}

          {session && authPerson && (
            <div className="gnb__user">
              <div className="gnb__user-meta">
                <span className="gnb__user-name">{authPerson.name}</span>
                {authPerson.rank.trim() ? (
                  <span className="gnb__user-rank">{authPerson.rank}</span>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                로그아웃
              </Button>
            </div>
          )}

        </div>

      </header>



      <div className="app-body">

        <aside className="lnb no-print">

          <nav className="lnb__nav">

            {visibleNav.map((item) => (

              <NavLink

                key={item.path}

                to={item.path}

                end={item.path === '/analysis'}

                className={({ isActive }) =>

                  `lnb__link ${isActive ? 'lnb__link--active' : ''}`

                }

              >

                <span className="lnb__icon">{item.icon}</span>

                {item.label}

              </NavLink>

            ))}



            {showProjectNav && visibleProjectSubItems.length > 0 && (
              <div className={`lnb__group ${projectActive ? 'lnb__group--active' : ''}`}>
                <button
                  type="button"
                  className={`lnb__group-toggle ${projectActive ? 'lnb__group-toggle--active' : ''}`}
                  onClick={() => setProjectOpen((open) => !open)}
                  aria-expanded={projectOpen}
                >
                  <span className="lnb__icon">📋</span>
                  <span className="lnb__group-label">프로젝트 관리</span>
                  <span className="lnb__group-chevron">{projectOpen ? '▾' : '▸'}</span>
                </button>

                {projectOpen && (
                  <div className="lnb__subnav">
                    {visibleProjectSubItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `lnb__sublink ${isActive ? 'lnb__sublink--active' : ''}`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showPurchaseNav && visiblePurchaseSubItems.length > 0 && (

              <div className={`lnb__group ${purchaseActive ? 'lnb__group--active' : ''}`}>

                <button

                  type="button"

                  className={`lnb__group-toggle ${purchaseActive ? 'lnb__group-toggle--active' : ''}`}

                  onClick={() => setPurchaseOpen((open) => !open)}

                  aria-expanded={purchaseOpen}

                >

                  <span className="lnb__icon">🛒</span>

                  <span className="lnb__group-label">구매관리</span>

                  <span className="lnb__group-chevron">{purchaseOpen ? '▾' : '▸'}</span>

                </button>

                {purchaseOpen && (

                  <div className="lnb__subnav">

                    {visiblePurchaseSubItems.map((item) => (

                      <NavLink

                        key={item.path}

                        to={item.path}

                        className={({ isActive }) =>

                          `lnb__sublink ${isActive ? 'lnb__sublink--active' : ''}`

                        }

                      >

                        {item.label}

                      </NavLink>

                    ))}

                  </div>

                )}

              </div>

            )}

            {showFundNav && (
              <div className={`lnb__group ${fundActive ? 'lnb__group--active' : ''}`}>
                <button
                  type="button"
                  className={`lnb__group-toggle ${fundActive ? 'lnb__group-toggle--active' : ''}`}
                  onClick={() => setFundOpen((open) => !open)}
                  aria-expanded={fundOpen}
                >
                  <span className="lnb__icon">💰</span>
                  <span className="lnb__group-label">자금관리</span>
                  <span className="lnb__group-chevron">{fundOpen ? '▾' : '▸'}</span>
                </button>

                {fundOpen && (
                  <div className="lnb__subnav">
                    {FUND_MANAGEMENT_SUB_ITEMS.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `lnb__sublink ${isActive ? 'lnb__sublink--active' : ''}`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showCompetitorNav && (
              <NavLink
                to="/misc-info/competitor-analysis"
                className={({ isActive }) =>
                  `lnb__link ${isActive ? 'lnb__link--active' : ''}`
                }
              >
                <span className="lnb__icon">📊</span>
                경쟁사분석
              </NavLink>
            )}

            {showMiscInfoNav && (
            <div className={`lnb__group ${miscInfoActive ? 'lnb__group--active' : ''}`}>
              <button
                type="button"
                className={`lnb__group-toggle ${miscInfoActive ? 'lnb__group-toggle--active' : ''}`}
                onClick={() => setMiscInfoOpen((open) => !open)}
                aria-expanded={miscInfoOpen}
              >
                <span className="lnb__icon">📁</span>
                <span className="lnb__group-label">기타정보</span>
                <span className="lnb__group-chevron">{miscInfoOpen ? '▾' : '▸'}</span>
              </button>

              {miscInfoOpen && (
                <div className="lnb__subnav">
                  {MISC_INFO_SUB_ITEMS.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `lnb__sublink ${isActive ? 'lnb__sublink--active' : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
            )}

          </nav>



          <div className="lnb__bottom">

            <div className="lnb__scope">

              <p className="lnb__scope-label">데이터 범위</p>

              <p className="lnb__scope-value">

                {getScopeLabel(roleConfig, permissions, divisions, teams)}

              </p>

            </div>



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


