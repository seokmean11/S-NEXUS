import ExcelJS from 'exceljs';
import type { Division, Team } from '@/types';
import type { ExportTable } from '@/utils/reportExport';
import {
  downloadWordReport,
  tableToWordHtml,
} from '@/utils/reportExport';
import type { PersonnelFilters, PersonnelRow } from '@/utils/personnelSearch';
import { formatPersonnelGradeCell, formatPersonnelPermissionCell, formatPersonnelPositionCell } from '@/utils/personnelSearch';

export type PersonnelExportEntityType = 'executive' | 'employee' | 'division' | 'team';
export type PersonnelExportFormat = 'excel' | 'word' | 'pdf';

const ENTITY_LABELS: Record<PersonnelExportEntityType, string> = {
  executive: '경영진',
  employee: '팀원',
  division: '사업본부',
  team: '팀',
};

export interface PersonnelExportInput {
  format: PersonnelExportFormat;
  entityType: PersonnelExportEntityType;
  personRows: PersonnelRow[];
  divisions: Division[];
  teams: Team[];
  divisionNameById: Map<string, string>;
  filters: PersonnelFilters;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function buildFilterSummary(filters: PersonnelFilters, divisionNameById: Map<string, string>): string {
  const parts: string[] = [];

  if (filters.division.selected.length > 0) {
    const labels = filters.division.selected.map(
      (value) => divisionNameById.get(value) ?? value,
    );
    parts.push(`사업본부: ${labels.join(', ')}`);
  } else if (filters.division.keyword.trim()) {
    parts.push(`사업본부 검색: ${filters.division.keyword.trim()}`);
  }

  if (filters.team.selected.length > 0) {
    parts.push(`팀: ${filters.team.selected.length}개 선택`);
  } else if (filters.team.keyword.trim()) {
    parts.push(`팀 검색: ${filters.team.keyword.trim()}`);
  }

  if (filters.person.selected.length > 0) {
    parts.push(`이름·직급: ${filters.person.selected.length}명 선택`);
  } else if (filters.person.keyword.trim()) {
    parts.push(`이름·직급 검색: ${filters.person.keyword.trim()}`);
  }

  return parts.length > 0 ? parts.join(' · ') : '전체';
}

export function buildPersonnelExportTable(input: Omit<PersonnelExportInput, 'format'>): ExportTable {
  const { entityType, personRows, divisions, teams, divisionNameById } = input;

  if (entityType === 'executive') {
    return {
      headers: ['이름', '급수', '직급', '지위', '권한'],
      rows: personRows.map((row) => [
        row.name,
        formatPersonnelGradeCell(row),
        row.rank,
        formatPersonnelPositionCell(row),
        formatPersonnelPermissionCell(row),
      ]),
    };
  }

  if (entityType === 'employee') {
    return {
      headers: ['이름', '급수', '직급', '지위', '권한', '사업본부', '팀'],
      rows: personRows.map((row) => [
        row.name,
        formatPersonnelGradeCell(row),
        row.rank,
        formatPersonnelPositionCell(row),
        formatPersonnelPermissionCell(row),
        row.divisionName,
        row.teamName,
      ]),
    };
  }

  if (entityType === 'division') {
    return {
      headers: ['사업본부', '본부장', '본부장 직급'],
      rows: divisions.map((division) => [
        division.name,
        division.headName ?? '',
        division.headRank ?? '',
      ]),
    };
  }

  return {
    headers: ['사업본부', '팀', '팀장', '팀장 직급'],
    rows: teams.map((team) => [
      divisionNameById.get(team.divisionId) ?? '',
      team.name,
      team.headName ?? '',
      team.headRank ?? '',
    ]),
  };
}

function buildExportMeta(input: Omit<PersonnelExportInput, 'format'>) {
  const table = buildPersonnelExportTable(input);
  const entityLabel = ENTITY_LABELS[input.entityType];
  const rowCount =
    input.entityType === 'executive' || input.entityType === 'employee'
      ? input.personRows.length
      : input.entityType === 'division'
        ? input.divisions.length
        : input.teams.length;
  const title = `인사 ${entityLabel} 검색 결과`;
  const summary = `검색 결과 ${rowCount}건 · ${buildFilterSummary(input.filters, input.divisionNameById)} · ${new Date().toLocaleString('ko-KR')}`;
  const filenameBase = `인사_${entityLabel}_검색결과_${todayStamp()}`;

  return { table, title, summary, filenameBase, rowCount };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadPersonnelExcel(table: ExportTable, filenameBase: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'S-NEXUS';
  const sheet = workbook.addWorksheet('검색결과');
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
    column.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(`${filenameBase}.xlsx`, new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}

function downloadPersonnelWord(title: string, summary: string, table: ExportTable, filenameBase: string) {
  downloadWordReport(`${filenameBase}.doc`, title, table, summary);
}

async function downloadPersonnelPdf(title: string, summary: string, table: ExportTable, filenameBase: string) {
  const { default: html2pdf } = await import('html2pdf.js');
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1100px';
  container.innerHTML = tableToWordHtml(title, table, summary);
  document.body.appendChild(container);

  try {
    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: `${filenameBase}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportPersonnelSearchResults(input: PersonnelExportInput): Promise<void> {
  const meta = buildExportMeta(input);
  if (meta.rowCount === 0) {
    throw new Error('내보낼 검색 결과가 없습니다.');
  }

  if (input.format === 'excel') {
    await downloadPersonnelExcel(meta.table, meta.filenameBase);
    return;
  }

  if (input.format === 'word') {
    downloadPersonnelWord(meta.title, meta.summary, meta.table, meta.filenameBase);
    return;
  }

  await downloadPersonnelPdf(meta.title, meta.summary, meta.table, meta.filenameBase);
}

export const PERSONNEL_EXPORT_FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'word', label: 'Word (.doc)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
] as const;
