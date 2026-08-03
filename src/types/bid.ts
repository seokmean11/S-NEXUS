export type BidStatus = '준비' | '진행' | '평가' | '낙찰' | '유찰' | '취소';

export type BidMethod = '전자입찰' | '공개입찰' | '수의계약' | '제한입찰';

/** 신규 입찰 / 기존(재입찰·연장) 구분 */
export type BidCategory = '신규' | '기존';

export interface Bid {
  id: string;
  title: string;
  projectName?: string;
  projectCode?: string;
  bidCategory: BidCategory;
  tradeType: string;
  clientName: string;
  divisionName: string;
  teamName?: string;
  bidMethod: BidMethod;
  estimatedAmount?: number;
  bidStartDate: string;
  bidDeadline: string;
  status: BidStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidSearchFilters {
  category: '' | BidCategory;
  keyword: string;
  projectCode: string;
  bidPeriodFrom: string;
  bidPeriodTo: string;
  tradeType: string;
  divisionName: string;
  amountMin: string;
  amountMax: string;
}

export const EMPTY_BID_SEARCH_FILTERS: BidSearchFilters = {
  category: '',
  keyword: '',
  projectCode: '',
  bidPeriodFrom: '',
  bidPeriodTo: '',
  tradeType: '',
  divisionName: '',
  amountMin: '',
  amountMax: '',
};
