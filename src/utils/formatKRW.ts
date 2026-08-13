/** 백만원 단위 입력 → 억원/조원 표시 (100 백만원 = 1억원, 1,000,000 백만원 = 1조원) */
export const formatKRW = (valInMillions: number | null | undefined): string => {
  if (valInMillions === null || valInMillions === undefined || Number.isNaN(valInMillions)) {
    return '-';
  }
  if (Math.abs(valInMillions) >= 1_000_000) {
    return (valInMillions / 1_000_000).toFixed(1) + '조원';
  }
  if (Math.abs(valInMillions) >= 100) {
    return (valInMillions / 100).toFixed(1) + '억원';
  }
  return valInMillions.toLocaleString('ko-KR') + '백만원';
};

/** 경영진 대시보드 — 항상 억원 기준 (백만원 / 100) */
export const formatExecutiveKRW = (valInMillions: number | null | undefined): string => {
  if (valInMillions === null || valInMillions === undefined || Number.isNaN(valInMillions)) {
    return '0.0억원';
  }
  const eok = valInMillions / 100;
  if (Math.abs(eok) >= 10_000) {
    return (eok / 10_000).toFixed(1) + '조원';
  }
  return eok.toFixed(1) + '억원';
};

/** 차트 Y축 등 좁은 공간용 — 단위 접미사 축약 */
export const formatKRWCompact = (valInMillions: number | null | undefined): string => {
  if (valInMillions === null || valInMillions === undefined || Number.isNaN(valInMillions)) {
    return '-';
  }
  if (Math.abs(valInMillions) >= 1_000_000) {
    return (valInMillions / 1_000_000).toFixed(1) + '조';
  }
  if (Math.abs(valInMillions) >= 100) {
    return (valInMillions / 100).toFixed(0) + '억';
  }
  return valInMillions.toLocaleString('ko-KR') + 'M';
};

/** 경영진 대시보드 Y축 — 억원 축약 */
export const formatExecutiveKRWCompact = (valInMillions: number | null | undefined): string => {
  if (valInMillions === null || valInMillions === undefined || Number.isNaN(valInMillions)) {
    return '0억';
  }
  const eok = valInMillions / 100;
  if (Math.abs(eok) >= 10_000) {
    return (eok / 10_000).toFixed(1) + '조';
  }
  return Math.round(eok).toLocaleString('ko-KR') + '억';
};
