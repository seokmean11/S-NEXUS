import * as XLSX from 'xlsx';

export const MIN_SHEET_BID_CANDIDATE = 100_000;
const VAT_RATIO = 1.1;
const VAT_RATIO_TOLERANCE = 0.003;

/** 부가세 포함 표현 — VAT포함, 부가세포함, 부가가치세포함 등 */
export const VAT_INCLUSIVE_LABEL_PATTERN =
  /VAT\s*포함|VAT포함|VAT\s*included|부가\s*세\s*포함|부가세\s*포함|부가가치세\s*포함|부가가치세포함|세\s*포함\s*합계/i;

export const VAT_TOTAL_ROW_PATTERN = /합\s*계|총\s*계|합계|총계/;

/** 금액·견적 맥락 — 없으면 콤마 숫자만으로는 후보 제외 */
const AMOUNT_CONTEXT_PATTERN =
  /(?:금\s*액|합\s*계|총\s*액|공\s*사\s*금\s*액|견\s*적\s*금\s*액|견\s*적\s*합\s*계|입\s*찰\s*금\s*액|원\s*정|원\b|V\.?\s*A\.?\s*T|VAT|\\?\([\d,]+\))/i;

export interface VatInclusiveAmountFinding {
  sheetName: string;
  rowIndex: number;
  colIndex: number;
  amount: number;
  rowLabel: string;
  reason: 'explicit_label' | 'vat_ratio_total_row';
}

export interface OtherSheetBidResolution {
  finalBidAmount: number;
  exVatMaxOnOtherSheets: number | null;
  excludedVatInclusiveMax: number | null;
  vatInclusiveFindings: VatInclusiveAmountFinding[];
}

type SheetAmountHit = {
  sheetName: string;
  rowIndex: number;
  colIndex: number;
  amount: number;
  rowText: string;
  isVatInclusive: boolean;
  reason?: VatInclusiveAmountFinding['reason'];
};

const DATE_TEXT_PATTERN = /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/;
const DATE_ISO_PATTERN = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;
const PHONE_PATTERN = /^01[016789]\d{7,8}$/;

/** `\39,000,000` · `(39,000,000)` · 금액 키워드 뒤 콤마 숫자 */
const WON_AMOUNT_IN_TEXT_PATTERNS: Array<{ pattern: RegExp; requiresContext: boolean }> = [
  { pattern: /\\?\(\s*([\d,]{6,})\s*\)/g, requiresContext: false },
  {
    pattern:
      /(?:금\s*액|합\s*계|총\s*액|공\s*사\s*금\s*액|견\s*적\s*금\s*액)[^0-9\\(]*\\?\(?\s*([\d,]{6,})/gi,
    requiresContext: false,
  },
  { pattern: /([\d]{1,3}(?:,\d{3}){2,})/g, requiresContext: true },
];

function roundWon(value: number): number {
  return Math.round(value);
}

function looksLikeDateText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return DATE_TEXT_PATTERN.test(trimmed) || DATE_ISO_PATTERN.test(trimmed);
}

function looksLikeDateNumber(num: number, sourceText?: string): boolean {
  if (sourceText && looksLikeDateText(sourceText)) return true;

  const n = Math.round(Math.abs(num));
  if (n < 19000101 || n > 20991231) return false;

  const year = Math.floor(n / 10000);
  const month = Math.floor((n % 10000) / 100);
  const day = n % 100;
  return year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function hasAmountContext(text: string): boolean {
  return AMOUNT_CONTEXT_PATTERN.test(text);
}

function isDateOnlyRow(rowText: string): boolean {
  const normalized = rowText.replace(/\|+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (hasAmountContext(normalized)) return false;
  return looksLikeDateText(normalized) || DATE_ISO_PATTERN.test(normalized);
}

function looksLikePhoneNumber(num: number, sourceText?: string): boolean {
  if (!sourceText) return false;
  const digits = sourceText.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(digits)) return false;
  return roundWon(num) === roundWon(Number(digits));
}

function shouldRejectMisrecognizedAmount(
  amount: number,
  rowText: string,
  cellValue: unknown,
): boolean {
  const cellText = typeof cellValue === 'string' ? cellValue.trim() : '';

  if (looksLikeDateNumber(amount, cellText)) return true;
  if (rowText && looksLikeDateNumber(amount) && DATE_TEXT_PATTERN.test(rowText.replace(/\|/g, ' '))) {
    return true;
  }
  if (isDateOnlyRow(rowText)) return true;
  if (looksLikePhoneNumber(amount, cellText)) return true;

  return false;
}

function parseSheetCellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (looksLikeDateNumber(value)) return null;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-') return null;
    if (looksLikeDateText(trimmed)) return null;

    const digits = trimmed.replace(/[^\d.-]/g, '');
    if (!digits || digits === '-' || digits === '.') return null;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return null;
    if (looksLikeDateNumber(parsed, trimmed)) return null;
    return parsed;
  }
  return null;
}

function extractWonAmountsFromText(text: string): number[] {
  if (!text.trim() || looksLikeDateText(text)) return [];

  const found = new Set<number>();
  const rowHasContext = hasAmountContext(text);

  for (const { pattern, requiresContext } of WON_AMOUNT_IN_TEXT_PATTERNS) {
    if (requiresContext && !rowHasContext) continue;

    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? match[0];
      const digits = raw.replace(/[^\d]/g, '');
      if (!digits) continue;
      const parsed = Number(digits);
      if (!Number.isFinite(parsed) || parsed < MIN_SHEET_BID_CANDIDATE) continue;
      if (looksLikeDateNumber(parsed, text)) continue;
      found.add(roundWon(parsed));
    }
  }

  return [...found];
}

