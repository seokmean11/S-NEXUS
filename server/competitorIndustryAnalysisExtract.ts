import { isKoreanCreditRatingText } from './competitorCreditRatingParser';

export interface ExtractedIndustryAnalysisRatios {
  debt_ratio: number | null;
  operating_margin: number | null;
  current_ratio: number | null;
}

export interface ExtractedIndustryAnalysis {
  industryName: string | null;
  industryCode: string | null;
  referenceYear: number | null;
  companyRatios: ExtractedIndustryAnalysisRatios;
  industryAverage: ExtractedIndustryAnalysisRatios;
  industryDebtRatioByYear: Record<number, number>;
}

const EMPTY_RATIOS: ExtractedIndustryAnalysisRatios = {
  debt_ratio: null,
  operating_margin: null,
  current_ratio: null,
};

const RATIO_ROW_PATTERNS: Array<{
  key: keyof ExtractedIndustryAnalysisRatios;
  pattern: RegExp;
}> = [
  { key: 'debt_ratio', pattern: /부\s*채\s*비\s*율/u },
  { key: 'operating_margin', pattern: /매\s*출\s*액\s*영\s*업\s*이\s*익\s*률/u },
  { key: 'current_ratio', pattern: /유\s*동\s*비\s*율/u },
];

function normalizeIndustryAnalysisText(text: string): string {
  return text.replace(/\r/g, '');
}

function inferIndustryReferenceYear(text: string, folderYear: number): number {
  const closingDates = [...text.matchAll(/20(\d{2})-12-31/gu)].map((match) => Number(`20${match[1]}`));
  if (closingDates.length > 0) return Math.max(...closingDates);

  const koreanClosing = text.match(/(\d{4})년\s*12월\s*31일/u);
  if (koreanClosing?.[1]) {
    const year = Number(koreanClosing[1]);
    if (year >= 1900 && year <= 2100) return year;
  }

  return folderYear;
}

function parsePercentToken(raw: string): number | null {
  const cleaned = raw.replace(/[,，]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || Math.abs(value) > 10_000) return null;
  return Math.round(value * 10) / 10;
}

/** 신용분석 CR2 — 2022·2023·2024·업종평균·NICE업종평균 5열 표 (회사 실적용) */
function parseFiveColumnRatioRow(line: string): {
  companyLatest: number | null;
  niceIndustryAverage: number | null;
} {
  const labelEnd = line.search(/%|\s[\d.-]/u);
  const valuePart = labelEnd >= 0 ? line.slice(labelEnd).replace(/^%?\s*/u, '') : line;
  const numbers = [...valuePart.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((match) => parsePercentToken(match[0]))
    .filter((value): value is number => value != null);

  if (numbers.length >= 5) {
    return {
      companyLatest: numbers[2] ?? null,
      niceIndustryAverage: numbers[4] ?? null,
    };
  }

  if (numbers.length >= 4) {
    return {
      companyLatest: numbers[2] ?? null,
      niceIndustryAverage: numbers[3] ?? null,
    };
  }

  if (numbers.length >= 2) {
    return {
      companyLatest: numbers[numbers.length - 2] ?? null,
      niceIndustryAverage: numbers[numbers.length - 1] ?? null,
    };
  }

  return { companyLatest: null, niceIndustryAverage: null };
}

function parseRatioTable(section: string): {
  companyRatios: ExtractedIndustryAnalysisRatios;
  niceIndustryAverage: ExtractedIndustryAnalysisRatios;
} {
  const companyRatios: ExtractedIndustryAnalysisRatios = { ...EMPTY_RATIOS };
  const niceIndustryAverage: ExtractedIndustryAnalysisRatios = { ...EMPTY_RATIOS };

  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;

    for (const metric of RATIO_ROW_PATTERNS) {
      if (!metric.pattern.test(trimmed)) continue;
      const { companyLatest, niceIndustryAverage: niceValue } = parseFiveColumnRatioRow(trimmed);
      if (companyLatest != null) companyRatios[metric.key] = companyLatest;
      if (niceValue != null) niceIndustryAverage[metric.key] = niceValue;
      break;
    }
  }

  return { companyRatios, niceIndustryAverage };
}

function parseAffiliatedIndustryYearColumns(section: string): number[] {
  const headerMatch = section.match(
    /(?:업\s*종\s*평\s*균|재\s*무\s*비\s*율)\s*((?:20\d{2}\s*){2,4})/u,
  );
  return headerMatch?.[1]?.match(/20\d{2}/gu)?.map(Number) ?? [];
}

