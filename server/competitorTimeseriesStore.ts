import type { CompetitorSector, CompetitorTrendYearPoint } from '../src/types/competitorAnalysis';
import type { CompetitorStructuredData } from './competitorStructuredData';
import {
  extractTargetCompaniesFromFolderYear,
  loadMasterCompetitorData,
  rebuildMasterCompetitorData,
  sectorToSlug,
  upsertMasterFromFolder,
  type MasterCompetitorData,
  type MasterCompetitorHistoryPoint,
} from './competitorMasterData';
import { getNexusDriveConfig, type NexusDriveConfig } from './nexusGoogleDrive';

export { normalizeCompanyKey, buildMasterEntityKey } from './competitorMasterData';

export type CompetitorTimeseriesStore = MasterCompetitorData;

export function createEmptyTrendYearPoint(year: number): CompetitorTrendYearPoint {
  return {
    year,
    hasData: false,
    revenue: null,
    operatingIncome: null,
    netIncome: null,
    operatingMargin: null,
    marketShare: null,
    cogsRatio: null,
    sgaRatio: null,
    currentRatio: null,
    accountsReceivableTurnover: null,
    employees: null,
    creditRating: null,
  };
}

export function snapshotToTrendYearPoint(
  snapshot: MasterCompetitorHistoryPoint | null | undefined,
  year: number,
  marketShare?: number | null,
): CompetitorTrendYearPoint {
  if (!snapshot?.has_data) {
    return createEmptyTrendYearPoint(year);
  }

  return {
    year,
    hasData: true,
    revenue: snapshot.revenue,
    operatingIncome: snapshot.operating_income,
    netIncome: snapshot.net_income,
    operatingMargin: snapshot.op_margin,
    marketShare: marketShare ?? null,
    cogsRatio: snapshot.cogs_ratio,
    sgaRatio: snapshot.sga_ratio,
    currentRatio: snapshot.current_ratio,
    accountsReceivableTurnover: snapshot.ar_turnover,
    employees: snapshot.employees,
    creditRating: snapshot.credit_rating,
  };
}

export function resolveAnalysisYearRange(
  baseYear: number,
  periodYears: number,
): { fromYear: number; toYear: number; years: number[] } {
  const span = Math.max(1, periodYears);
  const fromYear = baseYear - span + 1;
  const toYear = baseYear;
  const years: number[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    years.push(year);
  }
  return { fromYear, toYear, years };
}

function filterMasterBySector(master: MasterCompetitorData, sector: CompetitorSector): MasterCompetitorData {
  const slug = sectorToSlug(sector);
  return {
    ...master,
    companies: Object.fromEntries(
      Object.entries(master.companies).filter(([, entity]) => entity.sectorSlug === slug),
    ),
  };
}

export function loadCompetitorTimeseriesStore(
  config: NexusDriveConfig,
  sector: CompetitorSector,
): MasterCompetitorData | null {
  const master = loadMasterCompetitorData(config);
  if (!master) return null;
  return filterMasterBySector(master, sector);
}

export async function rebuildCompetitorTimeseriesStore(
  projectRoot: string,
  sector: CompetitorSector,
): Promise<MasterCompetitorData> {
  const master = await rebuildMasterCompetitorData(projectRoot, { sectors: [sector] });
  return filterMasterBySector(master, sector);
}

export function extractTargetCompanyKeysFromBaseYear(
  store: MasterCompetitorData,
  baseYear: number,
  structuredFallback?: CompetitorStructuredData | null,
): string[] {
  const sector = structuredFallback?.sector;
  if (!sector) {
    const first = Object.values(store.companies)[0];
    if (!first) return [];
    return extractTargetCompaniesFromFolderYear(store, first.sector, baseYear, structuredFallback ?? null);
  }
  return extractTargetCompaniesFromFolderYear(store, sector, baseYear, structuredFallback ?? null);
}

export async function upsertTimeseriesAfterYearRebuild(
  projectRoot: string,
  _sector: CompetitorSector,
  structured: CompetitorStructuredData,
): Promise<MasterCompetitorData> {
  return upsertMasterFromFolder(projectRoot, structured);
}
