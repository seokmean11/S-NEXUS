import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import { buildLinearChartScale } from '@/utils/chartScale';
import type { CompetitorSector } from '@/types/competitorAnalysis';
import { fetchCompetitorExecutiveClaudeInsights } from '@/services/competitorDriveApi';
import { getClaudeModelName } from '@/services/claudeAnalysis';
import {
  countProductivityOverlayEntries,
} from '@/utils/competitorProductivityOverlayClient';
import { countIndustryAnalysisOverlayEntries } from '@/utils/competitorIndustryAnalysisOverlayClient';
import { useExecutiveOverlayEnrichedSummary } from '@/utils/competitorExecutiveOverlayClient';
import {
  buildExecutiveFromMultiYear,
  COST_STRUCTURE_CHART_COLORS,
  EXECUTIVE_DEBT_RATIO_WARNING,
  EXECUTIVE_DEBT_RATIO_CAUTION,
  EXECUTIVE_DEBT_RATIO_WATCH,
  FINANCIAL_HEALTH_DEBT_RATIO_TIER_ORDER,
  formatCostStructureAveragePeriodLabel,
  formatFinancialHealthDebtRatioCriteria,
  formatFinancialHealthDebtRatioTierLabel,
  formatFinancialHealthGradeCriteria,
  formatFinancialHealthGradeLabel,
  resolveDebtRatioRiskTier,
  resolveIndustryDebtRatioBenchmark,
  type FinancialHealthChartItem,
  formatPercentLabel,
  formatProductivityEmployeesBasisLabel,
  formatProductivityPerEmployeeEok,
  resolveProductivityAnalysisYear,
} from '@/utils/competitorExecutiveDashboard';
import {
  buildExecutiveInsightsBySection,
  type ExecutiveInsightItem,
  type ExecutiveInsightsBySection,
} from '@/utils/competitorExecutiveInsight';
import {
  buildExecutiveInsightCacheKey,
  buildExecutiveInsightClaudeContext,
} from '@/utils/competitorExecutiveClaudeContext';
import {
  loadCachedExecutiveClaudeInsights,
  saveCachedExecutiveClaudeInsights,
} from '@/utils/competitorExecutiveClaudeInsightCache';
import { getClaudeApiKey, hasClaudeApiKey } from '@/utils/claudeApiKey';
import { recordClaudeUsage } from '@/utils/claudeUsage';
import { formatExecutiveKRW, formatExecutiveKRWCompact, formatExecutiveKRWRankingLabel } from '@/utils/formatKRW';
import {
  buildMarketSizeChartScale,
  formatMarketSizeTrillion,
  formatMarketSizeTrillionAxis,
  MARKET_SIZE_TREND_DISPLAY,
  MARKET_SIZE_TREND_FROM_YEAR,
  MARKET_SIZE_TREND_SOURCE,
  MARKET_SIZE_TREND_TO_YEAR,
  type MarketSizeTrendPoint,
} from '@/utils/marketSizeTrend';

interface CompetitorExecutiveDashboardProps {
  summary: CompetitorExecutiveMultiYearSummary | null;
  sector?: CompetitorSector;
  fromYear?: number;
  toYear?: number;
  loading?: boolean;
  refreshing?: boolean;
  hasResult?: boolean;
  onSummaryEnriched?: (summary: CompetitorExecutiveMultiYearSummary) => void;
}

const CHART_COLUMN_MIN_WIDTH = 88;
const CHART_PLOT_HEIGHT = 260;
const COST_STRUCTURE_LABEL_HEADROOM = 30;
const CHART_META_HEIGHT = 52;
const RANKING_LABEL_RESERVE = 26;
const RANKING_BAR_AREA_RATIO = (CHART_PLOT_HEIGHT - RANKING_LABEL_RESERVE) / CHART_PLOT_HEIGHT;
const MARKET_SIZE_X_AXIS_HEIGHT = 28;
const MARKET_SIZE_VALUE_LABEL_HEIGHT = 34;
const MARKET_SIZE_PLOT_AREA_HEIGHT = CHART_PLOT_HEIGHT - MARKET_SIZE_X_AXIS_HEIGHT;
const MARKET_SIZE_LINE_AREA_HEIGHT =
  MARKET_SIZE_PLOT_AREA_HEIGHT - MARKET_SIZE_VALUE_LABEL_HEIGHT;

function toDebtRatioBarHeightPct(debtRatio: number, scaleMax: number): number {
  if (scaleMax <= 0 || debtRatio <= 0) return 0;
  return (debtRatio / scaleMax) * RANKING_BAR_AREA_RATIO * 100;
}

function resolveFinancialHealthScaleMax(
  items: { metricsByYear: Array<{ debtRatio: number | null }> }[],
): number {
  const peak = items.reduce((max, item) => {
    const localMax = item.metricsByYear.reduce(
      (inner, point) => Math.max(inner, point.debtRatio ?? 0),
      0,
    );
    return Math.max(max, localMax);
  }, EXECUTIVE_DEBT_RATIO_WARNING);
  return Math.max(EXECUTIVE_DEBT_RATIO_WARNING, Math.ceil(peak / 50) * 50);
}

function toRankingBarHeightPct(revenue: number, scaleMax: number): number {
  if (scaleMax <= 0 || revenue <= 0) return 0;
  return (revenue / scaleMax) * RANKING_BAR_AREA_RATIO * 100;
}

function chartScrollWidth(count: number): number {
  return Math.max(count * CHART_COLUMN_MIN_WIDTH, 720);
}

function ChartYAxis({
  ticks,
  unit,
  reverse = true,
  formatTick,
}: {
  ticks: number[];
  unit: string;
  reverse?: boolean;
  formatTick?: (value: number) => string;
}) {
  const ordered = reverse ? [...ticks].reverse() : ticks;
  return (
    <div className="exec-chart-y-axis" style={{ height: CHART_PLOT_HEIGHT }}>
      <span className="exec-chart-y-axis__unit">{unit}</span>
      {ordered.map((tick) => (
        <span key={tick} className="exec-chart-y-axis__tick">
          {formatTick ? formatTick(tick) : formatExecutiveKRWCompact(tick)}
        </span>
      ))}
    </div>
  );
}

