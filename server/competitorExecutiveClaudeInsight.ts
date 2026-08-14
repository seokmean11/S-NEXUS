import { sendClaudeServerMessage } from './claudeServer';
import {
  formatMarketSizeTrillion,
  MARKET_SIZE_TREND_DISPLAY,
  MARKET_SIZE_TREND_FROM_YEAR,
  MARKET_SIZE_TREND_TO_YEAR,
} from '../src/utils/marketSizeTrend';

export interface ExecutiveInsightClaudeItem {
  severity: 'info' | 'warning' | 'risk';
  title: string;
  detail: string;
}

export interface ExecutiveInsightsBySection {
  timeline: ExecutiveInsightClaudeItem[];
  revenueRanking: ExecutiveInsightClaudeItem[];
  costStructure: ExecutiveInsightClaudeItem[];
  productivity: ExecutiveInsightClaudeItem[];
}

export interface ExecutiveInsightClaudeContext {
  sector: string;
  fromYear: number;
  toYear: number;
  baseYear: number;
  rankYear: number;
  companyCount: number;
  timeline: Array<{
    year: number;
    totalRevenue: number | null;
    companyCount: number;
    avgOperatingMargin: number | null;
  }>;
  revenueRanking: Array<{
    rank: number;
    name: string;
    latestRevenue: number;
    revenuesByYear: Array<{ year: number; revenue: number }>;
  }>;
  costStructure: Array<{
    rank: number;
    name: string;
    cogsRatio: number | null;
    sgaRatio: number | null;
    operatingMargin: number | null;
  }>;
  productivity: Array<{
    rank: number;
    name: string;
    avgEmployees: number | null;
    revenuePerEmployeeEok: number | null;
    operatingProfitPerEmployeeEok: number | null;
  }>;
  dataQualityHints?: string[];
}

type SectionKey = keyof ExecutiveInsightsBySection;

const SECTION_HEADER_MAP: Record<string, SectionKey> = {
  TIMELINE: 'timeline',
  REVENUE_RANKING: 'revenueRanking',
  COST_STRUCTURE: 'costStructure',
  PRODUCTIVITY: 'productivity',
  STABILITY_RISK: 'productivity',
};

const EMPTY_SECTIONS: ExecutiveInsightsBySection = {
  timeline: [],
  revenueRanking: [],
  costStructure: [],
  productivity: [],
};

function normalizeSeverity(value: string): ExecutiveInsightClaudeItem['severity'] {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'risk' || normalized.includes('risk') || normalized.includes('고위험')) {
    return 'risk';
  }
  if (normalized === 'warning' || normalized.includes('warn') || normalized.includes('주의')) {
    return 'warning';
  }
  return 'info';
}

function pushInsightItem(
  bucket: ExecutiveInsightsBySection,
  section: SectionKey,
  item: ExecutiveInsightClaudeItem,
): void {
  if (bucket[section].length >= 3) return;
  bucket[section].push(item);
}

function parsePipeLine(line: string): ExecutiveInsightClaudeItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const pipeParts = trimmed.split('|');
  if (pipeParts.length >= 3) {
    const severity = normalizeSeverity(pipeParts[0] ?? '');
    const title = (pipeParts[1] ?? '').trim();
    const detail = pipeParts.slice(2).join('|').trim();
    if (title && detail) {
      return {
        severity,
        title: title.slice(0, 80),
        detail: detail.slice(0, 500),
      };
    }
  }

  const bullet = trimmed.replace(/^[-*•]\s*/, '');
  const colonIdx = bullet.indexOf(':');
  if (colonIdx > 0) {
    return {
      severity: 'info',
      title: bullet.slice(0, colonIdx).trim().slice(0, 80),
      detail: bullet.slice(colonIdx + 1).trim().slice(0, 500),
    };
  }

  return null;
}

