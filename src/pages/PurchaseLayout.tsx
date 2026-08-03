import { NavLink, Outlet } from 'react-router-dom';

const PURCHASE_SUB_ITEMS = [{ path: '/purchase/bidding', label: '입찰관리' }] as const;

export function PurchaseLayout() {
  return (
    <div className="purchase-page">
      <div className="page-header no-print">
        <h2>구매관리</h2>
        <p>입찰·발주 업무를 통합 관리하고 AI로 분석합니다.</p>
      </div>

      <nav className="purchase-subnav no-print" aria-label="구매관리 하위 메뉴">
        {PURCHASE_SUB_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `purchase-subnav__link ${isActive ? 'purchase-subnav__link--active' : ''}`
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
