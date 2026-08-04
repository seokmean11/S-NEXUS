import type {
  OutsourcingDateRange,
  OutsourcingFilterFieldState,
  OutsourcingFilterKey,
  OutsourcingFilters,
  OutsourcingKpiSummary,
  OutsourcingRecord,
  UnitPriceStats,
  VendorChartItem,
} from '@/types/outsourcing';
import { OUTSOURCING_DIVISION_ORDER, OUTSOURCING_FILTER_ORDER } from '@/types/outsourcing';
import {
  dateDigitsToTimestamp,
  isOutsourcingDateRangeActive,
  isOutsourcingDateRangeInvalid,
} from '@/utils/outsourcingDate';

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
  const dateInvalid = Boolean(dateRange && isOutsourcingDateRangeInvalid(dateRange));
  const startTs = dateRange ? dateDigitsToTimestamp(dateRange.startDigits) : null;
  const endTs = dateRange ? dateDigitsToTimestamp(dateRange.endDigits) : null;
  const hasDateFilter = Boolean(
    dateRange && !dateInvalid && (startTs != null || endTs != null),
  );

  const fields = {} as Record<OutsourcingFilterKey, FieldPredicate>;
  OUTSOURCING_FILTER_ORDER.forEach((key) => {
    fields[key] =
      key === excludeKey
        ? { active: false, selectedSet: new Set<string>(), keyword: '' }
        : buildFieldPredicate(filters[key]);
  });

  return { startTs, endTs, hasDateFilter, dateInvalid, fields };
}

function matchesFieldPredicate(value: string, predicate: FieldPredicate): boolean {
  if (!predicate.active) return true;

  const hasSelected = predicate.selectedSet.size > 0;
  const hasKeyword = predicate.keyword.length > 0;
  const selectedMatch = hasSelected && predicate.selectedSet.has(value);
  const keywordMatch = hasKeyword && value.toLowerCase().includes(predicate.keyword);

  if (hasSelected && hasKeyword) return selectedMatch && keywordMatch;
  if (hasSelected) return selectedMatch;
  return keywordMatch;
}

function recordMatchesRuntime(
  record: OutsourcingRecord,
  runtime: FilterRuntime,
  excludeKey?: OutsourcingFilterKey,
): boolean {
  if (runtime.dateInvalid) return true;

  if (runtime.hasDateFilter) {
    const recordTimestamp = record.contractTimestamp;
    if (recordTimestamp == null) return false;
    if (runtime.startTs != null && recordTimestamp < runtime.startTs) return false;
    if (runtime.endTs != null && recordTimestamp > runtime.endTs) return false;
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

  if (!runtime.hasDateFilter && !hasFieldFilter) return records;

  const filtered: OutsourcingRecord[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (recordMatchesRuntime(record, runtime, options?.excludeKey)) {
      filtered.push(record);
    }
  }
  return filtered;
}

function computeUnitPriceStats(
  rows: OutsourcingRecord[],
  unitPriceKey: 'materialUnitPrice' | 'laborUnitPrice' | 'expenseUnitPrice',
  qtyKey: 'materialQty' | 'laborQty' | 'expenseQty',
  amountKey: 'materialAmount' | 'laborAmount' | 'expenseAmount',
): UnitPriceStats {
  const unitPrices = rows
    .map((row) => row[unitPriceKey])
    .filter((value) => Number.isFinite(value) && value !== 0);
  const quantity = rows.reduce((sum, row) => sum + (row[qtyKey] || 0), 0);
  const amountTotal = rows.reduce((sum, row) => sum + (row[amountKey] || 0), 0);

  const average =
    quantity > 0
      ? amountTotal / quantity
      : unitPrices.length > 0
        ? unitPrices.reduce((sum, value) => sum + value, 0) / unitPrices.length
        : 0;

  return {
    average,
    max: unitPrices.length > 0 ? Math.max(...unitPrices) : 0,
    min: unitPrices.length > 0 ? Math.min(...unitPrices) : 0,
    quantity,
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
    materialUnitPrice: computeUnitPriceStats(rows, 'materialUnitPrice', 'materialQty', 'materialAmount'),
    laborUnitPrice: computeUnitPriceStats(rows, 'laborUnitPrice', 'laborQty', 'laborAmount'),
    expenseUnitPrice: computeUnitPriceStats(rows, 'expenseUnitPrice', 'expenseQty', 'expenseAmount'),
  };
}

interface VendorAggregate {
  amount: number;
  materialAmount: number;
  laborAmount: number;
  expenseAmount: number;
  recordCount: number;
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
      recordCount: 0,
    };

    totals.set(label, {
      amount: current.amount + rowAmount(row),
      materialAmount: current.materialAmount + row.materialAmount,
      laborAmount: current.laborAmount + row.laborAmount,
      expenseAmount: current.expenseAmount + row.expenseAmount,
      recordCount: current.recordCount + 1,
    });
  });

  const grandTotal = [...totals.values()].reduce((sum, value) => sum + value.amount, 0);

  return [...totals.entries()]
    .map(([vendorLabel, aggregate]) => ({
      vendorLabel,
      amount: aggregate.amount,
      sharePercent: grandTotal > 0 ? (aggregate.amount / grandTotal) * 100 : 0,
      materialAmount: aggregate.materialAmount,
      laborAmount: aggregate.laborAmount,
      expenseAmount: aggregate.expenseAmount,
      recordCount: aggregate.recordCount,
    }))
    .sort((a, b) => b.amount - a.amount);
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

export function buildAllFacetedFilterOptions(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  dateRange?: OutsourcingDateRange,
): Record<OutsourcingFilterKey, string[]> {
  const runtimes = OUTSOURCING_FILTER_ORDER.map((key) =>
    buildFilterRuntime(filters, dateRange, key),
  );
  const optionSets = Object.fromEntries(
    OUTSOURCING_FILTER_ORDER.map((key) => [key, new Set<string>()]),
  ) as Record<OutsourcingFilterKey, Set<string>>;

  for (let index = 0; index < allRecords.length; index += 1) {
    const record = allRecords[index];

    OUTSOURCING_FILTER_ORDER.forEach((key, runtimeIndex) => {
      if (!recordMatchesRuntime(record, runtimes[runtimeIndex], key)) return;
      const value = getRecordFieldValue(record, key);
      if (value) optionSets[key].add(value);
    });
  }

  const options = {} as Record<OutsourcingFilterKey, string[]>;
  OUTSOURCING_FILTER_ORDER.forEach((key) => {
    const keyword = filters[key].keyword.trim().toLowerCase();
    let sorted = sortFilterOptions(key, [...optionSets[key]]);
    if (keyword) {
      sorted = sorted.filter((value) => value.toLowerCase().includes(keyword));
    }
    options[key] = sorted;
  });

  return options;
}

export function getFacetedFilterOptions(
  allRecords: OutsourcingRecord[],
  filters: OutsourcingFilters,
  key: OutsourcingFilterKey,
  dateRange?: OutsourcingDateRange,
): string[] {
  return buildAllFacetedFilterOptions(allRecords, filters, dateRange)[key];
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

  return fieldCount + (dateRange && isOutsourcingDateRangeActive(dateRange) ? 1 : 0);
}
