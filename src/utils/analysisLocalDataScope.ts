import type { AnalysisDomainKey, AnalysisClarificationStats } from '@/utils/analysisQueryClarification';
import {
  DOMAIN_LABELS,
  formatDomainScopeLine,
  ALL_LOCAL_DATA_DOMAINS,
} from '@/utils/analysisQueryDomainLabels';

export type { AnalysisDomainKey } from '@/utils/analysisQueryClarification';
export { DOMAIN_LABELS, ALL_LOCAL_DATA_DOMAINS } from '@/utils/analysisQueryDomainLabels';

export interface PendingLocalDataScope {
  originalQuery: string;
  proposedDomains: AnalysisDomainKey[];
}

export interface LocalDataScopeSelectionNeeded {
  needsSelection: true;
  originalQuery: string;
  proposedDomains: AnalysisDomainKey[];
  message: string;
}

export interface LocalDataScopeSelectionResolved {
  needsSelection: false;
  effectiveQuery: string;
  scopeDomain: AnalysisDomainKey;
}

export type LocalDataScopeEvaluation =
  | LocalDataScopeSelectionNeeded
  | LocalDataScopeSelectionResolved;

const LOCAL_DATA_SCOPE_PATTERN = /\[로컬 데이터 범위:\s*([^\]]+)\]/;

const DOMAIN_ALIASES: Record<AnalysisDomainKey, string[]> = {
  projects: ['프로젝트', '수주', 'project', 'pj'],
  organization: ['조직', '인원', '조직관리', 'org', '인명'],
  personnelResource: ['자원', '자원정보', '급수', '직급', '피라미드'],
  allocations: ['배분', '공모', '설계', '제작', '기여', '인력배분'],
  bidding: ['입찰', '구매', '입찰도우미', 'bid', '낙찰'],
  outsourcing: ['외주', '외주정보', '외주정보검색', '협력사', '단가'],
  exhibitionBusinessCost: ['전시', '전시비용', '전시사업', '유형별', '사업비'],
  dashboard: ['대시보드', 'kpi', '예산', '기여도', '리스크'],
};

function normalizeSelectionToken(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

export function extractLocalDataScopeDomain(query: string): AnalysisDomainKey | null {
  const match = query.match(LOCAL_DATA_SCOPE_PATTERN);
  if (!match?.[1]) return null;

  const label = match[1].trim();
  for (const [domain, domainLabel] of Object.entries(DOMAIN_LABELS) as [AnalysisDomainKey, string][]) {
    if (label === domainLabel || label.includes(domainLabel) || domainLabel.includes(label)) {
      return domain;
    }
  }
  return parseLocalDataScopeSelection(label, ALL_LOCAL_DATA_DOMAINS);
}

export function buildScopedLocalQuery(
  originalQuery: string,
  domain: AnalysisDomainKey,
): string {
  const stripped = originalQuery.replace(LOCAL_DATA_SCOPE_PATTERN, '').trim();
  return `${stripped}\n\n[로컬 데이터 범위: ${DOMAIN_LABELS[domain]}]`;
}

export function parseLocalDataScopeSelection(
  userResponse: string,
  proposedDomains: AnalysisDomainKey[],
): AnalysisDomainKey | null {
  const trimmed = userResponse.trim();
  if (!trimmed) return null;

  const numbered = trimmed.match(/^(\d+)\s*[.):\-]?/);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (index >= 0 && index < proposedDomains.length) {
      return proposedDomains[index] ?? null;
    }
  }

  const normalized = normalizeSelectionToken(trimmed);
  for (const domain of proposedDomains) {
    const label = normalizeSelectionToken(DOMAIN_LABELS[domain]);
    if (normalized === label || normalized.includes(label) || label.includes(normalized)) {
      return domain;
    }
    for (const alias of DOMAIN_ALIASES[domain]) {
      const aliasNorm = normalizeSelectionToken(alias);
      if (normalized === aliasNorm || normalized.includes(aliasNorm)) {
        return domain;
      }
    }
  }

  return null;
}

