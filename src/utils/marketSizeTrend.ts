export interface MarketSizeTrendPoint {
  year: number;
  /** 조(兆) 단위 시장규모 */
  sizeTrillion: number;
}

/** 차트에 표시할 연도 수 (최근 연도 기준) */
export const MARKET_SIZE_TREND_WINDOW_SIZE = 10;

/**
 * 인테리어 업종 시장규모 원본 데이터.
 * 신규 연도를 추가하면 resolveMarketSizeTrendWindow()가 최근 10년만 차트에 노출합니다.
 */
export const MARKET_SIZE_TREND: MarketSizeTrendPoint[] = [
  { year: 2015, sizeTrillion: 9.1 },
  { year: 2016, sizeTrillion: 10.8 },
  { year: 2017, sizeTrillion: 11.3 },
  { year: 2018, sizeTrillion: 10.6 },
  { year: 2019, sizeTrillion: 11.9 },
  { year: 2020, sizeTrillion: 11.4 },
  { year: 2021, sizeTrillion: 12.4 },
  { year: 2022, sizeTrillion: 14.1 },
  { year: 2023, sizeTrillion: 14.8 },
  { year: 2024, sizeTrillion: 15.3 },
];

export function resolveMarketSizeTrendWindow(
  points: MarketSizeTrendPoint[] = MARKET_SIZE_TREND,
  windowSize: number = MARKET_SIZE_TREND_WINDOW_SIZE,
): MarketSizeTrendPoint[] {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  if (sorted.length <= windowSize) return sorted;
  return sorted.slice(-windowSize);
}

export const MARKET_SIZE_TREND_DISPLAY = resolveMarketSizeTrendWindow(MARKET_SIZE_TREND);

export const MARKET_SIZE_TREND_FROM_YEAR = MARKET_SIZE_TREND_DISPLAY[0]?.year ?? 2015;
export const MARKET_SIZE_TREND_TO_YEAR =
  MARKET_SIZE_TREND_DISPLAY[MARKET_SIZE_TREND_DISPLAY.length - 1]?.year ?? 2024;

export const MARKET_SIZE_TREND_SOURCE = '출처: 대한전문건설협회';

export function formatMarketSizeTrillion(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
}

export function formatMarketSizeTrillionAxis(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString('ko-KR')
    : rounded.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text}조`;
}

export function buildMarketSizeChartScale(
  points: MarketSizeTrendPoint[] = MARKET_SIZE_TREND_DISPLAY,
  divisions = 4,
): { scaleMax: number; ticks: number[] } {
  const maxValue = Math.max(...points.map((point) => point.sizeTrillion), 0);
  if (maxValue <= 0) return { scaleMax: 0, ticks: [0] };

  const scaleMax = Math.ceil(maxValue * 2) / 2;
  const step = scaleMax / divisions;
  const ticks = Array.from({ length: divisions + 1 }, (_, index) =>
    Math.round(step * index * 10) / 10,
  );

  return { scaleMax, ticks };
}

export function computeMarketSizeCagr(
  points: MarketSizeTrendPoint[] = MARKET_SIZE_TREND_DISPLAY,
): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.sizeTrillion <= 0) return null;
  const years = last.year - first.year;
  if (years <= 0) return null;
  return (Math.pow(last.sizeTrillion / first.sizeTrillion, 1 / years) - 1) * 100;
}
