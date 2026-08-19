import fs from 'node:fs';
import path from 'node:path';

import type { CompetitorSector } from '../src/types/competitorAnalysis';
import type { IndustryAnalysisEntry } from '../src/types/competitorStandard';
import { resolveCanonicalCompanyKey, resolveCanonicalCompanyName } from '../src/utils/competitorCompanyAliases';
import { inferCompetitorCompanyNameFromFileName } from '../src/utils/competitorCompanyName';
import { getCompetitorCacheDir, listCachedCompetitorFiles } from './competitorDrive';
import type { CompetitorSector as DriveSector } from './competitorDrive';
import { cleanCompanyLabel, normalizeCompanyKey } from './competitorDocumentIdentity';
import {
  extractCreditReportIndustryAnalysis,
  isIndustryAnalysisSourceText,
} from './competitorIndustryAnalysisExtract';
import { inferBizNoFromText } from './competitorStandardSchema';
import { normalizeSummaryBizNo } from './competitorSummaryDedup';
import { readCreditReportPdfTextsParallel } from './competitorCreditReportPdfText';
import { getNexusDriveConfig } from './nexusGoogleDrive';

export const INDUSTRY_ANALYSIS_FILE = 'industry-analysis.json';
export const INDUSTRY_ANALYSIS_VERSION = 2;

