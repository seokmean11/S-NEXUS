import { formatCurrency } from '@/data/mockData';
import type { Project, ProjectStatus } from '@/types';
import type { AnalyticsChatContext, ChatbotResponse, ChatExportAction, ReportSection } from '@/types/analyticsChat';
import type { ExportTable } from '@/utils/reportExport';
import { formatIsoToKoreanDate } from '@/utils/formatInput';
import { getAmendmentsForProject } from '@/utils/contractChange';

const AMOUNT_TIERS: { label: string; min: number; max: number | null }[] = [
  { label: '100억 이상', min: 10_000_000_000, max: null },
  { label: '50억~100억', min: 5_000_000_000, max: 10_000_000_000 },
  { label: '10억~50억', min: 1_000_000_000, max: 5_000_000_000 },
  { label: '1억~10억', min: 100_000_000, max: 1_000_000_000 },
  { label: '1억 미만', min: 1, max: 100_000_000 },
  { label: '계약금액 미등록', min: 0, max: 0 },
];

const PHASE_GROUPS: { label: string; statuses: ProjectStatus[] }[] = [
  { label: '공모', statuses: ['공모'] },
  { label: '설계', statuses: ['설계'] },
  { label: '제작', statuses: ['제작'] },
  { label: '수주·실행·완료', statuses: ['수주', '실행', '완료'] },
];

function formatAmount(value: number): string {
  if (value <= 0) return '-';
  return `${formatCurrency(value)}원`;
}

function formatShare(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

function projectYear(project: Project): number {
  const basis = project.startDate || project.createdAt;
  return new Date(basis).getFullYear();
}

function projectHalf(project: Project): '상반기' | '하반기' {
  const basis = project.startDate || project.createdAt;
  return new Date(basis).getMonth() + 1 <= 6 ? '상반기' : '하반기';
}

function orderAmount(project: Project): number {
  return project.contractAmount ?? 0;
}

function isOrderProject(project: Project): boolean {
  return orderAmount(project) > 0;
}

function amountTier(amount: number): string {
  if (amount <= 0) return '계약금액 미등록';
  for (const tier of AMOUNT_TIERS) {
    if (tier.max === null && amount >= tier.min) return tier.label;
    if (tier.max != null && tier.min <= amount && amount < tier.max) return tier.label;
  }
  return '1억 미만';
}

function topEntry<T extends string>(
  map: Map<T, { count: number; amount: number }>,
): [T, { count: number; amount: number }] | null {
  const entries = [...map.entries()];
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1].amount - a[1].amount)[0];
}

function buildInsightBullets(ctx: AnalyticsChatContext, projects: Project[]): string[] {
  const bullets: string[] = [];
  const orderProjects = projects.filter(isOrderProject);
  const totalAmount = orderProjects.reduce((sum, p) => sum + orderAmount(p), 0);
  const noContract = projects.length - orderProjects.length;

  const byDivision = new Map<string, { count: number; amount: number }>();
  for (const p of orderProjects) {
    const bucket = byDivision.get(p.divisionName) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += orderAmount(p);
    byDivision.set(p.divisionName, bucket);
  }
  const topDivision = topEntry(byDivision);
  if (topDivision) {
    bullets.push(
      `${topDivision[0]}이(가) 수주 금액 ${formatAmount(topDivision[1].amount)}(${formatShare(topDivision[1].amount, totalAmount)})으로 1위입니다.`,
    );
  }

  const byPhase = new Map<string, { count: number; amount: number }>();
  for (const group of PHASE_GROUPS) {
    const matched = projects.filter((p) => group.statuses.includes(p.status));
    byPhase.set(group.label, {
      count: matched.length,
      amount: matched.reduce((sum, p) => sum + orderAmount(p), 0),
    });
  }
  const gongmo = byPhase.get('공모');
  const jejak = byPhase.get('제작');
  if (gongmo && gongmo.count > 0) {
    bullets.push(
      `공모 단계 ${gongmo.count}건(계약 ${formatAmount(gongmo.amount)})으로 초기 파이프라인이 형성되어 있습니다.`,
    );
  }
  if (jejak && jejak.count > 0) {
    bullets.push(
      `제작 단계 ${jejak.count}건(계약 ${formatAmount(jejak.amount)})이 실행 매출로 연결될 핵심 구간입니다.`,
    );
  }

  const largeProjects = orderProjects.filter((p) => orderAmount(p) >= 5_000_000_000);
  if (largeProjects.length > 0) {
    const largeAmount = largeProjects.reduce((sum, p) => sum + orderAmount(p), 0);
    bullets.push(
      `50억 이상 대형 프로젝트 ${largeProjects.length}건이 전체 수주의 ${formatShare(largeAmount, totalAmount)}를 차지합니다.`,
    );
  }

  if (noContract > 0) {
    bullets.push(
      `계약금액 미등록 ${noContract}건은 수주 전환·실적 반영을 위해 등록·추적이 필요합니다.`,
    );
  }

  const amendmentCount = projects.reduce(
    (sum, p) => sum + getAmendmentsForProject(ctx.contractAmendments, p.id).length,
    0,
  );
  if (amendmentCount > 0) {
    bullets.push(`계약변경 ${amendmentCount}건이 발생했으며, 증액·기간변경 리스크를 모니터링해야 합니다.`);
  }

  const years = [...new Set(projects.map(projectYear))].sort();
  if (years.length >= 2) {
    const latest = years[years.length - 1];
    const prev = years[years.length - 2];
    const latestAmount = orderProjects
      .filter((p) => projectYear(p) === latest)
      .reduce((sum, p) => sum + orderAmount(p), 0);
    const prevAmount = orderProjects
      .filter((p) => projectYear(p) === prev)
      .reduce((sum, p) => sum + orderAmount(p), 0);
    const delta = latestAmount - prevAmount;
    bullets.push(
      `${prev}년 대비 ${latest}년 수주 금액이 ${delta >= 0 ? '+' : ''}${formatAmount(Math.abs(delta))} ${delta >= 0 ? '증가' : '감소'}했습니다.`,
    );
  }

  return bullets.slice(0, 6);
}

