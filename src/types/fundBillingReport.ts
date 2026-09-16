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
  /** true면 공통비 기지출금액을 수식 대신 수기 유지 */
  commonPriorPaidManual?: boolean;
  /** 간접비 기지출 = 하도급금액 ÷ 공사 총개월수 × 공사진행 개월수 */
  constructionTotalMonths?: number;
  constructionElapsedMonths?: number;
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
  /** 담당자가 종결한 프로젝트. 이후 월별 기성보고서 작성 불가 */
  closed?: boolean;
  /** 종결이 적용되는 기성월. 이 월부터 검색 목록에 미반영 */
  closedMonthKey?: string;
  updatedAt: string;
}

export interface FundBillingLedgerState {
  reports: FundBillingReport[];
  updatedAt?: string;
}
