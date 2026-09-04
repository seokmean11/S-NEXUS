import { Outlet } from 'react-router-dom';
import { FundBillingProvider } from '@/context/FundBillingContext';

export function FundManagementLayout() {
  return (
    <FundBillingProvider>
      <div className="fund-management-page">
        <Outlet />
      </div>
    </FundBillingProvider>
  );
}
