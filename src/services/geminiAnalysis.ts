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

const RPM_RETRY_DELAYS_MS = [3000, 8000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRpmRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests/i.test(message) && !/quota|exceeded your current quota|resource exhausted|billing/i.test(message);
}



/** 무료 tier — flash는 한도가 더 빡빡하므로 lite만 사용 */
export function getGeminiModelName(): string {
  const fromEnv = import.meta.env.VITE_GEMINI_MODEL?.trim();
  if (fromEnv?.includes('flash-lite')) return fromEnv;
  return DEFAULT_GEMINI_MODEL;
}

function uniqueModels(): string[] {
  return [getGeminiModelName()];
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
    for (let attempt = 0; attempt <= RPM_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await sendWithModel(modelName, apiKey, turns, dataPayload);
      } catch (error) {
        lastError = error;

        if (isRpmRateLimitError(error) && attempt < RPM_RETRY_DELAYS_MS.length) {
          await sleep(RPM_RETRY_DELAYS_MS[attempt]);
          continue;
        }

        if (!isQuotaOrRateLimitError(error)) {
          throw error;
        }

        break;
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

    return `Gemini **일일/토큰 한도**에 도달했습니다.\n\n• **조직·인원 질문** → 아래 로컬 분석 결과를 확인하세요 (새로고침 후 재시도)\n• **프로젝트 AI 분석** → 내일(UTC 기준 리셋) 다시 시도 또는 AI Studio 한도 확인\n• .env: \`VITE_GEMINI_MODEL=gemini-2.0-flash-lite\` (flash 모델은 한도가 더 빠르게 소진)\n\n(모델: ${model})\n(상세: ${detail})`;

  }



  if (/429|too many requests/i.test(message)) {

    return `요청이 너무 많습니다(RPM). 1~2분 후 한 번만 다시 시도해 주세요.\n(모델: ${model})\n(상세: ${detail})`;

  }



  if (/first content should be with role 'user'/i.test(message)) {

    return `대화 기록 오류입니다. F5 새로고침 후 다시 질문해 주세요.\n(상세: ${detail})`;

  }



  return detail;

}


