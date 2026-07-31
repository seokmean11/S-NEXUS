import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useApp } from '@/context/AppContext';
import type { AmendmentSequence, ContractAmendment, ContractEditTarget } from '@/types/contractChange';
import {
  buildContractTimeline,
  buildFinalChangeStatusItems,
  formatContractAmount,
  formatContractDate,
  getAmendmentsForProject,
  getProjectBaseline,
} from '@/utils/contractChange';
import type { ContractChangeStatusItem } from '@/types/contractChange';

interface ContractHistoryPanelProps {
  projectId: string;
  onEditTarget: (target: ContractEditTarget) => void;
}

function renderChangeStatusItem(item: ContractChangeStatusItem) {
  const directionClass =
    item.direction === 'up' ? 'contract-delta--up' : 'contract-delta--down';
  const directionLabel = item.direction === 'up' ? '증' : '감';

  return (
    <span className={`contract-change-status-item ${directionClass}`}>
      <span className="contract-change-status-item__label">{item.label}</span>
      <span className="contract-change-status-item__value">{item.value}</span>
      <span className="contract-change-status-item__tag">({directionLabel})</span>
    </span>
  );
}

export function ContractHistoryPanel({ projectId, onEditTarget }: ContractHistoryPanelProps) {
  const { projects, contractAmendments, deleteContractAmendment } = useApp();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContractAmendment | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const amendments = useMemo(
    () => getAmendmentsForProject(contractAmendments, projectId),
    [contractAmendments, projectId],
  );

  const baseline = useMemo(
    () => (project ? getProjectBaseline(project) : null),
    [project],
  );

  const timeline = useMemo(() => {
    if (!baseline) return [];
    return buildContractTimeline(baseline, amendments);
  }, [baseline, amendments]);

  const finalChangeItems = useMemo(() => {
    if (!baseline) return [];
    return buildFinalChangeStatusItems(baseline, amendments);
  }, [baseline, amendments]);

  const lastSequence = amendments[amendments.length - 1]?.sequence;

  const showSuccessMessage = (text: string) => {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 3000);
  };

  const showErrorMessage = (text: string) => {
    setError(text);
    setMessage('');
    setTimeout(() => setError(''), 3000);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;

    const result = deleteContractAmendment(projectId, deleteTarget.id);
    setDeleteTarget(null);

    if (!result.ok) {
      showErrorMessage(result.reason);
      return;
    }

    showSuccessMessage('삭제가 완료되었습니다.');
  };

  const handleEditInitial = () => {
    onEditTarget('initial');
  };

  const handleEditSequence = (sequence: AmendmentSequence) => {
    onEditTarget(sequence);
  };

  if (!project) return null;

  return (
    <>
      <Card
        title="계약변경 이력"
        subtitle="차수별 수정·삭제는 이 패널에서, 신규 차수 등록은 상단 계약변경 버튼"
      >
        {message && <div className="toast toast--success no-print">{message}</div>}
        {error && <div className="toast toast--error no-print">{error}</div>}

        {timeline.length === 0 ? (
          <p className="contract-history__empty">이력 정보가 없습니다.</p>
        ) : (
          <>
            <div className="contract-timeline-table-wrap">
              <table className="contract-timeline-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>계약금액</th>
                    <th>시작일</th>
                    <th>종료일</th>
                    <th className="contract-timeline-table__actions">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((row) => {
                    const amendment = row.sequence
                      ? amendments.find((item) => item.id === row.key)
                      : undefined;

                    return (
                      <tr key={row.key}>
                        <td>
                          <strong>{row.label}</strong>
                        </td>
                        <td>
                          <span>{formatContractAmount(row.snapshot.contractAmount)}</span>
                        </td>
                        <td>
                          <span>{formatContractDate(row.snapshot.startDate)}</span>
                        </td>
                        <td>
                          <span>{formatContractDate(row.snapshot.endDate)}</span>
                        </td>
                        <td className="contract-timeline-table__actions">
                          <div className="contract-timeline-table__action-group">
                            {row.key === 'initial' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleEditInitial}
                              >
                                수정
                              </Button>
                            ) : amendment ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditSequence(amendment.sequence)}
                                >
                                  수정
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => setDeleteTarget(amendment)}
                                >
                                  삭제
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {amendments.length > 0 && (
              <div className="contract-history-summary">
                <div className="contract-history-summary__head">
                  <strong className="contract-history-summary__label">증감현황</strong>
                  <span className="contract-history-summary__basis">
                    변경 {lastSequence}차 − 최초
                  </span>
                </div>
                <div className="contract-history-summary__items">
                  {finalChangeItems.length === 0 ? (
                    <span className="contract-timeline-table__no-action">변동 없음</span>
                  ) : (
                    finalChangeItems.map((item) => (
                      <span key={item.label}>{renderChangeStatusItem(item)}</span>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="계약변경 차수 삭제"
        message={
          deleteTarget
            ? `변경 ${deleteTarget.sequence}차 기록을 삭제하시겠습니까?`
            : ''
        }
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
