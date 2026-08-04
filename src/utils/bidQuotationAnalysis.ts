import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import type { BidPartnerEntry } from '@/types/bidRegistration';
import {
  BID_REVIEW_CATEGORY_LABELS,
  buildQuotationReviewIssues,
  buildReviewCellMarks,
  buildReviewerSummary,
  finalizeReviewIssues,
  getIssuePrimaryCellAddress,
  mergeReviewCellMarks,
  reviewCellBorderColor,
  reviewCellFillColor,
  type BidReviewIssue,
  type BidReviewerSummary,
  type IntegratedLineQuote,
  type IntegratedVendorQuote,
  type VendorOverheadRatioResult,
} from '@/utils/bidQuotationReview';

export type { BidReviewIssue, BidReviewerSummary } from '@/utils/bidQuotationReview';

export interface BidQuotationCompareItem {
  partnerId: string;
  vendorName: string;
  fileName: string;
  totalAmount: number | null;
  lineCount: number;
  rank: number;
  status: 'ok' | 'unsupported' | 'error';
  message?: string;
}

export type BidAwardOutcome = 'awarded' | 'failed' | 'unknown';

export interface BidAwardVerdict {
  outcome: BidAwardOutcome;
  outcomeLabel: string;
  executionBudget: number;
  firstRankAmount: number | null;
  firstRankVendorName: string | null;
  /** (1위 금액 − 실행예산) ÷ 실행예산 × 100 */
  budgetOverrunRatio: number | null;
}

export function computeBidAwardVerdict(
  executionBudget: number,
  items: BidQuotationCompareItem[],
): BidAwardVerdict | null {
  const first = items.find((item) => item.rank === 1 && item.status === 'ok');
  if (!first) return null;

  const base = {
    executionBudget,
    firstRankAmount: first.totalAmount,
    firstRankVendorName: first.vendorName,
  };

  if (!executionBudget || executionBudget <= 0 || first.totalAmount == null) {
    return {
      ...base,
      outcome: 'unknown',
      outcomeLabel: '판정 불가',
      budgetOverrunRatio: null,
    };
  }

  const budgetOverrunRatio =
    ((first.totalAmount - executionBudget) / executionBudget) * 100;
  const awarded = first.totalAmount <= executionBudget;

  return {
    ...base,
    outcome: awarded ? 'awarded' : 'failed',
    outcomeLabel: awarded ? '낙찰' : '유찰',
    budgetOverrunRatio,
  };
}

