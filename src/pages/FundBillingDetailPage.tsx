import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingDetail } from '@/components/fund/FundBillingDetail';
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
  const { ready, getReport, commitReport, createReport } = useFundBilling();

  useEffect(() => {
    if (!ready || projectId !== 'new') return;
    const created = createReport();
    navigate(`/fund/billing/${created.id}?month=${created.monthKey}`, { replace: true });
  }, [ready, projectId, createReport, navigate]);

  useEffect(() => {
    if (!ready || !projectId || projectId === 'new') return;
    if (monthKey) return;
    const latest = getReport(projectId);
    if (latest?.monthKey) {
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
          <Link to="/fund/billing">집계현황으로 돌아가기</Link>
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
