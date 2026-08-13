import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { drive_v3 } from 'googleapis';
import type {
  CompetitorAnalysisSummary,
  CompetitorDocumentType,
  CompetitorMetric,
  CompetitorNormalizedFinancials,
  CompetitorParsedDocument,
  CompetitorSector,
} from '../src/types/competitorAnalysis';
import { applyCompetitorCompanyAlias } from '../src/utils/competitorCompanyAliases';
import { buildCompetitorAnalysisFromCache } from './competitorDocumentParser';
import {
  buildFileScopedDedupKey,
  normalizeCompanyKey,
  resolveDocumentIdentity,
} from './competitorDocumentIdentity';
import { toSourceTypeLabel, type SourceTypeLabel } from './competitorDocumentDedup';
import {
  extractCompetitorMetadata,
  type CompetitorDocumentMetadata,
} from './competitorMetadataExtract';
import {
  metricsAppearNormalizedToWon,
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';
import {
  createOAuthDriveClient,
  getNexusDriveConfig,
  isNexusDriveUploadConfigured,
} from './nexusGoogleDrive';
export const COMPETITOR_STRUCTURED_DATA_FILE = 'competitor-data.json';
export const COMPETITOR_STRUCTURED_DATA_VERSION = 8;

export interface CompetitorStructuredCompany {
  companyKey: string;
  companyName: string;
  fiscalYear?: number;
  documentType: CompetitorDocumentType;
  sourceFiles: string[];
  source_type?: SourceTypeLabel;
  source_file?: string;
  auditFirm?: string;
  metrics: CompetitorMetric[];
  metadata?: CompetitorDocumentMetadata;
  financials: CompetitorNormalizedFinancials;
  warnings: string[];
  parsedAt: string;
}

export interface CompetitorStructuredData {
  version: typeof COMPETITOR_STRUCTURED_DATA_VERSION;
  year: number;
  sector: CompetitorSector;
  updatedAt: string;
  sourceSignature: string;
  sourceFileCount: number;
  companies: CompetitorStructuredCompany[];
  documents: CompetitorParsedDocument[];
}

function inferCompanyKeyFromFileName(fileName: string): string | undefined {
  const bracketMatch = fileName.match(/\[([^\]]+)\]/u);
  if (bracketMatch?.[1]) {
    return normalizeCompanyKey(
      bracketMatch[1].replace(/감사보고서.*$/u, '').replace(/사업보고서.*$/u, '').trim(),
    );
  }

  const stockMatch = fileName.match(/\(?(?:주|유|㈜)\)?([^().]+?)(?:\(|\[|\.|$)/u);
  if (stockMatch?.[1]) {
    return normalizeCompanyKey(stockMatch[1].trim());
  }

  return normalizeCompanyKey(fileName.replace(/\.[^.]+$/, ''));
}

function resolveDocumentCompanyKey(doc: CompetitorParsedDocument): string {
  return (
    inferCompanyKeyFromFileName(doc.fileName) ??
    (doc.companyName ? normalizeCompanyKey(doc.companyName) : normalizeCompanyKey(doc.fileName))
  );
}

export function buildCompetitorSourceSignature(cacheDir: string): string {
  if (!fs.existsSync(cacheDir)) return '';

  return fs
    .readdirSync(cacheDir)
    .filter((name) => !name.startsWith('.') && !name.endsWith('.json'))
    .filter((name) => fs.statSync(path.join(cacheDir, name)).isFile())
    .map((name) => {
      const stat = fs.statSync(path.join(cacheDir, name));
      return `${name}:${stat.size}:${stat.mtimeMs}`;
    })
    .sort()
    .join('|');
}

export function buildStructuredDataFromAnalysis(
  analysis: {
    year: number;
    sector: CompetitorSector;
    documents: CompetitorParsedDocument[];
    companies: Array<{
      companyName: string;
      fileCount: number;
      documentTypes: CompetitorDocumentType[];
      metrics: CompetitorMetric[];
    }>;
  },
  sourceSignature: string,
): CompetitorStructuredData {
  const companyMap = new Map<string, CompetitorStructuredCompany>();

  for (const doc of analysis.documents) {
    const unitText = doc.unitContextText ?? doc.rawTextPreview ?? '';
    const identity = resolveDocumentIdentity(
      unitText,
      doc.fileName,
      analysis.year,
      doc.companyName,
    );
    doc.companyName = resolvedCompanyName;
    doc.fiscalYear = identity.fiscalYear;

    const aliased = applyCompetitorCompanyAlias(identity.companyKey, analysis.sector);
    const resolvedCompanyKey = aliased.key;
    const resolvedCompanyName = aliased.displayName;
    const fiscalYear = identity.fiscalYear;
    const dedupKey = buildFileScopedDedupKey(doc.fileName, fiscalYear);
    const sourceType = toSourceTypeLabel(doc.documentType, doc.fileName);

    const candidate: CompetitorStructuredCompany = {
      companyKey: resolvedCompanyKey,
      companyName: resolvedCompanyName,
      fiscalYear,
      documentType: doc.documentType,
      sourceFiles: [doc.fileName],
      source_type: sourceType,
      source_file: doc.fileName,
      auditFirm: doc.auditFirm,
      metrics: doc.metrics,
      metadata:
        doc.metadata ??
        extractCompetitorMetadata({
          text: unitText,
          fileName: doc.fileName,
          companyName: resolvedCompanyName,
          documentType: doc.documentType,
          metrics: doc.metrics,
        }),
      financials: normalizeFinancialMetrics(doc.metrics, {
        documentText: doc.unitContextText ?? doc.rawTextPreview,
        metricsInWon: metricsAppearNormalizedToWon(doc.metrics),
      }),
      warnings: doc.warnings,
      parsedAt: doc.parsedAt,
    };

    const existing = companyMap.get(dedupKey);
    if (!existing) {
      companyMap.set(dedupKey, candidate);
    } else if (!existing.sourceFiles.includes(doc.fileName)) {
      existing.sourceFiles.push(doc.fileName);
    }
  }

  const pdfFiles = analysis.documents.map((d) => d.fileName).sort();
  const extractedFiles = [...companyMap.values()].map((c) => c.source_file ?? c.sourceFiles[0]).sort();
  const missing = pdfFiles.filter((f) => !extractedFiles.includes(f));
  if (missing.length > 0) {
    console.warn('[competitor] PDF 추출 누락:', missing.join(', '));
  }
  console.info(
    `[competitor] structured ${analysis.sector}/${analysis.year}: PDF ${pdfFiles.length}개 → 추출 ${companyMap.size}개` +
      (missing.length ? ` (누락 ${missing.length})` : ''),
  );

  return {
    version: COMPETITOR_STRUCTURED_DATA_VERSION,
    year: analysis.year,
    sector: analysis.sector,
    updatedAt: new Date().toISOString(),
    sourceSignature,
    sourceFileCount: analysis.documents.length,
    companies: [...companyMap.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko')),
    documents: analysis.documents,
  };
}

export function getStructuredDataPath(cacheDir: string): string {
  return path.join(cacheDir, COMPETITOR_STRUCTURED_DATA_FILE);
}

export function loadStructuredDataFromCache(cacheDir: string): CompetitorStructuredData | null {
  const targetPath = getStructuredDataPath(cacheDir);
  if (!fs.existsSync(targetPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as CompetitorStructuredData;
    if (parsed.version !== COMPETITOR_STRUCTURED_DATA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStructuredDataToCache(cacheDir: string, data: CompetitorStructuredData): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(getStructuredDataPath(cacheDir), JSON.stringify(data, null, 2), 'utf8');
}

export function structuredDataToAnalysisSummary(
  data: CompetitorStructuredData,
  options: {
    configured: boolean;
    driveConnected: boolean;
    uploadConfigured: boolean;
    folderPath: string;
    syncedAt?: string;
    dataSource?: 'structured-json' | 'pdf-parse';
  },
): CompetitorAnalysisSummary {
  return {
    year: data.year,
    sector: data.sector,
    configured: options.configured,
    driveConnected: options.driveConnected,
    uploadConfigured: options.uploadConfigured,
    folderPath: options.folderPath,
    syncedAt: options.syncedAt,
    dataSource: options.dataSource ?? 'structured-json',
    fileCount: data.sourceFileCount,
    documents: data.documents,
    companies: data.companies.map((company) => ({
      companyName: company.companyName,
      fileCount: company.sourceFiles.length,
      documentTypes: [company.documentType],
      metrics: company.metrics,
      financials: company.financials,
    })),
  };
}

async function findStructuredDataFileId(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<string | null> {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name='${COMPETITOR_STRUCTURED_DATA_FILE}'`,
    fields: 'files(id,name)',
    pageSize: 1,
  });
  return response.data.files?.[0]?.id ?? null;
}

export async function uploadStructuredDataToDrive(
  projectRoot: string,
  folderId: string,
  cacheDir: string,
): Promise<void> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !isNexusDriveUploadConfigured(projectRoot)) return;

  const targetPath = getStructuredDataPath(cacheDir);
  if (!fs.existsSync(targetPath)) return;

  const drive = await createOAuthDriveClient(projectRoot);
  const buffer = fs.readFileSync(targetPath);
  const existingId = await findStructuredDataFileId(drive, folderId);

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: {
        mimeType: 'application/json',
        body: Readable.from(buffer),
      },
      fields: 'id,name,modifiedTime',
    });
    return;
  }

  await drive.files.create({
    requestBody: {
      name: COMPETITOR_STRUCTURED_DATA_FILE,
      mimeType: 'application/json',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from(buffer),
    },
    fields: 'id,name,modifiedTime',
  });
}

export async function downloadStructuredDataFromDrive(
  drive: drive_v3.Drive,
  folderId: string,
  cacheDir: string,
): Promise<boolean> {
  const fileId = await findStructuredDataFileId(drive, folderId);
  if (!fileId) return false;

  const targetPath = getStructuredDataPath(cacheDir);
  fs.mkdirSync(cacheDir, { recursive: true });
  const dest = fs.createWriteStream(targetPath);
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  await pipeline(response.data as NodeJS.ReadableStream, dest);
  return true;
}

export async function rebuildCompetitorStructuredData(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  cacheDir: string,
  options?: {
    uploadToDrive?: boolean;
    folderId?: string;
    skipMasterUpsert?: boolean;
    forceReparse?: boolean;
    runValidation?: boolean;
    claudeApiKey?: string;
  },
): Promise<CompetitorStructuredData | null> {
  const sourceSignature = buildCompetitorSourceSignature(cacheDir);
  if (!sourceSignature) return null;

  if (!options?.forceReparse) {
    const cached = loadStructuredDataFromCache(cacheDir);
    if (cached?.sourceSignature === sourceSignature) {
      return cached;
    }
  }

  const parsed = await buildCompetitorAnalysisFromCache(cacheDir, year, sector);

  let structured: CompetitorStructuredData;
  if (options?.runValidation !== false) {
    const { runFolderValidationPipeline } = await import('./competitorValidationPipeline');
    const result = await runFolderValidationPipeline(
      projectRoot,
      parsed,
      sourceSignature,
      cacheDir,
      { apiKey: options?.claudeApiKey, enableClaude: true },
    );
    structured = result.structured;
    if (result.claudeReparsed > 0 || result.report.summary.review > 0) {
      console.log(
        `[competitor] validation ${sector}/${year}: Claude ${result.claudeReparsed}건 · ok ${result.report.summary.ok} · review ${result.report.summary.review}`,
      );
    }
  } else {
    structured = buildStructuredDataFromAnalysis(parsed, sourceSignature);
    saveStructuredDataToCache(cacheDir, structured);
  }

  if (options?.uploadToDrive !== false && options?.folderId) {
    await uploadStructuredDataToDrive(projectRoot, options.folderId, cacheDir);
  }

  if (!options?.skipMasterUpsert) {
    try {
      const { upsertMasterFromFolder } = await import('./competitorMasterData');
      await upsertMasterFromFolder(projectRoot, structured);
    } catch (error) {
      console.warn('[competitor] master data upsert failed:', error);
    }
  }

  return structured;
}

export async function loadCompetitorAnalysisData(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  cacheDir: string,
  options?: { rebuild?: boolean; uploadToDrive?: boolean; folderId?: string },
): Promise<CompetitorStructuredData | null> {
  const sourceSignature = buildCompetitorSourceSignature(cacheDir);
  if (!sourceSignature) return null;

  if (!options?.rebuild) {
    const cached = loadStructuredDataFromCache(cacheDir);
    if (cached?.sourceSignature === sourceSignature) {
      return cached;
    }
  }

  return rebuildCompetitorStructuredData(projectRoot, year, sector, cacheDir, {
    uploadToDrive: options?.uploadToDrive,
    folderId: options?.folderId,
    forceReparse: options?.rebuild,
    runValidation: false,
  });
}
