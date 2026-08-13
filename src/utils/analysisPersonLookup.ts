import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import type { Project } from '@/types';
import { isOutsourcingAnalyticsQuery } from '@/utils/analysisOutsourcingPayload';
import {
  buildPersonnelRows,
  formatPersonnelGradeCell,
  formatPersonnelPermissionCell,
  formatPersonnelPositionCell,
  type PersonnelRow,
} from '@/utils/personnelSearch';
import type { ExportTable } from '@/utils/reportExport';

const PERSON_LOOKUP_PATTERN =
  /누구|누구야|누구니|누군지|정보\s*알|소속|연락|직급|직책|who\s*is|profile/i;

const PERSON_INTENT_PATTERN =
  /누구|누군|누구야|누구니|누군지|정보\s*알|소속|연락|직급|직책|who\s*is|profile/i;

const NAME_PARTICLE_SUFFIX = /(이|가|은|는|을|를|의|야|이야|님|씨|에)$/;

const PERSON_QUERY_NOISE =
  /\[분석 범위[^\]]+\]|\b누구(야|니|인지|세요)?\b|정보|알려|줘|주세요|에\s*대해|에\s*관해|어떤\s*사람|어떤\s*분|뭐\s*하는|무슨\s*일|궁금|해\s*줘|어떻게|되니|되나|되나요|개월|최근|단가|단가표|자재|보드|석고|경량|품목|규격|내역/g;

const NON_NAME_WORDS = new Set([
  '누구',
  '누군',
  '정보',
  '소속',
  '인사이트',
  '보고서',
  '분석',
  '현황',
  '요약',
  '프로젝트',
  '조직',
  '외주',
  '입찰',
  '데이터',
  '안내',
  '알려',
  '어떻게',
  '되니',
  '개월',
  '최근',
  '단가',
  '자재',
  '보드',
  '석고',
  '경량',
  '품목',
  '규격',
  '내역',
  '금액',
  '수주',
  '계약',
]);

function normalizeNameToken(token: string): string {
  return token.replace(NAME_PARTICLE_SUFFIX, '').trim();
}

function isPlausiblePersonName(word: string): boolean {
  return /^[가-힣]{2,3}$/.test(word) && !NON_NAME_WORDS.has(word);
}

export function extractPersonNameCandidates(query: string): string[] {
  const candidates = new Set<string>();
  const cleaned = query
    .replace(PERSON_QUERY_NOISE, ' ')
    .replace(/[?？!.。,]/g, ' ')
    .trim();

  for (const token of cleaned.split(/[\s·+/&]+/)) {
    const word = normalizeNameToken(token);
    if (isPlausiblePersonName(word)) {
      candidates.add(word);
    }
  }

  for (const match of query.matchAll(/([가-힣]{2,3})[이가은는을를](?:\s|[^\가-힣]|$)/g)) {
    const word = normalizeNameToken(match[1] ?? '');
    if (isPlausiblePersonName(word)) {
      candidates.add(word);
    }
  }

  return [...candidates];
}

export function isPersonLookupQuery(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) return false;
  if (isOutsourcingAnalyticsQuery(normalized)) return false;
  if (!PERSON_INTENT_PATTERN.test(normalized)) return false;
  if (PERSON_LOOKUP_PATTERN.test(normalized)) return true;
  return extractPersonNameCandidates(normalized).length > 0;
}

function rowMatchesName(row: PersonnelRow, names: string[]): boolean {
  return names.some(
    (name) =>
      row.name === name ||
      row.name.includes(name) ||
      name.includes(row.name) ||
      row.name.replace(/\s/g, '') === name.replace(/\s/g, ''),
  );
}

function resolvePersonnelKindLabel(kind: PersonnelRow['kind']): string {
  switch (kind) {
    case 'executive':
      return '경영진';
    case 'division_head':
      return '본부장(조직)';
    case 'team_head':
      return '팀장(조직)';
    default:
      return '직원';
  }
}

function findPersonnelMatches(ctx: AnalysisIntegratedContext, names: string[]): PersonnelRow[] {
  const rows = buildPersonnelRows(
    ctx.executiveOffice?.admins ?? [],
    ctx.employees,
    ctx.divisions,
    ctx.teams,
  );
  return rows.filter((row) => rowMatchesName(row, names));
}

