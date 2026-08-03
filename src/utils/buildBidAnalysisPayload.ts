import type { Bid } from '@/types/bid';

export function buildBidAnalysisPayload(bids: Bid[], query?: string) {
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    userQuery: query?.trim() ?? '',
    counts: {
      total: bids.length,
      preparing: bids.filter((b) => b.status === '준비').length,
      inProgress: bids.filter((b) => b.status === '진행').length,
      evaluating: bids.filter((b) => b.status === '평가').length,
      awarded: bids.filter((b) => b.status === '낙찰').length,
    },
    bidColumns: [
      'title',
      'client',
      'division',
      'team',
      'method',
      'amount',
      'start',
      'deadline',
      'category',
      'trade',
      'code',
      'status',
      'note',
    ],
    bids: bids.map((bid) => [
      bid.title,
      bid.clientName,
      bid.divisionName,
      bid.teamName ?? '',
      bid.bidMethod,
      bid.estimatedAmount ?? 0,
      bid.bidStartDate,
      bid.bidDeadline,
      bid.bidCategory,
      bid.tradeType,
      bid.projectCode ?? '',
      bid.status,
      bid.note ?? '',
    ]),
  };
}

export function buildBidSystemInstruction(payload: ReturnType<typeof buildBidAnalysisPayload>): string {
  return `S-NEXUS 입찰·구매 분석 AI. 한국어. 제공 JSON만 사용, 수치 창작 금지.

입찰 데이터(bids)를 기반으로 입찰 일정, 리스크, 사업본부별 현황, 낙찰 전략을 분석하세요.
출력: 【입찰 분석】 제목 → 핵심 요약 bullet → 섹션별 분석 → 마크다운 표 → 권고.

DATA:
${JSON.stringify(payload)}`;
}

export type BidAnalysisPayload = ReturnType<typeof buildBidAnalysisPayload>;
