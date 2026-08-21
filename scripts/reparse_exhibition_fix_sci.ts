/**
 * Force reparse 전시사업 (2021–2024) via Claude document extract and upload to Drive.
 * Run: npx tsx scripts/reparse_exhibition_fix_sci.ts
 */
import {
  getCompetitorCacheDir,
  getCompetitorSyncMeta,
  syncCompetitorDriveCache,
} from '../server/competitorDrive';
import { rebuildCompetitorStructuredData } from '../server/competitorStructuredData';
import { rebuildMasterCompetitorData } from '../server/competitorMasterData';
import { isClaudeConfigured } from '../server/claudeServer';
import { getClaudeApiKey } from '../server/projectEnv';
import { getNexusDriveConfig, isNexusDriveUploadConfigured } from '../server/nexusGoogleDrive';

const PROJECT_ROOT = process.cwd();
const SECTOR = '전시사업' as const;
const YEARS = [2021, 2022, 2023, 2024];

async function main(): Promise<void> {
  const config = getNexusDriveConfig(PROJECT_ROOT);
  if (!config.enabled) {
    throw new Error('NEXUS Drive config missing');
  }

  if (!isClaudeConfigured(PROJECT_ROOT) && !getClaudeApiKey(PROJECT_ROOT)) {
    throw new Error('Claude API key missing — 재추출 불가');
  }

  for (const year of YEARS) {
    console.log(`\n======== ${year}/${SECTOR} ========`);
    try {
      await syncCompetitorDriveCache(PROJECT_ROOT, year, SECTOR, { force: true });
    } catch (error) {
      console.warn(`[reparse] sync warn ${year}:`, error);
    }

    const cacheDir = getCompetitorCacheDir(config, year, SECTOR);
    const folderId = getCompetitorSyncMeta(PROJECT_ROOT, year, SECTOR)?.folderId;
    console.log(`[reparse] folderId=${folderId ?? '(none)'} → ${cacheDir}`);

    const structured = await rebuildCompetitorStructuredData(
      PROJECT_ROOT,
      year,
      SECTOR,
      cacheDir,
      {
        forceReparse: true,
        runValidation: true,
        uploadToDrive: isNexusDriveUploadConfigured(PROJECT_ROOT),
        folderId,
        claudeApiKey: getClaudeApiKey(PROJECT_ROOT) ?? undefined,
      },
    );

    const companies = structured?.companies ?? [];
    const withRev = companies.filter(
      (c) => typeof c.financials?.revenue === 'number' && (c.financials.revenue ?? 0) > 0,
    ).length;
    const names = companies.map((c) => c.companyName ?? c.companyKey);
    const sciHits = names.filter((n) => /SCI|평가정보|미상|보유내역/i.test(String(n)));
    console.log(
      `[reparse] done ${year}: companies=${names.length}, withRevenue=${withRev}, sciHits=${sciHits.length}`,
    );
    console.log(`[reparse] names: ${names.join(', ')}`);
    if (sciHits.length) {
      console.warn(`[reparse] suspicious names: ${sciHits.join(', ')}`);
    }
  }

  await rebuildMasterCompetitorData(PROJECT_ROOT, { force: true, sectors: [SECTOR] });
  console.log('[reparse] master rebuilt');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
