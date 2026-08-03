import { formatWon } from '@/utils/bidQuotationAnalysis';

const DEVIATION_RATIO = 0.1;
const KEY_ITEM_RATIO = 0.1;
/** 공과잡비율(%) — 타사 대비 허용 초과폭 */
const OVERHEAD_RATIO_MARGIN = 5;
/** 공과잡비율(%) — 과다 안내 절대 하한(이 값 초과 필수) */
const OVERHEAD_ABSOLUTE_LIMIT = 15;
/** 검토자 확인사항 — 이슈 없어도 대시보드에 항상 표시할 유형 */
const ALWAYS_VISIBLE_DASHBOARD_GROUPS: BidReviewDisplayGroupKey[] = [
  'missing',
  'deviation',
  'overhead',
];
const EMPTY_DASHBOARD_GROUP_MESSAGE = '해당 유형의 검토 이슈가 없습니다.';

export type BidReviewIssueCategory =
  | 'missing_amount'
  | 'overhead_high'
  | 'overhead_sole_vendor'
  | 'key_item_high'
  | 'key_item_low'
  | 'key_item_labor_missing'
  | 'key_item_labor_extra'
  | 'key_item_material_missing'
  | 'key_item_material_extra'
  | 'rank_change';

export type BidReviewIssueSeverity = 'critical' | 'warning';

export interface BidReviewIssue {
  id: string;
  category: BidReviewIssueCategory;
  severity: BidReviewIssueSeverity;
  title: string;
  description: string;
  /** 검토자가 추가로 확인해야 할 조치 */
  reviewerAction?: string;
  /** 통합 Excel 셀 메모(상세) */
  excelNote?: string;
  partnerId?: string;
  lineKey?: string;
  /** 견적 8컬럼 블록 내 색상·메모 대상 (미지정 시 전체) */
  priceColumnOffsets?: number[];
}

export interface BidReviewerVendorEntry {
  vendorName: string;
  partnerId: string;
  items: string[];
  /** 견적 누락 — 타사 평균가 반영 시 순위 변동 안내 */
  rankChangeNote?: string;
}

export type BidReviewDisplayGroupKey = 'missing' | 'deviation' | 'overhead' | 'rank_change';

export interface BidReviewerSummaryGroup {
  id: BidReviewDisplayGroupKey;
  priority: 'high' | 'normal';
  title: string;
  description: string;
  /** 이 유형이 표시되는 자동 검출 기준 */
  criteria: string[];
  actions: string[];
  vendors: BidReviewerVendorEntry[];
  count: number;
  /** 이슈 없을 때 표시 (항상 노출 유형 박스용) */
  emptyMessage?: string;
}

/** @deprecated BidReviewerSummaryGroup 사용 */
export interface BidReviewerSummaryItem {
  priority: 'high' | 'normal';
  category: BidReviewIssueCategory;
  title: string;
  situation: string;
  actions: string[];
  vendors: string[];
  count: number;
}

export interface BidReviewerSummary {
  overview: string;
  groups: BidReviewerSummaryGroup[];
}

export const BASE_COLUMN_COUNT = 8;
export const PRICE_COLUMN_COUNT = 8;
export const PRICE_COLUMN_OFFSETS = {
  labor: [2, 3],
  material: [4, 5],
} as const;

const PRICE_HEADER_LABELS = [
  '견적단가',
  '견적금액',
  '노무단가',
  '노무금액',
  '자재단가',
  '자재금액',
  '경비단가',
  '경비금액',
] as const;

const REVIEWER_ACTION_BY_CATEGORY: Record<BidReviewIssueCategory, string> = {
  missing_amount:
    '① 해당 항목 견적 누락 원인(미첨부·코드 불일치·행 누락) 확인 ② 업체에 보완 견적 요청 ③ 보완 후 재분석',
  overhead_high:
    '① 공과잡비율 산출 근거·요율·포함 범위 확인 ② 타사 평균 대비 과다 사유 확인 ③ 필요 시 재협상',
  overhead_sole_vendor:
    '① 타사는 공과잡비 미기재·본 업체만 기재 여부 확인 ② 산출 방식·포함 범위가 타사와 다른지 검토 ③ 필요 시 견적서 양식·범위 재확인',
  key_item_high:
    '① 단가·수량·규격·범위 차이 확인 ② 과다 산출·중복 반영 여부 검토 ③ 타사 평균 대비 조정 가능성 검토',
  key_item_low:
    '① 항목 누락·미반영·범위 축소 여부 확인 ② 타사 대비 과소 사유 확인 ③ 보완 견적 필요 여부 판단',
  key_item_labor_missing:
    '① 타사는 노무 단가·금액을 분리 기재했으나 본 업체만 미기재 ② 견적단가/경비 합산 여부 확인 ③ 노무 내역 분리 제출 요청 검토',
  key_item_labor_extra:
    '① 타사는 노무 내역 없이 제출했으나 본 업체만 기재 ② 견적서 양식 차이인지 확인 ③ 불필요 기재·이중 반영 여부 검토',
  key_item_material_missing:
    '① 타사는 자재 단가·금액을 분리 기재했으나 본 업체만 미기재 ② 견적단가/경비 합산 여부 확인 ③ 자재 내역 분리 제출 요청 검토',
  key_item_material_extra:
    '① 타사는 자재 내역 없이 제출했으나 본 업체만 기재 ② 견적서 양식 차이인지 확인 ③ 불필요 기재·이중 반영 여부 검토',
  rank_change:
    '① 과다 주요품목을 타사 평균으로 조정 시 순위가 바뀜 ② 해당 품목 단가 재협상·재산출 검토 ③ 조정 후 낙찰 가능성 재평가',
};

