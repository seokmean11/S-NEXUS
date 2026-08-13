/**
 * 경쟁사분석 — Drive 전체 재스캔 · 캐시 초기화 · Re-indexing
 *
 * 사용:
 *   npx tsx scripts/rebuild_competitor_all.ts
 *   npx tsx scripts/rebuild_competitor_all.ts --skip-sync
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { drive_v3 } from 'googleapis';

import {
  COMPETITOR_DRIVE_ROOT_FOLDER,
  getCompetitorCacheDir,
  syncCompetitorDriveCache,
  type CompetitorSector,
} from '../server/competitorDrive';
import {
  drivePathSegments,
  resolveSectorFromFolderName,
  scanAllCompetitorLocations,
} from '../server/competitorFolderRouting';
import { rebuildMasterCompetitorData } from '../server/competitorMasterData';
import { rebuildCompetitorStructuredData } from '../server/competitorStructuredData';
import { getClaudeApiKey } from '../server/projectEnv';
import { isClaudeConfigured } from '../server/claudeServer';
import {
  createDriveClient,
  findSubfolderId,
  getNexusDriveConfig,
  isNexusDriveUploadConfigured,
} from '../server/nexusGoogleDrive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PARSED_CACHE = '.parsed-analysis.json';
const STRUCTURED_CACHE = 'competitor-data.json';
const SYNC_META = '.sync-meta.json';

interface FolderRef {
  id: string;
  name: string;
}

async function listChildFolders(drive: drive_v3.Drive, parentId: string): Promise<FolderRef[]> {
  const folders: FolderRef[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id,name)',
      pageSize: 200,
      pageToken,
    });
    for (const file of response.data.files ?? []) {
      if (file.id && file.name) folders.push({ id: file.id, name: file.name });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return folders;
}

function isYearFolder(name: string): boolean {
  return /^\d{4}$/u.test(name);
}

/** year-first(표준) + sector-first(레거시) Drive 트리 재귀 탐색 */
async function discoverLocationsFromDrive(): Promise<
  Array<{ folderYear: number; sector: CompetitorSector; layout: 'year-first' | 'sector-first' }>
> {
  const config = getNexusDriveConfig(PROJECT_ROOT);
  if (!config.enabled || !config.folderId || !config.keyPath) return [];

  const drive = await createDriveClient(config.keyPath);
  const competitorRootId = await findSubfolderId(drive, config.folderId, COMPETITOR_DRIVE_ROOT_FOLDER);
  if (!competitorRootId) return [];

  const found = new Map<
    string,
    { folderYear: number; sector: CompetitorSector; layout: 'year-first' | 'sector-first' }
  >();

  function addLocation(
    folderYear: number,
    sector: CompetitorSector,
    layout: 'year-first' | 'sector-first',
  ): void {
    const key = `${folderYear}/${sector}`;
    const existing = found.get(key);
    if (!existing || (existing.layout === 'sector-first' && layout === 'year-first')) {
      found.set(key, { folderYear, sector, layout });
    }
  }

  const level1 = await listChildFolders(drive, competitorRootId);

  for (const node of level1) {
    if (isYearFolder(node.name)) {
      const folderYear = Number(node.name);
      const sectorFolders = await listChildFolders(drive, node.id);
      for (const sectorFolder of sectorFolders) {
        const resolved = resolveSectorFromFolderName(sectorFolder.name);
        if (!resolved) continue;
        addLocation(folderYear, resolved, 'year-first');
      }
      continue;
    }

    const sector = resolveSectorFromFolderName(node.name);
    if (!sector) continue;
    const yearFolders = await listChildFolders(drive, node.id);
    for (const yearFolder of yearFolders) {
      if (!isYearFolder(yearFolder.name)) continue;
      addLocation(Number(yearFolder.name), sector, 'sector-first');
    }
  }

  return [...found.values()].sort(
    (a, b) => a.folderYear - b.folderYear || a.sector.localeCompare(b.sector, 'ko'),
  );
}

