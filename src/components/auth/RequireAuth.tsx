import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PasswordChangeDialog } from '@/components/auth/PasswordChangeDialog';
import { useAuth } from '@/context/AuthContext';

export function RequireAuth() {
  const { isAuthenticated, orgReady, mustChangePassword, canAccessPath } = useAuth();
  const location = useLocation();

  if (!orgReady) {
    return (
      <div className="auth-loading">
        <p>서비스를 준비하는 중…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (mustChangePassword) {
    return <PasswordChangeDialog />;
  }

  if (!canAccessPath(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
