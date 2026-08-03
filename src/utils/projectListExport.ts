import type { Project } from '@/types';
import type { ExportTable } from '@/utils/reportExport';
import { downloadCsv } from '@/utils/reportExport';
import { formatIsoToKoreanDate } from '@/utils/formatInput';
import { sortProjectsByName } from '@/utils/projectListFilter';

function formatExportAmount(value?: number): string {
  if (value == null || value <= 0) return '';
  return String(value);
}

export function buildProjectListExportTable(projects: Project[]): ExportTable {
  return {
    headers: [
      '프로젝트명',
      '프로젝트코드',
      '발주처',
      '사업본부',
      '팀',
      '상태',
      '사업유형',
      '국내/해외',
      '신규/계약고',
      '계약금액',
      '시작일',
      '종료일',
      '등록일',
      '수정일',
    ],
    rows: sortProjectsByName(projects).map((project) => [
      project.name,
      project.projectCode ?? '',
      project.clientName ?? '',
      project.divisionName,
      project.teamName,
      project.status,
      project.projectType ?? '',
      project.marketScope ?? '',
      project.continuity ?? '',
      formatExportAmount(project.contractAmount),
      formatIsoToKoreanDate(project.startDate),
      project.endDate ? formatIsoToKoreanDate(project.endDate) : '',
      formatIsoToKoreanDate(project.createdAt),
      formatIsoToKoreanDate(project.updatedAt),
    ]),
  };
}

/** Excel에서 바로 열 수 있는 UTF-8 CSV 다운로드 */
export function downloadProjectListExcel(projects: Project[], filenamePrefix = '프로젝트_목록'): void {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadCsv(`${filenamePrefix}_${today}.csv`, buildProjectListExportTable(projects));
}
