import fs from 'node:fs';
import path from 'node:path';

export function readProjectEnv(projectRoot: string): Record<string, string> {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(projectRoot, name);
    if (!fs.existsSync(envPath)) continue;
    const values: Record<string, string> = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return values;
  }
  return {};
}

export function getClaudeApiKey(projectRoot: string): string | null {
  const fromEnv = readProjectEnv(projectRoot);
  return (
    process.env.CLAUDE_API_KEY?.trim() ||
    process.env.VITE_CLAUDE_API_KEY?.trim() ||
    fromEnv.CLAUDE_API_KEY ||
    fromEnv.VITE_CLAUDE_API_KEY ||
    null
  );
}

export function getClaudeModelName(projectRoot: string): string {
  const fromEnv = readProjectEnv(projectRoot);
  return (
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.VITE_CLAUDE_MODEL?.trim() ||
    fromEnv.CLAUDE_MODEL ||
    fromEnv.VITE_CLAUDE_MODEL ||
    'claude-sonnet-4-6'
  );
}
