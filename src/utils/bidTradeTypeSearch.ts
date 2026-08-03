import type { Bid } from '@/types/bid';
import { BID_TRADE_TYPE_OPTIONS } from '@/types/bidRegistration';

export function collectBidTradeTypes(bids: Bid[]): string[] {
  const fromBids = bids.map((bid) => bid.tradeType);
  return [...new Set([...BID_TRADE_TYPE_OPTIONS, ...fromBids])].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
}

export function filterBidTradeTypes(tradeTypes: string[], keyword: string): string[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return tradeTypes;
  return tradeTypes.filter((trade) => trade.toLowerCase().includes(query));
}
