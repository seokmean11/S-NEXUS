export const FUND_MANAGEMENT_SUB_ITEMS = [
  { path: '/fund/billing', label: '기성관리' },
  { path: '/fund/cash-analysis', label: '자금수지' },
] as const;

export function isFundManagementSectionPath(pathname: string): boolean {
  return pathname.startsWith('/fund');
}
