import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import { tryLocalAnalyticsQuery } from '@/utils/analyticsChatbot';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { isOrganizationAnalysisQuery } from '@/utils/analysisQueryIntent';
import { buildOrgInsightReport } from '@/utils/orgInsightReport';

/** Claude 호출 전 로컬에서 필터·집계·표 생성 */
export function buildLocalAnalysisAggregate(
  query: string,
  ctx: AnalysisIntegratedContext,
): ChatbotResponse | null {
  const scopedProjects = filterProjectsByQuery(ctx.projects, query).projects;
  const scopedContext: AnalysisIntegratedContext = { ...ctx, projects: scopedProjects };

  if (isOrganizationAnalysisQuery(query)) {
    return buildOrgInsightReport(scopedContext);
  }

  return tryLocalAnalyticsQuery(query, scopedContext);
}
