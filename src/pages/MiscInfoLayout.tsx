import { NavLink, Outlet } from 'react-router-dom';

const MISC_INFO_SUB_ITEMS = [
  { path: '/misc-info/exhibition-business-cost', label: '유형별사업비(전시)' },
] as const;

export function MiscInfoLayout() {
  return (
    <div className="misc-info-page">
      <div className="page-header no-print">
        <h2>기타정보</h2>
        <p>전시 사업 관련 부가 정보를 확인합니다.</p>
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

      <Outlet />
    </div>
  );
}
