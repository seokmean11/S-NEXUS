import type { DocumentAmountUnit } from './competitorFinancialNormalize';
import {
  parseFinancialAmountToken,
  type FinancialAmountAccount,
} from './competitorAmountParse';

const SECTION_UNIT_PATTERNS: Array<{ unit: DocumentAmountUnit; pattern: RegExp }> = [
  { unit: '백만원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*백\s*만\s*원/u },
  { unit: '천원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*천\s*원/u },
  { unit: '원', pattern: /(?:단\s*위|UNIT)\s*[:：]\s*원(?![\s\S]{0,6}(?:천|백\s*만))/u },
];

function detectSectionAmountUnitLocal(text: string, sectionPattern: RegExp): DocumentAmountUnit | null {
  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(sectionPattern);
  if (!match || match.index == null) return null;

  const window = normalized.slice(Math.max(0, match.index - 24), match.index + 180);
  for (const { unit, pattern } of SECTION_UNIT_PATTERNS) {
    if (pattern.test(window)) return unit;
  }
  return null;
}

const YEAR_DATE_ROW = /((?:20\d{2}-12-31(?:\s+|\/))+(?:20\d{2}-12-31))/u;
const THREE_YEAR_AMOUNT_ROW = /(-?\d[\d,]*)\s+(-?\d[\d,]*)\s+(-?\d[\d,]*)/u;

export interface FinancialStatementSection {
  kind: 'income' | 'balance';
  text: string;
  amountUnit: DocumentAmountUnit;
  latestYear?: number;
}

function parseNumeric(value: string, account: FinancialAmountAccount = 'generic'): number | null {
  return parseFinancialAmountToken(value, account);
}

export function mapLineKeyToAccount(key: string): FinancialAmountAccount {
  switch (key) {
    case 'revenue':
      return 'revenue';
    case 'costOfGoodsSold':
      return 'costOfGoodsSold';
    case 'grossProfit':
      return 'grossProfit';
    case 'sga':
      return 'sga';
    case 'operatingIncome':
      return 'operatingIncome';
    case 'netIncome':
      return 'netIncome';
    case 'totalAssets':
      return 'totalAssets';
    case 'totalLiabilities':
      return 'totalLiabilities';
    case 'equity':
      return 'equity';
    case 'cashAndEquivalents':
      return 'cashAndEquivalents';
    case 'accountsReceivable':
      return 'accountsReceivable';
    case 'currentAssets':
      return 'currentAssets';
    case 'currentLiabilities':
      return 'currentLiabilities';
    case 'shortTermDebt':
      return 'shortTermDebt';
    case 'longTermDebt':
      return 'longTermDebt';
    case 'currentPortionLongTermDebt':
      return 'currentPortionLongTermDebt';
    default:
      return 'generic';
  }
}

function normalizeExtractText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n');
}

function sectionUnitPattern(kind: 'income' | 'balance'): RegExp {
  return kind === 'income'
    ? /손\s*익\s*계\s*산\s*서|손익계산서/u
    : /재\s*무\s*상\s*태\s*표|재무상태표/u;
}

function findSectionStart(text: string, kind: 'income' | 'balance'): number {
  const separatePattern =
    kind === 'income'
      ? /별\s*도\s*손\s*익\s*계\s*산\s*서|별도\s*손익계산서/u
      : /별\s*도\s*재\s*무\s*상\s*태\s*표|별도\s*재무상태표/u;

  const separateMatch = text.match(separatePattern);
  if (separateMatch?.index != null) return separateMatch.index;

  const individualPattern =
    kind === 'income'
      ? /개\s*별\s*손\s*익\s*계\s*산\s*서|개별\s*손익계산서/u
      : /개\s*별\s*재\s*무\s*상\s*태\s*표|개별\s*재무상태표/u;
  const individualMatch = text.match(individualPattern);
  if (individualMatch?.index != null) return individualMatch.index;

  const formalPattern =
    kind === 'income'
      ? /손익계산서\s*[\(（][^)）]{0,40}단\s*위\s*[:：][^)）]{0,20}[\)）]/u
      : /재무상태표\s*[\(（][^)）]{0,40}단\s*위\s*[:：][^)）]{0,20}[\)）]/u;

  const formalMatch = text.match(formalPattern);
  if (formalMatch?.index != null) {
    const window = text.slice(Math.max(0, formalMatch.index - 40), formalMatch.index + 30);
    if (!/연\s*결/u.test(window)) return formalMatch.index;
  }

  // 일반 손익/재무상태표 — 연결 제목·인접 구간은 제외하고 첫 비연결 위치만 사용
  const consolidatedNearby = /연\s*결/u;
  for (const match of text.matchAll(
    kind === 'income' ? /손\s*익\s*계\s*산\s*서|손익계산서/gu : /재\s*무\s*상\s*태\s*표|재무상태표/gu,
  )) {
    if (match.index == null) continue;
    const window = text.slice(Math.max(0, match.index - 48), match.index + 24);
    if (consolidatedNearby.test(window)) continue;
    return match.index;
  }

  // 연결만 있으면 사용하지 않음 (계열사 연결재무제표 제외 정책)
  return -1;
}

