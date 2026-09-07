export type FundBillingSpendKind = 'subcontract' | 'advance' | 'labor' | 'other';

export interface FundBillingContractRevision {
  sequence: number;
  label: string;
  amount: number;
  changedAt: string;
}

export interface FundBillingSpendLine {
  id: string;
  kind: FundBillingSpendKind;
  no: string;
  tradeType: string;
  vendorName: string;
  contractAmount: number;
  contractAmountHistory?: FundBillingContractRevision[];
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  added?: boolean;
  manualEdit?: boolean;
  /** true면 공통비 관리팀검수를 수식 대신 수기 유지 */
  commonInspectedManual?: boolean;
}

/** 월별 기성보고서 1건 — 프로젝트 × 기성월이 원천 */
export interface FundBillingReport {
  id: string;
  monthKey: string;
  projectName: string;
  projectCode: string;
  department: string;
  contractAmount: number;
  startDate: string;
  endDate: string;
  writtenDate: string;
  pmName: string;
  collectedPrior: number;
  expectedCollection: number;
  /** 실행예산 직접원가 — 공통비 검수 산출 분모 */
  directCostBudget: number;
  linkedProjectId: string;
  overheads: FundBillingSpendLine[];
  lines: FundBillingSpendLine[];
  updatedAt: string;
}

export interface FundBillingLedgerState {
  reports: FundBillingReport[];
  updatedAt?: string;
}
