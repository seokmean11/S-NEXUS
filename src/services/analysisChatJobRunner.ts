import type { Role } from '@/types';
import type { AnalysisChatMessage } from '@/types/analysisChatSession';
import type { AnalysisIntegratedContext } from '@/types/analyticsChat';
import type { Team } from '@/types';
import type { ChatbotResponse } from '@/types/analyticsChat';
import {
  sendAnalysisMessage,
  sendInterpretationMessage,
} from '@/services/analysisClaudeAnalysis';
import {
  formatClaudeError,
  isClaudeQuotaError,
  isClaudeTimeoutError,
  type ClaudeChatTurn,
} from '@/services/claudeAnalysis';
import {
  getActiveThread,
  loadAnalysisChatRoleStore,
  saveAnalysisChatRoleStore,
  updateThreadById,
} from '@/utils/analysisChatStorage';
import {
  buildAnalysisDataPayload,
  type AnalysisDataPayloadMeta,
} from '@/utils/buildAnalysisDataPayload';
import { buildAnalysisInterpretationPayload } from '@/utils/buildAnalysisInterpretationPayload';
import { buildLocalAnalysisAggregate } from '@/utils/analysisLocalAggregate';
import { isCasualConversationQuery } from '@/utils/analysisQueryIntent';
import {
  getAnalysisRouteLabel,
  resolveAnalysisQueryRoute,
  type AnalysisQueryRoute,
} from '@/utils/analysisQueryRouter';
import { askAnalyticsChatbot } from '@/utils/analyticsChatbot';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { parseMarkdownTables, stripMarkdownTables } from '@/utils/markdownTableParser';
import { recordClaudeUsage, type ClaudeUsageSnapshot } from '@/utils/claudeUsage';
import type { ExportTable } from '@/utils/reportExport';

export interface AnalysisBackgroundJob {
  roleId: Role;
  threadId: string;
  startedAt: number;
  previewMessageId: string | null;
  effectiveQuery: string;
  route: AnalysisQueryRoute;
}

export interface RunAnalysisJobParams {
  job: AnalysisBackgroundJob;
  apiKey: string;
  turns: ClaudeChatTurn[];
  chatContext: AnalysisIntegratedContext;
  meta: AnalysisDataPayloadMeta;
  teams: Team[];
  localOrgResponse: ChatbotResponse | null;
}

export interface AnalysisJobResult {
  usage: ClaudeUsageSnapshot | null;
}

function createMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function shouldMarkExportable(query: string): boolean {
  return !isCasualConversationQuery(query);
}

function collectChatbotTables(response: ChatbotResponse): ExportTable[] | undefined {
  const sectionTables = response.sections
    ?.map((section) => section.table)
    .filter(Boolean) as ExportTable[] | undefined;
  const tables = response.table ? [response.table, ...(sectionTables ?? [])] : sectionTables;
  if (!tables || tables.length === 0) return undefined;

  return tables.filter(
    (table, index, array) =>
      array.findIndex((candidate) => candidate.headers.join('|') === table.headers.join('|')) ===
      index,
  );
}

function persistThreadMessages(
  roleId: Role,
  threadId: string,
  updater: (messages: AnalysisChatMessage[]) => AnalysisChatMessage[],
  patch?: { lastQuery?: string },
): void {
  const store = loadAnalysisChatRoleStore(roleId);
  if (!store) return;

  const resolvedThread =
    store.threads.find((item) => item.id === threadId) ?? getActiveThread(store);
  if (!resolvedThread) return;

  const next = updateThreadById(store, resolvedThread.id, {
    messages: updater(resolvedThread.messages),
    lastQuery: patch?.lastQuery,
  });
  saveAnalysisChatRoleStore(next);
}

function applyLocalResponse(
  params: RunAnalysisJobParams,
  localResponse: ChatbotResponse,
  suffix = '',
): AnalysisJobResult {
  persistThreadMessages(
    params.job.roleId,
    params.job.threadId,
    (messages) => {
      const nextText = suffix ? `${localResponse.text}${suffix}` : localResponse.text;
      const nextTables = collectChatbotTables(localResponse);

      if (params.job.previewMessageId) {
        return messages.map((message) =>
          message.id === params.job.previewMessageId
            ? {
                ...message,
                text: nextText,
                tables: nextTables,
                error: false,
                exportable: shouldMarkExportable(params.job.effectiveQuery),
              }
            : message,
        );
      }

      return [
        ...messages,
        {
          id: createMessageId(),
          role: 'assistant' as const,
          text: nextText,
          tables: nextTables,
          exportable: shouldMarkExportable(params.job.effectiveQuery),
        },
      ];
    },
    { lastQuery: params.job.effectiveQuery },
  );

  return { usage: null };
}

function applyLocalFallback(
  params: RunAnalysisJobParams,
  note: string,
): AnalysisJobResult {
  const localResponse =
    params.localOrgResponse ??
    buildLocalAnalysisAggregate(params.job.effectiveQuery, params.chatContext) ??
    askAnalyticsChatbot(params.job.effectiveQuery, {
      ...params.chatContext,
      projects: filterProjectsByQuery(params.chatContext.projects, params.job.effectiveQuery)
        .projects,
    });

  return applyLocalResponse(params, localResponse, note);
}

