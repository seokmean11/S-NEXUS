import type {
  OutsourcingDateRange,
  OutsourcingFilterFieldState,
  OutsourcingFilterKey,
  OutsourcingFilters,
  OutsourcingExecutionRateSummary,
  OutsourcingKpiSummary,
  OutsourcingRecord,
  UnitPriceStats,
  VendorChartItem,
  VendorContractBreakdownItem,
} from '@/types/outsourcing';
import { OUTSOURCING_DIVISION_ORDER, OUTSOURCING_FILTER_ORDER } from '@/types/outsourcing';
import {
  dateDigitsToEndInclusiveTimestamp,
  dateDigitsToTimestamp,
  isCompleteDateWithYearDigits,
  isOutsourcingContractDateInRange,
  isOutsourcingDateRangeActive,
  isOutsourcingDateRangeInvalid,
  isOutsourcingDateRangeReady,
  getOutsourcingDateFilterCommitKey,
} from '@/utils/outsourcingDate';

export const OUTSOURCING_EXCLUDED_BUDGET_NAME = '가편성예산';

export function isIncludedInOutsourcingSearchResults(record: OutsourcingRecord): boolean {
  return record.budget.trim() !== OUTSOURCING_EXCLUDED_BUDGET_NAME;
}

export function excludeProvisionalBudgetRecords(records: OutsourcingRecord[]): OutsourcingRecord[] {
  return records.filter(isIncludedInOutsourcingSearchResults);
}

interface FieldPredicate {
  active: boolean;
  selectedSet: Set<string>;
  keyword: string;
}

interface FilterRuntime {
  startTs: number | null;
  endTs: number | null;
  hasDateFilter: boolean;
  dateInvalid: boolean;
  dateRange?: OutsourcingDateRange;
  fields: Record<OutsourcingFilterKey, FieldPredicate>;
}

function rowAmount(record: OutsourcingRecord): number {
  if (record.totalAmount !== 0) return record.totalAmount;
  return record.materialAmount + record.laborAmount + record.expenseAmount;
}

function getRecordFieldValue(record: OutsourcingRecord, key: OutsourcingFilterKey): string {
  if (key === 'vendor') return record.vendor || record.vendorLabel;
  return record[key];
}

function buildFieldPredicate(field: OutsourcingFilterFieldState): FieldPredicate {
  return {
    active: field.selected.length > 0 || field.keyword.trim().length > 0,
    selectedSet: new Set(field.selected),
    keyword: field.keyword.trim().toLowerCase(),
  };
}

function buildFilterRuntime(
  filters: OutsourcingFilters,
  dateRange?: OutsourcingDateRange,
  excludeKey?: OutsourcingFilterKey,
): FilterRuntime {
  const dateInvalid = Boolean(
    dateRange && isOutsourcingDateRangeActive(dateRange) && isOutsourcingDateRangeInvalid(dateRange),
  );
  const startTs =
    dateRange && isCompleteDateWithYearDigits(dateRange.startDigits)
      ? dateDigitsToTimestamp(dateRange.startDigits)
      : null;
  const endTs =
    dateRange && isCompleteDateWithYearDigits(dateRange.endDigits)
      ? dateDigitsToEndInclusiveTimestamp(dateRange.endDigits)
      : null;
  const hasDateFilter = Boolean(dateRange && isOutsourcingDateRangeReady(dateRange));

  const fields = {} as Record<OutsourcingFilterKey, FieldPredicate>;
  OUTSOURCING_FILTER_ORDER.forEach((key) => {
    fields[key] =
      key === excludeKey
        ? { active: false, selectedSet: new Set<string>(), keyword: '' }
        : buildFieldPredicate(filters[key]);
  });

  return { startTs, endTs, hasDateFilter, dateInvalid, dateRange, fields };
}

function matchesFieldPredicate(value: string, predicate: FieldPredicate): boolean {
  if (!predicate.active) return true;

  const hasSelected = predicate.selectedSet.size > 0;
  const hasKeyword = predicate.keyword.length > 0;
  const selectedMatch = predicate.selectedSet.has(value);
  const keywordMatch = value.toLowerCase().includes(predicate.keyword);

  // 선택 항목이 있으면 선택값만 결과 필터에 사용 (키워드는 목록 검색용)
  if (hasSelected) return selectedMatch;
  if (hasKeyword) return keywordMatch;
  return true;
}

