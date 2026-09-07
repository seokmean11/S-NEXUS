import type { FundBillingSpendLine } from '@/types/fundBillingReport';

const STORAGE_KEY = 's-nexus-fund-billing-session-drafts';

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
  all[draftKey(draft.id, draft.monthKey)] = draft;
  writeAll(all);
}

export function clearFundBillingSessionDraft(id: string, monthKey: string): void {
  const all = readAll();
  delete all[draftKey(id, monthKey)];
  writeAll(all);
}

export function clearAllFundBillingSessionDrafts(): void {
  sessionDraftsEnabled = false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function enableFundBillingSessionDrafts(): void {
  sessionDraftsEnabled = true;
}
