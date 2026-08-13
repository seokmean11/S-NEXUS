import type {
  OutsourcingDateRange,
  OutsourcingFilterKey,
  OutsourcingFilters,
  OutsourcingRecord,
} from '@/types/outsourcing';
import {
  createEmptyOutsourcingFilters,
  OUTSOURCING_FILTER_LABELS,
} from '@/types/outsourcing';
import {
  buildVendorChartData,
  excludeProvisionalBudgetRecords,
  filterOutsourcingRecords,
  formatOutsourcingAmount,
  formatUnitPriceDetail,
  summarizeOutsourcingKpi,
} from '@/utils/outsourcingAnalysis';
import {
  formatMaskedDateRangeDisplay,
  isOutsourcingDateRangeReady,
} from '@/utils/outsourcingDate';
import {
  extractOutsourcingFilterKeywords,
  filterMaterialSearchKeywords,
} from '@/utils/analysisOutsourcingPayload';

const TEXT_SEARCH_FIELDS: OutsourcingFilterKey[] = ['budget', 'spec', 'contract', 'unit'];

const QUERY_NOISE =
  /\[분석 범위[^\]]+\]|\[로컬 데이터 범위:[^\]]+\]|(?:탑|top|상위)\s*\d+/gi;

export interface OutsourcingSearchInterpretation {
  dateRangeLabel: string;
  dateRange: OutsourcingDateRange;
  textKeywords: string[];
  textSearchFields: OutsourcingFilterKey[];
  primaryAnalysisField: OutsourcingFilterKey | null;
  fieldMatchCounts: Partial<Record<OutsourcingFilterKey, number>>;
  structuredFilters: Partial<Record<OutsourcingFilterKey, string>>;
  excludedProvisionalBudget: boolean;
}

