import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { MISC_INFO_SUB_ITEMS } from '@/constants/miscInfoNav';

export function MiscInfoLayout() {
  const { pathname } = useLocation();
  const hideMiscInfoChrome = pathname.startsWith('/misc-info/competitor-analysis');

  return (
    <div className="misc-info-page">
      {!hideMiscInfoChrome && (
        <>
          <div className="page-header no-print">
            <h2>기타정보</h2>
            <p>부가 정보 및 분석 자료를 확인합니다.</p>
          </div>

          <nav className="misc-info-subnav no-print" aria-label="기타정보 하위 메뉴">
            {MISC_INFO_SUB_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `misc-info-subnav__link ${isActive ? 'misc-info-subnav__link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </>
      )}

      <Outlet />
    </div>
  );
}