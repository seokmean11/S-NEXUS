import fs from 'node:fs';
import path from 'node:path';

import type { CompetitorNormalizedFinancials, CompetitorParsedDocument, CompetitorSector } from '../src/types/competitorAnalysis';
import { getCompetitorCacheDir } from './competitorDrive';
import { saveParsedAnalysisCache } from './competitorDocumentParser';
import {
  claudeReparseDocument,
} from './competitorClaudeValidation';
import {
  buildValidationReport,
  validateStructuredCompany,
  VALIDATION_REPORT_FILE,
  type CompetitorFolderValidationReport,
  type CompetitorRecordValidation,
} from './competitorParseValidation';
import {
  buildStructuredDataFromAnalysis,
  loadStructuredDataFromCache,
  saveStructuredDataToCache,
  type CompetitorStructuredCompany,
  type CompetitorStructuredData,
} from './competitorStructuredData';
import { isClaudeConfigured } from './claudeServer';
import { getNexusDriveConfig } from './nexusGoogleDrive';
import { normalizeCompanyKey } from './competitorDocumentIdentity';
import {
  normalizeFinancialMetrics,
} from './competitorFinancialNormalize';

function loadPriorYearFinancials(
  projectRoot: string,
  sector: CompetitorSector,
  folderYear: number,
  companyKey: string,
): CompetitorNormalizedFinancials | undefined {
  const config = getNexusDriveConfig(projectRoot);
  const priorDir = getCompetitorCacheDir(config, folderYear - 1, sector);
  const structured = loadStructuredDataFromCache(priorDir);
  const match = structured?.companies.find((c) => c.companyKey === companyKey);
  return match?.financials;
}

function documentToTempCompany(doc: CompetitorParsedDocument): CompetitorStructuredCompany {
  const metrics = doc.metrics ?? [];
  const financials = normalizeFinancialMetrics(metrics, { metricsInWon: true });
  const companyKey =
    normalizeCompanyKey(doc.companyName ?? doc.fileName.replace(/\.[^.]+$/, ''));

  return {
    companyKey,
    companyName: doc.companyName ?? companyKey,
    fiscalYear: doc.fiscalYear,
    documentType: doc.documentType,
    sourceFiles: [doc.fileName],
    source_file: doc.fileName,
    metrics,
    metadata: doc.metadata,
    financials,
    warnings: doc.warnings,
    parsedAt: doc.parsedAt,
  };
}

export function loadValidationReport(cacheDir: string): CompetitorFolderValidationReport | null {
  const target = path.join(cacheDir, VALIDATION_REPORT_FILE);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8')) as CompetitorFolderValidationReport;
  } catch {
    return null;
  }
}

export function saveValidationReport(
  cacheDir: string,
  report: CompetitorFolderValidationReport,
): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, VALIDATION_REPORT_FILE), JSON.stringify(report, null, 2), 'utf8');
}

