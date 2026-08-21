import { getClaudeApiKey, getClaudeModelName } from './projectEnv';

const ANTHROPIC_VERSION = '2023-06-01';

export interface ClaudeServerMessageResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** Claude Messages API document / text content block */
export type ClaudeDocumentContent =
  | {
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
      title?: string;
    }
  | {
      type: 'document';
      source: { type: 'text'; media_type: 'text/plain'; data: string };
      title?: string;
    };

export function isClaudeConfigured(projectRoot: string): boolean {
  return Boolean(getClaudeApiKey(projectRoot));
}

export async function sendClaudeServerMessage(
  projectRoot: string,
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    apiKey?: string;
    timeoutMs?: number;
    /** 원문 파일 — Claude가 직접 읽음 (로컬 OCR/텍스트 추출 대체) */
    documents?: ClaudeDocumentContent[];
  },
): Promise<ClaudeServerMessageResult> {
  const apiKey = params.apiKey ?? getClaudeApiKey(projectRoot);
  if (!apiKey) {
    throw new Error('Claude API 키가 설정되지 않았습니다. .env.local에 VITE_CLAUDE_API_KEY를 추가하세요.');
  }

  const controller = new AbortController();
  const hasDocs = (params.documents?.length ?? 0) > 0;
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? (hasDocs ? 180_000 : 90_000),
  );

  const userContent: Array<ClaudeDocumentContent | { type: 'text'; text: string }> = [
    ...(params.documents ?? []),
    { type: 'text', text: params.user },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: getClaudeModelName(projectRoot),
        max_tokens: params.maxTokens ?? 2048,
        system: params.system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Claude API 오류 (${response.status})`);
    }

    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Claude가 빈 응답을 반환했습니다.');
    }

    return {
      text,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractJsonFromClaudeText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = (fenced?.[1] ?? text).trim();
  return JSON.parse(candidate);
}