function sectionPeriodAnalysis(projects: Project[]): ReportSection {
  const orderProjects = projects.filter(isOrderProject);
  const years = [...new Set(projects.map(projectYear))].sort();

  const table: ExportTable = {
    headers: ['연도', '구분', '프로젝트 수', '수주 건수', '수주 금액', '평균 계약금액'],
    rows: [],
  };

  for (const year of years) {
    const yearProjects = projects.filter((p) => projectYear(p) === year);
    const yearOrders = orderProjects.filter((p) => projectYear(p) === year);
    const amount = yearOrders.reduce((sum, p) => sum + orderAmount(p), 0);
    table.rows.push([
      String(year),
      '연간',
      String(yearProjects.length),
      String(yearOrders.length),
      formatAmount(amount),
      yearOrders.length > 0 ? formatAmount(Math.round(amount / yearOrders.length)) : '-',
    ]);

    for (const half of ['상반기', '하반기'] as const) {
      const halfProjects = yearProjects.filter((p) => projectHalf(p) === half);
      const halfOrders = halfProjects.filter(isOrderProject);
      const halfAmount = halfOrders.reduce((sum, p) => sum + orderAmount(p), 0);
      table.rows.push([
        String(year),
        half,
        String(halfProjects.length),
        String(halfOrders.length),
        formatAmount(halfAmount),
        halfOrders.length > 0 ? formatAmount(Math.round(halfAmount / halfOrders.length)) : '-',
      ]);
    }
  }

  const currentYear = new Date().getFullYear();
  const thisYearOrders = orderProjects.filter((p) => projectYear(p) === currentYear);
  const firstHalf = thisYearOrders.filter((p) => projectHalf(p) === '상반기');
  const secondHalf = thisYearOrders.filter((p) => projectHalf(p) === '하반기');

  return {
    title: '1. 기간별 수주 분석',
    narrative: `등록 프로젝트 ${projects.length}건을 연도·반기 기준으로 집계했습니다. ${currentYear}년 상반기 수주 ${firstHalf.length}건(${formatAmount(firstHalf.reduce((s, p) => s + orderAmount(p), 0))}), 하반기 ${secondHalf.length}건(${formatAmount(secondHalf.reduce((s, p) => s + orderAmount(p), 0))})입니다.`,
    table,
  };
}

