import ExcelJS from 'exceljs';
import { mapTextToFundBillingDepartment } from '@/constants/fundBilling';
import type { FundBillingProjectRow } from '@/types/fundBilling';
import type { FundBillingReport } from '@/types/fundBillingReport';
import {
  buildActiveExhibitInteriorStatementRows,
  buildCashAnalysisSummaryRows,
  reportsForCashAnalysisMonth,
} from '@/utils/fundBillingReport';
import { formatMonthKeyToKorean } from '@/utils/formatInput';

const TEMPLATE_URL = '/templates/기성집계표.xlsx';
const MONTHLY_TEMPLATE_URL = '/templates/월별기성집계표.xlsx';
const PROJECT_COLS = 12;
const MONTHLY_WEB_FROM = '2026-10';
const MONTHLY_FIRST_YEAR_START = 5;
const MONTHLY_SECOND_YEAR_START = 18;
/** 첨부 템플릿 기준 2026-09까지 고정. 10월부터 웹 총합계 */
const FROZEN_MONTHLY_TOTALS: Record<string, StatementAmounts> = {
  '2026-09': {
    contract: 226_633_241_271,
    received: 174_403_880_926,
    expectedReceive: 6_806_789_091,
    subcontractMonth: 4_646_269_725,
    monthBilling: 5_739_767_540,
    cumulativeBilling: 165_860_367_896,
    confirmedCash: 8_543_513_030,
    plannedCash: 15_350_302_121,
  },
};

interface StatementAmounts {
  contract: number;
  received: number;
  expectedReceive: number;
  subcontractMonth: number;
  monthBilling: number;
  cumulativeBilling: number;
  confirmedCash: number;
  plannedCash: number;
}

interface SectionSpec {
  department: string;
  dataStart: number;
  slots: number;
  totalRow: number;
  previewRow?: number;
}

function formatKoreanYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
}

function toAmounts(row: FundBillingProjectRow): StatementAmounts {
  const contract = row.contractAmount;
  const received = row.collectedPrior;
  const expectedReceive = row.expectedCollectionMonth;
  const subcontractMonth = row.monthSubcontractBilling ?? 0;
  /** 금월기성금액 = 월별 기성보고서 관리팀검수 직접원가 계 */
  const monthBilling = Number.isFinite(row.monthSpendExpected) ? Number(row.monthSpendExpected) : 0;
  const priorDirectCost = Number.isFinite(row.spentPrior) ? Number(row.spentPrior) : 0;
  const cumulativeBilling = priorDirectCost + monthBilling;
  return {
    contract,
    received,
    expectedReceive,
    subcontractMonth,
    monthBilling,
    cumulativeBilling,
    confirmedCash: received - cumulativeBilling,
    plannedCash: row.collectedTotal - cumulativeBilling,
  };
}

function emptyAmounts(): StatementAmounts {
  return {
    contract: 0,
    received: 0,
    expectedReceive: 0,
    subcontractMonth: 0,
    monthBilling: 0,
    cumulativeBilling: 0,
    confirmedCash: 0,
    plannedCash: 0,
  };
}

function addAmounts(left: StatementAmounts, right: StatementAmounts): StatementAmounts {
  return {
    contract: left.contract + right.contract,
    received: left.received + right.received,
    expectedReceive: left.expectedReceive + right.expectedReceive,
    subcontractMonth: left.subcontractMonth + right.subcontractMonth,
    monthBilling: left.monthBilling + right.monthBilling,
    cumulativeBilling: left.cumulativeBilling + right.cumulativeBilling,
    confirmedCash: left.confirmedCash + right.confirmedCash,
    plannedCash: left.plannedCash + right.plannedCash,
  };
}

function fitProjectCell(cell: ExcelJS.Cell) {
  cell.alignment = {
    ...cell.alignment,
    wrapText: false,
    shrinkToFit: true,
    vertical: cell.alignment?.vertical ?? 'middle',
  };
}

