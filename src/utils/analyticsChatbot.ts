import { formatCurrency } from '@/data/mockData';
import type { Project } from '@/types';
import type {
  AnalysisIntegratedContext,
  AnalyticsChatContext,
  ChatbotResponse,
} from '@/types/analyticsChat';
import { buildIntegratedMenuLocalResponse } from '@/utils/analysisMenuLocalSearch';
import { buildProjectInsightReport } from '@/utils/projectInsightReport';
import { parseProjectCode } from '@/utils/projectCode';
import {
  buildMenuHelpResponse,
} from '@/utils/analysisProjectLocalHandlers';

export type { AnalyticsChatContext, ChatbotResponse, ChatExportAction } from '@/types/analyticsChat';
export { isInsightReportQuery, isListOnlyQuery } from '@/utils/analysisProjectLocalHandlers';

function isOrderProject(project: Project): boolean {
  return (project.contractAmount ?? 0) > 0;
}

function formatAmount(value?: number): string {
  if (value == null || value <= 0) return '-';
  return `${formatCurrency(value)}원`;
}

/** @deprecated buildIntegratedMenuLocalResponse 사용 */
export function tryLocalAnalyticsQuery(
  query: string,
  ctx: AnalysisIntegratedContext,
): ChatbotResponse | null {
  return buildIntegratedMenuLocalResponse(query, ctx);
}

function unmatchedLocalQueryResponse(): ChatbotResponse {
  return {
    text: '연동된 메뉴(프로젝트·조직·입찰·외주·인력배분·전시사업비·대시보드) 데이터에서 이 질문에 맞는 **로컬 집계 결과**를 찾지 못했습니다. 질문을 더 구체적으로 적어 주세요.',
  };
}

export function askAnalyticsChatbot(query: string, ctx: AnalyticsChatContext): ChatbotResponse {
  const integratedCtx = ctx as AnalysisIntegratedContext;
  const local = buildIntegratedMenuLocalResponse(query, integratedCtx);
  if (local) return local;

  const normalized = query.trim();
  if (/수주|계약\s*금액|수주\s*현황/.test(normalized)) {
    return buildProjectInsightReport(integratedCtx);
  }

  if (
    /프로젝트\s*(전체|현황)|전체\s*프로젝트/.test(normalized) &&
    /등록|인사이트|보고서|분석/.test(normalized)
  ) {
    return buildProjectInsightReport(integratedCtx);
  }

  return unmatchedLocalQueryResponse();
}

export function getProjectStatsSummary(ctx: AnalyticsChatContext): string {
  const orderCount = ctx.projects.filter(isOrderProject).length;
  const totalAmount = ctx.projects.reduce((sum, p) => sum + (p.contractAmount ?? 0), 0);
  const categories = new Set(
    ctx.projects
      .map((p) => parseProjectCode(p.projectCode ?? '')?.businessCategory)
      .filter(Boolean),
  );
  return `프로젝트 ${ctx.projects.length}건 · 수주(계약) ${orderCount}건 · 계약합계 ${formatAmount(totalAmount)} · 사업분류 ${categories.size}종`;
}

export function buildAnalyticsHelpResponse(): ChatbotResponse {
  return buildMenuHelpResponse();
}
