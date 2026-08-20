import { sendClaudeServerMessage } from './claudeServer';
import {
  formatMarketSizeTrillion,
  MARKET_SIZE_TREND_DISPLAY,
  MARKET_SIZE_TREND_FROM_YEAR,
  MARKET_SIZE_TREND_TO_YEAR,
} from '../src/utils/marketSizeTrend';

function normalizeExecutiveInsightsBySection(
  insights: Partial<ExecutiveInsightsBySection> | null | undefined,
): ExecutiveInsightsBySection {
  return {
    timeline: insights?.timeline ?? [],
    revenueRanking: insights?.revenueRanking ?? [],
    costStructure: insights?.costStructure ?? [],
    productivity: insights?.productivity ?? [],
    financialHealth: insights?.financialHealth ?? [],
  };
}

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
  financialHealth: ExecutiveInsightClaudeItem[];
}

export interface ExecutiveInsightClaudeContext {
  sector: string;
  fromYear: number;
  toYear: number;
  baseYear: number;
  rankYear: number;
  productivityYear?: number;
  companyCount: number;
  timeline: Array<{
    year: number;
    totalRevenueEok?: number | null;
    totalRevenue?: number | null;
    companyCount: number;
    avgOperatingMargin: number | null;
  }>;
  revenueRanking: Array<{
    rank: number;
    name: string;
    latestRevenueEok?: number;
    latestRevenue?: number;
    revenuesByYear: Array<{ year: number; revenueEok?: number; revenue?: number }>;
    revenueCagrPct?: number | null;
  }>;
  costStructure: Array<{
    rank: number;
    name: string;
    avgCogsRatio?: number | null;
    avgSgaRatio?: number | null;
    avgOperatingMargin?: number | null;
    cogsRatio?: number | null;
    sgaRatio?: number | null;
    operatingMargin?: number | null;
    marginByYear?: Array<{ year: number; operatingMargin: number | null; cogsRatio: number | null }>;
  }>;
  productivity: Array<{
    rank: number;
    name: string;
    avgEmployees: number | null;
    employeesReferenceYear?: number | null;
    revenuePerEmployeeEok: number | null;
    operatingProfitPerEmployeeEok: number | null;
  }>;
  financialHealth?: Array<{
    rank: number;
    name: string;
    riskLevel: string;
    latestDebtRatio: number | null;
    debtRatioTrend: string;
    latestOperatingMargin: number | null;
    revenueRank: number;
    latestRevenueEok: number;
    debtRatioByYear: Array<{ year: number; debtRatio: number | null }>;
  }>;
  analytics?: Record<string, unknown>;
  dataQualityHints?: string[];
}

type SectionKey = keyof ExecutiveInsightsBySection;

const SECTION_HEADER_MAP: Record<string, SectionKey> = {
  TIMELINE: 'timeline',
  REVENUE_RANKING: 'revenueRanking',
  COST_STRUCTURE: 'costStructure',
  PRODUCTIVITY: 'productivity',
  STABILITY_RISK: 'productivity',
  FINANCIAL_HEALTH: 'financialHealth',
};

const EMPTY_SECTIONS: ExecutiveInsightsBySection = {
  timeline: [],
  revenueRanking: [],
  costStructure: [],
  productivity: [],
  financialHealth: [],
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
  if (!bucket[section]) {
    bucket[section] = [];
  }
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
        detail: detail.slice(0, 700),
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
    financialHealth: [],
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
        financialHealth: parseJsonItems(parsed.financialHealth),
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
      detail: detail.slice(0, 700),
    });
    if (items.length >= 3) break;
  }
  return items;
}

