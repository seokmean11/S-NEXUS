import type { CompetitorAnalysisSummary, CompetitorSector } from '@/types/competitorAnalysis';
import { COMPETITOR_SECTORS } from '@/types/competitorAnalysis';
import type {
  CompetitorAnalysisPeriodWarning,
  CompetitorExecutiveMultiYearSummary,
} from '@/types/competitorStandard';
import { clearCachedExecutiveClaudeInsights } from '@/utils/competitorExecutiveClaudeInsightCache';
import {
  removeLocalStorageByPrefix,
  removeSessionStorageByPrefix,
  workspaceStorageKey,
} from '@/utils/userWorkspaceStorage';

const LEGACY_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-selection';
const UPLOAD_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-upload-selection';
const ANALYSIS_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-analysis-selection';
const ANALYSIS_CACHE_PREFIX = 'perf-dashboard-competitor-analysis:';
const ANALYSIS_CACHE_VERSION = '2';
const PERIOD_ANALYSIS_CACHE_PREFIX = 'perf-dashboard-competitor-period-analysis:v2:';
const PERIOD_ANALYSIS_CACHE_VERSION = '3';

export interface CompetitorSelectionState {
  sector: CompetitorSector | null;
  year: number | null;
}

export interface CompetitorAnalysisSelectionState {
  sector: CompetitorSector | null;
  fromYear?: number;
  toYear?: number;
}

function isCompetitorSector(value: unknown): value is CompetitorSector {
  return typeof value === 'string' && (COMPETITOR_SECTORS as readonly string[]).includes(value);
}

function analysisCacheKey(sector: CompetitorSector, year: number): string {
  return workspaceStorageKey(ANALYSIS_CACHE_PREFIX, `${sector}:${year}`);
}

function parseYear(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 2021 &&
    value <= 2050
    ? value
    : null;
}

function parseSelectionState(raw: string | null): CompetitorSelectionState {
  if (!raw) return { sector: null, year: null };

  try {
    const parsed = JSON.parse(raw) as Partial<CompetitorSelectionState>;
    const sector = isCompetitorSector(parsed.sector) ? parsed.sector : null;
    const year = parseYear(parsed.year);

    return { sector, year: sector ? year : null };
  } catch {
    return { sector: null, year: null };
  }
}

function readLegacySelection(): CompetitorSelectionState {
  return parseSelectionState(localStorage.getItem(workspaceStorageKey(LEGACY_SELECTION_STORAGE_KEY)));
}

export function loadUploadSelection(): CompetitorSelectionState {
  const stored = parseSelectionState(
    localStorage.getItem(workspaceStorageKey(UPLOAD_SELECTION_STORAGE_KEY)),
  );
  if (stored.sector || stored.year) return stored;
  return readLegacySelection();
}

export function saveUploadSelection(state: CompetitorSelectionState): void {
  localStorage.setItem(
    workspaceStorageKey(UPLOAD_SELECTION_STORAGE_KEY),
    JSON.stringify({
      sector: state.sector,
      year: state.sector ? state.year : null,
    }),
  );
}

export function loadAnalysisSelection(): CompetitorAnalysisSelectionState {
  try {
    const raw = localStorage.getItem(workspaceStorageKey(ANALYSIS_SELECTION_STORAGE_KEY));
    if (!raw) return { sector: null };

    const parsed = JSON.parse(raw) as Partial<
      CompetitorAnalysisSelectionState & { year?: number; executiveFromYear?: number; executiveToYear?: number }
    >;
    const sector = isCompetitorSector(parsed.sector) ? parsed.sector : null;
    const fromYear =
      parseYear(parsed.fromYear) ?? parseYear(parsed.executiveFromYear) ?? undefined;
    const toYear = parseYear(parsed.toYear) ?? parseYear(parsed.executiveToYear) ?? undefined;

    return { sector, fromYear, toYear };
  } catch {
    return { sector: null };
  }
}

export function saveAnalysisSelection(state: CompetitorAnalysisSelectionState): void {
  localStorage.setItem(
    workspaceStorageKey(ANALYSIS_SELECTION_STORAGE_KEY),
    JSON.stringify({
      sector: state.sector,
      fromYear: state.fromYear,
      toYear: state.toYear,
    }),
  );
}

/** @deprecated upload/analysis 선택이 분리되었습니다. loadUploadSelection 사용 */
export function loadCompetitorSelection(): CompetitorSelectionState {
  return loadUploadSelection();
}

/** @deprecated upload/analysis 선택이 분리되었습니다. saveUploadSelection 사용 */
export function saveCompetitorSelection(state: CompetitorSelectionState): void {
  saveUploadSelection(state);
}

