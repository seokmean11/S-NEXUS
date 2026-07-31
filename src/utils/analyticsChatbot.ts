import { formatCurrency } from '@/data/mockData';
import type { Project } from '@/types';
import type {
  AnalyticsChatContext,
  ChatbotResponse,
  ChatExportAction,
} from '@/types/analyticsChat';
import type { ExportTable } from '@/utils/reportExport';
import { formatIsoToKoreanDate } from '@/utils/formatInput';
import { getAmendmentsForProject } from '@/utils/contractChange';
import { parseProjectCode } from '@/utils/projectCode';
import { buildProjectInsightReport } from '@/utils/projectInsightReport';
import { resolveDivisionFilter } from '@/utils/analysisQueryFilter';

export type { AnalyticsChatContext, ChatbotResponse, ChatExportAction } from '@/types/analyticsChat';

function currentYear(): number {
  return new Date().getFullYear();
}

function parseYear(query: string): number | null {
  const match = query.match(/20\d{2}/);
  if (match) return Number(match[0]);
  if (/올해|금년|당해/.test(query)) return currentYear();
  if (/작년|전년/.test(query)) return currentYear() - 1;
  return null;
}

function parseYearRange(query: string): { from: number; to: number } {
  const recentMatch = query.match(/최근\s*(\d+)\s*년/);
  if (recentMatch) {
    const span = Number(recentMatch[1]);
    return { from: currentYear() - span + 1, to: currentYear() };
  }
  const year = parseYear(query);
  if (year) return { from: year, to: year };
  return { from: currentYear() - 2, to: currentYear() };
}

function parseHalf(query: string): 'first' | 'second' | 'all' {
  if (/상반기|1\s*~?\s*6\s*월|1-6월/.test(query)) return 'first';
  if (/하반기|7\s*~?\s*12\s*월|7-12월/.test(query)) return 'second';
  return 'all';
}

function projectInPeriod(project: Project, year: number, half: 'first' | 'second' | 'all'): boolean {
  const basis = project.startDate || project.createdAt;
  if (!basis) return false;
  const date = new Date(basis);
  if (date.getFullYear() !== year) return false;
  const month = date.getMonth() + 1;
  if (half === 'first') return month <= 6;
  if (half === 'second') return month >= 7;
  return true;
}

function isOrderProject(project: Project): boolean {
  return (project.contractAmount ?? 0) > 0;
}

function formatAmount(value?: number): string {
  if (value == null || value <= 0) return '-';
  return `${formatCurrency(value)}원`;
}