function countInsightItems(insights: ExecutiveInsightsBySection): number {
  return (
    (insights.timeline?.length ?? 0) +
    (insights.revenueRanking?.length ?? 0) +
    (insights.costStructure?.length ?? 0) +
    (insights.productivity?.length ?? 0) +
    (insights.financialHealth?.length ?? 0)
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
  const topRevenueLabel =
    topRevenue?.latestRevenueEok ?? topRevenue?.latestRevenue ?? '-';
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
            detail: `${ctx.rankYear}년 ${topRevenue.rank}위 ${topRevenue.name} · ${topRevenueLabel}억원`,
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
    financialHealth: [],
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
    } else if (lower.includes('부채') || lower.includes('건전') || lower.includes('재무')) {
      pushInsightItem(result, 'financialHealth', item);
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

const REVENUE_TIER_LABEL = '200억원 기준';

const EXECUTIVE_INSIGHT_QUALITY_RULES = `[분석 품질 기준 — 오프라인 경쟁사 분석 보고서 수준]
- 단순 순위 나열 금지. 업종 맥락·추세·업체 간 격차·리스크·시사점을 해석하세요.
- 매출: 업계 평균·고성장 업체·1·2위 격차 확대/축소·지속 성장 업체를 연도별 수치(CAGR 포함)로 설명
- 원가: 매출 규모 구간(예: ${REVENUE_TIER_LABEL})별 평균 영업이익률 비교, 업체별 원가율·이익률 추세, 매출 증가 대비 적자 업체 구분
- 생산성: 인당 매출·인당 영업이익, 종업원 증가와 매출 성장의 연계, 효율 우수/저조 업체
- 재무 건전성: 부채비율(총부채÷자본×100) 추세·업종평균 대비·매출·생산성과의 교차 해석. 차트에 이미 보이는 등급·막대 높이만 반복하지 말고, 매출 상위 vs 재무 취약, 인당 생산성 vs 부채 악화, 업종평균 대비 과부채 집단 등 전략적 시사점을 제시
- 시장·타임라인: 분석 기간 내 경쟁사 집합의 매출·마진 방향성과 시장 맥락`;

const EXECUTIVE_INSIGHT_SECTION_SPECS: Array<{
  key: SectionKey;
  header: string;
  focus: string;
  formatLines: string;
  maxTokens: number;
}> = [
  {
    key: 'timeline',
    header: 'TIMELINE',
    focus: '시장·기간 추세와 경쟁사 집합의 방향성',
    formatLines: 'info|짧은 제목|2~3문장. 시장·기간 추세와 경쟁사 집합의 방향성',
    maxTokens: 480,
  },
  {
    key: 'revenueRanking',
    header: 'REVENUE_RANKING',
    focus: '순위·성장률·격차·주목 업체 (수치 포함) 및 역전·둔화 리스크',
    formatLines:
      'info|짧은 제목|2~3문장. 순위·성장률·격차·주목 업체 (수치 포함)\nwarning|짧은 제목|2~3문장. 추가 리스크·역전·둔화 등 (해당 시)',
    maxTokens: 560,
  },
  {
    key: 'costStructure',
    header: 'COST_STRUCTURE',
    focus: '규모별 수익성·원가율 추세·대표 업체 (수치 % 포함) 및 적자·원가 악화',
    formatLines:
      'info|짧은 제목|2~3문장. 규모별 수익성·원가율 추세·대표 업체 (수치 % 포함)\nwarning|짧은 제목|2~3문장. 적자·원가 악화·구조적 취약 업체 (해당 시)',
    maxTokens: 560,
  },
  {
    key: 'productivity',
    header: 'PRODUCTIVITY',
    focus: '인당 매출·종업원 대비 효율·두드러진 업체 및 생산성 저조 리스크',
    formatLines:
      'info|짧은 제목|2~3문장. 인당 매출·종업원 대비 효율·두드러진 업체\nwarning|짧은 제목|2~3문장. 생산성 저조·인력 대비 매출 정체 (해당 시)',
    maxTokens: 560,
  },
  {
    key: 'financialHealth',
    header: 'FINANCIAL_HEALTH',
    focus:
      '업종평균 대비 부채 구조·매출·생산성과 연계한 재무 포지셔닝 및 고매출·고부채·적자 리스크',
    formatLines:
      'info|짧은 제목|2~3문장. 업종평균 대비 부채 구조·매출·생산성과 연계한 재무 포지셔닝 (수치 % 포함)\nwarning|짧은 제목|2~3문장. 고매출·고부채·적자·추세 악화 등 구조적 재무 리스크 (해당 시)\nrisk|짧은 제목|2~3문장. 즉시 주의가 필요한 재무 취약 업체·집단 (해당 시)',
    maxTokens: 640,
  },
];

function buildCompactExecutiveInsightPayload(ctx: ExecutiveInsightClaudeContext): Record<string, unknown> {
  return {
    sector: ctx.sector,
    period: `${ctx.fromYear}-${ctx.toYear}`,
    baseYear: ctx.baseYear,
    rankYear: ctx.rankYear,
    productivityYear: ctx.productivityYear ?? ctx.rankYear,
    companyCount: ctx.companyCount,
    unitNote: 'revenueEok·revenuePerEmployeeEok 단위=억원, ratio·margin=%, employees=명, revenueCagrPct=연평균성장률',
    timeline: ctx.timeline,
    revenueRanking: ctx.revenueRanking.slice(0, 10),
    costStructure: ctx.costStructure.slice(0, 10),
    productivity: ctx.productivity.slice(0, 10),
    financialHealth: (ctx.financialHealth ?? []).slice(0, 10),
    analytics: ctx.analytics ?? {},
    dataQualityHints: ctx.dataQualityHints?.slice(0, 6) ?? [],
  };
}

function buildSectionExecutiveInsightPrompt(
  section: (typeof EXECUTIVE_INSIGHT_SECTION_SPECS)[number],
  compactPayload: Record<string, unknown>,
): string {
  return `당신은 국내 ${compactPayload.sector ?? '전시·인테리어'} 업종 경쟁사 재무·원가·생산성 분석 최고 전문가입니다.
아래 JSON 데이터만 근거로 Executive Insight의 ${section.header} 구간만 작성하세요. 수치는 JSON에 있는 값만 사용하고, 없는 수치·회사·연도는 창작하지 마세요.

${EXECUTIVE_INSIGHT_QUALITY_RULES}

[이번 구간 초점]
- ${section.focus}

데이터(JSON):
${JSON.stringify(compactPayload)}

반드시 아래 "구간 텍스트 형식"만 출력하세요. JSON·markdown·서두/맺음말·다른 구간 금지.

===${section.header}===
${section.formatLines}

규칙:
- 이 구간 2~3줄(최대 3줄), 형식 severity|title|detail
- severity: info, warning, risk
- title 25자 이내, detail에 | 문자 금지
- 한국어, 경영진·전략 기획 보고용 전문 문체
- analytics·financialHealth·revenueCagrPct·marginByYear·productivityWithHeadcountGrowth·industryBenchmarkDebtRatio·highRevenueHighDebtRisk·productivityLeaderFinancialRisk 필드를 적극 활용`;
}

async function generateExecutiveInsightSection(
  projectRoot: string,
  params: {
    section: (typeof EXECUTIVE_INSIGHT_SECTION_SPECS)[number];
    compactPayload: Record<string, unknown>;
    apiKey?: string;
  },
): Promise<{
  section: SectionKey;
  items: ExecutiveInsightClaudeItem[];
  usage: { input_tokens: number; output_tokens: number };
}> {
  const result = await sendClaudeServerMessage(projectRoot, {
    system:
      '국내 경쟁사 재무·원가·생산성 분석 최고 전문가. 제공 JSON만 근거로 사용. 지정 구간 텍스트 형식만 출력.',
    user: buildSectionExecutiveInsightPrompt(params.section, params.compactPayload),
    maxTokens: params.section.maxTokens,
    apiKey: params.apiKey,
  });

  const parsed = parseExecutiveInsightsFromSectionText(result.text);
  return {
    section: params.section.key,
    items: parsed[params.section.key],
    usage: result.usage,
  };
}

function mergeExecutiveInsightSections(
  ctx: ExecutiveInsightClaudeContext,
  sectionResults: Array<{
    section: SectionKey;
    items: ExecutiveInsightClaudeItem[];
  }>,
): { insights: ExecutiveInsightsBySection; usedFallback: boolean } {
  const fallback = buildFallbackInsightsFromContext(ctx);
  const insights: ExecutiveInsightsBySection = { ...EMPTY_SECTIONS };
  let usedFallback = false;

  for (const result of sectionResults) {
    if (result.items.length > 0) {
      insights[result.section] = result.items;
      continue;
    }
    const fallbackItems = fallback[result.section] ?? [];
    if (fallbackItems.length > 0) {
      insights[result.section] = fallbackItems;
      usedFallback = true;
    }
  }

  return { insights, usedFallback };
}

export async function generateCompetitorExecutiveInsights(
  projectRoot: string,
  params: {
    context: ExecutiveInsightClaudeContext;
    cacheKey?: string;
    apiKey?: string;
  },
): Promise<{
  insights: ExecutiveInsightsBySection;
  usage: { input_tokens: number; output_tokens: number };
  usedFallback: boolean;
  cacheHit?: boolean;
}> {
  const ctx = params.context;
  const cacheKey = params.cacheKey?.trim();

  if (cacheKey) {
    const { loadExecutiveClaudeInsightDiskCache, saveExecutiveClaudeInsightDiskCache } = await import(
      './competitorExecutiveClaudeInsightDiskCache'
    );
    const cached = loadExecutiveClaudeInsightDiskCache(projectRoot, cacheKey);
    if (cached) {
      return {
        insights: normalizeExecutiveInsightsBySection(cached.insights),
        usage: cached.usage,
        usedFallback: cached.usedFallback,
        cacheHit: true,
      };
    }
  }

  const compactPayload = buildCompactExecutiveInsightPayload(ctx);
  const sectionResults = await Promise.all(
    EXECUTIVE_INSIGHT_SECTION_SPECS.map((section) =>
      generateExecutiveInsightSection(projectRoot, {
        section,
        compactPayload,
        apiKey: params.apiKey,
      }),
    ),
  );

  const usage = sectionResults.reduce(
    (acc, result) => ({
      input_tokens: acc.input_tokens + result.usage.input_tokens,
      output_tokens: acc.output_tokens + result.usage.output_tokens,
    }),
    { input_tokens: 0, output_tokens: 0 },
  );

  const merged = mergeExecutiveInsightSections(
    ctx,
    sectionResults.map((result) => ({ section: result.section, items: result.items })),
  );

  if (countInsightItems(merged.insights) === 0) {
    return {
      insights: normalizeExecutiveInsightsBySection(buildFallbackInsightsFromContext(ctx)),
      usage,
      usedFallback: true,
    };
  }

  const response = {
    insights: normalizeExecutiveInsightsBySection(merged.insights),
    usage,
    usedFallback: merged.usedFallback,
  };

  if (cacheKey) {
    const { saveExecutiveClaudeInsightDiskCache } = await import('./competitorExecutiveClaudeInsightDiskCache');
    saveExecutiveClaudeInsightDiskCache(projectRoot, {
      cacheKey,
      generatedAt: new Date().toISOString(),
      insights: response.insights,
      usage: response.usage,
      usedFallback: response.usedFallback,
    });
  }

  return response;
}
