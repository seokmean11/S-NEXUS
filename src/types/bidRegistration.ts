/** 신규 등록 입찰방식 */
export type BidRegistrationMethod = '가격경쟁입찰' | '제안경쟁입찰';

export interface BidRegistrationForm {
  projectName: string;
  projectCode: string;
  clientName: string;
  divisionId: string;
  teamId: string;
  tradeType: string;
  bidMethod: BidRegistrationMethod | '';
  executionBudget: string;
  orderAmount: string;
  bidDateTime: string;
}

export interface BidPartnerEntry {
  id: string;
  vendorName: string;
  file: File;
}

/** @deprecated BidPartnerEntry 사용 */
export type BidQuotationAttachment = BidPartnerEntry;

export const BID_TRADE_TYPE_OPTIONS = [
  '전시',
  '인테리어',
  '건축',
  'IT/플랫폼',
  'AV/조명',
  '토목/구조',
  '설비',
  '기타',
] as const;

export const BID_REGISTRATION_METHOD_OPTIONS: {
  value: BidRegistrationMethod;
  label: string;
}[] = [
  { value: '가격경쟁입찰', label: '가격경쟁입찰' },
  { value: '제안경쟁입찰', label: '제안경쟁입찰' },
];

export const EMPTY_BID_REGISTRATION_FORM: BidRegistrationForm = {
  projectName: '',
  projectCode: '',
  clientName: '',
  divisionId: '',
  teamId: '',
  tradeType: '',
  bidMethod: '',
  executionBudget: '',
  orderAmount: '',
  bidDateTime: '',
};

/** 외주발주 입찰 정보 필드만 비울 때 사용 */
export const EMPTY_OUTSOURCING_BID_FIELDS: Pick<
  BidRegistrationForm,
  'tradeType' | 'bidMethod' | 'executionBudget' | 'orderAmount' | 'bidDateTime'
> = {
  tradeType: '',
  bidMethod: '',
  executionBudget: '',
  orderAmount: '',
  bidDateTime: '',
};

export function clearOutsourcingBidFields(form: BidRegistrationForm): BidRegistrationForm {
  return { ...form, ...EMPTY_OUTSOURCING_BID_FIELDS };
}