function numericOrBlank(value: number, keepZero = false): number | null {
  if (!Number.isFinite(value)) return null;
  if (value !== 0) return value;
  return keepZero ? 0 : null;
}

function writeAmountCells(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: StatementAmounts,
  withRates: boolean,
  keepZero = false,
) {
  const row = sheet.getRow(rowNumber);
  row.getCell(3).value = numericOrBlank(values.contract, keepZero);
  row.getCell(4).value = numericOrBlank(values.received, keepZero);
  row.getCell(5).value = numericOrBlank(values.expectedReceive, keepZero);
  row.getCell(6).value = numericOrBlank(values.subcontractMonth, keepZero);
  row.getCell(7).value = numericOrBlank(values.monthBilling, keepZero);
  row.getCell(8).value = numericOrBlank(values.cumulativeBilling, keepZero);
  row.getCell(9).value = numericOrBlank(values.confirmedCash, keepZero);
  row.getCell(11).value = numericOrBlank(values.plannedCash, keepZero);
  if (withRates) {
    row.getCell(10).value = values.contract ? numericOrBlank(values.confirmedCash / values.contract, keepZero) : keepZero ? 0 : null;
    row.getCell(12).value = values.contract ? numericOrBlank(values.plannedCash / values.contract, keepZero) : keepZero ? 0 : null;
  }
}

function clearProjectRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  for (let col = 1; col <= PROJECT_COLS; col += 1) {
    row.getCell(col).value = null;
  }
}

function isExhibitOrInterior(department: string): boolean {
  return department === '전시' || department === '인테리어';
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return '';
}

function keepTotalLabelInNameColumn(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  const left = row.getCell(1).value;
  const right = row.getCell(2).value;
  const labelValue = cellText(row.getCell(2)).trim() ? right : left;
  try {
    sheet.unMergeCells(`A${rowNumber}:B${rowNumber}`);
  } catch {
    /* not merged */
  }
  row.getCell(1).value = null;
  row.getCell(2).value = labelValue ?? null;
}

function applyStatementFormFixes(sheet: ExcelJS.Worksheet, sections: SectionSpec[]) {
  const interiorTotal = sections[1].totalRow;
  keepTotalLabelInNameColumn(sheet, sections[0].totalRow);
  keepTotalLabelInNameColumn(sheet, interiorTotal);
  keepTotalLabelInNameColumn(sheet, interiorTotal + 1);
  keepTotalLabelInNameColumn(sheet, (sections[2].previewRow ?? 55) + 1);
  keepTotalLabelInNameColumn(sheet, (sections[4].previewRow ?? 57) + 3);
}

function writeProjectRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  index: number,
  project: FundBillingProjectRow,
  keepZero = false,
) {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = index;
  row.getCell(2).value = project.projectName;
  writeAmountCells(sheet, rowNumber, toAmounts(project), true, keepZero);
  for (let col = 1; col <= PROJECT_COLS; col += 1) {
    fitProjectCell(row.getCell(col));
  }
}

function bump(spec: SectionSpec, fromRow: number, extra: number) {
  if (spec.dataStart >= fromRow) spec.dataStart += extra;
  if (spec.totalRow >= fromRow) spec.totalRow += extra;
  if (spec.previewRow && spec.previewRow >= fromRow) spec.previewRow += extra;
}

function resizeSection(
  sheet: ExcelJS.Worksheet,
  spec: SectionSpec,
  needed: number,
  later: SectionSpec[],
) {
  const delta = needed - spec.slots;
  if (delta === 0) return;
  if (delta > 0) {
    const styleRow = spec.slots > 1 ? spec.dataStart + 1 : spec.dataStart;
    const insertAt = spec.dataStart + spec.slots;
    sheet.duplicateRow(styleRow, delta, true);
    spec.slots += delta;
    spec.totalRow += delta;
    for (const other of later) bump(other, insertAt, delta);
    return;
  }
  const remove = -delta;
  const start = spec.dataStart + needed;
  sheet.spliceRows(start, remove);
  spec.slots = needed;
  spec.totalRow -= remove;
  for (const other of later) bump(other, start, -remove);
}

