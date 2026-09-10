import type { FundBillingContractRevision } from '@/types/fundBillingReport';

export function contractRevisionLabel(sequence: number): string {
  if (sequence <= 0) return '최초';
  return `${sequence}차변경`;
}

export function ensureContractHistory(
  contractAmount: number,
  history?: FundBillingContractRevision[],
): FundBillingContractRevision[] {
  if (history && history.length > 0) {
    return history.map((item) => ({ ...item }));
  }
  return [
    {
      sequence: 0,
      label: '최초',
      amount: contractAmount,
      changedAt: '',
    },
  ];
}

export function nextContractRevisionSequence(history: FundBillingContractRevision[]): number {
  return history.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
}

export function appendContractRevision(
  contractAmount: number,
  history: FundBillingContractRevision[] | undefined,
  nextAmount: number,
): { contractAmount: number; contractAmountHistory: FundBillingContractRevision[] } {
  const current = ensureContractHistory(contractAmount, history);
  const sequence = nextContractRevisionSequence(current);
  return {
    contractAmount: nextAmount,
    contractAmountHistory: [
      ...current,
      {
        sequence,
        label: contractRevisionLabel(sequence),
        amount: nextAmount,
        changedAt: new Date().toISOString(),
      },
    ],
  };
}

export function updateContractRevisionAmount(
  contractAmount: number,
  history: FundBillingContractRevision[] | undefined,
  sequence: number,
  nextAmount: number,
): { contractAmount: number; contractAmountHistory: FundBillingContractRevision[] } {
  const current = ensureContractHistory(contractAmount, history);
  const contractAmountHistory = current.map((item) =>
    item.sequence === sequence
      ? { ...item, amount: nextAmount, changedAt: new Date().toISOString() }
      : item,
  );
  const latest = contractAmountHistory[contractAmountHistory.length - 1];
  return {
    contractAmount: latest?.amount ?? nextAmount,
    contractAmountHistory,
  };
}

export function removeLatestContractRevision(
  contractAmount: number,
  history: FundBillingContractRevision[] | undefined,
): { contractAmount: number; contractAmountHistory: FundBillingContractRevision[] } | null {
  const current = ensureContractHistory(contractAmount, history);
  if (current.length <= 1) return null;
  const contractAmountHistory = current.slice(0, -1);
  const latest = contractAmountHistory[contractAmountHistory.length - 1];
  return {
    contractAmount: latest?.amount ?? 0,
    contractAmountHistory,
  };
}
