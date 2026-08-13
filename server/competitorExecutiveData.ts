import fs from 'node:fs';
import type { CompetitorParsedDocument, CompetitorSector } from '../src/types/competitorAnalysis';
import type {
  CompetitorAnalysisPeriodWarning,
  CompetitorExecutiveMultiYearSummary,
  CompetitorExecutiveSummary,
  CompetitorStandardRecord,
  ExecutiveTimelinePoint,
} from '../src/types/competitorStandard';
import { getCompetitorCacheDir, listCachedCompetitorFiles, syncCompetitorDriveCache } from './competitorDrive';
import type { CompetitorStructuredCompany, CompetitorStructuredData } from './competitorStructuredData';
import { loadCompetitorAnalysisData } from './competitorStructuredData';
import { getNexusDriveConfig } from './nexusGoogleDrive';
import { rebuildMasterCompetitorData } from './competitorMasterData';
import { dedupeStructuredCompaniesForSummary } from './competitorSummaryDedup';
import { buildStandardRecord } from './competitorStandardSchema';
import {
  buildCompanyFiscalDedupKey,
  documentToSelectionMeta,
  pickPrimaryDocument,
  resolveDocumentFiscalYear,
  toSourceTypeLabel,
} from './competitorDocumentDedup';

function safeNum(value: number | null | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value;
}

function buildTimelinePoint(year: number, records: CompetitorStandardRecord[]): ExecutiveTimelinePoint {
  const withRevenue = records.filter((r) => r.financials.revenue != null && r.financials.revenue > 0);
  const withMargin = records.filter((r) => r.ratios.operating_margin != null);

  const avgRevenue =
    withRevenue.length > 0
      ? withRevenue.reduce((sum, r) => sum + safeNum(r.financials.revenue), 0) / withRevenue.length
      : null;
  const avgOperatingMargin =
    withMargin.length > 0
      ? withMargin.reduce((sum, r) => sum + safeNum(r.ratios.operating_margin), 0) / withMargin.length
      : null;
  const totalRevenue = records.reduce((sum, record) => sum + safeNum(record.financials.revenue), 0);

  return {
    year,
    companyCount: records.length,
    avgRevenue: avgRevenue != null ? Math.round(avgRevenue * 100) / 100 : null,
    avgOperatingMargin:
      avgOperatingMargin != null ? Math.round(avgOperatingMargin * 100) / 100 : null,
    totalRevenue: totalRevenue > 0 ? Math.round(totalRevenue * 100) / 100 : null,
  };
}

function buildRecordFromStructuredCompany(
  company: CompetitorStructuredCompany,
  folderYear: number,
): CompetitorStandardRecord {
  return buildStandardRecord({
    companyName: company.companyName,
    year: company.fiscalYear ?? folderYear,
    metrics: company.metrics,
    financials: company.financials,
    text: undefined,
    sourceFile: company.source_file ?? company.sourceFiles[0],
    sourceType: company.source_type ?? toSourceTypeLabel(company.documentType, company.source_file),
    documentType: company.documentType,
    metadata: company.metadata,
  });
}

function buildRecordFromBestDocument(
  companyName: string,
  docs: CompetitorParsedDocument[],
  folderYear: number,
): CompetitorStandardRecord {
  const metas = docs.map((doc) =>
    documentToSelectionMeta(doc, doc.companyName ?? companyName, folderYear),
  );
  const primary = pickPrimaryDocument(metas);
  const best = primary
    ? docs.find((doc) => doc.fileName === primary.sourceFile) ?? docs[0]
    : docs[0];

  return buildStandardRecord({
    companyName: best?.companyName ?? companyName,
    year: resolveDocumentFiscalYear(best?.fiscalYear, folderYear),
    metrics: best?.metrics ?? [],
    text: best?.unitContextText ?? best?.rawTextPreview,
    sourceFile: best?.fileName,
    sourceType: best ? toSourceTypeLabel(best.documentType, best.fileName) : undefined,
    documentType: best?.documentType,
    metadata: best?.metadata,
  });
}

export function buildExecutiveSummaryFromStructured(
  structured: CompetitorStructuredData,
  sector: CompetitorSector,
): CompetitorExecutiveSummary {
  const records = dedupeStructuredCompaniesForSummary(structured.companies, sector)
    .map((company) => buildRecordFromStructuredCompany(company, structured.year))
    .sort((a, b) => (b.financials.revenue ?? 0) - (a.financials.revenue ?? 0));

  return {
    year: structured.year,
    sector,
    updatedAt: structured.updatedAt,
    records,
  };
}

