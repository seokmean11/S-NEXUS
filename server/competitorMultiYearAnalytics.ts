import type {
  CompetitorMultiYearSummary,
  CompetitorSector,
  CompetitorTrendSummary,
  CompetitorTrendYearPoint,
} from '../src/types/competitorAnalysis';
import { getCompetitorCacheDir } from './competitorDrive';
import {
  loadMasterCompetitorData,
  rebuildMasterCompetitorData,
  sectorToSlug,
  type MasterCompetitorData,
} from './competitorMasterData';
import {
  createEmptyTrendYearPoint,
  extractTargetCompanyKeysFromBaseYear,
  resolveAnalysisYearRange,
  snapshotToTrendYearPoint,
} from './competitorTimeseriesStore';
import { loadStructuredDataFromCache } from './competitorStructuredData';
import { getNexusDriveConfig } from './nexusGoogleDrive';

function computeCagr(startValue: number, endValue: number, years: number): number | null {
  if (years <= 0 || startValue <= 0 || endValue <= 0) return null;
  return Math.round((Math.pow(endValue / startValue, 1 / years) - 1) * 10_000) / 100;
}

function buildCompanyAnalytics(
  series: CompetitorTrendYearPoint[],
  fromYear: number,
  toYear: number,
) {
  const withRevenue = series.filter((point) => point.hasData && point.revenue != null);
  const first = withRevenue[0];
  const last = withRevenue[withRevenue.length - 1];
  const withMargin = series.filter((point) => point.hasData && point.operatingMargin != null);
  const firstMargin = withMargin[0];
  const lastMargin = withMargin[withMargin.length - 1];
  const withShare = series.filter((point) => point.hasData && point.marketShare != null);
  const firstShare = withShare[0];
  const lastShare = withShare[withShare.length - 1];

  const yearSpan = toYear - fromYear;
  const dataYearCount = series.filter((point) => point.hasData).length;

  return {
    yearSpan,
    dataYearCount,
    missingYearCount: series.length - dataYearCount,
    revenueCagr:
      dataYearCount >= 2 && first?.revenue != null && last?.revenue != null && yearSpan > 0
        ? computeCagr(first.revenue, last.revenue, yearSpan)
        : null,
    operatingMarginChange:
      dataYearCount >= 2 &&
      firstMargin?.operatingMargin != null &&
      lastMargin?.operatingMargin != null
        ? Math.round((lastMargin.operatingMargin - firstMargin.operatingMargin) * 100) / 100
        : null,
    marketShareChange:
      dataYearCount >= 2 && firstShare?.marketShare != null && lastShare?.marketShare != null
        ? Math.round((lastShare.marketShare - firstShare.marketShare) * 100) / 100
        : null,
  };
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

function computeSectorTotals(
  store: MasterCompetitorData,
  targetKeys: string[],
  years: number[],
): CompetitorMultiYearSummary['sectorTotalsByYear'] {
  return years.map((year) => {
    let totalRevenue = 0;
    let companyCount = 0;

    for (const companyKey of targetKeys) {
      const snapshot = store.companies[companyKey]?.history[String(year)];
      if (snapshot?.has_data && snapshot.revenue != null && snapshot.revenue > 0) {
        totalRevenue += snapshot.revenue;
        companyCount += 1;
      }
    }

    return { year, totalRevenue, companyCount };
  });
}

function buildNormalizedSeriesForCompany(
  store: MasterCompetitorData,
  companyKey: string,
  years: number[],
  sectorTotalsByYear: CompetitorMultiYearSummary['sectorTotalsByYear'],
): CompetitorTrendYearPoint[] {
  const entity = store.companies[companyKey];

  return years.map((year) => {
    const snapshot = entity?.history[String(year)];
    const sectorTotal = sectorTotalsByYear.find((item) => item.year === year)?.totalRevenue ?? 0;

    const marketShare =
      snapshot?.has_data && snapshot.revenue != null && sectorTotal > 0
        ? Math.round((snapshot.revenue / sectorTotal) * 10_000) / 100
        : null;

    if (!entity) {
      return createEmptyTrendYearPoint(year);
    }

    return snapshotToTrendYearPoint(snapshot, year, marketShare);
  });
}

export async function buildCompetitorMultiYearSummary(
  projectRoot: string,
  sector: CompetitorSector,
  options: {
    baseYear: number;
    periodYears: number;
    rebuild?: boolean;
  },
): Promise<CompetitorMultiYearSummary> {
  if (options.rebuild) {
    await rebuildMasterCompetitorData(projectRoot, { sectors: [sector] });
  }

  const config = getNexusDriveConfig(projectRoot);
  const master =
    filterMasterBySector(loadMasterCompetitorData(config) ?? (await rebuildMasterCompetitorData(projectRoot)), sector);

  const { fromYear, toYear, years } = resolveAnalysisYearRange(options.baseYear, options.periodYears);

  const baseCacheDir = getCompetitorCacheDir(config, options.baseYear, sector);
  const baseStructured = loadStructuredDataFromCache(baseCacheDir);

  const targetCompanyKeys = extractTargetCompanyKeysFromBaseYear(master, options.baseYear, baseStructured);
  const sectorTotalsByYear = computeSectorTotals(master, targetCompanyKeys, years);

  const companies = targetCompanyKeys.map((companyKey) => {
    const entity = master.companies[companyKey];
    const series = buildNormalizedSeriesForCompany(master, companyKey, years, sectorTotalsByYear);
    const isNewEntrant = series.slice(0, -1).every((point) => !point.hasData) && series.at(-1)?.hasData === true;

    return {
      companyKey,
      companyName: entity?.companyName ?? companyKey,
      isNewEntrant,
      series,
      analytics: buildCompanyAnalytics(series, fromYear, toYear),
    };
  });

  companies.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  return {
    sector,
    baseYear: options.baseYear,
    periodYears: options.periodYears,
    fromYear,
    toYear,
    targetCompanyCount: targetCompanyKeys.length,
    companies,
    sectorTotalsByYear,
  };
}

export function buildCompetitorTrendSummary(
  projectRoot: string,
  sector: CompetitorSector,
  options: { fromYear: number; toYear: number; companyKeys?: string[] },
): CompetitorTrendSummary {
  const config = getNexusDriveConfig(projectRoot);
  const raw = loadMasterCompetitorData(config);
  const store = raw ? filterMasterBySector(raw, sector) : null;

  if (!store) {
    return {
      sector,
      fromYear: options.fromYear,
      toYear: options.toYear,
      companies: [],
      sectorTotalsByYear: [],
    };
  }

  const years: number[] = [];
  for (let year = options.fromYear; year <= options.toYear; year += 1) {
    years.push(year);
  }

  const targetKeys =
    options.companyKeys ??
    Object.keys(store.companies).filter((key) =>
      years.some((year) => store.companies[key]?.history[String(year)]?.has_data),
    );

  const sectorTotalsByYear = computeSectorTotals(store, targetKeys, years);
  const companies = targetKeys
    .map((companyKey) => {
      const entity = store.companies[companyKey];
      const series = buildNormalizedSeriesForCompany(store, companyKey, years, sectorTotalsByYear);
      const analytics = buildCompanyAnalytics(series, options.fromYear, options.toYear);
      return {
        companyKey,
        companyName: entity?.companyName ?? companyKey,
        series,
        analytics: {
          yearSpan: analytics.yearSpan,
          dataYearCount: analytics.dataYearCount,
          missingYearCount: analytics.missingYearCount,
          revenueCagr: analytics.revenueCagr ?? undefined,
          operatingMarginChange: analytics.operatingMarginChange ?? undefined,
          marketShareChange: analytics.marketShareChange ?? undefined,
        },
      };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  return {
    sector,
    fromYear: options.fromYear,
    toYear: options.toYear,
    companies,
    sectorTotalsByYear,
  };
}

export function resolveCompanyKeysFromNames(names: string[]): string[] {
  return names.map((name) =>
    name
      .replace(/\(주\)$/u, '')
      .replace(/\(유\)$/u, '')
      .replace(/\s+/g, '')
      .trim(),
  );
}

export function parsePeriodYears(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return null;
  return parsed;
}

export { rebuildMasterCompetitorData, loadMasterCompetitorData, scanCompetitorCacheTree } from './competitorMasterData';
