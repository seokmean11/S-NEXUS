import { sendClaudeMessage, isClaudeQuotaError, type ClaudeChatTurn, type ClaudeMessageResult } from '@/services/claudeAnalysis';
import {
  buildSystemInstruction,
  getAnalysisMaxTokensForIntent,
  type AnalysisDataPayload,
} from '@/utils/buildAnalysisDataPayload';
import {
  buildInterpretationSystemInstruction,
  type AnalysisInterpretationPayload,
} from '@/utils/buildAnalysisInterpretationPayload';
import type { AnalysisQueryIntent } from '@/utils/analysisQueryIntent';

export async function sendAnalysisMessage(params: {
  apiKey: string;
  turns: ClaudeChatTurn[];
  dataPayload: AnalysisDataPayload;
  timeoutMs?: number;
}): Promise<ClaudeMessageResult> {
  const { apiKey, turns, dataPayload, timeoutMs = 60_000 } = params;
  const intent = dataPayload.queryIntent as AnalysisQueryIntent;

  return sendClaudeMessage({
    apiKey,
    system: buildSystemInstruction(dataPayload),
    turns,
    maxTokens: getAnalysisMaxTokensForIntent(intent),
    timeoutMs,
  });
}

export async function sendInterpretationMessage(params: {
  apiKey: string;
  turns: ClaudeChatTurn[];
  payload: AnalysisInterpretationPayload;
  timeoutMs?: number;
}): Promise<ClaudeMessageResult> {
  const { apiKey, turns, payload, timeoutMs = 45_000 } = params;

  return sendClaudeMessage({
    apiKey,
    system: buildInterpretationSystemInstruction(payload),
    turns,
    maxTokens: 1536,
    timeoutMs,
  });
}

export { isClaudeQuotaError };
export type { ClaudeChatTurn };
