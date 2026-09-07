import type { FundBillingReport, FundBillingSpendLine } from '@/types/fundBillingReport';

const STORAGE_KEY = 's-nexus-fund-billing-session-drafts';
const LAST_WRITER_KEY = 's-nexus-fund-billing-last-writer';

let sessionDraftsEnabled = true;

export interface FundBillingSessionDraft {
  id: string;
  monthKey: string;
  projectMode: 'existing' | 'new';
  projectName: string;
  selectedProjectId: string;
  projectCode: string;
  department: string;
  contractAmount: number;
  startDate: string;
  endDate: string;
  writtenDate: string;
  pmName: string;
  collectedPrior: number;
  expectedCollection: number;
  directCostBudget: number;
  overheads: FundBillingSpendLine[];
  lines: FundBillingSpendLine[];
  editUnlocked: boolean;
  capturedAt?: string;
  /** 원장과 다른 미저장 수정만 복원합니다. 조회 중 자동 저장된 초안은 무시합니다. */
  dirty?: boolean;
}

export interface FundBillingLastWriter {
  id: string;
  monthKey: string;
}

function draftKey(id: string, monthKey: string): string {
  return `${id}::${monthKey}`;
}

function readAll(): Record<string, FundBillingSessionDraft> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FundBillingSessionDraft>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(next: Record<string, FundBillingSessionDraft>): void {
  if (!sessionDraftsEnabled) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export function loadFundBillingSessionDraft(
  id: string,
  monthKey: string,
): FundBillingSessionDraft | null {
  return readAll()[draftKey(id, monthKey)] ?? null;
}

export function saveFundBillingSessionDraft(draft: FundBillingSessionDraft): void {
  if (!sessionDraftsEnabled) return;
  const all = readAll();
  all[draftKey(draft.id, draft.monthKey)] = {
    ...draft,
    dirty: true,
    capturedAt: draft.capturedAt || new Date().toISOString(),
  };
  writeAll(all);
  rememberFundBillingWriter(draft.id, draft.monthKey);
}

export function resolveFundBillingSessionDraft(
  id: string,
  monthKey: string,
  reportUpdatedAt?: string,
): FundBillingSessionDraft | null {
  const draft = loadFundBillingSessionDraft(id, monthKey);
  if (!draft) return null;
  const draftAt = Date.parse(draft.capturedAt ?? '');
  const reportAt = Date.parse(reportUpdatedAt ?? '');
  if (
    !draft.dirty ||
    !Number.isFinite(draftAt) ||
    (Number.isFinite(reportAt) && reportAt >= draftAt)
  ) {
    clearFundBillingSessionDraft(id, monthKey);
    return null;
  }
  return draft;
}

export function clearFundBillingSessionDraft(id: string, monthKey: string): void {
  const all = readAll();
  delete all[draftKey(id, monthKey)];
  writeAll(all);
}

export function rememberFundBillingWriter(id: string, monthKey: string): void {
  if (!sessionDraftsEnabled || !id || !monthKey) return;
  try {
    sessionStorage.setItem(LAST_WRITER_KEY, JSON.stringify({ id, monthKey } satisfies FundBillingLastWriter));
  } catch {
    /* ignore */
  }
}

export function loadLastFundBillingWriter(): FundBillingLastWriter | null {
  try {
    const raw = sessionStorage.getItem(LAST_WRITER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FundBillingLastWriter;
    if (!parsed?.id || !parsed?.monthKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionDraftToReport(draft: FundBillingSessionDraft): FundBillingReport {
  return {
    id: draft.id,
    monthKey: draft.monthKey,
    projectName: draft.projectName,
    projectCode: draft.projectCode,
    department: draft.department,
    contractAmount: draft.contractAmount,
    startDate: draft.startDate,
    endDate: draft.endDate,
    writtenDate: draft.writtenDate,
    pmName: draft.pmName,
    collectedPrior: draft.collectedPrior,
    expectedCollection: draft.expectedCollection,
    directCostBudget: draft.directCostBudget,
    linkedProjectId: draft.selectedProjectId,
    overheads: draft.overheads ?? [],
    lines: draft.lines ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export function clearAllFundBillingSessionDrafts(): void {
  sessionDraftsEnabled = false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LAST_WRITER_KEY);
  } catch {
    /* ignore */
  }
}

export function enableFundBillingSessionDrafts(): void {
  sessionDraftsEnabled = true;
}