function collectAmountsFromCell(value: unknown, rowText: string): number[] {
  if (isDateOnlyRow(rowText) && (typeof value !== 'string' || looksLikeDateText(String(value)))) {
    return [];
  }

  const amounts: number[] = [];
  const direct = parseSheetCellNumber(value);
  if (direct != null && direct >= MIN_SHEET_BID_CANDIDATE) {
    amounts.push(roundWon(direct));
  }
  if (typeof value === 'string') {
    amounts.push(...extractWonAmountsFromText(value));
  }

  return [...new Set(amounts)].filter(
    (amount) => !shouldRejectMisrecognizedAmount(amount, rowText, value),
  );
}

function normalizeRowText(row: unknown[]): string {
  return row.map((cell) => String(cell ?? '')).join('|');
}

function isApproxVatMultiple(larger: number, smaller: number): boolean {
  if (smaller <= 0 || larger <= smaller) return false;
  return Math.abs(larger / smaller - VAT_RATIO) <= VAT_RATIO_TOLERANCE;
}

function markVatInclusiveHits(hits: SheetAmountHit[]): void {
  const byRow = new Map<string, SheetAmountHit[]>();
  for (const hit of hits) {
    const key = `${hit.sheetName}::${hit.rowIndex}`;
    const group = byRow.get(key) ?? [];
    group.push(hit);
    byRow.set(key, group);
  }

  for (const group of byRow.values()) {
    const rowText = group[0]?.rowText ?? '';
    const hasExplicitLabel = VAT_INCLUSIVE_LABEL_PATTERN.test(rowText);
    const hasTotalKeyword = VAT_TOTAL_ROW_PATTERN.test(rowText);

    if (hasExplicitLabel) {
      for (const hit of group) {
        hit.isVatInclusive = true;
        hit.reason = 'explicit_label';
      }
    }

    const amounts = [...new Set(group.map((hit) => hit.amount))].sort((a, b) => a - b);
    for (const larger of amounts) {
      for (const smaller of amounts) {
        if (!isApproxVatMultiple(larger, smaller)) continue;
        if (!hasTotalKeyword && !hasExplicitLabel) continue;

        for (const hit of group) {
          if (hit.amount !== larger) continue;
          hit.isVatInclusive = true;
          hit.reason = 'vat_ratio_total_row';
        }
      }
    }
  }
}

function collectOtherSheetAmountHits(
  workbook: XLSX.WorkBook,
  detailSheetName: string,
): SheetAmountHit[] {
  const hits: SheetAmountHit[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === detailSheetName) continue;

    const sheet = workbook.Sheets[sheetName];
    const ref = sheet?.['!ref'];
    if (!ref) continue;

    const range = XLSX.utils.decode_range(ref);
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
      const row: unknown[] = [];
      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = sheet[addr];
        row[colIndex] = cell?.v ?? '';
      }

      const rowText = normalizeRowText(row);
      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = sheet[addr];
        if (!cell) continue;

        for (const amount of collectAmountsFromCell(cell.v, rowText)) {
          hits.push({
            sheetName,
            rowIndex,
            colIndex,
            amount,
            rowText,
            isVatInclusive: false,
          });
        }
      }
    }
  }

  markVatInclusiveHits(hits);
  return hits;
}

/**
 * 입찰금액 산출 — 상세내역 합산 우선.
 * 다른 시트 금액은 상세 합산보다 클 때만 반영(관리비·경비 등).
 * 상세 합산 미만 후보(날짜·기타 오인식)는 제외하고, 유효 후보 중 최대값과 상세 합산 중 큰 값을 사용.
 */
export function resolveFinalBidAmount(
  detailLineTotal: number,
  exVatMaxOnOtherSheets: number | null,
): number {
  if (detailLineTotal > 0) {
    return Math.max(detailLineTotal, exVatMaxOnOtherSheets ?? 0);
  }
  return exVatMaxOnOtherSheets ?? 0;
}

export function resolveOtherSheetBidAmount(
  workbook: XLSX.WorkBook,
  detailSheetName: string,
  detailLineTotal: number,
): OtherSheetBidResolution {
  const hits = collectOtherSheetAmountHits(workbook, detailSheetName);

  const exVatHits = hits.filter((hit) => !hit.isVatInclusive);
  const vatHits = hits.filter((hit) => hit.isVatInclusive);

  const plausibleExVatHits =
    detailLineTotal > 0
      ? exVatHits.filter((hit) => hit.amount >= detailLineTotal)
      : exVatHits;

  const exVatMaxOnOtherSheets =
    plausibleExVatHits.length > 0
      ? Math.max(...plausibleExVatHits.map((hit) => hit.amount))
      : null;

  const excludedVatInclusiveMax =
    vatHits.length > 0 ? Math.max(...vatHits.map((hit) => hit.amount)) : null;

  const finalBidAmount = resolveFinalBidAmount(detailLineTotal, exVatMaxOnOtherSheets);

  const vatInclusiveFindings: VatInclusiveAmountFinding[] = vatHits.map((hit) => ({
    sheetName: hit.sheetName,
    rowIndex: hit.rowIndex,
    colIndex: hit.colIndex,
    amount: hit.amount,
    rowLabel: hit.rowText.replace(/\|+/g, ' ').trim().slice(0, 120),
    reason: hit.reason ?? 'vat_ratio_total_row',
  }));

  return {
    finalBidAmount,
    exVatMaxOnOtherSheets,
    excludedVatInclusiveMax,
    vatInclusiveFindings,
  };
}
