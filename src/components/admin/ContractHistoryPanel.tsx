import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import {
  buildContractTimeline,
  formatContractAmount,
  formatContractDate,
  getAmendmentsForProject,
  getProjectBaseline,
} from '@/utils/contractChange';

interface ContractHistoryPanelProps {
  projectId: string;
}

function getDeltaClass(delta?: string): string {
  if (!delta) return '';
  if (delta.includes('증')) return 'contract-delta--up';
  if (delta.includes('감')) return 'contract-delta--down';
  return '';
}

export function ContractHistoryPanel({ projectId }: ContractHistoryPanelProps) {
  const { projects, contractAmendments } = useApp();

  const project = projects.find((p) => p.id === projectId);
  const amendments = useMemo(
    () => getAmendmentsForProject(contractAmendments, projectId),
    [contractAmendments, projectId],
  );

  const timeline = useMemo(() => {
    if (!project) return [];
    return buildContractTimeline(getProjectBaseline(project), amendments);
  }, [project, amendments]);

  if (!project) return null;

  return (
    <Card title="계약변경 이력" subtitle="최초 등록값과 차수별 계약금액·기간">
      {timeline.length === 0 ? (
        <p className="contract-history__empty">이력 정보가 없습니다.</p>
      ) : (
        <div className="contract-timeline-table-wrap">
          <table className="contract-timeline-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>계약금액</th>
                <th>시작일</th>
                <th>종료일</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>
                    <span>{formatContractAmount(row.snapshot.contractAmount)}</span>
                    {row.amountDelta && (
                      <span className={`contract-delta ${getDeltaClass(row.amountDelta)}`}>
                        {row.amountDelta}
                      </span>
                    )}
                  </td>
                  <td>
                    <span>{formatContractDate(row.snapshot.startDate)}</span>
                    {row.startDateDelta && (
                      <span className={`contract-delta ${getDeltaClass(row.startDateDelta)}`}>
                        {row.startDateDelta}
                      </span>
                    )}
                  </td>
                  <td>
                    <span>{formatContractDate(row.snapshot.endDate)}</span>
                    {row.endDateDelta && (
                      <span className={`contract-delta ${getDeltaClass(row.endDateDelta)}`}>
                        {row.endDateDelta}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