export function loadCachedCompetitorAnalysis(
  sector: CompetitorSector,
  year: number,
): CompetitorAnalysisSummary | null {
  try {
    const raw = sessionStorage.getItem(analysisCacheKey(sector, year));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompetitorAnalysisSummary & { cacheVersion?: string };
    if (parsed.cacheVersion !== ANALYSIS_CACHE_VERSION) return null;
    if (parsed.sector !== sector || parsed.year !== year) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedCompetitorAnalysis(
  sector: CompetitorSector,
  year: number,
  analysis: CompetitorAnalysisSummary,
): void {
  sessionStorage.setItem(
    analysisCacheKey(sector, year),
    JSON.stringify({ ...analysis, cacheVersion: ANALYSIS_CACHE_VERSION }),
  );
}

export interface CompetitorPeriodAnalysisCache {
  cacheVersion: string;
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  summaryYear: number | null;
  warnings: CompetitorAnalysisPeriodWarning[];
  analysis: CompetitorAnalysisSummary | null;
  executive: CompetitorExecutiveMultiYearSummary | null;
  cachedAt: string;
}

function periodAnalysisCacheKey(
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
): string {
  const from = Math.min(fromYear, toYear);
  const to = Math.max(fromYear, toYear);
  return workspaceStorageKey(PERIOD_ANALYSIS_CACHE_PREFIX, `${sector}:${from}:${to}`);
}

function isPeriodAnalysisCacheCompatible(
  cache: CompetitorPeriodAnalysisCache,
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
): boolean {
  const from = Math.min(fromYear, toYear);
  const to = Math.max(fromYear, toYear);
  if (cache.sector !== sector || cache.fromYear !== from || cache.toYear !== to) {
    return false;
  }

  const executive = cache.executive;
  if (!executive) return Boolean(cache.analysis);

  const requestedFrom = executive.requestedFromYear ?? executive.fromYear;
  const requestedTo = executive.requestedToYear ?? executive.toYear;
  if (requestedFrom !== from || requestedTo !== to) {
    return false;
  }

  if (cache.summaryYear != null && cache.summaryYear > to) {
    return false;
  }

  if (cache.analysis && cache.analysis.year > to) {
    return false;
  }

  return true;
}

export function loadCachedPeriodAnalysis(
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
): CompetitorPeriodAnalysisCache | null {
  try {
    const raw = localStorage.getItem(periodAnalysisCacheKey(sector, fromYear, toYear));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompetitorPeriodAnalysisCache;
    if (parsed.cacheVersion !== PERIOD_ANALYSIS_CACHE_VERSION && parsed.cacheVersion !== '1') {
      return null;
    }
    const from = Math.min(fromYear, toYear);
    const to = Math.max(fromYear, toYear);
    if (!isPeriodAnalysisCacheCompatible(parsed, sector, from, to)) return null;
    if (!parsed.executive && !parsed.analysis) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedPeriodAnalysis(
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  payload: {
    summaryYear: number | null;
    warnings: CompetitorAnalysisPeriodWarning[];
    analysis: CompetitorAnalysisSummary | null;
    executive: CompetitorExecutiveMultiYearSummary | null;
  },
): void {
  const from = Math.min(fromYear, toYear);
  const to = Math.max(fromYear, toYear);
  const cache: CompetitorPeriodAnalysisCache = {
    cacheVersion: PERIOD_ANALYSIS_CACHE_VERSION,
    sector,
    fromYear: from,
    toYear: to,
    summaryYear: payload.summaryYear,
    warnings: payload.warnings,
    analysis: payload.analysis,
    executive: payload.executive,
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(periodAnalysisCacheKey(sector, from, to), JSON.stringify(cache));
}

export function clearCachedPeriodAnalysis(
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
): void {
  localStorage.removeItem(periodAnalysisCacheKey(sector, fromYear, toYear));
}

export function clearCompetitorAnalysisStorage(): void {
  localStorage.removeItem(workspaceStorageKey(LEGACY_SELECTION_STORAGE_KEY));
  localStorage.removeItem(workspaceStorageKey(UPLOAD_SELECTION_STORAGE_KEY));
  localStorage.removeItem(workspaceStorageKey(ANALYSIS_SELECTION_STORAGE_KEY));
  removeSessionStorageByPrefix(workspaceStorageKey(ANALYSIS_CACHE_PREFIX));
  removeLocalStorageByPrefix(workspaceStorageKey(PERIOD_ANALYSIS_CACHE_PREFIX));
  clearCachedExecutiveClaudeInsights();
}

export function clearCachedCompetitorAnalysis(sector: CompetitorSector, year: number): void {
  sessionStorage.removeItem(analysisCacheKey(sector, year));
}
