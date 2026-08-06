export type AnalysisQueryIntent = 'organization' | 'project' | 'mixed';

const ORG_PATTERN =
  /조직|조직관리|인원|본부|팀\s*구성|headcount|경영진|경영관리|본부장|팀장|팀원|인사|전출|총괄|executive|organi[sz]/i;

const PROJECT_PATTERN =
  /프로젝트|수주|계약|공모|설계|제작|발주|금액|contract|project|매출|billing|예산/i;

const BID_PATTERN = /입찰|낙찰|구매|입찰도우미|bid|tender|평가|전자입찰/i;

const OUTSOURCING_PATTERN =
  /외주|업체|vendor|outsourc|외주정보|협력사|하도급|금속|목공|전기|설비|공종|규격|탑\s*\d|상위\s*\d|\btop\s*\d/i;

const CLARIFICATION_SCOPE_PATTERN = /\[분석 범위 (?:확정|조정)\][^\n]*/i;

const CLARIFICATION_DOMAIN_LABELS: Record<string, string> = {
  '프로젝트·수주': 'projects',
  '조직·인원': 'organization',
  '자원정보현황(직급·본부 구성)': 'personnelResource',
  '공모·설계·제작·팀 배분': 'allocations',
  '입찰·구매(입찰도우미)': 'bidding',
  외주정보검색: 'outsourcing',
  '전시사업 비용': 'exhibitionBusinessCost',
  '대시보드 KPI(예산·기여도·리스크 시나리오)': 'dashboard',
};

const PERSONNEL_RESOURCE_PATTERN =
  /자원정보|자원\s*현황|급수|직급|인력\s*구성|headcount|피라미드|본부별\s*인원/i;

const EXHIBITION_PATTERN = /전시\s*비용|전시사업\s*비용|exhibition\s*cost/i;

/** 사용자 질문이 조직/프로젝트 중 무엇을 중심으로 하는지 판별 */
export function detectAnalysisQueryIntent(query?: string): AnalysisQueryIntent {
  if (!query?.trim()) return 'mixed';

  const org = ORG_PATTERN.test(query);
  const project = PROJECT_PATTERN.test(query);

  if (org && !project) return 'organization';
  if (project && !org) return 'project';
  return 'mixed';
}

export function isOrganizationAnalysisQuery(query?: string): boolean {
  return detectAnalysisQueryIntent(query) === 'organization';
}

function detectClarificationDomainHints(query: string): string[] {
  const scopeMatch = query.match(CLARIFICATION_SCOPE_PATTERN);
  if (!scopeMatch) return [];

  const scopeLine = scopeMatch[0];
  const hints: string[] = [];
  for (const [label, hint] of Object.entries(CLARIFICATION_DOMAIN_LABELS)) {
    if (scopeLine.includes(label)) hints.push(hint);
  }
  return hints;
}

/** 질문이 특정 통합 도메인과 관련 있는지 (프롬프트 가이드용) */
export function detectAnalysisDomainHints(query?: string): string[] {
  if (!query?.trim()) return [];

  const hints: string[] = [];
  if (BID_PATTERN.test(query)) hints.push('bidding');
  if (OUTSOURCING_PATTERN.test(query)) hints.push('outsourcing');
  if (PERSONNEL_RESOURCE_PATTERN.test(query)) hints.push('personnelResource');
  if (EXHIBITION_PATTERN.test(query)) hints.push('exhibitionBusinessCost');
  if (ORG_PATTERN.test(query)) hints.push('organization');
  if (PROJECT_PATTERN.test(query)) hints.push('projects');

  hints.push(...detectClarificationDomainHints(query));

  return [...new Set(hints)];
}

/** scoped payload용 도메인 힌트 (확정/조정 범위 + 질문 키워드 병합) */
export function resolveAnalysisDomainHints(query?: string): string[] {
  return detectAnalysisDomainHints(query);
}
