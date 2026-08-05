import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/data/mockData';
import type { ExhibitionBusinessCostSummary } from '@/types/exhibitionBusinessCost';

interface ExhibitionBusinessCostDashboardProps {
  summary: ExhibitionBusinessCostSummary;
}

function formatShare(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function ExhibitionBusinessCostDashboard({ summary }: ExhibitionBusinessCostDashboardProps) {
  const maxCost = summary.items.reduce((max, item) => Math.max(max, item.totalCost), 0);

  return (
    <div className="exhibition-business-cost-dashboard">
      <div className="exhibition-business-cost-dashboard__kpis">
        <Card title="전시 프로젝트" className="exhibition-business-cost-kpi">
          <p className="exhibition-business-cost-kpi__value">
            {summary.projectCount.toLocaleString('ko-KR')}
            <span className="exhibition-business-cost-kpi__unit">건</span>
          </p>
        </Card>
        <Card title="총 사업비" className="exhibition-business-cost-kpi">
          <p className="exhibition-business-cost-kpi__value">{formatCurrency(summary.totalCost)}</p>
        </Card>
        <Card title="프로젝트당 평균" className="exhibition-business-cost-kpi">
          <p className="exhibition-business-cost-kpi__value">{formatCurrency(summary.averageCost)}</p>
        </Card>
      </div>

      <Card title="유형별 사업비" subtitle="전시 사업 유형 기준 집계">
        <div className="exhibition-business-cost-chart">
          {summary.items.map((item) => (
            <div key={item.type} className="exhibition-business-cost-chart__row">
              <div className="exhibition-business-cost-chart__label">
                <strong>{item.type}</strong>
                <span>
                  {formatShare(item.sharePercent)} · {item.projectCount.toLocaleString('ko-KR')}건
                </span>
              </div>
              <div className="exhibition-business-cost-chart__bar-wrap">
                <div
                  className="exhibition-business-cost-chart__bar"
                  style={{ width: maxCost > 0 ? `${(item.totalCost / maxCost) * 100}%` : '0%' }}
                />
              </div>
              <div className="exhibition-business-cost-chart__amount">{formatCurrency(item.totalCost)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="유형별 상세" subtitle="금액·건수·비중">
        <div className="table-wrap">
          <table className="data-table exhibition-business-cost-table">
            <thead>
              <tr>
                <th>유형</th>
                <th>프로젝트</th>
                <th>사업비</th>
                <th>비중</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.map((item) => (
                <tr key={item.type}>
                  <td>{item.type}</td>
                  <td>{item.projectCount.toLocaleString('ko-KR')}건</td>
                  <td>{formatCurrency(item.totalCost)}</td>
                  <td>{formatShare(item.sharePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