function parseAffiliatedIndustryPercentRow(
  section: string,
  labelPattern: RegExp,
  years: number[],
): Record<number, number> {
  const result: Record<number, number> = {};
  if (years.length === 0) return result;

  const match = section.match(labelPattern);
  if (!match) return result;

  const values = [...match[0].matchAll(/\d+(?:\.\d+)?/g)]
    .map((token) => parsePercentToken(token[0]))
    .filter((value): value is number => value != null && value < 1000);

  if (values.length < years.length) return result;

  const rowValues = values.slice(-years.length);
  years.forEach((year, index) => {
    if (rowValues[index] != null) {
      result[year] = rowValues[index];
    }
  });

  return result;
}

/** 03. 소속산업 분석 — 업종평균 YYYY… 표에서 산업 부채비율·유동비율·영업이익률 추출 */
function parseAffiliatedIndustrySection(section: string): {
  debtRatioByYear: Record<number, number>;
  currentRatioByYear: Record<number, number>;
  operatingMarginByYear: Record<number, number>;
} {
  const years = parseAffiliatedIndustryYearColumns(section);
  const debtRatioByYear = parseAffiliatedIndustryPercentRow(
    section,
    /부\s*채\s*비\s*율[^\n]{0,120}/u,
    years,
  );
  const currentRatioByYear = parseAffiliatedIndustryPercentRow(
    section,
    /유\s*동\s*비\s*율[^\n]{0,120}/u,
    years,
  );
  const operatingMarginByYear = parseAffiliatedIndustryPercentRow(
    section,
    /매\s*출\s*액\s*영\s*업\s*이\s*익\s*률[^\n]{0,80}/u,
    years,
  );

  return { debtRatioByYear, currentRatioByYear, operatingMarginByYear };
}

function pickLatestYearValue(byYear: Record<number, number>): number | null {
  const years = Object.keys(byYear)
    .map(Number)
    .filter((year) => byYear[year] != null)
    .sort((a, b) => b - a);
  if (years.length === 0) return null;
  return byYear[years[0]] ?? null;
}

function sliceNumberedSection(text: string, sectionNo: string, titlePattern: string): string | null {
  const pattern = new RegExp(
    `${sectionNo}\\.\\s*${titlePattern}[\\s\\S]{0,6000}?(?=0[6-9]\\.\\s|[1-9][0-9]\\.\\s|$)`,
    'u',
  );
  const match = text.match(pattern);
  return match?.[0] && match[0].length >= 80 ? match[0] : null;
}

function parseIndustryIdentity(text: string): { industryName: string | null; industryCode: string | null } {
  const codeNameMatch = text.match(
    /표\s*준\s*산\s*업\s*분\s*류\s*\(([A-Z0-9]+)\)\s*\|\s*([^\n|]{2,80})/u,
  );
  if (codeNameMatch) {
    return {
      industryCode: codeNameMatch[1]?.trim() ?? null,
      industryName: codeNameMatch[2]?.trim() ?? null,
    };
  }

  const inlineMatch = text.match(/([A-Z]\d{5})\s*:\s*([^|\n]{2,80})/u);
  if (inlineMatch) {
    return {
      industryCode: inlineMatch[1]?.trim() ?? null,
      industryName: inlineMatch[2]?.trim() ?? null,
    };
  }

  const overview = sliceNumberedSection(text, '03', '소\\s*속\\s*산\\s*업\\s*분\\s*석');
  if (overview) {
    const overviewName = overview.match(/업\s*종\s*명\s*\|\s*F\d+\s*:\s*([^\n|]{2,80})/u);
    if (overviewName?.[1]) {
      return { industryCode: null, industryName: overviewName[1].trim() };
    }
  }

  return { industryName: null, industryCode: null };
}

function hasAnyIndustryAverage(ratios: ExtractedIndustryAnalysisRatios): boolean {
  return (
    ratios.debt_ratio != null || ratios.operating_margin != null || ratios.current_ratio != null
  );
}

function mergeRatioTables(
  ...tables: Array<{
    companyRatios: ExtractedIndustryAnalysisRatios;
    niceIndustryAverage: ExtractedIndustryAnalysisRatios;
  }>
): {
  companyRatios: ExtractedIndustryAnalysisRatios;
  niceIndustryAverage: ExtractedIndustryAnalysisRatios;
} {
  const companyRatios: ExtractedIndustryAnalysisRatios = { ...EMPTY_RATIOS };
  const niceIndustryAverage: ExtractedIndustryAnalysisRatios = { ...EMPTY_RATIOS };

  for (const table of tables) {
    for (const key of Object.keys(EMPTY_RATIOS) as Array<keyof ExtractedIndustryAnalysisRatios>) {
      if (companyRatios[key] == null && table.companyRatios[key] != null) {
        companyRatios[key] = table.companyRatios[key];
      }
      if (niceIndustryAverage[key] == null && table.niceIndustryAverage[key] != null) {
        niceIndustryAverage[key] = table.niceIndustryAverage[key];
      }
    }
  }

  return { companyRatios, niceIndustryAverage };
}

