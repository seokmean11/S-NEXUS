import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardPage } from '@/pages/DashboardPage';
import { AdminPage } from '@/pages/AdminPage';
import { AllocationPage } from '@/pages/AllocationPage';
import { OrgChartPage } from '@/pages/OrgChartPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <ErrorBoundary fallbackTitle="대시보드 화면 오류">
              <DashboardPage />
            </ErrorBoundary>
          }
        />
        <Route path="admin" element={<AdminPage />} />
        <Route path="org" element={<OrgChartPage />} />
        <Route path="allocation" element={<AllocationPage />} />
      </Route>
    </Routes>
  );
}
