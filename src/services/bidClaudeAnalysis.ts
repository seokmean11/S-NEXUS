import { sendClaudeMessage, isClaudeQuotaError } from '@/services/claudeAnalysis';
import {
  buildBidAnalysisPayload,
  buildBidSystemInstruction,
  type BidAnalysisPayload,
} from '@/utils/buildBidAnalysisPayload';

export async function sendBidAnalysisMessage(params: {
  apiKey: string;
  query: string;
  payload: BidAnalysisPayload;
}): Promise<string> {
  const { apiKey, query, payload } = params;

  return (
    await sendClaudeMessage({
      apiKey,
      system: buildBidSystemInstruction(payload),
      turns: [{ role: 'user', text: query }],
    })
  ).text;
}

export { isClaudeQuotaError };
export { buildBidAnalysisPayload };
