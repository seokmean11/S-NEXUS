import fs from 'node:fs';
import path from 'node:path';
import type { CompetitorNormalizedFinancials, CompetitorSector } from '../src/types/competitorAnalysis';
import {
  COMPETITOR_DRIVE_ROOT_FOLDER,
  isCompetitorSector,
} from './competitorDrive';
import { scanAllCompetitorLocations } from './competitorFolderRouting';
import { resolveCanonicalCompanyKey, resolveCanonicalCompanyName } from '../src/utils/competitorCompanyAliases';
import { normalizeCompanyKey } from './competitorDocumentIdentity';
import { buildStandardRecord } from './competitorStandardSchema';
import type { CompetitorStructuredCompany, CompetitorStructuredData } from './competitorStructuredData';
import { parseDocumentType, shouldReplaceDocument } from './competitorDocumentDedup';
import {
  buildCompetitorSourceSignature,
  loadStructuredDataFromCache,
  rebuildCompetitorStructuredData,
} from './competitorStructuredData';
import { getNexusDriveConfig, type NexusDriveConfig } from './nexusGoogleDrive';

export const MASTER_COMPETITOR_DATA_FILE = 'master-competitor-data.json';
export const MASTER_COMPETITOR_DATA_VERSION = 7;

export type CompetitorSectorSlug = 'exhibition' | 'interior';

/** 회사·연도별 독립 flat 레코드 (글로벌 공유 방지) */
export interface MasterCompetitorFlatRecord {
  recordKey: string;
  sector: CompetitorSectorSlug;
  year: number;
  folder_year: number;
  company_name: string;
  company_key: string;
  metadata: {
    ceo_name: string | null;
    biz_no: string | null;
    foundation_year: number | null;
    employees: number | null;
    credit_rating: string | null;
    source_type: string | null;
    source_file: string | null;
  };
  financials: {
    unit: '백만원';
    revenue: number;
    cogs: number;
    gross_profit: number;
    sga: number;
    operating_profit: number;
    net_income: number;
    total_assets: number;
    current_assets: number;
    cash_assets: number;
    total_liabilities: number;
    current_liabilities: number;
    short_term_debt: number;
    long_term_debt: number;
    total_equity: number;
    total_debt: number;
    receivables: number;
  };
  ratios: {
    cogs_ratio: number;
    sga_ratio: number;
    operating_margin: number;
    debt_ratio: number;
    receivables_turnover: number;
  };
  document_type: string;
  parsed_at: string;
}

export interface MasterCompetitorHistoryPoint {
  revenue: number | null;
  operating_income: number | null;
  op_margin: number | null;
  net_income: number | null;
  cogs_ratio: number | null;
  sga_ratio: number | null;
  current_ratio: number | null;
  ar_turnover: number | null;
  employees: number | null;
  credit_rating: string | null;
  has_data: boolean;
  fiscal_year: number;
  folder_year: number;
  source_files: string[];
  document_type: string;
  parsed_at: string;
}

export interface MasterCompetitorEntity {
  companyKey: string;
  companyName: string;
  sector: CompetitorSector;
  sectorSlug: CompetitorSectorSlug;
  history: Record<string, MasterCompetitorHistoryPoint>;
}

export interface MasterCompetitorData {
  version: typeof MASTER_COMPETITOR_DATA_VERSION;
  updatedAt: string;
  scanSignatures: Record<string, string>;
  records: MasterCompetitorFlatRecord[];
  companies: Record<string, MasterCompetitorEntity>;
}

export interface CompetitorCacheLocation {
  folderYear: number;
  sector: CompetitorSector;
  cacheDir: string;
  signatureKey: string;
}

export { normalizeCompanyKey } from './competitorDocumentIdentity';

export function sectorToSlug(sector: CompetitorSector): CompetitorSectorSlug {
  return sector === '전시사업' ? 'exhibition' : 'interior';
}

export function buildMasterEntityKey(sector: CompetitorSector, companyKey: string): string {
  return `${sectorToSlug(sector)}:${companyKey}`;
}

export function getMasterCompetitorDataPath(config: NexusDriveConfig): string {
  return path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER, MASTER_COMPETITOR_DATA_FILE);
}

export function getCompetitorAnalysisRoot(config: NexusDriveConfig): string {
  return path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER);
}

