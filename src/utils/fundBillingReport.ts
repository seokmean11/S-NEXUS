import { mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import type { FundBillingProjectRow } from '@/types/fundBilling';
import type {
  FundBillingLedgerState,
  FundBillingReport,
  FundBillingSpendKind,
  FundBillingSpendLine,
} from '@/types/fundBillingReport';
import {
  IMPORTED_FUND_BILLING_AS_OF,
  getImportedFundBillingProjects,
} from '@/utils/fundBillingImported';
import { formatIsoToKoreanDate, parseKoreanDateToIso } from '@/utils/formatInput';

const OVERHEAD_TEMPLATES = [
  { key: 'directExpense', label: '직접경비' },
  { key: 'salary', label: '간접비(급여및의무보험료)' },
  { key: 'design', label: '설계비' },
  { key: 'common', label: '공통비' },
] as const;

export function inferSpendKind(no?: string): FundBillingSpendKind {
  const value = (no ?? '').trim();
  if (value === '전도금' || value.startsWith('전도금')) return 'advance';
  if (value === '인건비' || value.startsWith('인건비')) return 'labor';
  if (value === '작가비' || value.startsWith('작가비')) return 'other';
  if (value === '기타' || value.startsWith('기타')) return 'other';
  return 'subcontract';
}

export function monthKeyFromWrittenDate(value: string): string {
  const iso = parseKoreanDateToIso(value);
  if (iso && iso.length >= 7) return iso.slice(0, 7);
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  return new Date().toISOString().slice(0, 7);
}

function lineRemain(line: FundBillingSpendLine): number {
  return line.contractAmount - (line.priorPaid + line.inspected);
}

function lineCumulative(line: FundBillingSpendLine): number {
  return line.priorPaid + line.inspected;
}

/** 공통비 관리팀검수 = (직접공사비 검수 + 직접경비 검수) / 실행예산직접원가 × 공통비 하도급금액 */
export function calcCommonInspected(
  constructionInspected: number,
  expenseInspected: number,
  executedDirectCost: number,
  commonSubcontractAmount: number,
): number {
  if (executedDirectCost <= 0) return 0;
  return Math.round(
    ((constructionInspected + expenseInspected) / executedDirectCost) * commonSubcontractAmount,
  );
}

export function seedFundBillingReportsFromImported(): FundBillingReport[] {
  const asOf = formatIsoToKoreanDate(IMPORTED_FUND_BILLING_AS_OF);
  const monthKey = monthKeyFromWrittenDate(asOf);
  const updatedAt = new Date().toISOString();

  return getImportedFundBillingProjects().map((project) => ({
    id: project.id,
    monthKey,
    projectName: project.sheetName || project.summaryName,
    projectCode: '',
    department: mapTextToFundBillingDepartment(project.group),
    contractAmount: project.contractAmount,
    startDate: formatIsoToKoreanDate(project.startDate),
    endDate: formatIsoToKoreanDate(project.endDate),
    writtenDate: asOf,
    pmName: project.pmName ?? '',
    collectedPrior: project.collectedPrior,
    expectedCollection: project.collectedExpectedMonth,
    directCostBudget: 0,
    linkedProjectId: project.id,
    overheads: OVERHEAD_TEMPLATES.map((item) => {
      const found = project.overheads?.find((overhead) => overhead.key === item.key);
      return {
        id: `${project.id}-oh-${item.key}`,
        kind: 'other' as const,
        no: '',
        tradeType: item.label,
        vendorName: '',
        contractAmount: found?.contractAmount ?? 0,
        priorPaid: found?.priorPaid ?? 0,
        monthClaim: found?.monthClaim ?? 0,
        inspected: found?.inspected ?? 0,
      };
    }),
    lines: project.vendors
      .filter((vendor) => vendor.contractAmount > 0)
      .map((vendor, index) => ({
      id: `${project.id}-${vendor.no}-${index}`,
      kind: inferSpendKind(vendor.no),
      no: vendor.no || String(index + 1),
      tradeType: vendor.tradeType,
      vendorName: vendor.vendorName,
      contractAmount: vendor.contractAmount,
      priorPaid: vendor.priorPaid,
      monthClaim: vendor.monthClaim,
      inspected: vendor.inspected,
    })),
    updatedAt,
  }));
}

export function createEmptyFundBillingReport(): FundBillingReport {
  const now = new Date();
  const writtenDate = formatIsoToKoreanDate(now.toISOString().slice(0, 10)) || '';
  return {
    id: `fund-new-${now.getTime()}`,
    monthKey: monthKeyFromWrittenDate(writtenDate),
    projectName: '',
    projectCode: '',
    department: mapTextToFundBillingDepartment('전시'),
    contractAmount: 0,
    startDate: '',
    endDate: '',
    writtenDate,
    pmName: '',
    collectedPrior: 0,
    expectedCollection: 0,
    directCostBudget: 0,
    linkedProjectId: '',
    overheads: OVERHEAD_TEMPLATES.map((item) => ({
      id: `oh-${item.key}-${now.getTime()}`,
      kind: 'other',
      no: '',
      tradeType: item.label,
      vendorName: '',
      contractAmount: 0,
      priorPaid: 0,
      monthClaim: 0,
      inspected: 0,
    })),
    lines: [],
    updatedAt: now.toISOString(),
  };
}

export function upsertFundBillingReport(
  reports: FundBillingReport[],
  next: FundBillingReport,
): FundBillingReport[] {
  const stamped = {
    ...next,
    monthKey: monthKeyFromWrittenDate(next.writtenDate) || next.monthKey,
    updatedAt: new Date().toISOString(),
  };
  const index = reports.findIndex(
    (item) => item.id === stamped.id && item.monthKey === stamped.monthKey,
  );
  if (index >= 0) {
    const copy = [...reports];
    copy[index] = stamped;
    return copy;
  }
  return [...reports, stamped];
}

export function latestReportsByProject(reports: FundBillingReport[]): FundBillingReport[] {
  const map = new Map<string, FundBillingReport>();
  const sorted = [...reports].sort((a, b) => {
    const month = a.monthKey.localeCompare(b.monthKey);
    if (month !== 0) return month;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  for (const report of sorted) {
    map.set(report.id, report);
  }
  return [...map.values()];
}

export function findLatestReport(
  reports: FundBillingReport[],
  projectId: string,
): FundBillingReport | undefined {
  return latestReportsByProject(reports).find((item) => item.id === projectId);
}

function compactBillingName(value: string): string {
  return value
    .replace(/\(설계\)/g, '')
    .replace(/인테리어\s*공사/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function findReportForProject(
  reports: FundBillingReport[],
  project: { id?: string; name?: string; projectCode?: string; contractAmount?: number },
): FundBillingReport | undefined {
  const latest = latestReportsByProject(reports);
  if (project.id) {
    const byLink = latest.find((item) => item.id === project.id || item.linkedProjectId === project.id);
    if (byLink) return byLink;
  }

  const needle = compactBillingName(project.name ?? '');
  const code = (project.projectCode ?? '').trim();
  let best: FundBillingReport | undefined;
  let bestScore = 0;
  for (const report of latest) {
    let score = 0;
    const hay = compactBillingName(report.projectName);
    const hayCode = (report.projectCode ?? '').trim();
    if (code && hayCode && code === hayCode) score = 100;
    if (needle && hay) {
      if (hay === needle) score = Math.max(score, 100);
      else if (hay.includes(needle) || needle.includes(hay)) {
        score = Math.max(score, 70 + Math.min(needle.length, hay.length) / 20);
      }
    }
    if (project.contractAmount && project.contractAmount === report.contractAmount) score += 25;
    if (score > bestScore) {
      bestScore = score;
      best = report;
    }
  }
  return bestScore >= 70 ? best : undefined;
}

export function reportToSummaryRow(report: FundBillingReport): FundBillingProjectRow {
  const collectedTotal = report.collectedPrior + report.expectedCollection;
  const vendors = report.lines;
  const subcontractContractTotal = vendors.reduce((sum, line) => sum + line.contractAmount, 0);
  const subcontractPriorBilling = vendors.reduce((sum, line) => sum + line.priorPaid, 0);
  const expectedBillingMonth = vendors.reduce((sum, line) => sum + line.monthClaim, 0);
  const paidTotal = vendors.reduce((sum, line) => sum + lineCumulative(line), 0);
  const unpaid = vendors.reduce((sum, line) => sum + lineRemain(line), 0);
  const allLines = [...report.overheads, ...vendors];
  const spentTotal = allLines.reduce((sum, line) => sum + lineCumulative(line), 0);
  const netCash = collectedTotal - spentTotal;
  const startIso = parseKoreanDateToIso(report.startDate) ?? '';
  const endIso = parseKoreanDateToIso(report.endDate) ?? undefined;
  const asOf = parseKoreanDateToIso(report.writtenDate) ?? report.monthKey;
  const uncollected = Math.max(0, report.contractAmount - collectedTotal);
  const periodEnded = Boolean(endIso && asOf && endIso < asOf);
  const completed = uncollected <= 0 && periodEnded;

  return {
    projectId: report.id,
    projectCode: report.projectCode,
    projectName: report.projectName || '(이름 없음)',
    clientName: report.projectName,
    divisionId: report.department,
    divisionName: report.department,
    teamName: report.pmName || '-',
    status: completed ? '완료' : '실행',
    startDate: startIso,
    endDate: endIso,
    pmName: report.pmName,
    contractAmount: report.contractAmount,
    billedTotal: collectedTotal,
    collectedPrior: report.collectedPrior,
    collectedTotal,
    expectedCollectionMonth: report.expectedCollection,
    uncollected,
    collectionRate: report.contractAmount > 0 ? (collectedTotal / report.contractAmount) * 100 : 0,
    subcontractCount: vendors.length,
    subcontractContractTotal,
    subcontractPriorBilling,
    expectedBillingMonth,
    subcontractBillingTotal: paidTotal,
    paidTotal,
    unpaid,
    netCash,
    cashRate: report.contractAmount > 0 ? (netCash / report.contractAmount) * 100 : 0,
  };
}

export function buildSummaryRowsFromLedger(state: FundBillingLedgerState): FundBillingProjectRow[] {
  return latestReportsByProject(state.reports).map(reportToSummaryRow);
}
