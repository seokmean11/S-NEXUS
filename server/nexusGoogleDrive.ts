import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { google, type drive_v3 } from 'googleapis';

const DATA_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;
const SYNC_META_FILE = '.sync-meta.json';
const SYNC_MIN_INTERVAL_MS = 55_000;

/** NEXUS 루트 아래 기능별 하위 폴더 이름 (Drive 폴더명과 동일해야 함) */
export const NEXUS_DRIVE_SUBFOLDERS = {
  outsourcing: '외주정보데이터',
} as const;

export type NexusDriveSubfolderKey = keyof typeof NEXUS_DRIVE_SUBFOLDERS;

export interface NexusDriveConfig {
  enabled: boolean;
  folderId: string | null;
  keyPath: string | null;
  cacheDir: string;
}

export interface NexusDriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export interface NexusDriveSyncMeta {
  syncedAt: string;
  folderId: string;
  fileCount: number;
  files: Array<{ name: string; modifiedTime: string }>;
}

export interface NexusDriveStatus {
  configured: boolean;
  folderId?: string;
  cacheDir?: string;
  lastSync?: NexusDriveSyncMeta;
  uploadConfigured?: boolean;
  uploadMethod?: 'oauth' | 'unavailable';
  error?: string;
}

function readEnvValues(root: string): Record<string, string> {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    const text = fs.readFileSync(envPath, 'utf8');
    const values: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return values;
  }
  return {};
}

function getOAuthCredentials(projectRoot: string): {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
} {
  const fromEnv = readEnvValues(projectRoot);
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || fromEnv.GOOGLE_OAUTH_CLIENT_ID || null,
    clientSecret:
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || fromEnv.GOOGLE_OAUTH_CLIENT_SECRET || null,
    refreshToken:
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || fromEnv.GOOGLE_OAUTH_REFRESH_TOKEN || null,
  };
}

export function isNexusDriveUploadConfigured(projectRoot: string): boolean {
  const oauth = getOAuthCredentials(projectRoot);
  return Boolean(oauth.clientId && oauth.clientSecret && oauth.refreshToken);
}

function isDataFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readEnvPath(root: string): Partial<NexusDriveConfig> {
  const values = readEnvValues(root);
  return {
    folderId: values.GOOGLE_DRIVE_NEXUS_FOLDER_ID || null,
    keyPath: values.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || null,
    cacheDir: values.NEXUS_DRIVE_CACHE_DIR || '.data/nexus-drive',
  };
}

export function getNexusDriveConfig(projectRoot: string): NexusDriveConfig {
  const fromEnv = readEnvPath(projectRoot);
  const folderId =
    process.env.GOOGLE_DRIVE_NEXUS_FOLDER_ID?.trim() || fromEnv.folderId || null;
  const keyPathRaw =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() || fromEnv.keyPath || null;
  const cacheDirRaw =
    process.env.NEXUS_DRIVE_CACHE_DIR?.trim() || fromEnv.cacheDir || '.data/nexus-drive';
  const keyPath = keyPathRaw
    ? path.isAbsolute(keyPathRaw)
      ? keyPathRaw
      : path.join(projectRoot, keyPathRaw)
    : null;
  const cacheDir = path.isAbsolute(cacheDirRaw)
    ? cacheDirRaw
    : path.join(projectRoot, cacheDirRaw);

  return {
    enabled: Boolean(folderId && keyPath && fs.existsSync(keyPath)),
    folderId,
    keyPath,
    cacheDir,
  };
}

function loadSyncMeta(cacheDir: string): NexusDriveSyncMeta | null {
  const metaPath = path.join(cacheDir, SYNC_META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as NexusDriveSyncMeta;
  } catch {
    return null;
  }
}

function saveSyncMeta(cacheDir: string, meta: NexusDriveSyncMeta): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, SYNC_META_FILE), JSON.stringify(meta, null, 2), 'utf8');
}

async function createDriveClient(keyPath: string): Promise<drive_v3.Drive> {
  const raw = fs.readFileSync(keyPath, 'utf8');
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  await auth.authorize();
  return google.drive({ version: 'v3', auth });
}