function buildExports(
  baseId: string,
  title: string,
  table: ExportTable,
  summary: string,
): ChatExportAction[] {
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

function divisionOrderStatus(ctx: AnalyticsChatContext, query: string): ChatbotResponse {
  const year = parseYear(query) ?? currentYear();
  const half = parseHalf(query);
  const divisionFilter = resolveDivisionFilter(query);
  const halfLabel = half === 'first' ? '상반기' : half === 'second' ? '하반기' : '연간';

  const filtered = ctx.projects.filter(
    (project) =>
      isOrderProject(project) &&
      projectInPeriod(project, year, half) &&
      (!divisionFilter || project.divisionName === divisionFilter),
  );

  const grouped = new Map<string, { count: number; amount: number; projects: Project[] }>();
  for (const project of filtered) {
    const bucket = grouped.get(project.divisionName) ?? { count: 0, amount: 0, projects: [] };
    bucket.count += 1;
    bucket.amount += project.contractAmount ?? 0;
    bucket.projects.push(project);
    grouped.set(project.divisionName, bucket);
  }

  const table: ExportTable = {
    headers: ['사업본부', '수주 건수', '수주 금액 합계', '프로젝트명', '발주처', '계약금액', '시작일'],
    rows: [],
  };

  const sortedGroups = [...grouped.entries()].sort((a, b) => b[1].amount - a[1].amount);
  for (const [divisionName, bucket] of sortedGroups) {
    bucket.projects
      .sort((a, b) => (b.contractAmount ?? 0) - (a.contractAmount ?? 0))
      .forEach((project, index) => {
        table.rows.push([
          index === 0 ? divisionName : '',
          index === 0 ? String(bucket.count) : '',
          index === 0 ? formatAmount(bucket.amount) : '',
          project.name,
          project.clientName ?? '-',
          formatAmount(project.contractAmount),
          formatIsoToKoreanDate(project.startDate),
        ]);
      });
  }

  if (table.rows.length === 0) {
    return {
      text: `${year}년 ${halfLabel}${divisionFilter ? ` · ${divisionFilter}` : ''} 기준 수주 데이터가 없습니다. 프로젝트 관리에서 계약금액과 시작일을 확인해 주세요.`,
    };
  }

  const totalCount = filtered.length;
  const totalAmount = filtered.reduce((sum, p) => sum + (p.contractAmount ?? 0), 0);
  const summary = `${year}년 ${halfLabel} · 수주 ${totalCount}건 · 합계 ${formatAmount(totalAmount)}`;
  const title = `${year}년_${halfLabel}_사업부별_수주현황`;

  return {
    text: `${summary}${divisionFilter ? ` (${divisionFilter})` : ''} 리스트를 정리했습니다. 아래에서 엑셀(CSV) 또는 워드 보고서로 내려받을 수 있습니다.`,
    table,
    exports: buildExports('order-status', title, table, summary),
  };
}

function divisionOrderTrend(ctx: AnalyticsChatContext, query: string): ChatbotResponse {
  const divisionFilter = resolveDivisionFilter(query) ?? '전사';
  const { from, to } = parseYearRange(query);

  const table: ExportTable = {
    headers: ['연도', '사업본부', '수주 건수', '수주 금액', '전년 대비 건수', '전년 대비 금액'],
    rows: [],
  };

  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const divisions =
    divisionFilter === '전사'
      ? [...new Set(ctx.projects.map((p) => p.divisionName))]
      : [divisionFilter];

  for (const year of years) {
    for (const divisionName of divisions) {
      const projects = ctx.projects.filter(
        (p) =>
          p.divisionName === divisionName &&
          isOrderProject(p) &&
          projectInPeriod(p, year, 'all'),
      );
      const prevProjects = ctx.projects.filter(
        (p) =>
          p.divisionName === divisionName &&
          isOrderProject(p) &&
          projectInPeriod(p, year - 1, 'all'),
      );
      const amount = projects.reduce((sum, p) => sum + (p.contractAmount ?? 0), 0);
      const prevAmount = prevProjects.reduce((sum, p) => sum + (p.contractAmount ?? 0), 0);
      table.rows.push([
        String(year),
        divisionName,
        String(projects.length),
        formatAmount(amount),
        `${projects.length - prevProjects.length >= 0 ? '+' : ''}${projects.length - prevProjects.length}`,
        `${amount - prevAmount >= 0 ? '+' : ''}${formatAmount(Math.abs(amount - prevAmount))}`,
      ]);
    }
  }

  if (table.rows.every((row) => row[2] === '0')) {
    return {
      text: `${from}~${to}년 ${divisionFilter} 수주 추이 데이터가 없습니다.`,
    };
  }

  const summary = `${from}~${to}년 ${divisionFilter} 수주 추이`;
  const title = `${from}-${to}_${divisionFilter.replace(/사업본부/g, '')}_수주추이`;

  return {
    text: `${summary} 보고서 초안을 작성했습니다. 연도별 수주 건수·금액과 전년 대비 변화를 포함합니다.`,
    table,
    exports: buildExports('order-trend', title, table, summary),
  };
}

function contractChangeSummary(ctx: AnalyticsChatContext, query: string): ChatbotResponse {
  const divisionFilter = resolveDivisionFilter(query);
  const table: ExportTable = {
    headers: ['프로젝트명', '코드', '사업본부', '변경 차수', '계약금액', '시작일', '종료일', '등록일'],
    rows: [],
  };

  for (const project of ctx.projects) {
    if (divisionFilter && project.divisionName !== divisionFilter) continue;
    const amendments = getAmendmentsForProject(ctx.contractAmendments, project.id);
    if (amendments.length === 0) continue;
    for (const amendment of amendments) {
      table.rows.push([
        project.name,
        project.projectCode ?? '-',
        project.divisionName,
        `변경 ${amendment.sequence}차`,
        formatAmount(amendment.contractAmount),
        formatIsoToKoreanDate(amendment.startDate),
        amendment.endDate ? formatIsoToKoreanDate(amendment.endDate) : '-',
        formatIsoToKoreanDate(amendment.registeredAt.slice(0, 10)),
      ]);
    }
  }

  if (table.rows.length === 0) {
    return { text: '조건에 맞는 계약변경 이력이 없습니다.' };
  }

  const summary = `계약변경 이력 ${table.rows.length}건`;
  return {
    text: `${summary}을 조회했습니다. 엑셀·워드로 내려받을 수 있습니다.`,
    table,
    exports: buildExports('contract-change', '계약변경_이력', table, summary),
  };
}

function projectOverview(ctx: AnalyticsChatContext): ChatbotResponse {
  const table: ExportTable = {
    headers: ['프로젝트명', '코드', '사업본부', '팀', '상태', '발주처', '계약금액', '시작일', '종료일'],
    rows: ctx.projects.map((project) => [
      project.name,
      project.projectCode ?? '-',
      project.divisionName,
      project.teamName,
      project.status,
      project.clientName ?? '-',
      formatAmount(project.contractAmount),
      formatIsoToKoreanDate(project.startDate),
      project.endDate ? formatIsoToKoreanDate(project.endDate) : '-',
    ]),
  };

  const summary = `전체 프로젝트 ${ctx.projects.length}건`;
  return {
    text: `${summary} 현황입니다. 역할별 데이터 범위가 적용된 결과입니다.`,
    table,
    exports: buildExports('project-overview', '프로젝트_현황', table, summary),
  };
}

function helpResponse(): ChatbotResponse {
  return {
    text: `프로젝트·조직·계약변경·인력배분 데이터를 바탕으로 분석합니다. 예시:
· "지금 등록된 프로젝트 인사이트 보고서 작성해줘"
· "올해 상반기 사업부별 수주 현황 리스트 뽑아줘"
· "최근 3년간 인테리어 사업부 수주 추이 보고서 작성해줘"
· "계약변경 이력 정리해줘"

인사이트 보고서는 기간·사업본부·단계·금액 구간 분석과 권고를 포함합니다.`,
  };
}

function isInsightReportQuery(query: string): boolean {
  if (/인사이트|종합\s*분석|심층\s*분석|insight/i.test(query)) return true;
  if (/보고서|분석/.test(query) && /프로젝트|등록|현재|전체|지금/.test(query)) {
    if (/수주\s*추이|년\s*간|연도별|트렌드/.test(query) && !/인사이트/.test(query)) return false;
    return true;
  }
  return false;
}

function isListOnlyQuery(query: string): boolean {
  return /리스트|목록|나열|뽑아/.test(query) && !/인사이트|보고서/.test(query);
}

export function askAnalyticsChatbot(query: string, ctx: AnalyticsChatContext): ChatbotResponse {
  const normalized = query.trim();
  if (!normalized) return helpResponse();

  if (isInsightReportQuery(normalized)) {
    return buildProjectInsightReport(ctx);
  }

  if (/계약\s*변경|변경\s*\d+\s*차|amendment/i.test(normalized)) {
    return contractChangeSummary(ctx, normalized);
  }

  if (/추이|트렌드|연도별|년간|년\s*간/.test(normalized) && /수주|계약|매출/.test(normalized)) {
    return divisionOrderTrend(ctx, normalized);
  }

  if (/수주|계약\s*금액|수주\s*현황/.test(normalized) && isListOnlyQuery(normalized)) {
    return divisionOrderStatus(ctx, normalized);
  }

  if (/수주|계약\s*금액|수주\s*현황/.test(normalized)) {
    return buildProjectInsightReport(ctx);
  }

  if (/프로젝트\s*(전체|현황|목록|리스트)|전체\s*프로젝트/.test(normalized) && isListOnlyQuery(normalized)) {
    return projectOverview(ctx);
  }

  if (/프로젝트\s*(전체|현황)|전체\s*프로젝트|등록/.test(normalized)) {
    return buildProjectInsightReport(ctx);
  }

  if (/인력|배분|기여/.test(normalized)) {
    const activeProjects = ctx.projects.length;
    const allocated = ctx.allocations.filter((a) =>
      ctx.projects.some((p) => p.id === a.projectId),
    ).length;
    return {
      text: `인력 배분 데이터 기준: 조회 가능 프로젝트 ${activeProjects}건, 배분 설정 프로젝트 ${allocated}건입니다. "올해 상반기 사업부별 수주 현황"처럼 구체적으로 요청해 주시면 표와 보고서를 생성합니다.`,
    };
  }

  if (/안녕|도움|help|뭐\s*할\s*수/.test(normalized)) {
    return helpResponse();
  }

  return buildProjectInsightReport(ctx);
}

export function getProjectStatsSummary(ctx: AnalyticsChatContext): string {
  const orderCount = ctx.projects.filter(isOrderProject).length;
  const totalAmount = ctx.projects.reduce((sum, p) => sum + (p.contractAmount ?? 0), 0);
  const categories = new Set(
    ctx.projects
      .map((p) => parseProjectCode(p.projectCode ?? '')?.businessCategory)
      .filter(Boolean),
  );
  return `프로젝트 ${ctx.projects.length}건 · 수주(계약) ${orderCount}건 · 계약합계 ${formatAmount(totalAmount)} · 사업분류 ${categories.size}종`;
}
