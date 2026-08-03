import type { BudgetStatus, Division, Employee, ExecutiveOffice, Project, Team } from '@/types';
import type { AnalyticsChatContext } from '@/types/analyticsChat';
import type { HistoryEvent } from '@/types/history';
import { buildDivisionSummary, filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { detectAnalysisQueryIntent, type AnalysisQueryIntent } from '@/utils/analysisQueryIntent';
import { getAmendmentsForProject } from '@/utils/contractChange';

export interface AnalysisDataPayloadMeta {
  roleLabel: string;
  scopeLabel: string;
  budget: BudgetStatus;
}

const PROJECT_COLUMNS = [
  'name',
  'code',
  'client',
  'type',
  'market',
  'division',
  'team',
  'status',
  'amount',
  'start',
  'end',
] as const;

const ORG_HISTORY_ENTITY_TYPES = new Set([
  'division',
  'team',
  'employee',
  'executive_admin',
  'division_head',
  'team_head',
]);

function compactProjectRow(project: Project, amendmentCount: number): (string | number)[] {
  return [
    project.name,
    project.projectCode ?? '',
    project.clientName ?? '',
    project.projectType ?? '',
    project.marketScope ?? '',
    project.divisionName,
    project.teamName,
    project.status,
    project.contractAmount ?? 0,
    project.startDate,
    project.endDate ?? '',
    amendmentCount,
  ];
}

const MAX_PROJECT_ROWS = 50;

function buildOrganizationPayload(
  divisions: Division[],
  teams: Team[],
  employees: Employee[],
  executiveOffice: ExecutiveOffice,
  historyEvents: HistoryEvent[],
) {
  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));

  const employeesByDivision = new Map<string, number>();
  const employeesByTeam = new Map<string, number>();
  for (const employee of employees) {
    employeesByDivision.set(
      employee.divisionId,
      (employeesByDivision.get(employee.divisionId) ?? 0) + 1,
    );
    employeesByTeam.set(employee.teamId, (employeesByTeam.get(employee.teamId) ?? 0) + 1);
  }

  return {
    executiveColumns: ['name', 'rank', 'accessRole'],
    executives: (executiveOffice.admins ?? []).map((admin) => [
      admin.name,
      admin.rank,
      admin.accessRole ?? '경영진',
    ]),
    divisionColumns: ['name', 'headName', 'headRank', 'teamCount', 'employeeCount'],
    divisions: divisions.map((division) => ({
      name: division.name,
      headName: division.headName ?? '',
      headRank: division.headRank ?? '',
      teamCount: teams.filter((team) => team.divisionId === division.id).length,
      employeeCount: employeesByDivision.get(division.id) ?? 0,
    })),
    teamColumns: ['division', 'name', 'headName', 'headRank', 'employeeCount'],
    teams: teams.map((team) => ({
      division: divisionNameById.get(team.divisionId) ?? '-',
      name: team.name,
      headName: team.headName ?? '',
      headRank: team.headRank ?? '',
      employeeCount: employeesByTeam.get(team.id) ?? 0,
    })),
    employeeColumns: ['name', 'division', 'team', 'role', 'accessRole'],
    employees: employees.map((employee) => [
      employee.name,
      employee.divisionName,
      employee.teamName,
      employee.role,
      employee.accessRole ?? '',
    ]),
    orgHistoryColumns: ['date', 'action', 'entityType', 'name', 'summary'],
    recentOrgHistory: historyEvents
      .filter(
        (event) =>
          (event.category === 'organization' || event.category === 'executive') &&
          ORG_HISTORY_ENTITY_TYPES.has(event.entityType),
      )
      .slice(-40)
      .map((event) => [
        event.occurredAt.slice(0, 10),
        event.action,
        event.entityType,
        event.entityName ?? '-',
        event.summary,
      ]),
  };
}