export function buildLocalDataScopeSelectionMessage(
  originalQuery: string,
  proposedDomains: AnalysisDomainKey[],
  stats: AnalysisClarificationStats,
): string {
  const lines = proposedDomains.map((domain, index) =>
    `${index + 1}. ${formatDomainScopeLine(domain, stats)}`,
  );

  return `【로컬 데이터 범위 선택】

"${originalQuery}"에 **로컬로 답변**하기 전에, 근거가 될 **메뉴 데이터**를 선택해 주세요.

${lines.join('\n')}

**번호(1~${proposedDomains.length})** 또는 **데이터 이름**으로 답해 주세요.
예: 「3」 · 「외주정보검색」 · 「조직·인원」`;
}

export function inferSuggestedPromptScopeDomain(prompt: string): AnalysisDomainKey | null {
  const trimmed = prompt.trim();
  if (/조직|인원|자원정보/.test(trimmed) && !/프로젝트|외주|입찰/.test(trimmed)) {
    return 'organization';
  }
  if (/프로젝트|수주/.test(trimmed) && !/외주|입찰|종합/.test(trimmed)) {
    return 'projects';
  }
  if (/외주/.test(trimmed) && !/입찰.*외주|외주.*입찰|종합/.test(trimmed)) {
    return 'outsourcing';
  }
  if (/입찰|구매/.test(trimmed) && !/외주|프로젝트|종합/.test(trimmed)) {
    return 'bidding';
  }
  if (/배분|기여/.test(trimmed)) return 'allocations';
  if (/전시\s*비용|유형별\s*사업비/.test(trimmed)) return 'exhibitionBusinessCost';
  if (/대시보드|예산|리스크/.test(trimmed)) return 'dashboard';
  return null;
}

export function evaluateLocalDataScopeSelection(
  query: string,
  options: {
    pending: PendingLocalDataScope | null;
    stats: AnalysisClarificationStats;
    skipSelection?: boolean;
    suggestedScopeDomain?: AnalysisDomainKey | null;
  },
): LocalDataScopeEvaluation {
  const trimmed = query.trim();

  const scopeFromQuery = extractLocalDataScopeDomain(trimmed);
  if (scopeFromQuery) {
    return {
      needsSelection: false,
      effectiveQuery: trimmed,
      scopeDomain: scopeFromQuery,
    };
  }

  if (options.pending) {
    const selected = parseLocalDataScopeSelection(trimmed, options.pending.proposedDomains);
    if (!selected) {
      const looksLikeNewQuestion =
        trimmed.length > 8 && !/^\d+\s*[.):\-]?$/.test(trimmed) && !/^[\d,\s]+$/.test(trimmed);
      if (looksLikeNewQuestion) {
        return evaluateLocalDataScopeSelection(trimmed, {
          ...options,
          pending: null,
        });
      }

      return {
        needsSelection: true,
        originalQuery: options.pending.originalQuery,
        proposedDomains: options.pending.proposedDomains,
        message: `선택을 이해하지 못했습니다. 아래 번호 또는 데이터 이름 중 하나로 다시 답해 주세요.

${buildLocalDataScopeSelectionMessage(
  options.pending.originalQuery,
  options.pending.proposedDomains,
  options.stats,
)}`,
      };
    }

    return {
      needsSelection: false,
      effectiveQuery: buildScopedLocalQuery(options.pending.originalQuery, selected),
      scopeDomain: selected,
    };
  }

  if (options.skipSelection && options.suggestedScopeDomain) {
    return {
      needsSelection: false,
      effectiveQuery: buildScopedLocalQuery(trimmed, options.suggestedScopeDomain),
      scopeDomain: options.suggestedScopeDomain,
    };
  }

  const proposedDomains = [...ALL_LOCAL_DATA_DOMAINS];
  return {
    needsSelection: true,
    originalQuery: trimmed,
    proposedDomains,
    message: buildLocalDataScopeSelectionMessage(trimmed, proposedDomains, options.stats),
  };
}