function resolveEmployeeIds(matches: PersonnelRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of matches) {
    if (row.kind === 'employee' || row.kind === 'executive') {
      ids.add(row.id);
    }
  }
  return ids;
}

function findRelatedProjects(ctx: AnalysisIntegratedContext, matches: PersonnelRow[]): Project[] {
  const employeeIds = resolveEmployeeIds(matches);
  return ctx.projects.filter(
    (project) =>
      employeeIds.has(project.pmId) ||
      project.participantIds.some((id) => employeeIds.has(id)),
  );
}

function findAllocationProjectIds(ctx: AnalysisIntegratedContext, names: string[]): string[] {
  const projectIds = new Set<string>();
  for (const allocation of ctx.allocations) {
    for (const track of ['bid', 'design', 'production'] as const) {
      for (const entry of allocation[track]) {
        if (
          names.some(
            (name) =>
              entry.employeeName.includes(name) || name.includes(entry.employeeName),
          )
        ) {
          projectIds.add(allocation.projectId);
        }
      }
    }
  }
  return [...projectIds];
}

function buildPersonnelTable(matches: PersonnelRow[]): ExportTable {
  return {
    headers: ['구분', '이름', '직급', '급수', '지위', '권한', '본부', '팀'],
    rows: matches.map((row) => [
      resolvePersonnelKindLabel(row.kind),
      row.name,
      row.rank,
      formatPersonnelGradeCell(row),
      formatPersonnelPositionCell(row),
      formatPersonnelPermissionCell(row),
      row.divisionName,
      row.teamName,
    ]),
  };
}

/** 조직·프로젝트·배분 등 통합 인명 조회 */
export function buildPersonLookupResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!isPersonLookupQuery(query)) return null;

  const names = extractPersonNameCandidates(query);
  if (names.length === 0) {
    return {
      text: '조회할 **이름**을 함께 적어 주세요. 예: 「서석민이 누구야?」',
    };
  }

  const personnelMatches = findPersonnelMatches(ctx, names);
  const relatedProjects = findRelatedProjects(ctx, personnelMatches);
  const allocationProjectIds = findAllocationProjectIds(ctx, names);
  const allocationProjects = ctx.projects.filter((project) =>
    allocationProjectIds.includes(project.id),
  );

  const mergedProjects = new Map<string, Project>();
  for (const project of [...relatedProjects, ...allocationProjects]) {
    mergedProjects.set(project.id, project);
  }

  if (personnelMatches.length === 0 && mergedProjects.size === 0) {
    return {
      text: `「${names.join(', ')}」에 해당하는 정보를 **조직·인원·프로젝트·배분** 데이터에서 찾지 못했습니다.\n\n조직관리에 등록된 이름인지, 또는 프로젝트 PM/참여·팀 배분에 연결되어 있는지 확인해 주세요.`,
    };
  }

  const lines: string[] = [
    `**${names.join(', ')}** 관련 정보를 등록·동기화 데이터(조직·프로젝트·배분)에서 조회했습니다.`,
  ];

  let table: ExportTable | undefined;
  if (personnelMatches.length > 0) {
    lines.push('', `### 조직·인원 (${personnelMatches.length}명)`);
    for (const row of personnelMatches.slice(0, 5)) {
      lines.push(
        `- **${row.name}** · ${row.rank} · ${formatPersonnelGradeCell(row)} · ${row.divisionName} / ${row.teamName}`,
      );
    }
    if (personnelMatches.length > 5) {
      lines.push(`- 외 ${personnelMatches.length - 5}명 (표 참고)`);
    }
    table = buildPersonnelTable(personnelMatches);
  }

  if (mergedProjects.size > 0) {
    lines.push('', `### 프로젝트·배분 연관 (${mergedProjects.size}건)`);
    for (const project of [...mergedProjects.values()].slice(0, 8)) {
      lines.push(
        `- **${project.name}** · ${project.divisionName} · ${project.status}${project.projectCode ? ` · ${project.projectCode}` : ''}`,
      );
    }
    if (mergedProjects.size > 8) {
      lines.push(`- 외 ${mergedProjects.size - 8}건`);
    }
  }

  return {
    text: lines.join('\n'),
    table,
  };
}
