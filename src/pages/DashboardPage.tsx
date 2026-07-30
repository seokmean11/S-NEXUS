import { useApp } from '@/context/AppContext';
import { ProjectList } from '@/components/dashboard/ProjectList';
import { ContributionCards } from '@/components/dashboard/ContributionCards';
import { BudgetPanel } from '@/components/budget/BudgetPanel';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/data/mockData';

export function DashboardPage() {
  const {
    role,
    roleConfig,
    permissions,
    visibleProjects,
    contributionCards,
    budget,
    riskScenario,
    setRiskScenario,
    allocations,
  } = useApp();

  const totalContract = visibleProjects.reduce(
    (sum, p) => sum + (p.contractAmount ?? 0),
    0,
  );

  const showBudgetPanel =
    role === 'team_manager' ||
    role === 'dev_admin' ||
    permissions.canViewAll;

  return (
    <div className="dashboard-page">
      <div className="print-header print-only">
        <h1>최고경영진 프로젝트 성과 보고서</h1>
        <p>발행일: {new Date().toLocaleDateString('ko-KR')} · 전사 데이터</p>
      </div>

      <div className="page-header no-print">
        <h2>
          {role === 'team_member'
            ? `${roleConfig.userName}님의 기여도`
            : '프로젝트 성과 대시보드'}
        </h2>
        <p>
          {permissions.canViewAll
            ? '전사 프로젝트 현황을 확인합니다.'
            : role === 'division_head'
              ? `${roleConfig.userName} · 사업본부 범위`
              : role === 'team_manager'
                ? `${roleConfig.userName} · 팀 범위`
                : '참여 프로젝트 기여도'}
        </p>
      </div>

      {role !== 'team_member' && (
        <div className="stats-row">
          <Card className="stat-card">
            <span className="stat-card__label">프로젝트</span>
            <strong className="stat-card__value">{visibleProjects.length}건</strong>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__label">총 계약금액</span>
            <strong className="stat-card__value">{formatCurrency(totalContract)}</strong>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__label">배분 완료</span>
            <strong className="stat-card__value">
              {allocations.filter((a) =>
                visibleProjects.some((p) => p.id === a.projectId),
              ).length}
              건
            </strong>
          </Card>
        </div>
      )}

      {role === 'team_member' ? (
        <ContributionCards cards={contributionCards} />
      ) : (
        <>
          <ProjectList projects={visibleProjects} readOnly={permissions.isReadOnly} />

          {permissions.canViewAll && (
            <Card title="전사 프로젝트 요약" className="print-section">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>프로젝트</th>
                    <th>사업본부</th>
                    <th>팀</th>
                    <th>상태</th>
                    <th>계약금액</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.divisionName}</td>
                      <td>{p.teamName}</td>
                      <td>{p.status}</td>
                      <td>{p.contractAmount ? formatCurrency(p.contractAmount) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {showBudgetPanel && (
        <BudgetPanel
          budget={budget}
          riskScenario={riskScenario}
          onScenarioChange={setRiskScenario}
          readOnly={permissions.isReadOnly && !permissions.canViewAll}
        />
      )}
    </div>
  );
}
