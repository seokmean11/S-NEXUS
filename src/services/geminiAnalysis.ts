import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildSystemInstruction,
  type AnalysisDataPayload,
} from '@/utils/buildAnalysisDataPayload';

export interface GeminiChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const PRIMARY_MODEL = 'gemini-2.0-flash-lite';
const FALLBACK_MODEL = 'gemini-1.5-flash';

function getConfiguredModel(): string {
  return import.meta.env.VITE_GEMINI_MODEL?.trim() || PRIMARY_MODEL;
}

function isModelNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /404|\bnot found\b/i.test(message) && !/429|quota|exhausted/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const recentTurns = turns.slice(-8, -1);
  const history = recentTurns.map((turn) => ({
    role: turn.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: turn.text }],
  }));

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

  const primary = getConfiguredModel();
  const models =
    primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

  let lastError: unknown;

  for (let i = 0; i < models.length; i += 1) {
    try {
      return await sendWithModel(models[i], apiKey, turns, dataPayload);
    } catch (error) {
      lastError = error;
      const canRetry = i === 0 && isModelNotFoundError(error);
      if (!canRetry) {
        throw error;
      }
      await sleep(400);
    }
  }

  throw lastError ?? new Error('사용 가능한 Gemini 모델을 찾지 못했습니다.');
}

export function formatGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.length > 180 ? `${message.slice(0, 180)}…` : message;

  if (/API key|API_KEY|401|403|permission/i.test(message)) {
    return `API 키 오류: AI Studio에서 키를 다시 확인해 주세요.\n(상세: ${detail})`;
  }

  if (/404|\bnot found\b/i.test(message)) {
    return `모델을 찾을 수 없습니다(404). API 설정 없이 기본 모델(gemini-2.0-flash-lite)을 사용합니다. dev 서버 재시작 후 다시 시도해 주세요.\n(상세: ${detail})`;
  }

  if (/429|too many requests/i.test(message)) {
    return `분당 요청 한도(RPM)입니다. 1~2분 기다린 뒤 한 번만 다시 전송해 주세요.\n(상세: ${detail})`;
  }

  if (/quota|resource exhausted|billing/i.test(message)) {
    return `토큰/일일 한도입니다. 질문을 짧게 하거나 AI Studio → 비율 제한을 확인해 주세요.\n(상세: ${detail})`;
  }

  return detail;
}
