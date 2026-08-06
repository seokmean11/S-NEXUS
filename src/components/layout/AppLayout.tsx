import { useEffect, useState } from 'react';

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { RoleSwitcher } from '@/components/layout/RoleSwitcher';
import { GnbBrandMark } from '@/components/layout/GnbBrandMark';

import { Button } from '@/components/ui/Button';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

import { useApp } from '@/context/AppContext';

import type { PermissionFlags, RoleConfig } from '@/types';



const NAV_ITEMS = [

  { path: '/', label: '대시보드', icon: '📊' },

  { path: '/analysis', label: 'NEXUS AI', icon: '🤖' },

  { path: '/admin', label: '프로젝트 관리', icon: '⚙️', adminOnly: true },

  { path: '/org', label: '조직관리', icon: '🏢', adminOnly: true },

  { path: '/allocation', label: 'PM 인력 배분', icon: '👥', managerOnly: true },

] as const;



const PURCHASE_SUB_ITEMS = [
  { path: '/purchase/bidding', label: '입찰도우미' },
  { path: '/outsourcing', label: '외주정보검색' },
] as const;

const MISC_INFO_SUB_ITEMS = [
  { path: '/misc-info/exhibition-business-cost', label: '유형별사업비(전시)' },
] as const;

function isPurchaseSectionPath(pathname: string): boolean {
  return pathname.startsWith('/purchase') || pathname.startsWith('/outsourcing');
}

function isMiscInfoSectionPath(pathname: string): boolean {
  return pathname.startsWith('/misc-info');
}



function canAccessPurchase(permissions: PermissionFlags): boolean {

  return permissions.canCreateProject || permissions.canViewAll;

}



export function AppLayout() {

  const { permissions, roleConfig, divisions, teams, role, syncPPM } = useApp();

  const location = useLocation();

  const navigate = useNavigate();

  const [ppmConfirmOpen, setPpmConfirmOpen] = useState(false);

  const [ppmSyncing, setPpmSyncing] = useState(false);

  const [ppmMessage, setPpmMessage] = useState('');

  const [purchaseOpen, setPurchaseOpen] = useState(() => isPurchaseSectionPath(location.pathname));
  const [miscInfoOpen, setMiscInfoOpen] = useState(() => isMiscInfoSectionPath(location.pathname));

  const showPurchaseNav = canAccessPurchase(permissions);
  const purchaseActive = isPurchaseSectionPath(location.pathname);
  const miscInfoActive = isMiscInfoSectionPath(location.pathname);

  useEffect(() => {
    if (purchaseActive) setPurchaseOpen(true);
  }, [purchaseActive]);

  useEffect(() => {
    if (miscInfoActive) setMiscInfoOpen(true);
  }, [miscInfoActive]);



  useEffect(() => {

    const path = location.pathname;

    const adminRoute = path === '/admin' || path === '/org';

    const allocationRoute = path === '/allocation';

    const purchaseRoute = path.startsWith('/purchase');
    const outsourcingRoute = path.startsWith('/outsourcing');



    if (adminRoute && !permissions.canCreateProject) {

      navigate('/', { replace: true });

      return;

    }

    if (allocationRoute && !permissions.canAccessAllocationForm) {

      navigate('/', { replace: true });

      return;

    }

    if ((purchaseRoute || outsourcingRoute) && !canAccessPurchase(permissions)) {

      navigate('/', { replace: true });

    }

  }, [

    role,

    location.pathname,

    permissions.canCreateProject,

    permissions.canAccessAllocationForm,

    permissions.canViewAll,

    navigate,

  ]);



  const visibleNav = NAV_ITEMS.filter((item) => {

    if ('adminOnly' in item && item.adminOnly) return permissions.canCreateProject;

    if ('managerOnly' in item && item.managerOnly) return permissions.canAccessAllocationForm;

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



            {showPurchaseNav && (

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

                    {PURCHASE_SUB_ITEMS.map((item) => (

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

            <NavLink
              to="/data-folder"
              className={({ isActive }) =>
                `lnb__link lnb__link--data-folder ${isActive ? 'lnb__link--active' : ''}`
              }
            >
              <span className="lnb__icon">📁</span>
              데이터폴더
            </NavLink>

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