async function createOAuthDriveClient(projectRoot: string): Promise<drive_v3.Drive> {
  const oauth = getOAuthCredentials(projectRoot);
  if (!oauth.clientId || !oauth.clientSecret || !oauth.refreshToken) {
    throw new Error(
      'Google Drive 업로드 OAuth가 설정되지 않았습니다. GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN을 .env에 추가하고 npm run google-drive-oauth를 실행하세요.',
    );
  }
  const auth = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret);
  auth.setCredentials({ refresh_token: oauth.refreshToken });
  return google.drive({ version: 'v3', auth });
}

export function formatDriveUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('storage quota') || message.includes('Service Accounts do not have storage')) {
    return '개인 Google Drive는 서비스 계정으로 파일을 올릴 수 없습니다. OAuth 업로드 설정(GOOGLE_OAUTH_*)을 추가한 뒤 npm run google-drive-oauth를 실행하세요.';
  }
  return message;
}

async function findSubfolderId(
  drive: drive_v3.Drive,
  parentFolderId: string,
  folderName: string,
): Promise<string | null> {
  const response = await drive.files.list({
    q: `'${parentFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}'`,
    fields: 'files(id,name)',
    pageSize: 1,
  });
  const folder = response.data.files?.[0];
  return folder?.id ?? null;
}

async function resolveSubfolderIdWithDrive(
  drive: drive_v3.Drive,
  config: NexusDriveConfig,
  subfolderKey: NexusDriveSubfolderKey,
): Promise<string> {
  if (!config.folderId) {
    throw new Error('Google Drive NEXUS 루트 폴더가 설정되지 않았습니다.');
  }
  const folderName = NEXUS_DRIVE_SUBFOLDERS[subfolderKey];
  const subfolderId = await findSubfolderId(drive, config.folderId, folderName);
  if (!subfolderId) {
    throw new Error(
      `Google Drive NEXUS 폴더 안에 「${folderName}」 하위 폴더가 없습니다. Drive에서 먼저 만들어 주세요.`,
    );
  }
  return subfolderId;
}

export async function resolveSubfolderId(
  config: NexusDriveConfig,
  subfolderKey: NexusDriveSubfolderKey,
): Promise<string> {
  if (!config.folderId || !config.keyPath) {
    throw new Error('Google Drive NEXUS 루트 폴더가 설정되지 않았습니다.');
  }
  const drive = await createDriveClient(config.keyPath);
  return resolveSubfolderIdWithDrive(drive, config, subfolderKey);
}

function getSubfolderCacheDir(config: NexusDriveConfig, subfolderKey: NexusDriveSubfolderKey): string {
  return path.join(config.cacheDir, NEXUS_DRIVE_SUBFOLDERS[subfolderKey]);
}

export async function listNexusDriveFiles(
  config: NexusDriveConfig,
  options?: { subfolderKey?: NexusDriveSubfolderKey },
): Promise<NexusDriveFileInfo[]> {
  if (!config.enabled || !config.folderId || !config.keyPath) {
    return [];
  }
  const drive = await createDriveClient(config.keyPath);
  let parentId = config.folderId;
  let namePrefix = '';

  if (options?.subfolderKey) {
    parentId = await resolveSubfolderId(config, options.subfolderKey);
    namePrefix = `${NEXUS_DRIVE_SUBFOLDERS[options.subfolderKey]}/`;
  }

  const response = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });
  return (response.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } =>
      Boolean(file.id && file.name),
    )
    .map((file) => ({
      id: file.id!,
      name: namePrefix + file.name!,
      mimeType: file.mimeType ?? 'application/octet-stream',
      modifiedTime: file.modifiedTime ?? new Date(0).toISOString(),
      size: file.size ?? undefined,
    }));
}

