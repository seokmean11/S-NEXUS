import type { BudgetStatus, Team } from '@/types';
import type { AnalyticsChatContext } from '@/types/analyticsChat';
import { getAmendmentsForProject } from '@/utils/contractChange';
import { parseProjectCode } from '@/utils/projectCode';

export interface AnalysisDataPayloadMeta {
  roleLabel: string;
  scopeLabel: string;
  budget: BudgetStatus;
}

/** Gemini에 보낼 경량 데이터 (토큰·한도 절약) */
export function buildAnalysisDataPayload(
  ctx: AnalyticsChatContext,
  meta: AnalysisDataPayloadMeta,
  teams: Team[],
) {
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    viewer: { role: meta.roleLabel, scope: meta.scopeLabel },
    counts: {
      projects: ctx.projects.length,
      divisions: ctx.divisions.length,
      teams: teams.length,
      employees: ctx.employees.length,
      contractAmendments: ctx.contractAmendments.length,
      historyEvents: ctx.historyEvents.length,
    },
    budget: {
      contractAmount: meta.budget.contractAmount,
      cumulativeBilling: meta.budget.cumulativeBilling,
      executionBudget: meta.budget.executionBudget,
      spentBudget: meta.budget.spentBudget,
      billingRate: meta.budget.billingRate,
      budgetBurnRate: meta.budget.budgetBurnRate,
    },
    divisions: ctx.divisions.map((d) => d.name),
    projects: ctx.projects.map((project) => {
      const parsed = parseProjectCode(project.projectCode ?? '');
      const amendments = getAmendmentsForProject(ctx.contractAmendments, project.id);
      return {
        name: project.name,
        code: project.projectCode,
        client: project.clientName,
        type: project.projectType,
        market: project.marketScope,
        continuity: project.continuity,
        division: project.divisionName,
        team: project.teamName,
        status: project.status,
        amount: project.contractAmount,
        start: project.startDate,
        end: project.endDate,
        phase: parsed?.phase,
        category: parsed?.businessCategory,
        amendments: amendments.map((a) => ({
          seq: a.sequence,
          amount: a.contractAmount,
          start: a.startDate,
          end: a.endDate,
        })),
      };
    }),
    rules: {
      order: 'contractAmount>=1 이면 수주',
      phase: 'status 또는 code 마지막2자리 첫째(1공모2설계3제작)',
      period: 'startDate 우선, 없으면 createdAt',
    },
  };
}

export function buildSystemInstruction(payload: ReturnType<typeof buildAnalysisDataPayload>): string {
  return `성과·기여도 대시보드 데이터 분석 AI. 한국어. 제공 JSON만 사용, 수치 창작 금지.
대화 맥락 반영해 보고서 수정·심화. 출력: 핵심요약 bullet → 섹션별 분석 → 마크다운 표 → 권고.

DATA:
${JSON.stringify(payload)}`;
}

export type AnalysisDataPayload = ReturnType<typeof buildAnalysisDataPayload>;