function findSectionEnd(text: string, start: number, kind: 'income' | 'balance'): number {
  const after = text.slice(start + 8);
  const nextIncome = after.search(/손\s*익\s*계\s*산\s*서|손익계산서/u);
  const nextBalance = after.search(/재\s*무\s*상\s*태\s*표|재무상태표/u);
  const nextAppendix = after.search(
    /주석|附注|재무제표에\s*대한|의견|감사의견|재무활동|투자활동|영업활동/u,
  );

  const candidates = [nextBalance, nextAppendix, 7000]
    .filter((value) => value >= 0)
    .map((value) => start + 8 + value);

  if (kind === 'income') {
    const balanceStart = findSectionStart(text, 'balance');
    if (balanceStart > start) candidates.push(balanceStart);
  }

  return Math.min(...candidates.filter((value) => value > start));
}

export function extractFinancialStatementSection(
  text: string,
  kind: 'income' | 'balance',
): FinancialStatementSection | null {
  const normalized = normalizeExtractText(text);
  const start = findSectionStart(normalized, kind);
  if (start < 0) return null;

  const end = findSectionEnd(normalized, start, kind);
  const sectionText = normalized.slice(start, Math.max(end, start + 4000));
  const amountUnit = detectSectionAmountUnitLocal(sectionText, sectionUnitPattern(kind)) ?? '백만원';
  const years = extractYearColumns(sectionText);

  return {
    kind,
    text: sectionText,
    amountUnit,
    latestYear: years?.latestYear,
  };
}

export function extractFinancialStatementSections(text: string): {
  income: FinancialStatementSection | null;
  balance: FinancialStatementSection | null;
} {
  return {
    income: extractFinancialStatementSection(text, 'income'),
    balance: extractFinancialStatementSection(text, 'balance'),
  };
}

export function extractYearColumns(sectionText: string): {
  years: number[];
  latestYear: number;
} | null {
  const match = sectionText.match(YEAR_DATE_ROW);
  if (!match?.[1]) return null;

  const years = [...match[1].matchAll(/20\d{2}/gu)].map((item) => Number(item[0]));
  if (years.length === 0) return null;

  return { years, latestYear: Math.max(...years) };
}

export function readLatestYearAmount(sectionText: string, rowIndex: number): number | null {
  const dateMatch = sectionText.match(YEAR_DATE_ROW);
  if (dateMatch?.index == null || rowIndex < 0) return null;

  const valuesBlock = sectionText.slice(dateMatch.index ?? 0);
  const amountRows = [...valuesBlock.matchAll(new RegExp(THREE_YEAR_AMOUNT_ROW.source, 'gu'))].map(
    (item) => item[0],
  );
  const row = amountRows[rowIndex]?.match(THREE_YEAR_AMOUNT_ROW);
  if (!row) return null;
  return parseNumeric(row[1], 'generic');
}