function sectionDivisionAnalysis(projects: Project[]): ReportSection {
  const orderProjects = projects.filter(isOrderProject);
  const totalAmount = orderProjects.reduce((sum, p) => sum + orderAmount(p), 0);

  const table: ExportTable = {
    headers: ['사업본부', '전체 PJT', '수주 건수', '수주 금액', '금액 비중', '평균 계약금액', '대표 프로젝트'],
    rows: [],
  };

  const divisions = [...new Set(projects.map((p) => p.divisionName))].sort();
  for (const divisionName of divisions) {
    const divProjects = projects.filter((p) => p.divisionName === divisionName);
    const divOrders = divProjects.filter(isOrderProject);
    const amount = divOrders.reduce((sum, p) => sum + orderAmount(p), 0);
    const top = [...divOrders].sort((a, b) => orderAmount(b) - orderAmount(a))[0];
    table.rows.push([
      divisionName,
      String(divProjects.length),
      String(divOrders.length),
      formatAmount(amount),
      formatShare(amount, totalAmount),
      divOrders.length > 0 ? formatAmount(Math.round(amount / divOrders.length)) : '-',
      top?.name ?? '-',
    ]);
  }

  const top = topEntry(
    divisions.reduce((map, name) => {
      const amount = orderProjects
        .filter((p) => p.divisionName === name)
        .reduce((sum, p) => sum + orderAmount(p), 0);
      map.set(name, { count: 0, amount });
      return map;
    }, new Map<string, { count: number; amount: number }>()),
  );

  return {
    title: '2. 사업본부별 수주 분석',
    narrative: top
      ? `사업본부별로 보면 ${top[0]}의 수주 금액 비중이 가장 높습니다. 본부 간 편차와 대표 프로젝트 집중도를 함께 확인하세요.`
      : '사업본부별 수주 데이터를 집계했습니다.',
    table,
  };
}

function sectionPhaseAnalysis(projects: Project[]): ReportSection {
  const totalAmount = projects.reduce((sum, p) => sum + orderAmount(p), 0);

  const table: ExportTable = {
    headers: ['단계 구분', '프로젝트 수', '비중', '수주(계약) 건수', '계약 금액', '금액 비중'],
    rows: [],
  };

  for (const group of PHASE_GROUPS) {
    const matched = projects.filter((p) => group.statuses.includes(p.status));
    const withContract = matched.filter(isOrderProject);
    const amount = withContract.reduce((sum, p) => sum + orderAmount(p), 0);
    table.rows.push([
      group.label,
      String(matched.length),
      formatShare(matched.length, projects.length),
      String(withContract.length),
      formatAmount(amount),
      formatShare(amount, totalAmount),
    ]);
  }

  const gongmo = projects.filter((p) => p.status === '공모').length;
  const design = projects.filter((p) => p.status === '설계').length;
  const production = projects.filter((p) => p.status === '제작').length;

  return {
    title: '3. 공모·설계·제작 단계별 분류',
    narrative: `공모 ${gongmo}건 · 설계 ${design}건 · 제작 ${production}건입니다. 공모는 미래 수주 후보, 설계·제작은 계약 전환율과 실행 매출의 핵심 지표입니다.`,
    table,
  };
}

function sectionAmountTierAnalysis(projects: Project[]): ReportSection {
  const orderProjects = projects.filter(isOrderProject);
  const totalAmount = orderProjects.reduce((sum, p) => sum + orderAmount(p), 0);

  const table: ExportTable = {
    headers: ['금액 구간', '프로젝트 수', '건수 비중', '수주 금액', '금액 비중', '해당 프로젝트'],
    rows: [],
  };

  for (const tier of AMOUNT_TIERS) {
    const matched =
      tier.label === '계약금액 미등록'
        ? projects.filter((p) => orderAmount(p) <= 0)
        : orderProjects.filter((p) => amountTier(orderAmount(p)) === tier.label);
    const amount = matched.reduce((sum, p) => sum + orderAmount(p), 0);
    const names = matched
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ');
    table.rows.push([
      tier.label,
      String(matched.length),
      formatShare(matched.length, projects.length),
      formatAmount(amount),
      formatShare(amount, totalAmount),
      names ? `${names}${matched.length > 3 ? ` 외 ${matched.length - 3}건` : ''}` : '-',
    ]);
  }

  const mega = orderProjects.filter((p) => orderAmount(p) >= 10_000_000_000);
  return {
    title: '4. 금액 구간별 수주 분석',
    narrative:
      mega.length > 0
        ? `100억 이상 초대형 ${mega.length}건이 포트폴리오 상단을 형성합니다. 금액 구간별 분포로 리스크 분산 여부를 점검하세요.`
        : '금액 구간별로 수주 포트폴리오를 분류했습니다. 중·소형과 미등록 계약의 비중도 함께 확인하세요.',
    table,
  };
}