export function formatBudgetDelta(
  ratio: number | null,
  firstRankAmount: number | null,
  executionBudget: number,
): string {
  if (ratio == null || firstRankAmount == null || !executionBudget) return '-';
  const diff = firstRankAmount - executionBudget;
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${ratio.toFixed(1)}% (${formatWon(diff)})`;
}

export interface BidQuotationAnalysisResult {
  items: BidQuotationCompareItem[];
  comparisonBlob: Blob | null;
  comparisonFileName: string;
  reviewIssues: BidReviewIssue[];
  reviewerSummary: BidReviewerSummary;
  /** Excel 검토이슈 셀 마킹 수 */
  markCount: number;
  /** 다운로드 직전 최신 마킹·메모로 Excel 재생성 */
  regenerateComparisonExcel: () => Promise<Blob | null>;
}

const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls']);

const BASE_HEADERS = [
  'No',
  '현장명',
  '발주품의명',
  '실행예산코드',
  '실행예산명',
  '규격',
  '단위',
  '견적수량',
] as const;

const PRICE_HEADERS = [
  '견적단가',
  '견적금액',
  '노무단가',
  '노무금액',
  '자재단가',
  '자재금액',
  '경비단가',
  '경비금액',
] as const;

const HEADER_ALIASES = {
  no: ['no'],
  siteName: ['현장명'],
  orderItemName: ['발주품명', '발주품의명'],
  budgetCode: ['실행예산코드'],
  budgetItemName: ['실행예산명'],
  spec: ['규격'],
  unit: ['단위'],
  quantity: ['견적수량', '수량'],
  quoteUnit: ['견적단가'],
  laborUnit: ['노무단가'],
  laborAmount: ['노무금액'],
  materialUnit: ['자재단가'],
  materialAmount: ['자재금액'],
  expenseUnit: ['경비단가'],
  expenseAmount: ['경비금액'],
  quoteAmount: ['견적금액'],
} as const;

type QuotationColumns = {
  no: number;
  siteName: number;
  orderItemName: number;
  budgetCode: number;
  budgetItemName: number;
  spec: number;
  unit: number;
  quantity: number;
  quoteUnit: number;
  laborUnit: number;
  laborAmount: number;
  materialUnit: number;
  materialAmount: number;
  expenseUnit: number;
  expenseAmount: number;
  quoteAmount: number;
};

type ParsedQuotationFile = {
  partnerId: string;
  vendorName: string;
  fileName: string;
  rows: unknown[][];
  headerRowIndex: number;
  columns: QuotationColumns;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s/g, '')
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function normalizeAlias(alias: string): string {
  return alias.replace(/\s/g, '').toLowerCase();
}

export function parseCellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-') return null;
    const digits = trimmed.replace(/[^\d.-]/g, '');
    if (!digits || digits === '-' || digits === '.') return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findColumnIndex(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const target = normalizeAlias(alias);
    const exact = headers.findIndex((header) => header.length > 0 && header === target);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const target = normalizeAlias(alias);
    const partial = headers.findIndex(
      (header) =>
        header.length > 0 &&
        target.length > 0 &&
        (header.includes(target) || target.includes(header)),
    );
    if (partial >= 0) return partial;
  }
  return -1;
}

function hasExactHeader(headers: string[], aliases: readonly string[]): boolean {
  const normalized = new Set(headers.filter((header) => header.length > 0));
  return aliases.some((alias) => normalized.has(normalizeAlias(alias)));
}

/** 상세 입찰내역 시트 판별 — 시트명이 아닌 헤더·내역 행 수로 선택 */
function isValidErpHeaderRow(headers: string[]): boolean {
  return (
    hasExactHeader(headers, HEADER_ALIASES.orderItemName) &&
    hasExactHeader(headers, HEADER_ALIASES.quantity) &&
    hasExactHeader(headers, HEADER_ALIASES.quoteAmount) &&
    hasExactHeader(headers, HEADER_ALIASES.quoteUnit) &&
    hasExactHeader(headers, HEADER_ALIASES.budgetCode)
  );
}

type DetailSheetMatch = {
  rows: unknown[][];
  headerRowIndex: number;
  columns: QuotationColumns;
  lineCount: number;
};

function countComparableRows(
  rows: unknown[][],
  headerRowIndex: number,
  columns: QuotationColumns,
): number {
  let count = 0;
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    if (shouldIncludeRow(rows[rowIndex] ?? [], columns)) count += 1;
  }
  return count;
}

/** 첨부 Excel의 모든 시트를 검사해 발주품의명·견적수량 상세내역이 가장 많은 시트 선택 */
function findDetailSheet(workbook: XLSX.WorkBook): DetailSheetMatch | null {
  let best: DetailSheetMatch | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const header = findHeaderRow(rows);
    if (!header) continue;

    const lineCount = countComparableRows(rows, header.headerRowIndex, header.columns);
    if (lineCount === 0) continue;

    if (!best || lineCount > best.lineCount) {
      best = {
        rows,
        headerRowIndex: header.headerRowIndex,
        columns: header.columns,
        lineCount,
      };
    }
  }

  return best;
}

function buildColumns(headers: string[]): QuotationColumns | null {
  const orderItemName = findColumnIndex(headers, HEADER_ALIASES.orderItemName);
  const quantity = findColumnIndex(headers, HEADER_ALIASES.quantity);
  const quoteAmount = findColumnIndex(headers, HEADER_ALIASES.quoteAmount);
  const quoteUnit = findColumnIndex(headers, HEADER_ALIASES.quoteUnit);

  if (quantity < 0 || quoteAmount < 0 || quoteUnit < 0) return null;
  if (orderItemName < 0) return null;

  return {
    no: findColumnIndex(headers, HEADER_ALIASES.no),
    siteName: findColumnIndex(headers, HEADER_ALIASES.siteName),
    orderItemName,
    budgetCode: findColumnIndex(headers, HEADER_ALIASES.budgetCode),
    budgetItemName: findColumnIndex(headers, HEADER_ALIASES.budgetItemName),
    spec: findColumnIndex(headers, HEADER_ALIASES.spec),
    unit: findColumnIndex(headers, HEADER_ALIASES.unit),
    quantity,
    quoteUnit,
    laborUnit: findColumnIndex(headers, HEADER_ALIASES.laborUnit),
    laborAmount: findColumnIndex(headers, HEADER_ALIASES.laborAmount),
    materialUnit: findColumnIndex(headers, HEADER_ALIASES.materialUnit),
    materialAmount: findColumnIndex(headers, HEADER_ALIASES.materialAmount),
    expenseUnit: findColumnIndex(headers, HEADER_ALIASES.expenseUnit),
    expenseAmount: findColumnIndex(headers, HEADER_ALIASES.expenseAmount),
    quoteAmount,
  };
}

function findHeaderRow(rows: unknown[][]): { headerRowIndex: number; columns: QuotationColumns } | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 40); rowIndex++) {
    const headers = (rows[rowIndex] ?? []).map(normalizeHeader);
    if (!isValidErpHeaderRow(headers)) continue;
    const columns = buildColumns(headers);
    if (columns) return { headerRowIndex: rowIndex, columns };
  }
  return null;
}

function getCell(row: unknown[], index: number): unknown {
  return index >= 0 ? row[index] : undefined;
}

function getBudgetItemLabel(row: unknown[], columns: QuotationColumns): string {
  return columns.budgetItemName >= 0
    ? String(getCell(row, columns.budgetItemName) ?? '').trim()
    : '';
}

function isAdjustmentBudgetItem(label: string): boolean {
  const normalized = label.replace(/\s/g, '');
  return /공과잡비|단수정리|단수조정|할증|간접|절사|원단위/.test(normalized);
}

function getBudgetCode(row: unknown[], columns: QuotationColumns): string {
  return columns.budgetCode >= 0 ? String(getCell(row, columns.budgetCode) ?? '').trim() : '';
}

function getRowItemLabel(row: unknown[], columns: QuotationColumns): string {
  const orderName = String(getCell(row, columns.orderItemName) ?? '').trim();
  const budgetName = getBudgetItemLabel(row, columns);
  return (budgetName || orderName).replace(/\s/g, '');
}

function isRoundingRow(row: unknown[], columns: QuotationColumns): boolean {
  return /단수정리|단수조정/.test(getRowItemLabel(row, columns));
}

function isExplicitOverheadRow(row: unknown[], columns: QuotationColumns): boolean {
  return /공과잡비/.test(getRowItemLabel(row, columns));
}

/** 실행예산코드 없음 · 단수정리 제외 → 공과잡비성 항목 */
function isCodelessOverheadRow(row: unknown[], columns: QuotationColumns): boolean {
  if (getBudgetCode(row, columns)) return false;
  if (isRoundingRow(row, columns)) return false;
  return true;
}

function readDirectQuoteAmount(row: unknown[], columns: QuotationColumns): number {
  const quoteAmountCell =
    columns.quoteAmount >= 0 ? parseCellNumber(getCell(row, columns.quoteAmount)) : null;
  if (quoteAmountCell != null && quoteAmountCell !== 0) return roundWon(quoteAmountCell);

  const expenseAmountCell =
    columns.expenseAmount >= 0 ? parseCellNumber(getCell(row, columns.expenseAmount)) : null;
  if (expenseAmountCell != null && expenseAmountCell !== 0) return roundWon(expenseAmountCell);

  const laborAmountCell =
    columns.laborAmount >= 0 ? parseCellNumber(getCell(row, columns.laborAmount)) : null;
  const materialAmountCell =
    columns.materialAmount >= 0 ? parseCellNumber(getCell(row, columns.materialAmount)) : null;
  const lmeSum =
    (laborAmountCell ?? 0) + (materialAmountCell ?? 0) + (expenseAmountCell ?? 0);
  if (lmeSum !== 0) return roundWon(lmeSum);

  const quoteUnitCell =
    columns.quoteUnit >= 0 ? parseCellNumber(getCell(row, columns.quoteUnit)) : null;
  if (quoteUnitCell != null && quoteUnitCell !== 0) return roundWon(quoteUnitCell);

  return 0;
}

function shouldIncludeRow(row: unknown[], columns: QuotationColumns): boolean {
  if (isRoundingRow(row, columns)) {
    const quantity = parseCellNumber(getCell(row, columns.quantity));
    if (quantity != null && quantity > 0) return true;
    return readDirectQuoteAmount(row, columns) !== 0;
  }

  if (isCodelessOverheadRow(row, columns)) {
    const quantity = parseCellNumber(getCell(row, columns.quantity));
    if (quantity != null && quantity > 0) return true;
    return readDirectQuoteAmount(row, columns) !== 0;
  }

  const orderName = String(getCell(row, columns.orderItemName) ?? '').trim();
  const budgetName = getBudgetItemLabel(row, columns);
  const quantity = parseCellNumber(getCell(row, columns.quantity));
  if (quantity == null || quantity <= 0) return false;
  if (!orderName && !isAdjustmentBudgetItem(budgetName)) return false;
  return true;
}

function roundWon(value: number): number {
  return Math.round(value);
}

function readCellAmount(
  row: unknown[],
  unitCol: number,
  amountCol: number,
  quantity: number,
): { unit: number; amount: number } {
  const unit = unitCol >= 0 ? (parseCellNumber(getCell(row, unitCol)) ?? 0) : 0;
  let amount = roundWon(unit * quantity);

  if (amount === 0 && amountCol >= 0) {
    const cellAmount = parseCellNumber(getCell(row, amountCol));
    if (cellAmount != null && cellAmount !== 0) amount = roundWon(cellAmount);
  }

  const resolvedUnit =
    unit !== 0 ? unit : quantity !== 0 && amount !== 0 ? amount / quantity : 0;

  return { unit: roundWon(resolvedUnit), amount };
}

type RowPriceBreakdown = {
  quoteUnit: number;
  quoteAmount: number;
  laborUnit: number;
  laborAmount: number;
  materialUnit: number;
  materialAmount: number;
  expenseUnit: number;
  expenseAmount: number;
};

/**
 * ERP 규칙: 금액 = 수량×단가(금액 셀 보조), 견적금액 = 노무+자재+경비.
 * 공과잡비·단수정리 등은 LME 분산 또는 견적단가/견적금액 직입(태성 등) 모두 반영.
 */
function calculateRowPriceBreakdown(
  row: unknown[],
  columns: QuotationColumns,
): RowPriceBreakdown | null {
  const quantity = parseCellNumber(getCell(row, columns.quantity));
  if (quantity == null || quantity <= 0) {
    if (isCodelessOverheadRow(row, columns)) {
      const quoteAmount = readDirectQuoteAmount(row, columns);
      if (quoteAmount === 0) return null;
      return {
        quoteUnit: 0,
        quoteAmount,
        laborUnit: 0,
        laborAmount: 0,
        materialUnit: 0,
        materialAmount: 0,
        expenseUnit: 0,
        expenseAmount: quoteAmount,
      };
    }
    return null;
  }

  const labor = readCellAmount(row, columns.laborUnit, columns.laborAmount, quantity);
  const material = readCellAmount(row, columns.materialUnit, columns.materialAmount, quantity);
  const expense = readCellAmount(row, columns.expenseUnit, columns.expenseAmount, quantity);

  let laborUnit = labor.unit;
  let laborAmount = labor.amount;
  let materialUnit = material.unit;
  let materialAmount = material.amount;
  let expenseUnit = expense.unit;
  let expenseAmount = expense.amount;

  const lmeSum = laborAmount + materialAmount + expenseAmount;

  const quoteUnitCell =
    columns.quoteUnit >= 0 ? (parseCellNumber(getCell(row, columns.quoteUnit)) ?? 0) : 0;
  const quoteAmountCell =
    columns.quoteAmount >= 0 ? (parseCellNumber(getCell(row, columns.quoteAmount)) ?? 0) : 0;
  const quoteFromDirect =
    quoteAmountCell !== 0 ? roundWon(quoteAmountCell) : roundWon(quoteUnitCell * quantity);

  let quoteAmount = lmeSum;

  if (lmeSum === 0 && quoteFromDirect !== 0) {
    quoteAmount = quoteFromDirect;
    expenseAmount = quoteFromDirect;
    expenseUnit =
      quoteUnitCell !== 0
        ? roundWon(quoteUnitCell)
        : quantity !== 0
          ? roundWon(quoteFromDirect / quantity)
          : 0;
  }

  let quoteUnit = roundWon(laborUnit + materialUnit + expenseUnit);
  if (quoteUnit === 0 && quoteUnitCell !== 0) quoteUnit = roundWon(quoteUnitCell);
  if (quoteUnit === 0 && quantity !== 0 && quoteAmount !== 0) {
    quoteUnit = roundWon(quoteAmount / quantity);
  }

  return {
    quoteUnit,
    quoteAmount,
    laborUnit,
    laborAmount,
    materialUnit,
    materialAmount,
    expenseUnit,
    expenseAmount,
  };
}

function rowQuoteAmount(row: unknown[], columns: QuotationColumns): number {
  return calculateRowPriceBreakdown(row, columns)?.quoteAmount ?? 0;
}

/** 원본 견적서 행 기준 공과잡비율 — 통합내역 누락 없이 합산 */
export function computeVendorOverheadStats(
  rows: unknown[][],
  headerRowIndex: number,
  columns: QuotationColumns,
  vendorName: string,
): VendorOverheadRatioResult | null {
  let totalAmount = 0;
  let codedTotal = 0;
  let overheadAmount = 0;
  let explicitOverheadAmount = 0;
  let implicitOverheadAmount = 0;
  let overheadLineKey: string | undefined;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (!shouldIncludeRow(row, columns)) continue;

    const quoteAmount = rowQuoteAmount(row, columns);
    if (quoteAmount === 0) continue;

    totalAmount += quoteAmount;

    if (isRoundingRow(row, columns)) continue;

    const explicitOverhead = isExplicitOverheadRow(row, columns);
    const codelessOverhead = isCodelessOverheadRow(row, columns);
    const lineOverhead = explicitOverhead || codelessOverhead;

    if (lineOverhead) {
      overheadAmount += quoteAmount;
      const lineKey = rowKey(row, columns, rowIndex);
      if (codelessOverhead && !explicitOverhead) {
        implicitOverheadAmount += quoteAmount;
        overheadLineKey = overheadLineKey ?? lineKey;
      } else {
        explicitOverheadAmount += quoteAmount;
        overheadLineKey = lineKey;
      }
      continue;
    }

    if (getBudgetCode(row, columns)) {
      codedTotal += quoteAmount;
    }
  }

  if (overheadAmount <= 0 || codedTotal <= 0) return null;

  return {
    ratio: (overheadAmount / codedTotal) * 100,
    totalAmount,
    codedTotal,
    vendorName,
    overheadAmount,
    explicitOverheadAmount,
    implicitOverheadAmount,
    overheadLineKey,
  };
}

function rowKey(row: unknown[], columns: QuotationColumns, rowIndex: number): string {
  const code =
    columns.budgetCode >= 0 ? String(getCell(row, columns.budgetCode) ?? '').trim() : '';
  if (code) return code;
  const budget =
    columns.budgetItemName >= 0
      ? String(getCell(row, columns.budgetItemName) ?? '').trim()
      : '';
  return budget ? `item:${budget}` : `row:${rowIndex}`;
}

export function calculateErpQuotationTotal(rows: unknown[][]): {
  total: number;
  lineCount: number;
} | null {
  const header = findHeaderRow(rows);
  if (!header) return null;

  const { headerRowIndex, columns } = header;
  let total = 0;
  let lineCount = 0;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (!shouldIncludeRow(row, columns)) continue;

    const quoteAmount = rowQuoteAmount(row, columns);
    if (quoteAmount === 0) continue;

    total += quoteAmount;
    lineCount += 1;
  }

  if (lineCount === 0) return null;
  return { total, lineCount };
}

function readWorkbookRows(workbook: XLSX.WorkBook): unknown[][] | null {
  return findDetailSheet(workbook)?.rows ?? null;
}

async function readExcelRows(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return readWorkbookRows(workbook) ?? [];
}

function extractBaseRow(row: unknown[], columns: QuotationColumns): unknown[] {
  return [
    columns.no >= 0 ? getCell(row, columns.no) ?? '' : '',
    columns.siteName >= 0 ? getCell(row, columns.siteName) ?? '' : '',
    getCell(row, columns.orderItemName) ?? '',
    columns.budgetCode >= 0 ? getCell(row, columns.budgetCode) ?? '' : '',
    columns.budgetItemName >= 0 ? getCell(row, columns.budgetItemName) ?? '' : '',
    columns.spec >= 0 ? getCell(row, columns.spec) ?? '' : '',
    columns.unit >= 0 ? getCell(row, columns.unit) ?? '' : '',
    getCell(row, columns.quantity) ?? '',
  ];
}

function extractPriceBlock(row: unknown[], columns: QuotationColumns): unknown[] {
  const breakdown = calculateRowPriceBreakdown(row, columns);
  if (!breakdown) return Array(PRICE_HEADERS.length).fill('');

  return [
    breakdown.quoteUnit,
    breakdown.quoteAmount,
    breakdown.laborUnit,
    breakdown.laborAmount,
    breakdown.materialUnit,
    breakdown.materialAmount,
    breakdown.expenseUnit,
    breakdown.expenseAmount,
  ];
}

function vendorLabel(name: string): string {
  return name.replace(/\(주\)|㈜|주식회사|\s+/g, '').trim() || name;
}

function collectComparableRows(parsed: ParsedQuotationFile): Array<{ key: string; row: unknown[] }> {
  const { rows, headerRowIndex, columns } = parsed;
  const items: Array<{ key: string; row: unknown[] }> = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (!shouldIncludeRow(row, columns)) continue;
    items.push({ key: rowKey(row, columns, rowIndex), row });
  }

  return items;
}

type IntegratedBaseItem = { key: string; row: unknown[]; columns: QuotationColumns };

/** 기준 업체 내역 순서를 유지하고, 다른 업체에만 있는 항목을 통합내역에 추가 */
function buildIntegratedBaseItems(
  ranked: ParsedQuotationFile[],
  template: ParsedQuotationFile,
): IntegratedBaseItem[] {
  const integrated: IntegratedBaseItem[] = collectComparableRows(template).map(({ key, row }) => ({
    key,
    row,
    columns: template.columns,
  }));
  const seenKeys = new Set(integrated.map((item) => item.key));

  for (const parsed of ranked) {
    if (parsed.partnerId === template.partnerId) continue;
    for (const { key, row } of collectComparableRows(parsed)) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      integrated.push({ key, row, columns: parsed.columns });
    }
  }

  return integrated;
}

function buildRowLookup(parsed: ParsedQuotationFile): Map<string, unknown[]> {
  const { rows, headerRowIndex, columns } = parsed;
  const lookup = new Map<string, unknown[]>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (!shouldIncludeRow(row, columns)) continue;
    lookup.set(rowKey(row, columns, rowIndex), row);
  }

  return lookup;
}

function buildIntegratedLineMatrix(
  ranked: ParsedQuotationFile[],
  template: ParsedQuotationFile,
): IntegratedLineQuote[] {
  const baseItems = buildIntegratedBaseItems(ranked, template);
  const vendorLookups = ranked.map((parsed) => buildRowLookup(parsed));

  return baseItems.map(({ key, row, columns }) => {
    const budgetItemName = getBudgetItemLabel(row, columns);
    const orderItemName = String(getCell(row, columns.orderItemName) ?? '').trim();
    const budgetCode = getBudgetCode(row, columns);
    const isRoundingItem = isRoundingRow(row, columns);
    const explicitOverhead = isExplicitOverheadRow(row, columns);
    const codelessOverhead = isCodelessOverheadRow(row, columns);

    return {
      key,
      budgetCode,
      budgetItemName,
      orderItemName,
      isOverheadItem: explicitOverhead || codelessOverhead,
      isImplicitOverheadItem: codelessOverhead && !explicitOverhead,
      isRoundingItem,
      vendorQuotes: ranked.map((parsed, vendorIndex) => {
        const vendorRow = vendorLookups[vendorIndex].get(key);
        if (!vendorRow) {
          return {
            partnerId: parsed.partnerId,
            vendorName: parsed.vendorName,
            quoteAmount: 0,
            unitPrice: 0,
            quantity: 0,
            missing: true,
            hasLabor: false,
            hasMaterial: false,
          };
        }

        const breakdown = calculateRowPriceBreakdown(vendorRow, parsed.columns);
        const quantity = parseCellNumber(getCell(vendorRow, parsed.columns.quantity)) ?? 0;
        let unitPrice = breakdown?.quoteUnit ?? 0;
        let quoteAmount = breakdown?.quoteAmount ?? 0;
        if (quoteAmount === 0 && isCodelessOverheadRow(vendorRow, parsed.columns)) {
          quoteAmount = readDirectQuoteAmount(vendorRow, parsed.columns);
        }
        if (unitPrice <= 0 && quantity > 0 && quoteAmount !== 0) {
          unitPrice = roundWon(quoteAmount / quantity);
        }

        return {
          partnerId: parsed.partnerId,
          vendorName: parsed.vendorName,
          quoteAmount,
          unitPrice,
          quantity,
          missing: false,
          hasLabor: (breakdown?.laborAmount ?? 0) !== 0,
          hasMaterial: (breakdown?.materialAmount ?? 0) !== 0,
        };
      }),
    };
  });
}

async function buildComparisonWorkbook(
  ranked: ParsedQuotationFile[],
  template: ParsedQuotationFile,
  reviewIssues: BidReviewIssue[],
): Promise<{ blob: Blob; markCount: number }> {
  const baseItems = buildIntegratedBaseItems(ranked, template);
  const lineKeys = baseItems.map((item) => item.key);
  const rankedPartnerIds = ranked.map((parsed) => parsed.partnerId);

  const vendorTitleRow: unknown[] = Array(BASE_HEADERS.length).fill('');
  const headerRow: unknown[] = [...BASE_HEADERS];

  for (const parsed of ranked) {
    vendorTitleRow.push(vendorLabel(parsed.vendorName));
    vendorTitleRow.push(...Array(PRICE_HEADERS.length - 1).fill(''));
    headerRow.push(...PRICE_HEADERS);
  }

  const vendorLookups = ranked.map((parsed) => buildRowLookup(parsed));

  const dataRows: unknown[][] = baseItems.map(({ key, row, columns }) => {
    const mergedRow = extractBaseRow(row, columns);
    for (let vendorIndex = 0; vendorIndex < ranked.length; vendorIndex++) {
      const parsed = ranked[vendorIndex];
      const vendorRow = vendorLookups[vendorIndex].get(key);
      mergedRow.push(
        ...(vendorRow
          ? extractPriceBlock(vendorRow, parsed.columns)
          : Array(PRICE_HEADERS.length).fill('')),
      );
    }
    return mergedRow;
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'S-NEXUS';
  const sheet = workbook.addWorksheet('내역서');

  sheet.addRow(vendorTitleRow);
  sheet.addRow(headerRow);
  for (const row of dataRows) {
    sheet.addRow(row);
  }

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF2F6' },
  };
  sheet.getRow(2).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true };
  });

  const cellMarks = mergeReviewCellMarks(
    buildReviewCellMarks(reviewIssues, lineKeys, rankedPartnerIds),
  );

  for (const [key, { severity, notes }] of cellMarks) {
    const [sheetRow, sheetCol] = key.split(':').map(Number);
    applyReviewCellMark(sheet.getCell(sheetRow, sheetCol), severity, notes.join('\n\n'));
  }

  addReviewIssueSheet(workbook, reviewIssues, lineKeys, rankedPartnerIds, baseItems, cellMarks.size);

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    markCount: cellMarks.size,
  };
}

function applyReviewCellMark(
  cell: ExcelJS.Cell,
  severity: BidReviewIssue['severity'],
  noteText: string,
): void {
  const borderColor = reviewCellBorderColor(severity);
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: reviewCellFillColor(severity) },
  };
  cell.border = {
    top: { style: 'thin', color: { argb: borderColor } },
    left: { style: 'thin', color: { argb: borderColor } },
    bottom: { style: 'thin', color: { argb: borderColor } },
    right: { style: 'thin', color: { argb: borderColor } },
  };
  cell.note = noteText;
}

function formatBaseItemRef(item: IntegratedBaseItem): string {
  const orderItemName = String(getCell(item.row, item.columns.orderItemName) ?? '').trim();
  const budgetCode =
    item.columns.budgetCode >= 0
      ? String(getCell(item.row, item.columns.budgetCode) ?? '').trim()
      : '';
  const budgetItemName =
    item.columns.budgetItemName >= 0
      ? String(getCell(item.row, item.columns.budgetItemName) ?? '').trim()
      : '';
  const label = orderItemName || budgetItemName || item.key;
  return budgetCode ? `${label} [${budgetCode}]` : label;
}

function addReviewIssueSheet(
  workbook: ExcelJS.Workbook,
  reviewIssues: BidReviewIssue[],
  lineKeys: string[],
  rankedPartnerIds: string[],
  baseItems: IntegratedBaseItem[],
  markCount: number,
): void {
  const sheet = workbook.addWorksheet('검토이슈');
  const lineRefMap = new Map(baseItems.map((item) => [item.key, formatBaseItemRef(item)]));

  sheet.addRow([
    'S-NEXUS 견적 검토이슈',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  sheet.mergeCells(1, 1, 1, 9);
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.addRow([
    `· 내역서 시트 ${markCount}개 셀 색상·테두리·메모 표시 (빨강=긴급, 주황=확인)`,
  ]);
  sheet.mergeCells(2, 1, 2, 9);

  sheet.addRow([
    '· Excel 메모: [검토] → [메모 표시] 또는 셀 우클릭 → 메모 표시 (셀 우측 상단 빨간 표시)',
  ]);
  sheet.mergeCells(3, 1, 3, 9);

  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'No',
    '유형',
    '중요도',
    '업체',
    '항목',
    '셀위치',
    '이슈요약',
    '검토조치',
    '상세메모',
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEEF2F6' },
    };
  });

  if (reviewIssues.length === 0) {
    sheet.addRow(['', '', '', '', '자동 검토 기준에 해당하는 이슈가 없습니다.', '', '', '', '']);
  }

  reviewIssues.forEach((issue, index) => {
    const vendorMatch = issue.title.match(/^\[([^\]]+)\]/);
    const vendor = vendorMatch?.[1] ?? '';
    const itemLabel = issue.lineKey ? (lineRefMap.get(issue.lineKey) ?? issue.lineKey) : '-';
    const cellAddress =
      getIssuePrimaryCellAddress(issue, lineKeys, rankedPartnerIds) ?? '-';
    const noteText = issue.excelNote ?? issue.title;

    const row = sheet.addRow([
      index + 1,
      BID_REVIEW_CATEGORY_LABELS[issue.category],
      issue.severity === 'critical' ? '긴급' : '확인',
      vendor,
      itemLabel,
      cellAddress,
      issue.title.replace(/^\[[^\]]+\]\s*/, ''),
      issue.reviewerAction ?? '',
      noteText,
    ]);

    if (issue.severity === 'critical') {
      row.getCell(3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE5E5' },
      };
    }

    row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
  });

  sheet.getColumn(5).width = 28;
  sheet.getColumn(6).width = 14;
  sheet.getColumn(7).width = 36;
  sheet.getColumn(8).width = 42;
  sheet.getColumn(9).width = 72;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || '견적비교';
}

async function parseQuotationFile(partner: BidPartnerEntry): Promise<ParsedQuotationFile | BidQuotationCompareItem> {
  const ext = partner.file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!EXCEL_EXTENSIONS.has(ext)) {
    return {
      partnerId: partner.id,
      vendorName: partner.vendorName,
      fileName: partner.file.name,
      totalAmount: null,
      lineCount: 0,
      rank: 0,
      status: 'unsupported',
      message: 'Excel(xlsx, xls) 견적서만 분석할 수 있습니다.',
    };
  }

  try {
    const rows = await readExcelRows(partner.file);
    if (rows.length === 0) {
      return {
        partnerId: partner.id,
        vendorName: partner.vendorName,
        fileName: partner.file.name,
        totalAmount: null,
        lineCount: 0,
        rank: 0,
        status: 'error',
        message: '발주품의명·견적수량이 포함된 상세 입찰내역 시트를 찾지 못했습니다.',
      };
    }

    const header = findHeaderRow(rows);
    if (!header) {
      return {
        partnerId: partner.id,
        vendorName: partner.vendorName,
        fileName: partner.file.name,
        totalAmount: null,
        lineCount: 0,
        rank: 0,
        status: 'error',
        message: '상세 입찰내역 시트(발주품의명·견적수량·견적금액·실행예산코드)를 찾지 못했습니다.',
      };
    }

    const total = calculateErpQuotationTotal(rows);
    if (total == null) {
      return {
        partnerId: partner.id,
        vendorName: partner.vendorName,
        fileName: partner.file.name,
        totalAmount: null,
        lineCount: 0,
        rank: 0,
        status: 'error',
        message: '합산 가능한 견적 항목이 없습니다.',
      };
    }

    return {
      partnerId: partner.id,
      vendorName: partner.vendorName,
      fileName: partner.file.name,
      rows,
      headerRowIndex: header.headerRowIndex,
      columns: header.columns,
    };
  } catch {
    return {
      partnerId: partner.id,
      vendorName: partner.vendorName,
      fileName: partner.file.name,
      totalAmount: null,
      lineCount: 0,
      rank: 0,
      status: 'error',
      message: '파일을 읽는 중 오류가 발생했습니다.',
    };
  }
}

export async function analyzePartnerQuotations(
  partners: BidPartnerEntry[],
  projectCode: string,
): Promise<BidQuotationAnalysisResult> {
  const parsedResults = await Promise.all(partners.map(parseQuotationFile));

  const errors = parsedResults.filter(
    (item): item is BidQuotationCompareItem => 'status' in item,
  );
  const parsedFiles = parsedResults.filter(
    (item): item is ParsedQuotationFile => !('status' in item),
  );

  const okItems: BidQuotationCompareItem[] = parsedFiles.map((parsed) => {
    const total = calculateErpQuotationTotal(parsed.rows)!;
    return {
      partnerId: parsed.partnerId,
      vendorName: parsed.vendorName,
      fileName: parsed.fileName,
      totalAmount: total.total,
      lineCount: total.lineCount,
      rank: 0,
      status: 'ok',
      message: `${total.lineCount}개 항목 합산`,
    };
  });

  const rankedItems = [...okItems]
    .sort((a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const rankedParsed = rankedItems
    .map((item) => parsedFiles.find((parsed) => parsed.partnerId === item.partnerId))
    .filter((parsed): parsed is ParsedQuotationFile => parsed != null);

  const template =
    parsedFiles.find((parsed) => parsed.columns.unit >= 0) ??
    [...parsedFiles].sort(
      (a, b) =>
        collectComparableRows(b).length - collectComparableRows(a).length,
    )[0] ??
    null;

  const integratedLines =
    template && rankedParsed.length >= 1
      ? buildIntegratedLineMatrix(rankedParsed, template)
      : [];

  const overheadByPartner = new Map<string, VendorOverheadRatioResult>();
  for (const parsed of rankedParsed) {
    const stats = computeVendorOverheadStats(
      parsed.rows,
      parsed.headerRowIndex,
      parsed.columns,
      parsed.vendorName,
    );
    if (stats) overheadByPartner.set(parsed.partnerId, stats);
  }

  const reviewIssuesRaw =
    template && rankedParsed.length >= 2
      ? buildQuotationReviewIssues(
          rankedItems.map(
            (item): IntegratedVendorQuote => ({
              partnerId: item.partnerId,
              vendorName: item.vendorName,
              rank: item.rank,
              totalAmount: item.totalAmount ?? 0,
            }),
          ),
          integratedLines,
          overheadByPartner,
        )
      : [];

  const reviewIssues = finalizeReviewIssues(reviewIssuesRaw, integratedLines);
  const reviewerSummary = buildReviewerSummary(
    reviewIssues,
    integratedLines,
    rankedItems.map(
      (item): IntegratedVendorQuote => ({
        partnerId: item.partnerId,
        vendorName: item.vendorName,
        rank: item.rank,
        totalAmount: item.totalAmount ?? 0,
      }),
    ),
  );

  let comparisonBlob: Blob | null = null;
  let markCount = 0;

  const regenerateComparisonExcel = async (): Promise<Blob | null> => {
    if (!template || rankedParsed.length < 1) return null;
    const rebuilt = await buildComparisonWorkbook(rankedParsed, template, reviewIssues);
    comparisonBlob = rebuilt.blob;
    markCount = rebuilt.markCount;
    return rebuilt.blob;
  };

  if (template && rankedParsed.length >= 1) {
    const built = await buildComparisonWorkbook(rankedParsed, template, reviewIssues);
    comparisonBlob = built.blob;
    markCount = built.markCount;
  }

  const comparisonFileName = `${sanitizeFileName(projectCode)}_견적비교분석.xlsx`;

  return {
    items: [...rankedItems, ...errors],
    comparisonBlob,
    comparisonFileName,
    reviewIssues,
    reviewerSummary,
    markCount,
    regenerateComparisonExcel,
  };
}

export function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function downloadQuotationComparison(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
