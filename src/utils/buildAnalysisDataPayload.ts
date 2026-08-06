import type {
  AllocationEntry,
  BudgetStatus,
  ContributionCard,
  Division,
  Employee,
  ExecutiveOffice,
  Project,
  ProjectTeamAllocation,
  Team,
  TeamAllocationEntry,
  TrackAllocation,
} from '@/types';
import type { AnalysisIntegratedContext } from '@/types/analyticsChat';
import type { ContractAmendment } from '@/types/contractChange';
import type { ExhibitionBusinessCostSummary } from '@/types/exhibitionBusinessCost';
import type { HistoryEvent } from '@/types/history';
import type { OutsourcingRecord } from '@/types/outsourcing';
import { buildDivisionSummary, filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { buildOutsourcingQueryAnalysis } from '@/utils/analysisOutsourcingPayload';
import {
  detectAnalysisQueryIntent,
  resolveAnalysisDomainHints,
  type AnalysisQueryIntent,
} from '@/utils/analysisQueryIntent';
import { buildBidAnalysisPayload } from '@/utils/buildBidAnalysisPayload';
import { getAmendmentsForProject } from '@/utils/contractChange';
import { buildVendorChartData, summarizeOutsourcingKpi } from '@/utils/outsourcingAnalysis';
import { summarizeOutsourcingDbStats } from '@/utils/outsourcingDbStats';
import type { PersonnelResourceStats } from '@/utils/personnelResourceStats';

export interface AnalysisDataPayloadMeta {
  roleLabel: string;
  scopeLabel: string;
  budget: BudgetStatus;
}

const PROJECT_COLUMNS = [
  'name',
  'code',
  'client',
  'type',
  'market',
  'division',
  'team',
  'status',
  'amount',
  'start',
  'end',
] as const;

const ORG_HISTORY_ENTITY_TYPES = new Set([
  'division',
  'team',
  'employee',
  'executive_admin',
  'division_head',
  'team_head',
]);

const MAX_PROJECT_ROWS = 50;
const MAX_OUTSOURCING_SAMPLE_ROWS = 40;
const MAX_AMENDMENT_ROWS = 40;
const MAX_ALLOCATION_PROJECTS = 40;
const MAX_PROJECT_TEAM_ALLOCATIONS = 40;
const MAX_CONTRIBUTION_CARDS = 30;
const MAX_TOP_VENDORS = 12;

function compactProjectRow(project: Project, amendmentCount: number): (string | number)[] {
  return [
    project.name,
    project.projectCode ?? '',
    project.clientName ?? '',
    project.projectType ?? '',
    project.marketScope ?? '',
    project.divisionName,
    project.teamName,
    project.status,
    project.contractAmount ?? 0,
    project.startDate,
    project.endDate ?? '',
    amendmentCount,
  ];
}

function formatAllocationEntries(entries: AllocationEntry[]): string {
  if (entries.length === 0) return '';
  return entries.map((entry) => `${entry.employeeName}(${entry.ratio}%)`).join(', ');
}

function formatTeamEntries(teams: TeamAllocationEntry[]): string {
  if (teams.length === 0) return '';
  return teams.map((team) => `${team.teamName}(${team.ratio}%)`).join(', ');
}

function compactOutsourcingRow(record: OutsourcingRecord): (string | number)[] {
  return [
    record.division,
    record.project,
    record.vendorLabel || record.vendor,
    record.contract,
    record.contractDate,
    record.totalAmount,
    record.materialAmount,
    record.laborAmount,
    record.expenseAmount,
  ];
}

function buildOrganizationPayload(
  divisions: Division[],
  teams: Team[],
  employees: Employee[],
  executiveOffice: ExecutiveOffice,
  historyEvents: HistoryEvent[],
) {
  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));

  const employeesByDivision = new Map<string, number>();
  const employeesByTeam = new Map<string, number>();
  for (const employee of employees) {
    employeesByDivision.set(
      employee.divisionId,
      (employeesByDivision.get(employee.divisionId) ?? 0) + 1,
    );
    employeesByTeam.set(employee.teamId, (employeesByTeam.get(employee.teamId) ?? 0) + 1);
  }

  return {
    executiveColumns: ['name', 'rank', 'accessRole'],
    executives: (executiveOffice.admins ?? []).map((admin) => [
      admin.name,
      admin.rank,
      admin.accessRole ?? '경영진',
    ]),
    divisionColumns: ['name', 'headName', 'headRank', 'teamCount', 'employeeCount'],
    divisions: divisions.map((division) => ({
      name: division.name,
      headName: division.headName ?? '',
      headRank: division.headRank ?? '',
      teamCount: teams.filter((team) => team.divisionId === division.id).length,
      employeeCount: employeesByDivision.get(division.id) ?? 0,
    })),
    teamColumns: ['division', 'name', 'headName', 'headRank', 'employeeCount'],
    teams: teams.map((team) => ({
      division: divisionNameById.get(team.divisionId) ?? '-',
      name: team.name,
      headName: team.headName ?? '',
      headRank: team.headRank ?? '',
      employeeCount: employeesByTeam.get(team.id) ?? 0,
    })),
    employeeColumns: ['name', 'division', 'team', 'role', 'accessRole'],
    employees: employees.map((employee) => [
      employee.name,
      employee.divisionName,
      employee.teamName,
      employee.role,
      employee.accessRole ?? '',
    ]),
    orgHistoryColumns: ['date', 'action', 'entityType', 'name', 'summary'],
    recentOrgHistory: historyEvents
      .filter(
        (event) =>
          (event.category === 'organization' || event.category === 'executive') &&
          ORG_HISTORY_ENTITY_TYPES.has(event.entityType),
      )
      .slice(-40)
      .map((event) => [
        event.occurredAt.slice(0, 10),
        event.action,
        event.entityType,
        event.entityName ?? '-',
        event.summary,
      ]),
  };
}

