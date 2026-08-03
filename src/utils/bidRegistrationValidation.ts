import type { BidRegistrationForm } from '@/types/bidRegistration';
import { isCompleteKoreanDateTime, parseAmountInput } from '@/utils/formatInput';

export function getBidRegistrationMissingFields(
  form: BidRegistrationForm,
  selectedProjectId: string,
): string[] {
  const missing: string[] = [];

  if (!selectedProjectId) missing.push('프로젝트 선택');
  if (!form.projectName.trim()) missing.push('프로젝트명');
  if (!form.projectCode.replace(/\D/g, '') && !form.projectCode.trim()) missing.push('프로젝트 코드');
  if (!form.clientName.trim()) missing.push('발주처');
  if (!form.divisionId) missing.push('사업본부');
  if (!form.teamId) missing.push('담당팀');
  if (!form.tradeType.trim()) missing.push('외주공종');
  if (!form.bidMethod) missing.push('입찰방식');

  const orderAmount = parseAmountInput(form.orderAmount);
  if (orderAmount == null || orderAmount <= 0) missing.push('수주금액');

  const executionBudget = parseAmountInput(form.executionBudget);
  if (executionBudget == null || executionBudget <= 0) missing.push('실행예산');

  if (!isCompleteKoreanDateTime(form.bidDateTime)) missing.push('입찰일시(12자리)');

  return missing;
}

export function isBidRegistrationComplete(
  form: BidRegistrationForm,
  selectedProjectId: string,
): boolean {
  return getBidRegistrationMissingFields(form, selectedProjectId).length === 0;
}
