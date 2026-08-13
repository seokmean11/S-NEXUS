import { formatCurrency } from '@/data/mockData';
import type { AnalysisIntegratedContext, ChatbotResponse } from '@/types/analyticsChat';
import type { Bid } from '@/types/bid';
import type { ExportTable } from '@/utils/reportExport';
import { formatIsoToKoreanDate } from '@/utils/formatInput';

const BID_QUERY_PATTERN = /입찰|낙찰|구매|입찰도우미|bid|tender|전자입찰|수의계약|공개입찰/i;
const EXHIBITION_QUERY_PATTERN = /전시\s*비용|전시사업\s*비용|유형별\s*사업비|exhibition\s*cost/i;
const PERSONNEL_RESOURCE_QUERY_PATTERN =
  /자원정보|자원\s*현황|급수|직급|인력\s*구성|headcount|피라미드|본부별\s*인원/i;
const ALLOCATION_QUERY_PATTERN =
  /배분|공모|설계|제작|기여|팀\s*배분|allocation|track/i;
const DASHBOARD_QUERY_PATTERN =
  /대시보드|기여도|기여\s*카드|리스크\s*시나리오|예산\s*소진|예산\s*현황|billing|burn\s*rate|kpi/i;

const SEARCH_NOISE =
  /\[분석 범위[^\]]+\]|알려|줘|주세요|해줘|조회|검색|현황|요약|분석|보고서|목록|리스트|어떻게|되니|되나|최근|개월|년|년간|기간|좀|을|를|이|가|은|는|의|야|에|에서|으로|로|와|과|및|전체|몇|얼마|알려줘/g;

function formatAmount(value?: number): string {
  if (value == null || value <= 0) return '-';
  return `${formatCurrency(value)}원`;
}

function extractSearchKeywords(query: string): string[] {
  const cleaned = query
    .replace(SEARCH_NOISE, ' ')
    .replace(/[?？!.。,]/g, ' ')
    .trim();
  const keywords = new Set<string>();
  for (const token of cleaned.split(/[\s,·+/&]+/)) {
    const word = token.trim();
    if (word.length < 2) continue;
    if (/^\d+$/.test(word)) continue;
    keywords.add(word);
  }
  return [...keywords];
}