function fillSection(
  sheet: ExcelJS.Worksheet,
  spec: SectionSpec,
  projects: FundBillingProjectRow[],
  keepZero = false,
): StatementAmounts {
  for (let i = 0; i < projects.length; i += 1) {
    writeProjectRow(sheet, spec.dataStart + i, i + 1, projects[i], keepZero);
  }
  for (let i = projects.length; i < spec.slots; i += 1) {
    clearProjectRow(sheet, spec.dataStart + i);
  }
  const total = projects.reduce((sum, item) => addAmounts(sum, toAmounts(item)), emptyAmounts());
  writeAmountCells(sheet, spec.totalRow, total, true, keepZero);
  return total;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function excelNumeric(cell: ExcelJS.Cell): number | null {
  const value = cell.value as unknown;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const result = (value as { result?: unknown }).result;
    if (typeof result === 'number' && Number.isFinite(result)) return result;
  }
  return null;
}

function statementGrandTotal(
  rows: FundBillingProjectRow[],
  fullMonthRows?: FundBillingProjectRow[],
): StatementAmounts {
  const grouped = new Map<string, FundBillingProjectRow[]>();
  for (const row of rows) {
    const key = mapTextToFundBillingDepartment(row.divisionId || row.divisionName);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  if (fullMonthRows?.length) {
    const exhibitInterior = new Map<string, FundBillingProjectRow[]>();
    for (const row of fullMonthRows) {
      const key = mapTextToFundBillingDepartment(row.divisionId || row.divisionName);
      if (!isExhibitOrInterior(key)) continue;
      const list = exhibitInterior.get(key) ?? [];
      list.push(row);
      exhibitInterior.set(key, list);
    }
    grouped.set('전시', exhibitInterior.get('전시') ?? []);
    grouped.set('인테리어', exhibitInterior.get('인테리어') ?? []);
  }

  const departments = ['전시', '인테리어', '설계', '시스템', '기타프로젝트'] as const;
  return departments.reduce((sum, department) => {
    const keepZero = isExhibitOrInterior(department);
    const projects = grouped.get(department) ?? [];
    const visible = keepZero
      ? projects
      : projects.filter((item) => {
          const monthBilling = Number.isFinite(item.monthSpendExpected) ? Number(item.monthSpendExpected) : 0;
          return monthBilling > 0;
        });
    const total = visible.reduce((acc, item) => addAmounts(acc, toAmounts(item)), emptyAmounts());
    return addAmounts(sum, total);
  }, emptyAmounts());
}

function monthlyWindowYears(monthKey: string, reports: FundBillingReport[]): [number, number] {
  let endYear = 2026;
  for (const key of [...reports.map((item) => item.monthKey), monthKey]) {
    const year = Number(String(key).slice(0, 4));
    if (Number.isFinite(year) && year > endYear) endYear = year;
  }
  return [endYear - 1, endYear];
}

function shouldFillMonthlyFromWeb(
  month: string,
  selectedMonth: string,
  reports: FundBillingReport[],
): boolean {
  if (month < MONTHLY_WEB_FROM) return false;
  if (month === selectedMonth) return true;
  return reportsForCashAnalysisMonth(reports, month).length > 0;
}

function snapshotMonthlyTemplate(sheet: ExcelJS.Worksheet): Map<string, StatementAmounts> {
  const snapshot = new Map<string, StatementAmounts>();
  const readBlock = (startRow: number) => {
    for (let index = 0; index < 12; index += 1) {
      const row = sheet.getRow(startRow + index);
      const year = Number(row.getCell(2).value);
      const month = Number(String(row.getCell(3).value ?? '').replace(/[^\d]/g, ''));
      if (!year || !month) continue;
      snapshot.set(monthKeyOf(year, month), {
        contract: excelNumeric(row.getCell(4)) ?? 0,
        received: excelNumeric(row.getCell(5)) ?? 0,
        expectedReceive: excelNumeric(row.getCell(6)) ?? 0,
        subcontractMonth: excelNumeric(row.getCell(7)) ?? 0,
        monthBilling: excelNumeric(row.getCell(8)) ?? 0,
        cumulativeBilling: excelNumeric(row.getCell(9)) ?? 0,
        confirmedCash: excelNumeric(row.getCell(10)) ?? 0,
        plannedCash: excelNumeric(row.getCell(12)) ?? 0,
      });
    }
  };
  readBlock(MONTHLY_FIRST_YEAR_START);
  readBlock(MONTHLY_SECOND_YEAR_START);
  for (const [key, values] of Object.entries(FROZEN_MONTHLY_TOTALS)) {
    snapshot.set(key, values);
  }
  return snapshot;
}

function templateAmountsForMonth(
  key: string,
  snapshot: Map<string, StatementAmounts>,
): StatementAmounts | undefined {
  return FROZEN_MONTHLY_TOTALS[key] ?? snapshot.get(key);
}

function writeMonthlyAmountRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: StatementAmounts | null) {
  const row = sheet.getRow(rowNumber);
  if (!values) {
    for (let col = 4; col <= 13; col += 1) {
      row.getCell(col).value = null;
    }
    return;
  }
  row.getCell(4).value = values.contract;
  row.getCell(5).value = values.received;
  row.getCell(6).value = values.expectedReceive;
  row.getCell(7).value = values.subcontractMonth;
  row.getCell(8).value = values.monthBilling;
  row.getCell(9).value = values.cumulativeBilling;
  row.getCell(10).value = values.confirmedCash;
  row.getCell(11).value = values.contract ? values.confirmedCash / values.contract : null;
  row.getCell(12).value = values.plannedCash;
  row.getCell(13).value = values.contract ? values.plannedCash / values.contract : null;
}

