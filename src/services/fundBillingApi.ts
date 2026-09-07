import type { FundBillingLedgerState } from '@/types/fundBillingReport';

export interface FundBillingLedgerResponse {
  ledger: FundBillingLedgerState | null;
  writable: boolean;
  source?: 'drive' | 'sandbox' | 'local';
}

export async function fetchFundBillingLedger(): Promise<FundBillingLedgerResponse | null> {
  try {
    const response = await fetch('/api/fund-billing/ledger');
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      ledger?: FundBillingLedgerState | null;
      writable?: boolean;
      source?: FundBillingLedgerResponse['source'];
    };
    return {
      ledger: payload.ledger ?? null,
      writable: payload.writable === true,
      source: payload.source,
    };
  } catch {
    return null;
  }
}

export async function saveFundBillingLedger(ledger: FundBillingLedgerState): Promise<boolean> {
  try {
    const response = await fetch('/api/fund-billing/ledger', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledger }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
