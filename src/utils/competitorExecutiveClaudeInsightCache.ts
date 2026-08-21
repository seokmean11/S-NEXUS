import {
  normalizeExecutiveInsightsBySection,
  type ExecutiveInsightsBySection,
} from '@/utils/competitorExecutiveInsight';
import {
  removeSessionStorageByPrefix,
  workspaceStorageKey,
} from '@/utils/userWorkspaceStorage';

const CACHE_PREFIX = 'perf-dashboard-executive-claude-insights:';

function insightCacheKey(cacheKey: string): string {
  return workspaceStorageKey(CACHE_PREFIX, cacheKey);
}

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
    const raw = sessionStorage.getItem(insightCacheKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedExecutiveClaudeInsights;
    if (parsed.cacheKey !== cacheKey) return null;
    return {
      ...parsed,
      insights: normalizeExecutiveInsightsBySection(parsed.insights),
    };
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
  sessionStorage.setItem(insightCacheKey(cacheKey), JSON.stringify(payload));
}

export function clearCachedExecutiveClaudeInsights(): void {
  removeSessionStorageByPrefix(workspaceStorageKey(CACHE_PREFIX));
}
