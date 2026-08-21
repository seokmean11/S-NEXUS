import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { drive_v3 } from 'googleapis';

export const COMPETITOR_SECTORS = ['전시사업', '인테리어'] as const;
export type CompetitorSector = (typeof COMPETITOR_SECTORS)[number];
export const COMPETITOR_DRIVE_ROOT_FOLDER = '경쟁사분석';

export interface CompetitorDriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export interface CompetitorDriveSyncMeta {
  syncedAt: string;
  folderId: string;
  year: number;
  sector: CompetitorSector;
  fileCount: number;
  files: Array<{ name: string; modifiedTime: string }>;
}

import {
  createDriveClient,
  createOAuthDriveClient,
  ensureSubfolderId,
  findSubfolderId,
  formatDriveUploadError,
  getNexusDriveConfig,
  isNexusDriveUploadConfigured,
  type NexusDriveConfig,
} from './nexusGoogleDrive';
import { probeGoogleOAuthUploadAccess } from './googleDriveOAuth';
import {
  COMPETITOR_STRUCTURED_DATA_FILE,
  rebuildCompetitorStructuredData,
  tryHydrateStructuredCacheFromDrive,
  buildCompetitorSourceSignature,
  competitorSourceSignaturesMatch,
  isStructuredDataTrustworthy,
  loadStructuredDataFromCache,
} from './competitorStructuredData';
import {
  drivePathSegments,
  getCanonicalDrivePath,
  getSectorFirstDrivePath,
  getYearFirstDrivePath,
  resolveCompetitorCacheDir,
  resolveSectorFromFolderName,
} from './competitorFolderRouting';

export { formatDriveUploadError };
export { resolveSectorFromFolderName, scanAllCompetitorLocations } from './competitorFolderRouting';

const SYNC_META_FILE = '.sync-meta.json';
const SYNC_MIN_INTERVAL_MS = 55_000;
const DRIVE_DOWNLOAD_CONCURRENCY = 6;
const competitorUploadFolderCache = new Map<string, string>();
const competitorUploadFolderPending = new Map<string, Promise<string>>();

const COMPETITOR_FILE_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls'] as const;

function isCompetitorDataFile(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPETITOR_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isCompetitorSector(value: string): value is CompetitorSector {
  return resolveSectorFromFolderName(value) != null;
}

export function getCompetitorFolderPath(year: number, sector: CompetitorSector): string {
  return getCanonicalDrivePath(year, sector);
}

export function getCompetitorCacheDir(
  config: NexusDriveConfig,
  year: number,
  sector: CompetitorSector,
): string {
  return resolveCompetitorCacheDir(config, year, sector).cacheDir;
}

function loadSyncMeta(cacheDir: string): CompetitorDriveSyncMeta | null {
  const metaPath = path.join(cacheDir, SYNC_META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CompetitorDriveSyncMeta;
  } catch {
    return null;
  }
}

function saveSyncMeta(cacheDir: string, meta: CompetitorDriveSyncMeta): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, SYNC_META_FILE), JSON.stringify(meta, null, 2), 'utf8');
}

async function resolveCompetitorFolderIdWithDrive(
  drive: drive_v3.Drive,
  config: NexusDriveConfig,
  year: number,
  sector: CompetitorSector,
  options?: { createMissing?: boolean },
): Promise<string> {
  if (!config.folderId) {
    throw new Error('Google Drive NEXUS 루트 폴더가 설정되지 않았습니다.');
  }

  const layouts: Array<'sector-first' | 'year-first'> = ['year-first', 'sector-first'];

  for (const layout of layouts) {
    const segments = drivePathSegments(year, sector, layout);
    let parentId = config.folderId;
    let missing = false;

    for (const segment of segments) {
      if (options?.createMissing) {
        parentId = await ensureSubfolderId(drive, parentId, segment);
        continue;
      }
      const found = await findSubfolderId(drive, parentId, segment);
      if (!found) {
        missing = true;
        break;
      }
      parentId = found;
    }

    if (!missing) return parentId;
  }

  throw new Error(
    `Google Drive에 「${getYearFirstDrivePath(year, sector)}」 또는 「${getSectorFirstDrivePath(sector, year)}」 경로 폴더가 없습니다.`,
  );
}

