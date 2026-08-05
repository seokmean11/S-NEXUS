import type { OutsourcingRecord } from '@/types/outsourcing';

import { OUTSOURCING_DIVISION_ORDER } from '@/types/outsourcing';



export interface OutsourcingDbVolumeStats {

  totalAmount: number;

  dataEntries: number;

  projects: number;

  contracts: number;

  vendors: number;

  items: number;

}



export interface OutsourcingDivisionShare {

  division: string;

  count: number;

  sharePercent: number;

}



export interface OutsourcingDbStats {

  overall: OutsourcingDbVolumeStats;

  divisionAmountShares: OutsourcingDivisionShare[];

  divisionEntryShares: OutsourcingDivisionShare[];

  divisionProjectShares: OutsourcingDivisionShare[];

}



const UNCLASSIFIED_DIVISION = '미분류';

const MILLION = 1_000_000;



function itemKey(record: OutsourcingRecord): string {

  return `${record.project}\0${record.contract}\0${record.spec}\0${record.budget}\0${record.unit}`;

}



function contractKey(record: OutsourcingRecord): string {

  return `${record.project}\0${record.contract}`;

}



function normalizeDivision(value: string): string {

  const trimmed = value.trim();

  return trimmed || UNCLASSIFIED_DIVISION;

}



function recordAmount(record: OutsourcingRecord): number {

  if (record.totalAmount !== 0) return record.totalAmount;

  return record.materialAmount + record.laborAmount + record.expenseAmount;

}



function buildDivisionShares(

  divisionValues: Map<string, number>,

  orderMap: Map<string, number>,

): OutsourcingDivisionShare[] {

  const total = [...divisionValues.values()].reduce((sum, value) => sum + value, 0);



  return [...divisionValues.entries()]

    .map(([division, count]) => ({

      division,

      count,

      sharePercent: total > 0 ? (count / total) * 100 : 0,

    }))

    .sort((a, b) => {

      const aRank = orderMap.get(a.division as (typeof OUTSOURCING_DIVISION_ORDER)[number]) ?? 999;

      const bRank = orderMap.get(b.division as (typeof OUTSOURCING_DIVISION_ORDER)[number]) ?? 999;

      if (aRank !== bRank) return aRank - bRank;

      return b.count - a.count;

    });

}



export function formatOutsourcingAmountInMillions(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value / MILLION).toLocaleString('ko-KR');
}



export function summarizeOutsourcingDbStats(records: OutsourcingRecord[]): OutsourcingDbStats {

  const projects = new Set<string>();

  const contracts = new Set<string>();

  const vendors = new Set<string>();

  const items = new Set<string>();

  const divisionCounts = new Map<string, number>();

  const divisionAmounts = new Map<string, number>();

  const divisionProjects = new Map<string, Set<string>>();

  let totalAmount = 0;



  for (let index = 0; index < records.length; index += 1) {

    const record = records[index];

    const amount = recordAmount(record);

    totalAmount += amount;



    if (record.project) projects.add(record.project);

    if (record.contract) contracts.add(contractKey(record));



    const vendor = record.vendorLabel || record.vendor;

    if (vendor) vendors.add(vendor);



    if (record.project || record.contract || record.spec) {

      items.add(itemKey(record));

    }



    const division = normalizeDivision(record.division);

    divisionCounts.set(division, (divisionCounts.get(division) ?? 0) + 1);

    divisionAmounts.set(division, (divisionAmounts.get(division) ?? 0) + amount);



    if (record.project) {

      const projectSet = divisionProjects.get(division) ?? new Set<string>();

      projectSet.add(record.project);

      divisionProjects.set(division, projectSet);

    }

  }



  const totalEntries = records.length;

  const orderMap = new Map(OUTSOURCING_DIVISION_ORDER.map((name, orderIndex) => [name, orderIndex]));

  const divisionProjectCounts = new Map<string, number>(

    [...divisionProjects.entries()].map(([division, projectSet]) => [division, projectSet.size]),

  );



  return {

    overall: {

      totalAmount,

      dataEntries: totalEntries,

      projects: projects.size,

      contracts: contracts.size,

      vendors: vendors.size,

      items: items.size,

    },

    divisionAmountShares: buildDivisionShares(divisionAmounts, orderMap),

    divisionEntryShares: buildDivisionShares(divisionCounts, orderMap),

    divisionProjectShares: buildDivisionShares(divisionProjectCounts, orderMap),

  };

}



export const OUTSOURCING_DIVISION_CHART_COLORS = [

  '#3182f6',

  '#00a870',

  '#f59e0b',

  '#8b5cf6',

  '#64748b',

  '#ef4444',

  '#06b6d4',

] as const;