function MarketSizeYAxis({ ticks }: { ticks: number[] }) {
  const ordered = [...ticks].reverse();
  return (
    <div className="exec-chart-y-axis exec-chart-y-axis--market-size" style={{ height: CHART_PLOT_HEIGHT }}>
      <span className="exec-chart-y-axis__unit">시장규모</span>
      {ordered.map((tick) => (
        <span key={tick} className="exec-chart-y-axis__tick">
          {formatMarketSizeTrillionAxis(tick)}
        </span>
      ))}
    </div>
  );
}

function marketSizeValueToPlotY(value: number, scaleMax: number): number {
  if (scaleMax <= 0) return MARKET_SIZE_VALUE_LABEL_HEIGHT + MARKET_SIZE_LINE_AREA_HEIGHT;
  const ratio = value / scaleMax;
  return MARKET_SIZE_VALUE_LABEL_HEIGHT + (1 - ratio) * MARKET_SIZE_LINE_AREA_HEIGHT;
}

function marketSizeIndexToPlotX(index: number, count: number): number {
  if (count <= 0) return 50;
  return ((index + 0.5) / count) * 100;
}

function MarketSizeLineChart({
  points,
  scaleMax,
  ticks,
}: {
  points: MarketSizeTrendPoint[];
  scaleMax: number;
  ticks: number[];
}) {
  const linePoints = points
    .map((point, index) => {
      const x = marketSizeIndexToPlotX(index, points.length);
      const y = marketSizeValueToPlotY(point.sizeTrillion, scaleMax);
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = (() => {
    const bottomY = MARKET_SIZE_VALUE_LABEL_HEIGHT + MARKET_SIZE_LINE_AREA_HEIGHT;
    const firstX = marketSizeIndexToPlotX(0, points.length);
    const lastX = marketSizeIndexToPlotX(points.length - 1, points.length);
    return [
      `${firstX},${bottomY}`,
      ...points.map((point, index) => {
        const x = marketSizeIndexToPlotX(index, points.length);
        const y = marketSizeValueToPlotY(point.sizeTrillion, scaleMax);
        return `${x},${y}`;
      }),
      `${lastX},${bottomY}`,
    ].join(' ');
  })();

  return (
    <div className="exec-line-chart" style={{ height: CHART_PLOT_HEIGHT }}>
      <div className="exec-line-chart__plot" style={{ height: MARKET_SIZE_PLOT_AREA_HEIGHT }}>
        {ticks.map((tick) => (
          <div
            key={`market-grid-${tick}`}
            className="exec-line-chart__grid"
            style={{
              top: `${marketSizeValueToPlotY(tick, scaleMax)}px`,
            }}
          />
        ))}
        <svg
          className="exec-line-chart__svg"
          viewBox={`0 0 100 ${MARKET_SIZE_PLOT_AREA_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon className="exec-line-chart__area" points={areaPoints} />
          <polyline className="exec-line-chart__line" points={linePoints} fill="none" />
        </svg>
        {points.map((point, index) => {
          const leftPct = marketSizeIndexToPlotX(index, points.length);
          const topPx = marketSizeValueToPlotY(point.sizeTrillion, scaleMax);
          return (
            <div
              key={point.year}
              className="exec-line-chart__point"
              style={{ left: `${leftPct}%`, top: `${topPx}px` }}
              title={`${point.year}년 · ${formatMarketSizeTrillion(point.sizeTrillion)}`}
            >
              <span className="exec-line-chart__value">{formatMarketSizeTrillion(point.sizeTrillion)}</span>
              <span className="exec-line-chart__dot" />
            </div>
          );
        })}
      </div>
      <div
        className="exec-line-chart__x-row"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point) => (
          <span key={point.year} className="exec-line-chart__x">
            {point.year}년
          </span>
        ))}
      </div>
    </div>
  );
}

function ChartPercentAxis({
  max,
  midLabel,
  unit = '%',
}: {
  max: number;
  midLabel?: string;
  unit?: string;
}) {
  const mid = Math.round(max / 2);
  return (
    <div className="exec-chart-y-axis exec-chart-y-axis--percent" style={{ height: CHART_PLOT_HEIGHT }}>
      <span className="exec-chart-y-axis__unit">{unit}</span>
      <span className="exec-chart-y-axis__tick">{max}%</span>
      {midLabel ? (
        <span className="exec-chart-y-axis__tick exec-chart-y-axis__tick--warn">{midLabel}</span>
      ) : (
        <span className="exec-chart-y-axis__tick">{mid}%</span>
      )}
      <span className="exec-chart-y-axis__tick">0%</span>
    </div>
  );
}

function ChartGrid({
  scaleMax,
  ticks,
  barAreaRatio = 1,
}: {
  scaleMax: number;
  ticks: number[];
  barAreaRatio?: number;
}) {
  return (
    <>
      {ticks.map((tick) => (
        <div
          key={`grid-${tick}`}
          className="exec-chart-plot__grid"
          style={{
            bottom: `${scaleMax > 0 ? (tick / scaleMax) * 100 * barAreaRatio : 0}%`,
          }}
        />
      ))}
    </>
  );
}

function FinancialHealthMetaCell({ item }: { item: FinancialHealthChartItem }) {
  return (
    <div className="exec-chart-meta-cell exec-chart-meta-cell--financial-health">
      <span className={`exec-health-grade exec-health-grade--${item.riskLevel}`}>
        {formatFinancialHealthGradeLabel(item.riskLevel)}
      </span>
      <div className="exec-health-reason-tags">
        {item.reasonTags.map((tag) => (
          <span
            key={tag.key}
            className={`exec-health-reason-tag exec-health-reason-tag--${tag.tone}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatSourcePercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

const SEGMENT_LABEL_INSIDE_MIN = 5;

function CostStructureInsideLabel({
  chartRatio,
  sourceRatio,
}: {
  chartRatio: number;
  sourceRatio: number | null | undefined;
}) {
  if (chartRatio < SEGMENT_LABEL_INSIDE_MIN) return null;
  const text = formatSegmentLabel(chartRatio, sourceRatio);
  if (text === '-') return null;
  return <span className="exec-stack-segment__label">{text}</span>;
}

function resolveSegmentDisplayRatio(
  chartRatio: number,
  sourceRatio: number | null | undefined,
): number | null {
  if (sourceRatio != null && Number.isFinite(sourceRatio)) return sourceRatio;
  if (chartRatio > 0 && Number.isFinite(chartRatio)) return chartRatio;
  return null;
}

function formatSegmentLabel(chartRatio: number, sourceRatio: number | null | undefined): string {
  const displayRatio = resolveSegmentDisplayRatio(chartRatio, sourceRatio);
  if (displayRatio == null) return '-';
  return formatPercentLabel(displayRatio);
}

function CostStructureSideLabel({
  chartRatio,
  sourceRatio,
  tone,
}: {
  chartRatio: number;
  sourceRatio: number | null | undefined;
  tone: 'cogs' | 'sga';
}) {
  if (!shouldShowCostStructureExternalLabel(chartRatio, sourceRatio)) return null;
  const text = formatSegmentLabel(chartRatio, sourceRatio);
  if (text === '-') return null;
  return (
    <span
      className={`exec-stack-segment__label-external exec-stack-segment__label-external--${tone} exec-stack-segment__label-external--side-in-segment`}
    >
      {text}
    </span>
  );
}

function hasCostStructureSideLabel(
  chartRatio: number,
  sourceRatio: number | null | undefined,
): boolean {
  return shouldShowCostStructureExternalLabel(chartRatio, sourceRatio);
}

function shouldShowCostStructureExternalLabel(
  chartRatio: number,
  sourceRatio: number | null | undefined,
): boolean {
  if (resolveSegmentDisplayRatio(chartRatio, sourceRatio) == null) return false;
  return chartRatio < SEGMENT_LABEL_INSIDE_MIN;
}

function resolveMarginExternalLabelPosition(item: {
  cogsRatio: number;
  sgaRatio: number;
  operatingMargin: number;
  sourceOperatingMargin: number | null;
}): {
  bottomPct: number;
  chartRatio: number;
  sourceRatio: number | null;
  tone: 'margin' | 'margin-negative';
} | null {
  if (!shouldShowCostStructureExternalLabel(item.operatingMargin, item.sourceOperatingMargin)) {
    return null;
  }
  return {
    bottomPct: item.cogsRatio + item.sgaRatio + item.operatingMargin,
    chartRatio: item.operatingMargin,
    sourceRatio: item.sourceOperatingMargin,
    tone: (item.sourceOperatingMargin ?? 0) < 0 ? 'margin-negative' : 'margin',
  };
}

function renderCostStructureMarginExternalLabel(
  companyKey: string,
  item: {
    cogsRatio: number;
    sgaRatio: number;
    operatingMargin: number;
    sourceOperatingMargin: number | null;
  },
) {
  const label = resolveMarginExternalLabelPosition(item);
  if (!label) return null;
  return (
    <span
      key={`${companyKey}-margin`}
      className={`exec-stack-segment__label-external exec-stack-segment__label-external--${label.tone} exec-stack-segment__label-external--above`}
      style={{ bottom: `${label.bottomPct}%` }}
    >
      {formatSegmentLabel(label.chartRatio, label.sourceRatio)}
    </span>
  );
}

function ExecutiveInsightList({
  items,
  source,
  usedFallback = false,
}: {
  items: ExecutiveInsightItem[];
  source: 'claude' | 'local' | 'pending';
  usedFallback?: boolean;
}) {
  if (source === 'pending') {
    return null;
  }

  if (items.length === 0) return null;

  return (
    <div className="competitor-executive-chart-insights">
      <p className="competitor-executive-chart-insights__title">
        Executive Insight
        {source === 'claude'
          ? usedFallback
            ? ' · Claude(형식 보완)'
            : ' · Claude'
          : source === 'local'
            ? ' · 자동 점검'
            : ''}
      </p>
      <ul className="competitor-executive-insight-list">
        {items.map((item) => (
          <li
            key={`${item.severity}-${item.title}`}
            className={`competitor-executive-insight competitor-executive-insight--${item.severity}`}
          >
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ColumnChartProps<T> {
  items: T[];
  scaleMax: number;
  ticks: number[];
  getKey: (item: T) => string;
  renderMeta: (item: T) => ReactNode;
  renderBar: (item: T) => ReactNode;
  renderX: (item: T) => ReactNode;
  getColumnClassName?: (item: T) => string | undefined;
  getXClassName?: (item: T) => string | undefined;
  getTitle?: (item: T) => string | undefined;
}

function ColumnChart<T>({
  items,
  scaleMax,
  ticks,
  getKey,
  renderMeta,
  renderBar,
  renderX,
  getColumnClassName,
  getXClassName,
  getTitle,
}: ColumnChartProps<T>) {
  const minWidth = chartScrollWidth(items.length);

  return (
    <div className="exec-chart-scroll">
      <div className="exec-chart-sheet" style={{ minWidth }}>
        <div className="exec-chart-meta-row">
          {items.map((item) => (
            <div key={`meta-${getKey(item)}`} className="exec-chart-meta-cell">
              {renderMeta(item)}
            </div>
          ))}
        </div>

        <div className="exec-chart-plot" style={{ height: CHART_PLOT_HEIGHT }}>
          <ChartGrid scaleMax={scaleMax} ticks={ticks} />
          <div className="exec-chart-bars">
            {items.map((item) => {
              const extraClass = getColumnClassName?.(item);
              return (
                <div
                  key={getKey(item)}
                  className={`exec-chart-bar-cell${extraClass ? ` ${extraClass}` : ''}`}
                  title={getTitle?.(item)}
                >
                  {renderBar(item)}
                </div>
              );
            })}
          </div>
        </div>

        <div className="exec-chart-x-row">
          {items.map((item) => {
            const xClass = getXClassName?.(item);
            return (
              <span
                key={`x-${getKey(item)}`}
                className={`exec-chart-column__x${xClass ? ` ${xClass}` : ''}`}
              >
                {renderX(item)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CompetitorExecutiveDashboard({
  summary,
  sector,
  fromYear,
  toYear,
  loading = false,
  refreshing = false,
  hasResult = false,
  onSummaryEnriched,
}: CompetitorExecutiveDashboardProps) {
  const { summary: resolvedSummary, overlayLoading } = useExecutiveOverlayEnrichedSummary(
    summary,
    sector,
    fromYear,
    toYear,
  );
  const lastReportedOverlayCountRef = useRef<number | null>(null);

  useEffect(() => {
    lastReportedOverlayCountRef.current = null;
  }, [summary, fromYear, toYear, sector]);

  useEffect(() => {
    if (!resolvedSummary || !summary || !onSummaryEnriched || fromYear == null || toYear == null) return;

    const prevOverlays =
      countProductivityOverlayEntries(summary) + countIndustryAnalysisOverlayEntries(summary);
    const nextOverlays =
      countProductivityOverlayEntries(resolvedSummary) +
      countIndustryAnalysisOverlayEntries(resolvedSummary);
    if (nextOverlays <= prevOverlays) return;
    if (lastReportedOverlayCountRef.current === nextOverlays) return;

    lastReportedOverlayCountRef.current = nextOverlays;
    onSummaryEnriched(resolvedSummary);
  }, [resolvedSummary, summary, fromYear, toYear, onSummaryEnriched]);

  const dashboard = useMemo(
    () => (resolvedSummary ? buildExecutiveFromMultiYear(resolvedSummary) : null),
    [resolvedSummary],
  );

  const ruleInsightsBySection = useMemo(
    () => (resolvedSummary ? buildExecutiveInsightsBySection(resolvedSummary) : null),
    [resolvedSummary],
  );

  const insightCacheKey = useMemo(
    () => (resolvedSummary ? buildExecutiveInsightCacheKey(resolvedSummary) : null),
    [resolvedSummary],
  );

  const [claudeInsights, setClaudeInsights] = useState<ExecutiveInsightsBySection | null>(null);
  const [insightUsedFallback, setInsightUsedFallback] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    if (!insightCacheKey) {
      setClaudeInsights(null);
      setInsightUsedFallback(false);
      return;
    }
    const cached = loadCachedExecutiveClaudeInsights(insightCacheKey);
    setClaudeInsights(cached?.insights ?? null);
    setInsightUsedFallback(Boolean(cached?.usedFallback));
  }, [insightCacheKey]);

  const insightSource: 'claude' | 'local' | 'pending' = claudeInsights
    ? 'claude'
    : hasClaudeApiKey()
      ? 'pending'
      : 'local';

  const displayInsights = useMemo(() => {
    if (claudeInsights) {
      return {
        ...claudeInsights,
        financialHealth:
          claudeInsights.financialHealth?.length > 0
            ? claudeInsights.financialHealth
            : (ruleInsightsBySection?.financialHealth ?? []),
      };
    }
    return insightSource === 'local' ? ruleInsightsBySection : null;
  }, [claudeInsights, insightSource, ruleInsightsBySection]);

  const handleGenerateExecutiveInsights = useCallback(async () => {
    if (!resolvedSummary || !insightCacheKey) return;

    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      setInsightError('Claude API 키가 필요합니다. Analysis 페이지 또는 API 설정에서 키를 저장하세요.');
      return;
    }

    setInsightLoading(true);
    setInsightError(null);

    try {
      const context = buildExecutiveInsightClaudeContext(resolvedSummary);
      const result = await fetchCompetitorExecutiveClaudeInsights({
        context: context as unknown as Record<string, unknown>,
        apiKey,
      });

      if (result.usage) {
        recordClaudeUsage({
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          model: getClaudeModelName(),
        });
      }

      const normalized: ExecutiveInsightsBySection = {
        timeline: result.insights.timeline as ExecutiveInsightItem[],
        revenueRanking: result.insights.revenueRanking as ExecutiveInsightItem[],
        costStructure: result.insights.costStructure as ExecutiveInsightItem[],
        productivity:
          ((result.insights as { productivity?: ExecutiveInsightItem[]; stabilityRisk?: ExecutiveInsightItem[] })
            .productivity ??
            (result.insights as { stabilityRisk?: ExecutiveInsightItem[] }).stabilityRisk ??
            []) as ExecutiveInsightItem[],
        financialHealth: ruleInsightsBySection?.financialHealth ?? [],
      };

      setClaudeInsights(normalized);
      setInsightUsedFallback(Boolean(result.usedFallback));
      saveCachedExecutiveClaudeInsights(insightCacheKey, normalized, Boolean(result.usedFallback));
      if (result.usedFallback) {
        setInsightError(
          'Claude 응답 형식을 해석하지 못해 기본 요약으로 표시했습니다. 데이터 기반 인사이트는 확인 가능합니다.',
        );
      }
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : String(err));
    } finally {
      setInsightLoading(false);
    }
  }, [insightCacheKey, resolvedSummary, ruleInsightsBySection]);

  const revenueScale = useMemo(() => {
    if (!dashboard?.revenueRanking.length) return buildLinearChartScale(0);
    const maxRevenue = Math.max(
      ...dashboard.revenueRanking.flatMap((item) => item.revenuesByYear.map((point) => point.revenue)),
    );
    return buildLinearChartScale(maxRevenue);
  }, [dashboard]);

  const marketSizeScale = useMemo(() => buildMarketSizeChartScale(), []);

  const productivityScale = useMemo(() => {
    if (!dashboard?.productivity.length) return buildLinearChartScale(0);
    const maxValue = Math.max(
      ...dashboard.productivity.flatMap((item) => [
        item.revenuePerEmployeeEok ?? 0,
        Math.max(0, item.operatingProfitPerEmployeeEok ?? 0),
      ]),
      0,
    );
    return buildLinearChartScale(maxValue);
  }, [dashboard]);

  const financialHealthScaleMax = useMemo(
    () => (dashboard?.financialHealth.length ? resolveFinancialHealthScaleMax(dashboard.financialHealth) : EXECUTIVE_DEBT_RATIO_WARNING),
    [dashboard],
  );

  const industryDebtBenchmark = useMemo(
    () =>
      resolvedSummary && dashboard?.financialHealthYears.length
        ? resolveIndustryDebtRatioBenchmark(resolvedSummary, dashboard.financialHealthYears)
        : null,
    [resolvedSummary, dashboard?.financialHealthYears],
  );

  const hasIndustryDebtBenchmark = industryDebtBenchmark != null;

  if (loading) {
    return (
      <div className="competitor-executive">
        <p className="competitor-executive__empty">대시보드 데이터를 불러오는 중…</p>
      </div>
    );
  }

  if (!hasResult) {
    return (
      <div className="competitor-executive">
        <p className="competitor-executive__empty">
          상단에서 분석 사업분야와 분석 기간(시작~종료)을 선택한 뒤 「분석 실행」을 클릭하세요.
        </p>
      </div>
    );
  }

  if (!dashboard || !resolvedSummary || resolvedSummary.records.length === 0) {
    return (
      <div className="competitor-executive">
        <p className="competitor-executive__empty">
          선택 기간에 표준 스키마로 변환 가능한 재무 데이터가 없습니다.
        </p>
      </div>
    );
  }

  const { revenueRanking, revenueRankingYears, rankYear, productivityYear, costStructure, productivity, financialHealth, financialHealthYears } =
    dashboard;
  const productivityChartItems = productivity.filter((item) => item.hasProductivityData);

  return (
    <div className="competitor-executive">
      {(refreshing || overlayLoading) && (
        <p className="competitor-executive__refreshing">
          {overlayLoading ? '생산성·소속산업 보조 데이터를 불러오는 중…' : '최신 데이터 반영 중…'}
        </p>
      )}

      <div className="competitor-executive-insight-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleGenerateExecutiveInsights()}
          disabled={insightLoading || Boolean(claudeInsights)}
        >
          {insightLoading
            ? 'Executive Insight 생성 중…'
            : claudeInsights
              ? 'Executive Insight 생성 완료'
              : 'Executive Insight 생성 (Claude · 1회 호출)'}
        </Button>
        <p className="competitor-executive-insight-actions__hint">
          4개 대시보드 인사이트를 한 번에 생성 · 동일 분석 결과는 세션 캐시로 재호출 없음
          {!hasClaudeApiKey() ? ' · API 키 없으면 자동 점검(로컬)만 표시' : ''}
        </p>
        {insightError && (
          <p
            className={
              insightUsedFallback
                ? 'competitor-executive-insight-actions__hint'
                : 'competitor-executive-insight-actions__error'
            }
          >
            {insightError}
          </p>
        )}
      </div>

      <Card
        title="시장규모 추이"
        subtitle={`${MARKET_SIZE_TREND_FROM_YEAR}–${MARKET_SIZE_TREND_TO_YEAR}년 · 인테리어 업종 시장규모`}
        subtitleAside={MARKET_SIZE_TREND_SOURCE}
        className="competitor-executive-chart-card competitor-executive-chart-card--market-size"
      >
        <div className="exec-chart-frame exec-chart-frame--market-size">
          <div className="exec-chart-y-axis-wrap">
            <MarketSizeYAxis ticks={marketSizeScale.ticks} />
          </div>
          <div className="exec-chart-panel">
            <MarketSizeLineChart
              points={MARKET_SIZE_TREND_DISPLAY}
              scaleMax={marketSizeScale.scaleMax}
              ticks={marketSizeScale.ticks}
            />
          </div>
        </div>
        <ExecutiveInsightList
          items={displayInsights?.timeline ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>

      <Card
        title="매출액 순위"
        subtitle={`${rankYear}년 기준 상위 ${revenueRanking.length}개사 · ${revenueRankingYears.join(', ')}년 매출 추이`}
        className="competitor-executive-chart-card competitor-executive-chart-card--ranking"
      >
        {revenueRanking.length === 0 ? (
          <p className="competitor-executive__empty">
            {rankYear}년 매출 데이터가 있는 기업이 없습니다.
          </p>
        ) : (
          <>
            <div className="competitor-executive-chart__legend">
              {revenueRankingYears.map((year, index) => (
                <span key={year}>
                  <i
                    className={`competitor-executive-chart__swatch competitor-executive-chart__swatch--rank-year-${index}`}
                  />
                  {year}년
                </span>
              ))}
            </div>

            <div className="exec-chart-frame exec-chart-frame--ranking">
              <div className="exec-chart-y-axis-wrap">
                <ChartYAxis ticks={revenueScale.ticks} unit="매출액" />
              </div>
              <div className="exec-chart-panel">
                <div className="exec-chart-scroll">
                  <div
                    className="exec-chart-sheet"
                    style={{ minWidth: chartScrollWidth(revenueRanking.length) }}
                  >
                    <div
                      className="exec-chart-plot exec-chart-plot--grouped-rank"
                      style={{
                        height: CHART_PLOT_HEIGHT,
                        paddingTop: RANKING_LABEL_RESERVE,
                      }}
                    >
                      <ChartGrid
                        scaleMax={revenueScale.scaleMax}
                        ticks={revenueScale.ticks}
                        barAreaRatio={RANKING_BAR_AREA_RATIO}
                      />
                      <div className="exec-grouped-columns">
                        {revenueRanking.map((item) => {
                          const barHeightPcts = item.revenuesByYear.map((point) =>
                            toRankingBarHeightPct(point.revenue, revenueScale.scaleMax),
                          );
                          const peakHeightPct = Math.max(
                            ...barHeightPcts,
                            item.latestRevenue > 0 ? 4 * RANKING_BAR_AREA_RATIO : 0,
                          );

                          return (
                            <div
                              key={`rank-bars-${item.companyKey}`}
                              className="exec-grouped-column"
                              title={`${item.rank}위 ${item.companyName}`}
                            >
                              <span
                                className="exec-grouped-column__amount"
                                style={{ bottom: `${peakHeightPct}%` }}
                              >
                                {formatExecutiveKRWRankingLabel(item.latestRevenue)}
                              </span>
                              {item.revenuesByYear.map((point, yearIndex) => {
                                const heightPct = barHeightPcts[yearIndex] ?? 0;
                                return (
                                  <div
                                    key={`${item.companyKey}-${point.year}`}
                                    className={`exec-grouped-bar exec-grouped-bar--year-${yearIndex}`}
                                    style={{
                                      height: `${Math.max(heightPct, point.revenue > 0 ? 4 : 0)}%`,
                                    }}
                                    title={`${item.companyName} · ${point.year}년 · ${formatExecutiveKRW(point.revenue)}`}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="exec-chart-x-row">
                      {revenueRanking.map((item) => (
                        <span key={`rank-x-${item.companyKey}`} className="exec-chart-column__x">
                          {item.rank}. {item.companyName}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        <ExecutiveInsightList
          items={displayInsights?.revenueRanking ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>

      <Card
        title="원가 구조 분석"
        subtitle={`${rankYear}년 매출 순위 동일 · ${formatCostStructureAveragePeriodLabel(revenueRankingYears)} · 매출원가율 + 판관비율 + 영업이익률 = 100%`}
        className="competitor-executive-chart-card competitor-executive-chart-card--cost-structure"
      >
        {costStructure.length === 0 ? (
          <p className="competitor-executive__empty">
            {rankYear}년 매출 순위 데이터가 없어 원가 구조를 표시할 수 없습니다.
          </p>
        ) : (
          <>
        <div className="competitor-executive-chart__legend">
          <span>
            <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--cogs" />
            매출원가율
          </span>
          <span>
            <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--sga" />
            판관비율
          </span>
          <span>
            <i
              className="competitor-executive-chart__swatch competitor-executive-chart__swatch--margin"
              style={{ backgroundColor: COST_STRUCTURE_CHART_COLORS.marginLegend }}
            />
            영업이익률
          </span>
          <span>
            <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--other" />
            기타
          </span>
        </div>

        <div className="exec-chart-frame exec-chart-frame--cost-structure">
          <div
            className="exec-chart-y-axis-wrap exec-chart-y-axis-wrap--cost-structure"
            style={{ height: CHART_PLOT_HEIGHT + COST_STRUCTURE_LABEL_HEADROOM }}
          >
            <ChartPercentAxis max={100} />
          </div>
          <div className="exec-chart-panel">
            <div className="exec-chart-scroll exec-chart-scroll--stack">
              <div className="exec-chart-sheet" style={{ minWidth: chartScrollWidth(costStructure.length) }}>
                <div
                  className="exec-cost-structure-plot"
                  style={{ height: CHART_PLOT_HEIGHT + COST_STRUCTURE_LABEL_HEADROOM }}
                >
                  <div
                    className="exec-cost-structure-plot__headroom"
                    style={{
                      flex: `0 0 ${COST_STRUCTURE_LABEL_HEADROOM}px`,
                      minHeight: COST_STRUCTURE_LABEL_HEADROOM,
                    }}
                    aria-hidden="true"
                  />
                  <div className="exec-stack-columns exec-stack-columns--cost-structure" style={{ height: CHART_PLOT_HEIGHT }}>
                  {costStructure.map((item) => {
                    const isNegativeMargin = (item.sourceOperatingMargin ?? 0) < 0;
                    const hasSideLabel =
                      hasCostStructureSideLabel(item.cogsRatio, item.sourceCogsRatio) ||
                      hasCostStructureSideLabel(item.sgaRatio, item.sourceSgaRatio);

                    return (
                    <div key={item.companyKey} className="exec-stack-column">
                      <div className="exec-stack-column__plot">
                        {renderCostStructureMarginExternalLabel(item.companyKey, item)}
                      <div
                        className={`exec-stack-column__bar${hasSideLabel ? ' exec-stack-column__bar--side-labels' : ''}`}
                      >
                        <div
                          className={`exec-stack-segment exec-stack-segment--cogs${hasCostStructureSideLabel(item.cogsRatio, item.sourceCogsRatio) ? ' exec-stack-segment--has-side-label' : ''}`}
                          style={{
                            height: `${item.cogsRatio}%`,
                            backgroundColor: COST_STRUCTURE_CHART_COLORS.cogs,
                          }}
                          title={`매출원가율 ${formatSourcePercent(item.sourceCogsRatio)} (차트 ${formatPercentLabel(item.cogsRatio)})`}
                        >
                          <CostStructureInsideLabel
                            chartRatio={item.cogsRatio}
                            sourceRatio={item.sourceCogsRatio}
                          />
                          <CostStructureSideLabel
                            chartRatio={item.cogsRatio}
                            sourceRatio={item.sourceCogsRatio}
                            tone="cogs"
                          />
                        </div>
                        <div
                          className={`exec-stack-segment exec-stack-segment--sga${hasCostStructureSideLabel(item.sgaRatio, item.sourceSgaRatio) ? ' exec-stack-segment--has-side-label' : ''}`}
                          style={{
                            height: `${item.sgaRatio}%`,
                            backgroundColor: COST_STRUCTURE_CHART_COLORS.sga,
                          }}
                          title={`판관비율 ${formatSourcePercent(item.sourceSgaRatio)} (차트 ${formatPercentLabel(item.sgaRatio)})`}
                        >
                          <CostStructureInsideLabel
                            chartRatio={item.sgaRatio}
                            sourceRatio={item.sourceSgaRatio}
                          />
                          <CostStructureSideLabel
                            chartRatio={item.sgaRatio}
                            sourceRatio={item.sourceSgaRatio}
                            tone="sga"
                          />
                        </div>
                        <div
                          className={`exec-stack-segment exec-stack-segment--margin${isNegativeMargin ? ' exec-stack-segment--margin-negative' : ''}`}
                          style={{
                            height: `${item.operatingMargin}%`,
                            backgroundColor: isNegativeMargin
                                ? COST_STRUCTURE_CHART_COLORS.marginNegative
                                : COST_STRUCTURE_CHART_COLORS.margin,
                          }}
                          title={`영업이익률 ${formatSourcePercent(item.sourceOperatingMargin)} (차트 ${formatPercentLabel(item.operatingMargin)})`}
                        >
                          <CostStructureInsideLabel
                            chartRatio={item.operatingMargin}
                            sourceRatio={item.sourceOperatingMargin}
                          />
                        </div>
                        {item.otherRatio > 0.5 && (
                          <div
                            className="exec-stack-segment exec-stack-segment--other"
                            style={{
                              height: `${item.otherRatio}%`,
                              backgroundColor: COST_STRUCTURE_CHART_COLORS.other,
                            }}
                            title={`기타 ${formatPercentLabel(item.otherRatio)}`}
                          >
                            <CostStructureInsideLabel chartRatio={item.otherRatio} sourceRatio={item.otherRatio} />
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
                </div>

                <div className="exec-chart-x-row">
                  {costStructure.map((item) => (
                    <span key={`stack-x-${item.companyKey}`} className="exec-chart-column__x">
                      {item.rank}. {item.companyName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="competitor-executive-risk__note">
          막대는 100% 스택 기준 · 비율은 {formatCostStructureAveragePeriodLabel(revenueRankingYears)} · 합계 100% 미만/초과 시 기타 구간 표시
        </p>
          </>
        )}
        <ExecutiveInsightList
          items={displayInsights?.costStructure ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>

      <Card
        title="생산성 분석"
        subtitle={`${productivityYear}년 매출 순위 · ${formatProductivityEmployeesBasisLabel(resolvedSummary, productivityYear)} · 인당 매출·영업이익`}
        className="competitor-executive-chart-card competitor-executive-chart-card--productivity"
      >
        {productivityChartItems.length === 0 ? (
          <p className="competitor-executive__empty">
            {overlayLoading
              ? '신용분석보고서 종업원 데이터를 불러오는 중입니다.'
              : countProductivityOverlayEntries(resolvedSummary) === 0
                ? `${resolveProductivityAnalysisYear(resolvedSummary)}년 기준 생산성 분석에 필요한 종업원 데이터(신용분석보고서)가 없습니다. 인테리어 2024년 Drive 폴더에 신용분석보고서가 있는지 확인한 뒤 「분석 실행」을 다시 눌러 주세요.`
                : '선택 기간 최신 연도 매출과 종업원 수가 함께 있는 기업이 없어 생산성 분석을 표시할 수 없습니다.'}
          </p>
        ) : (
          <>
            <div className="competitor-executive-chart__legend">
              <span>
                <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--productivity-revenue" />
                인당 매출 (억/인)
              </span>
              <span>
                <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--productivity-op" />
                인당 영업이익 (억/인)
              </span>
            </div>

            <div className="exec-chart-frame exec-chart-frame--dual">
              <div className="exec-chart-y-axis-wrap">
                <div className="exec-chart-y-axis-spacer" style={{ height: CHART_META_HEIGHT }} />
                <ChartYAxis
                  ticks={productivityScale.ticks}
                  unit="생산성"
                  formatTick={(tick) =>
                    tick.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
                  }
                />
              </div>
              <div className="exec-chart-panel">
                <ColumnChart
                  items={productivity}
                  scaleMax={productivityScale.scaleMax}
                  ticks={productivityScale.ticks}
                  getKey={(item) => item.companyKey}
                  getColumnClassName={(item) =>
                    !item.hasProductivityData ? 'exec-chart-bar-cell--muted' : undefined
                  }
                  getTitle={(item) =>
                    item.hasProductivityData
                      ? `${item.rank}. ${item.companyName} · 평균 ${item.avgEmployees ?? '-'}명 · 인당 매출 ${formatProductivityPerEmployeeEok(item.revenuePerEmployeeEok)} · 인당 영업이익 ${formatProductivityPerEmployeeEok(item.operatingProfitPerEmployeeEok)}`
                      : `${item.rank}. ${item.companyName} · 종업원/매출 데이터 부족`
                  }
                  renderMeta={(item) => (
                    <>
                      <span className="exec-chart-column__badge exec-chart-column__badge--ratio">
                        {formatProductivityPerEmployeeEok(item.revenuePerEmployeeEok)}
                      </span>
                      <span
                        className={`exec-chart-column__badge ${
                          (item.operatingProfitPerEmployeeEok ?? 0) < 0
                            ? 'exec-chart-column__badge--negative'
                            : 'exec-chart-column__badge--positive'
                        }`}
                      >
                        {formatProductivityPerEmployeeEok(item.operatingProfitPerEmployeeEok)}
                      </span>
                      {item.avgEmployees != null && item.avgEmployees > 0 ? (
                        <span className="exec-chart-column__sub">평균 {item.avgEmployees}명</span>
                      ) : null}
                    </>
                  )}
                  renderBar={(item) => {
                    const revenueHeight =
                      item.hasProductivityData && productivityScale.scaleMax > 0
                        ? ((item.revenuePerEmployeeEok ?? 0) / productivityScale.scaleMax) * 100
                        : 0;
                    const operatingHeight =
                      item.hasProductivityData && productivityScale.scaleMax > 0
                        ? (Math.max(0, item.operatingProfitPerEmployeeEok ?? 0) /
                            productivityScale.scaleMax) *
                          100
                        : 0;
                    return (
                      <div className="exec-chart-column__body--pair">
                        <div
                          className="exec-chart-column__bar exec-chart-column__bar--productivity-revenue"
                          style={{
                            height: `${Math.max(revenueHeight, item.revenuePerEmployeeEok ? 4 : 0)}%`,
                          }}
                        />
                        <div
                          className={`exec-chart-column__bar exec-chart-column__bar--productivity-op ${
                            (item.operatingProfitPerEmployeeEok ?? 0) < 0
                              ? 'exec-chart-column__bar--productivity-op-negative'
                              : ''
                          }`}
                          style={{
                            height: `${Math.max(operatingHeight, item.operatingProfitPerEmployeeEok ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    );
                  }}
                  renderX={(item) => `${item.rank}. ${item.companyName}`}
                />
              </div>
            </div>

            <p className="competitor-executive-risk__note">
              좌측 막대=인당 매출 · 우측 막대=인당 영업이익 · {productivityYear}년 실적 ·{' '}
              {formatProductivityEmployeesBasisLabel(resolvedSummary, productivityYear)}
            </p>
          </>
        )}
        <ExecutiveInsightList
          items={displayInsights?.productivity ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>

      <Card
        title="재무 건전성"
        subtitle={`${rankYear}년 기준 건전성 등급 · ${financialHealthYears.join(', ')}년 부채비율 추이 · 등급+사유 태그`}
        className="competitor-executive-chart-card competitor-executive-chart-card--financial-health"
      >
        {financialHealth.length === 0 ? (
          <p className="competitor-executive__empty">
            부채비율 등 재무 건전성 공통 지표가 추출된 기업이 없습니다.
          </p>
        ) : (
          <>
            <div className="competitor-executive-health-criteria">
              <p>
                <strong>부채비율</strong> {formatFinancialHealthDebtRatioCriteria()}
              </p>
              <p>
                <strong>건전성 등급</strong> {formatFinancialHealthGradeCriteria()}
              </p>
            </div>

            <div className="competitor-executive-chart__legend competitor-executive-chart__legend--financial-health">
              {FINANCIAL_HEALTH_DEBT_RATIO_TIER_ORDER.map((tier) => (
                <span key={tier}>
                  <i
                    className={`competitor-executive-chart__swatch competitor-executive-chart__swatch--debt-${tier}`}
                  />
                  {tier === 'healthy'
                    ? `${EXECUTIVE_DEBT_RATIO_WATCH}% 미만 양호`
                    : tier === 'watch'
                      ? `${EXECUTIVE_DEBT_RATIO_WATCH}%↑ 주의`
                      : tier === 'caution'
                        ? `${EXECUTIVE_DEBT_RATIO_CAUTION}%↑ 경계`
                        : `${EXECUTIVE_DEBT_RATIO_WARNING}%↑ 고위험`}
                </span>
              ))}
              <span className="competitor-executive-chart__legend-note">
                막대 좌→우 {financialHealthYears.join(' → ')}년 · 등급 양호/주의/위험
              </span>
              {hasIndustryDebtBenchmark ? (
                <span>
                  <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--industry-benchmark" />
                  소속산업 업종평균 부채비율(점선)
                </span>
              ) : null}
            </div>

            <div className="exec-chart-frame exec-chart-frame--ranking">
              <div className="exec-chart-y-axis-wrap">
                <ChartPercentAxis
                  max={financialHealthScaleMax}
                  midLabel={`${EXECUTIVE_DEBT_RATIO_WARNING}%`}
                />
              </div>
              <div className="exec-chart-panel">
                <div className="exec-chart-scroll">
                  <div
                    className="exec-chart-sheet"
                    style={{ minWidth: chartScrollWidth(financialHealth.length) }}
                  >
                    <div className="exec-chart-meta-row exec-chart-meta-row--financial-health">
                      {financialHealth.map((item) => (
                        <FinancialHealthMetaCell
                          key={`health-meta-${item.companyKey}`}
                          item={item}
                        />
                      ))}
                    </div>

                    <div
                      className="exec-chart-plot exec-chart-plot--grouped-rank exec-chart-plot--financial-health"
                      style={{
                        height: CHART_PLOT_HEIGHT,
                        paddingTop: RANKING_LABEL_RESERVE,
                      }}
                    >
                      <ChartGrid
                        scaleMax={financialHealthScaleMax}
                        ticks={[
                          financialHealthScaleMax,
                          EXECUTIVE_DEBT_RATIO_WARNING,
                          EXECUTIVE_DEBT_RATIO_CAUTION,
                          EXECUTIVE_DEBT_RATIO_WATCH,
                          0,
                        ]}
                        barAreaRatio={RANKING_BAR_AREA_RATIO}
                      />
                      {industryDebtBenchmark ? (
                        <div
                          className="exec-chart-industry-benchmark"
                          style={{
                            bottom: `${toDebtRatioBarHeightPct(industryDebtBenchmark.value, financialHealthScaleMax)}%`,
                          }}
                          title={`${industryDebtBenchmark.referenceYear}년 소속산업 분석 업종평균 부채비율 ${formatPercentLabel(industryDebtBenchmark.value, 1)}`}
                        >
                          <span className="exec-chart-industry-benchmark__label">
                            소속산업 평균 {formatPercentLabel(industryDebtBenchmark.value, 0)}
                          </span>
                        </div>
                      ) : null}
                      <div className="exec-grouped-columns">
                        {financialHealth.map((item) => {
                          const latestDebtTier = resolveDebtRatioRiskTier(item.latestDebtRatio);
                          const barHeightPcts = item.metricsByYear.map((point) =>
                            toDebtRatioBarHeightPct(point.debtRatio ?? 0, financialHealthScaleMax),
                          );
                          const peakHeightPct = Math.max(...barHeightPcts, 0);

                          return (
                            <div
                              key={`health-bars-${item.companyKey}`}
                              className={`exec-grouped-column exec-grouped-column--debt-${latestDebtTier}`}
                              title={`${item.rank}위 ${item.companyName} · ${formatFinancialHealthGradeLabel(item.riskLevel)} · ${item.reasonTags.map((tag) => tag.label).join(', ')}`}
                            >
                              <span
                                className="exec-grouped-column__amount"
                                style={{ bottom: `${peakHeightPct}%` }}
                              >
                                {formatPercentLabel(item.latestDebtRatio, 0)}
                              </span>
                              {item.metricsByYear.map((point, yearIndex) => {
                                const heightPct = barHeightPcts[yearIndex] ?? 0;
                                const pointTier = resolveDebtRatioRiskTier(point.debtRatio);
                                return (
                                  <div
                                    key={`${item.companyKey}-${point.year}`}
                                    className={`exec-grouped-bar exec-grouped-bar--debt-${pointTier} exec-grouped-bar--year-${yearIndex}`}
                                    style={{
                                      height: `${Math.max(heightPct, point.debtRatio ? 4 : 0)}%`,
                                    }}
                                    title={`${item.companyName} · ${point.year}년 · 부채비율 ${formatPercentLabel(point.debtRatio)} (${formatFinancialHealthDebtRatioTierLabel(pointTier)})${point.isNetLoss ? ' · 순손실' : ''}`}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="exec-chart-x-row">
                      {financialHealth.map((item) => {
                        const latestDebtTier = resolveDebtRatioRiskTier(item.latestDebtRatio);
                        return (
                        <span
                          key={`health-x-${item.companyKey}`}
                          className={`exec-chart-column__x exec-chart-column__x--debt-${latestDebtTier}`}
                        >
                          {item.rank}. {item.companyName}
                        </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="competitor-executive-risk__note">
              막대 색=해당 연도 부채비율 구간 · 좌→우 연도순 · 상단=등급·사유 태그 · 하단 숫자=부채비율
              {hasIndustryDebtBenchmark
                ? ' · 점선=소속산업 분석 업종평균 부채비율(분석기간 최신연도)'
                : ''}
            </p>
          </>
        )}
        <ExecutiveInsightList
          items={displayInsights?.financialHealth ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>
    </div>
  );
}