function snapshotHasAmounts(values: StatementAmounts | undefined): boolean {
  if (!values) return false;
  return Object.values(values).some((value) => Number.isFinite(value) && value !== 0);
}

function labelYearBlock(sheet: ExcelJS.Worksheet, startRow: number, year: number, startNo: number) {
  for (let index = 0; index < 12; index += 1) {
    const row = sheet.getRow(startRow + index);
    row.getCell(1).value = startNo + index;
    row.getCell(2).value = year;
    row.getCell(3).value = `${index + 1}월`;
  }
}

function writeYearTotalRow(sheet: ExcelJS.Worksheet, startRow: number, year: number) {
  const totalRow = startRow === MONTHLY_FIRST_YEAR_START ? 17 : 30;
  let total = emptyAmounts();
  for (let index = 0; index < 12; index += 1) {
    const row = sheet.getRow(startRow + index);
    total = addAmounts(total, {
      contract: excelNumeric(row.getCell(4)) ?? 0,
      received: excelNumeric(row.getCell(5)) ?? 0,
      expectedReceive: excelNumeric(row.getCell(6)) ?? 0,
      subcontractMonth: excelNumeric(row.getCell(7)) ?? 0,
      monthBilling: excelNumeric(row.getCell(8)) ?? 0,
      cumulativeBilling: excelNumeric(row.getCell(9)) ?? 0,
      confirmedCash: excelNumeric(row.getCell(10)) ?? 0,
      plannedCash: excelNumeric(row.getCell(12)) ?? 0,
    });
  }
  writeMonthlyAmountRow(sheet, totalRow, total);
  const row = sheet.getRow(totalRow);
  row.getCell(1).value = `${year}년 합 계`;
  row.getCell(10).value = null;
  row.getCell(12).value = null;
}

function yearTitleDigits(year: number): string {
  return String(year).slice(-2);
}

