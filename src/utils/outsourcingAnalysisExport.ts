import ExcelJS from 'exceljs';

import type {
  OutsourcingExecutionRateSummary,
  OutsourcingKpiSummary,
  VendorChartItem,
} from '@/types/outsourcing';
import {
  formatExecutionRatePercent,
  formatUnitPriceDetail,
} from '@/utils/outsourcingAnalysis';
import type { ExportTable } from '@/utils/reportExport';

export type OutsourcingAnalysisExportFormat = 'excel' | 'pdf';

export const OUTSOURCING_ANALYSIS_EXPORT_FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
] as const;

export const OUTSOURCING_PDF_VENDOR_CHART_LIMIT = 5;

const PDF_MARGIN_PT = 12;
const EXPORT_WRAPPER_CLASS = 'outsourcing-analysis-export-wrapper';
const EXPORT_CAPTURE_CLASS = 'outsourcing-analysis-export-capture';

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getFilenameBase(): string {
  return `외주정보검색_분석결과_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

function styleExcelHeaderRow(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F4F6' },
  };
}

export function buildOutsourcingKpiExportTable(
  summary: OutsourcingKpiSummary,
  rowCount: number,
): ExportTable {
  return {
    headers: ['항목', '값'],
    rows: [
      ['필터 적용 건수', `${rowCount.toLocaleString('ko-KR')}건`],
      ['외주_총금액', String(Math.round(summary.totalAmount))],
      ['외주_자재총금액', String(Math.round(summary.materialTotal))],
      ['외주_노무총금액', String(Math.round(summary.laborTotal))],
      ['외주_경비총금액', String(Math.round(summary.expenseTotal))],
      ['외주_자재단가_평균', String(Math.round(summary.materialUnitPrice.average))],
      ['외주_자재단가_MAX/MIN', formatUnitPriceDetail(summary.materialUnitPrice)],
      ['외주_노무단가_평균', String(Math.round(summary.laborUnitPrice.average))],
      ['외주_노무단가_MAX/MIN', formatUnitPriceDetail(summary.laborUnitPrice)],
      ['외주_경비단가_평균', String(Math.round(summary.expenseUnitPrice.average))],
      ['외주_경비단가_MAX/MIN', formatUnitPriceDetail(summary.expenseUnitPrice)],
    ],
  };
}

export function buildOutsourcingVendorExportTable(items: VendorChartItem[]): ExportTable {
  return {
    headers: ['업체명', '외주합계', '점유율(%)'],
    rows: items.map((item) => [
      item.vendorLabel,
      String(Math.round(item.amount)),
      item.sharePercent.toFixed(1),
    ]),
  };
}

export function buildOutsourcingExecutionRateExportTable(
  summary: OutsourcingExecutionRateSummary,
): ExportTable {
  return {
    headers: ['항목', '값'],
    rows: [
      ['계약금액', String(Math.round(summary.totalContractAmount))],
      ['실행예산', String(Math.round(summary.totalExecutionAmount))],
      ['외주금액', String(Math.round(summary.totalOutsourcingAmount))],
      ['실행률(내부)', formatExecutionRatePercent(summary.internalExecutionRatePercent)],
      ['실행률(외주)', formatExecutionRatePercent(summary.outsourcingExecutionRatePercent)],
    ],
  };
}

async function downloadAnalysisExcel(input: {
  kpiSummary: OutsourcingKpiSummary;
  rowCount: number;
  vendorItems: VendorChartItem[];
  executionSummary: OutsourcingExecutionRateSummary;
  filenameBase: string;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'S-NEXUS';

  const kpiTable = buildOutsourcingKpiExportTable(input.kpiSummary, input.rowCount);
  const kpiSheet = workbook.addWorksheet('검색결과(KPI)');
  kpiSheet.addRow(kpiTable.headers);
  kpiTable.rows.forEach((row) => kpiSheet.addRow(row));
  styleExcelHeaderRow(kpiSheet);
  kpiSheet.columns.forEach((column) => {
    column.width = 28;
  });

  const vendorTable = buildOutsourcingVendorExportTable(input.vendorItems);
  const vendorSheet = workbook.addWorksheet('협력사점유율');
  vendorSheet.addRow(vendorTable.headers);
  vendorTable.rows.forEach((row) => vendorSheet.addRow(row));
  styleExcelHeaderRow(vendorSheet);
  vendorSheet.columns.forEach((column) => {
    column.width = 22;
  });

  const executionTable = buildOutsourcingExecutionRateExportTable(input.executionSummary);
  const executionSheet = workbook.addWorksheet('실행률분석');
  executionSheet.addRow(executionTable.headers);
  executionTable.rows.forEach((row) => executionSheet.addRow(row));
  styleExcelHeaderRow(executionSheet);
  executionSheet.columns.forEach((column) => {
    column.width = 24;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    `${input.filenameBase}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}

