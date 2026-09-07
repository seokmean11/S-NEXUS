import { Outlet } from 'react-router-dom';

export function FundManagementLayout() {
  return (
    <div className="fund-management-page">
      <Outlet />
    </div>
  );
}