function parseExecutiveInsightsFromSectionText(text: string): ExecutiveInsightsBySection {
  const result: ExecutiveInsightsBySection = {
    timeline: [],
    revenueRanking: [],
    costStructure: [],
    productivity: [],
  };

  const parts = text.split(/===\s*([A-Z_]+)\s*===/u);
  if (parts.length > 1) {
    for (let index = 1; index < parts.length; index += 2) {
      const header = parts[index]?.trim().toUpperCase();
      const body = parts[index + 1] ?? '';
      const section = header ? SECTION_HEADER_MAP[header] : undefined;
      if (!section) continue;

      for (const line of body.split('\n')) {
        const item = parsePipeLine(line);
        if (item) pushInsightItem(result, section, item);
      }
    }
    return result;
  }

  return result;
}

function tryParseExecutiveInsightsJson(text: string): ExecutiveInsightsBySection | null {
  const candidates: string[] = [];

  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gu)) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>;
      const mapped: ExecutiveInsightsBySection = {
        timeline: parseJsonItems(parsed.timeline),
        revenueRanking: parseJsonItems(parsed.revenueRanking),
        costStructure: parseJsonItems(parsed.costStructure),
        productivity: parseJsonItems(parsed.productivity ?? parsed.stabilityRisk),
      };
      if (countInsightItems(mapped) > 0) return mapped;
    } catch {
      // try next candidate
    }
  }

  return null;
}

function parseJsonItems(value: unknown): ExecutiveInsightClaudeItem[] {
  if (!Array.isArray(value)) return [];

  const items: ExecutiveInsightClaudeItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
    if (!title || !detail) continue;
    items.push({
      severity: normalizeSeverity(String(row.severity ?? 'info')),
      title: title.slice(0, 80),
      detail: detail.slice(0, 500),
    });
    if (items.length >= 3) break;
  }
  return items;
}

function countInsightItems(insights: ExecutiveInsightsBySection): number {
  return (
    insights.timeline.length +
    insights.revenueRanking.length +
    insights.costStructure.length +
    insights.productivity.length
  );
}

function parseExecutiveInsightsFromClaudeText(text: string): ExecutiveInsightsBySection {
  const sectionText = parseExecutiveInsightsFromSectionText(text);
  if (countInsightItems(sectionText) > 0) return sectionText;

  const jsonParsed = tryParseExecutiveInsightsJson(text);
  if (jsonParsed) return jsonParsed;

  return EMPTY_SECTIONS;
}

function buildFallbackInsightsFromContext(
  ctx: ExecutiveInsightClaudeContext,
): ExecutiveInsightsBySection {
  const topRevenue = ctx.revenueRanking[0];
  const topProductivity = [...ctx.productivity]
    .filter((item) => (item.revenuePerEmployeeEok ?? 0) > 0)
    .sort((a, b) => (b.revenuePerEmployeeEok ?? 0) - (a.revenuePerEmployeeEok ?? 0))[0];

  const result: ExecutiveInsightsBySection = {
    timeline: [
      {
        severity: 'info',
        title: '시장규모 추이 요약',
        detail: `${MARKET_SIZE_TREND_FROM_YEAR}-${MARKET_SIZE_TREND_TO_YEAR}년 시장규모 ${formatMarketSizeTrillion(MARKET_SIZE_TREND_DISPLAY[0]?.sizeTrillion)} → ${formatMarketSizeTrillion(MARKET_SIZE_TREND_DISPLAY[MARKET_SIZE_TREND_DISPLAY.length - 1]?.sizeTrillion)}`,
      },
    ],
    revenueRanking: topRevenue
      ? [
          {
            severity: 'info',
            title: '매출 1위',
            detail: `${ctx.rankYear}년 ${topRevenue.rank}위 ${topRevenue.name} · ${topRevenue.latestRevenue}억원`,
          },
        ]
      : [],
    costStructure: [],
    productivity: topProductivity
      ? [
          {
            severity: 'info',
            title: '인당 매출 1위',
            detail: `${topProductivity.rank}위 ${topProductivity.name} · 평균 ${topProductivity.avgEmployees ?? '-'}명 · 인당 매출 ${topProductivity.revenuePerEmployeeEok ?? '-'}억/인`,
          },
        ]
      : [],
  };

  for (const hint of ctx.dataQualityHints ?? []) {
    const lower = hint.toLowerCase();
    const item: ExecutiveInsightClaudeItem = {
      severity: lower.includes('고위험') || lower.includes('이상치') ? 'risk' : 'warning',
      title: hint.split(':')[0]?.trim().slice(0, 80) || '데이터 품질',
      detail: hint.includes(':') ? hint.split(':').slice(1).join(':').trim() : hint,
    };

    if (lower.includes('원가') || lower.includes('영업이익')) {
      pushInsightItem(result, 'costStructure', item);
    } else if (lower.includes('종업원') || lower.includes('생산성') || lower.includes('인당')) {
      pushInsightItem(result, 'productivity', item);
    } else if (lower.includes('부채')) {
      pushInsightItem(result, 'productivity', item);
    } else if (lower.includes('매출') && lower.includes('미추출')) {
      pushInsightItem(result, 'revenueRanking', item);
    } else if (lower.includes('단위')) {
      pushInsightItem(result, 'timeline', item);
    } else {
      pushInsightItem(result, 'timeline', item);
    }
  }

  return result;
}