export function scanCompetitorCacheTree(config: NexusDriveConfig): CompetitorCacheLocation[] {
  return scanAllCompetitorLocations(config).map((loc) => ({
    folderYear: loc.folderYear,
    sector: loc.sector,
    cacheDir: loc.cacheDir,
    signatureKey: loc.signatureKey,
  }));
}

function buildFlatRecordKey(sector: CompetitorSector, companyKey: string, year: number): string {
  return `${sectorToSlug(sector)}:${companyKey}:${year}`;
}

function structuredCompanyToFlatRecord(
  company: CompetitorStructuredCompany,
  folderYear: number,
  sector: CompetitorSector,
): MasterCompetitorFlatRecord {
  const fiscalYear = folderYear;
  const standard = buildStandardRecord({
    companyName: company.companyName,
    year: fiscalYear,
    metrics: company.metrics,
    financials: company.financials,
    sourceFile: company.source_file ?? company.sourceFiles[0],
    sourceType: company.source_type,
    documentType: company.documentType,
    metadata: company.metadata,
  });

  return {
    recordKey: buildFlatRecordKey(sector, resolveCanonicalCompanyKey(company.companyKey, sector), fiscalYear),
    sector: sectorToSlug(sector),
    year: fiscalYear,
    folder_year: folderYear,
    company_name: resolveCanonicalCompanyName(company.companyKey, sector),
    company_key: resolveCanonicalCompanyKey(company.companyKey, sector),
    metadata: {
      ceo_name: standard.metadata.ceo_name,
      biz_no: standard.biz_no,
      foundation_year: standard.metadata.foundation_year,
      employees: standard.metadata.employees,
      credit_rating: standard.metadata.credit_rating,
      source_type: standard.metadata.source_type,
      source_file: standard.metadata.source_file,
    },
    financials: {
      unit: '백만원',
      revenue: standard.financials.revenue ?? 0,
      cogs: standard.financials.cogs ?? 0,
      gross_profit: standard.financials.gross_profit ?? 0,
      sga: standard.financials.sga ?? 0,
      operating_profit: standard.financials.operating_profit ?? 0,
      net_income: standard.financials.net_income ?? 0,
      total_assets: standard.financials.total_assets ?? 0,
      current_assets: standard.financials.current_assets ?? 0,
      cash_assets: standard.financials.cash_assets ?? 0,
      total_liabilities: standard.financials.total_liabilities ?? 0,
      current_liabilities: standard.financials.current_liabilities ?? 0,
      short_term_debt: standard.financials.short_term_debt ?? 0,
      long_term_debt: standard.financials.long_term_debt ?? 0,
      total_equity: standard.financials.total_equity ?? 0,
      total_debt: standard.financials.total_debt ?? 0,
      receivables: standard.financials.receivables ?? 0,
    },
    ratios: {
      cogs_ratio: standard.ratios.cogs_ratio ?? 0,
      sga_ratio: standard.ratios.sga_ratio ?? 0,
      operating_margin: standard.ratios.operating_margin ?? 0,
      debt_ratio: standard.ratios.debt_ratio ?? 0,
      receivables_turnover: standard.ratios.receivables_turnover ?? 0,
    },
    document_type: company.documentType,
    parsed_at: company.parsedAt,
  };
}

function upsertFlatRecord(
  records: Map<string, MasterCompetitorFlatRecord>,
  candidate: MasterCompetitorFlatRecord,
): void {
  const existing = records.get(candidate.recordKey);
  if (!existing) {
    records.set(candidate.recordKey, candidate);
    return;
  }

  if (
    shouldReplaceDocument(
      {
        documentType: parseDocumentType(existing.document_type),
        parsedAt: existing.parsed_at,
        sourceFile: existing.metadata.source_file ?? undefined,
      },
      {
        documentType: parseDocumentType(candidate.document_type),
        parsedAt: candidate.parsed_at,
        sourceFile: candidate.metadata.source_file ?? undefined,
      },
    )
  ) {
    records.set(candidate.recordKey, candidate);
  }
}

export function createEmptyMasterCompetitorData(): MasterCompetitorData {
  return {
    version: MASTER_COMPETITOR_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    scanSignatures: {},
    records: [],
    companies: {},
  };
}

