import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getGeminiModelName,
  isGeminiQuotaError,
} from '@/services/geminiAnalysis';
import {
  buildBidAnalysisPayload,
  buildBidSystemInstruction,
  type BidAnalysisPayload,
} from '@/utils/buildBidAnalysisPayload';

const RPM_RETRY_DELAYS_MS = [3000, 8000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|quota|resource exhausted|exceeded your current quota/i.test(message);
}

export async function sendBidAnalysisMessage(params: {
  apiKey: string;
  query: string;
  payload: BidAnalysisPayload;
}): Promise<string> {
  const { apiKey, query, payload } = params;
  const modelName = getGeminiModelName();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildBidSystemInstruction(payload),
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= RPM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await model.generateContent(query);
      const text = result.response.text()?.trim();
      if (!text) throw new Error('Gemini가 빈 응답을 반환했습니다.');
      return text;
    } catch (error) {
      lastError = error;
      if (isQuotaError(error) && attempt < RPM_RETRY_DELAYS_MS.length) {
        await sleep(RPM_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Gemini 요청에 실패했습니다.');
}

export { isGeminiQuotaError };
export { buildBidAnalysisPayload };
