const STORAGE_KEY = 'perf-dashboard-gemini-api-key';

export function getGeminiApiKey(): string {
  const fromEnv = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0;
}