export function buildExecutiveSummaryFromDocuments(input: {
  year: number;
  sector: CompetitorSector;
  documents: CompetitorParsedDocument[];
  companies: Array<{ companyName: string }>;
  updatedAt?: string;
}): CompetitorExecutiveSummary {
  const docsByDedupKey = new Map<string, CompetitorParsedDocument[]>();

  for (const doc of input.documents) {
    const companyKey = doc.companyName ?? doc.fileName.replace(/\.[^.]+$/, '');
    const fiscalYear = resolveDocumentFiscalYear(doc.fiscalYear, input.year);
    const dedupKey = buildCompanyFiscalDedupKey(companyKey, fiscalYear);
    const bucket = docsByDedupKey.get(dedupKey) ?? [];
    bucket.push(doc);
    docsByDedupKey.set(dedupKey, bucket);
  }

  const records: CompetitorStandardRecord[] = [];

  for (const [, docs] of docsByDedupKey) {
    const companyName = docs[0]?.companyName ?? docs[0]?.fileName.replace(/\.[^.]+$/, '') ?? '';
    const record = buildRecordFromBestDocument(companyName, docs, input.year);
    if (record.has_data) records.push(record);
  }

  records.sort((a, b) => (b.financials.revenue ?? 0) - (a.financials.revenue ?? 0));

  return {
    year: input.year,
    sector: input.sector,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    records,
  };
}

export async function buildExecutiveMultiYearSummary(
  root: string,
  sector: CompetitorSector,
  options: {
    fromYear: number;
    toYear: number;
    baseYear: number;
    requestedFromYear?: number;
    requestedToYear?: number;
    effectiveFromYear?: number | null;
    effectiveToYear?: number | null;
    warnings?: CompetitorAnalysisPeriodWarning[];
    force?: boolean;
    uploadConfigured?: boolean;
    preloadedRecordsByYear?: Map<number, CompetitorStandardRecord[]>;
    skipMasterRebuild?: boolean;
  },
): Promise<CompetitorExecutiveMultiYearSummary> {
  const config = getNexusDriveConfig(root);
  const recordsByYear: Record<string, CompetitorStandardRecord[]> = {};
  const timeline: ExecutiveTimelinePoint[] = [];
  let latestUpdatedAt = new Date().toISOString();

  for (let year = options.fromYear; year <= options.toYear; year += 1) {
    const preloaded = options.preloadedRecordsByYear?.get(year);
    if (preloaded) {
      recordsByYear[String(year)] = preloaded;
      timeline.push(buildTimelinePoint(year, preloaded));
      continue;
    }

    const cacheDir = getCompetitorCacheDir(config, year, sector);

    if (options.force) {
      try {
        await syncCompetitorDriveCache(root, year, sector, { force: true });
      } catch (error) {
        console.warn(`[competitor] executive sync failed for ${year}/${sector}:`, error);
      }
    }

    if (!fs.existsSync(cacheDir)) {
      recordsByYear[String(year)] = [];
      timeline.push(buildTimelinePoint(year, []));
      continue;
    }

    const cachedFiles = listCachedCompetitorFiles(root, year, sector);
    if (cachedFiles.length === 0) {
      recordsByYear[String(year)] = [];
      timeline.push(buildTimelinePoint(year, []));
      continue;
    }

    const structured = await loadCompetitorAnalysisData(root, year, sector, cacheDir, {
      rebuild: options.force ?? false,
      uploadToDrive: options.uploadConfigured ?? false,
    });

    if (!structured) {
      recordsByYear[String(year)] = [];
      timeline.push(buildTimelinePoint(year, []));
      continue;
    }

    const summary = buildExecutiveSummaryFromStructured(structured, sector);
    recordsByYear[String(year)] = summary.records;
    timeline.push(buildTimelinePoint(year, summary.records));
    if (summary.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = summary.updatedAt;
    }
  }

  const baseRecords = recordsByYear[String(options.baseYear)] ?? [];

  if (options.force && !options.skipMasterRebuild) {
    try {
      await rebuildMasterCompetitorData(root, { force: true, sectors: [sector] });
    } catch (error) {
      console.warn('[competitor] executive master rebuild failed:', error);
    }
  }

  return {
    sector,
    fromYear: options.fromYear,
    toYear: options.toYear,
    baseYear: options.baseYear,
    requestedFromYear: options.requestedFromYear ?? options.fromYear,
    requestedToYear: options.requestedToYear ?? options.toYear,
    effectiveFromYear: options.effectiveFromYear ?? null,
    effectiveToYear: options.effectiveToYear ?? null,
    warnings: options.warnings ?? [],
    updatedAt: latestUpdatedAt,
    records: baseRecords,
    recordsByYear,
    timeline,
  };
}