/** Claude에 보낼 경량 데이터 (토큰·한도 절약) */
export function buildAnalysisDataPayload(
  ctx: AnalyticsChatContext,
  meta: AnalysisDataPayloadMeta,
  teams: Team[],
  query?: string,
) {
  const queryIntent = detectAnalysisQueryIntent(query);
  const { projects: scopedProjects, scopeNote } = filterProjectsByQuery(ctx.projects, query);

  const includeFullProjects = queryIntent !== 'organization';
  const projectRows = includeFullProjects
    ? scopedProjects.slice(0, MAX_PROJECT_ROWS).map((project) => {
        const amendments = getAmendmentsForProject(ctx.contractAmendments, project.id);
        return compactProjectRow(project, amendments.length);
      })
    : [];

  const projectsTruncated = includeFullProjects && scopedProjects.length > MAX_PROJECT_ROWS;

  const organization = buildOrganizationPayload(
    ctx.divisions,
    teams,
    ctx.employees,
    ctx.executiveOffice ?? { admins: [] },
    ctx.historyEvents,
  );

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    queryIntent,
    userQuery: query?.trim() ?? '',
    viewer: { role: meta.roleLabel, scope: meta.scopeLabel },
    dataScope: scopeNote,
    counts: {
      projectsTotal: ctx.projects.length,
      projectsInScope: scopedProjects.length,
      divisions: ctx.divisions.length,
      teams: teams.length,
      employees: ctx.employees.length,
      executives: ctx.executiveOffice?.admins?.length ?? 0,
      contractAmendments: ctx.contractAmendments.length,
      historyEvents: ctx.historyEvents.length,
    },
    organization,
    ...(queryIntent === 'organization'
      ? {}
      : {
          divisionSummary: buildDivisionSummary(ctx.projects),
          budget: {
            contractAmount: meta.budget.contractAmount,
            cumulativeBilling: meta.budget.cumulativeBilling,
            executionBudget: meta.budget.executionBudget,
            spentBudget: meta.budget.spentBudget,
            billingRate: meta.budget.billingRate,
            budgetBurnRate: meta.budget.budgetBurnRate,
          },
        }),
    projectColumns: [...PROJECT_COLUMNS, 'amendments'],
    projects: projectRows,
    projectsTruncated,
    rules: {
      order: 'amount>=1 이면 수주',
      phase: 'status 또는 code 마지막2자리 첫째(1공모2설계3제작)',
    },
  };
}

function buildIntentGuidance(intent: AnalysisQueryIntent, userQuery: string): string {
  if (intent === 'organization') {
    return `질문 의도: **조직·인원 분석** (queryIntent=organization).
사용자 질문: "${userQuery}"
반드시 organization(경영진·사업본부·팀·팀원·조직 변경 이력) 데이터만 중심으로 답하세요.
프로젝트/수주/계약 인사이트 보고서를 작성하지 마세요. 「등록 프로젝트 인사이트 보고서」 형식 금지.
출력: 【조직·인원 인사이트】 제목 → 핵심 요약 → 본부·팀·인원 현황 → 공석/이슈 → 최근 조직 변경 → 권고.`;
  }

  if (intent === 'project') {
    return `질문 의도: **프로젝트·수주 분석** (queryIntent=project).
projects 데이터를 중심으로 답하세요.`;
  }

  return `질문 의도: **복합 분석** (queryIntent=mixed).
organization과 projects를 모두 참고하되, 사용자 질문에 더 가까운 영역을 우선하세요.`;
}

export function buildSystemInstruction(payload: ReturnType<typeof buildAnalysisDataPayload>): string {
  const intentGuide = buildIntentGuidance(
    payload.queryIntent as AnalysisQueryIntent,
    payload.userQuery,
  );

  return `S-NEXUS 데이터 분석 AI. 한국어. 제공 JSON만 사용, 수치 창작 금지.

${intentGuide}

질문 범위(dataScope)에 맞춰 분석. projects는 projectColumns 순서의 행 배열.
organization에는 경영진·사업본부·팀·팀원·조직 변경 이력이 포함됩니다.
대화 맥락 반영해 보고서 수정·심화. 출력: 핵심요약 bullet → 섹션별 분석 → 마크다운 표 → 권고.

DATA:
${JSON.stringify(payload)}`;
}

export type AnalysisDataPayload = ReturnType<typeof buildAnalysisDataPayload>;

export function estimatePayloadChars(payload: AnalysisDataPayload): number {
  return JSON.stringify(payload).length;
}

export function summarizePayloadScope(payload: AnalysisDataPayload): string {
  const chars = estimatePayloadChars(payload);
  const kb = (chars / 1024).toFixed(1);
  const intentLabel =
    payload.queryIntent === 'organization'
      ? '조직·인원'
      : payload.queryIntent === 'project'
        ? '프로젝트'
        : '복합';
  return `${intentLabel} · ${payload.dataScope} · 약 ${kb}KB`;
}