function buildAllocationsDomain(allocations: TrackAllocation[]) {
  return {
    count: allocations.length,
    columns: ['projectId', 'bid', 'design', 'production', 'updatedAt'],
    rows: allocations.slice(0, MAX_ALLOCATION_PROJECTS).map((allocation) => [
      allocation.projectId,
      formatAllocationEntries(allocation.bid),
      formatAllocationEntries(allocation.design),
      formatAllocationEntries(allocation.production),
      allocation.updatedAt.slice(0, 10),
    ]),
    truncated: allocations.length > MAX_ALLOCATION_PROJECTS,
  };
}

function buildProjectTeamAllocationsDomain(projectTeamAllocations: ProjectTeamAllocation[]) {
  return {
    count: projectTeamAllocations.length,
    columns: ['projectId', 'teams', 'updatedAt'],
    rows: projectTeamAllocations.slice(0, MAX_PROJECT_TEAM_ALLOCATIONS).map((allocation) => [
      allocation.projectId,
      formatTeamEntries(allocation.teams),
      allocation.updatedAt.slice(0, 10),
    ]),
    truncated: projectTeamAllocations.length > MAX_PROJECT_TEAM_ALLOCATIONS,
  };
}

function buildContractAmendmentsDomain(
  amendments: ContractAmendment[],
  projects: Project[],
) {
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return {
    count: amendments.length,
    columns: [
      'projectName',
      'sequence',
      'contractAmount',
      'startDate',
      'endDate',
      'registeredAt',
      'registeredByName',
    ],
    rows: amendments.slice(0, MAX_AMENDMENT_ROWS).map((amendment) => [
      projectNameById.get(amendment.projectId) ?? amendment.projectId,
      amendment.sequence,
      amendment.contractAmount ?? 0,
      amendment.startDate,
      amendment.endDate ?? '',
      amendment.registeredAt.slice(0, 10),
      amendment.registeredByName,
    ]),
    truncated: amendments.length > MAX_AMENDMENT_ROWS,
  };
}

function buildContributionCardsDomain(cards: ContributionCard[]) {
  return {
    count: cards.length,
    columns: [
      'projectName',
      'employeeName',
      'divisionName',
      'teamName',
      'bidRatio',
      'designRatio',
      'productionRatio',
      'totalContribution',
    ],
    rows: cards.slice(0, MAX_CONTRIBUTION_CARDS).map((card) => [
      card.projectName,
      card.employeeName,
      card.divisionName,
      card.teamName,
      card.bidRatio,
      card.designRatio,
      card.productionRatio,
      card.totalContribution,
    ]),
    truncated: cards.length > MAX_CONTRIBUTION_CARDS,
  };
}