async function resolveCompetitorUploadFolderId(
  drive: drive_v3.Drive,
  config: NexusDriveConfig,
  year: number,
  sector: CompetitorSector,
): Promise<string> {
  const cacheKey = `${year}:${sector}`;
  const cached = competitorUploadFolderCache.get(cacheKey);
  if (cached) return cached;

  const pending = competitorUploadFolderPending.get(cacheKey);
  if (pending) return pending;

  const promise = resolveCompetitorFolderIdWithDrive(drive, config, year, sector, {
    createMissing: true,
  }).then((folderId) => {
    competitorUploadFolderCache.set(cacheKey, folderId);
    return folderId;
  });

  competitorUploadFolderPending.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    competitorUploadFolderPending.delete(cacheKey);
  }
}

function cacheUploadedCompetitorFile(
  config: NexusDriveConfig,
  year: number,
  sector: CompetitorSector,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  fileInfo: CompetitorDriveFileInfo,
): void {
  const cacheDir = getCompetitorCacheDir(config, year, sector);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, fileName), buffer);

  const parsedCachePath = path.join(cacheDir, '.parsed-analysis.json');
  if (fs.existsSync(parsedCachePath)) {
    fs.unlinkSync(parsedCachePath);
  }

  const structuredCachePath = path.join(cacheDir, COMPETITOR_STRUCTURED_DATA_FILE);
  if (fs.existsSync(structuredCachePath)) {
    fs.unlinkSync(structuredCachePath);
  }

  const previous = loadSyncMeta(cacheDir);
  const files = [
    ...(previous?.files ?? []).filter((file) => file.name !== fileName),
    { name: fileName, modifiedTime: fileInfo.modifiedTime },
  ];

  saveSyncMeta(cacheDir, {
    syncedAt: new Date().toISOString(),
    folderId,
    year,
    sector,
    fileCount: files.length,
    files,
  });
}

async function downloadDriveFile(
  drive: drive_v3.Drive,
  file: CompetitorDriveFileInfo,
  targetPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const dest = fs.createWriteStream(targetPath);
  const response = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'stream' },
  );
  await pipeline(response.data as NodeJS.ReadableStream, dest);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(runners);
}

function localFileMatchesDrive(
  targetPath: string,
  file: CompetitorDriveFileInfo,
  previousMeta: CompetitorDriveSyncMeta | null,
): boolean {
  if (!fs.existsSync(targetPath)) return false;

  const previousFile = previousMeta?.files.find((entry) => entry.name === file.name);
  if (!previousFile || previousFile.modifiedTime !== file.modifiedTime) {
    return false;
  }

  const stat = fs.statSync(targetPath);
  const driveSize = file.size != null ? Number(file.size) : null;
  if (driveSize != null && Number.isFinite(driveSize) && stat.size !== driveSize) {
    return false;
  }

  return true;
}

function isStructuredCacheReady(cacheDir: string): boolean {
  const sourceSignature = buildCompetitorSourceSignature(cacheDir);
  if (!sourceSignature) return false;
  const cached = loadStructuredDataFromCache(cacheDir);
  if (!cached) return false;
  return (
    competitorSourceSignaturesMatch(sourceSignature, cached.sourceSignature) &&
    isStructuredDataTrustworthy(cached)
  );
}

async function tryHydrateStructuredFromDriveForYear(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  cacheDir: string,
): Promise<boolean> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) return false;

  try {
    const drive = await createDriveClient(config.keyPath);
    const folderId =
      getCompetitorSyncMeta(projectRoot, year, sector)?.folderId ??
      (await resolveCompetitorFolderIdWithDrive(drive, config, year, sector));
    return await tryHydrateStructuredCacheFromDrive(drive, folderId, cacheDir);
  } catch (error) {
    console.warn(`[competitor] Drive structured hydrate failed for ${year}/${sector}:`, error);
    return false;
  }
}

async function ensureStructuredCacheForFolder(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  cacheDir: string,
  folderId: string,
  drive: drive_v3.Drive,
): Promise<void> {
  if (isStructuredCacheReady(cacheDir)) return;

  const hydrated = await tryHydrateStructuredCacheFromDrive(drive, folderId, cacheDir);
  if (hydrated) return;
  if (isStructuredCacheReady(cacheDir)) return;

  try {
    await rebuildCompetitorStructuredData(projectRoot, year, sector, cacheDir, {
      uploadToDrive: isNexusDriveUploadConfigured(projectRoot),
      folderId,
      forceReparse: false,
    });
  } catch (error) {
    console.warn('[competitor] structured data sync rebuild failed:', error);
  }
}