function matchesKeywordHaystack(haystack: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const normalized = haystack.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function buildExports(
  baseId: string,
  title: string,
  table: ExportTable,
  summary: string,
): ChatbotResponse['exports'] {
  const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().replace(/\s+/g, '_');
  return [
    {
      id: `${baseId}-csv`,
      label: '엑셀(CSV) 다운로드',
      format: 'csv',
      filename: `${safeName}.csv`,
      title,
      table,
      summary,
    },
    {
      id: `${baseId}-word`,
      label: '워드 보고서 다운로드',
      format: 'word',
      filename: `${safeName}.doc`,
      title,
      table,
      summary,
    },
  ];
}

function filterBids(bids: Bid[], query: string): Bid[] {
  const keywords = extractSearchKeywords(query);
  return bids.filter((bid) =>
    matchesKeywordHaystack(
      [
        bid.title,
        bid.clientName,
        bid.divisionName,
        bid.teamName ?? '',
        bid.tradeType,
        bid.projectCode ?? '',
        bid.status,
        bid.bidCategory,
        bid.bidMethod,
      ].join(' '),
      keywords,
    ),
  );
}

/** 구매관리 · 입찰도우미 */
export function buildBidLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!BID_QUERY_PATTERN.test(query)) return null;

  const matched = filterBids(ctx.bids, query);
  const table: ExportTable = {
    headers: [
      '입찰명',
      '발주처',
      '사업본부',
      '팀',
      '공종',
      '방식',
      '추정금액',
      '시작일',
      '마감일',
      '상태',
    ],
    rows: matched.slice(0, 30).map((bid) => [
      bid.title,
      bid.clientName,
      bid.divisionName,
      bid.teamName ?? '-',
      bid.tradeType,
      bid.bidMethod,
      formatAmount(bid.estimatedAmount),
      formatIsoToKoreanDate(bid.bidStartDate),
      formatIsoToKoreanDate(bid.bidDeadline),
      bid.status,
    ]),
  };

  if (matched.length === 0) {
    return {
      text: '**입찰·구매(입찰도우미)** 데이터에서 조건에 맞는 입찰을 찾지 못했습니다.',
    };
  }

  const statusCounts = matched.reduce<Record<string, number>>((acc, bid) => {
    acc[bid.status] = (acc[bid.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = `입찰 ${matched.length}건 · ${Object.entries(statusCounts)
    .map(([status, count]) => `${status} ${count}`)
    .join(' · ')}`;

  return {
    text: [
      `**입찰·구매(입찰도우미)** 메뉴 데이터 기준으로 ${matched.length}건을 조회했습니다.`,
      summary,
      matched.length > 30 ? `- 상세 ${matched.length}건 중 30건만 표에 표시했습니다.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    table,
    exports: buildExports('bid-local', '입찰_현황', table, summary),
  };
}

/** 기타정보 · 유형별사업비(전시) */
export function buildExhibitionLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!EXHIBITION_QUERY_PATTERN.test(query)) return null;

  const summaryData = ctx.exhibitionBusinessCost;
  const table: ExportTable = {
    headers: ['유형', '프로젝트 수', '사업비 합계', '비중(%)'],
    rows: summaryData.items.map((item) => [
      item.type,
      String(item.projectCount),
      formatAmount(item.totalCost),
      `${item.sharePercent.toFixed(1)}%`,
    ]),
  };

  const summary = `전시사업 ${summaryData.projectCount}건 · 합계 ${formatAmount(summaryData.totalCost)} · 평균 ${formatAmount(summaryData.averageCost)}`;

  return {
    text: [
      '**유형별사업비(전시)** 메뉴 데이터 기준 집계입니다.',
      summary,
    ].join('\n'),
    table,
    exports: buildExports('exhibition-local', '전시사업비_유형별', table, summary),
  };
}

/** 조직관리 · 자원정보현황 */
export function buildPersonnelResourceLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!PERSONNEL_RESOURCE_QUERY_PATTERN.test(query)) return null;

  const stats = ctx.personnelResourceStats;
  const table: ExportTable = {
    headers: ['본부', '인원', '주요 급수 구성'],
    rows: stats.divisionCompositions.map((division) => [
      division.divisionName,
      String(division.totalCount),
      division.gradeShares
        .filter((item) => item.count > 0)
        .slice(0, 4)
        .map((item) => `${item.label} ${item.count}`)
        .join(', ') || '-',
    ]),
  };

  const summary = `전사 ${stats.totalCount}명 · 본부 ${stats.divisionShares.length}개`;

  return {
    text: [
      '**조직관리 · 자원정보현황** 메뉴 데이터 기준입니다.',
      summary,
      `- 직급 구성: ${stats.rankShares
        .filter((item) => item.count > 0)
        .map((item) => `${item.label} ${item.count}명(${item.sharePercent.toFixed(1)}%)`)
        .join(' · ')}`,
    ].join('\n'),
    table,
    exports: buildExports('personnel-resource-local', '자원정보현황', table, summary),
  };
}

/** PM 인력 배분 */
export function buildAllocationLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!ALLOCATION_QUERY_PATTERN.test(query)) return null;

  const projectNameById = new Map(ctx.projects.map((project) => [project.id, project.name]));
  const table: ExportTable = {
    headers: ['프로젝트', '공모', '설계', '제작', '팀배분(요약)'],
    rows: [],
  };

  for (const allocation of ctx.allocations.slice(0, 30)) {
    const projectName = projectNameById.get(allocation.projectId) ?? allocation.projectId;
    const teamAllocation = ctx.projectTeamAllocations.find(
      (entry) => entry.projectId === allocation.projectId,
    );
    table.rows.push([
      projectName,
      allocation.bid.map((entry) => `${entry.employeeName}(${entry.ratio}%)`).join(', ') || '-',
      allocation.design.map((entry) => `${entry.employeeName}(${entry.ratio}%)`).join(', ') || '-',
      allocation.production.map((entry) => `${entry.employeeName}(${entry.ratio}%)`).join(', ') || '-',
      teamAllocation
        ? teamAllocation.teams.map((team) => `${team.teamName}(${team.ratio}%)`).join(', ')
        : '-',
    ]);
  }

  if (table.rows.length === 0) {
    return {
      text: '**PM 인력 배분** 메뉴에 등록된 배분 데이터가 없습니다.',
    };
  }

  const summary = `배분 프로젝트 ${ctx.allocations.length}건 · 팀배분 ${ctx.projectTeamAllocations.length}건`;

  return {
    text: [
      '**PM 인력 배분** 메뉴 데이터 기준입니다.',
      summary,
      ctx.contributionCards.length > 0
        ? `- 기여도 카드 ${ctx.contributionCards.length}건이 대시보드와 연동되어 있습니다.`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    table,
    exports: buildExports('allocation-local', '인력배분_현황', table, summary),
  };
}

const RISK_SCENARIO_LABELS: Record<AnalysisIntegratedContext['riskScenario'], string> = {
  normal: '정상',
  cash_flow: '현금흐름 리스크',
  budget_burn: '예산 소진 리스크',
  budget_exceed: '예산 초과 리스크',
};

/** 대시보드 KPI */
export function buildDashboardLocalResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  if (!DASHBOARD_QUERY_PATTERN.test(query)) return null;

  const topContributions = [...ctx.contributionCards]
    .sort((a, b) => b.totalContribution - a.totalContribution)
    .slice(0, 10);

  const table: ExportTable = {
    headers: ['프로젝트', '담당자', '본부', '팀', '공모', '설계', '제작', '기여합계'],
    rows: topContributions.map((card) => [
      card.projectName,
      card.employeeName,
      card.divisionName,
      card.teamName,
      `${card.bidRatio}%`,
      `${card.designRatio}%`,
      `${card.productionRatio}%`,
      `${card.totalContribution}%`,
    ]),
  };

  const budget = ctx.budget;
  const budgetLines = budget
    ? [
        `- 계약금액 ${formatAmount(budget.contractAmount)} · 누적기성 ${formatAmount(budget.cumulativeBilling)} (${budget.billingRate.toFixed(1)}%)`,
        `- 실행예산 ${formatAmount(budget.executionBudget)} · 집행 ${formatAmount(budget.spentBudget)} (${budget.budgetBurnRate.toFixed(1)}%)`,
      ]
    : [];

  const summary = `리스크 ${RISK_SCENARIO_LABELS[ctx.riskScenario]} · 기여 카드 ${ctx.contributionCards.length}건`;

  return {
    text: [
      '**대시보드 KPI** 메뉴 데이터 기준입니다.',
      `- 리스크 시나리오: **${RISK_SCENARIO_LABELS[ctx.riskScenario]}**`,
      ...budgetLines,
      `- 기여도 상위 ${topContributions.length}명 표 참고`,
    ].join('\n'),
    table,
    exports: buildExports('dashboard-local', '대시보드_KPI', table, summary),
  };
}

/** 키워드가 여러 메뉴 도메인에 걸칠 때 통합 검색 */
export function buildCrossDomainMenuSearchResponse(
  ctx: AnalysisIntegratedContext,
  query: string,
): ChatbotResponse | null {
  const keywords = extractSearchKeywords(query);
  if (keywords.length === 0) return null;

  const sections: string[] = [];
  const tableRows: string[][] = [];

  for (const project of ctx.projects) {
    if (
      matchesKeywordHaystack(
        [project.name, project.clientName ?? '', project.projectCode ?? '', project.divisionName, project.teamName].join(
          ' ',
        ),
        keywords,
      )
    ) {
      sections.push(`- **프로젝트** · ${project.name} · ${project.divisionName} · ${project.status}`);
      tableRows.push(['프로젝트', project.name, project.divisionName, project.status]);
    }
  }

  for (const employee of ctx.employees) {
    if (matchesKeywordHaystack([employee.name, employee.divisionName, employee.teamName, employee.role].join(' '), keywords)) {
      sections.push(`- **조직·인원** · ${employee.name} · ${employee.divisionName} / ${employee.teamName}`);
      tableRows.push(['조직·인원', employee.name, employee.divisionName, employee.teamName]);
    }
  }

  for (const bid of ctx.bids) {
    if (matchesKeywordHaystack([bid.title, bid.tradeType, bid.clientName, bid.divisionName].join(' '), keywords)) {
      sections.push(`- **입찰·구매** · ${bid.title} · ${bid.tradeType} · ${bid.status}`);
      tableRows.push(['입찰·구매', bid.title, bid.tradeType, bid.status]);
    }
  }

  for (const record of ctx.outsourcingRecords.slice(0, 200)) {
    if (
      matchesKeywordHaystack(
        [record.spec, record.budget, record.contract, record.vendorLabel, record.project].join(' '),
        keywords,
      )
    ) {
      sections.push(`- **외주** · ${record.contract || record.spec} · ${record.vendorLabel} · ${record.contractDate}`);
      tableRows.push(['외주', record.contract || record.spec, record.vendorLabel, record.contractDate]);
      if (tableRows.length >= 25) break;
    }
  }

  if (sections.length === 0) return null;

  const limitedSections = sections.slice(0, 12);
  const table: ExportTable = {
    headers: ['메뉴', '항목', '세부1', '세부2'],
    rows: tableRows.slice(0, 25),
  };

  return {
    text: [
      `**${keywords.join(', ')}** 키워드로 연동된 메뉴 데이터 전체를 검색했습니다. (${sections.length}건)`,
      '',
      ...limitedSections,
      sections.length > limitedSections.length
        ? `\n- 외 ${sections.length - limitedSections.length}건 (표 참고)`
        : '',
    ].join('\n'),
    table,
  };
}

export function buildMenuDataScopeSummary(ctx: AnalysisIntegratedContext): string {
  return [
    '연동 메뉴 데이터:',
    `- 프로젝트 ${ctx.projects.length}건 · 조직 ${ctx.employees.length}명`,
    `- 입찰·구매 ${ctx.bids.length}건 · 외주 ${ctx.outsourcingRecords.length}건`,
    `- 인력배분 ${ctx.allocations.length}건 · 전시사업비 ${ctx.exhibitionBusinessCost.projectCount}건`,
    `- 대시보드 기여 ${ctx.contributionCards.length}건`,
  ].join('\n');
}
