import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import type { AnalysisDomainKey } from '@/utils/analysisQueryClarification';
import { extractLocalDataScopeDomain } from '@/utils/analysisLocalDataScope';
import { buildIntegratedMenuLocalResponse } from '@/utils/analysisMenuLocalSearch';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';

/** Claude 호출 전 로컬에서 필터·집계·표 생성 */
export function buildLocalAnalysisAggregate(
  query: string,
  ctx: AnalysisIntegratedContext,
  scopeDomain?: AnalysisDomainKey,
): ChatbotResponse | null {
  const scopedProjects = filterProjectsByQuery(ctx.projects, query).projects;
  const scopedContext: AnalysisIntegratedContext = { ...ctx, projects: scopedProjects };
  const resolvedScope = scopeDomain ?? extractLocalDataScopeDomain(query) ?? undefined;

  return buildIntegratedMenuLocalResponse(query, scopedContext, {
    scopeDomain: resolvedScope,
  });
}
