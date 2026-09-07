import { mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import type { Project } from '@/types';
import type {
  FundBillingKpis,
  FundBillingLedger,
  FundBillingProjectRow,
  FundBillingQuickFilter,
  FundSubcontract,
} from '@/types/fundBilling';
import type { ExportTable } from '@/utils/reportExport';

export function aggregateFundBillingRows(
  projects: Project[],
  ledger: FundBillingLedger,
): FundBillingProjectRow[] {
  const collectionsByProject = groupBy(ledger.collections, (item) => item.projectId);
  const subcontractsByProject = groupBy(ledger.subcontracts, (item) => item.projectId);
  const billingsByProject = groupBy(ledger.billings, (item) => item.projectId);

  return projects.map((project) => {
    const collections = collectionsByProject.get(project.id) ?? [];
    const subcontracts = subcontractsByProject.get(project.id) ?? [];
    const billings = billingsByProject.get(project.id) ?? [];
    const contractAmount = project.contractAmount ?? 0;
    const billedTotal = sum(collections.map((item) => item.billedAmount));
    const collectedTotal = sum(collections.map((item) => item.collectedAmount));
    const subcontractContractTotal = sum(subcontracts.map((item) => item.contractAmount));
    const subcontractBillingTotal = sum(billings.map((item) => item.billingAmount));
    const paidTotal = sum(billings.map((item) => item.paidAmount));

    return {
      projectId: project.id,
      projectCode: project.projectCode?.trim() || '-',
      projectName: project.name,
      clientName: project.clientName?.trim() || '-',
      divisionId: project.divisionId,
      divisionName: project.divisionName,
      teamName: project.teamName,
      status: project.status,
      startDate: project.startDate,
      contractAmount,
      billedTotal: collectedTotal,
      collectedPrior: 0,
      collectedTotal,
      uncollected: Math.max(0, billedTotal - collectedTotal),
      collectionRate: contractAmount > 0 ? (collectedTotal / contractAmount) * 100 : 0,
      expectedCollectionMonth: 0,
      subcontractCount: subcontracts.length,
      subcontractContractTotal,
      subcontractPriorBilling: sum(subcontracts.map((item) => item.priorPaid ?? 0)),
      expectedBillingMonth: sum(subcontracts.map((item) => item.monthClaim ?? 0)),
      subcontractBillingTotal,
      paidTotal,
      unpaid: Math.max(0, subcontractBillingTotal - paidTotal),
      netCash: collectedTotal - paidTotal,
      cashRate: contractAmount > 0 ? ((collectedTotal - paidTotal) / contractAmount) * 100 : 0,
    };
  });
}

export function summarizeFundBillingRows(rows: FundBillingProjectRow[]): FundBillingKpis {
  const contractAmount = sum(rows.map((row) => row.contractAmount));
  const collectedTotal = sum(rows.map((row) => row.collectedTotal));
  const netCash = sum(rows.map((row) => row.netCash));
  const spentPrior = sum(rows.map((row) => row.spentPrior ?? 0));
  const monthSpendExpected = sum(rows.map((row) => row.monthSpendExpected ?? 0));
  const executionBudget = sum(rows.map((row) => row.executionBudget ?? 0));
  const spentTotal = collectedTotal - netCash;
  const subcontractContractTotal = sum(rows.map((row) => row.subcontractContractTotal));
  return {
    projectCount: rows.length,
    contractAmount,
    collectedPrior: sum(rows.map((row) => row.collectedPrior)),
    expectedCollectionMonth: sum(rows.map((row) => row.expectedCollectionMonth)),
    collectedTotal,
    uncollected: sum(rows.map((row) => row.uncollected)),
    subcontractCount: sum(rows.map((row) => row.subcontractCount)),
    subcontractContractTotal,
    subcontractPriorBilling: sum(rows.map((row) => row.subcontractPriorBilling)),
    expectedBillingMonth: sum(rows.map((row) => row.expectedBillingMonth)),
    subcontractBillingTotal: sum(rows.map((row) => row.subcontractBillingTotal)),
    unpaid: sum(rows.map((row) => row.unpaid)),
    netCash,
    spentTotal,
    spentPrior,
    monthSpendExpected,
    executionBudget,
    collectionRate: contractAmount > 0 ? (collectedTotal / contractAmount) * 100 : 0,
    spendRate: executionBudget > 0 ? (spentTotal / executionBudget) * 100 : contractAmount > 0 ? (spentTotal / contractAmount) * 100 : 0,
    cashRate: contractAmount > 0 ? ((collectedTotal - spentTotal) / contractAmount) * 100 : 0,
    subcontractShareRate: contractAmount > 0 ? (subcontractContractTotal / contractAmount) * 100 : 0,
  };
}

export function filterFundBillingRows(
  rows: FundBillingProjectRow[],
  options: {
    keyword: string;
    divisionId: string;
    quickFilter: FundBillingQuickFilter;
    projectId?: string;
  },
): FundBillingProjectRow[] {
  const keyword = options.keyword.trim().toLowerCase();

  return rows.filter((row) => {
    if (
      options.divisionId &&
      mapTextToFundBillingDepartment(row.divisionId, row.divisionName) !==
        mapTextToFundBillingDepartment(options.divisionId)
    ) {
      return false;
    }

    if (options.projectId) {
      if (row.projectId !== options.projectId) return false;
    } else if (keyword) {
      const haystack = `${row.projectName} ${row.projectCode}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    switch (options.quickFilter) {
      case 'active':
        return row.status !== '완료';
      case 'completed':
        return row.status === '완료';
      case 'uncollected':
        return row.uncollected > 0;
      case 'unpaid':
        return row.unpaid > 0;
      case 'cashShort':
        return row.netCash < 0;
      default:
        return true;
    }
  });
}

export function buildFundBillingExportTable(rows: FundBillingProjectRow[]): ExportTable {
  return {
    headers: [
      '프로젝트명(집계)',
      '프로젝트명(기성시트)',
      '사업유형',
      'PM',
      '상태',
      'PJT 계약총액',
      '전회수령누계',
      '금회수령 예정',
      '누계 수령금액',
      '잔여 수령액',
      '하도급 계약총액',
      '전회기성누계',
      '금회기성 예정',
      '기성금액 누계',
      '잔여 기성',
    ],
    rows: rows.map((row) => [
      row.projectName,
      row.projectCode,
      row.divisionName,
      row.pmName ?? '',
      row.status === '완료' ? '완료' : '진행',
      String(Math.round(row.contractAmount)),
      String(Math.round(row.collectedPrior)),
      String(Math.round(row.expectedCollectionMonth)),
      String(Math.round(row.collectedTotal)),
      String(Math.round(row.uncollected)),
      String(Math.round(row.subcontractContractTotal)),
      String(Math.round(row.subcontractPriorBilling)),
      String(Math.round(row.expectedBillingMonth)),
      String(Math.round(cumulativeSubcontractBilling(row))),
      String(Math.round(remainingBilling(row))),
    ]),
  };
}

export function remainingBilling(row: FundBillingProjectRow): number {
  return Math.max(0, row.subcontractContractTotal - (row.subcontractPriorBilling + row.expectedBillingMonth));
}

export function cumulativeSubcontractBilling(row: FundBillingProjectRow): number {
  return row.subcontractPriorBilling + row.expectedBillingMonth;
}

export function subcontractsForProject(
  ledger: FundBillingLedger,
  projectId: string,
): FundSubcontract[] {
  return ledger.subcontracts.filter((item) => item.projectId === projectId);
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