function buildExecutiveInsightPrompt(compactPayload: Record<string, unknown>): string {
  return `당신은 국내 전시·인테리어 업종 최고 경쟁사 분석 최고 전문가입니다.
아래 요약 데이터만 보고 Executive Insight를 작성하세요.

데이터(JSON, 금액 단위 억원):
${JSON.stringify(compactPayload)}

반드시 아래 "구간 텍스트 형식"만 출력하세요. JSON·markdown·설명 문장 금지.

===TIMELINE===
info|짧은 제목|1-2문장 상세
===REVENUE_RANKING===
warning|짧은 제목|1-2문장 상세
===COST_STRUCTURE===
info|짧은 제목|1-2문장 상세
===PRODUCTIVITY===
info|짧은 제목|1-2문장 상세

규칙:
- 각 구간 1~3줄, 형식은 severity|title|detail
- severity는 info, warning, risk 중 하나
- title/detail에 | 문자 사용 금지
- 한국어, 경영진 보고용 간결 문체`;
}

export async function generateCompetitorExecutiveInsights(
  projectRoot: string,
  params: {
    context: ExecutiveInsightClaudeContext;
    apiKey?: string;
  },
): Promise<{
  insights: ExecutiveInsightsBySection;
  usage: { input_tokens: number; output_tokens: number };
  usedFallback: boolean;
}> {
  const ctx = params.context;
  const compactPayload = {
    sector: ctx.sector,
    period: `${ctx.fromYear}-${ctx.toYear}`,
    baseYear: ctx.baseYear,
    rankYear: ctx.rankYear,
    companyCount: ctx.companyCount,
    timeline: ctx.timeline,
    revenueRanking: ctx.revenueRanking.slice(0, 10),
    costStructure: ctx.costStructure.slice(0, 10),
    productivity: ctx.productivity.slice(0, 10),
    dataQualityHints: ctx.dataQualityHints?.slice(0, 6) ?? [],
  };

  const result = await sendClaudeServerMessage(projectRoot, {
    system:
      '경쟁사 재무 분석 최고 전문가. 지정된 구간 텍스트 형식만 출력. 다른 텍스트 금지.',
    user: buildExecutiveInsightPrompt(compactPayload),
    maxTokens: 1400,
    apiKey: params.apiKey,
  });

  const parsed = parseExecutiveInsightsFromClaudeText(result.text);
  if (countInsightItems(parsed) > 0) {
    return {
      insights: parsed,
      usage: result.usage,
      usedFallback: false,
    };
  }

  return {
    insights: buildFallbackInsightsFromContext(ctx),
    usage: result.usage,
    usedFallback: true,
  };
}
