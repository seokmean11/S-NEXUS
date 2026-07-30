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
