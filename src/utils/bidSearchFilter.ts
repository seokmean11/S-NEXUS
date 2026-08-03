import type { Bid, BidSearchFilters } from '@/types/bid';
import { isCompleteKoreanDate, parseAmountInput, parseKoreanDateToIso } from '@/utils/formatInput';

function resolveFilterIsoDate(value: string): string {
  if (!value.trim() || !isCompleteKoreanDate(value)) return '';
  return parseKoreanDateToIso(value) ?? '';
}

function normalizeCode(value?: string): string {
  return (value ?? '').replace(/\D/g, '');
}

function parseFilterAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseAmountInput(trimmed);
  if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function overlapsBidPeriod(
  bid: Bid,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;

  const bidStart = new Date(bid.bidStartDate).getTime();
  const bidEnd = new Date(bid.bidDeadline).getTime();
  const searchFrom = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
  const searchTo = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;

  return bidStart <= searchTo && bidEnd >= searchFrom;
}

export function sortBidsByDeadline(bids: Bid[]): Bid[] {
  return [...bids].sort(
    (a, b) => new Date(a.bidDeadline).getTime() - new Date(b.bidDeadline).getTime(),
  );
}

export function filterBids(bids: Bid[], filters: BidSearchFilters): Bid[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const projectCode = normalizeCode(filters.projectCode);
  const amountMin = parseFilterAmount(filters.amountMin);
  const amountMax = parseFilterAmount(filters.amountMax);
  const periodFrom = resolveFilterIsoDate(filters.bidPeriodFrom);
  const periodTo = resolveFilterIsoDate(filters.bidPeriodTo);

  return sortBidsByDeadline(
    bids.filter((bid) => {
      if (filters.category && bid.bidCategory !== filters.category) return false;

      if (projectCode) {
        const bidCode = normalizeCode(bid.projectCode);
        if (!bidCode.includes(projectCode)) return false;
      }

      if (filters.tradeType && bid.tradeType !== filters.tradeType) return false;
      if (filters.divisionName && bid.divisionName !== filters.divisionName) return false;

      if (!overlapsBidPeriod(bid, periodFrom, periodTo)) return false;

      if (amountMin != null || amountMax != null) {
        if (bid.estimatedAmount == null) return false;
        if (amountMin != null && bid.estimatedAmount < amountMin) return false;
        if (amountMax != null && bid.estimatedAmount > amountMax) return false;
      }

      if (!keyword) return true;

      const haystack = [
        bid.title,
        bid.projectName,
        bid.projectCode,
        bid.clientName,
        bid.divisionName,
        bid.teamName,
        bid.tradeType,
        bid.bidMethod,
        bid.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    }),
  );
}

export function getBidDivisionOptions(bids: Bid[]): { value: string; label: string }[] {
  return [...new Set(bids.map((bid) => bid.divisionName))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((name) => ({ value: name, label: name }));
}

export function getBidTradeTypeOptions(bids: Bid[]): { value: string; label: string }[] {
  return [...new Set(bids.map((bid) => bid.tradeType).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((name) => ({ value: name, label: name }));
}

export function summarizeBidSearch(bids: Bid[], filtered: Bid[]): string {
  return `전체 ${bids.length}건 · 검색 ${filtered.length}건`;
}
