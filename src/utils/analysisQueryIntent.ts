export type AnalysisQueryIntent = 'organization' | 'project' | 'mixed';

const ORG_PATTERN =
  /조직|조직관리|인원|본부|팀\s*구성|headcount|경영진|경영관리|본부장|팀장|팀원|인사|전출|총괄|executive|organi[sz]/i;

const PROJECT_PATTERN =
  /프로젝트|수주|계약|공모|설계|제작|발주|금액|contract|project|매출|billing|예산/i;

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
