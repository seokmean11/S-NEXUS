import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FundBillingDetail } from '@/components/fund/FundBillingDetail';
import { useFundBilling } from '@/context/FundBillingContext';

export function FundBillingDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { ready, getReport, commitReport, createReport } = useFundBilling();

  useEffect(() => {
    if (!ready || projectId !== 'new') return;
    const created = createReport();
    navigate(`/fund/billing/${created.id}`, { replace: true });
  }, [ready, projectId, createReport, navigate]);

  if (!ready || projectId === 'new') {
    return (
      <div className="page-header">
        <h2>월별 기성보고서</h2>
        <p>불러오는 중입니다.</p>
      </div>
    );
  }

  const report = projectId ? getReport(projectId) : undefined;
  if (!report) {
    return (
      <div className="page-header">
        <h2>기성관리</h2>
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
