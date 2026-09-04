import type { Project } from '@/types';
import type {
  FundBillingLedger,
  FundCollection,
  FundSubcontract,
  FundSubcontractBilling,
} from '@/types/fundBilling';

const VENDORS = ['한빛설비', '신진금속', '유림목재', '태성전기', '동아석고', '세진도장', '고려경량'];
const TRADES = ['설비', '금속', '목공', '전기', '석고', '도장', '경량'];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(hash: number, salt: number): number {
  const x = Math.sin(hash + salt * 17.13) * 10000;
  return x - Math.floor(x);
}

function roundAmount(value: number): number {
  return Math.max(0, Math.round(value / 1000) * 1000);
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 등록 프로젝트 기준 샘플 원장. 이후 실입력·엑셀 이관으로 대체 */
export function buildMockFundBillingLedger(projects: Project[]): FundBillingLedger {
  const collections: FundCollection[] = [];
  const subcontracts: FundSubcontract[] = [];
  const billings: FundSubcontractBilling[] = [];

  for (const project of projects) {
    const contract = project.contractAmount ?? 0;
    if (contract <= 0) continue;

    const hash = hashString(project.id);
    const startDate = project.startDate || '2025-01-01';
    const collectionCount = 2 + Math.floor(unit(hash, 1) * 3);
    const targetCollectRate = 0.48 + unit(hash, 2) * 0.42;
    let collectedSoFar = 0;

    for (let sequence = 1; sequence <= collectionCount; sequence += 1) {
      const isLast = sequence === collectionCount;
      const share = isLast
        ? Math.max(0.08, targetCollectRate - collectedSoFar / contract)
        : (targetCollectRate / collectionCount) * (0.75 + unit(hash, 10 + sequence) * 0.5);
      const billedAmount = roundAmount(contract * share);
      const collectRatio = 0.7 + unit(hash, 30 + sequence) * 0.3;
      const collectedAmount = roundAmount(billedAmount * collectRatio);
      collectedSoFar += collectedAmount;
      collections.push({
        id: `${project.id}-col-${sequence}`,
        projectId: project.id,
        sequence,
        billedAmount,
        collectedAmount,
        collectedDate: shiftDate(startDate, 40 * sequence),
        note: sequence === 1 ? '선급·1차 기성' : `${sequence}차 기성 수금`,
      });
    }

    const subcontractCount = 2 + Math.floor(unit(hash, 4) * 3);
    const subcontractBudgetRate = 0.52 + unit(hash, 5) * 0.22;
    let allocated = 0;

    for (let index = 0; index < subcontractCount; index += 1) {
      const vendorIndex = Math.floor(unit(hash, 50 + index) * VENDORS.length);
      const isLast = index === subcontractCount - 1;
      const share = isLast
        ? Math.max(0.08, subcontractBudgetRate - allocated / contract)
        : (subcontractBudgetRate / subcontractCount) * (0.7 + unit(hash, 60 + index) * 0.6);
      const contractAmount = roundAmount(contract * share);
      allocated += contractAmount;
      const subcontractId = `${project.id}-sc-${index + 1}`;
      subcontracts.push({
        id: subcontractId,
        projectId: project.id,
        vendorName: VENDORS[vendorIndex] ?? VENDORS[0],
        tradeType: TRADES[vendorIndex] ?? TRADES[0],
        contractAmount,
        contractDate: shiftDate(startDate, 10 + index * 7),
      });

      const billingCount = 1 + Math.floor(unit(hash, 80 + index) * 3);
      const billingRate = 0.45 + unit(hash, 90 + index) * 0.5;
      let billedSoFar = 0;

      for (let sequence = 1; sequence <= billingCount; sequence += 1) {
        const lastBilling = sequence === billingCount;
        const billingShare = lastBilling
          ? Math.max(0.1, billingRate - billedSoFar / contractAmount)
          : (billingRate / billingCount) * (0.8 + unit(hash, 100 + index + sequence) * 0.4);
        const billingAmount = roundAmount(contractAmount * billingShare);
        billedSoFar += billingAmount;
        const paidRatio = 0.55 + unit(hash, 120 + index + sequence) * 0.45;
        billings.push({
          id: `${subcontractId}-bill-${sequence}`,
          projectId: project.id,
          subcontractId,
          sequence,
          billingAmount,
          paidAmount: roundAmount(billingAmount * paidRatio),
          paidDate: shiftDate(startDate, 35 * sequence + index * 3),
          note: `${sequence}차 기성`,
        });
      }
    }
  }

  return { collections, subcontracts, billings };
}
