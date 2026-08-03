import { sendClaudeMessage, isClaudeQuotaError, type ClaudeChatTurn } from '@/services/claudeAnalysis';
import {
  buildSystemInstruction,
  type AnalysisDataPayload,
} from '@/utils/buildAnalysisDataPayload';

export async function sendAnalysisMessage(params: {
  apiKey: string;
  turns: ClaudeChatTurn[];
  dataPayload: AnalysisDataPayload;
}): Promise<string> {
  const { apiKey, turns, dataPayload } = params;

  return sendClaudeMessage({
    apiKey,
    system: buildSystemInstruction(dataPayload),
    turns,
  });
}

export { isClaudeQuotaError };
export type { ClaudeChatTurn };
