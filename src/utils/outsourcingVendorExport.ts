import ExcelJS from 'exceljs';

import type { VendorChartItem } from '@/types/outsourcing';
import type { ExportTable } from '@/utils/reportExport';

export type OutsourcingVendorExportFormat = 'excel' | 'pdf';

export const OUTSOURCING_VENDOR_EXPORT_FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
] as const;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getFilenameBase(): string {
  return `업체별점유율_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
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

async function downloadVendorExcel(table: ExportTable, filenameBase: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'S-NEXUS';
  const sheet = workbook.addWorksheet('점유율');
  sheet.addRow(table.headers);
  table.rows.forEach((row) => sheet.addRow(row));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F4F6' },
  };
  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    `${filenameBase}.xlsx`,
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

async function prepareChartForPdfCapture(root: HTMLElement): Promise<() => void> {
  const backups: Array<{ element: HTMLElement; property: string; value: string }> = [];

  const remember = (element: HTMLElement, property: string) => {
    backups.push({ element, property, value: element.style.getPropertyValue(property) });
  };

  const apply = (element: HTMLElement, property: string, value: string) => {
    remember(element, property);
    element.style.setProperty(property, value);
  };

  root.classList.add('outsourcing-chart-export-capture');
  apply(root, 'background-color', '#ffffff');

  const scrollEl = root.querySelector('.outsourcing-chart__scroll') as HTMLElement | null;
  const innerEl = root.querySelector('.outsourcing-chart__scroll-inner') as HTMLElement | null;

  if (scrollEl && innerEl) {
    const fullWidth = Math.max(innerEl.scrollWidth, innerEl.offsetWidth, 320);
    apply(scrollEl, 'overflow', 'visible');
    apply(scrollEl, 'width', `${fullWidth}px`);
    apply(innerEl, 'min-width', `${fullWidth}px`);
  }

  root.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  await waitForNextPaint();

  return () => {
    root.classList.remove('outsourcing-chart-export-capture');
    backups.forEach(({ element, property, value }) => {
      element.style.setProperty(property, value);
    });
  };
}

async function downloadVendorChartPdf(chartElement: HTMLElement, filenameBase: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const cleanup = await prepareChartForPdfCapture(chartElement);

  try {
    const width = Math.max(chartElement.scrollWidth, chartElement.offsetWidth, 1);
    const height = Math.max(chartElement.scrollHeight, chartElement.offsetHeight, 1);

    const canvas = await html2canvas(chartElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('차트 이미지를 생성하지 못했습니다.');
    }

    const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const renderWidth = canvas.width * scale;
    const renderHeight = canvas.height * scale;
    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = margin;

    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      offsetX,
      offsetY,
      renderWidth,
      renderHeight,
    );
    pdf.save(`${filenameBase}.pdf`);
  } finally {
    cleanup();
  }
}

export async function exportOutsourcingVendorChart(input: {
  format: OutsourcingVendorExportFormat;
  items: VendorChartItem[];
  chartElement: HTMLElement;
}): Promise<void> {
  if (input.items.length === 0) {
    throw new Error('내보낼 데이터가 없습니다.');
  }

  const filenameBase = getFilenameBase();
  if (input.format === 'excel') {
    await downloadVendorExcel(buildOutsourcingVendorExportTable(input.items), filenameBase);
    return;
  }

  await downloadVendorChartPdf(input.chartElement, filenameBase);
}