function buildOutsourcingDomain(
  records: OutsourcingRecord[],
  meta: AnalysisIntegratedContext['outsourcingMeta'],
  query?: string,
) {
  const kpi = summarizeOutsourcingKpi(records);
  const dbStats = summarizeOutsourcingDbStats(records);
  const topVendors = buildVendorChartData(records)
    .slice(0, MAX_TOP_VENDORS)
    .map((vendor) => ({
      vendorLabel: vendor.vendorLabel,
      amount: vendor.amount,
      sharePercent: vendor.sharePercent,
      projectCount: vendor.projectCount,
      contractCount: vendor.contractCount,
    }));
  const queryAnalysis = buildOutsourcingQueryAnalysis(records, query);

  return {
    meta,
    counts: {
      records: records.length,
      vendors: topVendors.length,
    },
    kpi: {
      totalAmount: kpi.totalAmount,
      materialTotal: kpi.materialTotal,
      laborTotal: kpi.laborTotal,
      expenseTotal: kpi.expenseTotal,
    },
    dbStats: {
      overall: dbStats.overall,
      divisionAmountShares: dbStats.divisionAmountShares.slice(0, 8),
    },
    topVendors,
    queryAnalysis,
    recordColumns: [
      'division',
      'project',
      'vendor',
      'contract',
      'spec',
      'contractDate',
      'totalAmount',
      'materialAmount',
      'laborAmount',
      'expenseAmount',
    ],
    sampleRecords: records.slice(0, MAX_OUTSOURCING_SAMPLE_ROWS).map(compactOutsourcingRow),
    sampleTruncated: records.length > MAX_OUTSOURCING_SAMPLE_ROWS,
  };
}

function buildPersonnelResourceDomain(stats: PersonnelResourceStats) {
  return {
    totalCount: stats.totalCount,
    rankShares: stats.rankShares,
    divisionShares: stats.divisionShares,
    divisionCompositions: stats.divisionCompositions.map((composition) => ({
      divisionName: composition.divisionName,
      totalCount: composition.totalCount,
      gradeShares: composition.gradeShares,
    })),
  };
}

function buildExhibitionBusinessCostDomain(summary: ExhibitionBusinessCostSummary) {
  return {
    projectCount: summary.projectCount,
    totalCost: summary.totalCost,
    averageCost: summary.averageCost,
    items: summary.items.map((item) => ({
      type: item.type,
      projectCount: item.projectCount,
      totalCost: item.totalCost,
      sharePercent: item.sharePercent,
    })),
  };
}

function buildIntegratedDomains(ctx: AnalysisIntegratedContext, query?: string) {
  return {
    environment: {
      appName: 'S-NEXUS Performance Dashboard',
      generatedAt: new Date().toISOString(),
      modules: [
        'dashboard',
        'projects',
        'organization',
        'allocation',
        'contractChange',
        'purchase/bidding',
        'outsourcing',
        'personnelResource',
        'analysis',
      ],
      dataSources: {
        projects: 'AppContext (browser localStorage)',
        organization: 'AppContext (browser localStorage)',
        allocations: 'AppContext track & team allocations',
        bids: 'mockBidData (development sample)',
        outsourcing: ctx.outsourcingMeta,
        exhibitionBusinessCost: 'mockExhibitionBusinessCost (development sample)',
      },
    },
    personnelResource: buildPersonnelResourceDomain(ctx.personnelResourceStats),
    allocations: buildAllocationsDomain(ctx.allocations),
    projectTeamAllocations: buildProjectTeamAllocationsDomain(ctx.projectTeamAllocations),
    contractAmendments: buildContractAmendmentsDomain(ctx.contractAmendments, ctx.projects),
    dashboard: {
      riskScenario: ctx.riskScenario,
      contributionCards: buildContributionCardsDomain(ctx.contributionCards),
    },
    bidding: buildBidAnalysisPayload(ctx.bids, query),
    outsourcing: buildOutsourcingDomain(ctx.outsourcingRecords, ctx.outsourcingMeta, query),
    exhibitionBusinessCost: buildExhibitionBusinessCostDomain(ctx.exhibitionBusinessCost),
  };
}

type IntegratedDomains = ReturnType<typeof buildIntegratedDomains>;

