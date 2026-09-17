import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEvent } from '../src/types/history';
import type { StoredAppState } from '../src/utils/orgStorage';
import { getDocument, isMariaDbEnabled, putDocument } from './mariadb';

export type AppRuntimeRole = 'dev' | 'service';

const PROD_APP_DIR = '.data/nexus-app';
const DEV_APP_DIR = '.data/nexus-app-dev';
const STATE_FILE = 'state.json';

export interface StoredNexusAppBundle {
  savedAt: string;
  app: StoredAppState;
  history: HistoryEvent[];
}

function appDirName(role: AppRuntimeRole): string {
  return role === 'dev' ? DEV_APP_DIR : PROD_APP_DIR;
}

function getAppFilePath(projectRoot: string, role: AppRuntimeRole): string {
  return path.join(projectRoot, appDirName(role), STATE_FILE);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function ensureAppStoreDir(projectRoot: string, role: AppRuntimeRole): void {
  fs.mkdirSync(path.join(projectRoot, appDirName(role)), { recursive: true });
}

export async function readServerAppBundle(
  projectRoot: string,
  role: AppRuntimeRole,
): Promise<StoredNexusAppBundle | null> {
  if (isMariaDbEnabled(projectRoot) && role === 'service') {
    const fromDb = await getDocument<StoredNexusAppBundle>(projectRoot, 'app');
    if (fromDb?.app && Array.isArray(fromDb.app.projects) && Array.isArray(fromDb.app.allocations)) {
      return {
        savedAt: fromDb.savedAt || fromDb.app.savedAt || '',
        app: fromDb.app,
        history: Array.isArray(fromDb.history) ? fromDb.history : [],
      };
    }
  }
  const parsed = readJsonFile<StoredNexusAppBundle>(getAppFilePath(projectRoot, role));
  if (!parsed?.app || !Array.isArray(parsed.app.projects) || !Array.isArray(parsed.app.allocations)) {
    return null;
  }
  return {
    savedAt: parsed.savedAt || parsed.app.savedAt || '',
    app: parsed.app,
    history: Array.isArray(parsed.history) ? parsed.history : [],
  };
}

export async function writeServerAppBundle(
  projectRoot: string,
  bundle: StoredNexusAppBundle,
  role: AppRuntimeRole,
): Promise<{ savedAt: string; writable: boolean }> {
  const writable = role === 'service';
  const savedAt = new Date().toISOString();
  const stamped: StoredNexusAppBundle = {
    savedAt,
    app: { ...bundle.app, savedAt, historySeeded: true },
    history: Array.isArray(bundle.history) ? bundle.history : [],
  };
  ensureAppStoreDir(projectRoot, role);
  fs.writeFileSync(getAppFilePath(projectRoot, role), JSON.stringify(stamped, null, 2), 'utf8');
  await putDocument(projectRoot, 'app', stamped, savedAt);
  return { savedAt, writable };
}

export function isValidAppBundle(value: unknown): value is StoredNexusAppBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as StoredNexusAppBundle;
  return Boolean(
    bundle.app &&
      Array.isArray(bundle.app.projects) &&
      Array.isArray(bundle.app.allocations),
  );
}