function fillMonthlyStatementSheet(
  sheet: ExcelJS.Worksheet,
  reports: FundBillingReport[],
  selectedMonth: string,
  selectedGrand: StatementAmounts,
  printedDate: string,
) {
  const snapshot = snapshotMonthlyTemplate(sheet);
  const [startYear, endYear] = monthlyWindowYears(selectedMonth, reports);
  sheet.getCell('B1').value =
    `(${yearTitleDigits(startYear)}~${yearTitleDigits(endYear)}년) 월 별 기 성 집 계 표`;
  const dateCell = sheet.getCell('G3');
  dateCell.value = printedDate;
  dateCell.numFmt = '@';
  labelYearBlock(sheet, MONTHLY_FIRST_YEAR_START, startYear, 1);
  labelYearBlock(sheet, MONTHLY_SECOND_YEAR_START, endYear, 13);

  const fillYear = (year: number, startRow: number) => {
    for (let month = 1; month <= 12; month += 1) {
      const key = monthKeyOf(year, month);
      const rowNumber = startRow + month - 1;
      if (shouldFillMonthlyFromWeb(key, selectedMonth, reports)) {
        const grand =
          key === selectedMonth
            ? selectedGrand
            : statementGrandTotal(
                buildCashAnalysisSummaryRows(reports, key),
                buildActiveExhibitInteriorStatementRows(reports, key),
              );
        writeMonthlyAmountRow(sheet, rowNumber, grand);
        continue;
      }
      const templateAmounts = templateAmountsForMonth(key, snapshot);
      if (key < MONTHLY_WEB_FROM && snapshotHasAmounts(templateAmounts)) {
        writeMonthlyAmountRow(sheet, rowNumber, templateAmounts ?? null);
        continue;
      }
      if (startYear !== 2025 || endYear !== 2026 || key >= MONTHLY_WEB_FROM) {
        writeMonthlyAmountRow(sheet, rowNumber, null);
      }
    }
  };

  fillYear(startYear, MONTHLY_FIRST_YEAR_START);
  fillYear(endYear, MONTHLY_SECOND_YEAR_START);
  writeYearTotalRow(sheet, MONTHLY_FIRST_YEAR_START, startYear);
  writeYearTotalRow(sheet, MONTHLY_SECOND_YEAR_START, endYear);
}

function copyCellValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  const value = cell.value;
  if (value && typeof value === 'object') {
    const formula = value as { formula?: string; sharedFormula?: string; result?: ExcelJS.CellValue };
    if (formula.formula || formula.sharedFormula) {
      return (formula.result as ExcelJS.CellValue) ?? null;
    }
  }
  return value;
}

function copyWorksheet(source: ExcelJS.Worksheet, target: ExcelJS.Workbook, name: string) {
  const dest = target.addWorksheet(name, {
    properties: source.properties,
    views: source.views,
    pageSetup: source.pageSetup,
    headerFooter: source.headerFooter,
    state: source.state,
  });
  for (let col = 1; col <= 13; col += 1) {
    dest.getColumn(col).width = source.getColumn(col).width;
  }
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > 40) return;
    const destRow = dest.getRow(rowNumber);
    if (row.height) destRow.height = row.height;
    for (let col = 1; col <= 13; col += 1) {
      const cell = row.getCell(col);
      const destCell = destRow.getCell(col);
      destCell.value = copyCellValue(cell);
      destCell.style = { ...cell.style };
      if (cell.numFmt) destCell.numFmt = cell.numFmt;
    }
  });
  const merges = ((source as ExcelJS.Worksheet & { model?: { merges?: string[] } }).model?.merges ?? []) as string[];
  for (const merge of merges) {
    try {
      dest.mergeCells(merge);
    } catch {
      /* already merged */
    }
  }
  return dest;
}

