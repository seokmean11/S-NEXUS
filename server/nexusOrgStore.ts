import fs from 'node:fs';
import path from 'node:path';
import type { StoredOrgState } from '../src/utils/orgStorage';

const ORG_DIR = '.data/nexus-org';
const ORG_FILE = 'state.json';

function getOrgFilePath(projectRoot: string): string {
  return path.join(projectRoot, ORG_DIR, ORG_FILE);
}

export function ensureOrgStoreDir(projectRoot: string): void {
  fs.mkdirSync(path.join(projectRoot, ORG_DIR), { recursive: true });
}

export function readServerOrgState(projectRoot: string): StoredOrgState | null {
  const filePath = getOrgFilePath(projectRoot);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as StoredOrgState;
  } catch {
    return null;
  }
}

export function writeServerOrgState(projectRoot: string, state: StoredOrgState): void {
  ensureOrgStoreDir(projectRoot);
  const filePath = getOrgFilePath(projectRoot);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

export function getServerOrgMeta(projectRoot: string): { exists: boolean; updatedAt?: string } {
  const filePath = getOrgFilePath(projectRoot);
  if (!fs.existsSync(filePath)) return { exists: false };
  const stat = fs.statSync(filePath);
  return { exists: true, updatedAt: stat.mtime.toISOString() };
}
