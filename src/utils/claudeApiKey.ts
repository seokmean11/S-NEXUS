const STORAGE_KEY = 'perf-dashboard-claude-api-key';

export function getClaudeApiKey(): string {
  const fromEnv = import.meta.env.VITE_CLAUDE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveClaudeApiKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
}

export function hasClaudeApiKey(): boolean {
  return getClaudeApiKey().length > 0;
}
