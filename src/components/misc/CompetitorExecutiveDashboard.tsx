import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import { buildLinearChartScale } from '@/utils/chartScale';
import type { CompetitorSector } from '@/types/competitorAnalysis';
import { fetchCompetitorExecutiveClaudeInsights } from '@/services/competitorDriveApi';
import { getClaudeModelName } from '@/services/claudeAnalysis';
import {
  buildExecutiveFromMultiYear,
  COST_STRUCTURE_CHART_COLORS,
  EXECUTIVE_DEBT_RATIO_WARNING,
  formatPercentLabel,
  safePercent,
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
import { formatExecutiveKRW, formatExecutiveKRWCompact } from '@/utils/formatKRW';

interface CompetitorExecutiveDashboardProps {
  summary: CompetitorExecutiveMultiYearSummary | null;
  sector?: CompetitorSector;
  fromYear?: number;
  toYear?: number;
  loading?: boolean;
  refreshing?: boolean;
  hasResult?: boolean;
}

const CHART_COLUMN_MIN_WIDTH = 88;
const CHART_PLOT_HEIGHT = 260;
const CHART_META_HEIGHT = 52;
const RANKING_LABEL_RESERVE = 26;
const RANKING_BAR_AREA_RATIO = (CHART_PLOT_HEIGHT - RANKING_LABEL_RESERVE) / CHART_PLOT_HEIGHT;

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
}: {
  ticks: number[];
  unit: string;
  reverse?: boolean;
}) {
  const ordered = reverse ? [...ticks].reverse() : ticks;
  return (
    <div className="exec-chart-y-axis" style={{ height: CHART_PLOT_HEIGHT }}>
      <span className="exec-chart-y-axis__unit">{unit}</span>
      {ordered.map((tick) => (
        <span key={tick} className="exec-chart-y-axis__tick">
          {formatExecutiveKRWCompact(tick)}
        </span>
      ))}
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

function formatSourcePercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function SegmentLabel({ value }: { value: number }) {
  if (value < 5) return null;
  return <span className="exec-stack-segment__label">{formatPercentLabel(value)}</span>;
}

const MARGIN_LABEL_INSIDE_MIN = 5;

function resolveMarginDisplayRatio(
  chartRatio: number,
  sourceRatio: number | null,
): number | null {
  if (sourceRatio != null && Number.isFinite(sourceRatio) && sourceRatio !== 0) {
    return sourceRatio;
  }
  if (chartRatio > 0 && Number.isFinite(chartRatio)) return chartRatio;
  return null;
}

function shouldShowExternalMarginLabel(chartRatio: number, sourceRatio: number | null): boolean {
  const displayRatio = resolveMarginDisplayRatio(chartRatio, sourceRatio);
  if (displayRatio == null) return false;
  return chartRatio < MARGIN_LABEL_INSIDE_MIN;
}

function formatMarginLabel(chartRatio: number, sourceRatio: number | null): string {
  if (chartRatio > 0) return formatPercentLabel(chartRatio);
  const fallback = resolveMarginDisplayRatio(chartRatio, sourceRatio);
  if (fallback == null) return '-';
  return formatPercentLabel(fallback);
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
  sector: _sector,
  fromYear: _fromYear,
  toYear: _toYear,
  loading = false,
  refreshing = false,
  hasResult = false,
}: CompetitorExecutiveDashboardProps) {
  const dashboard = useMemo(
    () => (summary ? buildExecutiveFromMultiYear(summary) : null),
    [summary],
  );

  const ruleInsightsBySection = useMemo(
    () => (summary ? buildExecutiveInsightsBySection(summary) : null),
    [summary],
  );

  const insightCacheKey = useMemo(
    () => (summary ? buildExecutiveInsightCacheKey(summary) : null),
    [summary],
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

  const displayInsights =
    claudeInsights ?? (insightSource === 'local' ? ruleInsightsBySection : null);

  const handleGenerateExecutiveInsights = useCallback(async () => {
    if (!summary || !insightCacheKey) return;

    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      setInsightError('Claude API 키가 필요합니다. Analysis 페이지 또는 API 설정에서 키를 저장하세요.');
      return;
    }

    setInsightLoading(true);
    setInsightError(null);

    try {
      const context = buildExecutiveInsightClaudeContext(summary);
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
        stabilityRisk: result.insights.stabilityRisk as ExecutiveInsightItem[],
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
  }, [insightCacheKey, summary]);

  const revenueScale = useMemo(() => {
    if (!dashboard?.revenueRanking.length) return buildLinearChartScale(0);
    const maxRevenue = Math.max(
      ...dashboard.revenueRanking.flatMap((item) => item.revenuesByYear.map((point) => point.revenue)),
    );
    return buildLinearChartScale(maxRevenue);
  }, [dashboard]);

  const timelineScale = useMemo(() => {
    if (!dashboard?.timeline.length) return buildLinearChartScale(0);
    const maxTotal = Math.max(...dashboard.timeline.map((item) => item.totalRevenue ?? 0));
    return buildLinearChartScale(maxTotal);
  }, [dashboard]);

  const debtAmountScale = useMemo(() => {
    if (!dashboard?.stabilityRisk.length) return buildLinearChartScale(0);
    const maxAmount = Math.max(...dashboard.stabilityRisk.map((item) => item.leverageAmount));
    return buildLinearChartScale(maxAmount);
  }, [dashboard]);

  const debtRatioScaleMax = useMemo(() => {
    if (!dashboard?.stabilityRisk.length) return EXECUTIVE_DEBT_RATIO_WARNING;
    const maxRatio = Math.max(...dashboard.stabilityRisk.map((item) => item.debtRatio));
    return Math.max(EXECUTIVE_DEBT_RATIO_WARNING, Math.ceil(maxRatio / 50) * 50);
  }, [dashboard]);

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

  if (!dashboard || !summary || summary.records.length === 0) {
    return (
      <div className="competitor-executive">
        <p className="competitor-executive__empty">
          선택 기간에 표준 스키마로 변환 가능한 재무 데이터가 없습니다.
        </p>
      </div>
    );
  }

  const periodFromYear = summary.fromYear;
  const periodToYear = summary.toYear;
  const { revenueRanking, revenueRankingYears, rankYear, costStructure, stabilityRisk, timeline } =
    dashboard;

  return (
    <div className="competitor-executive">
      {refreshing && <p className="competitor-executive__refreshing">최신 데이터 반영 중…</p>}

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
        title="다년도 매출 추이"
        subtitle={`${periodFromYear}–${periodToYear}년 · 업종 합산 매출액`}
        className="competitor-executive-chart-card"
      >
        {timeline.every((point) => (point.totalRevenue ?? 0) === 0) ? (
          <p className="competitor-executive__empty">선택 기간에 매출 시계열 데이터가 없습니다.</p>
        ) : (
          <div className="exec-chart-frame">
            <div className="exec-chart-y-axis-wrap">
              <div className="exec-chart-y-axis-spacer" style={{ height: CHART_META_HEIGHT }} />
              <ChartYAxis ticks={timelineScale.ticks} unit="합산 매출" />
            </div>
            <div className="exec-chart-panel">
              <ColumnChart
                items={timeline}
                scaleMax={timelineScale.scaleMax}
                ticks={timelineScale.ticks}
                getKey={(point) => String(point.year)}
                getTitle={(point) =>
                  `${point.year}년 · ${formatExecutiveKRW(point.totalRevenue ?? 0)} · ${point.companyCount}개사 · 평균 영업이익률 ${safePercent(point.avgOperatingMargin)}`
                }
                renderMeta={(point) => (
                  <>
                    <span className="exec-chart-column__amount">{formatExecutiveKRW(point.totalRevenue ?? 0)}</span>
                    <span className="exec-chart-column__sub">
                      {point.companyCount}개사 · {safePercent(point.avgOperatingMargin)}
                    </span>
                  </>
                )}
                renderBar={(point) => {
                  const amount = point.totalRevenue ?? 0;
                  const heightPct =
                    timelineScale.scaleMax > 0 ? (amount / timelineScale.scaleMax) * 100 : 0;
                  return (
                    <div
                      className="exec-chart-column__bar exec-chart-column__bar--timeline"
                      style={{ height: `${Math.max(heightPct, amount > 0 ? 4 : 0)}%` }}
                    />
                  );
                }}
                renderX={(point) => `${point.year}년`}
              />
            </div>
          </div>
        )}
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
                                {formatExecutiveKRW(item.latestRevenue)}
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
        subtitle={`${rankYear}년 · 매출액 순위와 동일 순서 · 매출원가율 + 판관비율 + 영업이익률 = 100%`}
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

        <div className="exec-chart-frame">
          <div className="exec-chart-y-axis-wrap">
            <ChartPercentAxis max={100} />
          </div>
          <div className="exec-chart-panel">
            <div className="exec-chart-scroll exec-chart-scroll--stack">
              <div className="exec-chart-sheet" style={{ minWidth: chartScrollWidth(costStructure.length) }}>
                <div className="exec-stack-columns" style={{ height: CHART_PLOT_HEIGHT }}>
                  {costStructure.map((item) => {
                    const showExternalMarginLabel = shouldShowExternalMarginLabel(
                      item.operatingMargin,
                      item.sourceOperatingMargin,
                    );
                    const marginStackTop =
                      item.cogsRatio + item.sgaRatio + Math.max(item.operatingMargin, 0.8);

                    return (
                    <div key={item.companyKey} className="exec-stack-column">
                      <div className="exec-stack-column__plot">
                        {showExternalMarginLabel && (
                          <span
                            className={`exec-stack-segment__label-external exec-stack-segment__label-external--margin${(item.sourceOperatingMargin ?? 0) < 0 ? ' exec-stack-segment__label-external--margin-negative' : ''}`}
                            style={{
                              bottom: `${marginStackTop}%`,
                              color:
                                (item.sourceOperatingMargin ?? 0) < 0
                                  ? '#dc2626'
                                  : COST_STRUCTURE_CHART_COLORS.marginLegend,
                            }}
                          >
                            {formatMarginLabel(item.operatingMargin, item.sourceOperatingMargin)}
                          </span>
                        )}
                      <div className="exec-stack-column__bar">
                        <div
                          className="exec-stack-segment exec-stack-segment--cogs"
                          style={{
                            height: `${item.cogsRatio}%`,
                            backgroundColor: COST_STRUCTURE_CHART_COLORS.cogs,
                          }}
                          title={`매출원가율 ${formatSourcePercent(item.sourceCogsRatio)} (차트 ${formatPercentLabel(item.cogsRatio)})`}
                        >
                          <SegmentLabel value={item.cogsRatio} />
                        </div>
                        <div
                          className="exec-stack-segment exec-stack-segment--sga"
                          style={{
                            height: `${item.sgaRatio}%`,
                            backgroundColor: COST_STRUCTURE_CHART_COLORS.sga,
                          }}
                          title={`판관비율 ${formatSourcePercent(item.sourceSgaRatio)} (차트 ${formatPercentLabel(item.sgaRatio)})`}
                        >
                          <SegmentLabel value={item.sgaRatio} />
                        </div>
                        <div
                          className={`exec-stack-segment exec-stack-segment--margin${(item.sourceOperatingMargin ?? 0) < 0 ? ' exec-stack-segment--margin-negative' : ''}`}
                          style={{
                            height: `${item.operatingMargin}%`,
                            backgroundColor:
                              (item.sourceOperatingMargin ?? 0) < 0
                                ? COST_STRUCTURE_CHART_COLORS.marginNegative
                                : COST_STRUCTURE_CHART_COLORS.margin,
                          }}
                          title={`영업이익률 ${formatSourcePercent(item.sourceOperatingMargin)} (차트 ${formatPercentLabel(item.operatingMargin)})`}
                        >
                          {item.operatingMargin >= MARGIN_LABEL_INSIDE_MIN && (
                            <SegmentLabel value={item.operatingMargin} />
                          )}
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
                            <SegmentLabel value={item.otherRatio} />
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                    );
                  })}
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
          막대는 100% 스택 기준 · 합계 100% 미만/초과 시 기타 구간 표시
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
        title="재무 안정성 리스크 맵"
        subtitle={`${summary?.baseYear}년 · 부채비율(%) + 레버리지(억원) · ${EXECUTIVE_DEBT_RATIO_WARNING}% 초과 경고`}
        className="competitor-executive-chart-card"
      >
        {stabilityRisk.length === 0 ? (
          <p className="competitor-executive__empty">부채비율 또는 부채 규모 데이터가 있는 기업이 없습니다.</p>
        ) : (
          <>
            <div className="competitor-executive-chart__legend">
              <span>
                <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--ratio" />
                부채비율 (%)
              </span>
              <span>
                <i className="competitor-executive-chart__swatch competitor-executive-chart__swatch--leverage" />
                레버리지 규모 (억원)
              </span>
            </div>

            <div className="exec-chart-frame exec-chart-frame--dual">
              <div className="exec-chart-y-axis-wrap">
                <div className="exec-chart-y-axis-spacer" style={{ height: CHART_META_HEIGHT }} />
                <ChartYAxis ticks={debtAmountScale.ticks} unit="레버리지" />
              </div>
              <div className="exec-chart-panel">
                <div className="exec-chart-y-axis-wrap exec-chart-y-axis-wrap--overlay">
                  <div className="exec-chart-y-axis-spacer" style={{ height: CHART_META_HEIGHT }} />
                  <ChartPercentAxis max={debtRatioScaleMax} midLabel={`${EXECUTIVE_DEBT_RATIO_WARNING}%`} />
                </div>
                <ColumnChart
                  items={stabilityRisk}
                  scaleMax={debtAmountScale.scaleMax}
                  ticks={debtAmountScale.ticks}
                  getKey={(item) => item.companyName}
                  getColumnClassName={(item) =>
                    item.isHighRisk ? 'exec-chart-bar-cell--risk-danger' : undefined
                  }
                  getXClassName={(item) => (item.isHighRisk ? 'exec-chart-column__x--danger' : undefined)}
                  getTitle={(item) => {
                    const debtLabel =
                      item.totalDebt > 0
                        ? formatExecutiveKRW(item.totalDebt)
                        : `${formatExecutiveKRW(item.leverageAmount)} (부채)`;
                    return `${item.companyName} · 부채비율 ${safePercent(item.debtRatio)} · ${debtLabel}`;
                  }}
                  renderMeta={(item) => (
                    <>
                      <span
                        className={`exec-chart-column__badge exec-chart-column__badge--ratio ${item.isHighRisk ? 'exec-chart-column__badge--danger' : ''}`}
                      >
                        {formatPercentLabel(item.debtRatio)}
                      </span>
                      <span className="exec-chart-column__amount exec-chart-column__amount--sm">
                        {item.totalDebt > 0 ? formatExecutiveKRW(item.totalDebt) : formatExecutiveKRW(item.leverageAmount)}
                      </span>
                    </>
                  )}
                  renderBar={(item) => {
                    const leverageHeight =
                      debtAmountScale.scaleMax > 0
                        ? (item.leverageAmount / debtAmountScale.scaleMax) * 100
                        : 0;
                    const ratioHeight =
                      debtRatioScaleMax > 0 ? (item.debtRatio / debtRatioScaleMax) * 100 : 0;
                    return (
                      <div className="exec-chart-column__body--pair">
                        <div
                          className={`exec-chart-column__bar exec-chart-column__bar--ratio ${item.isHighRisk ? 'exec-chart-column__bar--danger' : ''}`}
                          style={{ height: `${Math.max(ratioHeight, item.debtRatio > 0 ? 4 : 0)}%` }}
                        />
                        <div
                          className={`exec-chart-column__bar exec-chart-column__bar--leverage ${item.isHighRisk ? 'exec-chart-column__bar--danger' : ''}`}
                          style={{
                            height: `${Math.max(leverageHeight, item.leverageAmount > 0 ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    );
                  }}
                  renderX={(item) => item.companyName}
                />
              </div>
            </div>

            <p className="competitor-executive-risk__note">
              좌측 막대=부채비율(%) · 우측 막대=총차입금(없으면 부채총계, 억원) ·{' '}
              {EXECUTIVE_DEBT_RATIO_WARNING}% 초과 시 빨간색
            </p>
          </>
        )}
        <ExecutiveInsightList
          items={displayInsights?.stabilityRisk ?? []}
          source={insightSource}
          usedFallback={insightUsedFallback}
        />
      </Card>
    </div>
  );
}