function hasIndustryAnalysisSections(text: string): boolean {
  return (
    /0[3-5]\.\s*소\s*속\s*산\s*업/u.test(text) ||
    /0[4-5]\.\s*수\s*익\s*성/u.test(text) ||
    /0[4-5]\.\s*안\s*전\s*성/u.test(text) ||
    /업\s*종\s*평\s*균/u.test(text)
  );
}

/** 파일명과 무관하게 본문에서 소속산업·안전성 분석 추출 가능한 신용분석 문서인지 */
export function isIndustryAnalysisSourceText(text: string): boolean {
  const normalized = text.replace(/\r/g, '');
  if (normalized.length < 120) return false;
  if (isKoreanCreditRatingText(normalized)) return true;
  if (!hasIndustryAnalysisSections(normalized)) return false;

  // CR2 등 Report No 헤더가 PDF 텍스트에 없는 신용분석보고서
  if (/신용분석보고서/u.test(normalized) && /CR\s*2/u.test(normalized)) return true;
  if (/기업신용분석/u.test(normalized)) return true;
  if (/손익계산서/u.test(normalized) || /재무상태표/u.test(normalized)) return true;

  return /부\s*채\s*비\s*율/u.test(normalized);
}

/** 신용분석보고서 본문에서 소속산업·업종평균 지표 추출 — 재무제표 파싱과 분리 */
export function extractCreditReportIndustryAnalysis(
  text: string,
  folderYear: number,
): ExtractedIndustryAnalysis {
  const normalized = normalizeIndustryAnalysisText(text);
  const affiliatedSection = sliceNumberedSection(normalized, '03', '소\\s*속\\s*산\\s*업\\s*분\\s*석');
  const profitabilitySection = sliceNumberedSection(normalized, '04', '수\\s*익\\s*성\\s*분\\s*석');
  const safetySection = sliceNumberedSection(normalized, '05', '안\\s*전\\s*성\\s*분\\s*석');
  const { industryName, industryCode } = parseIndustryIdentity(normalized);

  const affiliated = affiliatedSection
    ? parseAffiliatedIndustrySection(affiliatedSection)
    : {
        debtRatioByYear: {},
        currentRatioByYear: {},
        operatingMarginByYear: {},
      };

  const merged = mergeRatioTables(
    profitabilitySection
      ? parseRatioTable(profitabilitySection)
      : { companyRatios: { ...EMPTY_RATIOS }, niceIndustryAverage: { ...EMPTY_RATIOS } },
    safetySection
      ? parseRatioTable(safetySection)
      : { companyRatios: { ...EMPTY_RATIOS }, niceIndustryAverage: { ...EMPTY_RATIOS } },
  );

  const referenceYear = inferIndustryReferenceYear(normalized, folderYear);
  const industryAverage: ExtractedIndustryAnalysisRatios = {
    debt_ratio:
      pickLatestYearValue(affiliated.debtRatioByYear) ??
      merged.niceIndustryAverage.debt_ratio,
    operating_margin:
      pickLatestYearValue(affiliated.operatingMarginByYear) ??
      merged.niceIndustryAverage.operating_margin,
    current_ratio:
      pickLatestYearValue(affiliated.currentRatioByYear) ??
      merged.niceIndustryAverage.current_ratio,
  };

  return {
    industryName: industryName ?? (industryCode ? `(${industryCode})` : null),
    industryCode,
    referenceYear,
    companyRatios: merged.companyRatios,
    industryAverage: hasAnyIndustryAverage(industryAverage)
      ? industryAverage
      : { ...EMPTY_RATIOS },
    industryDebtRatioByYear: affiliated.debtRatioByYear,
  };
}

export function resolveIndustryDebtRatioForYear(
  debtRatioByYear: Record<string, number> | Record<number, number> | undefined,
  targetYear: number,
  fallback?: number | null,
): number | null {
  if (debtRatioByYear) {
    const direct = debtRatioByYear[String(targetYear)] ?? debtRatioByYear[targetYear as unknown as string];
    if (direct != null) return direct;

    const years = Object.keys(debtRatioByYear)
      .map(Number)
      .filter((year) => year <= targetYear && debtRatioByYear[String(year)] != null)
      .sort((a, b) => b - a);
    if (years.length > 0) {
      return debtRatioByYear[String(years[0])] ?? null;
    }
  }

  return fallback ?? null;
}