const AUTO_DETECT_REASON: Record<BidReviewIssueCategory, string[]> = {
  missing_amount: [
    '· 동일 실행예산코드/항목에 타 업체 견적금액은 있으나 본 업체 금액만 0 또는 공란',
  ],
  overhead_high: [
    '· 공과잡비율 = 견적 총액(공과잡비 포함) ÷ 실행예산코드 보유 품목 합계 × 100 − 100',
    `· 과다: 공과잡비율 ${OVERHEAD_ABSOLUTE_LIMIT}% 초과 필수 + 업체 수별 타사 비교`,
  ],
  overhead_sole_vendor: ['· 참여 업체 중 공과잡비 행을 기재한 업체가 1곳뿐'],
  key_item_high: ['· 총액 10% 이상 주요품목의 견적금액이 타사 평균 대비 10% 초과'],
  key_item_low: ['· 총액 10% 이상 주요품목의 견적금액이 타사 평균 대비 10% 미만'],
  key_item_labor_missing: [
    '· 총액 10% 이상 주요품목에서 참여사 50% 이상이 노무 내역을 기재',
    '· 본 업체만 노무 단가·금액 미기재',
  ],
  key_item_labor_extra: [
    '· 총액 10% 이상 주요품목에서 참여사 50% 이상이 노무 내역 없이 제출',
    '· 본 업체만 노무 단가·금액 기재',
  ],
  key_item_material_missing: [
    '· 총액 10% 이상 주요품목에서 참여사 50% 이상이 자재 내역을 기재',
    '· 본 업체만 자재 단가·금액 미기재',
  ],
  key_item_material_extra: [
    '· 총액 10% 이상 주요품목에서 참여사 50% 이상이 자재 내역 없이 제출',
    '· 본 업체만 자재 단가·금액 기재',
  ],
  rank_change: ['· 주요품목 과다분을 타사 평균가로 환산하면 총액·순위가 변경됨(시뮬레이션)'],
};

const CATEGORY_TO_DISPLAY_GROUP: Record<BidReviewIssueCategory, BidReviewDisplayGroupKey> = {
  missing_amount: 'missing',
  overhead_high: 'overhead',
  overhead_sole_vendor: 'overhead',
  key_item_high: 'deviation',
  key_item_low: 'deviation',
  key_item_labor_missing: 'deviation',
  key_item_labor_extra: 'deviation',
  key_item_material_missing: 'deviation',
  key_item_material_extra: 'deviation',
  rank_change: 'rank_change',
};

const DISPLAY_GROUP_ORDER: BidReviewDisplayGroupKey[] = [
  'missing',
  'deviation',
  'overhead',
  'rank_change',
];

const DISPLAY_GROUP_META: Record<
  BidReviewDisplayGroupKey,
  {
    title: string;
    description: string;
    criteria: string[];
    actions: string[];
    priority: 'high' | 'normal';
  }
> = {
  missing: {
    title: '견적 누락',
    description:
      '통합내역 동일 항목에 타사는 금액이 있으나 해당 업체만 견적금액이 비어 있습니다. (공과잡비·단수정리 제외)',
    criteria: [
      '통합내역 동일 항목(실행예산코드·품목명) 기준으로 업체 간 견적금액을 비교',
      '1곳 이상 타 업체에 견적금액이 있는데, 해당 업체만 금액이 0 또는 공란',
      '공과잡비·단수정리(단수조정) 항목은 견적 누락 검토에서 제외',
      '누락 항목에 타사 평균가를 합산하면 총액·순위가 달라질 수 있음(업체별 시뮬레이션 표시)',
    ],
    actions: ['누락 원인 확인(미첨부·코드 불일치·행 누락)', '보완 견적 요청', '재분석'],
    priority: 'high',
  },
  overhead: {
    title: '공과잡비',
    description:
      '공과잡비율 15% 초과를 기본으로, 기재 업체 수에 따라 단독 제출·최저 대비·평균 대비 과다를 검토합니다.',
    criteria: [
      '공과잡비율(%) = 견적금액 총액(공과잡비·단수정리 포함) ÷ 실행예산코드가 있는 품목 견적금액 합계 × 100 − 100',
      '과다 안내 공통: 공과잡비율 15% 초과(필수)',
      '공과잡비 보유 1개사: 15% 초과 시 과다 이슈, 15% 이하이면 단독 제출 안내',
      '공과잡비 보유 2개사: 15% 초과이면서 최저 공과잡비율 업체 대비 5% 초과 시 과다 이슈',
      '공과잡비 보유 3개사 이상: 15% 초과이면서 전체 보유 업체 평균 대비 5% 초과 시 과다 이슈',
      '공과잡비·단수정리 항목의 견적 누락은 검토 대상에서 제외',
    ],
    actions: ['산출 근거·요율·포함 범위 확인', '타사 대비 사유·양식 차이 확인', '재협상·보완 검토'],
    priority: 'normal',
  },
  deviation: {
    title: '금액 편차',
    description:
      '총액 10% 이상 주요품목의 견적 편차(10% 기준) 또는 노무·자재 내역 다수결 불일치 항목입니다.',
    criteria: [
      '주요품목: 해당 업체 견적 총액의 10% 이상을 차지하는 항목만 대상',
      '과다: 견적금액 > 타사 평균의 110% · 과소: 견적금액 < 타사 평균의 90%',
      '노무·자재 불일치: 참여사 50% 이상이 노무(또는 자재) 내역을 기재(또는 미기재)하는데 본 업체만 다름',
    ],
    actions: ['단가·수량·규격·범위 대조', '누락·과다·양식 차이 확인', '조정·보완 견적 검토'],
    priority: 'normal',
  },
  rank_change: {
    title: '순위 변동',
    description: '주요품목 과다분을 타사 평균가로 환산하면 총액·순위가 변경될 수 있습니다.',
    criteria: [
      '금액 편차(과다)로 검출된 주요품목만 대상 — 과다분을 타사 평균가로 환산',
      '환산 후 견적 총액을 다시 합산하여 순위 재계산(시뮬레이션)',
      '현재 순위와 환산 후 순위가 다른 업체를 표시',
    ],
    actions: ['조정 후 순위 재확인', '해당 품목 재협상', '낙찰 가능성 재평가'],
    priority: 'normal',
  },
};

export interface IntegratedVendorQuote {
  partnerId: string;
  vendorName: string;
  rank: number;
  totalAmount: number;
}

