import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import {
  buildAllocationLocalResponse,
  buildBidLocalResponse,
  buildCrossDomainMenuSearchResponse,
  buildDashboardLocalResponse,
  buildExhibitionLocalResponse,
  buildPersonnelResourceLocalResponse,
} from '@/utils/analysisDomainLocalHandlers';
import { DOMAIN_LABELS } from '@/utils/analysisQueryDomainLabels';
import type { AnalysisDomainKey } from '@/utils/analysisQueryClarification';
import { buildPersonLookupResponse, isPersonLookupQuery } from '@/utils/analysisPersonLookup';
import {
  isOutsourcingAnalyticsQuery,
  resolveOutsourcingLocalResponse,
} from '@/utils/analysisOutsourcingPayload';
import { buildMenuHelpResponse, tryProjectLocalAnalyticsQuery } from '@/utils/analysisProjectLocalHandlers';
import { detectAnalysisDomainHints, isOrganizationAnalysisQuery } from '@/utils/analysisQueryIntent';
import { buildOrgInsightReport } from '@/utils/orgInsightReport';
const DOMAIN_PRIORITY: AnalysisDomainKey[] = [
  'outsourcing',
  'bidding',
  'projects',
  'organization',
  'personnelResource',
  'allocations',
  'exhibitionBusinessCost',
  'dashboard',
];

const HINT_TO_DOMAIN: Partial<Record<string, AnalysisDomainKey>> = {
  outsourcing: 'outsourcing',
  bidding: 'bidding',
  projects: 'projects',
  organization: 'organization',
  personnelResource: 'personnelResource',
  allocations: 'allocations',
  exhibitionBusinessCost: 'exhibitionBusinessCost',
  dashboard: 'dashboard',
};

function isBroadMenuDataQuery(query: string): boolean {
  return /알려|조회|검색|찾|몇|얼마|현황|목록|리스트|단가|금액|건수|누가|어디|무엇|뭐|정리|요약/i.test(
    query,
  );
}

/** 질문에 맞는 메뉴 도메인 검색 순서 */
export function resolveMenuLocalSearchDomains(query: string): AnalysisDomainKey[] {
  const hints = detectAnalysisDomainHints(query);
  const domains = new Set<AnalysisDomainKey>();

  for (const hint of hints) {
    const mapped = HINT_TO_DOMAIN[hint];
    if (mapped) domains.add(mapped);
  }

  if (domains.size > 0) {
    return DOMAIN_PRIORITY.filter((domain) => domains.has(domain));
  }

  if (isBroadMenuDataQuery(query)) {
    return [...DOMAIN_PRIORITY];
  }

  return ['projects', 'organization', 'outsourcing', 'bidding'];
}

function runMenuDomainHandler(
  domain: AnalysisDomainKey,
  query: string,
  ctx: AnalysisIntegratedContext,
): ChatbotResponse | null {
  switch (domain) {
    case 'outsourcing':
      if (!isOutsourcingAnalyticsQuery(query)) return null;
      return resolveOutsourcingLocalResponse(ctx, query);
    case 'bidding':
      return buildBidLocalResponse(ctx, query);
    case 'projects':
      return tryProjectLocalAnalyticsQuery(query, ctx);
    case 'organization':
      if (!isOrganizationAnalysisQuery(query)) return null;
      return buildOrgInsightReport(ctx);
    case 'personnelResource':
      return buildPersonnelResourceLocalResponse(ctx, query);
    case 'allocations':
      return buildAllocationLocalResponse(ctx, query);
    case 'exhibitionBusinessCost':
      return buildExhibitionLocalResponse(ctx, query);
    case 'dashboard':
      return buildDashboardLocalResponse(ctx, query);
    default:
      return null;
  }
}

/** 조직·구매·외주 등 연동 메뉴에서 로컬 집계 (범위 지정 시 해당 메뉴만) */
export function buildIntegratedMenuLocalResponse(
  query: string,
  ctx: AnalysisIntegratedContext,
  options?: { scopeDomain?: AnalysisDomainKey },
): ChatbotResponse | null {
  const normalized = query.trim();
  if (!normalized) return buildMenuHelpResponse();

  if (/안녕|도움|help|뭐\s*할\s*수/.test(normalized)) {
    return buildMenuHelpResponse();
  }

  const scopeDomain = options?.scopeDomain;
  if (scopeDomain) {
    if (scopeDomain === 'organization' && isPersonLookupQuery(normalized)) {
      const personLookup = buildPersonLookupResponse(ctx, normalized);
      if (personLookup) return personLookup;
    }

    const scopedResponse = runMenuDomainHandler(scopeDomain, normalized, ctx);
    if (scopedResponse) return scopedResponse;

    return {
      text: `선택하신 **${DOMAIN_LABELS[scopeDomain]}** 데이터에서 이 질문에 맞는 결과를 찾지 못했습니다.\n\n키워드·기간·조건을 조정하거나, 다른 데이터 범위를 선택해 다시 질문해 주세요.`,
    };
  }

  if (isPersonLookupQuery(normalized)) {
    const personLookup = buildPersonLookupResponse(ctx, normalized);
    if (personLookup) return personLookup;
  }

  const domains = resolveMenuLocalSearchDomains(normalized);
  for (const domain of domains) {
    const response = runMenuDomainHandler(domain, normalized, ctx);
    if (response) return response;
  }

  return buildCrossDomainMenuSearchResponse(ctx, normalized);
}