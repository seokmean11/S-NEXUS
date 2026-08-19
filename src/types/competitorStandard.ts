/** 공통 표준 스키마 — PDF 파싱 결과 (금액: 백million원) */
export interface CompetitorStandardMetadata {
  ceo_name: string | null;
  foundation_year: number | null;
  employees: number | null;
  employees_change: number | null;
  credit_rating: string | null;
  source_type: string | null;
  source_file: string | null;
}

/** 금액 전용 — ratios 미포함 */
export interface CompetitorStandardAmounts {
  unit: '백만원';
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  sga: number | null;
  operating_profit: number | null;
  net_income: number | null;
  total_assets: number | null;
  current_assets: number | null;
  cash_assets: number | null;
  total_liabilities: number | null;
  current_liabilities: number | null;
  short_term_debt: number | null;
  long_term_debt: number | null;
  total_equity: number | null;
  total_debt: number | null;
  receivables: number | null;
}

export interface CompetitorStandardRatios {
  cogs_ratio: number | null;
  sga_ratio: number | null;
  operating_margin: number | null;
  debt_ratio: number | null;
  receivables_turnover: number | null;
}

/** 대시보드 차트 호환용 — amounts + ratios */
export type CompetitorStandardFinancials = CompetitorStandardAmounts & CompetitorStandardRatios;

export interface CompetitorStandardRecord {
  company_name: string;
  biz_no: string | null;
  year: number;
  metadata: CompetitorStandardMetadata;
  financials: CompetitorStandardAmounts;
  ratios: CompetitorStandardRatios;
  has_data: boolean;
  /** @deprecated metadata.source_file 사용 */
  source_file?: string;
  /** @deprecated metadata.source_type 사용 */
  source_type?: string;
  document_type?: string;
}

export interface CompetitorExecutiveSummary {
  year: number;
  sector: string;
  updatedAt: string;
  records: CompetitorStandardRecord[];
}

export interface ExecutiveTimelinePoint {
  year: number;
  companyCount: number;
  avgRevenue: number | null;
  avgOperatingMargin: number | null;
  totalRevenue: number | null;
}

export interface CompetitorAnalysisPeriodWarning {
  kind: 'missing_year' | 'start_fallback' | 'end_fallback' | 'drive';
  year: number;
  message: string;
  fallbackYear?: number;
}

/** 생산성 분석 전용 — 신용분석보고서에서 별도 추출, competitor-data.json과 분리 */
export interface ProductivityEmployeeEntry {
  companyKey: string;
  companyName: string;
  biz_no?: string | null;
  employees: number;
  employees_prior: number | null;
  referenceYear: number;
  source_file: string;
  source_type: 'credit-report';
}

/** 소속산업 분석 — 신용분석보고서에서 별도 추출, competitor-data.json과 분리 */
export interface IndustryAnalysisRatios {
  debt_ratio: number | null;
  operating_margin: number | null;
  current_ratio: number | null;
}

export interface IndustryAnalysisEntry {
  companyKey: string;
  companyName: string;
  biz_no?: string | null;
  industryName: string | null;
  industryCode?: string | null;
  referenceYear: number;
  companyRatios: IndustryAnalysisRatios;
  industryAverage: IndustryAnalysisRatios;
  /** 03. 소속산업 분석 — 업종평균 표의 연도별 부채비율(%) */
  industryDebtRatioByYear?: Record<string, number>;
  source_file: string;
  source_type: 'credit-report';
}

export interface CompetitorExecutiveMultiYearSummary {
  sector: string;
  fromYear: number;
  toYear: number;
  baseYear: number;
  requestedFromYear?: number;
  requestedToYear?: number;
  effectiveFromYear?: number | null;
  effectiveToYear?: number | null;
  warnings?: CompetitorAnalysisPeriodWarning[];
  updatedAt: string;
  records: CompetitorStandardRecord[];
  recordsByYear: Record<string, CompetitorStandardRecord[]>;
  timeline: ExecutiveTimelinePoint[];
  /** Drive 폴더 연도별 신용분석보고서 종업원 추출 (기존 structured 데이터 비변경) */
  productivityEmployeesByYear?: Record<string, Record<string, ProductivityEmployeeEntry>>;
  /** Drive 폴더 연도별 신용분석보고서 소속산업 분석 추출 (기존 structured 데이터 비변경) */
  industryAnalysisByYear?: Record<string, Record<string, IndustryAnalysisEntry>>;
}
