import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import type { OutsourcingFilterKey, OutsourcingRecord } from '@/types/outsourcing';
import { OUTSOURCING_FILTER_LABELS } from '@/types/outsourcing';
import { formatCurrency } from '@/data/mockData';
import type { ExportTable } from '@/utils/reportExport';
import { isPersonLookupQuery } from '@/utils/analysisPersonLookup';
import {
  buildOutsourcingSearchInterpretationLines,
  buildOutsourcingUnitPriceResultLines,
  executeOutsourcingVirtualSearch,
} from '@/utils/analysisOutsourcingSearchInterpreter';
import {
  buildVendorChartData,
  excludeProvisionalBudgetRecords,
  formatOutsourcingAmount,
} from '@/utils/outsourcingAnalysis';
import { isOutsourcingDateRangeReady } from '@/utils/outsourcingDate';

export const OUTSOURCING_ANALYTICS_QUERY_PATTERN =
  /외주|업체|vendor|outsourc|협력사|하도급|금속|목공|전기|설비|공종|규격|탑\s*\d|상위\s*\d|\btop\s*\d|공사|단가|자재|석고|보드|경량|내역|품목|실행단가|계약단가|외주단가/i;

export const OUTSOURCING_UNIT_PRICE_QUERY_PATTERN =
  /단가|단가표|견적단가|자재단가|노무단가|경비단가|실행단가|계약단가|외주단가|unit\s*price/i;

const MATERIAL_QUERY_STOPWORDS = new Set([
  '최근',
  '개월',
  '년',
  '년간',
  '단가',
  '단가좀',
  '단가표',
  '알려',
  '줘',
  '주세요',
  '기간',
  '현황',
  '분석',
  '조회',
  '알려줘',
  '어떻게',
  '되니',
  '되나',
  '되나요',
  '어떤',
  '무엇',
  '뭐',
  '누구',
  '누구야',
]);

const PERSON_QUERY_EXCLUSION_PATTERN =
  /누구|누군|누구야|누구니|누군지|정보\s*알|소속|연락|직급|직책|who\s*is|profile/i;

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
    .replace(/최근\s*\d+\s*개?\s*월/g, ' ')
    .replace(
      /(?:단가|단가표|견적단가|자재단가|노무단가|경비단가|실행단가|계약단가|외주단가)(?:좀|을|를|이|가)?/gi,
      ' ',
    )
    .replace(/우리\s*회사/g, ' ')
    .replace(
      /(?:어디|회사|업체|협력사|탑|상위|기준|분석|알려|줘|주세요|최근|개월|년간|년|어떻게|되니|되나|되나요|어떤|무엇|뭐|누구|누구야)/g,
      ' ',
    )
    .trim();

  if (trimmed.includes('금속') && !keywords.has('금속공사')) {
    keywords.add('금속');
  }

  for (const token of withoutNoise.split(/[\s,·+/&]+/)) {
    const word = token
      .trim()
      .replace(/[?？!.。,]/g, '')
      .replace(/(이|가|은|는|을|를|의|야|이야|님|씨)$/g, '');
    if (word.length < 2) continue;
    if (/^\d+$/.test(word)) continue;
    if (/^(기준|회사|업체|탑|상위|금액|건수|횟수|분석|어디|우리)$/i.test(word)) continue;
    keywords.add(word);
  }

  return [...keywords];
}

export function filterMaterialSearchKeywords(keywords: string[]): string[] {
  return keywords.filter((keyword) => {
    const normalized = keyword.trim();
    if (normalized.length < 2) return false;
    if (/^\d+$/.test(normalized)) return false;
    if (/^\d+개월$/.test(normalized)) return false;
    return !MATERIAL_QUERY_STOPWORDS.has(normalized);
  });
}

export function isOutsourcingAnalyticsQuery(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) return false;
  if (PERSON_QUERY_EXCLUSION_PATTERN.test(normalized)) return false;
  if (OUTSOURCING_ANALYTICS_QUERY_PATTERN.test(normalized)) return true;
  return filterMaterialSearchKeywords(extractOutsourcingFilterKeywords(normalized)).length > 0;
}

