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
import { formatIsoToKoreanDate, formatMonthKeyToKorean, parseKoreanDateToIso } from '@/utils/formatInput';

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

function finiteAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function lineRemain(line: FundBillingSpendLine): number {
  return finiteAmount(line.contractAmount) - spendLineCumulative(line);
}

export function spendLineCumulative(line: Pick<FundBillingSpendLine, 'priorPaid' | 'inspected'>): number {
  return finiteAmount(line.priorPaid) + finiteAmount(line.inspected);
}

/** 공통비 관리팀검수 = (직접공사비 검수 + 직접경비 검수) / 실행예산직접원가 × 공통비 하도급금액 */
export function calcCommonInspected(
  constructionInspected: number,
  expenseInspected: number,
  executedDirectCost: number,
  commonSubcontractAmount: number,
): number {
  const budget = finiteAmount(executedDirectCost);
  if (budget <= 0) return 0;
  return Math.round(
    ((finiteAmount(constructionInspected) + finiteAmount(expenseInspected)) / budget) *
      finiteAmount(commonSubcontractAmount),
  );
}

export function isFundBillingCommonLine(line: { id?: string; tradeType?: string }): boolean {
  return Boolean(line.id?.includes('oh-common') || line.tradeType === '공통비');
}

export function isFundBillingDirectExpenseLine(line: { id?: string; tradeType?: string }): boolean {
  return Boolean(line.id?.includes('oh-directExpense') || line.tradeType === '직접경비');
}

export function resolveCommonInspected(
  overheads: FundBillingSpendLine[],
  vendorInspected: number,
  directCostBudget: number,
): number {
  const common = overheads.find(isFundBillingCommonLine);
  if (!common) return 0;
  if (common.commonInspectedManual) return finiteAmount(common.inspected);
  if (!(finiteAmount(directCostBudget) > 0)) return finiteAmount(common.inspected);
  const expenseInspected = finiteAmount(overheads.find(isFundBillingDirectExpenseLine)?.inspected);
  return calcCommonInspected(
    vendorInspected,
    expenseInspected,
    directCostBudget,
    common.contractAmount,
  );
}

