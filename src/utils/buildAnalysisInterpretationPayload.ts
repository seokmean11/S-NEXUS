import type { ChatbotResponse } from '@/types/analyticsChat';
import type { ExportTable } from '@/utils/reportExport';
import type { AnalysisDataPayloadMeta } from '@/utils/buildAnalysisDataPayload';
import {
  buildAnalysisDataPayload,
  type AnalysisDataPayload,
} from '@/utils/buildAnalysisDataPayload';
import type { AnalysisIntegratedContext } from '@/types/analyticsChat';
import type { Team } from '@/types';
import {
  detectAnalysisQueryIntent,
  resolveAnalysisDomainHints,
} from '@/utils/analysisQueryIntent';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';

const MAX_TABLE_ROWS = 25;

function compactTable(table: ExportTable | undefined): ExportTable | null {
  if (!table || table.rows.length === 0) return null;

  return {
    headers: table.headers,
    rows: table.rows.slice(0, MAX_TABLE_ROWS),
  };
}

function compactTables(response: ChatbotResponse): ExportTable[] {
  const tables: ExportTable[] = [];
  if (response.table) {
    const compact = compactTable(response.table);
    if (compact) tables.push(compact);
  }
  for (const section of response.sections ?? []) {
    const compact = compactTable(section.table);
    if (compact) tables.push(compact);
  }
  return tables;
}

export interface AnalysisInterpretationPayload {
  mode: 'interpretation';
  generatedAt: string;
  userQuery: string;
  queryIntent: ReturnType<typeof detectAnalysisQueryIntent>;
  domainHints: string[];
  viewer: { role: string; scope: string };
  dataScope: string;
  localAggregate: {
    summary: string;
    tables: ExportTable[];
    sectionTitles: string[];
  };
  supplementary: Pick<
    AnalysisDataPayload,
    'counts' | 'organization' | 'divisionSummary' | 'budget' | 'domains'
  >;
}

/** Claude에는 로컬 집계 결과 + 최소 보조 KPI만 전달 */
export function buildAnalysisInterpretationPayload(
  ctx: AnalysisIntegratedContext,
  meta: AnalysisDataPayloadMeta,
  teams: Team[],
  query: string,
  localAggregate: ChatbotResponse,
): AnalysisInterpretationPayload {
  const fullPayload = buildAnalysisDataPayload(ctx, meta, teams, query);
  const { scopeNote } = filterProjectsByQuery(ctx.projects, query);

  return {
    mode: 'interpretation',
    generatedAt: new Date().toISOString().slice(0, 10),
    userQuery: query.trim(),
    queryIntent: detectAnalysisQueryIntent(query),
    domainHints: resolveAnalysisDomainHints(query),
    viewer: { role: meta.roleLabel, scope: meta.scopeLabel },
    dataScope: scopeNote,
    localAggregate: {
      summary: localAggregate.text,
      tables: compactTables(localAggregate),
      sectionTitles: (localAggregate.sections ?? []).map((section) => section.title),
    },
    supplementary: {
      counts: fullPayload.counts,
      organization: fullPayload.organization,
      divisionSummary: fullPayload.divisionSummary,
      budget: fullPayload.budget,
      domains: fullPayload.domains,
    },
  };
}

export function buildInterpretationSystemInstruction(payload: AnalysisInterpretationPayload): string {
  return `S-NEXUS NEXUS AI — **해석 전용** 모드. 한국어.

로컬 시스템이 이미 필터·집계·표 작성을 완료했습니다. JSON의 localAggregate가 **확정 수치**입니다.
- 수치를 다시 계산하거나 창작하지 마세요.
- localAggregate.summary와 tables를 바탕으로 추세·이슈·권고를 **해석**하세요.
- supplementary는 맥락 참고용입니다. localAggregate와 충돌하면 localAggregate를 우선하세요.

출력: 【핵심 요약】 3~5 bullet → 【해석】 → 【권고】 (필요 시 표는 localAggregate 기준으로만 인용)

사용자 질문: "${payload.userQuery}"
조회 범위: ${payload.dataScope}

DATA:
${JSON.stringify(payload)}`;
}

export function estimateInterpretationPayloadChars(payload: AnalysisInterpretationPayload): number {
  return JSON.stringify(payload).length;
}

export function summarizeInterpretationPayload(payload: AnalysisInterpretationPayload): string {
  const kb = (estimateInterpretationPayloadChars(payload) / 1024).toFixed(1);
  const tableCount = payload.localAggregate.tables.length;
  return `해석 모드 · ${payload.dataScope} · 집계표 ${tableCount}개 · 약 ${kb}KB`;
}