export interface IntegratedLineQuote {
  key: string;
  budgetCode: string;
  budgetItemName: string;
  orderItemName: string;
  isOverheadItem: boolean;
  isRoundingItem: boolean;
  vendorQuotes: Array<{
    partnerId: string;
    vendorName: string;
    quoteAmount: number;
    missing: boolean;
    hasLabor: boolean;
    hasMaterial: boolean;
  }>;
}

function peerAverage(values: number[]): number | null {
  const active = values.filter((value) => value !== 0);
  if (active.length === 0) return null;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function peerAverageExcluding(values: number[], excludeIndex: number): number | null {
  return peerAverage(values.filter((_, index) => index !== excludeIndex));
}

function formatDeviationRatio(value: number, base: number): string {
  if (base === 0) return '-';
  const ratio = ((value - base) / Math.abs(base)) * 100;
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${ratio.toFixed(1)}%`;
}

function itemDisplayName(line: IntegratedLineQuote): string {
  return line.budgetItemName || line.orderItemName || line.budgetCode || line.key;
}

function formatLineRef(line: IntegratedLineQuote): string {
  const name = itemDisplayName(line);
  return line.budgetCode ? `${name} [${line.budgetCode}]` : name;
}

function formatVendorCount(count: number, total: number): string {
  const ratio = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
  return `${count}/${total}개사 (${ratio}%)`;
}

function formatPeerAmounts(
  quotes: IntegratedLineQuote['vendorQuotes'],
  excludePartnerId: string,
): string {
  return quotes
    .filter(
      (peer) =>
        peer.partnerId !== excludePartnerId && !peer.missing && peer.quoteAmount !== 0,
    )
    .map((peer) => `${peer.vendorName} ${formatWon(peer.quoteAmount)}`)
    .join(' · ');
}

function joinIssueLines(lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

function buildRankMap(
  vendors: IntegratedVendorQuote[],
  totals: Map<string, number>,
): Map<string, number> {
  const sorted = [...vendors].sort(
    (a, b) => (totals.get(a.partnerId) ?? 0) - (totals.get(b.partnerId) ?? 0),
  );
  const rankMap = new Map<string, number>();
  sorted.forEach((vendor, index) => {
    rankMap.set(vendor.partnerId, index + 1);
  });
  return rankMap;
}

function majorityThreshold(count: number): number {
  return Math.ceil(count / 2);
}

function hasMajority(partCount: number, total: number): boolean {
  return partCount >= majorityThreshold(total);
}

type ComponentField = 'hasLabor' | 'hasMaterial';

function reviewKeyItemComponentBreakdown(
  pushIssue: (issue: Omit<BidReviewIssue, 'id'>) => void,
  line: IntegratedLineQuote,
  activeQuotes: IntegratedLineQuote['vendorQuotes'],
  componentField: ComponentField,
  componentLabel: string,
  columnOffsets: readonly number[],
): void {
  const total = activeQuotes.length;
  if (total < 2) return;

  const presentCount = activeQuotes.filter((quote) => quote[componentField]).length;
  const absentCount = total - presentCount;
  const label = itemDisplayName(line);

  if (hasMajority(presentCount, total)) {
    const submitters = activeQuotes
      .filter((quote) => quote[componentField])
      .map((quote) => quote.vendorName)
      .join(', ');

    for (const quote of activeQuotes) {
      if (quote[componentField]) continue;
      pushIssue({
        category:
          componentField === 'hasLabor' ? 'key_item_labor_missing' : 'key_item_material_missing',
        severity: 'warning',
        title: `[${quote.vendorName}] 주요품목 ${componentLabel} 내역 누락 — ${label}`,
        description: joinIssueLines([
          `■ 상황: 총액 10% 이상 주요품목에서 ${formatVendorCount(presentCount, total)}가 ${componentLabel} 단가·금액을 기재했으나, ${quote.vendorName}만 ${componentLabel} 금액이 비어 있습니다.`,
          `■ 다수결 기준: 참여 ${total}개사 중 ${majorityThreshold(total)}개사 이상 제출 시 누락 업체 표시 (${submitters})`,
          `■ 검토 포인트: 타사와 동일하게 ${componentLabel} 내역을 분리 기재해야 하는지, 견적단가/경비에만 합산했는지 확인하세요.`,
          `■ 대상 항목: ${formatLineRef(line)}`,
        ]),
        partnerId: quote.partnerId,
        lineKey: line.key,
        priceColumnOffsets: [...columnOffsets],
      });
    }
  }

  if (hasMajority(absentCount, total)) {
    const nonSubmitters = activeQuotes
      .filter((quote) => !quote[componentField])
      .map((quote) => quote.vendorName)
      .join(', ');

    for (const quote of activeQuotes) {
      if (!quote[componentField]) continue;
      pushIssue({
        category:
          componentField === 'hasLabor' ? 'key_item_labor_extra' : 'key_item_material_extra',
        severity: 'warning',
        title: `[${quote.vendorName}] 주요품목 ${componentLabel} 내역 불일치 — ${label}`,
        description: joinIssueLines([
          `■ 상황: 총액 10% 이상 주요품목에서 ${formatVendorCount(absentCount, total)}가 ${componentLabel} 내역 없이 제출했으나, ${quote.vendorName}만 ${componentLabel} 금액을 기재했습니다.`,
          `■ 다수결 기준: 참여 ${total}개사 중 ${majorityThreshold(total)}개사 이상 미제출 시 기재 업체 표시 (${nonSubmitters})`,
          `■ 검토 포인트: ${componentLabel} 분리 기재가 불필요한 형식인지, 타사와 견적서 양식이 다른지 확인하세요.`,
          `■ 대상 항목: ${formatLineRef(line)}`,
        ]),
        partnerId: quote.partnerId,
        lineKey: line.key,
        priceColumnOffsets: [...columnOffsets],
      });
    }
  }
}

function isExcludedFromMissingReview(line: IntegratedLineQuote): boolean {
  return line.isOverheadItem || line.isRoundingItem;
}

interface VendorOverheadRatioResult {
  ratio: number;
  totalAmount: number;
  codedTotal: number;
  vendorName: string;
  overheadLineKey?: string;
}

function computeVendorOverheadRatio(
  lines: IntegratedLineQuote[],
  partnerId: string,
  vendorName: string,
): VendorOverheadRatioResult | null {
  let totalAmount = 0;
  let codedTotal = 0;
  let hasOverhead = false;
  let overheadLineKey: string | undefined;

  for (const line of lines) {
    const quote = line.vendorQuotes.find((item) => item.partnerId === partnerId);
    if (!quote || quote.missing) continue;

    totalAmount += quote.quoteAmount;

    if (line.isOverheadItem) {
      hasOverhead = true;
      overheadLineKey = line.key;
    }

    if (!line.isOverheadItem && !line.isRoundingItem && line.budgetCode.trim()) {
      codedTotal += quote.quoteAmount;
    }
  }

  if (!hasOverhead || codedTotal <= 0) return null;

  return {
    ratio: (totalAmount / codedTotal) * 100 - 100,
    totalAmount,
    codedTotal,
    vendorName,
    overheadLineKey,
  };
}

function passesOverheadHighThreshold(
  ratio: number,
  overheadVendorCount: number,
  minRatio: number,
  avgRatio: number,
  isLowestVendor: boolean,
): boolean {
  if (ratio <= OVERHEAD_ABSOLUTE_LIMIT) return false;

  if (overheadVendorCount === 1) return true;

  if (overheadVendorCount === 2) {
    if (isLowestVendor) return false;
    return ratio > minRatio + OVERHEAD_RATIO_MARGIN;
  }

  return ratio > avgRatio + OVERHEAD_RATIO_MARGIN;
}

function pushOverheadHighIssue(
  pushIssue: (issue: Omit<BidReviewIssue, 'id'>) => void,
  data: VendorOverheadRatioResult,
  partnerId: string,
  count: number,
  minData: VendorOverheadRatioResult,
  avgRatio: number,
): void {
  const peerThreshold =
    count === 2 ? minData.ratio + OVERHEAD_RATIO_MARGIN : avgRatio + OVERHEAD_RATIO_MARGIN;

  pushIssue({
    category: 'overhead_high',
    severity: 'warning',
    title: `[${data.vendorName}] 공과잡비율 과다 — ${data.ratio.toFixed(1)}%`,
    description: joinIssueLines([
      `■ 상황: ${data.vendorName} 공과잡비율 ${data.ratio.toFixed(1)}% (견적 총액 ${formatWon(Math.round(data.totalAmount))} ÷ 코드 품목 합계 ${formatWon(Math.round(data.codedTotal))})`,
      `■ 절대 기준: 공과잡비율 ${OVERHEAD_ABSOLUTE_LIMIT}% 초과 (${data.ratio.toFixed(1)}%)`,
      count === 1
        ? `■ 비교: 공과잡비 보유 1개사 — 타사 비교 없음, 15% 초과 단독 기준 적용`
        : count === 2
          ? `■ 비교: 공과잡비 보유 2개사 — 최저 ${minData.vendorName} ${minData.ratio.toFixed(1)}% 대비 5% 초과 (기준 ${peerThreshold.toFixed(1)}%)`
          : `■ 비교: 공과잡비 보유 ${count}개사 — 평균 ${avgRatio.toFixed(1)}% 대비 5% 초과 (기준 ${peerThreshold.toFixed(1)}%)`,
      count === 1
        ? `■ 판단 기준: 단독 제출 — 공과잡비율 15% 초과`
        : count === 2
          ? `■ 판단 기준: 15% 초과 + 최저 업체 대비 5% 초과`
          : `■ 판단 기준: 15% 초과 + 전체 보유 업체 평균 대비 5% 초과`,
      `■ 검토 포인트: 공과잡비 산출 근거·요율·포함 범위가 타사 대비 합리적인지 확인하세요.`,
    ]),
    partnerId,
    lineKey: data.overheadLineKey,
  });
}

function reviewOverheadRatioIssues(
  vendors: IntegratedVendorQuote[],
  lines: IntegratedLineQuote[],
  pushIssue: (issue: Omit<BidReviewIssue, 'id'>) => void,
): void {
  const ratioByPartner = new Map<string, VendorOverheadRatioResult>();

  for (const vendor of vendors) {
    const result = computeVendorOverheadRatio(lines, vendor.partnerId, vendor.vendorName);
    if (result) ratioByPartner.set(vendor.partnerId, result);
  }

  const count = ratioByPartner.size;
  if (count === 0) return;

  const entries = [...ratioByPartner.entries()];

  if (count === 1) {
    const [partnerId, data] = entries[0]!;

    if (passesOverheadHighThreshold(data.ratio, 1, data.ratio, data.ratio, false)) {
      pushOverheadHighIssue(pushIssue, data, partnerId, 1, data, data.ratio);
      return;
    }

    pushIssue({
      category: 'overhead_sole_vendor',
      severity: 'warning',
      title: `[${data.vendorName}] 공과잡비 단독 제출`,
      description: joinIssueLines([
        `■ 상황: 참여 ${vendors.length}개사 중 ${data.vendorName}만 공과잡비 행을 기재했습니다.`,
        `■ 공과잡비율: ${data.ratio.toFixed(1)}% (견적 총액 ${formatWon(Math.round(data.totalAmount))} ÷ 코드 품목 합계 ${formatWon(Math.round(data.codedTotal))})`,
        `■ 판단 기준: 공과잡비 보유 1곳, 공과잡비율 ${OVERHEAD_ABSOLUTE_LIMIT}% 이하 → 단독 제출 안내`,
        `■ 검토 포인트: 타사는 공과잡비를 별도 기재하지 않았는지, 산출·포함 범위 차이를 확인하세요.`,
      ]),
      partnerId,
      lineKey: data.overheadLineKey,
    });
    return;
  }

  const ratios = entries.map(([, data]) => data.ratio);
  const avgRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  const minEntry = entries.reduce((lowest, current) =>
    current[1].ratio < lowest[1].ratio ? current : lowest,
  );
  const [minPartnerId, minData] = minEntry;

  for (const [partnerId, data] of entries) {
    const isLowestVendor = partnerId === minPartnerId;
    if (
      !passesOverheadHighThreshold(data.ratio, count, minData.ratio, avgRatio, isLowestVendor)
    ) {
      continue;
    }

    pushOverheadHighIssue(pushIssue, data, partnerId, count, minData, avgRatio);
  }
}

export function buildQuotationReviewIssues(
  vendors: IntegratedVendorQuote[],
  lines: IntegratedLineQuote[],
): BidReviewIssue[] {
  if (vendors.length < 2 || lines.length === 0) return [];

  const issues: BidReviewIssue[] = [];
  let issueSeq = 0;
  const pushIssue = (issue: Omit<BidReviewIssue, 'id'>) => {
    issueSeq += 1;
    issues.push({ id: `review-${issueSeq}`, ...issue });
  };

  for (const line of lines) {
    for (const quote of line.vendorQuotes) {
      if (isExcludedFromMissingReview(line)) continue;

      const othersHaveValue = line.vendorQuotes.some(
        (peer) =>
          peer.partnerId !== quote.partnerId &&
          !peer.missing &&
          peer.quoteAmount !== 0,
      );
      if (!othersHaveValue) continue;

      if (quote.missing || quote.quoteAmount === 0) {
        const peerSummary = formatPeerAmounts(line.vendorQuotes, quote.partnerId);
        pushIssue({
          category: 'missing_amount',
          severity: 'critical',
          title: `[${quote.vendorName}] 견적금액 누락 — ${formatLineRef(line)}`,
          description: joinIssueLines([
            `■ 상황: 통합내역 동일 항목에 ${quote.vendorName} 견적금액만 비어 있고, 타사는 금액이 있습니다.`,
            `■ 타사 견적: ${peerSummary || '타사 금액 존재'}`,
            `■ 검토 포인트: 항목 누락·미첨부·코드 불일치 여부를 확인하고, 보완 견적이 필요한지 판단하세요.`,
            `■ 대상 항목: ${formatLineRef(line)}`,
          ]),
          partnerId: quote.partnerId,
          lineKey: line.key,
        });
      }
    }
  }

  reviewOverheadRatioIssues(vendors, lines, pushIssue);

  const keyLineKeys = new Set<string>();
  for (const vendor of vendors) {
    if (vendor.totalAmount <= 0) continue;
    for (const line of lines) {
      const quote = line.vendorQuotes.find((item) => item.partnerId === vendor.partnerId);
      if (!quote || quote.missing || quote.quoteAmount === 0) continue;
      if (line.isOverheadItem || line.isRoundingItem) continue;
      if (quote.quoteAmount / vendor.totalAmount >= KEY_ITEM_RATIO) {
        keyLineKeys.add(line.key);
      }
    }
  }

  const highAdjustments = new Map<string, Map<string, number>>();

  for (const lineKey of keyLineKeys) {
    const line = lines.find((item) => item.key === lineKey);
    if (!line) continue;

    const amounts = line.vendorQuotes.map((quote) => quote.quoteAmount);
    const activeQuotes = line.vendorQuotes.filter(
      (quote) => !quote.missing && quote.quoteAmount !== 0,
    );
    if (activeQuotes.length < 2) continue;

    reviewKeyItemComponentBreakdown(
      pushIssue,
      line,
      activeQuotes,
      'hasLabor',
      '노무',
      PRICE_COLUMN_OFFSETS.labor,
    );
    reviewKeyItemComponentBreakdown(
      pushIssue,
      line,
      activeQuotes,
      'hasMaterial',
      '자재',
      PRICE_COLUMN_OFFSETS.material,
    );

    line.vendorQuotes.forEach((quote, index) => {
      if (quote.missing || quote.quoteAmount === 0) return;
      const othersAvg = peerAverageExcluding(amounts, index);
      if (othersAvg == null || othersAvg === 0) return;

      const label = itemDisplayName(line);
      const vendorTotal =
        vendors.find((vendor) => vendor.partnerId === quote.partnerId)?.totalAmount ?? 0;
      const shareRatio = vendorTotal > 0 ? (quote.quoteAmount / vendorTotal) * 100 : 0;

      if (quote.quoteAmount > othersAvg * (1 + DEVIATION_RATIO)) {
        const diffAmount = quote.quoteAmount - othersAvg;
        pushIssue({
          category: 'key_item_high',
          severity: 'warning',
          title: `[${quote.vendorName}] 주요품목 과다 견적 — ${label}`,
          description: joinIssueLines([
            `■ 상황: ${quote.vendorName} '${label}' ${formatWon(quote.quoteAmount)}은 타사 평균 ${formatWon(Math.round(othersAvg))}보다 ${formatDeviationRatio(quote.quoteAmount, othersAvg)} (${formatWon(Math.round(diffAmount))}) 높습니다.`,
            `■ 주요품목: 본 업체 총액의 ${shareRatio.toFixed(1)}% (10% 이상 항목)`,
            `■ 판단 기준: 타사 평균 대비 10% 초과 시 표시`,
            `■ 검토 포인트: 단가·수량·규격 차이 또는 과다 산출 여부를 확인하세요.`,
            `■ 대상 항목: ${formatLineRef(line)}`,
          ]),
          partnerId: quote.partnerId,
          lineKey: line.key,
        });

        const vendorAdjustments =
          highAdjustments.get(quote.partnerId) ?? new Map<string, number>();
        vendorAdjustments.set(line.key, quote.quoteAmount - othersAvg);
        highAdjustments.set(quote.partnerId, vendorAdjustments);
      } else if (quote.quoteAmount < othersAvg * (1 - DEVIATION_RATIO)) {
        const diffAmount = othersAvg - quote.quoteAmount;
        pushIssue({
          category: 'key_item_low',
          severity: 'warning',
          title: `[${quote.vendorName}] 주요품목 과소 견적 — ${label}`,
          description: joinIssueLines([
            `■ 상황: ${quote.vendorName} '${label}' ${formatWon(quote.quoteAmount)}은 타사 평균 ${formatWon(Math.round(othersAvg))}보다 ${formatDeviationRatio(quote.quoteAmount, othersAvg)} (${formatWon(Math.round(diffAmount))}) 낮습니다.`,
            `■ 주요품목: 본 업체 총액의 ${shareRatio.toFixed(1)}% (10% 이상 항목)`,
            `■ 판단 기준: 타사 평균 대비 10% 미만 시 표시`,
            `■ 검토 포인트: 누락·미반영·단가 절사·범위 축소 가능성을 확인하세요.`,
            `■ 대상 항목: ${formatLineRef(line)}`,
          ]),
          partnerId: quote.partnerId,
          lineKey: line.key,
        });
      }
    });
  }

  if (highAdjustments.size > 0) {
    const originalTotals = new Map(
      vendors.map((vendor) => [vendor.partnerId, vendor.totalAmount]),
    );
    const adjustedTotals = new Map(originalTotals);
    for (const [partnerId, lineAdjustments] of highAdjustments) {
      const reduction = [...lineAdjustments.values()].reduce((sum, value) => sum + value, 0);
      adjustedTotals.set(partnerId, (adjustedTotals.get(partnerId) ?? 0) - reduction);
    }

    const originalRanks = buildRankMap(vendors, originalTotals);
    const adjustedRanks = buildRankMap(vendors, adjustedTotals);

    for (const vendor of vendors) {
      const before = originalRanks.get(vendor.partnerId) ?? vendor.rank;
      const after = adjustedRanks.get(vendor.partnerId) ?? before;
      if (before === after) continue;

      const beforeTotal = originalTotals.get(vendor.partnerId) ?? 0;
      const afterTotal = adjustedTotals.get(vendor.partnerId) ?? 0;
      const delta = beforeTotal - afterTotal;

      pushIssue({
        category: 'rank_change',
        severity: 'warning',
        title: `[${vendor.vendorName}] 평균가 조정 시 순위 ${before}위 → ${after}위`,
        description: joinIssueLines([
          `■ 상황: 주요품목 과다 견적분을 타사 평균가로 조정하면 ${vendor.vendorName} 총액이 ${formatWon(beforeTotal)} → ${formatWon(afterTotal)} (${formatWon(delta)} 감소)으로 변경됩니다.`,
          `■ 순위 변동: ${before}위 → ${after}위`,
          `■ 판단 기준: 10% 초과 과다 주요품목을 타사 평균으로 환산한 시뮬레이션`,
          `■ 검토 포인트: 과다 항목 조정 시 실제 낙찰 순위가 바뀔 수 있으므로, 해당 품목 단가 재협상·재검토가 필요합니다.`,
        ]),
        partnerId: vendor.partnerId,
      });
    }
  }

  return issues;
}

function extractVendorFromTitle(title: string): string {
  const match = title.match(/^\[([^\]]+)\]/);
  return match?.[1] ?? title.split(' — ')[0]?.trim() ?? title;
}

function extractItemFromTitle(title: string): string {
  const parts = title.split(' — ');
  return parts.length > 1 ? parts.slice(1).join(' — ') : title;
}

function formatIssueDashboardItem(issue: BidReviewIssue): string {
  const item = extractItemFromTitle(issue.title);
  switch (issue.category) {
    case 'missing_amount':
      return `${item} · 견적금액 누락`;
    case 'overhead_high': {
      const ratioMatch = issue.title.match(/—\s*([\d.]+)%/);
      const isMinCompare = issue.description.includes('최저');
      const isAvgCompare = issue.description.includes('평균');
      const isSoleHigh = issue.description.includes('1개사');
      if (ratioMatch && isSoleHigh) {
        return `공과잡비율 ${ratioMatch[1]}% · 15% 초과 (단독 제출)`;
      }
      if (ratioMatch && isMinCompare) {
        return `공과잡비율 ${ratioMatch[1]}% · 15% 초과, 최저 대비 5% 초과`;
      }
      if (ratioMatch && isAvgCompare) {
        return `공과잡비율 ${ratioMatch[1]}% · 15% 초과, 평균 대비 5% 초과`;
      }
      return ratioMatch ? `공과잡비율 ${ratioMatch[1]}% · 과다` : `${item} · 공과잡비율 과다`;
    }
    case 'overhead_sole_vendor':
      return `공과잡비 단독 제출 · 타사 미기재`;
    case 'key_item_high':
      return `${item} · 주요품목 과다(10% 초과)`;
    case 'key_item_low':
      return `${item} · 주요품목 과소(10% 미만)`;
    case 'key_item_labor_missing':
      return `${item} · 노무 내역 누락(다수결)`;
    case 'key_item_labor_extra':
      return `${item} · 노무 내역 불일치(다수결)`;
    case 'key_item_material_missing':
      return `${item} · 자재 내역 누락(다수결)`;
    case 'key_item_material_extra':
      return `${item} · 자재 내역 불일치(다수결)`;
    case 'rank_change': {
      const rankMatch = issue.title.match(/순위\s*(\d+)위\s*→\s*(\d+)위/);
      return rankMatch
        ? `과다품목 평균가 조정 시 ${rankMatch[1]}위 → ${rankMatch[2]}위`
        : issue.title.replace(/^\[[^\]]+\]\s*/, '');
    }
    default:
      return item;
  }
}

interface MissingImputationResult {
  beforeRank: number;
  afterRank: number;
  beforeTotal: number;
  afterTotal: number;
  imputedAmount: number;
}

function computeMissingImputationRankChanges(
  vendors: IntegratedVendorQuote[],
  lines: IntegratedLineQuote[],
): Map<string, MissingImputationResult> {
  const originalTotals = new Map(vendors.map((vendor) => [vendor.partnerId, vendor.totalAmount]));
  const imputedAdditions = new Map<string, number>();

  for (const line of lines) {
    if (isExcludedFromMissingReview(line)) continue;

    const amounts = line.vendorQuotes.map((quote) => quote.quoteAmount);

    line.vendorQuotes.forEach((quote, index) => {
      const othersHaveValue = line.vendorQuotes.some(
        (peer) =>
          peer.partnerId !== quote.partnerId && !peer.missing && peer.quoteAmount !== 0,
      );
      if (!othersHaveValue) return;
      if (!quote.missing && quote.quoteAmount !== 0) return;

      const peerAvg = peerAverageExcluding(amounts, index);
      if (peerAvg == null || peerAvg <= 0) return;

      imputedAdditions.set(
        quote.partnerId,
        (imputedAdditions.get(quote.partnerId) ?? 0) + peerAvg,
      );
    });
  }

  if (imputedAdditions.size === 0) return new Map();

  const adjustedTotals = new Map(originalTotals);
  for (const [partnerId, addition] of imputedAdditions) {
    adjustedTotals.set(partnerId, (adjustedTotals.get(partnerId) ?? 0) + addition);
  }

  const originalRanks = buildRankMap(vendors, originalTotals);
  const adjustedRanks = buildRankMap(vendors, adjustedTotals);
  const results = new Map<string, MissingImputationResult>();

  for (const [partnerId, imputedAmount] of imputedAdditions) {
    const beforeRank = originalRanks.get(partnerId) ?? 0;
    const afterRank = adjustedRanks.get(partnerId) ?? beforeRank;
    results.set(partnerId, {
      beforeRank,
      afterRank,
      beforeTotal: originalTotals.get(partnerId) ?? 0,
      afterTotal: adjustedTotals.get(partnerId) ?? 0,
      imputedAmount,
    });
  }

  return results;
}

function formatMissingRankChangeNote(result: MissingImputationResult): string {
  const imputedLabel = formatWon(Math.round(result.imputedAmount));
  if (result.beforeRank !== result.afterRank) {
    return `누락 항목 타사 평균가(${imputedLabel}) 반영 시 ${result.beforeRank}위 → ${result.afterRank}위 · 총액 ${formatWon(result.beforeTotal)} → ${formatWon(Math.round(result.afterTotal))}`;
  }
  return `누락 항목 타사 평균가(${imputedLabel}) 반영 시 순위 ${result.beforeRank}위 유지 · 총액 ${formatWon(result.beforeTotal)} → ${formatWon(Math.round(result.afterTotal))}`;
}

function buildExcelNote(issue: BidReviewIssue, line?: IntegratedLineQuote): string {
  const markedCols =
    issue.priceColumnOffsets?.map((offset) => PRICE_HEADER_LABELS[offset]).join(', ') ??
    '견적단가 ~ 경비금액 (8개 열 전체)';

  return joinIssueLines([
    '【통합비교표 · 검토이슈 메모】',
    `유형: ${BID_REVIEW_CATEGORY_LABELS[issue.category]}`,
    `중요도: ${issue.severity === 'critical' ? '★★★ 높음 (즉시 확인)' : '★★ 보통 (확인 권장)'}`,
    '',
    '─ 1. 이슈 요약 ─',
    issue.title,
    '',
    '─ 2. 어떤 상황인가? ─',
    ...issue.description.split('\n').map((lineText) => lineText.replace(/^■ /, '  · ')),
    '',
    '─ 3. 자동 표시 사유 ─',
    ...AUTO_DETECT_REASON[issue.category],
    '',
    '─ 4. 검토자 추가 확인 ─',
    issue.reviewerAction ?? REVIEWER_ACTION_BY_CATEGORY[issue.category],
    '',
    line ? joinIssueLines(['─ 5. 항목 위치 ─', `  · ${formatLineRef(line)}`]) : '',
    joinIssueLines(['─ 6. 색상 표시 열 ─', `  · ${markedCols}`]),
    '',
    '─ 참고 ─',
    '  · 색상: 빨강=견적 누락(긴급), 주황=편차·불일치',
    '  · 메모 보기: Excel [검토] > [메모 표시] 또는 셀 우클릭',
    '  · 기준: 타사 평균 ±10%, 주요품목=총액 10%+, 다수결=참여 50%+',
  ]);
}

/** 이슈에 검토자 조치·Excel 상세 메모 부여 */
export function finalizeReviewIssues(
  issues: BidReviewIssue[],
  lines: IntegratedLineQuote[],
): BidReviewIssue[] {
  const lineMap = new Map(lines.map((line) => [line.key, line]));

  return issues.map((issue) => ({
    ...issue,
    reviewerAction: REVIEWER_ACTION_BY_CATEGORY[issue.category],
    excelNote: buildExcelNote(issue, issue.lineKey ? lineMap.get(issue.lineKey) : undefined),
  }));
}

/** 대시보드용 — 이슈 유형별 박스 + 업체별 검토 내역 */
export function buildReviewerSummary(
  issues: BidReviewIssue[],
  lines: IntegratedLineQuote[],
  vendors: IntegratedVendorQuote[],
): BidReviewerSummary {
  const missingImputation = computeMissingImputationRankChanges(vendors, lines);
  const groupedIssues = new Map<BidReviewDisplayGroupKey, BidReviewIssue[]>();

  for (const issue of issues) {
    const groupKey = CATEGORY_TO_DISPLAY_GROUP[issue.category];
    const list = groupedIssues.get(groupKey) ?? [];
    list.push(issue);
    groupedIssues.set(groupKey, list);
  }

  const groups: BidReviewerSummaryGroup[] = [];

  for (const groupId of DISPLAY_GROUP_ORDER) {
    const groupIssues = groupedIssues.get(groupId);
    if (!groupIssues?.length) continue;

    const meta = DISPLAY_GROUP_META[groupId];
    const vendorMap = new Map<string, BidReviewerVendorEntry>();

    for (const issue of groupIssues) {
      const partnerId = issue.partnerId ?? extractVendorFromTitle(issue.title);
      const vendorName = extractVendorFromTitle(issue.title);
      const existing = vendorMap.get(partnerId);

      if (existing) {
        existing.items.push(formatIssueDashboardItem(issue));
        continue;
      }

      vendorMap.set(partnerId, {
        vendorName,
        partnerId,
        items: [formatIssueDashboardItem(issue)],
        rankChangeNote:
          groupId === 'missing' && missingImputation.has(partnerId)
            ? formatMissingRankChangeNote(missingImputation.get(partnerId)!)
            : undefined,
      });
    }

    groups.push({
      id: groupId,
      priority: meta.priority,
      title: meta.title,
      description: meta.description,
      criteria: meta.criteria,
      actions: meta.actions,
      vendors: [...vendorMap.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'ko')),
      count: groupIssues.length,
    });
  }

  for (const groupId of ALWAYS_VISIBLE_DASHBOARD_GROUPS) {
    if (groups.some((group) => group.id === groupId)) continue;
    const meta = DISPLAY_GROUP_META[groupId];
    groups.push({
      id: groupId,
      priority: meta.priority,
      title: meta.title,
      description: meta.description,
      criteria: meta.criteria,
      actions: meta.actions,
      vendors: [],
      count: 0,
      emptyMessage: EMPTY_DASHBOARD_GROUP_MESSAGE,
    });
  }

  groups.sort(
    (a, b) => DISPLAY_GROUP_ORDER.indexOf(a.id) - DISPLAY_GROUP_ORDER.indexOf(b.id),
  );

  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;

  if (issues.length === 0) {
    return {
      overview:
        '자동 검토 기준에 해당하는 특이 이슈가 없습니다. 견적 누락·금액 편차·공과잡비 유형은 이슈 없음으로 표시됩니다. 통합 Excel을 오프라인으로 검토하세요.',
      groups,
    };
  }

  return {
    overview: joinIssueLines([
      `총 ${issues.length}건의 검토이슈가 검출되었습니다${criticalCount > 0 ? ` (긴급 ${criticalCount}건 포함)` : ''}.`,
      '유형별 박스에서 업체별 검토 대상을 확인한 뒤, 통합 Excel의 색상·메모와 대조하세요.',
    ]),
    groups,
  };
}

export const BID_REVIEW_CATEGORY_LABELS: Record<BidReviewIssueCategory, string> = {
  missing_amount: '견적 누락',
  overhead_high: '공과잡비 과다',
  overhead_sole_vendor: '공과잡비 단독 제출',
  key_item_high: '핵심품목 과다',
  key_item_low: '핵심품목 과소',
  key_item_labor_missing: '노무 내역 누락',
  key_item_labor_extra: '노무 내역 불일치',
  key_item_material_missing: '자재 내역 누락',
  key_item_material_extra: '자재 내역 불일치',
  rank_change: '순위 변동',
};

export interface ReviewCellMark {
  sheetRow: number;
  sheetCol: number;
  severity: BidReviewIssueSeverity;
  note: string;
}

function issueNoteText(issue: BidReviewIssue): string {
  return issue.excelNote ?? joinIssueLines([issue.title, issue.description]);
}

/** 통합 Excel 셀 좌표(1-based)와 검토 메모 생성 */
export function buildReviewCellMarks(
  issues: BidReviewIssue[],
  lineKeys: string[],
  rankedPartnerIds: string[],
): ReviewCellMark[] {
  const marks: ReviewCellMark[] = [];

  for (const issue of issues) {
    if (!issue.partnerId) continue;
    const vendorIndex = rankedPartnerIds.indexOf(issue.partnerId);
    if (vendorIndex < 0) continue;

    const vendorStartCol = BASE_COLUMN_COUNT + vendorIndex * PRICE_COLUMN_COUNT;
    const note = issueNoteText(issue);

    if (issue.lineKey) {
      const dataRowIndex = lineKeys.indexOf(issue.lineKey);
      if (dataRowIndex < 0) continue;
      const sheetRow = dataRowIndex + 3;
      const columnOffsets =
        issue.priceColumnOffsets ??
        Array.from({ length: PRICE_COLUMN_COUNT }, (_, offset) => offset);

      for (const offset of columnOffsets) {
        marks.push({
          sheetRow,
          sheetCol: vendorStartCol + offset + 1,
          severity: issue.severity,
          note,
        });
      }
      continue;
    }

    if (issue.category === 'rank_change') {
      marks.push({
        sheetRow: 1,
        sheetCol: vendorStartCol + 1,
        severity: issue.severity,
        note,
      });
    }
  }

  return marks;
}

export function mergeReviewCellMarks(
  marks: ReviewCellMark[],
): Map<string, { severity: BidReviewIssueSeverity; notes: string[] }> {
  const merged = new Map<string, { severity: BidReviewIssueSeverity; notes: string[] }>();

  for (const mark of marks) {
    const key = `${mark.sheetRow}:${mark.sheetCol}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { severity: mark.severity, notes: [mark.note] });
      continue;
    }

    if (mark.severity === 'critical') existing.severity = 'critical';
    if (!existing.notes.includes(mark.note)) existing.notes.push(mark.note);
  }

  return merged;
}