function sectionRecommendations(bullets: string[]): ReportSection {
  const actions = [
    '계약금액 미등록 프로젝트는 수주 확정 즉시 금액·기간을 반영해 실적 왜곡을 방지합니다.',
    '사업본부별 상·하반기 수주 편차가 크면 분기별 목표·리소스 배분을 재조정합니다.',
    '공모→설계→제작 전환율을 분기별로 추적해 파이프라인 건전성을 관리합니다.',
    '대형 프로젝트 비중이 높을 경우 계약변경·집행원가 리스크를 별도 모니터링합니다.',
  ];

  return {
    title: '5. 종합 인사이트 & 권고',
    narrative: [...bullets.map((b) => `• ${b}`), '', '【권고 사항】', ...actions.map((a) => `• ${a}`)].join(
      '\n',
    ),
  };
}

function sectionAppendix(projects: Project[]): ReportSection {
  const table: ExportTable = {
    headers: ['프로젝트명', '코드', '사업본부', '단계', '발주처', '계약금액', '시작일'],
    rows: [...projects]
      .sort((a, b) => orderAmount(b) - orderAmount(a))
      .map((p) => [
        p.name,
        p.projectCode ?? '-',
        p.divisionName,
        p.status,
        p.clientName ?? '-',
        formatAmount(orderAmount(p)),
        formatIsoToKoreanDate(p.startDate),
      ]),
  };

  return {
    title: '부록. 프로젝트明细',
    narrative: '계약금액 기준 내림차순 정렬한 전체 프로젝트 목록입니다.',
    table,
  };
}

function buildCombinedExportTable(sections: ReportSection[]): ExportTable {
  const rows: string[][] = [];
  for (const section of sections) {
    rows.push([section.title, '', '']);
    rows.push(['[분석]', section.narrative.replace(/\n/g, ' '), '']);
    if (section.table) {
      rows.push(section.table.headers);
      rows.push(...section.table.rows);
    }
    rows.push(['', '', '']);
  }
  return {
    headers: ['구분', '내용', '비고'],
    rows,
  };
}

export function buildProjectInsightReport(ctx: AnalyticsChatContext): ChatbotResponse {
  const projects = ctx.projects;
  if (projects.length === 0) {
    return { text: '분석할 등록 프로젝트가 없습니다. 프로젝트 관리에서 데이터를 먼저 등록해 주세요.' };
  }

  const orderProjects = projects.filter(isOrderProject);
  const totalAmount = orderProjects.reduce((sum, p) => sum + orderAmount(p), 0);
  const bullets = buildInsightBullets(ctx, projects);

  const sections: ReportSection[] = [
    sectionPeriodAnalysis(projects),
    sectionDivisionAnalysis(projects),
    sectionPhaseAnalysis(projects),
    sectionAmountTierAnalysis(projects),
    sectionRecommendations(bullets),
    sectionAppendix(projects),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const title = `등록프로젝트_인사이트보고서_${today}`;
  const summary = `프로젝트 ${projects.length}건 · 수주 ${orderProjects.length}건 · 계약합계 ${formatAmount(totalAmount)}`;

  const executive = [
    `【등록 프로젝트 인사이트 보고서】`,
    `작성 기준일: ${formatIsoToKoreanDate(today)} · ${summary}`,
    '',
    '【핵심 요약】',
    ...bullets.map((b) => `• ${b}`),
    '',
    '아래 섹션별로 기간·사업본부·단계·금액 구간 분석과 권고 사항을 제공합니다.',
  ].join('\n');

  const exportTable = buildCombinedExportTable(sections);
  const exports: ChatExportAction[] = [
    {
      id: 'insight-csv',
      label: '엑셀(CSV) 다운로드',
      format: 'csv',
      filename: `${title}.csv`,
      title: '등록 프로젝트 인사이트 보고서',
      table: exportTable,
      summary,
    },
    {
      id: 'insight-word',
      label: '워드 보고서 다운로드',
      format: 'word',
      filename: `${title}.doc`,
      title: '등록 프로젝트 인사이트 보고서',
      table: exportTable,
      summary: executive,
      sections,
    },
  ];

  return {
    text: executive,
    sections,
    exports,
  };
}
