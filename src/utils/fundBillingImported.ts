import { mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import imported from '@/data/fundBillingImported.json';
import type { FundBillingLedger, FundBillingProjectRow } from '@/types/fundBilling';

interface ImportedVendor {
  no: string;
  tradeType: string;
  vendorName: string;
  contractAmount: number;
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  cumulative: number;
  remain: number;
}

export interface ImportedFundBillingOverhead {
  key: string;
  label: string;
  contractAmount: number;
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  cumulative: number;
  remain: number;
}

export interface ImportedFundBillingProject {
  id: string;
  summaryName: string;
  sheetName: string;
  pmName: string;
  group: string;
  contractAmount: number;
  startDate: string;
  endDate: string;
  collectedPrior: number;
  collectedExpectedMonth: number;
  collectedTotal: number;
  spentPrior: number;
  totalBudget: number;
  cumulativeBilling: number;
  netCash: number;
  overheads?: ImportedFundBillingOverhead[];
  vendors: ImportedVendor[];
}

export const IMPORTED_FUND_BILLING_AS_OF = imported.asOf;
const AS_OF = IMPORTED_FUND_BILLING_AS_OF;
const PROJECTS = imported.projects as ImportedFundBillingProject[];

export function getImportedFundBillingProjects(): ImportedFundBillingProject[] {
  return PROJECTS;
}

export function findImportedFundBillingProject(projectId: string): ImportedFundBillingProject | undefined {
  return PROJECTS.find((item) => item.id === projectId);
}

export function buildImportedFundBillingRows(): FundBillingProjectRow[] {
  return PROJECTS.map((project) => toRow(project));
}

export function buildImportedFundBillingLedger(): FundBillingLedger {
  const collections = PROJECTS.map((project) => ({
    id: `${project.id}-col-1`,
    projectId: project.id,
    sequence: 1,
    billedAmount: project.collectedTotal + project.collectedExpectedMonth,
    collectedAmount: project.collectedTotal,
    collectedDate: AS_OF,
    note: project.collectedExpectedMonth
      ? `금월수금예정 ${project.collectedExpectedMonth.toLocaleString('ko-KR')}원`
      : '수금누계',
  }));

  const subcontracts = PROJECTS.flatMap((project) =>
    project.vendors.map((vendor, index) => ({
      id: `${project.id}-sc-${vendor.no}-${index + 1}`,
      projectId: project.id,
      vendorName: vendor.vendorName,
      tradeType: vendor.tradeType,
      contractAmount: vendor.contractAmount,
      priorPaid: vendor.priorPaid,
      monthClaim: vendor.monthClaim,
      inspected: vendor.inspected,
      cumulativeBilling: vendor.cumulative,
      remain: vendor.remain,
    })),
  );

  const billings = subcontracts.map((subcontract) => ({
    id: `${subcontract.id}-bill-1`,
    projectId: subcontract.projectId,
    subcontractId: subcontract.id,
    sequence: 1,
    billingAmount: subcontract.cumulativeBilling ?? 0,
    paidAmount: subcontract.priorPaid ?? 0,
    paidDate: AS_OF,
    note: '월별 기성보고서 누계',
  }));

  return { collections, subcontracts, billings };
}

function toRow(project: ImportedFundBillingProject): FundBillingProjectRow {
  const subcontractContractTotal = project.vendors.reduce((sum, vendor) => sum + vendor.contractAmount, 0);
  const subcontractPriorBilling = project.vendors.reduce((sum, vendor) => sum + vendor.priorPaid, 0);
  const expectedBillingMonth = project.vendors.reduce((sum, vendor) => sum + vendor.monthClaim, 0);
  const unpaid = project.vendors.reduce((sum, vendor) => sum + vendor.remain, 0);
  const paidTotal = project.vendors.reduce((sum, vendor) => sum + vendor.cumulative, 0);
  const uncollected = Math.max(0, project.contractAmount - project.collectedTotal);
  const department = mapTextToFundBillingDepartment(project.group);

  return {
    projectId: project.id,
    projectCode: project.sheetName,
    projectName: project.summaryName,
    clientName: project.sheetName,
    divisionId: department,
    divisionName: department,
    teamName: project.pmName || '-',
    status: '진행',
    startDate: project.startDate,
    endDate: project.endDate,
    pmName: project.pmName,
    contractAmount: project.contractAmount,
    billedTotal: project.collectedPrior + project.collectedExpectedMonth,
    collectedPrior: project.collectedPrior,
    collectedTotal: project.collectedTotal,
    expectedCollectionMonth: project.collectedExpectedMonth,
    uncollected,
    collectionRate: project.contractAmount > 0 ? (project.collectedTotal / project.contractAmount) * 100 : 0,
    subcontractCount: project.vendors.length,
    subcontractContractTotal,
    subcontractPriorBilling,
    expectedBillingMonth,
    subcontractBillingTotal: project.cumulativeBilling,
    paidTotal,
    unpaid,
    netCash: project.netCash,
    cashRate: project.contractAmount > 0 ? (project.netCash / project.contractAmount) * 100 : 0,
  };
}