export function reviewCellFillColor(severity: BidReviewIssueSeverity): string {
  return severity === 'critical' ? 'FFFFE5E5' : 'FFFFF3E0';
}

export function reviewCellBorderColor(severity: BidReviewIssueSeverity): string {
  return severity === 'critical' ? 'FFDC2626' : 'FFEA580C';
}

function columnLetter(col: number): string {
  let index = col;
  let letters = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    index = Math.floor((index - 1) / 26);
  }
  return letters;
}

/** 통합내역 시트에서 이슈가 표시되는 대표 셀 주소 (예: 내역서!I3) */
export function getIssuePrimaryCellAddress(
  issue: BidReviewIssue,
  lineKeys: string[],
  rankedPartnerIds: string[],
  sheetName = '내역서',
): string | null {
  if (!issue.partnerId) return null;
  const vendorIndex = rankedPartnerIds.indexOf(issue.partnerId);
  if (vendorIndex < 0) return null;

  const vendorStartCol = BASE_COLUMN_COUNT + vendorIndex * PRICE_COLUMN_COUNT + 1;

  if (issue.lineKey) {
    const dataRowIndex = lineKeys.indexOf(issue.lineKey);
    if (dataRowIndex < 0) return null;
    return `${sheetName}!${columnLetter(vendorStartCol)}${dataRowIndex + 3}`;
  }

  if (issue.category === 'rank_change') {
    return `${sheetName}!${columnLetter(vendorStartCol)}1`;
  }

  return null;
}