export function isOutsourcingUnitPriceQuery(query: string): boolean {
  return OUTSOURCING_UNIT_PRICE_QUERY_PATTERN.test(query.trim());
}

export function parseRecentMonthRange(
  query: string,
): { startMs: number; endMs: number; label: string } | null {
  const monthMatch = query.match(/최근\s*(\d+)\s*개?\s*월/);
  if (!monthMatch) return null;

  const months = Number(monthMatch[1]);
  if (!Number.isFinite(months) || months <= 0) return null;

  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: `최근 ${months}개월`,
  };
}

function countSearchableOutsourcingRecords(records: OutsourcingRecord[]): number {
  return excludeProvisionalBudgetRecords(records).length;
}

function buildOutsourcingEmptySearchHint(
  records: OutsourcingRecord[],
  query: string,
  interpretation: ReturnType<typeof executeOutsourcingVirtualSearch>['interpretation'],
  totalBeforeTextFilter: number,
): string[] {
  const hints: string[] = [];
  if (!isOutsourcingDateRangeReady(interpretation.dateRange)) return hints;

  if (totalBeforeTextFilter > 0) {
    hints.push(
      `- 선택한 기간(${interpretation.dateRangeLabel}) 안에서는 **${totalBeforeTextFilter.toLocaleString('ko-KR')}건**이 구조 필터까지 통과했지만, 텍스트 검색 조건과 일치하는 항목은 없습니다.`,
    );
    return hints;
  }

  const keywordOnlySearch = executeOutsourcingVirtualSearch(
    records,
    query.replace(
      /최근\s*\d+\s*개?\s*월|최근\s*\d+\s*년|20\d{2}\s*년|올해|금년|당해|작년|전년|상반기|하반기|1\s*~?\s*6\s*월|7\s*~?\s*12\s*월/g,
      ' ',
    ),
  );
  if (keywordOnlySearch.matchedRecords.length > 0) {
    hints.push(
      `- 기간 필터를 제외하면 **${keywordOnlySearch.matchedRecords.length.toLocaleString('ko-KR')}건**이 텍스트 검색에 매칭됩니다.`,
    );
  }

  return hints;
}

