import type { AnalyticsChatContext, ChatbotResponse, ReportSection } from '@/types/analyticsChat';
import type { ExportTable } from '@/utils/reportExport';
import { buildPersonnelRows } from '@/utils/personnelSearch';

function divisionVacancies(ctx: AnalyticsChatContext): string[] {
  const notes: string[] = [];
  for (const division of ctx.divisions) {
    if (!division.headName?.trim()) {
      notes.push(`${division.name}: 본부장 공석`);
    }
  }
  for (const team of ctx.teams) {
    if (!team.headName?.trim()) {
      const division = ctx.divisions.find((item) => item.id === team.divisionId);
      notes.push(`${division?.name ?? '-'} · ${team.name}: 팀장 공석`);
    }
  }
  return notes;
}

function buildDivisionTable(ctx: AnalyticsChatContext): ExportTable {
  const teamCountByDivision = new Map<string, number>();
  const employeeCountByDivision = new Map<string, number>();

  for (const team of ctx.teams) {
    teamCountByDivision.set(team.divisionId, (teamCountByDivision.get(team.divisionId) ?? 0) + 1);
  }
  for (const employee of ctx.employees) {
    employeeCountByDivision.set(
      employee.divisionId,
      (employeeCountByDivision.get(employee.divisionId) ?? 0) + 1,
    );
  }

  return {
    headers: ['사업본부', '본부장', '본부장 직급', '팀 수', '팀원 수'],
    rows: ctx.divisions.map((division) => [
      division.name,
      division.headName ?? '-',
      division.headRank ?? '-',
      String(teamCountByDivision.get(division.id) ?? 0),
      String(employeeCountByDivision.get(division.id) ?? 0),
    ]),
  };
}

function buildTeamTable(ctx: AnalyticsChatContext): ExportTable {
  const divisionNameById = new Map(ctx.divisions.map((division) => [division.id, division.name]));
  const employeeCountByTeam = new Map<string, number>();
  for (const employee of ctx.employees) {
    employeeCountByTeam.set(employee.teamId, (employeeCountByTeam.get(employee.teamId) ?? 0) + 1);
  }

  return {
    headers: ['사업본부', '팀', '팀장', '팀장 직급', '팀원 수'],
    rows: ctx.teams.map((team) => [
      divisionNameById.get(team.divisionId) ?? '-',
      team.name,
      team.headName ?? '-',
      team.headRank ?? '-',
      String(employeeCountByTeam.get(team.id) ?? 0),
    ]),
  };
}

function buildRecentOrgChangesTable(ctx: AnalyticsChatContext): ExportTable {
  const rows = ctx.historyEvents
    .filter((event) => event.category === 'organization' || event.category === 'executive')
    .slice(-15)
    .reverse()
    .map((event) => [
      event.occurredAt.slice(0, 10),
      event.action,
      event.entityName ?? '-',
      event.summary,
    ]);

  return {
    headers: ['일자', '구분', '대상', '내용'],
    rows: rows.length > 0 ? rows : [['-', '-', '-', '최근 조직 변경 이력 없음']],
  };
}

export function buildOrgInsightReport(ctx: AnalyticsChatContext): ChatbotResponse {
  const today = new Date().toISOString().slice(0, 10);
  const executives = ctx.executiveOffice?.admins ?? [];
  const personnelRows = buildPersonnelRows(
    executives,
    ctx.employees,
    ctx.divisions,
    ctx.teams,
  );
  const vacancies = divisionVacancies(ctx);

  const bullets = [
    `경영진 ${executives.length}명 · 사업본부 ${ctx.divisions.length}개 · 팀 ${ctx.teams.length}개 · 등록 인원 ${personnelRows.length}명`,
    vacancies.length > 0
      ? `공석/미배정: ${vacancies.slice(0, 5).join(', ')}${vacancies.length > 5 ? ' 외' : ''}`
      : '본부장·팀장 공석 없음',
    `최근 조직 변경 ${ctx.historyEvents.filter((event) => event.category === 'organization' || event.category === 'executive').length}건 기록`,
  ];

  const divisionTable = buildDivisionTable(ctx);
  const teamTable = buildTeamTable(ctx);
  const historyTable = buildRecentOrgChangesTable(ctx);

  const sections: ReportSection[] = [
    {
      title: '사업본부 현황',
      narrative: '본부별 본부장·팀·팀원 규모입니다.',
      table: divisionTable,
    },
    {
      title: '팀 현황',
      narrative: '팀별 팀장 및 소속 팀원 수입니다.',
      table: teamTable,
    },
    {
      title: '최근 조직 변경',
      narrative: '조직관리에서 기록된 최근 변경 이력입니다.',
      table: historyTable,
    },
  ];

  const recommendations =
    vacancies.length > 0
      ? `• 공석 ${vacancies.length}건: 조직관리 → 인원검색에서 본부장/팀장 등록 검토\n• 인원 배분·전출은 팀원 탭에서 관리`
      : '• 조직 규모 대비 팀원 배분·기여도 데이터를 분기별로 점검하세요.';

  const text = [
    `【조직·인원 인사이트】`,
    `기준일: ${today}`,
    '',
    '■ 핵심 요약',
    ...bullets.map((item) => `• ${item}`),
    '',
    '■ 권고',
    recommendations,
  ].join('\n');

  return {
    text,
    sections,
    table: divisionTable,
  };
}
