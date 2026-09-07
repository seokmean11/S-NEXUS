import fs from 'node:fs';
import path from 'node:path';

import {
  getNexusDriveConfig,
  getNexusSubfolderCacheDir,
  isNexusDriveUploadConfigured,
  syncNexusDriveCache,
  uploadOrUpdateNexusDriveFile,
} from './nexusGoogleDrive';
import type { StoredOrgState } from '../src/utils/orgStorage';

export type OrgRuntimeRole = 'dev' | 'service';

export const ORG_STATE_FILENAME = 'state.json';

const PROD_ORG_DIR = '.data/nexus-org';
const DEV_ORG_DIR = '.data/nexus-org-dev';
const SYNC_META_FILE = '.sync-meta.json';

function withOrgStateSavedAt(
  state: StoredOrgState,
  savedAt = new Date().toISOString(),
): StoredOrgState {
  return { ...state, savedAt };
}

function orgDirName(role: OrgRuntimeRole): string {
  return role === 'dev' ? DEV_ORG_DIR : PROD_ORG_DIR;
}

function getLocalOrgFilePath(projectRoot: string, role: OrgRuntimeRole = 'service'): string {
  return path.join(projectRoot, orgDirName(role), ORG_STATE_FILENAME);
}

function getDriveCacheOrgFilePath(projectRoot: string): string | null {
  const cacheDir = getNexusSubfolderCacheDir(projectRoot, 'organization');
  if (!cacheDir) return null;
  return path.join(cacheDir, ORG_STATE_FILENAME);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function loadDriveSyncMeta(projectRoot: string): { syncedAt?: string } | null {
  const cacheDir = getNexusSubfolderCacheDir(projectRoot, 'organization');
  if (!cacheDir) return null;
  const metaPath = path.join(cacheDir, SYNC_META_FILE);
  return readJsonFile<{ syncedAt?: string }>(metaPath);
}

export function ensureOrgStoreDir(projectRoot: string, role: OrgRuntimeRole = 'service'): void {
  fs.mkdirSync(path.join(projectRoot, orgDirName(role)), { recursive: true });
}

export function readServerOrgState(
  projectRoot: string,
  role: OrgRuntimeRole = 'service',
): StoredOrgState | null {
  return readJsonFile<StoredOrgState>(getLocalOrgFilePath(projectRoot, role));
}

export function writeServerOrgState(
  projectRoot: string,
  state: StoredOrgState,
  role: OrgRuntimeRole = 'service',
): void {
  ensureOrgStoreDir(projectRoot, role);
  const stamped = state.savedAt ? state : withOrgStateSavedAt(state);
  fs.writeFileSync(getLocalOrgFilePath(projectRoot, role), JSON.stringify(stamped, null, 2), 'utf8');
}

export interface ServerOrgMeta {
  exists: boolean;
  updatedAt?: string;
  dataSource?: 'local' | 'drive-cache' | 'sandbox';
  driveConfigured?: boolean;
  driveUploadConfigured?: boolean;
  lastDriveSyncAt?: string;
  writable?: boolean;
  source?: 'drive' | 'sandbox' | 'local';
}

function resolveOrgFileStat(filePath: string | null): { exists: boolean; updatedAt?: string } {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false };
  const stat = fs.statSync(filePath);
  return { exists: true, updatedAt: stat.mtime.toISOString() };
}

export function getServerOrgMeta(
  projectRoot: string,
  role: OrgRuntimeRole = 'service',
  source: ServerOrgMeta['source'] = role === 'dev' ? 'sandbox' : 'local',
): ServerOrgMeta {
  const writable = role === 'service';
  const driveConfigured = getNexusDriveConfig(projectRoot).enabled;
  const driveCachePath = getDriveCacheOrgFilePath(projectRoot);
  const localPath = getLocalOrgFilePath(projectRoot, role);
  const driveCacheStat = resolveOrgFileStat(driveCachePath);
  const localStat = resolveOrgFileStat(localPath);
  const lastDriveSyncAt = loadDriveSyncMeta(projectRoot)?.syncedAt;

  if (source === 'drive' && driveCacheStat.exists) {
    return {
      exists: true,
      updatedAt: driveCacheStat.updatedAt,
      dataSource: 'drive-cache',
      driveConfigured,
      driveUploadConfigured: isNexusDriveUploadConfigured(projectRoot),
      lastDriveSyncAt,
      writable,
      source: 'drive',
    };
  }

  return {
    exists: localStat.exists,
    updatedAt: localStat.updatedAt,
    dataSource: role === 'dev' ? 'sandbox' : 'local',
    driveConfigured,
    driveUploadConfigured: isNexusDriveUploadConfigured(projectRoot),
    lastDriveSyncAt,
    writable,
    source: role === 'dev' ? 'sandbox' : source,
  };
}

function readDriveCacheOrgState(projectRoot: string): StoredOrgState | null {
  const driveCachePath = getDriveCacheOrgFilePath(projectRoot);
  return driveCachePath ? readJsonFile<StoredOrgState>(driveCachePath) : null;
}

function mirrorDriveStateToLocal(projectRoot: string, driveState: StoredOrgState): void {
  const localState = readServerOrgState(projectRoot, 'service');
  if (localState?.savedAt === driveState.savedAt) return;
  writeServerOrgState(projectRoot, driveState, 'service');
}

export async function syncAndReadServerOrgState(
  projectRoot: string,
  role: OrgRuntimeRole = 'service',
): Promise<{ state: StoredOrgState | null; source: ServerOrgMeta['source'] }> {
  const config = getNexusDriveConfig(projectRoot);
  if (config.enabled) {
    try {
      await Promise.race([
        syncNexusDriveCache(projectRoot, {
          subfolderKey: 'organization',
          force: true,
          minIntervalMs: 0,
        }),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 12_000);
        }),
      ]);
    } catch {
      // Drive sync 실패 시 캐시·로컬 폴백
    }

    const driveState = readDriveCacheOrgState(projectRoot);
    if (driveState) {
      if (role === 'service') {
        mirrorDriveStateToLocal(projectRoot, driveState);
      }
      return { state: driveState, source: 'drive' };
    }
  }

  const local = readServerOrgState(projectRoot, role);
  return { state: local, source: role === 'dev' ? 'sandbox' : 'local' };
}

export async function writeServerOrgStateWithDriveSync(
  projectRoot: string,
  state: StoredOrgState,
  role: OrgRuntimeRole = 'service',
): Promise<ServerOrgMeta> {
  const stamped = state.savedAt ? state : withOrgStateSavedAt(state);
  writeServerOrgState(projectRoot, stamped, role);

  if (role !== 'service') {
    return getServerOrgMeta(projectRoot, role, 'sandbox');
  }

  const serialized = JSON.stringify(stamped, null, 2);
  const buffer = Buffer.from(serialized, 'utf8');
  const config = getNexusDriveConfig(projectRoot);

  if (config.enabled) {
    const cacheDir = getNexusSubfolderCacheDir(projectRoot, 'organization');
    if (cacheDir) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, ORG_STATE_FILENAME), serialized, 'utf8');
    }

    if (isNexusDriveUploadConfigured(projectRoot)) {
      try {
        await uploadOrUpdateNexusDriveFile(projectRoot, ORG_STATE_FILENAME, buffer, 'application/json', {
          subfolderKey: 'organization',
        });
      } catch {
        // 로컬·캐시 저장은 유지. Drive 업로드 실패는 meta로만 표시.
      }
    }
  }

  return getServerOrgMeta(projectRoot, role, 'drive');
}