export interface OutsourcingVirtualSearchResult {
  /** 기간·구조 필터 후 전체 컬럼 OR 텍스트 검색 결과 */
  matchedRecords: OutsourcingRecord[];
  /** 컬럼별 매칭 건수 최다 컬럼 기준 분석 대상 */
  analysisRecords: OutsourcingRecord[];
  interpretation: OutsourcingSearchInterpretation;
  totalBeforeTextFilter: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateDigits(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** 질문에서 외주정보검색 메뉴와 동일한 외주계약일 범위를 해석 */
export function parseOutsourcingDateRangeFromQuery(query: string): {
  dateRange: OutsourcingDateRange;
  label: string;
} {
  const normalized = query.replace(QUERY_NOISE, ' ').trim();
  const now = new Date();
  const end = endOfDay(now);

  const recentMonthMatch = normalized.match(/최근\s*(\d+)\s*개?\s*월/);
  if (recentMonthMatch) {
    const months = Number(recentMonthMatch[1]);
    const start = startOfDay(new Date(end));
    start.setMonth(start.getMonth() - months);
    const dateRange = { startDigits: toDateDigits(start), endDigits: toDateDigits(end) };
    return {
      dateRange,
      label: `최근 ${months}개월 (${formatMaskedDateRangeDisplay(dateRange.startDigits, dateRange.endDigits)})`,
    };
  }

  const recentYearMatch = normalized.match(/최근\s*(\d+)\s*년/);
  if (recentYearMatch) {
    const years = Number(recentYearMatch[1]);
    const start = startOfDay(new Date(end));
    start.setFullYear(start.getFullYear() - years);
    const dateRange = { startDigits: toDateDigits(start), endDigits: toDateDigits(end) };
    return {
      dateRange,
      label: `최근 ${years}년 (${formatMaskedDateRangeDisplay(dateRange.startDigits, dateRange.endDigits)})`,
    };
  }

  const yearMatch = normalized.match(/(20\d{2})\s*년/);
  const year = yearMatch
    ? Number(yearMatch[1])
    : /올해|금년|당해/.test(normalized)
      ? now.getFullYear()
      : /작년|전년/.test(normalized)
        ? now.getFullYear() - 1
        : null;

  if (year) {
    const half = /상반기|1\s*~?\s*6\s*월|1-6월/.test(normalized)
      ? 'first'
      : /하반기|7\s*~?\s*12\s*월|7-12월/.test(normalized)
        ? 'second'
        : 'all';

    const start =
      half === 'second'
        ? new Date(year, 6, 1)
        : new Date(year, 0, 1);
    const endDate =
      half === 'first'
        ? endOfDay(new Date(year, 5, 30))
        : half === 'second'
          ? endOfDay(new Date(year, 11, 31))
          : endOfDay(new Date(year, 11, 31));

    const dateRange = { startDigits: toDateDigits(start), endDigits: toDateDigits(endDate) };
    const halfLabel =
      half === 'first' ? '상반기' : half === 'second' ? '하반기' : '연간';
    return {
      dateRange,
      label: `${year}년 ${halfLabel} (${formatMaskedDateRangeDisplay(dateRange.startDigits, dateRange.endDigits)})`,
    };
  }

  return {
    dateRange: { startDigits: '', endDigits: '' },
    label: '전체 기간 (외주계약일 필터 없음)',
  };
}

function parseStructuredOutsourcingFilters(query: string): Partial<Record<OutsourcingFilterKey, string>> {
  const structured: Partial<Record<OutsourcingFilterKey, string>> = {};

  const divisionMatch = query.match(
    /(전시사업본부|뉴미디어사업실|해외사업실|인테리어사업부|건축사업본부|인프라사업본부|스마트시티사업본부)/,
  );
  if (divisionMatch?.[1]) structured.division = divisionMatch[1];

  const vendorMatch = query.match(/(?:업체|협력사|vendor)\s*[:：]?\s*([가-힣A-Za-z0-9()（）\s]{2,24})/i);
  if (vendorMatch?.[1]) structured.vendor = vendorMatch[1].trim();

  return structured;
}

function applyStructuredFilters(
  base: OutsourcingFilters,
  structured: Partial<Record<OutsourcingFilterKey, string>>,
): OutsourcingFilters {
  const next = { ...base };
  for (const [key, keyword] of Object.entries(structured) as [OutsourcingFilterKey, string][]) {
    next[key] = { keyword, selected: [] };
  }
  return next;
}

function getRecordFieldText(record: OutsourcingRecord, field: OutsourcingFilterKey): string {
  if (field === 'vendor') return record.vendor || record.vendorLabel || '';
  return record[field] || '';
}

function recordMatchesTextKeywordsInField(
  record: OutsourcingRecord,
  keywords: string[],
  field: OutsourcingFilterKey,
): boolean {
  const haystack = getRecordFieldText(record, field).toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function recordMatchesTextKeywords(
  record: OutsourcingRecord,
  keywords: string[],
  fields: OutsourcingFilterKey[],
): boolean {
  return fields.some((field) => recordMatchesTextKeywordsInField(record, keywords, field));
}

function countFieldMatches(
  records: OutsourcingRecord[],
  keywords: string[],
  field: OutsourcingFilterKey,
): number {
  return records.filter((record) => recordMatchesTextKeywordsInField(record, keywords, field)).length;
}

function resolvePrimaryAnalysisField(
  records: OutsourcingRecord[],
  keywords: string[],
): {
  primaryField: OutsourcingFilterKey | null;
  fieldMatchCounts: Partial<Record<OutsourcingFilterKey, number>>;
} {
  const fieldMatchCounts: Partial<Record<OutsourcingFilterKey, number>> = {};

  for (const field of TEXT_SEARCH_FIELDS) {
    const count = countFieldMatches(records, keywords, field);
    if (count > 0) fieldMatchCounts[field] = count;
  }

  let primaryField: OutsourcingFilterKey | null = null;
  let maxCount = 0;
  for (const field of TEXT_SEARCH_FIELDS) {
    const count = fieldMatchCounts[field] ?? 0;
    if (count > maxCount) {
      maxCount = count;
      primaryField = field;
    }
  }

  return { primaryField, fieldMatchCounts };
}

function resolveTextSearch(
  records: OutsourcingRecord[],
  keywords: string[],
): {
  matchedRecords: OutsourcingRecord[];
  analysisRecords: OutsourcingRecord[];
  primaryAnalysisField: OutsourcingFilterKey | null;
  fieldMatchCounts: Partial<Record<OutsourcingFilterKey, number>>;
} {
  if (keywords.length === 0) {
    return {
      matchedRecords: records,
      analysisRecords: records,
      primaryAnalysisField: null,
      fieldMatchCounts: {},
    };
  }

  const matchedRecords = records.filter((record) =>
    recordMatchesTextKeywords(record, keywords, TEXT_SEARCH_FIELDS),
  );
  const { primaryField, fieldMatchCounts } = resolvePrimaryAnalysisField(matchedRecords, keywords);
  const analysisRecords = primaryField
    ? matchedRecords.filter((record) =>
        recordMatchesTextKeywordsInField(record, keywords, primaryField),
      )
    : matchedRecords;

  return {
    matchedRecords,
    analysisRecords,
    primaryAnalysisField: primaryField,
    fieldMatchCounts,
  };
}

function computeOutsourcingUnitPriceStats(records: OutsourcingRecord[]) {
  const unitPrices = records
    .map((record) => record.outsourcingUnitPrice)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (unitPrices.length === 0) {
    return { average: 0, max: 0, min: 0, quantity: 0 };
  }
  const quantity = records.reduce((sum, record) => sum + (record.outsourcingQty || 0), 0);
  const amountTotal = records.reduce((sum, record) => sum + (record.totalAmount || 0), 0);
  return {
    average: quantity > 0 ? amountTotal / quantity : 0,
    max: Math.max(...unitPrices),
    min: Math.min(...unitPrices),
    quantity,
  };
}

/** 외주정보검색 메뉴 로직으로 질문을 해석해 가상 검색 */
export function executeOutsourcingVirtualSearch(
  records: OutsourcingRecord[],
  query: string,
): OutsourcingVirtualSearchResult {
  const cleanedQuery = query.replace(QUERY_NOISE, ' ').trim();
  const { dateRange, label: dateRangeLabel } = parseOutsourcingDateRangeFromQuery(cleanedQuery);
  const textKeywords = filterMaterialSearchKeywords(extractOutsourcingFilterKeywords(cleanedQuery));
  const structuredFilters = parseStructuredOutsourcingFilters(cleanedQuery);

  let filters = applyStructuredFilters(createEmptyOutsourcingFilters(), structuredFilters);

  const searchableRecords = excludeProvisionalBudgetRecords(records);
  let matchedRecords = filterOutsourcingRecords(searchableRecords, filters, { dateRange });
  const totalBeforeTextFilter = matchedRecords.length;

  if (textKeywords.length > 0) {
    const textResolved = resolveTextSearch(matchedRecords, textKeywords);
    return {
      matchedRecords: textResolved.matchedRecords,
      analysisRecords: textResolved.analysisRecords,
      totalBeforeTextFilter,
      interpretation: {
        dateRangeLabel,
        dateRange,
        textKeywords,
        textSearchFields: TEXT_SEARCH_FIELDS,
        primaryAnalysisField: textResolved.primaryAnalysisField,
        fieldMatchCounts: textResolved.fieldMatchCounts,
        structuredFilters,
        excludedProvisionalBudget: true,
      },
    };
  }

  return {
    matchedRecords,
    analysisRecords: matchedRecords,
    totalBeforeTextFilter,
    interpretation: {
      dateRangeLabel,
      dateRange,
      textKeywords,
      textSearchFields: TEXT_SEARCH_FIELDS,
      primaryAnalysisField: null,
      fieldMatchCounts: {},
      structuredFilters,
      excludedProvisionalBudget: true,
    },
  };
}

export function buildOutsourcingSearchInterpretationLines(
  interpretation: OutsourcingSearchInterpretation,
  matchedCount: number,
  totalRecords: number,
  analysisCount?: number,
): string[] {
  const lines = [
    '### 검색 조건 (외주정보검색 로직)',
    `- **기간**: ${interpretation.dateRangeLabel}${isOutsourcingDateRangeReady(interpretation.dateRange) ? ' · 외주계약일 기준' : ''}`,
  ];

  if (interpretation.textKeywords.length > 0) {
    const fieldLabels = interpretation.textSearchFields
      .map((field) => OUTSOURCING_FILTER_LABELS[field])
      .join(' · ');
    lines.push(
      `- **전체 텍스트 검색**: ${fieldLabels}에서 「${interpretation.textKeywords.join(' · ')}」 포함 (OR)`,
    );

    const countSummary = TEXT_SEARCH_FIELDS.filter(
      (field) => (interpretation.fieldMatchCounts[field] ?? 0) > 0,
    )
      .map(
        (field) =>
          `${OUTSOURCING_FILTER_LABELS[field]} ${(interpretation.fieldMatchCounts[field] ?? 0).toLocaleString('ko-KR')}건`,
      )
      .join(' · ');
    if (countSummary) {
      lines.push(`- **컬럼별 매칭**: ${countSummary}`);
    }

    if (interpretation.primaryAnalysisField) {
      lines.push(
        `- **분석 기준 컬럼**: ${OUTSOURCING_FILTER_LABELS[interpretation.primaryAnalysisField]} (${(interpretation.fieldMatchCounts[interpretation.primaryAnalysisField] ?? 0).toLocaleString('ko-KR')}건 · 매칭 최다)`,
      );
    }
  }

  for (const [field, keyword] of Object.entries(interpretation.structuredFilters) as [
    OutsourcingFilterKey,
    string,
  ][]) {
    lines.push(`- **${OUTSOURCING_FILTER_LABELS[field]}**: 「${keyword}」`);
  }

  if (interpretation.excludedProvisionalBudget) {
    lines.push('- **제외**: 가편성예산 (메뉴 기본 검색과 동일)');
  }

  lines.push(
    `- **검색 결과**: ${matchedCount.toLocaleString('ko-KR')}건 / 전체 ${totalRecords.toLocaleString('ko-KR')}건`,
  );

  if (analysisCount != null && analysisCount !== matchedCount) {
    lines.push(
      `- **분석 대상**: ${analysisCount.toLocaleString('ko-KR')}건 (분석 기준 컬럼 매칭 행만 집계)`,
    );
  }

  return lines;
}

export function buildOutsourcingTopVendorLines(
  records: OutsourcingRecord[],
  limit = 5,
): string[] {
  const vendors = buildVendorChartData(records).slice(0, limit);
  if (vendors.length === 0) return [];

  return [
    `### Top ${Math.min(limit, vendors.length)} 업체 (검색 결과 외주금액 기준)`,
    ...vendors.map(
      (vendor, index) =>
        `${index + 1}. **${vendor.vendorLabel}** · ${formatOutsourcingAmount(vendor.amount)}원 (${vendor.sharePercent.toFixed(1)}%) · 계약 ${vendor.contractCount}건 · 프로젝트 ${vendor.projectCount}개`,
    ),
  ];
}

export function buildOutsourcingUnitPriceResultLines(
  records: OutsourcingRecord[],
): string[] {
  const kpi = summarizeOutsourcingKpi(records);
  const outsourcingUnitPrice = computeOutsourcingUnitPriceStats(records);

  return [
    '### 단가 결과 (검색 결과 집계)',
    `- **외주단가** 평균 ${formatOutsourcingAmount(outsourcingUnitPrice.average)}원 ${formatUnitPriceDetail(outsourcingUnitPrice)}`,
    `- **자재단가** 평균 ${formatOutsourcingAmount(kpi.materialUnitPrice.average)}원 ${formatUnitPriceDetail(kpi.materialUnitPrice)}`,
    `- **노무단가** 평균 ${formatOutsourcingAmount(kpi.laborUnitPrice.average)}원 ${formatUnitPriceDetail(kpi.laborUnitPrice)}`,
    `- **경비단가** 평균 ${formatOutsourcingAmount(kpi.expenseUnitPrice.average)}원 ${formatUnitPriceDetail(kpi.expenseUnitPrice)}`,
    `- **외주금액 합계** ${formatOutsourcingAmount(kpi.totalAmount)}원`,
    '',
    ...buildOutsourcingTopVendorLines(records),
  ];
}
