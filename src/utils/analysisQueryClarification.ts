import {
  detectAnalysisDomainHints,
  isCasualConversationQuery,
} from '@/utils/analysisQueryIntent';

export type AnalysisDomainKey =
  | 'projects'
  | 'organization'
  | 'personnelResource'
  | 'allocations'
  | 'bidding'
  | 'outsourcing'
  | 'exhibitionBusinessCost'
  | 'dashboard';

export interface AnalysisClarificationStats {
  projectCount: number;
  divisionCount: number;
  employeeCount: number;
  bidCount: number;
  outsourcingRecordCount: number;
  scopeLabel: string;
}

export interface PendingAnalysisClarification {
  originalQuery: string;
  proposedDomains: AnalysisDomainKey[];
}

export interface AnalysisClarificationNeeded {
  needsClarification: true;
  message: string;
  proposedDomains: AnalysisDomainKey[];
  originalQuery: string;
}

export interface AnalysisClarificationResolved {
  needsClarification: false;
  effectiveQuery: string;
}

export type AnalysisClarificationEvaluation =
  | AnalysisClarificationNeeded
  | AnalysisClarificationResolved;

const DOMAIN_LABELS: Record<AnalysisDomainKey, string> = {
  projects: '프로젝트·수주',
  organization: '조직·인원',
  personnelResource: '자원정보현황(직급·본부 구성)',
  allocations: '공모·설계·제작·팀 배분',
  bidding: '입찰·구매(입찰도우미)',
  outsourcing: '외주정보검색',
  exhibitionBusinessCost: '전시사업 비용',
  dashboard: '대시보드 KPI(예산·기여도·리스크 시나리오)',
};

const GENERIC_ANALYSIS_PATTERN =
  /분석|인사이트|보고서|현황|요약|정리|리스크|overview|summary|종합|전체|알려|설명|어때|어떻|해줘|해주|부탁/i;

const CONFIRM_PATTERN =
  /^(네|넵|응|예|ㅇㅇ|좋아|좋습니다|진행|그렇게|맞아|맞습니다|ok|okay|yes|분석해|해줘|해주세요|부탁|그래|좋아요)[!.?\s]*$/i;

const EXPLICIT_COMBINATION_PATTERN = /[·•]|(?:\s*(?:및|와|과|\+|\&)\s*)|(?:데이터를?\s*종합)/i;

const FOLLOW_UP_REFINEMENT_PATTERN =
  /만\b|으로|다시|좁|추가|제외|변경|수정|바꿔|빼|넣|표|엑셀|csv|word|워드|상위|하위|기준/i;

const HINT_TO_DOMAIN: Record<string, AnalysisDomainKey> = {
  projects: 'projects',
  organization: 'organization',
  personnelResource: 'personnelResource',
  bidding: 'bidding',
  outsourcing: 'outsourcing',
  exhibitionBusinessCost: 'exhibitionBusinessCost',
};

function hasSpecificAnalysisScope(query: string): boolean {
  return (
    /본부|사업부|사업실|팀\b|상반기|하반기|올해|분기|월|인테리어|전시|뉴미디어|해외|셀프스토리지|경영기획|금액|상위|하위|구간|낙찰|업체|직급|급수|배분|계약변경|기여도|예산|수주|금속|공종|탑\s*\d|top\s*\d/i.test(
      query,
    ) || /\d{4}/.test(query)
  );
}

function isVeryVagueQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length <= 10 && GENERIC_ANALYSIS_PATTERN.test(trimmed)) return true;
  if (/^(분석|현황|요약|정리|보고서|인사이트)(\s*해)?(줘|주세요?)?[.?!]*$/i.test(trimmed)) {
    return true;
  }
  if (/^(종합|전체)\s*(분석|현황|요약|정리)/i.test(trimmed)) return true;
  return false;
}

function isExplicitMultiDomainRequest(query: string, hintCount: number): boolean {
  return hintCount >= 2 && EXPLICIT_COMBINATION_PATTERN.test(query);
}

function isAnalysisFollowUpRefinement(
  query: string,
  turns: { role: 'user' | 'assistant'; text: string }[],
): boolean {
  const assistantTurns = turns.filter((turn) => turn.role === 'assistant');
  const hasCompletedAnalysis = assistantTurns.some(
    (turn) =>
      turn.text.length > 180 &&
      !turn.text.includes('【분석 범위 확인】') &&
      !turn.text.includes('Claude API 키'),
  );

  if (!hasCompletedAnalysis) return false;
  return FOLLOW_UP_REFINEMENT_PATTERN.test(query) || query.trim().length <= 24;
}

function isConfirmationResponse(query: string): boolean {
  return CONFIRM_PATTERN.test(query.trim());
}

function mapHintsToDomains(hints: string[]): AnalysisDomainKey[] {
  const domains = hints
    .map((hint) => HINT_TO_DOMAIN[hint])
    .filter((domain): domain is AnalysisDomainKey => Boolean(domain));

  return [...new Set(domains)];
}

