import type { OutsourcingRecord } from '@/types/outsourcing';
import { buildVendorChartData } from '@/utils/outsourcingAnalysis';

const SPEC_KEYWORD_PATTERN = /([가-힣A-Za-z0-9]{2,12}공사)/g;
const TOP_N_PATTERN = /(?:탑|top)\s*(\d+)|상위\s*(\d+)\s*(?:개|곳|사|업체|회사)?/i;

export interface OutsourcingQueryAnalysis {
  filterKeywords: string[];
  topLimit: number;
  matchedRecordCount: number;
  matchedTotalAmount: number;
  topVendorsByAmount: {
    rank: number;
    vendorLabel: string;
    amount: number;
    sharePercent: number;
    contractCount: number;
    projectCount: number;
  }[];
  note: string;
}

function rowAmount(record: OutsourcingRecord): number {
  if (record.totalAmount !== 0) return record.totalAmount;
  return record.materialAmount + record.laborAmount + record.expenseAmount;
}

export function extractOutsourcingFilterKeywords(query?: string): string[] {
  if (!query?.trim()) return [];

  const keywords = new Set<string>();
  for (const match of query.matchAll(SPEC_KEYWORD_PATTERN)) {
    const keyword = match[1]?.trim();
    if (keyword) keywords.add(keyword);
  }

  const trimmed = query.trim();
  const withoutNoise = trimmed
    .replace(/\[분석 범위[^\]]+\]/g, ' ')
    .replace(/(?:탑|top|상위)\s*\d+/gi, ' ')
    .replace(/(?:금액|건수|횟수)\s*기준/g, ' ')
    .replace(/우리\s*회사/g, ' ')
    .replace(/어디|회사|업체|협력사|탑|상위|기준|분석|알려|줘|주세요/g, ' ')
    .trim();

  if (trimmed.includes('금속') && !keywords.has('금속공사')) {
    keywords.add('금속');
  }

  for (const token of withoutNoise.split(/[\s,·+/&]+/)) {
    const word = token.trim();
    if (word.length < 2) continue;
    if (/^\d+$/.test(word)) continue;
    if (/^(기준|회사|업체|탑|상위|금액|건수|횟수|분석|어디|우리)$/i.test(word)) continue;
    keywords.add(word);
  }

  return [...keywords];
}

export function extractOutsourcingTopLimit(query?: string): number {
  if (!query?.trim()) return 5;
  const match = query.match(TOP_N_PATTERN);
  if (!match) return 5;
  const parsed = Number(match[1] ?? match[2]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(parsed, 20);
}

function recordMatchesKeywords(record: OutsourcingRecord, keywords: string[]): boolean {
  if (keywords.length === 0) return false;

  const haystack = [record.spec, record.budget, record.contract, record.unit, record.division]
    .join(' ')
    .toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function buildOutsourcingQueryAnalysis(
  records: OutsourcingRecord[],
  query?: string,
): OutsourcingQueryAnalysis | null {
  const filterKeywords = extractOutsourcingFilterKeywords(query);
  if (filterKeywords.length === 0) return null;

  const topLimit = extractOutsourcingTopLimit(query);
  const matchedRecords = records.filter((record) => recordMatchesKeywords(record, filterKeywords));
  const matchedTotalAmount = matchedRecords.reduce((sum, record) => sum + rowAmount(record), 0);
  const topVendorsByAmount = buildVendorChartData(matchedRecords)
    .slice(0, topLimit)
    .map((vendor, index) => ({
      rank: index + 1,
      vendorLabel: vendor.vendorLabel,
      amount: vendor.amount,
      sharePercent: vendor.sharePercent,
      contractCount: vendor.contractCount,
      projectCount: vendor.projectCount,
    }));

  return {
    filterKeywords,
    topLimit,
    matchedRecordCount: matchedRecords.length,
    matchedTotalAmount,
    topVendorsByAmount,
    note:
      matchedRecords.length > 0
        ? `규격/예산/계약 필드에서 "${filterKeywords.join(', ')}" 키워드로 필터 후 금액 상위 ${topLimit}개 업체를 앱에서 선집계했습니다.`
        : `키워드 "${filterKeywords.join(', ')}"에 매칭되는 외주 레코드가 없습니다.`,
  };
}
