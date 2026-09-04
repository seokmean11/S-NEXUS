export const FUND_BILLING_DEPARTMENTS = [
  '전시사업부',
  '뉴미디어사업실',
  '해외사업실',
  '인테리어사업부',
  '셀프스토리지',
] as const;

export type FundBillingDepartment = (typeof FUND_BILLING_DEPARTMENTS)[number];

export function mapTextToFundBillingDepartment(
  ...texts: Array<string | undefined>
): FundBillingDepartment {
  const joined = texts.filter(Boolean).join(' ');

  if (joined.includes('셀프')) return '셀프스토리지';
  if (joined.includes('인테리어')) return '인테리어사업부';
  if (joined.includes('해외')) return '해외사업실';
  if (joined.includes('뉴미디어')) return '뉴미디어사업실';
  return '전시사업부';
}
