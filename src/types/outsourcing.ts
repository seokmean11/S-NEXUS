export interface OutsourcingRecord {
  division: string;
  project: string;
  vendor: string;
  vendorLabel: string;
  contractDate: string;
  contractTimestamp: number | null;
  contract: string;
  budget: string;
  spec: string;
  unit: string;
  contractQty: number;
  contractUnitPrice: number;
  contractAmount: number;
  executionQty: number;
  executionUnitPrice: number;
  executionAmount: number;
  outsourcingQty: number;
  outsourcingUnitPrice: number;
  totalAmount: number;
  materialAmount: number;
  laborAmount: number;
  expenseAmount: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  expenseUnitPrice: number;
  materialQty: number;
  laborQty: number;
  expenseQty: number;
}

export type OutsourcingFilterKey =
  | 'division'
  | 'project'
  | 'vendor'
  | 'contract'
  | 'budget'
  | 'spec'
  | 'unit';

/** 스프레드시트 1행 헤더명과 동일 */
export const OUTSOURCING_FILTER_LABELS: Record<OutsourcingFilterKey, string> = {
  division: '사업부(실)',
  project: '프로젝트명',
  vendor: '업체명',
  contract: '외주계약명',
  budget: '실행예산명',
  spec: '규격내역',
  unit: '단위',
};

export const OUTSOURCING_FILTER_ORDER: OutsourcingFilterKey[] = [
  'division',
  'project',
  'vendor',
  'contract',
  'budget',
  'spec',
  'unit',
];

/** 사업부(실) 선택 목록 표시 순서 */
export const OUTSOURCING_DIVISION_ORDER = [
  '전시사업본부',
  '뉴미디어사업실',
  '해외사업실',
  '인테리어사업부',
] as const;

export interface OutsourcingFilterFieldState {
  keyword: string;
  selected: string[];
}

export type OutsourcingFilters = Record<OutsourcingFilterKey, OutsourcingFilterFieldState>;

export const EMPTY_OUTSOURCING_FILTER_FIELD: OutsourcingFilterFieldState = {
  keyword: '',
  selected: [],
};

export const EMPTY_OUTSOURCING_FILTERS: OutsourcingFilters = {
  division: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  project: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  vendor: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  contract: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  budget: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  spec: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
  unit: { ...EMPTY_OUTSOURCING_FILTER_FIELD },
};

export interface OutsourcingDateRange {
  startDigits: string;
  endDigits: string;
}

export const EMPTY_OUTSOURCING_DATE_RANGE: OutsourcingDateRange = {
  startDigits: '',
  endDigits: '',
};

export interface UnitPriceStats {
  average: number;
  max: number;
  min: number;
  quantity: number;
}

export interface OutsourcingKpiSummary {
  totalAmount: number;
  materialTotal: number;
  laborTotal: number;
  expenseTotal: number;
  materialUnitPrice: UnitPriceStats;
  laborUnitPrice: UnitPriceStats;
  expenseUnitPrice: UnitPriceStats;
}

export interface VendorChartItem {
  vendorLabel: string;
  amount: number;
  sharePercent: number;
  materialAmount: number;
  laborAmount: number;
  expenseAmount: number;
  recordCount: number;
}
