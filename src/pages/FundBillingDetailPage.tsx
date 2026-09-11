import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingDetail } from '@/components/fund/FundBillingDetail';
import { useAuth } from '@/context/AuthContext';
import { useFundBilling } from '@/context/FundBillingContext';
import { createBlankMonthReportFromTemplate } from '@/utils/fundBillingReport';
import {
  rememberFundBillingWriter,
  resolveFundBillingSessionDraft,
  sessionDraftToReport,
} from '@/utils/fundBillingSessionDraft';

export function FundBillingDetailPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const monthKey = searchParams.get('month') ?? undefined;
  const navigate = useNavigate();
  const { canEditMenu, canAccessPath } = useAuth();
  const { ready, getReport, commitReport, createReport } = useFundBilling();
  const canWriteBilling = canEditMenu('fundBilling');

  useEffect(() => {
    if (!ready || projectId !== 'new') return;
    if (!canWriteBilling) {
      navigate(
        canAccessPath('/fund/cash-analysis') ? '/fund/cash-analysis' : '/fund/billing',
        { replace: true },
      );
      return;
    }
    const created = createReport();
    navigate(`/fund/billing/${created.id}?month=${created.monthKey}`, { replace: true });
  }, [ready, projectId, canWriteBilling, canAccessPath, createReport, navigate]);

  useEffect(() => {
    if (!ready || !projectId || projectId === 'new') return;
    if (monthKey) return;
    const latest = getReport(projectId);
    if (latest?.monthKey) {
      navigate(`/fund/billing/${projectId}?month=${latest.monthKey}`, { replace: true });
    }
  }, [ready, projectId, monthKey, getReport, navigate]);

  useEffect(() => {
    if (!ready || !projectId || projectId === 'new' || !monthKey) return;
    if (getReport(projectId, monthKey)) return;
    const latest = getReport(projectId);
    if (latest?.monthKey && monthKey > latest.monthKey) {
      navigate(`/fund/billing/${projectId}?month=${latest.monthKey}`, { replace: true });
    }
  }, [ready, projectId, monthKey, getReport, navigate]);

  useEffect(() => {
    if (!projectId || projectId === 'new' || !monthKey) return;
    rememberFundBillingWriter(projectId, monthKey);
  }, [projectId, monthKey]);

  if (!ready || !projectId || projectId === 'new') {
    return (
      <div className="page-header">
        <h2>월별 기성보고서 작성</h2>
        <p>불러오는 중입니다.</p>
      </div>
    );
  }

  const exact = monthKey ? getReport(projectId, monthKey) : undefined;
  const latest = getReport(projectId);
  const viewingPastWithoutData = Boolean(
    monthKey && latest && !exact && monthKey < latest.monthKey,
  );
  const waitingForFuture = Boolean(
    monthKey && latest && !exact && monthKey > latest.monthKey,
  );
  const sessionDraft = monthKey
    ? resolveFundBillingSessionDraft(projectId, monthKey, exact?.updatedAt ?? latest?.updatedAt)
    : null;

  if (!monthKey || (waitingForFuture && !sessionDraft)) {
    return (
      <div className="page-header">
        <h2>월별 기성보고서 작성</h2>
        <p>불러오는 중입니다.</p>
      </div>
    );
  }

  const report =
    exact ??
    (sessionDraft ? sessionDraftToReport(sessionDraft) : undefined) ??
    (viewingPastWithoutData && latest && monthKey
      ? createBlankMonthReportFromTemplate(latest, monthKey)
      : latest);
  if (!report) {
    return (
      <div className="page-header">
        <h2>월별 기성보고서 작성</h2>
        <p>해당 프로젝트를 찾을 수 없습니다.</p>
        <p>
          <Link to="/fund/cash-analysis">자금수지 집계현황으로 돌아가기</Link>
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="기성 상세 화면 오류">
      <FundBillingDetail
        key={`${report.id}-${report.monthKey}`}
        report={report}
        onCommit={commitReport}
        onCreateNew={createReport}
      />
    </ErrorBoundary>
  );
}
