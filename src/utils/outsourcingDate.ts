import type { OutsourcingDateRange } from '@/types/outsourcing';

const DIGIT_COUNT = 8;
const RANGE_DIGIT_COUNT = 16;
const DATE_DISPLAY_LENGTH = 11;
const RANGE_SEPARATOR = ' ~ ';

export function formatMaskedDateDisplay(digits: string): string {
  const slots = getDateDigitSlots(digits);
  return `${slots.slice(0, 4).join('')}년${slots.slice(4, 6).join('')}월${slots.slice(6, 8).join('')}일`;
}

export function getDateDigitSlots(digits: string): string[] {
  return Array.from({ length: DIGIT_COUNT }, (_, index) => {
    const value = digits[index];
    return value && /\d/.test(value) ? value : '-';
  });
}

export function formatMaskedDateRangeDisplay(startDigits: string, endDigits: string): string {
  return `${formatMaskedDateDisplay(startDigits)}${RANGE_SEPARATOR}${formatMaskedDateDisplay(endDigits)}`;
}

export function digitIndexToCharIndex(digitIndex: number): number {
  if (digitIndex <= 3) return digitIndex;
  if (digitIndex <= 5) return 5 + (digitIndex - 4);
  return 8 + (digitIndex - 6);
}

export function charIndexToDigitIndex(charIndex: number): number {
  if (charIndex <= 3) return Math.min(charIndex, 3);
  if (charIndex <= 6) return Math.min(4 + (charIndex - 5), 5);
  return Math.min(6 + (charIndex - 8), 7);
}

export function clampDigitIndex(index: number): number {
  return Math.max(0, Math.min(index, DIGIT_COUNT - 1));
}

export function clampRangeDigitIndex(index: number): number {
  return Math.max(0, Math.min(index, RANGE_DIGIT_COUNT - 1));
}

export function rangeDigitIndexToCharIndex(rangeDigitIndex: number): number {
  if (rangeDigitIndex <= 7) {
    return digitIndexToCharIndex(rangeDigitIndex);
  }

  const endDigitIndex = rangeDigitIndex - 8;
  return DATE_DISPLAY_LENGTH + RANGE_SEPARATOR.length + digitIndexToCharIndex(endDigitIndex);
}

export function rangeCharIndexToDigitIndex(charIndex: number): number {
  const separatorStart = DATE_DISPLAY_LENGTH;

  if (charIndex < separatorStart) {
    return charIndexToDigitIndex(charIndex);
  }

  if (charIndex < separatorStart + RANGE_SEPARATOR.length) {
    return charIndex <= separatorStart + 1 ? 7 : 8;
  }

  const endCharIndex = charIndex - separatorStart - RANGE_SEPARATOR.length;
  return 8 + charIndexToDigitIndex(endCharIndex);
}

export function getInitialRangeDigitIndex(dateRange: OutsourcingDateRange): number {
  if (dateRange.startDigits.length < DIGIT_COUNT) {
    return clampRangeDigitIndex(dateRange.startDigits.length);
  }
  if (dateRange.endDigits.length < DIGIT_COUNT) {
    return 8 + clampDigitIndex(dateRange.endDigits.length);
  }
  return RANGE_DIGIT_COUNT - 1;
}

export function setRangeDigitAt(
  dateRange: OutsourcingDateRange,
  rangeDigitIndex: number,
  digit: string,
): OutsourcingDateRange {
  if (rangeDigitIndex <= 7) {
    return {
      ...dateRange,
      startDigits: setDateDigitAt(dateRange.startDigits, rangeDigitIndex, digit),
    };
  }

  return {
    ...dateRange,
    endDigits: setDateDigitAt(dateRange.endDigits, rangeDigitIndex - 8, digit),
  };
}

export function clearRangeDigitAt(
  dateRange: OutsourcingDateRange,
  rangeDigitIndex: number,
): OutsourcingDateRange {
  if (rangeDigitIndex <= 7) {
    return {
      ...dateRange,
      startDigits: clearDateDigitAt(dateRange.startDigits, rangeDigitIndex),
    };
  }

  return {
    ...dateRange,
    endDigits: clearDateDigitAt(dateRange.endDigits, rangeDigitIndex - 8),
  };
}

export function clearRangeDigitsFrom(
  dateRange: OutsourcingDateRange,
  rangeDigitIndex: number,
): OutsourcingDateRange {
  if (rangeDigitIndex <= 7) {
    return {
      ...dateRange,
      startDigits: clearDateDigitsFrom(dateRange.startDigits, rangeDigitIndex),
    };
  }

  return {
    ...dateRange,
    endDigits: clearDateDigitsFrom(dateRange.endDigits, rangeDigitIndex - 8),
  };
}

export function getRangeDigitValue(dateRange: OutsourcingDateRange, rangeDigitIndex: number): string {
  if (rangeDigitIndex <= 7) {
    return dateRange.startDigits[rangeDigitIndex] ?? '';
  }
  return dateRange.endDigits[rangeDigitIndex - 8] ?? '';
}

export function isCompleteDateDigits(digits: string): boolean {
  return /^\d{8}$/.test(digits);
}

export function dateDigitsToTimestamp(digits: string): number | null {
  if (!isCompleteDateDigits(digits)) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.setHours(0, 0, 0, 0);
}

export function parseContractDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    return dateDigitsToTimestamp(
      `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    );
  }

  const isoMatch = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return dateDigitsToTimestamp(
      `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    );
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return dateDigitsToTimestamp(trimmed);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;

  const date = new Date(parsed);
  return dateDigitsToTimestamp(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`,
  );
}

export function isOutsourcingDateRangeActive(dateRange: OutsourcingDateRange): boolean {
  return isCompleteDateDigits(dateRange.startDigits) || isCompleteDateDigits(dateRange.endDigits);
}

export function isOutsourcingDateRangeInvalid(dateRange: OutsourcingDateRange): boolean {
  const startTs = dateDigitsToTimestamp(dateRange.startDigits);
  const endTs = dateDigitsToTimestamp(dateRange.endDigits);
  if (startTs == null || endTs == null) return false;
  return startTs > endTs;
}

export function setDateDigitAt(digits: string, digitIndex: number, digit: string): string {
  const slots = Array.from({ length: DIGIT_COUNT }, (_, index) => digits[index] ?? '');
  slots[digitIndex] = digit;

  let end = DIGIT_COUNT;
  while (end > 0 && !slots[end - 1]) {
    end -= 1;
  }

  return slots.slice(0, Math.max(end, digitIndex + 1)).join('');
}

export function clearDateDigitAt(digits: string, digitIndex: number): string {
  const slots = Array.from({ length: DIGIT_COUNT }, (_, index) => digits[index] ?? '');
  slots[digitIndex] = '';

  let end = DIGIT_COUNT;
  while (end > 0 && !slots[end - 1]) {
    end -= 1;
  }

  return slots.slice(0, end).join('');
}

export function clearDateDigitsFrom(digits: string, digitIndex: number): string {
  const slots = Array.from({ length: DIGIT_COUNT }, (_, index) => digits[index] ?? '');
  for (let index = digitIndex; index < DIGIT_COUNT; index += 1) {
    slots[index] = '';
  }

  let end = DIGIT_COUNT;
  while (end > 0 && !slots[end - 1]) {
    end -= 1;
  }

  return slots.slice(0, end).join('');
}