export function proposeAnalysisDomains(query: string): AnalysisDomainKey[] {
  const hints = detectAnalysisDomainHints(query);
  const domains = mapHintsToDomains(hints);

  if (domains.length > 0) return domains;
  if (/금속|공종|규격|협력|외주|업체|탑\s*\d|상위\s*\d/i.test(query)) {
    return ['outsourcing'];
  }
  return ['projects', 'organization', 'dashboard'];
}

function formatDomainLine(domain: AnalysisDomainKey, stats: AnalysisClarificationStats): string {
  switch (domain) {
    case 'projects':
      return `- **${DOMAIN_LABELS[domain]}** (${stats.scopeLabel} · 등록 ${stats.projectCount}건)`;
    case 'organization':
      return `- **${DOMAIN_LABELS[domain]}** (사업본부 ${stats.divisionCount}개 · 직원 ${stats.employeeCount}명)`;
    case 'personnelResource':
      return `- **${DOMAIN_LABELS[domain]}** (직급·본부별 인력 구성)`;
    case 'allocations':
      return `- **${DOMAIN_LABELS[domain]}** (공모·설계·제작·팀 배분율)`;
    case 'bidding':
      return `- **${DOMAIN_LABELS[domain]}** (입찰 ${stats.bidCount}건)`;
    case 'outsourcing':
      return `- **${DOMAIN_LABELS[domain]}** (외주 레코드 ${stats.outsourcingRecordCount}건)`;
    case 'exhibitionBusinessCost':
      return `- **${DOMAIN_LABELS[domain]}** (전시 유형별 비용 구조)`;
    case 'dashboard':
      return `- **${DOMAIN_LABELS[domain]}** (예산·기여도·리스크 시나리오)`;
    default:
      return `- **${DOMAIN_LABELS[domain]}**`;
  }
}

export function buildAnalysisClarificationMessage(
  originalQuery: string,
  proposedDomains: AnalysisDomainKey[],
  stats: AnalysisClarificationStats,
): string {
  const domainLines = proposedDomains.map((domain) => formatDomainLine(domain, stats)).join('\n');
  const domainNames = proposedDomains.map((domain) => DOMAIN_LABELS[domain]).join(' + ');

  return `【분석 범위 확인】

"${originalQuery}"만으로는 **어떤 데이터를 조합·기준**으로 분석할지 명확하지 않습니다.

아래 범위로 분석하려고 합니다.

${domainLines}

**${domainNames}** 기준으로 분석해 드릴까요?

- 그대로 진행: 「네, 진행해줘」
- 범위 조정: 「외주만」, 「조직+프로젝트로」, 「입찰과 외주 비교」처럼 원하는 데이터를 알려주세요.`;
}

function buildEffectiveQueryFromClarification(
  pending: PendingAnalysisClarification,
  userResponse: string,
): string {
  const domainNames = pending.proposedDomains.map((domain) => DOMAIN_LABELS[domain]).join(', ');

  if (isConfirmationResponse(userResponse)) {
    return `${pending.originalQuery}\n\n[분석 범위 확정] ${domainNames} 데이터를 기준으로 분석합니다.`;
  }

  return `${pending.originalQuery}\n\n[분석 범위 조정] ${userResponse.trim()} · 참고 도메인: ${domainNames}`;
}

export function isAmbiguousAnalysisQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  const hints = detectAnalysisDomainHints(trimmed);
  const hasGeneric = GENERIC_ANALYSIS_PATTERN.test(trimmed);

  if (isVeryVagueQuery(trimmed)) return true;
  if (isExplicitMultiDomainRequest(trimmed, hints.length)) return false;
  if (hasSpecificAnalysisScope(trimmed) && hints.length >= 1) return false;
  if (hints.length >= 1 && hints.length <= 2 && hasGeneric) return false;
  if (hints.length === 0 && hasGeneric) return true;
  if (hints.length >= 3 && hasGeneric && !hasSpecificAnalysisScope(trimmed)) return true;

  return false;
}

export function evaluateAnalysisQueryClarification(
  query: string,
  options: {
    pendingClarification: PendingAnalysisClarification | null;
    conversationTurns: { role: 'user' | 'assistant'; text: string }[];
    stats: AnalysisClarificationStats;
    skipClarification?: boolean;
  },
): AnalysisClarificationEvaluation {
  const trimmed = query.trim();

  if (options.skipClarification) {
    return { needsClarification: false, effectiveQuery: trimmed };
  }

  if (isCasualConversationQuery(trimmed)) {
    return { needsClarification: false, effectiveQuery: trimmed };
  }

  if (options.pendingClarification) {
    return {
      needsClarification: false,
      effectiveQuery: buildEffectiveQueryFromClarification(options.pendingClarification, trimmed),
    };
  }

  if (isAnalysisFollowUpRefinement(trimmed, options.conversationTurns)) {
    return { needsClarification: false, effectiveQuery: trimmed };
  }

  if (!isAmbiguousAnalysisQuery(trimmed)) {
    return { needsClarification: false, effectiveQuery: trimmed };
  }

  const proposedDomains = proposeAnalysisDomains(trimmed);

  return {
    needsClarification: true,
    originalQuery: trimmed,
    proposedDomains,
    message: buildAnalysisClarificationMessage(trimmed, proposedDomains, options.stats),
  };
}