export function readLatestYearPairFromSection(sectionText: string, rowIndex: number): number | null {
  const dateMatch = sectionText.match(YEAR_DATE_ROW);
  if (dateMatch?.index == null) return null;

  const valuesBlock = sectionText.slice(dateMatch.index);
  const pairPattern =
    /(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)/u;
  const amountRows = [...valuesBlock.matchAll(new RegExp(pairPattern.source, 'gu'))].map((item) => item[0]);
  const row = amountRows[rowIndex]?.match(pairPattern);
  if (!row) return null;
  return parseNumeric(row[5]);
}

export interface StatementLinePattern {
  key: string;
  label: string;
  /** 첫 매칭 패턴 사용 — PDF마다 로마숫자·아라비아숫자·줄바꿈 형식이 다름 */
  patterns: RegExp[];
}

const AMOUNT_NUMBER = /-?\d[\d,]+(?:\.\d+)?/gu;

function isLikelyYear(value: number): boolean {
  return Number.isInteger(value) && value >= 2000 && value <= 2100;
}

const AMOUNT_TOKEN = /\(?-?\d[\d,，]*(?:\.\d+)?\)?/gu;

function extractAmountNumbers(text: string, account: FinancialAmountAccount = 'generic'): number[] {
  return [...text.matchAll(AMOUNT_TOKEN)]
    .map((item) => parseFinancialAmountToken(item[0], account))
    .filter((value): value is number => value != null && !isLikelyYear(value));
}

/** 폴더 연도에 해당하는 열 인덱스 — K-IFRS 표준(당기=좌측 첫 열) 우선 */
export function resolveTargetYearColumnIndex(years: number[], targetYear: number): number {
  const directIndex = years.indexOf(targetYear);
  if (directIndex >= 0) return directIndex;

  const sortedDesc = [...years].sort((a, b) => b - a);
  if (sortedDesc[0] === targetYear) return 0;

  const sortedAsc = [...years].sort((a, b) => a - b);
  if (sortedAsc[sortedAsc.length - 1] === targetYear) return years.length - 1;

  return -1;
}

/** 폴더 연도 당기 1개 열만 추출 (전기/전전기 열 무시) */
export function readAmountForFolderYear(
  sectionText: string,
  pattern: RegExp,
  folderYear: number,
  account: FinancialAmountAccount = 'generic',
): number | null {
  const yearsInfo = extractYearColumns(sectionText);
  const fromLines = readAmountsFromLabelLine(sectionText, pattern, account);
  if (fromLines.length === 0) return null;

  if (yearsInfo) {
    const columnIndex = resolveTargetYearColumnIndex(yearsInfo.years, folderYear);
    if (columnIndex >= 0 && fromLines[columnIndex] != null) {
      return fromLines[columnIndex];
    }
    if (folderYear === yearsInfo.latestYear && fromLines.length > 0) {
      return fromLines[0];
    }
  }

  return fromLines[0] ?? null;
}

/** 라벨 행 + 다음 2행까지 금액 후보 수집 */
function readAmountsFromLabelLine(
  sectionText: string,
  pattern: RegExp,
  account: FinancialAmountAccount = 'generic',
): number[] {
  const lines = sectionText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!pattern.test(line)) continue;

    const numbers: number[] = [];
    const onLabel = extractAmountNumbers(line, account);
    if (onLabel.length > 0) numbers.push(...onLabel);

    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      numbers.push(...extractAmountNumbers(lines[j], account));
    }

    if (numbers.length > 0) return numbers;
  }

  return [];
}

