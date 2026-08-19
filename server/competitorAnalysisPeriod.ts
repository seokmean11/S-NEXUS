import fs from 'node:fs';

import type { CompetitorAnalysisSummary, CompetitorSector } from '../src/types/competitorAnalysis';
import type { CompetitorAnalysisPeriodWarning, CompetitorStandardRecord } from '../src/types/competitorStandard';
import {
  getCompetitorCacheDir,
  getCompetitorDriveStatus,
  getCompetitorFolderPath,
  getCompetitorSyncMeta,
  listCachedCompetitorFiles,
  ensureCompetitorYearCacheReady,
  syncCompetitorDriveCache,
} from './competitorDrive';
import { buildExecutiveSummaryFromStructured, buildExecutiveMultiYearSummary } from './competitorExecutiveData';
import { rebuildMasterCompetitorData, scanCompetitorCacheTree } from './competitorMasterData';
import type { CompetitorStructuredData } from './competitorStructuredData';
import { loadCompetitorAnalysisData } from './competitorStructuredData';
import { buildDedupedSummaryAnalysis } from './competitorSummaryDedup';
import { getNexusDriveConfig } from './nexusGoogleDrive';

const ANALYSIS_YEAR_MIN = 2021;
const ANALYSIS_YEAR_MAX = 2050;

export interface CompetitorPeriodAnalysisResult {
  sector: CompetitorSector;
  requestedFromYear: number;
  requestedToYear: number;
  effectiveFromYear: number | null;
  effectiveToYear: number | null;
  baseYear: number;
  /** 경쟁사 요약·파일 내역에 사용된 Drive 폴더 연도 (기간 내 최신) */
  summaryYear: number | null;
  warnings: CompetitorAnalysisPeriodWarning[];
  executive: Awaited<ReturnType<typeof buildExecutiveMultiYearSummary>>;
  analysis: CompetitorAnalysisSummary | null;
  configured: boolean;
  folderPath: string;
}

async function ensureYearSyncedFromDrive(
  root: string,
  year: number,
  sector: CompetitorSector,
  options: { force?: boolean },
): Promise<void> {
  if (options.force) {
    await ensureCompetitorYearCacheReady(root, year, sector, { force: true });
    return;
  }

  try {
    await syncCompetitorDriveCache(root, year, sector, { force: false });
  } catch (error) {
    console.warn(`[competitor] lightweight sync failed for ${year}/${sector}:`, error);
    await ensureCompetitorYearCacheReady(root, year, sector, { force: false });
  }
}

async function loadYearStructuredAndRecords(
  root: string,
  year: number,
  sector: CompetitorSector,
  options: { force: boolean; uploadConfigured: boolean },
): Promise<{ records: CompetitorStandardRecord[]; structured: CompetitorStructuredData | null }> {
  const config = getNexusDriveConfig(root);
  const cacheDir = getCompetitorCacheDir(config, year, sector);

  if (!fs.existsSync(cacheDir) || listCachedCompetitorFiles(root, year, sector).length === 0) {
    return { records: [], structured: null };
  }

  const structured = await loadCompetitorAnalysisData(root, year, sector, cacheDir, {
    rebuild: false,
    uploadToDrive: options.uploadConfigured,
  });

  if (!structured || structured.companies.length === 0) {
    return { records: [], structured: null };
  }

  return {
    records: buildExecutiveSummaryFromStructured(structured, sector).records.filter((record) => record.has_data),
    structured,
  };
}

function listCachedYearsForSector(root: string, sector: CompetitorSector): number[] {
  const config = getNexusDriveConfig(root);
  return scanCompetitorCacheTree(config)
    .filter((location) => location.sector === sector)
    .map((location) => location.folderYear)
    .sort((a, b) => a - b);
}

async function buildYearRecordsMap(
  root: string,
  sector: CompetitorSector,
  years: number[],
  options: { force: boolean; uploadConfigured: boolean; syncYears: number[] },
): Promise<{
  recordsByYear: Map<number, CompetitorStandardRecord[]>;
  structuredByYear: Map<number, CompetitorStructuredData>;
}> {
  const syncYearSet = new Set(options.syncYears);
  const structuredByYear = new Map<number, CompetitorStructuredData>();

  const entries = await Promise.all(
    years.map(async (year) => {
      if (options.force || syncYearSet.has(year)) {
        await ensureYearSyncedFromDrive(root, year, sector, { force: options.force });
      }

      const loaded = await loadYearStructuredAndRecords(root, year, sector, options);
      if (loaded.structured) {
        structuredByYear.set(year, loaded.structured);
      }
      return [year, loaded.records] as const;
    }),
  );

  return {
    recordsByYear: new Map(entries),
    structuredByYear,
  };
}