export async function downloadFundBillingStatement(
  rows: FundBillingProjectRow[],
  monthKey: string,
  options?: { fullMonthRows?: FundBillingProjectRow[]; reports?: FundBillingReport[] },
): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error('기성집계표 양식을 불러오지 못했습니다.');
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('기성집계표 시트를 찾지 못했습니다.');
  sheet.name = '기성집계표';

  const monthLabel = formatMonthKeyToKorean(monthKey) || monthKey;
  const printedDate = formatKoreanYmd(new Date());
  sheet.getCell('B1').value = `(${monthLabel}) 기 성 집 계 표`;
  const dateCell = sheet.getCell('D3');
  dateCell.value = printedDate;
  dateCell.numFmt = '@';

  const sections: SectionSpec[] = [
    { department: '전시', dataStart: 5, slots: 17, totalRow: 22 },
    { department: '인테리어', dataStart: 23, slots: 29, totalRow: 52 },
    { department: '설계', dataStart: 62, slots: 12, totalRow: 74, previewRow: 55 },
    { department: '시스템', dataStart: 77, slots: 5, totalRow: 82, previewRow: 56 },
    { department: '기타프로젝트', dataStart: 85, slots: 14, totalRow: 99, previewRow: 57 },
  ];

  const grouped = new Map<string, FundBillingProjectRow[]>();
  for (const row of rows) {
    const key = mapTextToFundBillingDepartment(row.divisionId || row.divisionName);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  if (options?.fullMonthRows?.length) {
    const exhibitInterior = new Map<string, FundBillingProjectRow[]>();
    for (const row of options.fullMonthRows) {
      const key = mapTextToFundBillingDepartment(row.divisionId || row.divisionName);
      if (!isExhibitOrInterior(key)) continue;
      const list = exhibitInterior.get(key) ?? [];
      list.push(row);
      exhibitInterior.set(key, list);
    }
    grouped.set('전시', exhibitInterior.get('전시') ?? []);
    grouped.set('인테리어', exhibitInterior.get('인테리어') ?? []);
  }

  const totals: StatementAmounts[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const spec = sections[index];
    const keepZero = isExhibitOrInterior(spec.department);
    const projects = grouped.get(spec.department) ?? [];
    const visible = keepZero
      ? projects
      : projects.filter((item) => {
          const monthBilling = Number.isFinite(item.monthSpendExpected) ? Number(item.monthSpendExpected) : 0;
          return monthBilling > 0;
        });
    resizeSection(sheet, spec, visible.length, sections.slice(index + 1));
    totals.push(fillSection(sheet, spec, visible, keepZero));
  }

  const [exhibit, interior, design, system, other] = totals;
  const exhibitInterior = addAmounts(exhibit, interior);
  const designGroup = addAmounts(addAmounts(design, system), other);
  const grand = addAmounts(exhibitInterior, designGroup);
  const otherSpec = sections[4];

  writeAmountCells(sheet, sections[1].totalRow + 1, exhibitInterior, true, true);
  if (sections[2].previewRow) writeAmountCells(sheet, sections[2].previewRow, design, true);
  if (sections[3].previewRow) writeAmountCells(sheet, sections[3].previewRow, system, true);
  if (otherSpec.previewRow) {
    writeAmountCells(sheet, otherSpec.previewRow, other, true);
    writeAmountCells(sheet, otherSpec.previewRow + 1, designGroup, true);
    writeAmountCells(sheet, otherSpec.previewRow + 3, grand, true);
  }

  applyStatementFormFixes(sheet, sections);

  const monthlyResponse = await fetch(MONTHLY_TEMPLATE_URL);
  if (!monthlyResponse.ok) {
    throw new Error('월별기성표 양식을 불러오지 못했습니다.');
  }
  const monthlyWorkbook = new ExcelJS.Workbook();
  await monthlyWorkbook.xlsx.load(await monthlyResponse.arrayBuffer());
  const monthlySheet = monthlyWorkbook.worksheets[0];
  if (!monthlySheet) throw new Error('월별기성표 시트를 찾지 못했습니다.');
  fillMonthlyStatementSheet(monthlySheet, options?.reports ?? [], monthKey, grand, printedDate);
  copyWorksheet(monthlySheet, workbook, '월별기성표');

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = monthKey.replace('-', '');
  downloadBlob(
    `기성집계표_${stamp}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}