export async function validateAndRepairDocuments(
  projectRoot: string,
  documents: CompetitorParsedDocument[],
  folderYear: number,
  sector: CompetitorSector,
  options?: { apiKey?: string; enableClaude?: boolean; cacheDir?: string },
): Promise<{
  documents: CompetitorParsedDocument[];
  claudeReparsed: number;
  claudeTouchedFiles: string[];
}> {
  const enableClaude =
    options?.enableClaude !== false && (isClaudeConfigured(projectRoot) || Boolean(options?.apiKey));
  let claudeReparsed = 0;
  const claudeTouchedFiles: string[] = [];
  const patched = [...documents];

  // 경쟁사 분석: 원문·사명·재무 모두 Claude가 원본 파일에서 추출
  if (!enableClaude) {
    console.warn(
      '[competitor] Claude API 미설정 — 원문·사명·재무 추출을 건너뜁니다. .env의 Claude 키를 확인하세요.',
    );
    return { documents: patched, claudeReparsed: 0, claudeTouchedFiles: [] };
  }

  for (let i = 0; i < patched.length; i += 1) {
    const doc = patched[i];
    const filePath = options?.cacheDir ? path.join(options.cacheDir, doc.fileName) : undefined;
    if (filePath && !fs.existsSync(filePath)) {
      console.warn(`[competitor] 원본 파일 없음: ${doc.fileName}`);
      continue;
    }

    const tempCompany = documentToTempCompany(doc);
    const prior = loadPriorYearFinancials(projectRoot, sector, folderYear, tempCompany.companyKey);
    const validation = validateStructuredCompany(tempCompany, folderYear, prior);

    try {
      const repaired = await claudeReparseDocument(projectRoot, doc, folderYear, {
        apiKey: options?.apiKey,
        localIssues: validation.issues,
        filePath,
      });

      if (repaired?.patched) {
        patched[i] = repaired.patched;
        claudeReparsed += 1;
        claudeTouchedFiles.push(doc.fileName);
        console.info(`[competitor] Claude 원문추출: ${doc.fileName} → ${repaired.patched.companyName}`);
      } else {
        console.warn(`[competitor] Claude 추출 결과 없음: ${doc.fileName}`);
      }
    } catch (error) {
      console.warn(
        `[validation] Claude 추출 실패 (${doc.fileName}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { documents: patched, claudeReparsed, claudeTouchedFiles };
}

export async function buildValidationReportForStructured(
  projectRoot: string,
  structured: CompetitorStructuredData,
  claudeReparsedKeys: Set<string>,
): Promise<CompetitorFolderValidationReport> {
  const records: CompetitorRecordValidation[] = [];

  for (const company of structured.companies) {
    const prior = loadPriorYearFinancials(
      projectRoot,
      structured.sector,
      structured.year,
      company.companyKey,
    );
    const validation = validateStructuredCompany(company, structured.year, prior);
    if (claudeReparsedKeys.has(company.companyKey)) {
      validation.parseMethod = 'claude';
      validation.trust = 'ok';
      validation.issues = validation.issues.filter((i) => i.severity !== 'risk');
    }
    records.push(validation);
  }

  return buildValidationReport(structured.year, structured.sector, records);
}

export async function runFolderValidationPipeline(
  projectRoot: string,
  analysis: {
    year: number;
    sector: CompetitorSector;
    documents: CompetitorParsedDocument[];
    companies: Array<{
      companyName: string;
      fileCount: number;
      documentTypes: string[];
      metrics: CompetitorParsedDocument['metrics'];
    }>;
  },
  sourceSignature: string,
  cacheDir: string,
  options?: { apiKey?: string; enableClaude?: boolean },
): Promise<{
  structured: CompetitorStructuredData;
  report: CompetitorFolderValidationReport;
  claudeReparsed: number;
}> {
  const { documents: repairedDocs, claudeReparsed, claudeTouchedFiles } =
    await validateAndRepairDocuments(
      projectRoot,
      analysis.documents,
      analysis.year,
      analysis.sector,
      { ...options, cacheDir },
    );

  const repairedAnalysis = { ...analysis, documents: repairedDocs };
  const touched = new Set(claudeTouchedFiles);

  if (claudeReparsed > 0) {
    const companyMap = new Map<
      string,
      {
        companyName: string;
        fileCount: number;
        documentTypes: Set<string>;
        metrics: CompetitorParsedDocument['metrics'];
      }
    >();
    for (const doc of repairedDocs) {
      const companyName = doc.companyName ?? doc.fileName;
      const current = companyMap.get(companyName) ?? {
        companyName,
        fileCount: 0,
        documentTypes: new Set<string>(),
        metrics: [] as CompetitorParsedDocument['metrics'],
      };
      current.fileCount += 1;
      current.documentTypes.add(doc.documentType);
      current.metrics = [...current.metrics, ...(doc.metrics ?? [])];
      companyMap.set(companyName, current);
    }
    repairedAnalysis.companies = [...companyMap.values()].map((c) => ({
      companyName: c.companyName,
      fileCount: c.fileCount,
      documentTypes: [...c.documentTypes],
      metrics: c.metrics,
    }));
    saveParsedAnalysisCache(cacheDir, sourceSignature, repairedAnalysis);
  }

  const structured = buildStructuredDataFromAnalysis(repairedAnalysis, sourceSignature);

  const reparsedKeys = new Set<string>();
  for (const doc of repairedDocs) {
    if (!touched.has(doc.fileName)) continue;
    reparsedKeys.add(normalizeCompanyKey(doc.companyName ?? doc.fileName));
  }

  const report = await buildValidationReportForStructured(projectRoot, structured, reparsedKeys);
  report.summary.claudeReparsed = claudeReparsed;

  saveStructuredDataToCache(cacheDir, structured);
  saveValidationReport(cacheDir, report);

  return { structured, report, claudeReparsed };
}
