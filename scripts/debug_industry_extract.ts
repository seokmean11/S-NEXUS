import fs from 'node:fs';
import path from 'node:path';

import { getCompetitorCacheDir } from '../server/competitorDrive';
import {
  extractCreditReportIndustryAnalysis,
  isIndustryAnalysisSourceText,
} from '../server/competitorIndustryAnalysisExtract';
import { buildIndustryAnalysisOverlay } from '../server/competitorIndustryAnalysis';
import { getNexusDriveConfig } from '../server/nexusGoogleDrive';

const root = process.cwd();
const config = getNexusDriveConfig(root);
const cacheDir = getCompetitorCacheDir(config, 2024, '인테리어');

console.log('cacheDir', cacheDir, 'exists', fs.existsSync(cacheDir));

if (!fs.existsSync(cacheDir)) {
  process.exit(1);
}

const pdfs = fs.readdirSync(cacheDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
console.log('pdf count', pdfs.length);

async function readPdf(filePath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  await parser.destroy();
  return textResult.text?.replace(/\r/g, '') ?? '';
}

for (const fileName of pdfs.slice(0, 3)) {
  const text = await readPdf(path.join(cacheDir, fileName));
  console.log('\n===', fileName, '===');

  for (const pat of ['부채비율', '04. 소속', '03. 소속', '소속산업 분석']) {
    let idx = 0;
    let n = 0;
    while (n < 3) {
      const found = text.indexOf(pat, idx);
      if (found < 0) break;
      console.log(`--- ${pat} @${found} ---`);
      console.log(text.slice(found, found + 500).replace(/\n/g, ' | '));
      idx = found + pat.length;
      n += 1;
    }
  }

  const extracted = extractCreditReportIndustryAnalysis(text, 2024);
  console.log('isIndustrySource', isIndustryAnalysisSourceText(text));
}

const built = await buildIndustryAnalysisOverlay(cacheDir, 2024, '인테리어');
console.log('\nbuildIndustryAnalysisOverlay entries:', built?.entries.length ?? 0);
if (built?.entries[0]) {
  console.log('sample entry:', JSON.stringify(built.entries[0], null, 2));
}