function persistClaudeAssistantMessage(
  params: RunAnalysisJobParams,
  text: string,
): void {
  const tables = parseMarkdownTables(text);
  const displayText = tables.length > 0 ? stripMarkdownTables(text) : text;
  const assistantMessage: AnalysisChatMessage = {
    id: createMessageId(),
    role: 'assistant',
    text: displayText,
    tables: tables.length > 0 ? tables : undefined,
    exportable: shouldMarkExportable(params.job.effectiveQuery),
  };

  persistThreadMessages(
    params.job.roleId,
    params.job.threadId,
    (messages) => {
      const base = params.job.previewMessageId
        ? messages.filter((message) => message.id !== params.job.previewMessageId)
        : messages;
      return [...base, assistantMessage];
    },
    { lastQuery: params.job.effectiveQuery },
  );
}

async function runInterpretationJob(params: RunAnalysisJobParams): Promise<AnalysisJobResult> {
  const localAggregate =
    buildLocalAnalysisAggregate(params.job.effectiveQuery, params.chatContext) ??
    params.localOrgResponse;

  if (localAggregate) {
    const interpretationPayload = buildAnalysisInterpretationPayload(
      params.chatContext,
      params.meta,
      params.teams,
      params.job.effectiveQuery,
      localAggregate,
    );

    const result = await sendInterpretationMessage({
      apiKey: params.apiKey,
      turns: params.turns,
      payload: interpretationPayload,
    });

    const usage = recordClaudeUsage(result.usage);
    persistClaudeAssistantMessage(params, result.text);
    return { usage };
  }

  const dataPayload = buildAnalysisDataPayload(
    params.chatContext,
    params.meta,
    params.teams,
    params.job.effectiveQuery,
  );
  const result = await sendAnalysisMessage({
    apiKey: params.apiKey,
    turns: params.turns,
    dataPayload,
  });

  const usage = recordClaudeUsage(result.usage);
  persistClaudeAssistantMessage(params, result.text);
  return { usage };
}

export function createAnalysisBackgroundJob(params: {
  roleId: Role;
  threadId: string;
  effectiveQuery: string;
  previewMessageId: string | null;
  hasMultiTurnContext: boolean;
}): AnalysisBackgroundJob {
  return {
    roleId: params.roleId,
    threadId: params.threadId,
    startedAt: Date.now(),
    previewMessageId: params.previewMessageId,
    effectiveQuery: params.effectiveQuery,
    route: resolveAnalysisQueryRoute(params.effectiveQuery, {
      hasMultiTurnContext: params.hasMultiTurnContext,
    }),
  };
}

export async function runAnalysisJob(params: RunAnalysisJobParams): Promise<AnalysisJobResult> {
  if (params.job.route === 'local') {
    const localAggregate = buildLocalAnalysisAggregate(
      params.job.effectiveQuery,
      params.chatContext,
    );

    if (localAggregate) {
      return applyLocalResponse(params, localAggregate);
    }
  }

  if (!params.apiKey) {
    return applyLocalResponse(
      params,
      {
        text: `${getAnalysisRouteLabel(params.job.route)}에는 Claude API 키가 필요합니다. 상단 "API 설정"에서 키를 입력해 주세요.`,
      },
      '',
    );
  }

  try {
    if (params.job.route === 'interpret') {
      return await runInterpretationJob(params);
    }

    const dataPayload = buildAnalysisDataPayload(
      params.chatContext,
      params.meta,
      params.teams,
      params.job.effectiveQuery,
    );
    const result = await sendAnalysisMessage({
      apiKey: params.apiKey,
      turns: params.turns,
      dataPayload,
    });

    const usage = recordClaudeUsage(result.usage);
    persistClaudeAssistantMessage(params, result.text);
    return { usage };
  } catch (error) {
    if (isClaudeQuotaError(error) || isClaudeTimeoutError(error)) {
      const fallbackNote = isClaudeTimeoutError(error)
        ? '\n\n---\nClaude **응답 시간 초과**로 로컬 분석 결과를 표시합니다. 범위를 좁히거나 잠시 후 다시 시도해 주세요.'
        : '\n\n---\nClaude **사용 한도**로 AI 분석을 사용할 수 없어, **로컬 분석** 결과입니다. 잠시 후 다시 시도하거나 Anthropic Console에서 한도를 확인해 주세요.';
      return applyLocalFallback(params, fallbackNote);
    }

    if (params.job.previewMessageId) {
      persistThreadMessages(params.job.roleId, params.job.threadId, (messages) =>
        messages.filter((message) => message.id !== params.job.previewMessageId),
      );
    }

    const errorText = formatClaudeError(error);
    if (/429|RPM|too many requests/i.test(errorText)) {
      window.dispatchEvent(new CustomEvent('analysis-chat-rate-limited'));
    }

    persistThreadMessages(params.job.roleId, params.job.threadId, (messages) => [
      ...messages,
      {
        id: createMessageId(),
        role: 'assistant',
        text: formatClaudeError(error),
        error: true,
      },
    ]);

    return { usage: null };
  }
}

export { getAnalysisRouteLabel, resolveAnalysisQueryRoute };
