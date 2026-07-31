export type AmendmentSequence = 1 | 2 | 3 | 4 | 5;

/** 계약변경 패널에서 선택하는 수정 대상 */
export type ContractEditTarget = 'initial' | AmendmentSequence;

export const MAX_CONTRACT_AMENDMENTS = 5;

export interface ContractSnapshot {
  contractAmount?: number;
  startDate: string;
  endDate?: string;
}

export interface ContractAmendment {
  id: string;
  projectId: string;
  sequence: AmendmentSequence;
  contractAmount?: number;
  startDate: string;
  endDate?: string;
  registeredBy: string;
  registeredByName: string;
  registeredAt: string;
}

export interface ContractTimelineRow {
  key: string;
  label: string;
  sequence?: AmendmentSequence;
  snapshot: ContractSnapshot;
  amountDelta?: string;
  startDateDelta?: string;
  endDateDelta?: string;
}

/** 보고서·엑셀 추출용 flat row */
export interface ContractChangeExportRow {
  projectId: string;
  projectCode?: string;
  projectName: string;
  label: string;
  sequence?: AmendmentSequence;
  contractAmount?: number;
  startDate: string;
  endDate?: string;
  amountDelta?: string;
  startDateDelta?: string;
  endDateDelta?: string;
  registeredAt?: string;
  registeredByName?: string;
}
