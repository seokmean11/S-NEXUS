export interface ChartLinearScale {
  scaleMax: number;
  ticks: number[];
}

/** 예: 1,746,239,050 → 1,800,000,000 */
export function roundUpToNiceAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  const exponent = Math.floor(Math.log10(value));
  const step = 10 ** Math.max(0, exponent - 1);
  return Math.ceil(value / step) * step;
}

export function buildLinearChartScale(maxValue: number, divisions = 4): ChartLinearScale {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { scaleMax: 0, ticks: [0] };
  }

  const scaleMax = roundUpToNiceAmount(maxValue);
  const step = scaleMax / divisions;
  const ticks = Array.from({ length: divisions + 1 }, (_, index) => step * index);

  return { scaleMax, ticks };
}
