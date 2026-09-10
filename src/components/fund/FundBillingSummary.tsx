import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FundBillingSummaryProjectFilter } from '@/components/fund/FundBillingSearchFields';
import { KoreanYearMonthInput } from '@/components/admin/KoreanYearMonthInput';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { FUND_BILLING_DEPARTMENTS } from '@/constants/fundBilling';
import { useFundBilling } from '@/context/FundBillingContext';
import { useFitTableCellText } from '@/hooks/useFitTableCellText';
import type { FundBillingProjectRow, FundBillingQuickFilter } from '@/types/fundBilling';
import {
  buildFundBillingExportTable,
  cumulativeSubcontractBilling,
  filterFundBillingRows,
  summarizeFundBillingRows,
} from '@/utils/fundBilling';
import {
  buildCashAnalysisSummaryRows,
  buildSummaryRowsFromLedger,
  latestCashAnalysisMonthKey,
  latestMonthKey,
  reportsForCashAnalysisMonth,
} from '@/utils/fundBillingReport';
import { formatMonthKeyToKorean } from '@/utils/formatInput';
import { downloadCsv } from '@/utils/reportExport';
import { loadLastFundBillingWriter } from '@/utils/fundBillingSessionDraft';

const QUICK_FILTERS: { id: FundBillingQuickFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행' },
  { id: 'completed', label: '완료' },
  { id: 'cashShort', label: '순자금 부족' },
];