function buildScopedIntegratedDomains(
  ctx: AnalysisIntegratedContext,
  query: string | undefined,
  intent: AnalysisQueryIntent,
  hints: string[],
): Partial<IntegratedDomains> {
  const full = buildIntegratedDomains(ctx, query);

  if (intent === 'organization') {
    return {
      environment: full.environment,
      personnelResource: full.personnelResource,
    };
  }

  if (intent === 'project') {
    return {
      environment: full.environment,
      allocations: full.allocations,
      projectTeamAllocations: full.projectTeamAllocations,
      contractAmendments: full.contractAmendments,
      dashboard: full.dashboard,
    };
  }

  const scoped: Partial<IntegratedDomains> = { environment: full.environment };
  const keys = new Set<keyof IntegratedDomains>();

  for (const hint of hints) {
    switch (hint) {
      case 'organization':
      case 'personnelResource':
        keys.add('personnelResource');
        break;
      case 'projects':
        keys.add('contractAmendments');
        keys.add('allocations');
        keys.add('projectTeamAllocations');
        keys.add('dashboard');
        break;
      case 'bidding':
        keys.add('bidding');
        break;
      case 'outsourcing':
        keys.add('outsourcing');
        break;
      case 'exhibitionBusinessCost':
        keys.add('exhibitionBusinessCost');
        break;
      default:
        break;
    }
  }

  if (keys.size === 0) {
    keys.add('personnelResource');
    keys.add('contractAmendments');
    keys.add('dashboard');
  }

  if (keys.has('personnelResource')) scoped.personnelResource = full.personnelResource;
  if (keys.has('allocations')) scoped.allocations = full.allocations;
  if (keys.has('projectTeamAllocations')) {
    scoped.projectTeamAllocations = full.projectTeamAllocations;
  }
  if (keys.has('contractAmendments')) scoped.contractAmendments = full.contractAmendments;
  if (keys.has('dashboard')) scoped.dashboard = full.dashboard;
  if (keys.has('bidding')) scoped.bidding = full.bidding;
  if (keys.has('outsourcing')) scoped.outsourcing = full.outsourcing;
  if (keys.has('exhibitionBusinessCost')) {
    scoped.exhibitionBusinessCost = full.exhibitionBusinessCost;
  }

  return scoped;
}

export function getAnalysisMaxTokensForIntent(intent: AnalysisQueryIntent): number {
  if (intent === 'organization') return 2048;
  if (intent === 'project') return 3072;
  return 3584;
}

/** Claude에 보낼 경량 데이터 (토큰·한도 절약) */
export function buildAnalysisDataPayload(
  ctx: AnalysisIntegratedContext,
  meta: AnalysisDataPayloadMeta,
  teams: Team[],
  query?: string,
) {
  const queryIntent = detectAnalysisQueryIntent(query);
  const domainHints = resolveAnalysisDomainHints(query);
  const { projects: scopedProjects, scopeNote } = filterProjectsByQuery(ctx.projects, query);

  const includeFullProjects = queryIntent !== 'organization';
  const projectRows = includeFullProjects
    ? scopedProjects.slice(0, MAX_PROJECT_ROWS).map((project) => {
        const amendments = getAmendmentsForProject(ctx.contractAmendments, project.id);
        return compactProjectRow(project, amendments.length);
      })
    : [];

  const projectsTruncated = includeFullProjects && scopedProjects.length > MAX_PROJECT_ROWS;

  const organization = buildOrganizationPayload(
    ctx.divisions,
    teams,
    ctx.employees,
    ctx.executiveOffice ?? { admins: [] },
    ctx.historyEvents,
  );

  const domains = buildScopedIntegratedDomains(ctx, query, queryIntent, domainHints);

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    queryIntent,
    domainHints,
    userQuery: query?.trim() ?? '',
    viewer: { role: meta.roleLabel, scope: meta.scopeLabel },
    dataScope: scopeNote,
    counts: {
      projectsTotal: ctx.projects.length,
      projectsInScope: scopedProjects.length,
      divisions: ctx.divisions.length,
      teams: teams.length,
      employees: ctx.employees.length,
      executives: ctx.executiveOffice?.admins?.length ?? 0,
      contractAmendments: ctx.contractAmendments.length,
      historyEvents: ctx.historyEvents.length,
      allocations: ctx.allocations.length,
      projectTeamAllocations: ctx.projectTeamAllocations.length,
      bids: ctx.bids.length,
      outsourcingRecords: ctx.outsourcingRecords.length,
      contributionCards: ctx.contributionCards.length,
    },
    organization,
    domains,
    ...(queryIntent === 'organization'
      ? {}
      : {
          divisionSummary: buildDivisionSummary(ctx.projects),
          budget: {
            contractAmount: meta.budget.contractAmount,
            cumulativeBilling: meta.budget.cumulativeBilling,
            executionBudget: meta.budget.executionBudget,
            spentBudget: meta.budget.spentBudget,
            billingRate: meta.budget.billingRate,
            budgetBurnRate: meta.budget.budgetBurnRate,
          },
        }),
    projectColumns: [...PROJECT_COLUMNS, 'amendments'],
    projects: projectRows,
    projectsTruncated,
    rules: {
      order: 'amount>=1 이면 수주',
      phase: 'status 또는 code 마지막2자리 첫째(1공모2설계3제작)',
    },
  };
}

