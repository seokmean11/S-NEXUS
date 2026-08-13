export const COMPETITOR_SECTORS = ['전시사업', '인테리어'] as const;

export type CompetitorSector = (typeof COMPETITOR_SECTORS)[number];

export const COMPETITOR_DRIVE_ROOT_FOLDER = '경쟁사분석';

export type CompetitorDocumentType =
  | 'audit-report'
  | 'business-report'
  | 'credit-rating'
  | 'financial-sheet'
  | 'unknown';

export interface CompetitorNormalizedFinancials {
  revenue?: number;
  revenuePrior?: number;
  costOfGoodsSold?: number;
  costOfGoodsSoldPrior?: number;
  grossProfit?: number;
  grossProfitPrior?: number;
  sga?: number;
  sgaPrior?: number;
  operatingIncome?: number;
  operatingIncomePrior?: number;
  netIncome?: number;
  netIncomePrior?: number;
  totalAssets?: number;
  totalAssetsPrior?: number;
  totalLiabilities?: number;
  equity?: number;
  cashAndEquivalents?: number;
  cashAndEquivalentsMillion?: number;
  shortTermDebt?: number;
  shortTermDebtMillion?: number;
  longTermDebt?: number;
  longTermDebtMillion?: number;
  currentPortionLongTermDebt?: number;
  currentPortionLongTermDebtMillion?: number;
  accountsReceivable?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  cogsRatio?: number;
  sgaRatio?: number;
  operatingMargin?: number;
  currentRatio?: number;
  accountsReceivableTurnover?: number;
  employees?: number;
  creditRating?: string;
  currencyUnit: 'KRW';
  amountScale: '원' | '백만원';
}

export interface CompetitorMetric {
  key: string;
  label: string;
  value: string | number | null;
  unit?: string;
  /** PDF 표별 감지 단위 — 천원/원/백만원 (파서 정규화용) */
  amountUnit?: '원' | '천원' | '백만원';
}

export interface CompetitorParsedDocument {
  fileName: string;
  sector: CompetitorSector;
  year: number;
  fiscalYear?: number;
  documentType: CompetitorDocumentType;
  companyName?: string;
  auditFirm?: string;
  metrics: CompetitorMetric[];
  metadata?: {
    ceo_name?: string | null;
    foundation_year?: number | null;
    employees?: number | null;
    employees_prior?: number | null;
    employees_change?: number | null;
    credit_rating?: string | null;
    source_type?: string | null;
    source_file?: string | null;
  };
  rawTextPreview?: string;
  /** 단위 감지용 PDF 텍스트 (재정규화·캐시 복원) */
  unitContextText?: string;
  parsedAt: string;
  warnings: string[];
}

export interface CompetitorDriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export interface CompetitorDriveSyncMeta {
  syncedAt: string;
  folderId: string;
  year: number;
  sector: CompetitorSector;
  fileCount: number;
  files: Array<{ name: string; modifiedTime: string }>;
}

export interface CompetitorAnalysisSummary {
  year: number;
  sector: CompetitorSector;
  configured: boolean;
  driveConnected: boolean;
  uploadConfigured: boolean;
  folderPath: string;
  syncedAt?: string;
  fileCount: number;
  documents: CompetitorParsedDocument[];
  companies: Array<{
    companyName: string;
    fileCount: number;
    documentTypes: CompetitorDocumentType[];
    metrics: CompetitorMetric[];
    financials?: CompetitorNormalizedFinancials;
    sourceFile?: string;
  }>;
  dataSource?: 'structured-json' | 'pdf-parse';
}

export interface CompetitorTrendYearPoint {
  year: number;
  hasData: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingMargin: number | null;
  marketShare: number | null;
  cogsRatio: number | null;
  sgaRatio: number | null;
  currentRatio: number | null;
  accountsReceivableTurnover: number | null;
  employees: number | null;
  creditRating: string | null;
}

export interface CompetitorTrendAnalytics {
  revenueCagr?: number | null;
  operatingMarginChange?: number | null;
  marketShareChange?: number | null;
  yearSpan: number;
  dataYearCount?: number;
  missingYearCount?: number;
}

export interface CompetitorTrendCompanySeries {
  companyKey: string;
  companyName: string;
  series: CompetitorTrendYearPoint[];
  analytics: CompetitorTrendAnalytics;
}

export interface CompetitorTrendSummary {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  companies: CompetitorTrendCompanySeries[];
  sectorTotalsByYear: Array<{ year: number; totalRevenue: number; companyCount: number }>;
}

export interface CompetitorMultiYearCompanySeries {
  companyKey: string;
  companyName: string;
  isNewEntrant: boolean;
  series: CompetitorTrendYearPoint[];
  analytics: CompetitorTrendAnalytics;
}

export interface CompetitorMultiYearSummary {
  sector: CompetitorSector;
  baseYear: number;
  periodYears: number;
  fromYear: number;
  toYear: number;
  targetCompanyCount: number;
  companies: CompetitorMultiYearCompanySeries[];
  sectorTotalsByYear: Array<{ year: number; totalRevenue: number; companyCount: number }>;
}

/** Entity-based master JSON (master-competitor-data.json) */
export interface MasterCompetitorHistoryPoint {
  revenue: number | null;
  operating_income: number | null;
  op_margin: number | null;
  net_income: number | null;
  cogs_ratio: number | null;
  sga_ratio: number | null;
  current_ratio: number | null;
  ar_turnover: number | null;
  employees: number | null;
  credit_rating: string | null;
  has_data: boolean;
  fiscal_year: number;
  folder_year: number;
  source_files: string[];
  document_type: string;
  parsed_at: string;
}

export interface MasterCompetitorEntity {
  companyKey: string;
  companyName: string;
  sector: CompetitorSector;
  sectorSlug: 'exhibition' | 'interior';
  history: Record<string, MasterCompetitorHistoryPoint>;
}

export interface MasterCompetitorData {
  version: number;
  updatedAt: string;
  scanSignatures: Record<string, string>;
  companies: Record<string, MasterCompetitorEntity>;
}