export function FundBillingSummary({ variant = 'billing' }: { variant?: 'billing' | 'analysis' }) {
  const navigate = useNavigate();
  const { reports, createReport } = useFundBilling();
  const tablesRef = useRef<HTMLDivElement>(null);
  useFitTableCellText(tablesRef);
  const [keyword, setKeyword] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [monthKey, setMonthKey] = useState('');
  const [quickFilter, setQuickFilter] = useState<FundBillingQuickFilter>('all');

  const divisions = useMemo(
    () => FUND_BILLING_DEPARTMENTS.map((name) => ({ id: name, name })),
    [],
  );

  const fallbackMonth =
    variant === 'analysis' ? latestCashAnalysisMonthKey(reports) : reports.length ? latestMonthKey(reports) : '';
  const selectedMonth = monthKey || fallbackMonth;

  useEffect(() => {
    if (monthKey || !fallbackMonth) return;
    setMonthKey(fallbackMonth);
  }, [monthKey, fallbackMonth]);

  const monthRows = useMemo(() => {
    if (!selectedMonth) return [];
    if (variant === 'analysis') {
      return buildCashAnalysisSummaryRows(reports, selectedMonth);
    }
    return buildSummaryRowsFromLedger({ reports }, selectedMonth);
  }, [reports, selectedMonth, variant]);
  const projectLocked = Boolean(selectedProjectId);
  const filteredRows = useMemo(
    () =>
      filterFundBillingRows(monthRows, {
        keyword,
        divisionId,
        projectId: selectedProjectId || undefined,
        quickFilter: projectLocked ? 'all' : quickFilter,
      }),
    [monthRows, keyword, divisionId, selectedProjectId, projectLocked, quickFilter],
  );
  const kpis = useMemo(() => summarizeFundBillingRows(filteredRows), [filteredRows]);
  const listTotals = useMemo(
    () => ({
      contractAmount: filteredRows.reduce((sum, row) => sum + row.contractAmount, 0),
      collectedPrior: filteredRows.reduce((sum, row) => sum + row.collectedPrior, 0),
      expectedCollectionMonth: filteredRows.reduce((sum, row) => sum + row.expectedCollectionMonth, 0),
      collectedTotal: filteredRows.reduce((sum, row) => sum + row.collectedTotal, 0),
      uncollected: filteredRows.reduce((sum, row) => sum + row.uncollected, 0),
      subcontractContractTotal: filteredRows.reduce((sum, row) => sum + row.subcontractContractTotal, 0),
      subcontractPriorBilling: filteredRows.reduce((sum, row) => sum + row.subcontractPriorBilling, 0),
      expectedBillingMonth: filteredRows.reduce((sum, row) => sum + row.expectedBillingMonth, 0),
      billedCumulative: filteredRows.reduce((sum, row) => sum + cumulativeSubcontractBilling(row), 0),
    }),
    [filteredRows],
  );

  const projectChoices = useMemo(
    () =>
      (divisionId
        ? monthRows.filter((row) => row.divisionId === divisionId || row.divisionName === divisionId)
        : monthRows
      ).map((row) => ({
        id: row.projectId,
        name: row.projectName,
        projectCode: row.projectCode,
      })),
    [monthRows, divisionId],
  );

  const divisionOptions = useMemo(
    () => [
      { value: '', label: '전체 본부' },
      ...divisions.map((division) => ({ value: division.id, label: division.name })),
    ],
    [divisions],
  );

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`기성관리_집계_${today}.csv`, buildFundBillingExportTable(filteredRows));
  };

  const resultMeta = useMemo(() => {
    const types = [...new Set(filteredRows.map((row) => row.divisionName).filter(Boolean))];
    return {
      department: types.length === 0 ? '-' : types.length === 1 ? types[0] : types.join(' · '),
      asOf: formatMonthKeyToKorean(selectedMonth) || '-',
    };
  }, [filteredRows, selectedMonth]);

  const availableMonthKeys = useMemo(() => {
    const keys = [...new Set(reports.map((item) => item.monthKey).filter(Boolean))].sort();
    if (variant !== 'analysis') return keys;
    return keys.filter((key) => reportsForCashAnalysisMonth(reports, key).length > 0);
  }, [reports, variant]);
  const monthHasReports = monthRows.length > 0;
  const showCashPanels = variant === 'analysis';

  return (
    <div ref={tablesRef}>
      <Card
        title={variant === 'analysis' ? '자금수지 현황 검색' : '집계현황 검색'}
        className="fund-billing-section fund-billing-search-card"
      >
        <div className="fund-billing-toolbar no-print">
          <KoreanYearMonthInput
            label="연월검색 (필수)"
            value={selectedMonth}
            existingMonthKeys={availableMonthKeys}
            onChange={(next) => {
              setMonthKey(next);
              setKeyword('');
              setSelectedProjectId('');
              setDivisionId('');
              setQuickFilter('all');
            }}
          />
          <Select
            label="사업유형"
            value={divisionId}
            onChange={(event) => {
              setDivisionId(event.target.value);
              setKeyword('');
              setSelectedProjectId('');
            }}
            options={divisionOptions}
          />
          <FundBillingSummaryProjectFilter
            projects={projectChoices}
            value={keyword}
            onChange={(next) => {
              setKeyword(next);
              setSelectedProjectId('');
            }}
            onSelectProject={(project) => {
              setKeyword(project.name);
              setSelectedProjectId(project.id);
              setQuickFilter('all');
            }}
          />
          <div className={`fund-billing-chips${projectLocked ? ' is-disabled' : ''}`}>
            <span className="form-field__label">빠른 필터</span>
            <div className="fund-billing-chips__row">
              {QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  disabled={projectLocked}
                  className={`fund-billing-chip ${!projectLocked && quickFilter === filter.id ? 'fund-billing-chip--active' : ''}`}
                  onClick={() => {
                    if (projectLocked) return;
                    setQuickFilter(filter.id);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {showCashPanels ? (
        <>
      <Card
        title="자금수지 검색결과"
        className="fund-billing-section fund-billing-result-card"
        subtitle="검색한 연월의 월별 기성보고서 수금·집행·수지입니다. 해당 월 데이터가 없으면 결과가 없습니다."
      >
        <div className={`fund-billing-result-stat ${kpis.netCash < 0 ? 'is-minus' : 'is-plus'}`}>
          <div className="fund-billing-result-stat__item">
            <span className="fund-billing-result-stat__label">수지금액</span>
            <strong className="fund-billing-result-stat__value">{won(kpis.netCash)}</strong>
            <span className="fund-billing-result-stat__hint">수금누계 − 집행누계</span>
          </div>
          <div className="fund-billing-result-stat__divider" aria-hidden="true" />
          <div className="fund-billing-result-stat__item">
            <span className="fund-billing-result-stat__label">수지율</span>
            <strong className="fund-billing-result-stat__value">
              {kpis.contractAmount ? formatCashRate(kpis.cashRate) : '-'}
            </strong>
            <span className="fund-billing-result-stat__hint">(수금누계 − 집행누계) ÷ 계약총액</span>
          </div>
        </div>
        <div className="fund-billing-result-wrap">
          <table className="fund-sheet__meta">
            <colgroup>
              <col className="fund-billing-result-col fund-billing-result-col--label" />
              <col className="fund-billing-result-col fund-billing-result-col--head" />
              <col className="fund-billing-result-col fund-billing-result-col--num" />
              <col className="fund-billing-result-col fund-billing-result-col--head" />
              <col className="fund-billing-result-col fund-billing-result-col--num" />
              <col className="fund-billing-result-col fund-billing-result-col--head" />
              <col className="fund-billing-result-col fund-billing-result-col--num" />
              <col className="fund-billing-result-col fund-billing-result-col--head" />
              <col className="fund-billing-result-col fund-billing-result-col--num" />
              <col className="fund-billing-result-col fund-billing-result-col--rate" />
            </colgroup>
            <tbody>
              <tr>
                <th colSpan={2}>사업유형</th>
                <td>
                  <strong>{resultMeta.department}</strong>
                </td>
                <th>기준월</th>
                <td colSpan={4}>
                  <strong>{resultMeta.asOf}</strong>
                </td>
                <th>검색결과</th>
                <td className="fund-billing-result-count">{filteredRows.length}건</td>
              </tr>
              <tr className="fund-billing-result-row fund-billing-result-row--in">
                <th className="fund-billing-result-row__cat">수주</th>
                <th>계약총액</th>
                <td className="fund-sheet__num">{won(kpis.contractAmount)}</td>
                <th>전회수금누계</th>
                <td className="fund-sheet__num">{won(kpis.collectedPrior)}</td>
                <th>금월수금예정</th>
                <td className="fund-sheet__num">{won(kpis.expectedCollectionMonth)}</td>
                <th>수금누계</th>
                <td className="fund-sheet__num">{won(kpis.collectedTotal)}</td>
                <td className="fund-sheet__pct-cell">
                  {kpis.contractAmount ? formatRate(kpis.collectionRate) : '-'}
                </td>
              </tr>
              <tr className="fund-billing-result-row fund-billing-result-row--out">
                <th className="fund-billing-result-row__cat">집행</th>
                <th className="fund-billing-result-th-stack">
                  실행예산총액
                  <span className="fund-billing-result-th-note">(직접원가)</span>
                </th>
                <td className="fund-sheet__num">{won(kpis.executionBudget)}</td>
                <th>전회집행누계</th>
                <td className="fund-sheet__num">{won(kpis.subcontractPriorBilling)}</td>
                <th>금월집행예정</th>
                <td className="fund-sheet__num">{won(kpis.monthSpendExpected)}</td>
                <th>집행누계</th>
                <td className="fund-sheet__num">{won(kpis.spentTotal)}</td>
                <td className="fund-sheet__pct-cell">
                  {kpis.executionBudget || kpis.contractAmount ? formatRate(kpis.spendRate) : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
        </>
      ) : null}

      <Card
        title="집계현황"
        className="fund-billing-list-card"
        subtitle="자금수지 현황 검색 조건(연월 필수)에 맞는 해당 월 보고서입니다. 행을 누르면 월별 기성보고서로 이동합니다."
        headerAction={
          <div className="fund-billing-list-actions">
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const last = loadLastFundBillingWriter();
                if (last) {
                  navigate(`/fund/billing/${last.id}?month=${last.monthKey}`);
                  return;
                }
                const created = createReport();
                navigate(`/fund/billing/${created.id}?month=${created.monthKey}`);
              }}
            >
              월별 기성보고서 작성
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
        <div className="fund-billing-table-wrap">
          <table className="fund-billing-table">
            <thead>
              <tr>
                <th className="fund-billing-table__sticky" rowSpan={2}>프로젝트</th>
                <th rowSpan={2}>사업유형</th>
                <th rowSpan={2}>상태</th>
                <th className="fund-billing-table__group fund-billing-table__seg-start" colSpan={6}>수금현황</th>
                <th className="fund-billing-table__group fund-billing-table__seg-start" colSpan={4}>집행예산</th>
              </tr>
              <tr>
                <th className="fund-billing-table__num fund-billing-table__seg-start">계약총액</th>
                <th className="fund-billing-table__num">전회수금누계</th>
                <th className="fund-billing-table__num">금회수령 예정</th>
                <th className="fund-billing-table__num">누계 수령금액</th>
                <th className="fund-billing-table__rate">기성률</th>
                <th className="fund-billing-table__num">잔여 수령액</th>
                <th className="fund-billing-table__num fund-billing-table__seg-start">실행예산 직접원가</th>
                <th className="fund-billing-table__num">전회집행누계</th>
                <th className="fund-billing-table__num">금회집행 예정</th>
                <th className="fund-billing-table__num">집행예산 누계</th>
              </tr>
              {filteredRows.length > 0 ? (
                <tr className="fund-billing-table__total">
                  <td className="fund-billing-table__sticky fund-billing-table__total-label" colSpan={3}>
                    <strong>합계</strong>
                    <span className="fund-billing-table__sub">{filteredRows.length}건</span>
                  </td>
                  <td className="fund-billing-table__num fund-billing-table__seg-start">{won(listTotals.contractAmount)}</td>
                  <td className="fund-billing-table__num">{won(listTotals.collectedPrior)}</td>
                  <td className="fund-billing-table__num">
                    {won(listTotals.expectedCollectionMonth)}
                  </td>
                  <td className="fund-billing-table__num">
                    {won(listTotals.collectedTotal)}
                  </td>
                  <td className="fund-billing-table__rate">
                    {listTotals.contractAmount
                      ? formatRate((listTotals.collectedTotal / listTotals.contractAmount) * 100)
                      : '-'}
                  </td>
                  <td className="fund-billing-table__num">{won(listTotals.uncollected)}</td>
                  <td className="fund-billing-table__num fund-billing-table__seg-start">
                    {won(listTotals.subcontractContractTotal)}
                  </td>
                  <td className="fund-billing-table__num">
                    {won(listTotals.subcontractPriorBilling)}
                  </td>
                  <td className="fund-billing-table__num">
                    {won(listTotals.expectedBillingMonth)}
                  </td>
                  <td className="fund-billing-table__num">
                    {won(listTotals.billedCumulative)}
                  </td>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="fund-billing-table__empty">
                    {!monthHasReports
                      ? '선택한 연월에 작성된 월별 기성보고서가 없습니다.'
                      : '조건에 맞는 프로젝트가 없습니다.'}
                  </td>
                </tr>
              ) : (
                <>
                  {filteredRows.map((row) => (
                  <tr
                    key={row.projectId}
                    tabIndex={0}
                    className="fund-billing-table__row"
                    onClick={() =>
                      navigate(
                        `/fund/billing/${row.projectId}?month=${row.monthKey || selectedMonth}`,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(
                          `/fund/billing/${row.projectId}?month=${row.monthKey || selectedMonth}`,
                        );
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
                    <td className="fund-billing-table__num fund-billing-table__seg-start">{won(row.contractAmount)}</td>
                    <td className="fund-billing-table__num">{won(row.collectedPrior)}</td>
                    <td className="fund-billing-table__num">{won(row.expectedCollectionMonth)}</td>
                    <td className="fund-billing-table__num">{won(row.collectedTotal)}</td>
                    <td className="fund-billing-table__rate">
                      {row.contractAmount ? formatRate(row.collectionRate) : '-'}
                    </td>
                    <td className="fund-billing-table__num">{won(row.uncollected)}</td>
                    <td className="fund-billing-table__num fund-billing-table__seg-start">{won(row.subcontractContractTotal)}</td>
                    <td className="fund-billing-table__num">{won(row.subcontractPriorBilling)}</td>
                    <td className="fund-billing-table__num">{won(row.expectedBillingMonth)}</td>
                    <td className="fund-billing-table__num">
                      {won(cumulativeSubcontractBilling(row))}
                    </td>
                  </tr>
                ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function won(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('ko-KR') : '0';
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function formatCashRate(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : Number(value.toFixed(1));
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return '0%';
}

function billingStatusLabel(status: FundBillingProjectRow['status']): string {
  return status === '완료' ? '완료' : '진행';
}

function statusBadge(status: FundBillingProjectRow['status']): string {
  if (status === '완료') return 'badge--gray';
  return 'badge--green';
}
