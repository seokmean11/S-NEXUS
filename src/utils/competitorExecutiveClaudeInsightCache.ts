import type { ExecutiveInsightsBySection } from '@/utils/competitorExecutiveInsight';

const CACHE_PREFIX = 'perf-dashboard-executive-claude-insights:';

export interface CachedExecutiveClaudeInsights {
  cacheKey: string;
  generatedAt: string;
  insights: ExecutiveInsightsBySection;
  usedFallback?: boolean;
}

export function loadCachedExecutiveClaudeInsights(
  cacheKey: string,
): CachedExecutiveClaudeInsights | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedExecutiveClaudeInsights;
    if (parsed.cacheKey !== cacheKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedExecutiveClaudeInsights(
  cacheKey: string,
  insights: ExecutiveInsightsBySection,
  usedFallback = false,
): void {
  const payload: CachedExecutiveClaudeInsights = {
    cacheKey,
    generatedAt: new Date().toISOString(),
    insights,
    usedFallback,
  };
  sessionStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(payload));
}

export function clearCachedExecutiveClaudeInsights(): void {
  const keysToRemove: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}
