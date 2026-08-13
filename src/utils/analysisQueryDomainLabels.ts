import type { AnalysisDomainKey, AnalysisClarificationStats } from '@/utils/analysisQueryClarification';

export const DOMAIN_LABELS: Record<AnalysisDomainKey, string> = {
  projects: '프로젝트·수주',
  organization: '조직·인원',
  personnelResource: '자원정보현황(직급·본부 구성)',
  allocations: '공모·설계·제작·팀 배분',
  bidding: '입찰·구매(입찰도우미)',
  outsourcing: '외주정보검색',
  exhibitionBusinessCost: '전시사업 비용',
  dashboard: '대시보드 KPI(예산·기여도·리스크 시나리오)',
};

export const ALL_LOCAL_DATA_DOMAINS: AnalysisDomainKey[] = [
  'projects',
  'organization',
  'personnelResource',
  'bidding',
  'outsourcing',
  'allocations',
  'exhibitionBusinessCost',
  'dashboard',
];

export function formatDomainScopeLine(
  domain: AnalysisDomainKey,
  stats: AnalysisClarificationStats,
): string {
  switch (domain) {
    case 'projects':
      return `**${DOMAIN_LABELS[domain]}** (${stats.scopeLabel} · 등록 ${stats.projectCount}건)`;
    case 'organization':
      return `**${DOMAIN_LABELS[domain]}** (사업본부 ${stats.divisionCount}개 · 직원 ${stats.employeeCount}명)`;
    case 'personnelResource':
      return `**${DOMAIN_LABELS[domain]}** (직급·본부별 인력 구성)`;
    case 'allocations':
      return `**${DOMAIN_LABELS[domain]}** (공모·설계·제작·팀 배분율)`;
    case 'bidding':
      return `**${DOMAIN_LABELS[domain]}** (입찰 ${stats.bidCount}건)`;
    case 'outsourcing':
      return `**${DOMAIN_LABELS[domain]}** (외주 레코드 ${stats.outsourcingRecordCount}건)`;
    case 'exhibitionBusinessCost':
      return `**${DOMAIN_LABELS[domain]}** (전시 유형별 비용 구조)`;
    case 'dashboard':
      return `**${DOMAIN_LABELS[domain]}** (예산·기여도·리스크 시나리오)`;
    default:
      return `**${DOMAIN_LABELS[domain]}**`;
  }
}