function recordMatchesRuntime(
  record: OutsourcingRecord,
  runtime: FilterRuntime,
  excludeKey?: OutsourcingFilterKey,
): boolean {
  if (!isIncludedInOutsourcingSearchResults(record)) return false;

  if (runtime.dateInvalid) return false;

  if (runtime.hasDateFilter && runtime.dateRange) {
    if (!isOutsourcingContractDateInRange(record.contractTimestamp, runtime.dateRange)) {
      return false;
    }
  }

  for (const key of OUTSOURCING_FILTER_ORDER) {
    if (key === excludeKey) continue;
    const predicate = runtime.fields[key];
    if (!predicate.active) continue;
    if (!matchesFieldPredicate(getRecordFieldValue(record, key), predicate)) return false;
  }

  return true;
}

export function isOutsourcingFilterActive(field: OutsourcingFilterFieldState): boolean {
  return field.selected.length > 0 || field.keyword.trim().length > 0;
}

export function filterOutsourcingRecords(
  records: OutsourcingRecord[],
  filters: OutsourcingFilters,
  options?: { excludeKey?: OutsourcingFilterKey; dateRange?: OutsourcingDateRange },
): OutsourcingRecord[] {
  const runtime = buildFilterRuntime(filters, options?.dateRange, options?.excludeKey);
  const hasFieldFilter = OUTSOURCING_FILTER_ORDER.some((key) => runtime.fields[key]?.active);

  if (runtime.dateInvalid) return [];

  if (!runtime.hasDateFilter && !hasFieldFilter) {
    return excludeProvisionalBudgetRecords(records);
  }

  const filtered: OutsourcingRecord[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (recordMatchesRuntime(record, runtime, options?.excludeKey)) {
      filtered.push(record);
    }
  }
  return filtered;
}

function hasOutsourcingAmount(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}

function computeUnitPriceStats(
  rows: OutsourcingRecord[],
  unitPriceKey: 'materialUnitPrice' | 'laborUnitPrice' | 'expenseUnitPrice',
  amountKey: 'materialAmount' | 'laborAmount' | 'expenseAmount',
): UnitPriceStats {
  const amountRows = rows.filter((row) => hasOutsourcingAmount(row[amountKey]));
  const amountTotal = amountRows.reduce((sum, row) => sum + row[amountKey], 0);
  const quantityForAverage = amountRows.reduce((sum, row) => sum + (row.outsourcingQty || 0), 0);

  const unitPrices = rows
    .map((row) => row[unitPriceKey])
    .filter((value) => Number.isFinite(value) && value !== 0);

  return {
    average: quantityForAverage > 0 ? amountTotal / quantityForAverage : 0,
    max: unitPrices.length > 0 ? Math.max(...unitPrices) : 0,
    min: unitPrices.length > 0 ? Math.min(...unitPrices) : 0,
    quantity: quantityForAverage,
  };
}

export function summarizeOutsourcingKpi(rows: OutsourcingRecord[]): OutsourcingKpiSummary {
  const totalAmount = rows.reduce((sum, row) => sum + rowAmount(row), 0);
  const materialTotal = rows.reduce((sum, row) => sum + row.materialAmount, 0);
  const laborTotal = rows.reduce((sum, row) => sum + row.laborAmount, 0);
  const expenseTotal = rows.reduce((sum, row) => sum + row.expenseAmount, 0);
  return {
    totalAmount,
    materialTotal,
    laborTotal,
    expenseTotal,
    materialUnitPrice: computeUnitPriceStats(rows, 'materialUnitPrice', 'materialAmount'),
    laborUnitPrice: computeUnitPriceStats(rows, 'laborUnitPrice', 'laborAmount'),
    expenseUnitPrice: computeUnitPriceStats(rows, 'expenseUnitPrice', 'expenseAmount'),
  };
}

interface VendorAggregate {
  amount: number;
  materialAmount: number;
  laborAmount: number;
  expenseAmount: number;
  projects: Set<string>;
  contracts: Map<string, VendorContractBreakdownItem>;
}

function vendorContractKey(project: string, contract: string): string {
  return `${project}\0${contract}`;
}