export function extractOutsourcingTopLimit(query?: string): number {
  if (!query?.trim()) return 5;
  const match = query.match(TOP_N_PATTERN);
  if (!match) return 5;
  const parsed = Number(match[1] ?? match[2]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(parsed, 20);
}


export function buildOutsourcingQueryAnalysis(
  records: OutsourcingRecord[],
  query?: string,
): OutsourcingQueryAnalysis | null {
  if (!query?.trim()) return null;
  const filterKeywords = extractOutsourcingFilterKeywords(query);
  if (filterKeywords.length === 0) return null;

  const search = executeOutsourcingVirtualSearch(records, query);
  const { analysisRecords, interpretation } = search;
  const topLimit = extractOutsourcingTopLimit(query);
  const matchedTotalAmount = analysisRecords.reduce((sum, record) => sum + rowAmount(record), 0);
  const topVendorsByAmount = buildVendorChartData(analysisRecords)
    .slice(0, topLimit)
    .map((vendor, index) => ({
      rank: index + 1,
      vendorLabel: vendor.vendorLabel,
      amount: vendor.amount,
      sharePercent: vendor.sharePercent,
      contractCount: vendor.contractCount,
      projectCount: vendor.projectCount,
    }));

  const keywordLabel = interpretation.textKeywords.join(', ') || filterKeywords.join(', ');
  const primaryFieldLabel = interpretation.primaryAnalysisField
    ? OUTSOURCING_FILTER_LABELS[interpretation.primaryAnalysisField]
    : null;
  const note =
    analysisRecords.length > 0
      ? `외주정보검색 로직으로 ${interpretation.dateRangeLabel} · ${keywordLabel} 조건을 해석했습니다.${primaryFieldLabel ? ` 분석은 ${primaryFieldLabel} 매칭 ${analysisRecords.length}건 기준입니다.` : ''} 금액 상위 ${topLimit}개 업체를 집계했습니다.`
      : `외주정보검색 로직으로 ${interpretation.dateRangeLabel} · ${keywordLabel} 조건을 해석했지만 매칭 레코드가 없습니다.`;

  return {
    filterKeywords,
    topLimit,
    matchedRecordCount: analysisRecords.length,
    matchedTotalAmount,
    topVendorsByAmount,
    note,
  };
}

function buildOutsourcingAnalysisDetailTable(
  records: OutsourcingRecord[],
  primaryField: OutsourcingFilterKey | null,
): ExportTable {
  const primaryHeaders =
    primaryField === 'budget'
      ? ['실행예산명', '규격내역']
      : primaryField === 'contract'
        ? ['외주계약명', '실행예산명', '규격내역']
        : primaryField === 'unit'
          ? ['단위', '실행예산명', '규격내역']
          : ['규격내역', '실행예산명'];

  const headers = [
    ...primaryHeaders,
    '외주단가',
    '자재단가',
    '노무단가',
    '경비단가',
    '수량',
    '외주금액',
    '업체',
    '계약일',
  ];

  const rows = records.slice(0, 25).map((record) => {
    const base = [
      formatOutsourcingAmount(record.outsourcingUnitPrice),
      formatOutsourcingAmount(record.materialUnitPrice),
      formatOutsourcingAmount(record.laborUnitPrice),
      formatOutsourcingAmount(record.expenseUnitPrice),
      String(record.outsourcingQty || '-'),
      formatOutsourcingAmount(rowAmount(record)),
      record.vendorLabel || record.vendor || '-',
      record.contractDate || '-',
    ];

    if (primaryField === 'budget') {
      return [record.budget || '-', record.spec || '-', ...base];
    }
    if (primaryField === 'contract') {
      return [record.contract || '-', record.budget || '-', record.spec || '-', ...base];
    }
    if (primaryField === 'unit') {
      return [record.unit || '-', record.budget || '-', record.spec || '-', ...base];
    }
    return [record.spec || '-', record.budget || '-', ...base];
  });

  return { headers, rows };
}

/** 외주 DB에서 품목·규격 키워드 + 기간 필터 후 단가 KPI·내역 조회 */
export function buildOutsourcingUnitPriceResponse(
  records: OutsourcingRecord[],
  query?: string,
): ChatbotResponse | null {
  if (!query?.trim()) return null;
  if (!isOutsourcingUnitPriceQuery(query) && !isOutsourcingAnalyticsQuery(query)) return null;

  const search = executeOutsourcingVirtualSearch(records, query);
  const { matchedRecords, analysisRecords, interpretation, totalBeforeTextFilter } = search;
  const totalSearchableRecords = countSearchableOutsourcingRecords(records);

  if (interpretation.textKeywords.length === 0) {
    if (!isOutsourcingUnitPriceQuery(query)) return null;
    return {
      text: '조회할 **품목·규격 키워드**를 함께 적어 주세요. 예: 「석고보드 최근 6개월 단가 알려줘」',
    };
  }

  const keywordLabel = interpretation.textKeywords.join(', ');

  if (matchedRecords.length === 0) {
    const lines = [
      `**${keywordLabel}** 외주 단가를 외주정보검색 로직으로 해석했지만, 조건에 맞는 레코드를 찾지 못했습니다.`,
      '',
      ...buildOutsourcingSearchInterpretationLines(
        interpretation,
        0,
        totalSearchableRecords,
      ),
      ...buildOutsourcingEmptySearchHint(records, query, interpretation, totalBeforeTextFilter),
      '',
      '키워드·기간을 조정하거나, 외주 DB 동기화 상태를 확인해 주세요.',
    ];
    return { text: lines.join('\n') };
  }

  const primaryFieldLabel = interpretation.primaryAnalysisField
    ? OUTSOURCING_FILTER_LABELS[interpretation.primaryAnalysisField]
    : null;
  const table = buildOutsourcingAnalysisDetailTable(analysisRecords, interpretation.primaryAnalysisField);

  const summary = `${keywordLabel} · ${interpretation.dateRangeLabel} · 검색 ${matchedRecords.length}건 · 분석 ${analysisRecords.length}건`;
  const lines = [
    `**${keywordLabel}** 외주 단가를 외주정보검색 로직으로 조회했습니다.${primaryFieldLabel ? ` 분석은 **${primaryFieldLabel}** 매칭 행 기준입니다.` : ''}`,
    '',
    ...buildOutsourcingSearchInterpretationLines(
      interpretation,
      matchedRecords.length,
      totalSearchableRecords,
      analysisRecords.length,
    ),
    '',
    ...buildOutsourcingUnitPriceResultLines(analysisRecords),
  ];

  if (analysisRecords.length > 25) {
    lines.push('', `- 상세 내역 ${analysisRecords.length}건 중 상위 25건만 표에 표시했습니다.`);
  }

  return {
    text: lines.join('\n'),
    table,
    exports: [
      {
        id: 'outsourcing-unit-price-csv',
        label: '엑셀(CSV) 다운로드',
        format: 'csv',
        filename: `외주단가_${interpretation.textKeywords.join('_')}.csv`,
        title: `외주단가_${keywordLabel}`,
        table,
        summary,
      },
      {
        id: 'outsourcing-unit-price-word',
        label: '워드 보고서 다운로드',
        format: 'word',
        filename: `외주단가_${interpretation.textKeywords.join('_')}.doc`,
        title: `외주단가_${keywordLabel}`,
        table,
        summary,
      },
    ],
  };
}

function formatChatAmount(value?: number): string {
  if (value == null || value <= 0) return '-';
  return `${formatCurrency(value)}원`;
}

function buildOutsourcingVendorRankingResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  const analysis = buildOutsourcingQueryAnalysis(ctx.outsourcingRecords, query);
  if (!analysis) return null;

  const search = executeOutsourcingVirtualSearch(ctx.outsourcingRecords, query);
  const totalSearchableRecords = countSearchableOutsourcingRecords(ctx.outsourcingRecords);
  const interpretationLines = buildOutsourcingSearchInterpretationLines(
    search.interpretation,
    search.matchedRecords.length,
    totalSearchableRecords,
    search.analysisRecords.length,
  );

  const table: ExportTable = {
    headers: ['순위', '업체', '금액', '비중(%)', '계약건수', '프로젝트수'],
    rows: analysis.topVendorsByAmount.map((vendor) => [
      String(vendor.rank),
      vendor.vendorLabel,
      formatChatAmount(vendor.amount),
      `${vendor.sharePercent.toFixed(1)}%`,
      String(vendor.contractCount),
      String(vendor.projectCount),
    ]),
  };

  const summary = `외주 ${analysis.matchedRecordCount}건 · 합계 ${formatChatAmount(analysis.matchedTotalAmount)}`;
  const title = `외주_${analysis.filterKeywords.join('_')}_상위${analysis.topLimit}`;

  if (table.rows.length === 0) {
    return {
      text: [
        analysis.note,
        '',
        ...interpretationLines,
        '',
        '조건에 맞는 외주 데이터가 없습니다.',
      ].join('\n'),
    };
  }

  return {
    text: [
      analysis.note,
      '',
      ...interpretationLines,
      '',
      `${summary} 기준 상위 업체를 정리했습니다.`,
    ].join('\n'),
    table,
    exports: [
      {
        id: 'outsourcing-vendors-csv',
        label: '엑셀(CSV) 다운로드',
        format: 'csv',
        filename: `${title}.csv`,
        title,
        table,
        summary,
      },
      {
        id: 'outsourcing-vendors-word',
        label: '워드 보고서 다운로드',
        format: 'word',
        filename: `${title}.doc`,
        title,
        table,
        summary,
      },
    ],
  };
}

/** 외주정보검색 메뉴 로컬 집계 */
export function resolveOutsourcingLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (isPersonLookupQuery(query)) return null;
  if (!isOutsourcingAnalyticsQuery(query)) return null;

  const prefersVendorRanking =
    /업체|vendor|협력사|하도급|탑\s*\d|상위\s*\d|\btop\s*\d/i.test(query) &&
    !isOutsourcingUnitPriceQuery(query);

  if (!prefersVendorRanking) {
    const unitPriceResponse = buildOutsourcingUnitPriceResponse(ctx.outsourcingRecords, query);
    if (unitPriceResponse) return unitPriceResponse;
  }

  return buildOutsourcingVendorRankingResponse(ctx, query);
}
