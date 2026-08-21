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

export const ORG_STATE_FILENAME = 'state.json';

const ORG_DIR = '.data/nexus-org';
const SYNC_META_FILE = '.sync-meta.json';

function getOrgStateSavedAtMs(state: StoredOrgState | null | undefined): number {
  if (!state?.savedAt) return 0;
  const value = Date.parse(state.savedAt);
  return Number.isFinite(value) ? value : 0;
}

function withOrgStateSavedAt(
  state: StoredOrgState,
  savedAt = new Date().toISOString(),
): StoredOrgState {
  return { ...state, savedAt };
}

function getLocalOrgFilePath(projectRoot: string): string {
  return path.join(projectRoot, ORG_DIR, ORG_STATE_FILENAME);
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

export function ensureOrgStoreDir(projectRoot: string): void {
  fs.mkdirSync(path.join(projectRoot, ORG_DIR), { recursive: true });
}

export function readServerOrgState(projectRoot: string): StoredOrgState | null {
  return readJsonFile<StoredOrgState>(getLocalOrgFilePath(projectRoot));
}

export function writeServerOrgState(projectRoot: string, state: StoredOrgState): void {
  ensureOrgStoreDir(projectRoot);
  const stamped = state.savedAt ? state : withOrgStateSavedAt(state);
  fs.writeFileSync(getLocalOrgFilePath(projectRoot), JSON.stringify(stamped, null, 2), 'utf8');
}

function fileMtimeMs(filePath: string | null): number {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).mtime.getTime();
}

function pickNewerOrgState(
  localState: StoredOrgState | null,
  driveState: StoredOrgState | null,
  projectRoot: string,
): StoredOrgState | null {
  if (!localState) return driveState;
  if (!driveState) return localState;

  const localAt = getOrgStateSavedAtMs(localState) || fileMtimeMs(getLocalOrgFilePath(projectRoot));
  const driveAt =
    getOrgStateSavedAtMs(driveState) || fileMtimeMs(getDriveCacheOrgFilePath(projectRoot));

  return localAt >= driveAt ? localState : driveState;
}

export interface ServerOrgMeta {
  exists: boolean;
  updatedAt?: string;
  dataSource?: 'local' | 'drive-cache';
  driveConfigured?: boolean;
  driveUploadConfigured?: boolean;
  lastDriveSyncAt?: string;
}

function resolveOrgFileStat(filePath: string | null): { exists: boolean; updatedAt?: string } {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false };
  const stat = fs.statSync(filePath);
  return { exists: true, updatedAt: stat.mtime.toISOString() };
}

export function getServerOrgMeta(projectRoot: string): ServerOrgMeta {
  const driveConfigured = getNexusDriveConfig(projectRoot).enabled;
  const driveCachePath = getDriveCacheOrgFilePath(projectRoot);
  const localPath = getLocalOrgFilePath(projectRoot);
  const driveCacheStat = resolveOrgFileStat(driveCachePath);
  const localStat = resolveOrgFileStat(localPath);

  if (driveCacheStat.exists && localStat.exists) {
    const driveState = readJsonFile<StoredOrgState>(driveCachePath);
    const localState = readServerOrgState(projectRoot);
    const newer = pickNewerOrgState(localState, driveState, projectRoot);
    const useLocal = newer === localState;
    return {
      exists: true,
      updatedAt: useLocal ? localStat.updatedAt : driveCacheStat.updatedAt,
      dataSource: useLocal ? 'local' : 'drive-cache',
      driveConfigured,
      driveUploadConfigured: isNexusDriveUploadConfigured(projectRoot),
      lastDriveSyncAt: loadDriveSyncMeta(projectRoot)?.syncedAt,
    };
  }

  if (driveCacheStat.exists) {
    return {
      exists: true,
      updatedAt: driveCacheStat.updatedAt,
      dataSource: 'drive-cache',
      driveConfigured,
      driveUploadConfigured: isNexusDriveUploadConfigured(projectRoot),
      lastDriveSyncAt: loadDriveSyncMeta(projectRoot)?.syncedAt,
    };
  }

  return {
    exists: localStat.exists,
    updatedAt: localStat.updatedAt,
    dataSource: 'local',
    driveConfigured,
    driveUploadConfigured: isNexusDriveUploadConfigured(projectRoot),
    lastDriveSyncAt: loadDriveSyncMeta(projectRoot)?.syncedAt,
  };
}

export async function syncAndReadServerOrgState(projectRoot: string): Promise<StoredOrgState | null> {
  const driveCachePath = getDriveCacheOrgFilePath(projectRoot);
  const driveState = driveCachePath ? readJsonFile<StoredOrgState>(driveCachePath) : null;
  const localState = readServerOrgState(projectRoot);
  const existing = pickNewerOrgState(localState, driveState, projectRoot);

  const config = getNexusDriveConfig(projectRoot);
  if (config.enabled) {
    const syncPromise = syncNexusDriveCache(projectRoot, { subfolderKey: 'organization' }).catch(
      () => undefined,
    );
    if (existing) {
      void syncPromise;
      return existing;
    }
    try {
      await Promise.race([
        syncPromise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 12_000);
        }),
      ]);
    } catch {
      // Drive sync 실패 시 로컬 폴백
    }
    const refreshedPath = getDriveCacheOrgFilePath(projectRoot);
    const refreshed = refreshedPath ? readJsonFile<StoredOrgState>(refreshedPath) : null;
    return pickNewerOrgState(localState, refreshed, projectRoot) ?? localState;
  }

  return localState;
}

export async function writeServerOrgStateWithDriveSync(
  projectRoot: string,
  state: StoredOrgState,
): Promise<ServerOrgMeta> {
  const stamped = state.savedAt ? state : withOrgStateSavedAt(state);
  writeServerOrgState(projectRoot, stamped);

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

  return getServerOrgMeta(projectRoot);
}