function yearHasRecords(map: Map<number, CompetitorStandardRecord[]>, year: number): boolean {
  return (map.get(year)?.length ?? 0) > 0;
}

function findNextYearWithData(
  map: Map<number, CompetitorStandardRecord[]>,
  afterYear: number,
  maxYear: number,
): number | null {
  for (let year = afterYear + 1; year <= maxYear; year += 1) {
    if (yearHasRecords(map, year)) return year;
  }
  return null;
}

function findPreviousYearWithData(
  map: Map<number, CompetitorStandardRecord[]>,
  beforeYear: number,
  minYear: number,
): number | null {
  for (let year = beforeYear - 1; year >= minYear; year -= 1) {
    if (yearHasRecords(map, year)) return year;
  }
  return null;
}

function buildWarnings(input: {
  requestedFromYear: number;
  requestedToYear: number;
  effectiveFromYear: number | null;
  effectiveToYear: number | null;
  dataByYear: Map<number, CompetitorStandardRecord[]>;
}): CompetitorAnalysisPeriodWarning[] {
  const warnings: CompetitorAnalysisPeriodWarning[] = [];
  const { requestedFromYear, requestedToYear, effectiveFromYear, effectiveToYear, dataByYear } = input;

  for (let year = requestedFromYear; year <= requestedToYear; year += 1) {
    if (!yearHasRecords(dataByYear, year)) {
      warnings.push({
        kind: 'missing_year',
        year,
        message: `${year}년에 설정하신 데이터가 Drive에 존재하지 않습니다.`,
      });
    }
  }

  if (
    effectiveFromYear != null &&
    effectiveFromYear !== requestedFromYear &&
    !yearHasRecords(dataByYear, requestedFromYear)
  ) {
    warnings.push({
      kind: 'start_fallback',
      year: requestedFromYear,
      fallbackYear: effectiveFromYear,
      message: `${requestedFromYear}년 데이터가 없어 ${effectiveFromYear}년 데이터를 분석 시작 연도로 반영했습니다.`,
    });
  }

  if (
    effectiveToYear != null &&
    effectiveToYear !== requestedToYear &&
    !yearHasRecords(dataByYear, requestedToYear)
  ) {
    warnings.push({
      kind: 'end_fallback',
      year: requestedToYear,
      fallbackYear: effectiveToYear,
      message: `${requestedToYear}년 데이터가 없어 ${effectiveToYear}년 데이터를 분석 종료 연도로 반영했습니다.`,
    });
  }

  return warnings;
}

function resolveEffectiveFromYear(
  requestedFromYear: number,
  requestedToYear: number,
  dataByYear: Map<number, CompetitorStandardRecord[]>,
): number | null {
  if (yearHasRecords(dataByYear, requestedFromYear)) return requestedFromYear;
  return findNextYearWithData(dataByYear, requestedFromYear, requestedToYear);
}

function resolveEffectiveToYear(
  requestedFromYear: number,
  requestedToYear: number,
  dataByYear: Map<number, CompetitorStandardRecord[]>,
): number | null {
  if (yearHasRecords(dataByYear, requestedToYear)) return requestedToYear;
  return findPreviousYearWithData(dataByYear, requestedToYear, requestedFromYear);
}

