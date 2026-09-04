import type { FundBillingLedgerState } from '@/types/fundBillingReport';

export async function fetchFundBillingLedger(): Promise<FundBillingLedgerState | null> {
  try {
    const response = await fetch('/api/fund-billing/ledger');
    if (!response.ok) return null;
    const payload = (await response.json()) as { ledger?: FundBillingLedgerState | null };
    return payload.ledger ?? null;
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
