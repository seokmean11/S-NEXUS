import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { formatCurrency } from '@/data/mockData';
import type { FundBillingProjectRow, FundBillingQuickFilter } from '@/types/fundBilling';
import {
  buildFundBillingExportTable,
  cumulativeSubcontractBilling,
  filterFundBillingRows,
  remainingBilling,
  summarizeFundBillingRows,
} from '@/utils/fundBilling';
import { downloadCsv } from '@/utils/reportExport';

const QUICK_FILTERS: { id: FundBillingQuickFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행' },
  { id: 'completed', label: '완료' },
  { id: 'uncollected', label: '미수금' },
  { id: 'unpaid', label: '미지급' },
  { id: 'cashShort', label: '순자금 부족' },
];

interface FundBillingSummaryProps {
  rows: FundBillingProjectRow[];
  divisions: { id: string; name: string }[];
}

export function FundBillingSummary({ rows, divisions }: FundBillingSummaryProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [quickFilter, setQuickFilter] = useState<FundBillingQuickFilter>('all');

  const filteredRows = useMemo(
    () => filterFundBillingRows(rows, { keyword, divisionId, quickFilter }),
    [rows, keyword, divisionId, quickFilter],
  );
  const kpis = useMemo(() => summarizeFundBillingRows(filteredRows), [filteredRows]);

  const divisionOptions = useMemo(
    () => [
          { value: '', label: '전체 사업부' },
      ...divisions.map((division) => ({ value: division.id, label: division.name })),
    ],
    [divisions],
  );

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`기성관리_집계_${today}.csv`, buildFundBillingExportTable(filteredRows));
  };

  return (
    <>
      <Card title="수금현황" className="fund-billing-section">
        <div className="fund-billing-kpis">
          <KpiCard label="프로젝트 건수" value={`${kpis.projectCount.toLocaleString('ko-KR')}건`} />
          <KpiCard label="PJT 계약총액" value={formatCurrency(kpis.contractAmount)} />
          <KpiCard label="전회수령누계" value={formatCurrency(kpis.collectedPrior)} />
          <KpiCard label="금회수령 예정" value={formatCurrency(kpis.expectedCollectionMonth)} />
          <KpiCard label="누계 수령금액" value={formatCurrency(kpis.collectedTotal)} />
          <KpiCard label="잔여 수령액" value={formatCurrency(kpis.uncollected)} tone="warn" />
        </div>
      </Card>

      <Card title="집행현황(하도급)" className="fund-billing-section">
        <div className="fund-billing-kpis">
          <KpiCard label="계약건수" value={`${kpis.subcontractCount.toLocaleString('ko-KR')}건`} />
          <KpiCard label="하도급 계약총액" value={formatCurrency(kpis.subcontractContractTotal)} />
          <KpiCard label="전회기성누계" value={formatCurrency(kpis.subcontractPriorBilling)} />
          <KpiCard label="금회기성 예정" value={formatCurrency(kpis.expectedBillingMonth)} />
          <KpiCard label="기성금액 누계" value={formatCurrency(kpis.subcontractPriorBilling + kpis.expectedBillingMonth)} />
          <KpiCard
            label="잔여 기성"
            value={formatCurrency(Math.max(0, kpis.subcontractContractTotal - (kpis.subcontractPriorBilling + kpis.expectedBillingMonth)))}
            tone="warn"
          />
        </div>
      </Card>

      <Card
        title="집계현황"
        className="fund-billing-list-card"
        subtitle="월별 기성보고서에서 작성한 프로젝트별 최신 내용입니다. 행을 누르면 해당 보고서로 이동합니다."
        headerAction={
          <div className="fund-billing-list-actions">
            <Button variant="primary" size="sm" onClick={() => navigate('/fund/billing/new')}>
              신규 월별 기성보고서
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={filteredRows.length === 0}
            >
              엑셀 다운로드
            </Button>
          </div>
        }
      >
        <div className="fund-billing-toolbar no-print">
          <Input
            label="검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="집계명, 기성시트명, PM"
          />
          <Select
            label="사업부"
            value={divisionId}
            onChange={(event) => setDivisionId(event.target.value)}
            options={divisionOptions}
          />
          <div className="fund-billing-chips">
            <span className="form-field__label">빠른 필터</span>
            <div className="fund-billing-chips__row">
              {QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`fund-billing-chip ${quickFilter === filter.id ? 'fund-billing-chip--active' : ''}`}
                  onClick={() => setQuickFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="fund-billing-table-wrap">
          <table className="fund-billing-table">
            <thead>
              <tr>
                <th className="fund-billing-table__sticky" rowSpan={2}>프로젝트</th>
                <th rowSpan={2}>사업부</th>
                <th rowSpan={2}>상태</th>
                <th className="fund-billing-table__group" colSpan={5}>수금현황</th>
                <th className="fund-billing-table__group" colSpan={5}>집행현황(하도급)</th>
              </tr>
              <tr>
                <th className="fund-billing-table__num">PJT 계약총액</th>
                <th className="fund-billing-table__num">전회수령누계</th>
                <th className="fund-billing-table__num">금회수령 예정</th>
                <th className="fund-billing-table__num">누계 수령금액</th>
                <th className="fund-billing-table__num">잔여 수령액</th>
                <th className="fund-billing-table__num">하도급 계약총액</th>
                <th className="fund-billing-table__num">전회기성누계</th>
                <th className="fund-billing-table__num">금회기성 예정</th>
                <th className="fund-billing-table__num">기성금액 누계</th>
                <th className="fund-billing-table__num">잔여 기성</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="fund-billing-table__empty">
                    조건에 맞는 프로젝트가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.projectId}
                    tabIndex={0}
                    className="fund-billing-table__row"
                    onClick={() => navigate(`/fund/billing/${row.projectId}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/fund/billing/${row.projectId}`);
                      }
                    }}
                  >
                    <td className="fund-billing-table__sticky">
                      <strong>{row.projectName}</strong>
                      <span className="fund-billing-table__sub">{row.projectCode}</span>
                    </td>
                    <td>{row.divisionName}</td>
                    <td>
                      <span className={`badge badge--sm ${statusBadge(row.status)}`}>
                        {billingStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="fund-billing-table__num">{formatCurrency(row.contractAmount)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.collectedPrior)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.expectedCollectionMonth)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.collectedTotal)}</td>
                    <td className="fund-billing-table__num">{formatAmountAlert(row.uncollected)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.subcontractContractTotal)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.subcontractPriorBilling)}</td>
                    <td className="fund-billing-table__num">{formatCurrency(row.expectedBillingMonth)}</td>
                    <td className="fund-billing-table__num">
                      {formatCurrency(cumulativeSubcontractBilling(row))}
                    </td>
                    <td className="fund-billing-table__num">{formatAmountAlert(remainingBilling(row))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  return (
    <Card className={`stat-card fund-billing-kpi ${tone ? `fund-billing-kpi--${tone}` : ''}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
    </Card>
  );
}

function formatAmountAlert(value: number): string {
  return value > 0 ? formatCurrency(value) : '-';
}

function billingStatusLabel(status: FundBillingProjectRow['status']): string {
  return status === '완료' ? '완료' : '진행';
}

function statusBadge(status: FundBillingProjectRow['status']): string {
  if (status === '완료') return 'badge--gray';
  return 'badge--green';
}
