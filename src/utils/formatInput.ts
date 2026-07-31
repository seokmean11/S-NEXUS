/** 계약금액: 천 단위 콤마 표기 */
export function formatAmountInput(value: string | number): string {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

export function parseAmountInput(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  return Number(digits);
}

export interface KoreanDateSegments {
  year: string;
  month: string;
  day: string;
}

/** 2025년 03월 01일 → { year, month, day } */
export function splitKoreanDateSegments(value: string): KoreanDateSegments {
  const digits = value.replace(/\D/g, '');
  return {
    year: digits.slice(0, 4),
    month: digits.slice(4, 6),
    day: digits.slice(6, 8),
  };
}

/** 세그먼트 → 2025년 03월 01일 (부분 입력 허용) */
export function joinKoreanDateSegments({ year, month, day }: KoreanDateSegments): string {
  if (!year && !month && !day) return '';
  if (year.length < 4) return year;
  if (!month) return `${year}년 `;
  if (month.length < 2) return `${year}년 ${month}`;
  if (!day) return `${year}년 ${month}월 `;
  if (day.length < 2) return `${year}년 ${month}월 ${day}`;
  return `${year}년 ${month}월 ${day}일`;
}

/** ISO(YYYY-MM-DD) → 2025년 03월 01일 */
export function formatIsoToKoreanDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${y}년 ${m}월 ${d}일`;
}

/** 입력 중 한국식 날짜 포맷 (년·월·일 자동 부착) */
export function formatKoreanDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';

  const year = digits.slice(0, 4);
  if (digits.length <= 4) {
    return digits.length === 4 ? `${year}년 ` : year;
  }

  const month = digits.slice(4, 6);
  if (digits.length <= 6) {
    return digits.length === 6 ? `${year}년 ${month}월 ` : `${year}년 ${month}`;
  }

  const day = digits.slice(6, 8);
  return digits.length === 8 ? `${year}년 ${month}월 ${day}일` : `${year}년 ${month}월 ${day}`;
}

/** 2025년 03월 01일 → YYYY-MM-DD */
export function parseKoreanDateToIso(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const month = Number(m);
  const day = Number(d);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Number(y), month - 1, day);
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${y}-${m}-${d}`;
}

export function isCompleteKoreanDate(value: string): boolean {
  return parseKoreanDateToIso(value) !== null;
}

const KOREAN_DATE_SLOT_CURSORS = [0, 1, 2, 3, 6, 7, 10, 11] as const;

/** 표시 문자열에서 숫자 문자 위치(최대 8개) */
export function getKoreanDateDigitIndices(display: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < display.length && indices.length < 8; i++) {
    if (/\d/.test(display[i])) indices.push(i);
  }
  return indices;
}

export function getKoreanDateDisplay(value: string): string {
  return joinKoreanDateSegments(splitKoreanDateSegments(value));
}

/** 커서 위치 → 편집 슬롯(0=연 첫째 … 7=일 둘째) */
export function getKoreanDateSlotFromCursor(value: string, cursor: number): number {
  const display = getKoreanDateDisplay(value);
  if (!display) return 0;

  const indices = getKoreanDateDigitIndices(display);
  for (let slot = 0; slot < indices.length; slot++) {
    if (cursor <= indices[slot]) return slot;
  }

  if (cursor <= 4) return Math.min(3, indices.length);
  if (cursor <= 8) return cursor <= 6 ? 4 : 5;
  return cursor <= 10 ? 6 : 7;
}

/** 슬롯 → 커서 위치(해당 숫자만 선택·수정) */
export function getKoreanDateCursorForSlot(value: string, slot: number): number {
  const display = getKoreanDateDisplay(value);
  const indices = getKoreanDateDigitIndices(display);
  if (slot < indices.length) return indices[slot];

  const digits = value.replace(/\D/g, '');
  if (slot < 4) return Math.min(slot, display.length);
  if (digits.length < 4) return display.length;

  return KOREAN_DATE_SLOT_CURSORS[Math.min(slot, 7)] ?? display.length;
}

export function setKoreanDateDigitAtSlot(value: string, slot: number, digit: string): string {
  const parts = splitKoreanDateSegments(value);
  const seg = slot < 4 ? 'year' : slot < 6 ? 'month' : 'day';
  const localIdx = slot < 4 ? slot : slot < 6 ? slot - 4 : slot - 6;
  const maxLen = seg === 'year' ? 4 : 2;
  const chars = parts[seg].split('');

  if (localIdx < chars.length) chars[localIdx] = digit;
  else {
    while (chars.length < localIdx) chars.push('0');
    chars.push(digit);
  }

  parts[seg] = chars.join('').slice(0, maxLen);
  return joinKoreanDateSegments(parts);
}

export function clearKoreanDateDigitAtSlot(value: string, slot: number): string {
  const parts = splitKoreanDateSegments(value);
  if (slot < 4) parts.year = parts.year.slice(0, slot) + parts.year.slice(slot + 1);
  else if (slot < 6) {
    const i = slot - 4;
    parts.month = parts.month.slice(0, i) + parts.month.slice(i + 1);
  } else {
    const i = slot - 6;
    parts.day = parts.day.slice(0, i) + parts.day.slice(i + 1);
  }
  return joinKoreanDateSegments(parts);
}

export function applyKoreanDatePaste(_value: string, raw: string): string {
  return joinKoreanDateSegments(splitKoreanDateSegments(raw));
}
