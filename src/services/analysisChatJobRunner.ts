import type { Role } from '@/types';
import type { AnalysisChatMessage } from '@/types/analysisChatSession';
import type { AnalysisIntegratedContext } from '@/types/analyticsChat';
import type { Team } from '@/types';
import { sendAnalysisMessage } from '@/services/analysisClaudeAnalysis';
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
import { isOrganizationAnalysisQuery } from '@/utils/analysisQueryIntent';
import { askAnalyticsChatbot } from '@/utils/analyticsChatbot';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { buildOrgInsightReport } from '@/utils/orgInsightReport';
import { parseMarkdownTables, stripMarkdownTables } from '@/utils/markdownTableParser';
import { recordClaudeUsage, type ClaudeUsageSnapshot } from '@/utils/claudeUsage';
import type { ExportTable } from '@/utils/reportExport';
import type { ChatbotResponse } from '@/types/analyticsChat';

export interface AnalysisBackgroundJob {
  roleId: Role;
  threadId: string;
  startedAt: number;
  previewMessageId: string | null;
  effectiveQuery: string;
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

function applyLocalFallback(
  params: RunAnalysisJobParams,
  note: string,
): AnalysisJobResult {
  const localResponse =
    params.localOrgResponse ??
    (isOrganizationAnalysisQuery(params.job.effectiveQuery)
      ? buildOrgInsightReport(params.chatContext)
      : askAnalyticsChatbot(params.job.effectiveQuery, {
          ...params.chatContext,
          projects: filterProjectsByQuery(params.chatContext.projects, params.job.effectiveQuery)
            .projects,
        }));

  persistThreadMessages(params.job.roleId, params.job.threadId, (messages) => {
    const nextText = `${localResponse.text}${note}`;
    const nextTables = collectChatbotTables(localResponse);

    if (params.job.previewMessageId) {
      return messages.map((message) =>
        message.id === params.job.previewMessageId
          ? { ...message, text: nextText, tables: nextTables, error: false }
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
      },
    ];
  }, { lastQuery: params.job.effectiveQuery });

  return { usage: null };
}

export async function runAnalysisJob(params: RunAnalysisJobParams): Promise<AnalysisJobResult> {
  const dataPayload = buildAnalysisDataPayload(
    params.chatContext,
    params.meta,
    params.teams,
    params.job.effectiveQuery,
  );

  try {
    const result = await sendAnalysisMessage({
      apiKey: params.apiKey,
      turns: params.turns,
      dataPayload,
    });

    const usage = recordClaudeUsage(result.usage);
    const tables = parseMarkdownTables(result.text);
    const displayText = tables.length > 0 ? stripMarkdownTables(result.text) : result.text;
    const assistantMessage: AnalysisChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      text: displayText,
      tables: tables.length > 0 ? tables : undefined,
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
