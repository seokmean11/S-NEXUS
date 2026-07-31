import type { BudgetStatus, Project, Team } from '@/types';

import type { AnalyticsChatContext } from '@/types/analyticsChat';

import { buildDivisionSummary, filterProjectsByQuery } from '@/utils/analysisQueryFilter';

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



/** Gemini에 보낼 경량 데이터 (토큰·한도 절약) */

export function buildAnalysisDataPayload(

  ctx: AnalyticsChatContext,

  meta: AnalysisDataPayloadMeta,

  teams: Team[],

  query?: string,

) {

  const { projects: scopedProjects, scopeNote } = filterProjectsByQuery(ctx.projects, query);



  const projectRows = scopedProjects.map((project) => {

    const amendments = getAmendmentsForProject(ctx.contractAmendments, project.id);

    return compactProjectRow(project, amendments.length);

  });



  return {

    generatedAt: new Date().toISOString().slice(0, 10),

    viewer: { role: meta.roleLabel, scope: meta.scopeLabel },

    dataScope: scopeNote,

    counts: {

      projectsTotal: ctx.projects.length,

      projectsInScope: scopedProjects.length,

      divisions: ctx.divisions.length,

      teams: teams.length,

      employees: ctx.employees.length,

      contractAmendments: ctx.contractAmendments.length,

      historyEvents: ctx.historyEvents.length,

    },

    divisionSummary: buildDivisionSummary(ctx.projects),

    budget: {

      contractAmount: meta.budget.contractAmount,

      cumulativeBilling: meta.budget.cumulativeBilling,

      executionBudget: meta.budget.executionBudget,

      spentBudget: meta.budget.spentBudget,

      billingRate: meta.budget.billingRate,

      budgetBurnRate: meta.budget.budgetBurnRate,

    },

    projectColumns: [...PROJECT_COLUMNS, 'amendments'],

    projects: projectRows,

    rules: {

      order: 'amount>=1 이면 수주',

      phase: 'status 또는 code 마지막2자리 첫째(1공모2설계3제작)',

    },

  };

}



export function buildSystemInstruction(payload: ReturnType<typeof buildAnalysisDataPayload>): string {

  return `성과·기여도 대시보드 데이터 분석 AI. 한국어. 제공 JSON만 사용, 수치 창작 금지.

질문 범위(dataScope)에 맞춰 분석. projects는 projectColumns 순서의 행 배열.

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
  return `${payload.dataScope} · 약 ${kb}KB`;
}