function clearParseCaches(cacheDir: string): void {
  for (const name of [PARSED_CACHE, STRUCTURED_CACHE, SYNC_META]) {
    const target = path.join(cacheDir, name);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

function countPdfs(cacheDir: string): number {
  if (!fs.existsSync(cacheDir)) return 0;
  return fs.readdirSync(cacheDir).filter((n) => n.toLowerCase().endsWith('.pdf')).length;
}

function wipeMasterCache(config: ReturnType<typeof getNexusDriveConfig>): void {
  const masterPath = path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER, 'master-competitor-data.json');
  if (fs.existsSync(masterPath)) fs.unlinkSync(masterPath);
}

function purgeStaleLocalCaches(
  config: ReturnType<typeof getNexusDriveConfig>,
  activeKeys: Set<string>,
): void {
  for (const loc of scanAllCompetitorLocations(config)) {
    if (activeKeys.has(loc.signatureKey)) continue;
    for (const name of [PARSED_CACHE, STRUCTURED_CACHE, SYNC_META]) {
      const target = path.join(loc.cacheDir, name);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    console.log(`[reindex] Drive 미포함 로컬 폴더 제외: ${loc.signatureKey}`);
  }
}

async function main(): Promise<void> {
  const skipSync = process.argv.includes('--skip-sync');
  const config = getNexusDriveConfig(PROJECT_ROOT);

  console.log('[reindex] project:', PROJECT_ROOT);
  console.log('[reindex] pipeline: unit-normalize-v8 · master v7 · structured v8 · validation v1');
  console.log('[reindex] drive configured:', config.enabled);
  console.log('[reindex] claude configured:', isClaudeConfigured(PROJECT_ROOT));

  wipeMasterCache(config);

  let locations: Array<{ folderYear: number; sector: CompetitorSector; layout?: 'year-first' | 'sector-first' }> = [];

  if (!skipSync && config.enabled) {
    try {
      locations = await discoverLocationsFromDrive();
      console.log(`[reindex] Drive 폴더 ${locations.length}개 발견 (nexus/경쟁사분석/{연도}/{사업분야})`);
    } catch (error) {
      console.error('[reindex] Drive 탐색 실패:', error);
      process.exit(1);
    }

    if (locations.length === 0) {
      console.error('[reindex] Drive에 경쟁사분석 하위 폴더가 없습니다.');
      process.exit(1);
    }
  } else {
    locations = scanAllCompetitorLocations(config);
    if (locations.length === 0) {
      console.error('[reindex] 처리할 로컬 폴더가 없습니다. (--skip-sync 없이 Drive 동기화를 실행하세요)');
      process.exit(1);
    }
    console.log(`[reindex] 로컬 캐시 폴더 ${locations.length}개 (--skip-sync)`);
  }

  console.log(`[reindex] 대상 ${locations.length}개:`);
  for (const loc of locations) {
    const drivePath = drivePathSegments(loc.folderYear, loc.sector, loc.layout ?? 'year-first').join('/');
    console.log(`  - ${loc.folderYear}/${loc.sector} → ${drivePath}`);
  }

  const activeKeys = new Set(locations.map((loc) => `${loc.folderYear}/${loc.sector}`));
  if (!skipSync && config.enabled) {
    purgeStaleLocalCaches(config, activeKeys);
  }

  let totalPdfs = 0;
  let totalExtracted = 0;
  const summaryRows: Array<{ year: number; sector: string; pdfs: number; extracted: number }> = [];

  for (const { folderYear, sector } of locations) {
    const label = `${folderYear}/${sector}`;
    const cacheDir = getCompetitorCacheDir(config, folderYear, sector);

    try {
      if (!skipSync && config.enabled) {
        console.log(`\n[reindex] ${label} — Drive 동기화…`);
        await syncCompetitorDriveCache(PROJECT_ROOT, folderYear, sector, { force: true });
      }

      clearParseCaches(cacheDir);
      const pdfCount = countPdfs(cacheDir);
      if (pdfCount === 0) {
        console.warn(`[reindex] ${label} — PDF 없음, 건너뜀`);
        summaryRows.push({ year: folderYear, sector, pdfs: 0, extracted: 0 });
        continue;
      }

      console.log(`[reindex] ${label} — PDF ${pdfCount}개 재파싱…`);
      const structured = await rebuildCompetitorStructuredData(
        PROJECT_ROOT,
        folderYear,
        sector,
        cacheDir,
        {
          uploadToDrive: isNexusDriveUploadConfigured(PROJECT_ROOT),
          skipMasterUpsert: true,
          forceReparse: true,
          runValidation: true,
          claudeApiKey: getClaudeApiKey(PROJECT_ROOT) ?? undefined,
        },
      );

      const extracted = structured?.companies.length ?? 0;
      totalPdfs += pdfCount;
      totalExtracted += extracted;
      summaryRows.push({ year: folderYear, sector, pdfs: pdfCount, extracted });
      console.log(`[reindex] ${label} — 추출 ${extracted}건 (PDF ${pdfCount}개)`);
    } catch (error) {
      console.error(`[reindex] ${label} 실패:`, error instanceof Error ? error.message : error);
      if (!skipSync && config.enabled) {
        console.error('[reindex] Drive 동기화/파싱 실패 — 로컬 fallback 없이 중단합니다.');
        process.exit(1);
      }
    }
  }

  console.log('\n[reindex] master-competitor-data.json 재생성…');
  const master = await rebuildMasterCompetitorData(PROJECT_ROOT, {
    force: true,
    locationKeys: [...activeKeys],
  });

  console.log('\n========== Re-indexing 완료 ==========');
  console.log(`PDF ${totalPdfs}개 · structured ${totalExtracted}건 · flat records ${master.records.length}건`);
  console.log('\n--- 연도 · 사업분야별 추출 현황 ---');
  for (const row of summaryRows.sort((a, b) => a.year - b.year || a.sector.localeCompare(b.sector, 'ko'))) {
    console.log(`  ${row.year} / ${row.sector}: PDF ${row.pdfs}개 → 추출 ${row.extracted}건`);
  }
  console.log(`\nmaster: ${path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER, 'master-competitor-data.json')}`);
}

main().catch((error) => {
  console.error('[reindex] fatal:', error);
  process.exit(1);
});