function buildIntentGuidance(intent: AnalysisQueryIntent, userQuery: string, domainHints: string[]): string {
  const domainGuide =
    domainHints.length > 0
      ? `관련 도메인 힌트: ${domainHints.join(', ')}. domains 섹션에서 해당 데이터를 우선 참고하세요.`
      : 'domains 섹션에 프로젝트·조직·배분·입찰·외주·자원정보·전시비용·대시보드 KPI가 모두 포함됩니다.';

  if (intent === 'organization') {
    return `질문 의도: **조직·인원 분석** (queryIntent=organization).
사용자 질문: "${userQuery}"
반드시 organization·domains.personnelResource 데이터를 중심으로 답하세요.
프로젝트/수주/계약 인사이트 보고서를 작성하지 마세요. 「등록 프로젝트 인사이트 보고서」 형식 금지.
${domainGuide}
출력: 【조직·인원 인사이트】 제목 → 핵심 요약 → 본부·팀·인원 현황 → 공석/이슈 → 최근 조직 변경 → 권고.`;
  }

  if (intent === 'project') {
    return `질문 의도: **프로젝트·수주 분석** (queryIntent=project).
projects·domains.contractAmendments·domains.allocations·domains.dashboard 데이터를 중심으로 답하세요.
${domainGuide}`;
  }

  return `질문 의도: **복합 분석** (queryIntent=mixed).
organization, projects, domains(입찰·외주·자원정보·전시비용·배분·대시보드)를 모두 참고하되, 사용자 질문에 더 가까운 영역을 우선하세요.
${domainGuide}`;
}

export function buildSystemInstruction(payload: ReturnType<typeof buildAnalysisDataPayload>): string {
  const intentGuide = buildIntentGuidance(
    payload.queryIntent as AnalysisQueryIntent,
    payload.userQuery,
    payload.domainHints as string[],
  );

  return `S-NEXUS 데이터 분석 AI. 한국어. 제공 JSON만 사용, 수치 창작 금지.

${intentGuide}

질문 범위(dataScope)에 맞춰 분석. 사용자 메시지에 [분석 범위 확정] 또는 [분석 범위 조정]이 있으면 해당 범위를 최우선으로 따르세요.
외주 공종/업체 순위 질문은 domains.outsourcing.queryAnalysis.topVendorsByAmount를 우선 사용하세요. null이 아니면 앱에서 전체 외주 DB를 집계한 결과입니다.
범위가 여전히 모호하면 분석 결과를 내기 전에 【분석 범위 확인】 형식으로 어떤 데이터를 기준으로 할지 역질문하세요.
projects는 projectColumns 순서의 행 배열.
organization에는 경영진·사업본부·팀·팀원·조직 변경 이력이 포함됩니다.
domains에는 앱 전역 데이터가 통합됩니다:
- environment: 앱 모듈·데이터 출처
- personnelResource: 자원정보현황(직급·본부·급수 구성)
- allocations / projectTeamAllocations: 공모·설계·제작 배분 및 팀 배분
- contractAmendments: 계약변경 이력
- dashboard: riskScenario·contributionCards
- bidding: 입찰·구매(입찰도우미) 데이터
- outsourcing: 외주정보검색 KPI·DB통계·상위업체·queryAnalysis(질문 키워드 필터 후 금액 상위 업체 선집계)·샘플 레코드
- exhibitionBusinessCost: 전시사업 비용 구조

대화 맥락 반영해 보고서 수정·심화. 출력: 핵심요약 bullet → 섹션별 분석 → 마크다운 표 → 권고.

DATA:
${JSON.stringify(payload)}`;
}

export type AnalysisDataPayload = ReturnType<typeof buildAnalysisDataPayload>;

export function estimatePayloadChars(payload: AnalysisDataPayload): number {
  return JSON.stringify(payload).length;
}

export function summarizePayloadScope(payload: AnalysisDataPayload): string {
  const chars = estimatePayloadChars(payload);
  const kb = (chars / 1024).toFixed(1);
  const intentLabel =
    payload.queryIntent === 'organization'
      ? '조직·인원'
      : payload.queryIntent === 'project'
        ? '프로젝트'
        : '복합';
  const domainCount = payload.domains ? Object.keys(payload.domains).length : 0;
  return `${intentLabel} · ${payload.dataScope} · ${domainCount}개 도메인 · 약 ${kb}KB`;
}
