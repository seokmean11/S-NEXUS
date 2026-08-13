import type { CompetitorAnalysisSummary, CompetitorSector } from '@/types/competitorAnalysis';
import { COMPETITOR_SECTORS } from '@/types/competitorAnalysis';
import { clearCachedExecutiveClaudeInsights } from '@/utils/competitorExecutiveClaudeInsightCache';

const LEGACY_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-selection';
const UPLOAD_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-upload-selection';
const ANALYSIS_SELECTION_STORAGE_KEY = 'perf-dashboard-competitor-analysis-selection';
const ANALYSIS_CACHE_PREFIX = 'perf-dashboard-competitor-analysis:';
const ANALYSIS_CACHE_VERSION = '2';

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
  return `${ANALYSIS_CACHE_PREFIX}${sector}:${year}`;
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
  return parseSelectionState(localStorage.getItem(LEGACY_SELECTION_STORAGE_KEY));
}

export function loadUploadSelection(): CompetitorSelectionState {
  const stored = parseSelectionState(localStorage.getItem(UPLOAD_SELECTION_STORAGE_KEY));
  if (stored.sector || stored.year) return stored;
  return readLegacySelection();
}

export function saveUploadSelection(state: CompetitorSelectionState): void {
  localStorage.setItem(
    UPLOAD_SELECTION_STORAGE_KEY,
    JSON.stringify({
      sector: state.sector,
      year: state.sector ? state.year : null,
    }),
  );
}

export function loadAnalysisSelection(): CompetitorAnalysisSelectionState {
  try {
    const raw = localStorage.getItem(ANALYSIS_SELECTION_STORAGE_KEY);
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
    ANALYSIS_SELECTION_STORAGE_KEY,
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

export function clearCompetitorAnalysisStorage(): void {
  localStorage.removeItem(LEGACY_SELECTION_STORAGE_KEY);
  localStorage.removeItem(UPLOAD_SELECTION_STORAGE_KEY);
  localStorage.removeItem(ANALYSIS_SELECTION_STORAGE_KEY);

  const keysToRemove: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(ANALYSIS_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
  clearCachedExecutiveClaudeInsights();
}

export function clearCachedCompetitorAnalysis(sector: CompetitorSector, year: number): void {
  sessionStorage.removeItem(analysisCacheKey(sector, year));
}