async function waitForNextPaint() {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function waitForExportLayoutPaint(): Promise<void> {
  await waitForNextPaint();
  await waitForNextPaint();
}

function constrainVendorChartForExport(clone: HTMLElement) {
  clone.querySelectorAll('.outsourcing-chart-card .outsourcing-chart__scroll').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.overflow = 'hidden';
    node.style.width = '100%';
    node.style.maxWidth = '100%';

    const innerEl = node.querySelector('.outsourcing-chart__scroll-inner') as HTMLElement | null;
    if (innerEl) {
      innerEl.style.minWidth = '0';
      innerEl.style.width = '100%';
      innerEl.style.maxWidth = '100%';
    }
  });
}

function prepareExportCloneLayout(clone: HTMLElement) {
  clone.querySelectorAll('.card, .card__body').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.overflow = 'visible';
    node.style.maxHeight = 'none';
    node.style.height = 'auto';
  });

  clone.querySelectorAll('.outsourcing-chart-card, .outsourcing-budget-chart-card').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.minWidth = '0';
    node.style.overflow = 'hidden';
  });

  constrainVendorChartForExport(clone);
}

function measureElementContentSize(element: HTMLElement): { width: number; height: number } {
  const rootRect = element.getBoundingClientRect();
  let maxBottom = rootRect.bottom;
  let maxRight = rootRect.right;

  element.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;
    maxBottom = Math.max(maxBottom, rect.bottom);
    maxRight = Math.max(maxRight, rect.right);
  });

  return {
    width: Math.max(
      Math.ceil(maxRight - rootRect.left),
      element.scrollWidth,
      element.offsetWidth,
      1,
    ),
    height: Math.max(
      Math.ceil(maxBottom - rootRect.top),
      element.scrollHeight,
      element.offsetHeight,
      1,
    ),
  };
}

function createExportClone(root: HTMLElement): {
  wrapper: HTMLDivElement;
  clone: HTMLElement;
} {
  const captureWidth = Math.max(Math.round(root.getBoundingClientRect().width), root.offsetWidth, 1100);
  const wrapper = document.createElement('div');
  wrapper.className = EXPORT_WRAPPER_CLASS;
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-20000px';
  wrapper.style.top = '0';
  wrapper.style.width = `${captureWidth}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.overflow = 'visible';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.zIndex = '-1';

  const clone = root.cloneNode(true) as HTMLElement;
  clone.classList.add(EXPORT_CAPTURE_CLASS);
  clone.style.width = `${captureWidth}px`;
  clone.style.maxWidth = `${captureWidth}px`;
  clone.style.overflow = 'visible';
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';

  prepareExportCloneLayout(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, clone };
}

function addCanvasToLandscapePdfFitSinglePage(
  pdf: import('jspdf').jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const renderWidth = canvas.width * scale;
  const renderHeight = canvas.height * scale;
  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = (pageHeight - renderHeight) / 2;

  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.95),
    'JPEG',
    offsetX,
    offsetY,
    renderWidth,
    renderHeight,
  );
}

async function downloadAnalysisPdf(exportElement: HTMLElement, filenameBase: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const { wrapper, clone } = createExportClone(exportElement);

  try {
    await waitForNextPaint();
    await waitForNextPaint();

    const { height } = measureElementContentSize(clone);
    wrapper.style.height = `${height}px`;
    clone.style.minHeight = `${height}px`;

    await waitForNextPaint();

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (documentClone: Document) => {
        const clonedRoot = documentClone.querySelector(
          `.${EXPORT_WRAPPER_CLASS} .${EXPORT_CAPTURE_CLASS}`,
        ) as HTMLElement | null;
        if (!clonedRoot) return;
        prepareExportCloneLayout(clonedRoot);
      },
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('분석 결과 이미지를 생성하지 못했습니다.');
    }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    addCanvasToLandscapePdfFitSinglePage(pdf, canvas, PDF_MARGIN_PT);
    pdf.save(`${filenameBase}.pdf`);
  } finally {
    wrapper.remove();
  }
}

export async function exportOutsourcingAnalysisResults(input: {
  format: OutsourcingAnalysisExportFormat;
  kpiSummary: OutsourcingKpiSummary;
  rowCount: number;
  vendorItems: VendorChartItem[];
  executionSummary: OutsourcingExecutionRateSummary;
  exportElement: HTMLElement;
}): Promise<void> {
  if (input.rowCount === 0) {
    throw new Error('내보낼 데이터가 없습니다.');
  }

  const filenameBase = getFilenameBase();

  if (input.format === 'excel') {
    await downloadAnalysisExcel({
      kpiSummary: input.kpiSummary,
      rowCount: input.rowCount,
      vendorItems: input.vendorItems,
      executionSummary: input.executionSummary,
      filenameBase,
    });
    return;
  }

  await downloadAnalysisPdf(input.exportElement, filenameBase);
}
