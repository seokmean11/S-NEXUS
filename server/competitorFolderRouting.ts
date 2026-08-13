import fs from 'node:fs';
import path from 'node:path';

import type { CompetitorSector } from '../src/types/competitorAnalysis';
import { COMPETITOR_DRIVE_ROOT_FOLDER, COMPETITOR_SECTORS } from './competitorDrive';
import type { NexusDriveConfig } from './nexusGoogleDrive';

/** Drive 폴더명 → 표준 사업분야 */
export const SECTOR_FOLDER_ALIASES: Record<string, CompetitorSector> = {
  전시사업: '전시사업',
  전시: '전시사업',
  exhibition: '전시사업',
  인테리어: '인테리어',
  interior: '인테리어',
};

export type CompetitorFolderLayout = 'sector-first' | 'year-first';

export interface CompetitorLocationRef {
  folderYear: number;
  sector: CompetitorSector;
  cacheDir: string;
  signatureKey: string;
  layout: CompetitorFolderLayout;
  drivePath: string;
}

export function resolveSectorFromFolderName(folderName: string): CompetitorSector | null {
  const trimmed = folderName.trim();
  if (SECTOR_FOLDER_ALIASES[trimmed]) return SECTOR_FOLDER_ALIASES[trimmed];
  return (COMPETITOR_SECTORS as readonly string[]).includes(trimmed) ? (trimmed as CompetitorSector) : null;
}

export function isYearFolderName(name: string): boolean {
  return /^\d{4}$/u.test(name);
}

/** 표준 Drive 경로 (nexus/경쟁사분석/{연도}/{사업분야}) */
export function getYearFirstDrivePath(year: number, sector: CompetitorSector): string {
  return `${COMPETITOR_DRIVE_ROOT_FOLDER}/${year}/${sector}`;
}

/** 레거시 Drive 경로: 경쟁사분석/{사업분야}/{연도} */
export function getSectorFirstDrivePath(sector: CompetitorSector, year: number): string {
  const folderSector = sector === '전시사업' ? '전시' : sector;
  return `${COMPETITOR_DRIVE_ROOT_FOLDER}/${folderSector}/${year}`;
}

export function getCanonicalDrivePath(year: number, sector: CompetitorSector): string {
  return getYearFirstDrivePath(year, sector);
}

export function getSectorFirstCacheDir(config: NexusDriveConfig, sector: CompetitorSector, year: number): string {
  const folderSector = sector === '전시사업' ? '전시' : sector;
  return path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER, folderSector, String(year));
}

export function getYearFirstCacheDir(config: NexusDriveConfig, year: number, sector: CompetitorSector): string {
  return path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER, String(year), sector);
}

export function resolveCompetitorCacheDir(
  config: NexusDriveConfig,
  year: number,
  sector: CompetitorSector,
): { cacheDir: string; layout: CompetitorFolderLayout; drivePath: string } {
  const yearFirst = getYearFirstCacheDir(config, year, sector);
  const sectorFirst = getSectorFirstCacheDir(config, sector, year);

  if (fs.existsSync(yearFirst)) {
    return {
      cacheDir: yearFirst,
      layout: 'year-first',
      drivePath: getYearFirstDrivePath(year, sector),
    };
  }

  if (fs.existsSync(sectorFirst)) {
    return {
      cacheDir: sectorFirst,
      layout: 'sector-first',
      drivePath: getSectorFirstDrivePath(sector, year),
    };
  }

  return {
    cacheDir: yearFirst,
    layout: 'year-first',
    drivePath: getYearFirstDrivePath(year, sector),
  };
}

function dirHasDataFiles(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  return fs.readdirSync(dirPath).some((name) => {
    if (name.startsWith('.') || name.endsWith('.json')) return false;
    try {
      return fs.statSync(path.join(dirPath, name)).isFile();
    } catch {
      return false;
    }
  });
}

/** 로컬 캐시 트리 — sector-first + year-first 레이아웃 모두 스캔 */
export function scanAllCompetitorLocations(config: NexusDriveConfig): CompetitorLocationRef[] {
  const root = path.join(config.cacheDir, COMPETITOR_DRIVE_ROOT_FOLDER);
  if (!fs.existsSync(root)) return [];

  const found = new Map<string, CompetitorLocationRef>();

  function addLocation(
    year: number,
    sector: CompetitorSector,
    cacheDir: string,
    layout: CompetitorFolderLayout,
    drivePath: string,
  ): void {
    if (!dirHasDataFiles(cacheDir)) return;
    const signatureKey = `${year}/${sector}`;
    if (found.has(signatureKey)) return;
    found.set(signatureKey, {
      folderYear: year,
      sector,
      cacheDir,
      signatureKey,
      layout,
      drivePath,
    });
  }

  for (const level1 of fs.readdirSync(root)) {
    const level1Path = path.join(root, level1);
    if (!fs.statSync(level1Path).isDirectory()) continue;

    const sectorFromName = resolveSectorFromFolderName(level1);
    if (sectorFromName) {
      for (const yearName of fs.readdirSync(level1Path)) {
        if (!isYearFolderName(yearName)) continue;
        const year = Number(yearName);
        addLocation(
          year,
          sectorFromName,
          path.join(level1Path, yearName),
          'sector-first',
          getSectorFirstDrivePath(sectorFromName, year),
        );
      }
      continue;
    }

    if (!isYearFolderName(level1)) continue;
    const folderYear = Number(level1);
    for (const sectorName of fs.readdirSync(level1Path)) {
      const sector = resolveSectorFromFolderName(sectorName);
      if (!sector) continue;
      addLocation(
        folderYear,
        sector,
        path.join(level1Path, sectorName),
        'year-first',
        getYearFirstDrivePath(folderYear, sector),
      );
    }
  }

  return [...found.values()].sort(
    (a, b) => a.folderYear - b.folderYear || a.sector.localeCompare(b.sector, 'ko'),
  );
}

/** Drive API 탐색용 세그먼트 (year-first 표준, sector-first 레거시) */
export function drivePathSegments(
  year: number,
  sector: CompetitorSector,
  layout: CompetitorFolderLayout = 'year-first',
): string[] {
  if (layout === 'year-first') {
    return [COMPETITOR_DRIVE_ROOT_FOLDER, String(year), sector];
  }
  const folderSector = sector === '전시사업' ? '전시' : sector;
  return [COMPETITOR_DRIVE_ROOT_FOLDER, folderSector, String(year)];
}
