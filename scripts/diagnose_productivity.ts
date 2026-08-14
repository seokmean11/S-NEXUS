/**
 * 생산성 분석 미표시 원인 진단 — competitor-data.json 등 기존 데이터는 읽기만
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCompetitorPeriodAnalysis } from '../server/competitorAnalysisPeriod';
import {
  buildExecutiveFromMultiYear,
  buildProductivityChartData,
  buildProductivityRevenueRanking,
  resolveProductivityAnalysisYear,
} from '../src/utils/competitorExecutiveDashboard';
import { countProductivityOverlayEntries } from '../src/utils/competitorProductivityOverlayClient';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sector = (process.argv.find((a) => a.startsWith('--sector='))?.split('=')[1] ??
  '인테리어') as '인테리어' | '전시사업';
const fromYear = Number(process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] ?? 2022);
const toYear = Number(process.argv.find((a) => a.startsWith('--to='))?.split('=')[1] ?? 2024);

console.log('=== Productivity Diagnostics ===');
console.log(`sector=${sector} period=${fromYear}-${toYear}`);

const result = await runCompetitorPeriodAnalysis(root, sector, fromYear, toYear, {
  force: false,
  uploadConfigured: false,
});

const executive = result.executive;
const overlayCount = countProductivityOverlayEntries(executive);
const productivityYear = resolveProductivityAnalysisYear(executive);
const ranking = buildProductivityRevenueRanking(executive);
const productivity = buildProductivityChartData(executive, ranking);
const ready = productivity.filter((item) => item.hasProductivityData);
const dashboard = buildExecutiveFromMultiYear(executive);

console.log('\n[1] Period analysis');
console.log('  effectiveToYear:', executive.effectiveToYear);
console.log('  requestedToYear:', executive.requestedToYear);
console.log('  records (base):', executive.records.length);
console.log('  recordsByYear keys:', Object.keys(executive.recordsByYear).join(', '));

console.log('\n[2] Productivity overlay (separate from competitor-data.json)');
console.log('  productivityEmployeesByYear keys:', Object.keys(executive.productivityEmployeesByYear ?? {}).join(', ') || '(none)');
console.log('  overlay entry count:', overlayCount);

console.log('\n[3] Productivity year & ranking');
console.log('  productivityYear:', productivityYear);
console.log('  year records:', (executive.recordsByYear[String(productivityYear)] ?? []).length);
console.log('  productivity ranking:', ranking.length);

console.log('\n[4] Chart readiness');
console.log('  ready:', ready.length, '/', productivity.length);
console.log('  dashboard productivity items:', dashboard.productivity.length);
console.log('  dashboard ready:', dashboard.productivity.filter((i) => i.hasProductivityData).length);

if (ready.length === 0 && productivity.length > 0) {
  console.log('\n[5] Failure details (first 10 companies)');
  for (const item of productivity.slice(0, 10)) {
    const record = (executive.recordsByYear[String(productivityYear)] ?? []).find(
      (r) => r.company_name.includes(item.companyName.slice(0, 3)),
    );
    console.log(
      `  ${item.rank}. ${item.companyName} key=${item.companyKey} employees=${item.avgEmployees ?? 'null'} revenuePerEmp=${item.revenuePerEmployeeEok ?? 'null'} source=${item.employeesSource ?? 'null'} hasData=${item.hasProductivityData}`,
    );
    if (record) {
      console.log(`     record revenue=${record.financials.revenue} biz_no=${record.biz_no}`);
    }
  }
}

if (overlayCount === 0) {
  console.log('\n[!] ROOT CAUSE: productivity-employees overlay is empty');
  console.log('    Check: .data/nexus-drive/경쟁사분석/{year}/{sector}/*.pdf with 신용분석 in filename');
}

if (ready.length > 0) {
  console.log('\n[OK] Server-side productivity data is available');
  for (const item of ready.slice(0, 3)) {
    console.log(`  ${item.rank}. ${item.companyName}: ${item.revenuePerEmployeeEok}억/인 (${item.avgEmployees}명)`);
  }
}
