/** 재무 항목별 괄호·부호 처리 — 매출/자산/부채는 절대값, 손익 계정만 음수 허용 */
export type FinancialAmountAccount =
  | 'revenue'
  | 'costOfGoodsSold'
  | 'grossProfit'
  | 'sga'
  | 'operatingIncome'
  | 'netIncome'
  | 'totalAssets'
  | 'totalLiabilities'
  | 'equity'
  | 'cashAndEquivalents'
  | 'accountsReceivable'
  | 'currentAssets'
  | 'currentLiabilities'
  | 'shortTermDebt'
  | 'longTermDebt'
  | 'currentPortionLongTermDebt'
  | 'generic';

const ABSOLUTE_VALUE_ACCOUNTS = new Set<FinancialAmountAccount>([
  'revenue',
  'totalAssets',
  'totalLiabilities',
  'equity',
  'cashAndEquivalents',
  'accountsReceivable',
  'currentAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'currentPortionLongTermDebt',
]);

const SIGNED_PL_ACCOUNT = new Set<FinancialAmountAccount>([
  'costOfGoodsSold',
  'grossProfit',
  'sga',
  'operatingIncome',
  'netIncome',
]);

function stripThousandsSeparators(value: string): string {
  return value.replace(/[,，]/g, '').trim();
}

/**
 * 괄호 `(100)` — 대손충당금·감가상각누계액·손실 표시.
 * 매출·자산·부채 등 기본 항목은 절대값, 손익 계정만 음수 허용.
 */
export function parseFinancialAmountToken(
  raw: string,
  account: FinancialAmountAccount = 'generic',
): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;

  const parenMatch = trimmed.match(/^\(([0-9][\d,，]*(?:\.\d+)?)\)$/u);
  const explicitNegative = /^-/.test(trimmed);

  let numericBody = trimmed;
  if (parenMatch) {
    numericBody = parenMatch[1];
  } else {
    numericBody = trimmed.replace(/[^\d.,-]/g, '');
  }

  const cleaned = stripThousandsSeparators(numericBody.replace(/^-/u, ''));
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  if (ABSOLUTE_VALUE_ACCOUNTS.has(account)) {
    return Math.abs(parsed);
  }

  if (SIGNED_PL_ACCOUNT.has(account)) {
    if (parenMatch || explicitNegative) return -Math.abs(parsed);
    return parsed;
  }

  if (parenMatch || explicitNegative) return -Math.abs(parsed);
  return parsed;
}

export function parseFinancialAmountFromLine(
  text: string,
  account: FinancialAmountAccount = 'generic',
): number | null {
  const match = text.match(/(\(?-?\d[\d,，]*(?:\.\d+)?\)?)/u);
  if (!match?.[1]) return null;
  return parseFinancialAmountToken(match[1], account);
}
