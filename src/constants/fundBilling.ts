export const FUND_BILLING_DEPARTMENTS = ['전시', '인테리어', '셀프스토리지'] as const;

export type FundBillingDepartment = (typeof FUND_BILLING_DEPARTMENTS)[number];

const INTERIOR_PROJECT_NAME_HINTS = [
  '제주드림타워',
  '하이원워터월드',
  '강원랜드영업장리모델링',
  '광교중흥S클래스',
];

export function mapTextToFundBillingDepartment(
  ...texts: Array<string | undefined>
): FundBillingDepartment {
  const joined = texts.filter(Boolean).join(' ');

  if (joined.includes('셀프')) return '셀프스토리지';
  if (INTERIOR_PROJECT_NAME_HINTS.some((name) => joined.replace(/\s+/g, '').includes(name.replace(/\s+/g, '')))) {
    return '인테리어';
  }
  if (joined.includes('인테리어')) return '인테리어';
  return '전시';
}
