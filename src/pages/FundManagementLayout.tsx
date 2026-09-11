import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function FundManagementIndex() {
  const { canAccessPath } = useAuth();
  if (canAccessPath('/fund/billing')) {
    return <Navigate to="billing" replace />;
  }
  if (canAccessPath('/fund/cash-analysis')) {
    return <Navigate to="cash-analysis" replace />;
  }
  return <Navigate to="/" replace />;
}

export function FundManagementLayout() {
  return (
    <div className="fund-management-page">
      <Outlet />
    </div>
  );
}