export interface IndustryAnalysisOverlay {
  version: number;
  year: number;
  sector: CompetitorSector;
  referenceYear: number;
  updatedAt: string;
  sourceSignature: string;
  entries: IndustryAnalysisEntry[];
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

function listFolderPdfNames(cacheDir: string): string[] {
  if (!fs.existsSync(cacheDir)) return [];

  return fs
    .readdirSync(cacheDir)
    .filter((name) => isPdfFile(name) && fs.statSync(path.join(cacheDir, name)).isFile())
    .sort();
}

function buildFolderPdfSignature(cacheDir: string, fileNames: string[]): string {
  return fileNames
    .map((fileName) => {
      const filePath = path.join(cacheDir, fileName);
      const stat = fs.statSync(filePath);
      return `${fileName}:${stat.size}:${stat.mtimeMs}`;
    })
    .sort()
    .join('|');
}

function resolveOverlayCompanyKey(
  fileName: string,
  companyName: string | undefined,
  bizNo: string | null,
  sector: CompetitorSector,
): { companyKey: string; companyName: string } {
  const normalizedBizNo = normalizeSummaryBizNo(bizNo);
  if (normalizedBizNo) {
    return {
      companyKey: `biz:${normalizedBizNo}`,
      companyName: resolveCanonicalCompanyName(
        normalizeCompanyKey(cleanCompanyLabel(companyName ?? '') ?? companyName ?? ''),
        sector,
      ),
    };
  }

  const fromFile = inferCompetitorCompanyNameFromFileName(fileName);
  const cleaned = cleanCompanyLabel(fromFile ?? companyName ?? fileName.replace(/\.[^.]+$/, ''));
  const baseKey = normalizeCompanyKey(cleaned ?? fromFile ?? companyName ?? fileName);
  const companyKey = resolveCanonicalCompanyKey(baseKey, sector);
  const displayName = resolveCanonicalCompanyName(baseKey, sector);
  return { companyKey, companyName: displayName };
}

function hasIndustryAverageData(entry: IndustryAnalysisEntry): boolean {
  const avg = entry.industryAverage;
  const hasByYear =
    entry.industryDebtRatioByYear != null &&
    Object.keys(entry.industryDebtRatioByYear).length > 0;
  return (
    hasByYear ||
    avg.debt_ratio != null ||
    avg.operating_margin != null ||
    avg.current_ratio != null
  );
}

export async function buildIndustryAnalysisOverlay(
  cacheDir: string,
  folderYear: number,
  sector: CompetitorSector,
): Promise<IndustryAnalysisOverlay | null> {
  const pdfNames = listFolderPdfNames(cacheDir);
  if (pdfNames.length === 0) return null;

  const sourceSignature = buildFolderPdfSignature(cacheDir, pdfNames);
  const entries: IndustryAnalysisEntry[] = [];
  let referenceYear = folderYear;

  const textsByPath = await readCreditReportPdfTextsParallel(
    pdfNames.map((fileName) => path.join(cacheDir, fileName)),
  );

  for (const fileName of pdfNames) {
    const filePath = path.join(cacheDir, fileName);
    const text = textsByPath.get(filePath) ?? '';
    if (!isIndustryAnalysisSourceText(text)) continue;

    const extracted = extractCreditReportIndustryAnalysis(text, folderYear);
    if (
      Object.keys(extracted.industryDebtRatioByYear).length === 0 &&
      extracted.industryAverage.debt_ratio == null &&
      extracted.industryAverage.operating_margin == null &&
      extracted.industryAverage.current_ratio == null
    ) {
      continue;
    }

    const bizNo = inferBizNoFromText(text);
    const inferredName = inferCompetitorCompanyNameFromFileName(fileName);
    const { companyKey, companyName } = resolveOverlayCompanyKey(
      fileName,
      inferredName,
      bizNo,
      sector,
    );
    if (extracted.referenceYear != null) {
      referenceYear = extracted.referenceYear;
    }

    entries.push({
      companyKey,
      companyName,
      biz_no: bizNo,
      industryName: extracted.industryName,
      industryCode: extracted.industryCode,
      referenceYear: extracted.referenceYear ?? folderYear,
      companyRatios: extracted.companyRatios,
      industryAverage: extracted.industryAverage,
      industryDebtRatioByYear: Object.fromEntries(
        Object.entries(extracted.industryDebtRatioByYear).map(([year, value]) => [year, value]),
      ),
      source_file: fileName,
      source_type: 'credit-report',
    });
  }

  if (entries.length === 0) return null;

  const deduped = new Map<string, IndustryAnalysisEntry>();
  for (const entry of entries) {
    if (!hasIndustryAverageData(entry)) continue;
    const existing = deduped.get(entry.companyKey);
    if (!existing) {
      deduped.set(entry.companyKey, entry);
      continue;
    }
    const existingScore =
      Object.keys(existing.industryDebtRatioByYear ?? {}).length +
      (existing.industryAverage.debt_ratio != null ? 1 : 0) +
      (existing.industryAverage.operating_margin != null ? 1 : 0) +
      (existing.industryAverage.current_ratio != null ? 1 : 0);
    const nextScore =
      Object.keys(entry.industryDebtRatioByYear ?? {}).length +
      (entry.industryAverage.debt_ratio != null ? 1 : 0) +
      (entry.industryAverage.operating_margin != null ? 1 : 0) +
      (entry.industryAverage.current_ratio != null ? 1 : 0);
    if (nextScore >= existingScore) {
      deduped.set(entry.companyKey, entry);
    }
  }

  return {
    version: INDUSTRY_ANALYSIS_VERSION,
    year: folderYear,
    sector,
    referenceYear,
    updatedAt: new Date().toISOString(),
    sourceSignature,
    entries: [...deduped.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko')),
  };
}

export function loadIndustryAnalysisOverlay(cacheDir: string): IndustryAnalysisOverlay | null {
  const filePath = path.join(cacheDir, INDUSTRY_ANALYSIS_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as IndustryAnalysisOverlay;
    if (parsed.version !== INDUSTRY_ANALYSIS_VERSION || !Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveIndustryAnalysisOverlay(cacheDir: string, overlay: IndustryAnalysisOverlay): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, INDUSTRY_ANALYSIS_FILE),
    `${JSON.stringify(overlay, null, 2)}\n`,
    'utf8',
  );
}

export async function loadOrBuildIndustryAnalysisOverlay(
  projectRoot: string,
  folderYear: number,
  sector: DriveSector,
  options?: { force?: boolean; cacheOnly?: boolean },
): Promise<IndustryAnalysisOverlay | null> {
  const config = getNexusDriveConfig(projectRoot);
  const cacheDir = getCompetitorCacheDir(config, folderYear, sector);
  const pdfNames = listCachedCompetitorFiles(projectRoot, folderYear, sector).filter(isPdfFile);

  if (pdfNames.length === 0) return null;

  const nextSignature = buildFolderPdfSignature(cacheDir, pdfNames.sort());
  const cached = loadIndustryAnalysisOverlay(cacheDir);

  if (!options?.force && cached && cached.sourceSignature === nextSignature) {
    return cached;
  }

  if (options?.cacheOnly) {
    return null;
  }

  const built = await buildIndustryAnalysisOverlay(cacheDir, folderYear, sector);
  if (!built) return cached;

  if (built.sourceSignature !== nextSignature) {
    built.sourceSignature = nextSignature;
  }

  saveIndustryAnalysisOverlay(cacheDir, built);
  return built;
}

export function industryOverlayEntriesToMap(
  overlay: IndustryAnalysisOverlay | null,
): Record<string, IndustryAnalysisEntry> {
  if (!overlay) return {};
  return Object.fromEntries(overlay.entries.map((entry) => [entry.companyKey, entry]));
}

export async function buildIndustryAnalysisByYear(
  projectRoot: string,
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  options?: { force?: boolean; cacheOnly?: boolean },
): Promise<Record<string, Record<string, IndustryAnalysisEntry>>> {
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index);
  const entries = await Promise.all(
    years.map(async (year) => {
      const overlay = await loadOrBuildIndustryAnalysisOverlay(projectRoot, year, sector, options);
      if (!overlay || overlay.entries.length === 0) return null;
      return [String(year), industryOverlayEntriesToMap(overlay)] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, Record<string, IndustryAnalysisEntry>] => entry != null));
}
