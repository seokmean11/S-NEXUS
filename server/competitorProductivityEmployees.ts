import fs from 'node:fs';
import path from 'node:path';

import type { CompetitorSector } from '../src/types/competitorAnalysis';
import type { ProductivityEmployeeEntry } from '../src/types/competitorStandard';
import { resolveCanonicalCompanyKey, resolveCanonicalCompanyName } from '../src/utils/competitorCompanyAliases';
import { inferCompetitorCompanyNameFromFileName } from '../src/utils/competitorCompanyName';
import { getCompetitorCacheDir, listCachedCompetitorFiles } from './competitorDrive';
import type { CompetitorSector as DriveSector } from './competitorDrive';
import { cleanCompanyLabel, normalizeCompanyKey } from './competitorDocumentIdentity';
import { inferBizNoFromText } from './competitorStandardSchema';
import { normalizeSummaryBizNo } from './competitorSummaryDedup';
import {
  extractCreditReportEmployees,
  isProductivityEmployeeSourceText,
} from './competitorProductivityEmployeesExtract';
import { readCreditReportPdfTextsParallel } from './competitorCreditReportPdfText';
import { getNexusDriveConfig } from './nexusGoogleDrive';

export const PRODUCTIVITY_EMPLOYEES_FILE = 'productivity-employees.json';
/** v3: 종업원현황 표 형식(합계 열 가변) + 연도 오인 방지 */
export const PRODUCTIVITY_EMPLOYEES_VERSION = 3;

export interface ProductivityEmployeesOverlay {
  version: number;
  year: number;
  sector: CompetitorSector;
  referenceYear: number;
  updatedAt: string;
  sourceSignature: string;
  entries: ProductivityEmployeeEntry[];
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

export async function buildProductivityEmployeesOverlay(
  cacheDir: string,
  folderYear: number,
  sector: CompetitorSector,
): Promise<ProductivityEmployeesOverlay | null> {
  const pdfNames = listFolderPdfNames(cacheDir);
  if (pdfNames.length === 0) return null;

  const sourceSignature = buildFolderPdfSignature(cacheDir, pdfNames);
  const entries: ProductivityEmployeeEntry[] = [];
  let referenceYear = folderYear;

  const textsByPath = await readCreditReportPdfTextsParallel(
    pdfNames.map((fileName) => path.join(cacheDir, fileName)),
  );

  for (const fileName of pdfNames) {
    const filePath = path.join(cacheDir, fileName);
    const text = textsByPath.get(filePath) ?? '';
    if (!isProductivityEmployeeSourceText(text)) continue;

    const extracted = extractCreditReportEmployees(text, folderYear);
    if (extracted.employees == null) continue;

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
      employees: extracted.employees,
      employees_prior: extracted.employees_prior,
      referenceYear: extracted.referenceYear ?? folderYear,
      source_file: fileName,
      source_type: 'credit-report',
    });
  }

  if (entries.length === 0) return null;

  const deduped = new Map<string, ProductivityEmployeeEntry>();
  for (const entry of entries) {
    const existing = deduped.get(entry.companyKey);
    if (!existing || entry.employees > 0) {
      deduped.set(entry.companyKey, entry);
    }
  }

  return {
    version: PRODUCTIVITY_EMPLOYEES_VERSION,
    year: folderYear,
    sector,
    referenceYear,
    updatedAt: new Date().toISOString(),
    sourceSignature,
    entries: [...deduped.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko')),
  };
}

export function loadProductivityEmployeesOverlay(cacheDir: string): ProductivityEmployeesOverlay | null {
  const filePath = path.join(cacheDir, PRODUCTIVITY_EMPLOYEES_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductivityEmployeesOverlay;
    if (parsed.version !== PRODUCTIVITY_EMPLOYEES_VERSION || !Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveProductivityEmployeesOverlay(cacheDir: string, overlay: ProductivityEmployeesOverlay): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, PRODUCTIVITY_EMPLOYEES_FILE),
    `${JSON.stringify(overlay, null, 2)}\n`,
    'utf8',
  );
}

export async function loadOrBuildProductivityEmployeesOverlay(
  projectRoot: string,
  folderYear: number,
  sector: DriveSector,
  options?: { force?: boolean; cacheOnly?: boolean },
): Promise<ProductivityEmployeesOverlay | null> {
  const config = getNexusDriveConfig(projectRoot);
  const cacheDir = getCompetitorCacheDir(config, folderYear, sector);
  const pdfNames = listCachedCompetitorFiles(projectRoot, folderYear, sector).filter(isPdfFile);

  if (pdfNames.length === 0) return null;

  const nextSignature = buildFolderPdfSignature(cacheDir, pdfNames.sort());
  const cached = loadProductivityEmployeesOverlay(cacheDir);

  if (!options?.force && cached && cached.sourceSignature === nextSignature) {
    return cached;
  }

  if (options?.cacheOnly) {
    return null;
  }

  const built = await buildProductivityEmployeesOverlay(cacheDir, folderYear, sector);
  if (!built) return cached;

  if (built.sourceSignature !== nextSignature) {
    built.sourceSignature = nextSignature;
  }

  saveProductivityEmployeesOverlay(cacheDir, built);
  return built;
}

export function overlayEntriesToMap(
  overlay: ProductivityEmployeesOverlay | null,
): Record<string, ProductivityEmployeeEntry> {
  if (!overlay) return {};
  return Object.fromEntries(overlay.entries.map((entry) => [entry.companyKey, entry]));
}

export async function buildProductivityEmployeesByYear(
  projectRoot: string,
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  options?: { force?: boolean; cacheOnly?: boolean },
): Promise<Record<string, Record<string, ProductivityEmployeeEntry>>> {
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index);
  const entries = await Promise.all(
    years.map(async (year) => {
      const overlay = await loadOrBuildProductivityEmployeesOverlay(projectRoot, year, sector, options);
      if (!overlay || overlay.entries.length === 0) return null;
      return [String(year), overlayEntriesToMap(overlay)] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, Record<string, ProductivityEmployeeEntry>] => entry != null));
}