async function downloadDriveFile(
  drive: drive_v3.Drive,
  file: NexusDriveFileInfo,
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

export async function syncNexusDriveCache(
  projectRoot: string,
  options?: { force?: boolean; subfolderKey?: NexusDriveSubfolderKey },
): Promise<NexusDriveSyncMeta> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) {
    throw new Error(
      'Google Drive NEXUS 폴더가 설정되지 않았습니다. GOOGLE_DRIVE_NEXUS_FOLDER_ID와 GOOGLE_SERVICE_ACCOUNT_KEY_PATH를 확인하세요.',
    );
  }

  const subfolderKey = options?.subfolderKey ?? 'outsourcing';
  const subfolderName = NEXUS_DRIVE_SUBFOLDERS[subfolderKey];
  const cacheDir = getSubfolderCacheDir(config, subfolderKey);

  const previous = loadSyncMeta(cacheDir);
  if (!options?.force && previous?.syncedAt) {
    const elapsed = Date.now() - new Date(previous.syncedAt).getTime();
    if (elapsed < SYNC_MIN_INTERVAL_MS) {
      return previous;
    }
  }

  const subfolderId = await resolveSubfolderId(config, subfolderKey);
  const drive = await createDriveClient(config.keyPath);
  const response = await drive.files.list({
    q: `'${subfolderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });
  const files = (response.data.files ?? [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } =>
      Boolean(file.id && file.name && isDataFileName(file.name)),
    )
    .map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType ?? 'application/octet-stream',
      modifiedTime: file.modifiedTime ?? new Date(0).toISOString(),
      size: file.size ?? undefined,
    }));

  fs.mkdirSync(cacheDir, { recursive: true });

  const syncedFiles: NexusDriveSyncMeta['files'] = [];
  for (const file of files) {
    const targetPath = path.join(cacheDir, file.name);
    await downloadDriveFile(drive, file, targetPath);
    syncedFiles.push({ name: file.name, modifiedTime: file.modifiedTime });
  }

  const meta: NexusDriveSyncMeta = {
    syncedAt: new Date().toISOString(),
    folderId: subfolderId,
    fileCount: syncedFiles.length,
    files: syncedFiles,
  };
  saveSyncMeta(cacheDir, meta);
  return meta;
}

export async function uploadToNexusDriveFolder(
  projectRoot: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  options?: { subfolderKey?: NexusDriveSubfolderKey },
): Promise<NexusDriveFileInfo> {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled || !config.folderId || !config.keyPath) {
    throw new Error('Google Drive NEXUS 폴더 연동이 설정되지 않았습니다.');
  }
  if (!isNexusDriveUploadConfigured(projectRoot)) {
    throw new Error(formatDriveUploadError('Service Accounts do not have storage quota'));
  }

  const subfolderKey = options?.subfolderKey ?? 'outsourcing';
  const drive = await createOAuthDriveClient(projectRoot);
  const subfolderId = await resolveSubfolderIdWithDrive(drive, config, subfolderKey);
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [subfolderId],
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

  await syncNexusDriveCache(projectRoot, { force: true, subfolderKey });

  const subfolderName = NEXUS_DRIVE_SUBFOLDERS[subfolderKey];
  return {
    id: created.id,
    name: `${subfolderName}/${created.name}`,
    mimeType: created.mimeType ?? mimeType,
    modifiedTime: created.modifiedTime ?? new Date().toISOString(),
    size: created.size ?? String(buffer.length),
  };
}

export function getNexusDriveStatus(projectRoot: string): NexusDriveStatus {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.folderId || !config.keyPath) {
    return {
      configured: false,
      error:
        'GOOGLE_DRIVE_NEXUS_FOLDER_ID 또는 GOOGLE_SERVICE_ACCOUNT_KEY_PATH가 설정되지 않았습니다.',
    };
  }
  if (!fs.existsSync(config.keyPath)) {
    return {
      configured: false,
      folderId: config.folderId,
      error: `서비스 계정 키 파일을 찾을 수 없습니다: ${config.keyPath}`,
    };
  }

  return {
    configured: true,
    folderId: config.folderId,
    cacheDir: config.cacheDir,
    lastSync: loadSyncMeta(getSubfolderCacheDir(config, 'outsourcing')) ?? undefined,
    uploadConfigured: isNexusDriveUploadConfigured(projectRoot),
    uploadMethod: isNexusDriveUploadConfigured(projectRoot) ? 'oauth' : 'unavailable',
  };
}

export function resolveNexusOutsourcingCacheDir(projectRoot: string): string | null {
  const config = getNexusDriveConfig(projectRoot);
  if (!config.enabled) return null;
  const cacheDir = getSubfolderCacheDir(config, 'outsourcing');
  if (!fs.existsSync(cacheDir)) return null;
  const dataFiles = fs
    .readdirSync(cacheDir)
    .filter((name) => name !== SYNC_META_FILE && isDataFileName(name));
  if (dataFiles.length === 0) return null;
  return cacheDir;
}
