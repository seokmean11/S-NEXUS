import type { ProjectStatus } from '@/types';

/** 발주처 수금(청구·입금) — 프로젝트 × 차수 */
export interface FundCollection {
  id: string;
  projectId: string;
  sequence: number;
  billedAmount: number;
  collectedAmount: number;
  collectedDate?: string;
  note?: string;
}

/** 하도급 계약 — 프로젝트 × 업체 × 공종 */
export interface FundSubcontract {
  id: string;
  projectId: string;
  vendorName: string;
  tradeType: string;
  contractAmount: number;
  contractDate?: string;
  priorPaid?: number;
  monthClaim?: number;
  inspected?: number;
  cumulativeBilling?: number;
  remain?: number;
}

/** 하도급 기성·지급 — 하도급계약 × 차수 */
export interface FundSubcontractBilling {
  id: string;
  projectId: string;
  subcontractId: string;
  sequence: number;
  billingAmount: number;
  paidAmount: number;
  paidDate?: string;
  note?: string;
}

export interface FundBillingLedger {
  collections: FundCollection[];
  subcontracts: FundSubcontract[];
  billings: FundSubcontractBilling[];
}

export type FundBillingQuickFilter =
  | 'all'
  | 'active'
  | 'completed'
  | 'uncollected'
  | 'unpaid'
  | 'cashShort';

/** 집계현황 1행 — 엑셀보내기·검색·분석 컬럼 */
export interface FundBillingProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  divisionId: string;
  divisionName: string;
  teamName: string;
  status: ProjectStatus;
  startDate: string;
  endDate?: string;
  pmName?: string;
  contractAmount: number;
  billedTotal: number;
  collectedPrior: number;
  collectedTotal: number;
  expectedCollectionMonth: number;
  uncollected: number;
  collectionRate: number;
  subcontractCount: number;
  subcontractContractTotal: number;
  subcontractPriorBilling: number;
  expectedBillingMonth: number;
  subcontractBillingTotal: number;
  paidTotal: number;
  unpaid: number;
  netCash: number;
  cashRate: number;
}

export interface FundBillingKpis {
  projectCount: number;
  contractAmount: number;
  collectedPrior: number;
  expectedCollectionMonth: number;
  collectedTotal: number;
  uncollected: number;
  subcontractCount: number;
  subcontractContractTotal: number;
  subcontractPriorBilling: number;
  expectedBillingMonth: number;
  subcontractBillingTotal: number;
  unpaid: number;
  netCash: number;
}
