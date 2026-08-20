import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ExecutiveInsightsBySection } from './competitorExecutiveClaudeInsight';

export interface CachedExecutiveClaudeInsightResult {
  cacheKey: string;
  generatedAt: string;
  insights: ExecutiveInsightsBySection;
  usage: { input_tokens: number; output_tokens: number };
  usedFallback: boolean;
}

function cacheDir(projectRoot: string): string {
  return path.join(projectRoot, '.data', 'competitor-cache', 'executive-claude-insights');
}

function cacheFilePath(projectRoot: string, cacheKey: string): string {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 40);
  return path.join(cacheDir(projectRoot), `${hash}.json`);
}

export function loadExecutiveClaudeInsightDiskCache(
  projectRoot: string,
  cacheKey: string,
): CachedExecutiveClaudeInsightResult | null {
  if (!cacheKey.trim()) return null;

  try {
    const filePath = cacheFilePath(projectRoot, cacheKey);
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CachedExecutiveClaudeInsightResult;
    if (parsed.cacheKey !== cacheKey || !parsed.insights) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveExecutiveClaudeInsightDiskCache(
  projectRoot: string,
  payload: CachedExecutiveClaudeInsightResult,
): void {
  if (!payload.cacheKey.trim()) return;

  const dir = cacheDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cacheFilePath(projectRoot, payload.cacheKey), JSON.stringify(payload), 'utf8');
}
