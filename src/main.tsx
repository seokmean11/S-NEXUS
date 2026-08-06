import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { BidManagementProvider } from '@/context/BidManagementContext';
import { AnalysisChatRuntimeProvider } from '@/context/AnalysisChatRuntimeContext';
import { OutsourcingSearchProvider } from '@/context/OutsourcingSearchContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppRoutes } from '@/App';
import '@/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="애플리케이션 오류">
      <AppProvider>
        <BrowserRouter>
          <AuthProvider>
            <BidManagementProvider>
              <OutsourcingSearchProvider>
                <AnalysisChatRuntimeProvider>
                  <AppRoutes />
                </AnalysisChatRuntimeProvider>
              </OutsourcingSearchProvider>
            </BidManagementProvider>
          </AuthProvider>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);
