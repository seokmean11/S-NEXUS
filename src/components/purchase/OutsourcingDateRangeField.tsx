import { memo, useRef, useState } from 'react';
import type { OutsourcingDateRange } from '@/types/outsourcing';
import { EMPTY_OUTSOURCING_DATE_RANGE } from '@/types/outsourcing';
import {
  clearRangeDigitAt,
  clearRangeDigitsFrom,
  clampRangeDigitIndex,
  getDateDigitSlots,
  getInitialRangeDigitIndex,
  getRangeDigitValue,
  isCompleteDateDigits,
  isOutsourcingDateRangeActive,
  isOutsourcingDateRangeInvalid,
  setRangeDigitAt,
} from '@/utils/outsourcingDate';

interface OutsourcingDateRangeFieldProps {
  dateRange: OutsourcingDateRange;
  onChange: (dateRange: OutsourcingDateRange) => void;
}

interface MaskedDateDigitsProps {
  digits: string;
  rangeOffset: number;
  cursorDigit: number;
  focused: boolean;
}

function MaskedDateDigits({ digits, rangeOffset, cursorDigit, focused }: MaskedDateDigitsProps) {
  const slots = getDateDigitSlots(digits);

  const renderDigit = (localIndex: number) => {
    const rangeIndex = rangeOffset + localIndex;
    const isActive = focused && cursorDigit === rangeIndex;

    return (
      <span
        key={localIndex}
        className={`outsourcing-date-range-field__digit ${isActive ? 'outsourcing-date-range-field__digit--active' : ''}`}
        data-digit-index={rangeIndex}
        aria-current={isActive ? 'true' : undefined}
      >
        {slots[localIndex]}
      </span>
    );
  };

  return (
    <span className="outsourcing-date-range-field__date" data-range-part={rangeOffset === 0 ? 'start' : 'end'}>
      {renderDigit(0)}
      {renderDigit(1)}
      {renderDigit(2)}
      {renderDigit(3)}
      <span className="outsourcing-date-range-field__suffix" aria-hidden>
        년
      </span>
      {renderDigit(4)}
      {renderDigit(5)}
      <span className="outsourcing-date-range-field__suffix" aria-hidden>
        월
      </span>
      {renderDigit(6)}
      {renderDigit(7)}
      <span className="outsourcing-date-range-field__suffix" aria-hidden>
        일
      </span>
    </span>
  );
}

function OutsourcingDateRangeFieldComponent({ dateRange, onChange }: OutsourcingDateRangeFieldProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [cursorDigit, setCursorDigit] = useState(0);
  const [focused, setFocused] = useState(false);
  const isActive = isOutsourcingDateRangeActive(dateRange);
  const isInvalid = isOutsourcingDateRangeInvalid(dateRange);
  const startIncomplete =
    dateRange.startDigits.length > 0 && !isCompleteDateDigits(dateRange.startDigits);
  const endIncomplete =
    dateRange.endDigits.length > 0 && !isCompleteDateDigits(dateRange.endDigits);
  const hasError = isInvalid || startIncomplete || endIncomplete;

  const focusDigit = (rangeDigitIndex: number) => {
    const nextIndex = clampRangeDigitIndex(rangeDigitIndex);
    setCursorDigit(nextIndex);
    controlRef.current?.focus();
  };

  const handleFocus = () => {
    setFocused(true);
    setCursorDigit(getInitialRangeDigitIndex(dateRange));
  };

  const handleBlur = () => {
    setFocused(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const digitTarget = (event.target as HTMLElement).closest('[data-digit-index]');
    if (digitTarget) {
      focusDigit(Number(digitTarget.getAttribute('data-digit-index')));
      return;
    }

    const partTarget = (event.target as HTMLElement).closest('[data-range-part]');
    if (partTarget?.getAttribute('data-range-part') === 'end') {
      focusDigit(8);
      return;
    }

    focusDigit(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      onChange(setRangeDigitAt(dateRange, cursorDigit, event.key));
      setCursorDigit((current) => Math.min(current + 1, 15));
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (getRangeDigitValue(dateRange, cursorDigit)) {
        onChange(clearRangeDigitAt(dateRange, cursorDigit));
        return;
      }
      if (cursorDigit > 0) {
        const prevIndex = cursorDigit - 1;
        onChange(clearRangeDigitAt(dateRange, prevIndex));
        setCursorDigit(prevIndex);
      }
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      onChange(clearRangeDigitsFrom(dateRange, cursorDigit));
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setCursorDigit((current) => clampRangeDigitIndex(current - 1));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setCursorDigit((current) => clampRangeDigitIndex(current + 1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setCursorDigit(cursorDigit >= 8 ? 8 : 0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setCursorDigit(cursorDigit >= 8 ? 15 : 7);
    }
  };

  return (
    <div className="outsourcing-filter-field">
      <div className="outsourcing-filter-field__header">
        <span className="form-field__label">기간검색</span>
        {isActive && (
          <button
            type="button"
            className="outsourcing-filter-field__clear-all"
            onClick={() => onChange({ ...EMPTY_OUTSOURCING_DATE_RANGE })}
          >
            모두 삭제
          </button>
        )}
      </div>

      <div
        ref={controlRef}
        className={`outsourcing-filter-field__control outsourcing-date-range-field__control ${focused ? 'outsourcing-filter-field__control--open' : ''} ${hasError ? 'outsourcing-date-range-field__control--invalid' : ''}`}
        tabIndex={0}
        role="textbox"
        aria-label="기간검색 시작일 ----년--월--일 종료일 ----년--월--일 형식"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="outsourcing-date-range-field__inner">
          <span className="outsourcing-date-range-field__inline-label">시작일</span>
          <MaskedDateDigits
            digits={dateRange.startDigits}
            rangeOffset={0}
            cursorDigit={cursorDigit}
            focused={focused}
          />
          <span className="outsourcing-date-range-field__sep">~</span>
          <span className="outsourcing-date-range-field__inline-label">종료일</span>
          <MaskedDateDigits
            digits={dateRange.endDigits}
            rangeOffset={8}
            cursorDigit={cursorDigit}
            focused={focused}
          />
        </div>
      </div>

      {startIncomplete && (
        <p className="outsourcing-date-range-field__error">
          시작일을 ----년--월--일 형식으로 모두 입력해 주세요.
        </p>
      )}
      {!startIncomplete && endIncomplete && (
        <p className="outsourcing-date-range-field__error">
          종료일을 ----년--월--일 형식으로 모두 입력해 주세요.
        </p>
      )}
      {isInvalid && (
        <p className="outsourcing-date-range-field__error">시작일은 종료일보다 이후일 수 없습니다.</p>
      )}
    </div>
  );
}

export const OutsourcingDateRangeField = memo(OutsourcingDateRangeFieldComponent);
