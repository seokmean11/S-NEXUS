import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { ReportPeriod } from '@/types/history';
import { getQuarterInfo } from '@/utils/historyLogger';
import {
  getGroupContributionTrends,
  getHistoryTimelineSummary,
  getIndividualContributionTrends,
  getPersonnelChanges,
} from '@/utils/reportAnalytics';

const ACTION_LABELS: Record<string, string> = {
  created: '등록',
  updated: '수정',
  deleted: '삭제',
  saved: '저장',
};

export function AnalyticsReport() {
  const { historyEvents } = useApp();
  const defaultPeriod = getQuarterInfo();

  const [year, setYear] = useState(defaultPeriod.year);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(defaultPeriod.quarter);

  const period: ReportPeriod = { year, quarter };

  const personnelChanges = useMemo(
    () => getPersonnelChanges(historyEvents, period),
    [historyEvents, period],
  );
  const individualTrends = useMemo(
    () => getIndividualContributionTrends(historyEvents, period),
    [historyEvents, period],
  );
  const divisionTrends = useMemo(
    () => getGroupContributionTrends(historyEvents, period, 'division'),
    [historyEvents, period],
  );
  const teamTrends = useMemo(
    () => getGroupContributionTrends(historyEvents, period, 'team'),
    [historyEvents, period],
  );
  const summary = useMemo(
    () => getHistoryTimelineSummary(historyEvents, period),
    [historyEvents, period],
  );

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = defaultPeriod.year - i;
    return { value: String(y), label: `${y}년` };
  });

  return (
    <div className="reports-page">
      <div className="page-header no-print">
        <h2>분석 보고서</h2>
        <p>
          조직·프로젝트·인력 배분 변경 이력을 기반으로 분기별 분석합니다. (전년 동기 대비 포함)
        </p>
      </div>

      <Card title="분석 기간" className="no-print">
        <div className="reports-filters">
          <Select
            label="연도"
            options={yearOptions}
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Select
            label="분기"
            options={[
              { value: '1', label: '1분기 (1~3월)' },
              { value: '2', label: '2분기 (4~6월)' },
              { value: '3', label: '3분기 (7~9월)' },
              { value: '4', label: '4분기 (10~12월)' },
            ]}
            value={String(quarter)}
            onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
          />
        </div>
        <p className="reports-summary">
          {year}년 {quarter}분기 기록 {summary.total}건
          {Object.entries(summary.byCategory).map(([cat, count]) => (
            <span key={cat} className="reports-summary__tag">
              {cat}: {count}
            </span>
          ))}
        </p>
      </Card>

      <Card title={`${year}년 ${quarter}분기 인력 변화`}>
        {personnelChanges.length === 0 ? (
          <p className="empty-state">해당 분기 인력 변화 기록이 없습니다.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>일자</th>
                <th>구분</th>
                <th>이름</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              {personnelChanges.map((row, index) => (
                <tr key={`${row.date}-${row.name}-${index}`}>
                  <td>{row.date}</td>
                  <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                  <td>{row.name}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title={`개인별 기여도 추이 (${year}년 ${quarter}분기 vs ${year - 1}년 ${quarter}분기)`}
      >
        {individualTrends.length === 0 ? (
          <p className="empty-state">인력 배분 이력이 없어 비교할 수 없습니다.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>사업본부</th>
                <th>팀</th>
                <th>올해 합계(%)</th>
                <th>작년 동기(%)</th>
                <th>변화</th>
              </tr>
            </thead>
            <tbody>
              {individualTrends.map((row) => (
                <tr key={row.employeeId}>
                  <td>{row.employeeName}</td>
                  <td>{row.divisionName}</td>
                  <td>{row.teamName}</td>
                  <td>{row.currentTotal.toFixed(1)}</td>
                  <td>{row.previousTotal.toFixed(1)}</td>
                  <td className={row.delta >= 0 ? 'text-success' : 'text-danger'}>
                    {row.delta >= 0 ? '+' : ''}
                    {row.delta.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="reports-grid">
        <Card title="사업본부별 기여도 추이">
          {divisionTrends.length === 0 ? (
            <p className="empty-state">사업본부별 데이터 없음</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>사업본부</th>
                  <th>올해(%)</th>
                  <th>작년 동기(%)</th>
                  <th>변화</th>
                </tr>
              </thead>
              <tbody>
                {divisionTrends.map((row) => (
                  <tr key={row.groupId}>
                    <td>{row.groupName}</td>
                    <td>{row.currentTotal.toFixed(1)}</td>
                    <td>{row.previousTotal.toFixed(1)}</td>
                    <td className={row.delta >= 0 ? 'text-success' : 'text-danger'}>
                      {row.delta >= 0 ? '+' : ''}
                      {row.delta.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="팀별 기여도 추이">
          {teamTrends.length === 0 ? (
            <p className="empty-state">팀별 데이터 없음</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>팀</th>
                  <th>인원</th>
                  <th>올해(%)</th>
                  <th>작년 동기(%)</th>
                  <th>변화</th>
                </tr>
              </thead>
              <tbody>
                {teamTrends.map((row) => (
                  <tr key={row.groupId}>
                    <td>{row.groupName}</td>
                    <td>{row.memberCount}</td>
                    <td>{row.currentTotal.toFixed(1)}</td>
                    <td>{row.previousTotal.toFixed(1)}</td>
                    <td className={row.delta >= 0 ? 'text-success' : 'text-danger'}>
                      {row.delta >= 0 ? '+' : ''}
                      {row.delta.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
