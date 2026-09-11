import type { FundBillingQuickFilter } from '@/types/fundBilling';

const STORAGE_KEY = 's-nexus-fund-cash-search';

const QUICK_FILTERS: FundBillingQuickFilter[] = [
  'all',
  'active',
  'completed',
  'uncollected',
  'unpaid',
  'cashShort',
];

export interface FundCashSearchState {
  monthKey: string;
  divisionIds: string[];
  keyword: string;
  selectedProjectId: string;
  quickFilter: FundBillingQuickFilter;
}

function isQuickFilter(value: unknown): value is FundBillingQuickFilter {
  return typeof value === 'string' && QUICK_FILTERS.includes(value as FundBillingQuickFilter);
}

export function loadFundCashSearchState(): FundCashSearchState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FundCashSearchState>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      monthKey: typeof parsed.monthKey === 'string' ? parsed.monthKey : '',
      divisionIds: Array.isArray(parsed.divisionIds)
        ? parsed.divisionIds.filter((item): item is string => typeof item === 'string')
        : [],
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
      selectedProjectId: typeof parsed.selectedProjectId === 'string' ? parsed.selectedProjectId : '',
      quickFilter: isQuickFilter(parsed.quickFilter) ? parsed.quickFilter : 'all',
    };
  } catch {
    return null;
  }
}

export function saveFundCashSearchState(state: FundCashSearchState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private-mode failures */
  }
}