/** Drive PDF·structured 캐시가 없을 때만 동기화 (분석 로직·결과는 기존 v1.10 유지) */
export async function ensureCompetitorYearCacheReady(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  options?: { force?: boolean },
): Promise<void> {
  const config = getNexusDriveConfig(projectRoot);
  const cacheDir = getCompetitorCacheDir(config, year, sector);
  const hasPdfCache = listCachedCompetitorFiles(projectRoot, year, sector).length > 0;
  const hasStructured = hasPdfCache && isStructuredCacheReady(cacheDir);

  if (!options?.force && hasPdfCache && hasStructured) return;

  // structured 캐시가 없거나 신뢰할 수 없을 때만 Drive JSON hydrate
  if (hasPdfCache && !hasStructured) {
    await tryHydrateStructuredFromDriveForYear(projectRoot, year, sector, cacheDir);
  }

  const hasStructuredAfterHydrate = hasPdfCache && isStructuredCacheReady(cacheDir);

  if (!options?.force && hasPdfCache && hasStructuredAfterHydrate) return;

  try {
    await syncCompetitorDriveCache(projectRoot, year, sector, {
      force: options?.force === true || !hasPdfCache,
    });
  } catch (error) {
    console.warn(`[competitor] year cache sync failed for ${year}/${sector}:`, error);
  }
}

export async function listCompetitorDriveFiles(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
): Promise<CompetitorDriveFileInfo[]> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) return [];

  const drive = await createDriveClient(config.keyPath);
  const folderId = await resolveCompetitorFolderIdWithDrive(drive, config, year, sector);
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });

  return (response.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } =>
      Boolean(file.id && file.name && isCompetitorDataFile(file.name)),
    )
    .map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType ?? 'application/octet-stream',
      modifiedTime: file.modifiedTime ?? new Date(0).toISOString(),
      size: file.size ?? undefined,
    }));
}

export async function syncCompetitorDriveCache(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  options?: { force?: boolean },
): Promise<CompetitorDriveSyncMeta> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) {
    throw new Error(
      'Google Drive NEXUS 폴더가 설정되지 않았습니다. GOOGLE_DRIVE_NEXUS_FOLDER_ID와 GOOGLE_SERVICE_ACCOUNT_KEY_PATH를 확인하세요.',
    );
  }

  const cacheDir = getCompetitorCacheDir(config, year, sector);
  const previous = loadSyncMeta(cacheDir);
  const hasLocalDataFiles =
    fs.existsSync(cacheDir) &&
    fs.readdirSync(cacheDir).some((name) => !name.startsWith('.') && isCompetitorDataFile(name));

  if (!options?.force && previous?.syncedAt && hasLocalDataFiles) {
    const elapsed = Date.now() - new Date(previous.syncedAt).getTime();
    if (elapsed < SYNC_MIN_INTERVAL_MS) {
      if (isStructuredCacheReady(cacheDir)) return previous;

      const drive = await createDriveClient(config.keyPath);
      const folderId = await resolveCompetitorFolderIdWithDrive(drive, config, year, sector);
      await ensureStructuredCacheForFolder(projectRoot, year, sector, cacheDir, folderId, drive);
      return previous;
    }
  }

  const drive = await createDriveClient(config.keyPath);
  const folderId = await resolveCompetitorFolderIdWithDrive(drive, config, year, sector);
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });

  const files = (response.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } =>
      Boolean(file.id && file.name && isCompetitorDataFile(file.name)),
    )
    .map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType ?? 'application/octet-stream',
      modifiedTime: file.modifiedTime ?? new Date(0).toISOString(),
      size: file.size ?? undefined,
    }));

  // 동일 파일명 중복 업로드 시 최신 modifiedTime만 유지
  const latestByName = new Map<string, CompetitorDriveFileInfo>();
  for (const file of files) {
    const existing = latestByName.get(file.name);
    if (!existing || file.modifiedTime > existing.modifiedTime) {
      latestByName.set(file.name, file);
    }
  }
  const uniqueFiles = [...latestByName.values()].sort(
    (a, b) => b.modifiedTime.localeCompare(a.modifiedTime),
  );

  fs.mkdirSync(cacheDir, { recursive: true });
  const syncedFiles: CompetitorDriveSyncMeta['files'] = [];
  const downloads: Array<{ file: CompetitorDriveFileInfo; targetPath: string }> = [];

  for (const file of uniqueFiles) {
    const targetPath = path.join(cacheDir, file.name);
    if (localFileMatchesDrive(targetPath, file, previous)) {
      syncedFiles.push({ name: file.name, modifiedTime: file.modifiedTime });
      continue;
    }
    downloads.push({ file, targetPath });
  }

  await runWithConcurrency(downloads, DRIVE_DOWNLOAD_CONCURRENCY, async ({ file, targetPath }) => {
    await downloadDriveFile(drive, file, targetPath);
    syncedFiles.push({ name: file.name, modifiedTime: file.modifiedTime });
  });

  syncedFiles.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // Drive에 없어진 로컬 파일 정리 (중복/삭제 반영)
  const remoteNames = new Set(uniqueFiles.map((file) => file.name));
  for (const entry of fs.readdirSync(cacheDir)) {
    if (entry.startsWith('.') || entry.endsWith('.json')) continue;
    if (!isCompetitorDataFile(entry)) continue;
    if (!remoteNames.has(entry) && fs.statSync(path.join(cacheDir, entry)).isFile()) {
      fs.unlinkSync(path.join(cacheDir, entry));
    }
  }

  const meta: CompetitorDriveSyncMeta = {
    syncedAt: new Date().toISOString(),
    folderId,
    year,
    sector,
    fileCount: syncedFiles.length,
    files: syncedFiles,
  };
  saveSyncMeta(cacheDir, meta);
  await ensureStructuredCacheForFolder(projectRoot, year, sector, cacheDir, folderId, drive);

  return meta;
}

