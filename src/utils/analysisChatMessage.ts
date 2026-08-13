import type { AnalysisChatMessage } from '@/types/analysisChatSession';
import type { ChatbotResponse } from '@/types/analyticsChat';
import { isCasualConversationQuery } from '@/utils/analysisQueryIntent';
import type { ExportTable } from '@/utils/reportExport';

function createMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function collectChatbotTables(response: ChatbotResponse): ExportTable[] | undefined {
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

export function buildAssistantMessageFromChatbotResponse(
  query: string,
  response: ChatbotResponse,
  options?: { id?: string; suffix?: string },
): AnalysisChatMessage {
  const text = options?.suffix ? `${response.text}${options.suffix}` : response.text;
  return {
    id: options?.id ?? createMessageId(),
    role: 'assistant',
    text,
    tables: collectChatbotTables(response),
    exportable: !isCasualConversationQuery(query),
  };
}
