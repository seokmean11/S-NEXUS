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

const DATA_REQUEST_PATTERN =
  /분석|인사이트|보고서|현황|요약|정리|리스크|데이터|프로젝트|수주|외주|입찰|조직|인원|배분|계약|금액|업체|목록|리스트|알려|설명|해줘|해주|부탁|작성|뽑아|조회|추이|트렌드|기여|예산|낙찰|협력|공종|직급|급수|자원|전시|대시보드/i;

const CASUAL_GREETING_PATTERN =
  /^(안녕|안녕하세요|하이|헬로|hello|hi|hey|ㅎㅇ|반가|반갑|고마|감사|미안|죄송|thanks|thank\s*you|ok|okay|네|응|ㅇㅇ|좋아|그래)[!.?\s~]*$/i;

const CASUAL_SMALLTALK_PATTERN =
  /잘\s*지냈|어떻게\s*지내|지내셨|잘\s*있|뭐\s*해|뭐\s*하세요|기분\s*어때|좋은\s*(아침|하루|저녁|밤)|수고\s*하|오랜만|만나서\s*반가|바쁘|피곤|힘내/i;

/** 인사·안부 등 데이터 조회가 아닌 일반 대화 */
export function isCasualConversationQuery(query?: string): boolean {
  if (!query?.trim()) return false;

  const trimmed = query.trim();
  if (detectAnalysisDomainHints(trimmed).length > 0) return false;
  if (DATA_REQUEST_PATTERN.test(trimmed)) return false;

  if (CASUAL_GREETING_PATTERN.test(trimmed)) return true;
  if (CASUAL_SMALLTALK_PATTERN.test(trimmed) && trimmed.length <= 48) return true;

  return false;
}

/** 사용자가 명시적으로 분석·보고서·인사이트 등을 요청했는지 */
export function isExplicitAnalysisRequest(query?: string): boolean {
  if (!query?.trim()) return false;
  return /분석|인사이트|보고서|현황\s*요약|종합\s*(분석|현황)|심층\s*분석|overview|summary|insight/i.test(
    query.trim(),
  );
}

export function buildCasualConversationReply(query: string): string {
  const trimmed = query.trim();

  if (/잘\s*지냈|어떻게\s*지내|지내셨|잘\s*있/.test(trimmed)) {
    return '네, 잘 지내고 있어요! 😊\n\n필요하신 정보가 있으면 편하게 말씀해 주세요.';
  }

  if (/고마|감사|thanks|thank\s*you/i.test(trimmed)) {
    return '천만에요! 😊\n\n필요하신 정보가 있으면 언제든 말씀해 주세요.';
  }

  if (/안녕|반가|hello|hi|hey|ㅎㅇ/i.test(trimmed)) {
    return '안녕하세요! NEXUS AI입니다.\n\n데이터 기반으로 필요한 정보를 안내해 드릴게요. 궁금하신 내용이 있으면 말씀해 주세요.';
  }

  return '네, 알겠습니다.\n\n필요하신 정보가 있으면 말씀해 주세요.';
}
