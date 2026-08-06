import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardPage } from '@/pages/DashboardPage';
import { AdminPage } from '@/pages/AdminPage';
import { AllocationPage } from '@/pages/AllocationPage';
import { OrgChartPage } from '@/pages/OrgChartPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { PurchaseLayout } from '@/pages/PurchaseLayout';
import { BidManagementPage } from '@/pages/BidManagementPage';
import { OutsourcingSearchPage } from '@/pages/OutsourcingSearchPage';
import { MiscInfoLayout } from '@/pages/MiscInfoLayout';
import { ExhibitionBusinessCostPage } from '@/pages/ExhibitionBusinessCostPage';
import { DataFolderPage } from '@/pages/DataFolderPage';

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
        <Route
          path="data-folder"
          element={
            <ErrorBoundary fallbackTitle="데이터폴더 화면 오류">
              <DataFolderPage />
            </ErrorBoundary>
          }
        />
        <Route path="admin" element={<AdminPage />} />
        <Route path="org" element={<OrgChartPage />} />
        <Route path="personnel" element={<Navigate to="/org" replace />} />
        <Route path="allocation" element={<AllocationPage />} />
        <Route
          path="analysis"
          element={
            <ErrorBoundary fallbackTitle="분석 화면 오류">
              <AnalysisPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="outsourcing"
          element={
            <ErrorBoundary fallbackTitle="외주정보검색 화면 오류">
              <OutsourcingSearchPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="purchase"
          element={
            <ErrorBoundary fallbackTitle="구매관리 화면 오류">
              <PurchaseLayout />
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="bidding" replace />} />
          <Route path="bidding" element={<BidManagementPage />} />
          <Route path="outsourcing" element={<Navigate to="/outsourcing" replace />} />
        </Route>
        <Route
          path="misc-info"
          element={
            <ErrorBoundary fallbackTitle="기타정보 화면 오류">
              <MiscInfoLayout />
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="exhibition-business-cost" replace />} />
          <Route path="exhibition-business-cost" element={<ExhibitionBusinessCostPage />} />
        </Route>
        <Route path="reports" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
