import type {
  CompetitorStandardAmounts,
  CompetitorStandardFinancials,
  CompetitorStandardRatios,
  CompetitorStandardRecord,
} from '@/types/competitorStandard';

/** 대시보드 차트용 — amounts + ratios 단일 뷰 (UI 변경 없이 사용) */
export type CompetitorStandardFinancialView = CompetitorStandardAmounts & CompetitorStandardRatios;

export function getStandardFinancialView(record: CompetitorStandardRecord): CompetitorStandardFinancialView {
  return {
    ...record.financials,
    ...record.ratios,
  };
}

/** 레거시 타입 호환 — ratios가 financials에 섞여 있던 이전 캐시 대응 */
export function resolveStandardFinancialView(
  record: CompetitorStandardRecord & { financials?: Partial<CompetitorStandardFinancials> },
): CompetitorStandardFinancialView {
  if (record.ratios != null) {
    return getStandardFinancialView(record as CompetitorStandardRecord);
  }

  const legacy = record.financials as CompetitorStandardFinancials | undefined;
  return {
    unit: '백만원',
    revenue: legacy?.revenue ?? null,
    cogs: legacy?.cogs ?? null,
    gross_profit: legacy?.gross_profit ?? null,
    sga: legacy?.sga ?? null,
    operating_profit: legacy?.operating_profit ?? null,
    net_income: legacy?.net_income ?? null,
    total_assets: legacy?.total_assets ?? null,
    current_assets: legacy?.current_assets ?? null,
    cash_assets: legacy?.cash_assets ?? null,
    total_liabilities: legacy?.total_liabilities ?? null,
    current_liabilities: legacy?.current_liabilities ?? null,
    short_term_debt: legacy?.short_term_debt ?? null,
    long_term_debt: legacy?.long_term_debt ?? null,
    total_equity: legacy?.total_equity ?? null,
    total_debt: legacy?.total_debt ?? null,
    receivables: legacy?.receivables ?? null,
    cogs_ratio: legacy?.cogs_ratio ?? null,
    sga_ratio: legacy?.sga_ratio ?? null,
    operating_margin: legacy?.operating_margin ?? null,
    debt_ratio: legacy?.debt_ratio ?? null,
    receivables_turnover: legacy?.receivables_turnover ?? null,
  };
}