/** 손익계산서 — 당기(첫 번째) 금액 열 */
export function readIncomeLineLatestAmount(sectionText: string, pattern: RegExp): number | null {
  const fromLines = readAmountsFromLabelLine(sectionText, pattern, 'generic');
  if (fromLines.length > 0) return fromLines[0];

  const match = sectionText.match(new RegExp(`${pattern.source}[^\\n]{0,120}`, 'u'));
  if (!match) return null;

  const numbers = extractAmountNumbers(match[0], 'generic');
  if (numbers.length === 0) return null;
  return numbers[0];
}

export function readIncomeLineAmountsForFolderYear(
  sectionText: string,
  patterns: RegExp[],
  folderYear: number,
  lineKey: string,
): number | null {
  const account = mapLineKeyToAccount(lineKey);
  for (const pattern of patterns) {
    const value = readAmountForFolderYear(sectionText, pattern, folderYear, account);
    if (value != null) return value;
  }
  return null;
}

export function readIncomeLinePriorAmount(sectionText: string, pattern: RegExp): number | null {
  const fromLines = readAmountsFromLabelLine(sectionText, pattern, 'generic');
  if (fromLines.length >= 2) return fromLines[1];

  const match = sectionText.match(new RegExp(`${pattern.source}[^\\n]{0,120}`, 'u'));
  if (!match) return null;

  const numbers = extractAmountNumbers(match[0], 'generic');
  if (numbers.length < 2) return null;
  return numbers[1];
}

export function readIncomeLineAmounts(
  sectionText: string,
  patterns: RegExp[],
  folderYear?: number,
  lineKey?: string,
): { latest: number | null; prior: number | null } {
  for (const pattern of patterns) {
    if (folderYear != null && lineKey) {
      const latest = readIncomeLineAmountsForFolderYear(sectionText, [pattern], folderYear, lineKey);
      if (latest != null) return { latest, prior: null };
      continue;
    }

    const latest = readIncomeLineLatestAmount(sectionText, pattern);
    const prior = readIncomeLinePriorAmount(sectionText, pattern);
    if (latest != null || prior != null) return { latest, prior };
  }
  return { latest: null, prior: null };
}

const R1 = '(?:Ⅰ|I|1)';
const R2 = '(?:Ⅱ|II|2)';
const R3 = '(?:Ⅲ|III|3)';
const R4 = '(?:Ⅳ|IV|4)';
const R5 = '(?:Ⅴ|V|5)';

export const INCOME_STATEMENT_LINE_PATTERNS: StatementLinePattern[] = [
  {
    key: 'revenue',
    label: '매출액',
    patterns: [
      new RegExp(`${R1}\\.?\\s*매출액`, 'u'),
      /(?<![총])매출액(?:\([^\)]*\))?/u,
    ],
  },
  {
    key: 'costOfGoodsSold',
    label: '매출원가',
    patterns: [new RegExp(`${R2}\\.?\\s*매출원가`, 'u'), /매출원가(?:\([^\)]*\))?/u],
  },
  {
    key: 'grossProfit',
    label: '매출총이익',
    patterns: [new RegExp(`${R3}\\.?\\s*매출총이익`, 'u'), /매출총이익(?:\([^\)]*\))?/u],
  },
  {
    key: 'sga',
    label: '판매비와관리비',
    patterns: [
      new RegExp(`${R4}\\.?\\s*판매비(?:와|및)\\s*(?:일반)?관리비`, 'u'),
      /판매비(?:와|및)\s*(?:일반)?관리비(?:\([^\)]*\))?/u,
      /판관비(?:\([^\)]*\))?/u,
    ],
  },
  {
    key: 'operatingIncome',
    label: '영업이익',
    patterns: [
      new RegExp(`${R5}\\.?\\s*영업(?:손)?이익`, 'u'),
      /영업(?:손)?이익(?:\([^\)]*\))?/u,
    ],
  },
  {
    key: 'netIncome',
    label: '당기순이익',
    patterns: [
      /(?:ⅩⅡ|XII|Ⅻ|XI|Ⅹ|X|12|11|10)\.?\s*당기순이익/u,
      /당기순(?:\(손\))?이익(?:\([^\)]*\))?/u,
    ],
  },
];
