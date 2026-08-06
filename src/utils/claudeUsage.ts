import { getClaudeModelName, type ClaudeTokenUsage } from '@/services/claudeAnalysis';

export type { ClaudeTokenUsage };

export interface ClaudeUsageSnapshot extends ClaudeTokenUsage {
  estimatedUsd: number;
  recordedAt: string;
}

export const DEFAULT_REMAINING_CREDIT_USD = 19.26;

const REMAINING_CREDIT_KEY = 'perf-dashboard-claude-held-credit-usd';
const LAST_USAGE_KEY = 'perf-dashboard-claude-last-usage';
const CREDIT_INIT_VERSION_KEY = 'perf-dashboard-claude-credit-init-version';
const CREDIT_INIT_VERSION = 'v3';

const MODEL_RATES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-latest': { input: 3, output: 15 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4 },
  'claude-2': { input: 8, output: 24 },
};

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** 잔여크레딧 $19.26 · 이번 분석 사용 $0 으로 초기화 */
export function ensureCreditDefaults(): void {
  if (localStorage.getItem(CREDIT_INIT_VERSION_KEY) === CREDIT_INIT_VERSION) return;

  saveRemainingCreditUsd(DEFAULT_REMAINING_CREDIT_USD);
  localStorage.removeItem(LAST_USAGE_KEY);
  localStorage.removeItem('perf-dashboard-claude-cumulative-usd');
  localStorage.setItem(CREDIT_INIT_VERSION_KEY, CREDIT_INIT_VERSION);
}

export function estimateClaudeUsageCostUsd(usage: ClaudeTokenUsage): number {
  const rates = MODEL_RATES_USD_PER_MTOK[usage.model] ?? { input: 3, output: 15 };
  const inputCost = (usage.inputTokens / 1_000_000) * rates.input;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.output;
  return inputCost + outputCost;
}

export function createUsageSnapshot(usage: ClaudeTokenUsage): ClaudeUsageSnapshot {
  return {
    ...usage,
    estimatedUsd: estimateClaudeUsageCostUsd(usage),
    recordedAt: new Date().toISOString(),
  };
}

export function recordClaudeUsage(usage: ClaudeTokenUsage): ClaudeUsageSnapshot {
  ensureCreditDefaults();

  const snapshot = createUsageSnapshot(usage);
  const cost = snapshot.estimatedUsd;

  const remaining = getRemainingCreditUsd() ?? DEFAULT_REMAINING_CREDIT_USD;
  saveRemainingCreditUsd(Math.max(0, remaining - cost));
  localStorage.setItem(LAST_USAGE_KEY, JSON.stringify(snapshot));

  return snapshot;
}

export function clearLastClaudeUsage(): void {
  localStorage.removeItem(LAST_USAGE_KEY);
}

export function getLastClaudeUsage(): ClaudeUsageSnapshot | null {
  try {
    const raw = localStorage.getItem(LAST_USAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClaudeUsageSnapshot;
  } catch {
    return null;
  }
}

export function getRemainingCreditUsd(): number | null {
  ensureCreditDefaults();
  return readNumber(REMAINING_CREDIT_KEY);
}

export function saveRemainingCreditUsd(value: number | null): void {
  if (value == null || !Number.isFinite(value) || value < 0) {
    localStorage.removeItem(REMAINING_CREDIT_KEY);
    return;
  }
  localStorage.setItem(REMAINING_CREDIT_KEY, String(value));
}

/** @deprecated use getRemainingCreditUsd */
export function getHeldCreditsUsd(): number | null {
  return getRemainingCreditUsd();
}

/** @deprecated use saveRemainingCreditUsd */
export function saveHeldCreditsUsd(value: number | null): void {
  saveRemainingCreditUsd(value);
}

/** @deprecated use getRemainingCreditUsd */
export function getClaudeCreditBaselineUsd(): number | null {
  return getRemainingCreditUsd();
}

/** @deprecated use saveRemainingCreditUsd */
export function saveClaudeCreditBaselineUsd(value: number | null): void {
  saveRemainingCreditUsd(value);
}

export function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

export function formatTokenCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

export function formatUsageSummary(snapshot: ClaudeUsageSnapshot): string {
  const model = snapshot.model || getClaudeModelName();
  return `${formatTokenCount(snapshot.inputTokens)} in + ${formatTokenCount(snapshot.outputTokens)} out · ${formatUsd(snapshot.estimatedUsd)} (${model})`;
}