export function loadMasterCompetitorData(config: NexusDriveConfig): MasterCompetitorData | null {
  const targetPath = getMasterCompetitorDataPath(config);
  if (!fs.existsSync(targetPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as MasterCompetitorData;
    if (parsed.version !== MASTER_COMPETITOR_DATA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMasterCompetitorData(config: NexusDriveConfig, data: MasterCompetitorData): void {
  fs.mkdirSync(path.dirname(getMasterCompetitorDataPath(config)), { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(getMasterCompetitorDataPath(config), JSON.stringify(data, null, 2), 'utf8');
}

export function financialsToHistoryPoint(
  financials: CompetitorNormalizedFinancials,
  meta: {
    fiscalYear: number;
    folderYear: number;
    sourceFiles: string[];
    documentType: string;
    parsedAt: string;
  },
): MasterCompetitorHistoryPoint {
  const hasData =
    financials.revenue != null || financials.operatingIncome != null || financials.netIncome != null;

  return {
    revenue: financials.revenue ?? null,
    operating_income: financials.operatingIncome ?? null,
    op_margin: financials.operatingMargin ?? null,
    net_income: financials.netIncome ?? null,
    cogs_ratio: financials.cogsRatio ?? null,
    sga_ratio: financials.sgaRatio ?? null,
    current_ratio: financials.currentRatio ?? null,
    ar_turnover: financials.accountsReceivableTurnover ?? null,
    employees: financials.employees ?? null,
    credit_rating: financials.creditRating ?? null,
    has_data: hasData,
    fiscal_year: meta.fiscalYear,
    folder_year: meta.folderYear,
    source_files: [...meta.sourceFiles],
    document_type: meta.documentType,
    parsed_at: meta.parsedAt,
  };
}

function historyShouldReplace(
  previous: MasterCompetitorHistoryPoint,
  candidate: MasterCompetitorHistoryPoint,
): boolean {
  return shouldReplaceDocument(
    {
      documentType: parseDocumentType(previous.document_type),
      parsedAt: previous.parsed_at,
      sourceFile: previous.source_files[0],
    },
    {
      documentType: parseDocumentType(candidate.document_type),
      parsedAt: candidate.parsed_at,
      sourceFile: candidate.source_files[0],
    },
  );
}

export function upsertCompanyIntoMaster(
  master: MasterCompetitorData,
  company: CompetitorStructuredCompany,
  folderYear: number,
  sector: CompetitorSector,
): void {
  const fiscalYear = folderYear;
  const canonicalKey = resolveCanonicalCompanyKey(company.companyKey, sector);
  const canonicalName = resolveCanonicalCompanyName(canonicalKey, sector);
  const entityKey = buildMasterEntityKey(sector, canonicalKey);
  const legacyEntityKey = buildMasterEntityKey(sector, company.companyKey);
  const historyKey = String(fiscalYear);

  const candidate = financialsToHistoryPoint(company.financials, {
    fiscalYear,
    folderYear,
    sourceFiles: company.sourceFiles,
    documentType: company.documentType,
    parsedAt: company.parsedAt,
  });

  if (legacyEntityKey !== entityKey && master.companies[legacyEntityKey]) {
    const legacy = master.companies[legacyEntityKey];
    const merged = master.companies[entityKey] ?? {
      companyKey: canonicalKey,
      companyName: canonicalName,
      sector,
      sectorSlug: sectorToSlug(sector),
      history: { ...legacy.history },
    };

    for (const [year, point] of Object.entries(legacy.history)) {
      const previous = merged.history[year];
      if (!previous || historyShouldReplace(previous, point)) {
        merged.history[year] = point;
      }
    }

    master.companies[entityKey] = merged;
    delete master.companies[legacyEntityKey];
  }

  const existing = master.companies[entityKey] ?? {
    companyKey: canonicalKey,
    companyName: canonicalName,
    sector,
    sectorSlug: sectorToSlug(sector),
    history: {},
  };

  existing.companyKey = canonicalKey;
  existing.companyName = canonicalName;
  existing.sector = sector;
  existing.sectorSlug = sectorToSlug(sector);

  const previous = existing.history[historyKey];
  if (!previous || historyShouldReplace(previous, candidate)) {
    existing.history[historyKey] = candidate;
  }

  master.companies[entityKey] = existing;
}

export function upsertStructuredIntoMaster(
  master: MasterCompetitorData,
  structured: CompetitorStructuredData,
): MasterCompetitorData {
  master.scanSignatures[`${structured.year}/${structured.sector}`] = structured.sourceSignature;

  const recordMap = new Map(master.records.map((record) => [record.recordKey, record]));

  for (const company of structured.companies) {
    upsertCompanyIntoMaster(master, company, structured.year, structured.sector);
    upsertFlatRecord(
      recordMap,
      structuredCompanyToFlatRecord(company, structured.year, structured.sector),
    );
  }

  master.records = [...recordMap.values()].sort(
    (a, b) => a.year - b.year || a.company_name.localeCompare(b.company_name, 'ko'),
  );

  return master;
}

export async function upsertMasterFromFolder(
  projectRoot: string,
  structured: CompetitorStructuredData,
): Promise<MasterCompetitorData> {
  const config = getNexusDriveConfig(projectRoot);
  const master = loadMasterCompetitorData(config) ?? createEmptyMasterCompetitorData();
  upsertStructuredIntoMaster(master, structured);
  saveMasterCompetitorData(config, master);
  return master;
}

export async function rebuildMasterCompetitorData(
  projectRoot: string,
  options?: { force?: boolean; sectors?: CompetitorSector[]; locationKeys?: string[] },
): Promise<MasterCompetitorData> {
  const config = getNexusDriveConfig(projectRoot);
  let master = options?.force
    ? createEmptyMasterCompetitorData()
    : (loadMasterCompetitorData(config) ?? createEmptyMasterCompetitorData());

  const locations = scanCompetitorCacheTree(config).filter((loc) => {
    if (options?.sectors?.length && !options.sectors.includes(loc.sector)) return false;
    if (options?.locationKeys?.length && !options.locationKeys.includes(loc.signatureKey)) return false;
    return true;
  });

  for (const location of locations) {
    const signature = buildCompetitorSourceSignature(location.cacheDir);
    if (!signature) continue;

    if (!options?.force && master.scanSignatures[location.signatureKey] === signature) {
      continue;
    }

    let structured = loadStructuredDataFromCache(location.cacheDir);
    if (!structured || structured.sourceSignature !== signature) {
      structured = await rebuildCompetitorStructuredData(
        projectRoot,
        location.folderYear,
        location.sector,
        location.cacheDir,
        { uploadToDrive: false, skipMasterUpsert: true },
      );
    }
    if (!structured) continue;

    master = upsertStructuredIntoMaster(master, structured);
  }

  saveMasterCompetitorData(config, master);

  const allPdfFiles: string[] = [];
  const extractedSources = new Set<string>();
  for (const location of locations) {
    if (!fs.existsSync(location.cacheDir)) continue;
    for (const name of fs.readdirSync(location.cacheDir)) {
      if (name.toLowerCase().endsWith('.pdf')) allPdfFiles.push(`${location.signatureKey}/${name}`);
    }
    const structured = loadStructuredDataFromCache(location.cacheDir);
    structured?.companies.forEach((c) => {
      const src = c.source_file ?? c.sourceFiles[0];
      if (src) extractedSources.add(`${location.signatureKey}/${src}`);
    });
  }
  const missingPdfs = allPdfFiles.filter((f) => !extractedSources.has(f));
  console.info(
    `[competitor] master merge: PDF ${allPdfFiles.length}개 · 추출 ${extractedSources.size}개 · 기업 엔티티 ${Object.keys(master.companies).length}개`,
  );
  if (missingPdfs.length > 0) {
    console.warn('[competitor] master 누락 PDF:', missingPdfs.join(', '));
  }

  return master;
}

export function extractTargetCompaniesFromFolderYear(
  master: MasterCompetitorData,
  sector: CompetitorSector,
  folderYear: number,
  structuredFallback?: CompetitorStructuredData | null,
): string[] {
  if (structuredFallback?.year === folderYear && structuredFallback.sector === sector) {
    return structuredFallback.companies.map((c) => buildMasterEntityKey(sector, c.companyKey));
  }

  const slug = sectorToSlug(sector);
  return Object.entries(master.companies)
    .filter(([, entity]) => {
      if (entity.sectorSlug !== slug) return false;
      return Object.values(entity.history).some((point) => point.folder_year === folderYear);
    })
    .map(([key]) => key)
    .sort((a, b) => {
      const nameA = master.companies[a]?.companyName ?? a;
      const nameB = master.companies[b]?.companyName ?? b;
      return nameA.localeCompare(nameB, 'ko');
    });
}

export function listMasterSectors(): CompetitorSector[] {
  return [...COMPETITOR_SECTORS];
}
