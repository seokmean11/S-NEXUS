export interface ClaudeChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ClaudeTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ClaudeMessageResult {
  text: string;
  usage: ClaudeTokenUsage;
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

const RPM_RETRY_DELAYS_MS = [3000, 8000] as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getClaudeModelName(): string {
  return import.meta.env.VITE_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|529|rate.?limit|overloaded|quota|credit/i.test(message);
}

function isRpmRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit/i.test(message) && !/credit|billing|quota/i.test(message);
}

interface ClaudeMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

async function callClaudeMessages(params: {
  apiKey: string;
  system: string;
  turns: ClaudeChatTurn[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ClaudeMessageResult> {
  const { apiKey, system, turns, maxTokens = 4096, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = params;
  const messages = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('/api/claude/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getClaudeModelName(),
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`408: Claude 요청 시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = (await response.json()) as ClaudeMessageResponse;

  if (!response.ok) {
    const detail = payload.error?.message ?? response.statusText;
    throw new Error(`${response.status}: ${detail}`);
  }

  const text = payload.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Claude가 빈 응답을 반환했습니다.');
  }

  return {
    text,
    usage: {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
      model: getClaudeModelName(),
    },
  };
}

export function isClaudeTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /408|timeout|time.?out|aborted|시간 초과/i.test(message);
}

export async function sendClaudeMessage(params: {
  apiKey: string;
  system: string;
  turns: ClaudeChatTurn[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ClaudeMessageResult> {
  const { turns } = params;
  if (turns.length === 0) {
    throw new Error('대화 내용이 없습니다.');
  }

  const lastTurn = turns[turns.length - 1];
  if (lastTurn.role !== 'user') {
    throw new Error('마지막 메시지는 사용자 메시지여야 합니다.');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= RPM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await callClaudeMessages(params);
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

  throw lastError ?? new Error('Claude 요청에 실패했습니다.');
}

export function isClaudeQuotaError(error: unknown): boolean {
  return isQuotaOrRateLimitError(error);
}

export function formatClaudeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  const model = getClaudeModelName();

  if (/401|403|authentication|invalid.*api.*key|x-api-key/i.test(message)) {
    return `API 키 오류입니다. Anthropic Console에서 키를 확인해 주세요.\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/404|not found|model/i.test(message)) {
    return `모델(${model})을 찾을 수 없습니다. .env에 VITE_CLAUDE_MODEL을 확인한 뒤 dev 서버를 재시작해 주세요.\n(상세: ${detail})`;
  }

  if (/credit|billing|quota|529|overloaded/i.test(message)) {
    return `Claude **사용 한도**에 도달했습니다.\n\n• Anthropic Console에서 크레dit·한도 확인\n• 잠시 후 다시 시도\n\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/429|rate.?limit/i.test(message)) {
    return `요청이 너무 많습니다. 1~2분 후 한 번만 다시 시도해 주세요.\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/408|timeout|time.?out|시간 초과/i.test(message)) {
    return `Claude 응답이 ${Math.round(DEFAULT_REQUEST_TIMEOUT_MS / 1000)}초 안에 오지 않아 중단했습니다.\n데이터 범위를 줄이거나 잠시 후 다시 시도해 주세요.\n(모델: ${model})\n(상세: ${detail})`;
  }

  if (/failed to fetch|network|502|503/i.test(message)) {
    return `Claude API에 연결하지 못했습니다. dev 서버(npm run dev)가 실행 중인지 확인해 주세요.\n(상세: ${detail})`;
  }

  return detail;
}
