/**
 * 신용분석보고서 소속산업 분석 추출 (competitor-data.json 비변경)
 *
 * Usage: npx tsx scripts/extract_industry_analysis.ts [--year 2024] [--from 2021] [--to 2023] [--sector 인테리어] [--force]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildIndustryAnalysisOverlay,
  loadOrBuildIndustryAnalysisOverlay,
  INDUSTRY_ANALYSIS_FILE,
} from '../server/competitorIndustryAnalysis';
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
    const overlay = await loadOrBuildIndustryAnalysisOverlay(root, year, sector, { force });
    const cacheDir = getCompetitorCacheDir(config, year, sector);

    if (!overlay) {
      console.log(`[industry] ${year}/${sector}: PDF 없음 또는 소속산업 분석 추출 실패`);
      failed += 1;
      continue;
    }

    console.log(
      `[industry] ${year}/${sector}: ${overlay.entries.length}社 → ${path.join(cacheDir, INDUSTRY_ANALYSIS_FILE)}`,
    );
    for (const entry of overlay.entries) {
      console.log(
        `  ${entry.companyName}: 산업=${entry.industryName ?? '-'} · 부채 ${entry.industryAverage.debt_ratio ?? '-'}% · 영업 ${entry.industryAverage.operating_margin ?? '-'}% (${entry.source_file})`,
      );
    }

    if (process.argv.includes('--dry-build')) {
      const rebuilt = await buildIndustryAnalysisOverlay(cacheDir, year, sector);
      console.log(`[industry] ${year} dry-build count:`, rebuilt?.entries.length ?? 0);
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
