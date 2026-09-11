export const FUND_BILLING_DEPARTMENTS = [
  '전시',
  '인테리어',
  '설계',
  '시스템',
  '기타프로젝트',
] as const;

export type FundBillingDepartment = (typeof FUND_BILLING_DEPARTMENTS)[number];

const INTERIOR_PROJECT_NAME_HINTS = [
  '제주드림타워',
  '하이원워터월드',
  '강원랜드영업장리모델링',
  '광교중흥S클래스',
];

export function isFundBillingDepartment(value: string): value is FundBillingDepartment {
  return (FUND_BILLING_DEPARTMENTS as readonly string[]).includes(value);
}

export function mapTextToFundBillingDepartment(
  ...texts: Array<string | undefined>
): FundBillingDepartment {
  for (const text of texts) {
    const value = (text ?? '').trim();
    if (isFundBillingDepartment(value)) return value;
  }

  const joined = texts.filter(Boolean).join(' ');

  if (joined.includes('셀프') || joined.includes('기타 프로젝트') || joined.includes('기타프로젝트')) {
    return '기타프로젝트';
  }
  if (texts.some((text) => (text ?? '').trim() === '기타')) return '기타프로젝트';
  if (INTERIOR_PROJECT_NAME_HINTS.some((name) => joined.replace(/\s+/g, '').includes(name.replace(/\s+/g, '')))) {
    return '인테리어';
  }
  if (joined.includes('인테리어')) return '인테리어';
  if (joined.includes('시스템')) return '시스템';
  if (joined.includes('설계')) return '설계';
  return '전시';
}
