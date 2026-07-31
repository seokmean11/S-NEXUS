import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildSystemInstruction,
  type AnalysisDataPayload,
} from '@/utils/buildAnalysisDataPayload';

export interface GeminiChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** 무료 tier 한도가 넉넉한 기본 모델 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-lite';

const FALLBACK_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'] as const;

export function getGeminiModelName(): string {
  return import.meta.env.VITE_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function uniqueModels(): string[] {
  const preferred = getGeminiModelName();
  return [...new Set([preferred, ...FALLBACK_MODELS])];
}

function buildChatHistory(turns: GeminiChatTurn[]) {
  const prior = turns.slice(0, -1).slice(-4);
  let start = 0;
  while (start < prior.length && prior[start].role !== 'user') {
    start += 1;
  }

  return prior.slice(start).map((turn) => ({
    role: turn.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: turn.text.slice(0, 1500) }],
  }));
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|quota|resource exhausted|billing|exceeded your current quota/i.test(
    message,
  );
}

async function sendWithModel(
  modelName: string,
  apiKey: string,
  turns: GeminiChatTurn[],
  dataPayload: AnalysisDataPayload,
): Promise<string> {
  const lastTurn = turns[turns.length - 1];
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemInstruction(dataPayload),
  });

  const history = buildChatHistory(turns);
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastTurn.text);
  const text = result.response.text();

  if (!text?.trim()) {
    throw new Error('Gemini가 빈 응답을 반환했습니다.');
  }

  return text.trim();
}

export async function sendGeminiAnalysisMessage(params: {
  apiKey: string;
  turns: GeminiChatTurn[];
  dataPayload: AnalysisDataPayload;
}): Promise<string> {
  const { apiKey, turns, dataPayload } = params;
  if (turns.length === 0) {
    throw new Error('대화 내용이 없습니다.');
  }

  const lastTurn = turns[turns.length - 1];
  if (lastTurn.role !== 'user') {
    throw new Error('마지막 메시지는 사용자 메시지여야 합니다.');
  }

  const models = uniqueModels();
  let lastError: unknown;

  for (const modelName of models) {
    try {
      return await sendWithModel(modelName, apiKey, turns, dataPayload);
    } catch (error) {
      lastError = error;
      if (!isQuotaOrRateLimitError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('Gemini 요청에 실패했습니다.');
}

export function isGeminiQuotaError(error: unknown): boolean {
  return isQuotaOrRateLimitError(error);
}

export function formatGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  const model = getGeminiModelName();

  if (/API key|API_KEY|401|403|permission/i.test(message)) {
    return `API 키 오류입니다. AI Studio에서 키를 확인해 주세요.\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/404|\bnot found\b/i.test(message)) {
    return `모델(${model})을 찾을 수 없습니다. .env에 VITE_GEMINI_MODEL=gemini-2.0-flash-lite 를 설정 후 dev 서버를 재시작해 주세요.\n(상세: ${detail})`;
  }

  if (/exceeded your current quota|resource exhausted|billing|quota/i.test(message)) {
    return `Gemini **일일/토큰 한도**에 도달했습니다. 1시간 이상 기다려도 동일하면 한도 소진입니다.\n\n• AI Studio → Usage/Rate limits 확인\n• .env에 VITE_GEMINI_MODEL=gemini-2.0-flash-lite 설정 (무료 한도 더 넉넉)\n• 내일 다시 시도하거나 유료 플랜 검토\n\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/429|too many requests/i.test(message)) {
    return `요청이 너무 많습니다(RPM). 1~2분 후 한 번만 다시 시도해 주세요.\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/first content should be with role 'user'/i.test(message)) {
    return `대화 기록 오류입니다. F5 새로고침 후 다시 질문해 주세요.\n(상세: ${detail})`;
  }

  return detail;
}
