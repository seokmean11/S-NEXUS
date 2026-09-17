import fs from 'node:fs';
import path from 'node:path';
import { competitorDocumentKey, getDocument, isMariaDbEnabled, putDocument } from './mariadb';
import type { CompetitorSector } from '../src/types/competitorAnalysis';

const STRUCTURED_FILE = 'competitor-data.json';

export async function loadCompetitorDoc<T>(
  projectRoot: string,
  year: number,
  sector: CompetitorSector,
): Promise<T | null> {
  if (!isMariaDbEnabled(projectRoot)) return null;
  return getDocument<T>(projectRoot, competitorDocumentKey(year, sector));
}

export async function saveCompetitorDoc(
  projectRoot: string,
  data: { year: number; sector: string; updatedAt?: string },
  cacheDir?: string,
): Promise<void> {
  if (cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, STRUCTURED_FILE), JSON.stringify(data, null, 2), 'utf8');
  }
  await putDocument(
    projectRoot,
    competitorDocumentKey(data.year, data.sector),
    data,
    data.updatedAt || new Date().toISOString(),
  );
}
