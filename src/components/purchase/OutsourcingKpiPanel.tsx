import { Card } from '@/components/ui/Card';
import type { OutsourcingKpiSummary } from '@/types/outsourcing';
import {
  formatOutsourcingAmount,
  formatUnitPriceDetail,
} from '@/utils/outsourcingAnalysis';

interface OutsourcingKpiPanelProps {
  summary: OutsourcingKpiSummary;
  rowCount: number;
}

export function OutsourcingKpiPanel({ summary, rowCount }: OutsourcingKpiPanelProps) {
  return (
    <Card title="검색결과(KPI)" className="outsourcing-kpi-card" subtitle={`필터 적용 ${rowCount.toLocaleString('ko-KR')}건`}>
      <dl className="outsourcing-kpi-list">
        <div className="outsourcing-kpi-row">
          <dt>외주_총금액</dt>
          <dd>{formatOutsourcingAmount(summary.totalAmount)}</dd>
        </div>
        <div className="outsourcing-kpi-row">
          <dt>외주_자재총금액</dt>
          <dd>{formatOutsourcingAmount(summary.materialTotal)}</dd>
        </div>
        <div className="outsourcing-kpi-row">
          <dt>외주_노무총금액</dt>
          <dd>{formatOutsourcingAmount(summary.laborTotal)}</dd>
        </div>
        <div className="outsourcing-kpi-row">
          <dt>외주_경비총금액</dt>
          <dd>{formatOutsourcingAmount(summary.expenseTotal)}</dd>
        </div>
        <div className="outsourcing-kpi-row outsourcing-kpi-row--detail">
          <dt>외주_자재단가(평균,MAX,MIN)</dt>
          <dd>
            <strong>{formatOutsourcingAmount(summary.materialUnitPrice.average)}</strong>
            <span>{formatUnitPriceDetail(summary.materialUnitPrice)}</span>
          </dd>
        </div>
        <div className="outsourcing-kpi-row outsourcing-kpi-row--detail">
          <dt>외주_노무단가(평균,MAX,MIN)</dt>
          <dd>
            <strong>{formatOutsourcingAmount(summary.laborUnitPrice.average)}</strong>
            <span>{formatUnitPriceDetail(summary.laborUnitPrice)}</span>
          </dd>
        </div>
        <div className="outsourcing-kpi-row outsourcing-kpi-row--detail">
          <dt>외주_경비단가(평균,MAX,MIN)</dt>
          <dd>
            <strong>{formatOutsourcingAmount(summary.expenseUnitPrice.average)}</strong>
            <span>{formatUnitPriceDetail(summary.expenseUnitPrice)}</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
