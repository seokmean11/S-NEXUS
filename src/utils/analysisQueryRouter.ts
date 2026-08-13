import {
  isExplicitAnalysisRequest,
  isOrganizationAnalysisQuery,
  detectAnalysisDomainHints,
} from '@/utils/analysisQueryIntent';
import { isInsightReportQuery, isListOnlyQuery } from '@/utils/analysisProjectLocalHandlers';
import { isPersonLookupQuery } from '@/utils/analysisPersonLookup';
import { OUTSOURCING_ANALYTICS_QUERY_PATTERN } from '@/utils/analysisOutsourcingPayload';

export type AnalysisQueryRoute = 'local' | 'interpret';

const INTERPRETATION_PATTERN =
  /인사이트|해석|왜|원인|권고|제안|평가|의견|진단|리스크|시사점|함의|overview|insight|종합\s*(분석|현황)|심층\s*분석/i;

const MULTI_TURN_REFINE_PATTERN =
  /수정|바꿔|다시|추가|더\s*자세|짧게|표\s*만|요약\s*만|위\s*내용|앞\s*답|이어서|보완/i;

const OUTSOURCING_QUERY_PATTERN = OUTSOURCING_ANALYTICS_QUERY_PATTERN;

function isDeterministicLocalQuery(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) return false;

  if (isPersonLookupQuery(normalized)) return true;
  if (isOrganizationAnalysisQuery(normalized)) return true;
  if (/계약\s*변경|변경\s*\d+\s*차|amendment/i.test(normalized)) return true;
  if (/추이|트렌드|연도별|년\s*간|년간/.test(normalized) && /수주|계약|매출/.test(normalized)) {
    return true;
  }
  if (/수주|계약\s*금액|수주\s*현황/.test(normalized) && isListOnlyQuery(normalized)) return true;
  if (
    /프로젝트\s*(전체|현황|목록|리스트)|전체\s*프로젝트/.test(normalized) &&
    isListOnlyQuery(normalized)
  ) {
    return true;
  }
  if (OUTSOURCING_QUERY_PATTERN.test(normalized) && !INTERPRETATION_PATTERN.test(normalized)) {
    return true;
  }
  if (/입찰|낙찰|구매|입찰도우미|bid|tender|전자입찰/i.test(normalized)) return true;
  if (/전시\s*비용|전시사업\s*비용|유형별\s*사업비/i.test(normalized)) return true;
  if (/자원정보|자원\s*현황|급수|직급|피라미드|본부별\s*인원/i.test(normalized)) return true;
  if (/배분|공모|설계|제작|기여|팀\s*배분/i.test(normalized)) return true;
  if (/대시보드|기여도|리스크\s*시나리오|예산\s*현황|kpi/i.test(normalized)) return true;
  if (isInsightReportQuery(normalized)) return true;
  if (/안녕|도움|help|뭐\s*할\s*수/.test(normalized)) return true;

  return false;
}

function needsInterpretationLayer(query: string, hasMultiTurnContext: boolean): boolean {
  const normalized = query.trim();
  if (!normalized) return false;

  if (hasMultiTurnContext && MULTI_TURN_REFINE_PATTERN.test(normalized)) return true;
  if (isExplicitAnalysisRequest(normalized)) return true;
  if (INTERPRETATION_PATTERN.test(normalized)) return true;

  const hints = detectAnalysisDomainHints(normalized);
  if (hints.length >= 3) return true;

  return false;
}

/** 로컬 집계만으로 충분한지 vs 로컬 집계 + Claude 해석이 필요한지 */
export function resolveAnalysisQueryRoute(
  query: string,
  options?: { hasMultiTurnContext?: boolean },
): AnalysisQueryRoute {
  const normalized = query.trim();
  const hasMultiTurnContext = Boolean(options?.hasMultiTurnContext);

  if (isDeterministicLocalQuery(normalized) && !needsInterpretationLayer(normalized, hasMultiTurnContext)) {
    return 'local';
  }

  return 'interpret';
}

export function getAnalysisRouteLabel(route: AnalysisQueryRoute): string {
  return route === 'local' ? '로컬 조회' : '로컬 집계 · AI 해석';
}
