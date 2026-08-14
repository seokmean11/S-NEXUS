/**
 * 24년 신용분석보고서에서 생산성 전용 종업원 추출 (competitor-data.json 비변경)
 *
 * Usage: npx tsx scripts/extract_productivity_employees.ts [--year 2024] [--from 2021] [--to 2023] [--sector 인테리어] [--force]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProductivityEmployeesOverlay,
  loadOrBuildProductivityEmployeesOverlay,
  PRODUCTIVITY_EMPLOYEES_FILE,
} from '../server/competitorProductivityEmployees';
import { getCompetitorCacheDir } from '../server/competitorDrive';
import { getNexusDriveConfig } from '../server/nexusGoogleDrive';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const sector = readArg('--sector', '인테리어') as '전시사업' | '인테리어';
  const force = process.argv.includes('--force');
  const fromArg = readArg('--from', '');
  const toArg = readArg('--to', '');
  const singleYear = readArg('--year', '');

  const years: number[] = [];
  if (fromArg && toArg) {
    const fromYear = Number(fromArg);
    const toYear = Number(toArg);
    for (let year = fromYear; year <= toYear; year += 1) {
      years.push(year);
    }
  } else {
    years.push(Number(singleYear || '2024'));
  }

  const config = getNexusDriveConfig(root);
  let failed = 0;

  for (const year of years) {
    const overlay = await loadOrBuildProductivityEmployeesOverlay(root, year, sector, { force });
    const cacheDir = getCompetitorCacheDir(config, year, sector);

    if (!overlay) {
      console.log(`[productivity] ${year}/${sector}: PDF 없음 또는 종업원 추출 실패`);
      failed += 1;
      continue;
    }

    console.log(
      `[productivity] ${year}/${sector}: ${overlay.entries.length}社 → ${path.join(cacheDir, PRODUCTIVITY_EMPLOYEES_FILE)}`,
    );
    for (const entry of overlay.entries) {
      console.log(`  ${entry.companyName}: ${entry.employees}명 (${entry.referenceYear}, ${entry.source_file})`);
    }

    if (process.argv.includes('--dry-build')) {
      const rebuilt = await buildProductivityEmployeesOverlay(cacheDir, year, sector);
      console.log(`[productivity] ${year} dry-build count:`, rebuilt?.entries.length ?? 0);
    }
  }

  if (failed === years.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