export function applyCommonInspectedFormula(report: FundBillingReport): FundBillingReport {
  const common = report.overheads.find(isFundBillingCommonLine);
  if (!common || common.commonInspectedManual) return report;
  const vendorInspected = report.lines.reduce((sum, line) => sum + finiteAmount(line.inspected), 0);
  const inspected = resolveCommonInspected(report.overheads, vendorInspected, report.directCostBudget);
  if (common.inspected === inspected && common.monthClaim === 0) return report;
  return {
    ...report,
    overheads: report.overheads.map((line) =>
      isFundBillingCommonLine(line) ? { ...line, monthClaim: 0, inspected } : line,
    ),
  };
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
  const monthKey = now.toISOString().slice(0, 7);
  const writtenDate = writtenDateForMonthKey(monthKey);
  return {
    id: `fund-new-${now.getTime()}`,
    monthKey,
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
    monthKey: next.monthKey || monthKeyFromWrittenDate(next.writtenDate),
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

export function writtenDateForMonthKey(monthKey: string): string {
  return formatMonthKeyToKorean(monthKey) || `${monthKey.slice(0, 4)}년 ${monthKey.slice(5, 7)}월`;
}

export function reportsForProject(reports: FundBillingReport[], projectId: string): FundBillingReport[] {
  return reports
    .filter((item) => item.id === projectId)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.updatedAt.localeCompare(b.updatedAt));
}

export function previousReportForMonth(
  reports: FundBillingReport[],
  projectId: string,
  monthKey: string,
): FundBillingReport | undefined {
  const earlier = reportsForProject(reports, projectId).filter((item) => item.monthKey < monthKey);
  return earlier[earlier.length - 1];
}

function rollForwardSpendLine(line: FundBillingSpendLine): FundBillingSpendLine {
  return {
    ...line,
    priorPaid: spendLineCumulative(line),
    monthClaim: 0,
    inspected: 0,
    commonInspectedManual: undefined,
    added: false,
    manualEdit: false,
  };
}

/** 직전 기성월의 수금누계·집행누계를 기수·기지출로 이관하고, 금월청구·관리팀검수는 0으로 둔 신규월 보고서 */
export function createMonthReportFromPrevious(
  source: FundBillingReport,
  monthKey: string,
): FundBillingReport {
  const closed = applyCommonInspectedFormula(source);
  return {
    ...closed,
    monthKey,
    writtenDate: writtenDateForMonthKey(monthKey),
    collectedPrior: finiteAmount(closed.collectedPrior) + finiteAmount(closed.expectedCollection),
    expectedCollection: 0,
    overheads: (closed.overheads ?? []).map(rollForwardSpendLine),
    lines: (closed.lines ?? []).map(rollForwardSpendLine),
    updatedAt: new Date().toISOString(),
  };
}

export function createBlankMonthReportFromTemplate(
  template: FundBillingReport,
  monthKey: string,
): FundBillingReport {
  return {
    ...template,
    monthKey,
    writtenDate: writtenDateForMonthKey(monthKey),
    collectedPrior: 0,
    expectedCollection: 0,
    overheads: (template.overheads ?? []).map((line) => ({
      ...rollForwardSpendLine(line),
      priorPaid: 0,
    })),
    lines: (template.lines ?? []).map((line) => ({
      ...rollForwardSpendLine(line),
      priorPaid: 0,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function ensureProjectMonthReport(
  reports: FundBillingReport[],
  projectId: string,
  monthKey: string,
): { reports: FundBillingReport[]; created: boolean } {
  const existing = reports.find((item) => item.id === projectId && item.monthKey === monthKey);
  if (existing) return { reports, created: false };
  const previous = previousReportForMonth(reports, projectId, monthKey);
  const template = previous ?? findLatestReport(reports, projectId);
  if (!template) return { reports, created: false };
  const next = previous
    ? createMonthReportFromPrevious(previous, monthKey)
    : createBlankMonthReportFromTemplate(template, monthKey);
  return { reports: upsertFundBillingReport(reports, next), created: true };
}

function compactBillingName(value: string): string {
  return value
    .replace(/\(설계\)/g, '')
    .replace(/인테리어\s*공사/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 검색창 키워드가 프로젝트명으로 저장된 건을 원천 시트명으로 되돌립니다. */
const SEARCH_KEYWORD_PROJECT_NAMES: Record<string, string> = {
  강원: '탄광문화공원',
};

function looksLikeSearchKeywordOverwrite(currentName: string, importedName: string): boolean {
  const current = compactBillingName(currentName);
  const imported = compactBillingName(importedName);
  if (!current || !imported || current === imported) return false;
  if (imported.includes(current) || current.includes(imported)) {
    return current.length <= Math.min(6, Math.floor(imported.length / 2) || 1);
  }
  return current.length <= 8 && imported.length >= 8;
}

function restoreImportedProjectName(currentName: string, importedName?: string): string {
  const alias = SEARCH_KEYWORD_PROJECT_NAMES[currentName.trim()];
  if (alias && (!importedName || importedName === alias)) return alias;
  if (importedName && looksLikeSearchKeywordOverwrite(currentName, importedName)) return importedName;
  return currentName;
}

/** 검색어로 덮인 이름 복구. 빈 신규 초안은 집계 목록에서만 제외합니다. */
export function sanitizeFundBillingReports(reports: FundBillingReport[]): FundBillingReport[] {
  const importedById = new Map(
    getImportedFundBillingProjects().map((project) => [project.id, project.sheetName || project.summaryName]),
  );
  return reports
    .map((report) => {
      const importedName = importedById.get(report.id);
      const projectName = restoreImportedProjectName(report.projectName, importedName);
      const department = mapTextToFundBillingDepartment(report.department, report.projectName);
      if (projectName === report.projectName && department === report.department) return report;
      return { ...report, projectName, department };
    })
    .map(applyCommonInspectedFormula);
}

/** 검색 목록에서 직접 고른 프로젝트만 연결합니다. 부분 문자열 유사 매칭은 쓰지 않습니다. */
export function findExactReportForProject(
  reports: FundBillingReport[],
  project: { id?: string; name?: string; projectCode?: string },
): FundBillingReport | undefined {
  const latest = latestReportsByProject(reports);
  if (project.id) {
    const byId = latest.find((item) => item.id === project.id || item.linkedProjectId === project.id);
    if (byId) return byId;
  }
  const code = (project.projectCode ?? '').trim();
  if (code) {
    const byCode = latest.find((item) => (item.projectCode ?? '').trim() === code);
    if (byCode) return byCode;
  }
  const needle = compactBillingName(project.name ?? '');
  if (!needle) return undefined;
  return latest.find((item) => compactBillingName(item.projectName) === needle);
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
  const collectedTotal = finiteAmount(report.collectedPrior) + finiteAmount(report.expectedCollection);
  const vendors = report.lines ?? [];
  const subcontractContractTotal = vendors.reduce((sum, line) => sum + finiteAmount(line.contractAmount), 0);
  const subcontractPriorBilling = vendors.reduce((sum, line) => sum + finiteAmount(line.priorPaid), 0);
  const expectedBillingMonth = vendors.reduce((sum, line) => sum + finiteAmount(line.monthClaim), 0);
  const paidTotal = vendors.reduce((sum, line) => sum + spendLineCumulative(line), 0);
  const unpaid = vendors.reduce((sum, line) => sum + lineRemain(line), 0);
  const allLines = [...(report.overheads ?? []), ...vendors];
  const spentPrior = allLines.reduce((sum, line) => sum + finiteAmount(line.priorPaid), 0);
  const monthSpendExpected = allLines.reduce((sum, line) => sum + finiteAmount(line.inspected), 0);
  const spentTotal = allLines.reduce((sum, line) => sum + spendLineCumulative(line), 0);
  const executionBudget =
    allLines.reduce((sum, line) => sum + finiteAmount(line.contractAmount), 0) ||
    finiteAmount(report.directCostBudget);
  const netCash = collectedTotal - spentTotal;
  const startIso = parseKoreanDateToIso(report.startDate) ?? '';
  const endIso = parseKoreanDateToIso(report.endDate) ?? undefined;
  const asOf =
    parseKoreanDateToIso(report.writtenDate) ?? (report.monthKey ? `${report.monthKey}-01` : '');
  const uncollected = Math.max(0, report.contractAmount - collectedTotal);
  const periodEnded = Boolean(endIso && asOf && endIso < asOf);
  const completed = uncollected <= 0 && periodEnded;

  return {
    projectId: report.id,
    projectCode: report.projectCode,
    projectName: report.projectName || '(이름 없음)',
    clientName: report.projectName,
    divisionId: mapTextToFundBillingDepartment(report.department, report.projectName),
    divisionName: mapTextToFundBillingDepartment(report.department, report.projectName),
    teamName: report.pmName || '-',
    status: completed ? '완료' : '실행',
    startDate: startIso,
    endDate: endIso,
    monthKey: report.monthKey,
    writtenDate: report.writtenDate,
    pmName: report.pmName,
    contractAmount: finiteAmount(report.contractAmount),
    billedTotal: collectedTotal,
    collectedPrior: finiteAmount(report.collectedPrior),
    collectedTotal,
    expectedCollectionMonth: finiteAmount(report.expectedCollection),
    uncollected,
    collectionRate: report.contractAmount > 0 ? (collectedTotal / report.contractAmount) * 100 : 0,
    spentPrior,
    monthSpendExpected,
    executionBudget,
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

export function reportsForMonth(reports: FundBillingReport[], monthKey: string): FundBillingReport[] {
  const map = new Map<string, FundBillingReport>();
  const matched = [...reports]
    .filter((item) => item.monthKey === monthKey && item.projectName.trim())
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const report of matched) {
    map.set(report.id, report);
  }
  return [...map.values()];
}

export function latestMonthKey(reports: FundBillingReport[]): string {
  const keys = reports.map((item) => item.monthKey).filter(Boolean).sort();
  return keys[keys.length - 1] || new Date().toISOString().slice(0, 7);
}

export function reportHasMonthBillingEntry(report: FundBillingReport): boolean {
  if (finiteAmount(report.expectedCollection) > 0) return true;
  return [...(report.overheads ?? []), ...(report.lines ?? [])].some(
    (line) => finiteAmount(line.monthClaim) > 0 || finiteAmount(line.inspected) > 0,
  );
}

/** 직전월 누계만 이관하고 금월 수금·기성을 아직 입력하지 않은 신규월 초안 */
export function isUnfilledRolledMonthReport(
  report: FundBillingReport,
  reports: FundBillingReport[],
): boolean {
  if (reportHasMonthBillingEntry(report)) return false;
  return reports.some(
    (item) => item.id === report.id && item.monthKey < report.monthKey && item.projectName.trim(),
  );
}

export function reportsForCashAnalysisMonth(
  reports: FundBillingReport[],
  monthKey: string,
): FundBillingReport[] {
  return reportsForMonth(reports, monthKey).filter(
    (report) => !isUnfilledRolledMonthReport(report, reports),
  );
}

export function latestCashAnalysisMonthKey(reports: FundBillingReport[]): string {
  const keys = [...new Set(reports.map((item) => item.monthKey).filter(Boolean))]
    .filter((key) => reportsForCashAnalysisMonth(reports, key).length > 0)
    .sort();
  return keys[keys.length - 1] || '';
}

export function buildCashAnalysisSummaryRows(
  reports: FundBillingReport[],
  monthKey: string,
): FundBillingProjectRow[] {
  return reportsForCashAnalysisMonth(reports, monthKey)
    .map(reportToSummaryRow)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko'));
}

export function findReportForMonth(
  reports: FundBillingReport[],
  projectId: string,
  monthKey?: string,
): FundBillingReport | undefined {
  const owned = reports.filter((item) => item.id === projectId);
  if (monthKey) {
    return owned.find((item) => item.monthKey === monthKey);
  }
  return findLatestReport(owned, projectId) ?? owned[owned.length - 1];
}

export function buildSummaryRowsFromLedger(
  state: FundBillingLedgerState,
  monthKey?: string,
): FundBillingProjectRow[] {
  const source = monthKey
    ? reportsForMonth(state.reports, monthKey)
    : latestReportsByProject(state.reports).filter((report) => report.projectName.trim());
  return source
    .map(reportToSummaryRow)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko'));
}