export function buildVendorChartData(rows: OutsourcingRecord[]): VendorChartItem[] {
  const totals = new Map<string, VendorAggregate>();

  rows.forEach((row) => {
    const label = row.vendorLabel || row.vendor;
    if (!label) return;

    const current = totals.get(label) ?? {
      amount: 0,
      materialAmount: 0,
      laborAmount: 0,
      expenseAmount: 0,
      projects: new Set<string>(),
      contracts: new Map<string, VendorContractBreakdownItem>(),
    };

    const rowTotal = rowAmount(row);
    if (row.project) current.projects.add(row.project);
    if (row.project && row.contract) {
      const contractKey = vendorContractKey(row.project, row.contract);
      const contractItem = current.contracts.get(contractKey) ?? {
        project: row.project,
        contract: row.contract,
        amount: 0,
      };
      contractItem.amount += rowTotal;
      current.contracts.set(contractKey, contractItem);
    }

    totals.set(label, {
      amount: current.amount + rowTotal,
      materialAmount: current.materialAmount + row.materialAmount,
      laborAmount: current.laborAmount + row.laborAmount,
      expenseAmount: current.expenseAmount + row.expenseAmount,
      projects: current.projects,
      contracts: current.contracts,
    });
  });

  const grandTotal = [...totals.values()].reduce((sum, value) => sum + value.amount, 0);

  return [...totals.entries()]
    .map(([vendorLabel, aggregate]) => {
      const contractBreakdown = [...aggregate.contracts.values()].sort((a, b) => b.amount - a.amount);
      return {
        vendorLabel,
        amount: aggregate.amount,
        sharePercent: grandTotal > 0 ? (aggregate.amount / grandTotal) * 100 : 0,
        materialAmount: aggregate.materialAmount,
        laborAmount: aggregate.laborAmount,
        expenseAmount: aggregate.expenseAmount,
        contractCount: contractBreakdown.length,
        contractBreakdown,
        projectCount: aggregate.projects.size,
        projectAverageAmount:
          aggregate.projects.size > 0 ? aggregate.amount / aggregate.projects.size : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function computeRatePercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export function buildOutsourcingExecutionRateSummary(
  rows: OutsourcingRecord[],
): OutsourcingExecutionRateSummary {
  let totalContractAmount = 0;
  let totalExecutionAmount = 0;
  let totalOutsourcingAmount = 0;

  rows.forEach((row) => {
    totalContractAmount += row.contractAmount;
    totalExecutionAmount += row.executionAmount;
    totalOutsourcingAmount += rowAmount(row);
  });

  return {
    totalContractAmount,
    totalExecutionAmount,
    totalOutsourcingAmount,
    internalExecutionRatePercent: computeRatePercent(
      totalExecutionAmount,
      totalContractAmount,
    ),
    outsourcingExecutionRatePercent: computeRatePercent(
      totalOutsourcingAmount,
      totalContractAmount,
    ),
  };
}

export function formatExecutionRatePercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function sortFilterOptions(key: OutsourcingFilterKey, values: string[]): string[] {
  if (key !== 'division') {
    return values.sort((a, b) => a.localeCompare(b, 'ko'));
  }

  const orderMap = new Map(OUTSOURCING_DIVISION_ORDER.map((name, index) => [name, index]));
  return values.sort((a, b) => {
    const aRank = orderMap.get(a as (typeof OUTSOURCING_DIVISION_ORDER)[number]) ?? 999;
    const bRank = orderMap.get(b as (typeof OUTSOURCING_DIVISION_ORDER)[number]) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b, 'ko');
  });
}

export function getOutsourcingFilterOptions(
  records: OutsourcingRecord[],
  key: OutsourcingFilterKey,
  keyword = '',
): string[] {
  const values = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const value = getRecordFieldValue(records[index], key);
    if (value) values.add(value);
  }

  const query = keyword.trim().toLowerCase();
  let sorted = sortFilterOptions(key, [...values]);
  if (!query) return sorted;
  return sorted.filter((value) => value.toLowerCase().includes(query));
}

export function buildFacetedOptionsDependencyKey(
  filters: OutsourcingFilters,
  filterKey: OutsourcingFilterKey,
  dateRange?: OutsourcingDateRange,
): string {
  const parts = OUTSOURCING_FILTER_ORDER.map((key) => {
    const field = filters[key];
    if (key === filterKey) {
      return `${key}|kw:${field.keyword}`;
    }
    return `${key}|kw:${field.keyword}|sel:${field.selected.join('\u0001')}`;
  });

  if (dateRange) {
    parts.push(`date:${dateRange.startDigits}:${dateRange.endDigits}`);
  }

  return parts.join(';;');
}

/** 콤보 목록 재계산용 — 선택 항목이 있는 필드는 키워드 변경을 무시 */
export function buildFacetedOptionsRebuildKey(
  filters: OutsourcingFilters,
  dateRange?: OutsourcingDateRange,
): string {
  const parts = OUTSOURCING_FILTER_ORDER.map((key) => {
    const field = filters[key];
    if (field.selected.length > 0) {
      return `${key}|sel:${field.selected.join('\u0001')}`;
    }
    return `${key}|kw:${field.keyword}`;
  });

  if (dateRange) {
    parts.push(`date:${getOutsourcingDateFilterCommitKey(dateRange)}`);
  }

  return parts.join(';;');
}

export function buildFacetedFilterOptionsForKey(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  key: OutsourcingFilterKey,
  dateRange?: OutsourcingDateRange,
  options?: { skipFieldKeyword?: boolean },
): string[] {
  const runtime = buildFilterRuntime(filters, dateRange, key);
  const values = new Set<string>();

  for (let index = 0; index < allRecords.length; index += 1) {
    const record = allRecords[index];
    if (!recordMatchesRuntime(record, runtime, key)) continue;
    const value = getRecordFieldValue(record, key);
    if (value) values.add(value);
  }

  let sorted = sortFilterOptions(key, [...values]);
  if (!options?.skipFieldKeyword) {
    const keyword = filters[key].keyword.trim().toLowerCase();
    if (keyword) {
      sorted = sorted.filter((value) => value.toLowerCase().includes(keyword));
    }
  }
  return sorted;
}

export function buildAllFacetedFilterOptions(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  dateRange?: OutsourcingDateRange,
  options?: { skipFieldKeyword?: boolean },
): Record<OutsourcingFilterKey, string[]> {
  const valueSets = Object.fromEntries(
    OUTSOURCING_FILTER_ORDER.map((key) => [key, new Set<string>()]),
  ) as Record<OutsourcingFilterKey, Set<string>>;

  const runtimes = Object.fromEntries(
    OUTSOURCING_FILTER_ORDER.map((key) => [
      key,
      buildFilterRuntime(filters, dateRange, key),
    ]),
  ) as Record<OutsourcingFilterKey, FilterRuntime>;

  for (let index = 0; index < allRecords.length; index += 1) {
    const record = allRecords[index];
    for (const key of OUTSOURCING_FILTER_ORDER) {
      if (!recordMatchesRuntime(record, runtimes[key], key)) continue;
      const value = getRecordFieldValue(record, key);
      if (value) valueSets[key].add(value);
    }
  }

  const result = {} as Record<OutsourcingFilterKey, string[]>;
  OUTSOURCING_FILTER_ORDER.forEach((key) => {
    let sorted = sortFilterOptions(key, [...valueSets[key]]);
    if (!options?.skipFieldKeyword) {
      const keyword = filters[key].keyword.trim().toLowerCase();
      if (keyword) {
        sorted = sorted.filter((value) => value.toLowerCase().includes(keyword));
      }
    }
    result[key] = sorted;
  });
  return result;
}

export function getFacetedFilterOptions(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  key: OutsourcingFilterKey,
  dateRange?: OutsourcingDateRange,
): string[] {
  return buildFacetedFilterOptionsForKey(allRecords, filters, key, dateRange);
}

export function formatOutsourcingAmount(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('ko-KR');
}

export function formatOutsourcingQuantity(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function formatUnitPriceDetail(stats: UnitPriceStats): string {
  return `(MAX: ${formatOutsourcingAmount(stats.max)} / MIN: ${formatOutsourcingAmount(stats.min)} / 수량: ${formatOutsourcingQuantity(stats.quantity)})`;
}

export function countActiveOutsourcingFilters(
  filters: OutsourcingFilters,
  dateRange?: OutsourcingDateRange,
): number {
  const fieldCount = (Object.keys(filters) as OutsourcingFilterKey[]).filter((key) =>
    isOutsourcingFilterActive(filters[key]),
  ).length;

  return fieldCount + (dateRange && isOutsourcingDateRangeReady(dateRange) ? 1 : 0);
}