export async function uploadCompetitorDriveFile(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<CompetitorDriveFileInfo> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) {
    throw new Error('Google Drive NEXUS 폴더 연동이 설정되지 않았습니다.');
  }
  if (!isNexusDriveUploadConfigured(projectRoot)) {
    throw new Error(formatDriveUploadError('Service Accounts do not have storage quota'));
  }

  const drive = await createOAuthDriveClient(projectRoot);
  const folderId = await resolveCompetitorUploadFolderId(drive, config, year, sector);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id,name,mimeType,modifiedTime,size',
  });

  const created = response.data;
  if (!created.id || !created.name) {
    throw new Error('Google Drive 업로드에 실패했습니다.');
  }

  const fileInfo: CompetitorDriveFileInfo = {
    id: created.id,
    name: created.name,
    mimeType: created.mimeType ?? mimeType,
    modifiedTime: created.modifiedTime ?? new Date().toISOString(),
    size: created.size ?? String(buffer.length),
  };

  cacheUploadedCompetitorFile(config, year, sector, folderId, fileName, buffer, fileInfo);

  // 업로드 배치 후 refresh(true)에서 1회 재파싱 — 파일마다 전체 재파싱 생략
  return fileInfo;
}

export function listCachedCompetitorFiles(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
): string[] {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled) return [];
  const cacheDir = getCompetitorCacheDir(config, year, sector);
  if (!fs.existsSync(cacheDir)) return [];
  return fs
    .readdirSync(cacheDir)
    .filter((name) => name !== SYNC_META_FILE && isCompetitorDataFile(name));
}

export function getCompetitorSyncMeta(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
): CompetitorDriveSyncMeta | null {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled) return null;
  const cacheDir = getCompetitorCacheDir(config, year, sector);
  return loadSyncMeta(cacheDir);
}

export function getCompetitorDriveStatus(projectRoot: string) {
  const config = getNexusDriveConfig(projectRoot);
  return {
    configured: config.enabled,
    folderId: config.folderId ?? undefined,
    cacheDir: config.cacheDir,
    uploadConfigured: isNexusDriveUploadConfigured(projectRoot),
    rootFolder: COMPETITOR_DRIVE_ROOT_FOLDER,
    folderPattern: `${COMPETITOR_DRIVE_ROOT_FOLDER}/{연도}/{전시사업|인테리어}`,
  };
}

export async function getCompetitorDriveStatusLive(projectRoot: string) {
  const base = getCompetitorDriveStatus(projectRoot);
  if (!base.configured) return base;

  const probe = await probeGoogleOAuthUploadAccess(projectRoot);
  return {
    ...base,
    uploadConfigured: probe.ok,
    uploadError: probe.ok ? undefined : probe.error,
  };
}