export async function runCompetitorPeriodAnalysis(
  root: string,
  sector: CompetitorSector,
  requestedFromYear: number,
  requestedToYear: number,
  options: { force?: boolean; uploadConfigured?: boolean } = {},
): Promise<CompetitorPeriodAnalysisResult> {
  const fromYear = Math.min(requestedFromYear, requestedToYear);
  const toYear = Math.max(requestedFromYear, requestedToYear);
  const force = options.force ?? false;
  const uploadConfigured = options.uploadConfigured ?? false;
  const driveStatus = getCompetitorDriveStatus(root);

  const emptyExecutive = {
    sector,
    fromYear,
    toYear,
    baseYear: toYear,
    requestedFromYear: fromYear,
    requestedToYear: toYear,
    effectiveFromYear: null as number | null,
    effectiveToYear: null as number | null,
    updatedAt: new Date().toISOString(),
    records: [] as CompetitorStandardRecord[],
    recordsByYear: {} as Record<string, CompetitorStandardRecord[]>,
    timeline: [],
    warnings: [] as CompetitorAnalysisPeriodWarning[],
  };

  if (!driveStatus.configured) {
    return {
      sector,
      requestedFromYear: fromYear,
      requestedToYear: toYear,
      effectiveFromYear: null,
      effectiveToYear: null,
      baseYear: toYear,
      warnings: [
        {
          kind: 'drive',
          year: fromYear,
          message: 'Google Drive 연동이 설정되지 않아 분석 데이터를 가져올 수 없습니다.',
        },
      ],
      executive: emptyExecutive,
      analysis: null,
      summaryYear: null,
      configured: false,
      folderPath: getCompetitorFolderPath(toYear, sector),
    };
  }

  const yearsInRange: number[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    yearsInRange.push(year);
  }

  const cachedYears = listCachedYearsForSector(root, sector);
  const probeYears = new Set<number>(yearsInRange);
  for (const cachedYear of cachedYears) {
    if (cachedYear >= fromYear - 3 && cachedYear <= toYear + 3) {
      probeYears.add(cachedYear);
    }
  }

  const { recordsByYear: dataByYear, structuredByYear } = await buildYearRecordsMap(
    root,
    sector,
    [...probeYears].sort((a, b) => a - b),
    {
      force,
      uploadConfigured,
      syncYears: yearsInRange,
    },
  );

  let effectiveFromYear = resolveEffectiveFromYear(fromYear, toYear, dataByYear);
  let effectiveToYear = resolveEffectiveToYear(fromYear, toYear, dataByYear);

  if (effectiveFromYear == null) {
    effectiveFromYear = findNextYearWithData(dataByYear, toYear, ANALYSIS_YEAR_MAX);
  }
  if (effectiveToYear == null) {
    effectiveToYear = findPreviousYearWithData(dataByYear, fromYear, ANALYSIS_YEAR_MIN);
  }

  const warnings = buildWarnings({
    requestedFromYear: fromYear,
    requestedToYear: toYear,
    effectiveFromYear,
    effectiveToYear,
    dataByYear,
  });

  const snapshotYear = effectiveToYear ?? effectiveFromYear ?? toYear;

  const executive = await buildExecutiveMultiYearSummary(root, sector, {
    fromYear,
    toYear,
    baseYear: snapshotYear,
    requestedFromYear: fromYear,
    requestedToYear: toYear,
    effectiveFromYear,
    effectiveToYear,
    force,
    uploadConfigured,
    warnings,
    preloadedRecordsByYear: dataByYear,
    skipMasterRebuild: true,
    overlayCacheOnly: true,
  });

  let analysis: CompetitorAnalysisSummary | null = null;

  /** 요약·파일 내역: 분석 기간 내 최신 연도 Drive 폴더만 사용 */
  let summaryYear: number | null = null;
  for (let year = toYear; year >= fromYear; year -= 1) {
    if (yearHasRecords(dataByYear, year)) {
      summaryYear = year;
      break;
    }
  }
  if (summaryYear == null) {
    summaryYear = effectiveToYear ?? effectiveFromYear ?? snapshotYear;
  }

  if (summaryYear != null && yearHasRecords(dataByYear, summaryYear)) {
    const structured = structuredByYear.get(summaryYear);

    if (structured) {
      analysis = buildDedupedSummaryAnalysis(structured, {
        configured: true,
        driveConnected: true,
        uploadConfigured,
        folderPath: getCompetitorFolderPath(summaryYear, sector),
        syncedAt: getCompetitorSyncMeta(root, summaryYear, sector)?.syncedAt,
        dataSource: 'structured-json',
      });
    }
  }

  if (force) {
    try {
      await rebuildMasterCompetitorData(root, { force: true, sectors: [sector] });
    } catch (error) {
      console.warn('[competitor] period analysis master rebuild failed:', error);
    }
  }

  return {
    sector,
    requestedFromYear: fromYear,
    requestedToYear: toYear,
    effectiveFromYear,
    effectiveToYear,
    baseYear: snapshotYear,
    summaryYear,
    warnings,
    executive,
    analysis,
    configured: true,
    folderPath: getCompetitorFolderPath(snapshotYear, sector),
  };
}
