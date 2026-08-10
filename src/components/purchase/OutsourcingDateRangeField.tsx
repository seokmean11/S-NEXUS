import { memo, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { OutsourcingDateRange } from '@/types/outsourcing';
import { EMPTY_OUTSOURCING_DATE_RANGE } from '@/types/outsourcing';
import {
  clearRangeDigitAt,
  clearRangeDigitsFrom,
  clampRangeDigitIndex,
  getDateDigitSlots,
  getInitialRangeDigitIndex,
  getOutsourcingDateFilterCommitKey,
  getRangeDigitValue,
  isCompleteDateWithYearDigits,
  isOutsourcingDateRangeActive,
  isOutsourcingDateRangeInvalid,
  isOutsourcingDateRangeReady,
  getOutsourcingDateFieldIncompleteMessage,
  getOutsourcingDateRangeInvalidMessage,
  setRangeDigitAt,
} from '@/utils/outsourcingDate';

interface OutsourcingDateRangeFieldProps {
  dateRange: OutsourcingDateRange;
  onChange: (dateRange: OutsourcingDateRange) => void;
  onActivate?: () => void;
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

function OutsourcingDateRangeFieldComponent({
  dateRange,
  onChange,
  onActivate,
}: OutsourcingDateRangeFieldProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;

  const [draftDateRange, setDraftDateRange] = useState(dateRange);
  const [cursorDigit, setCursorDigit] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraftDateRange(dateRange);
  }, [dateRange, focused]);

  const tryCommitDateRange = useCallback(
    (next: OutsourcingDateRange) => {
      const nextKey = getOutsourcingDateFilterCommitKey(next);
      const currentKey = getOutsourcingDateFilterCommitKey(dateRangeRef.current);
      if (nextKey === '') return;
      if (nextKey === currentKey) return;
      startTransition(() => {
        onChange(next);
      });
    },
    [onChange],
  );

  const applyDraftDateRange = useCallback(
    (next: OutsourcingDateRange) => {
      setDraftDateRange(next);
      tryCommitDateRange(next);
    },
    [tryCommitDateRange],
  );

  const isActive = isOutsourcingDateRangeActive(draftDateRange);
  const isSearchReady = isOutsourcingDateRangeReady(draftDateRange);
  const isInvalid = isOutsourcingDateRangeInvalid(draftDateRange);
  const invalidMessage = getOutsourcingDateRangeInvalidMessage(draftDateRange);
  const startIncompleteMessage = getOutsourcingDateFieldIncompleteMessage(
    draftDateRange.startDigits,
    '시작일',
  );
  const endIncompleteMessage = getOutsourcingDateFieldIncompleteMessage(
    draftDateRange.endDigits,
    '종료일',
  );
  const hasError = isInvalid || Boolean(startIncompleteMessage) || Boolean(endIncompleteMessage);

  const focusDigit = (rangeDigitIndex: number) => {
    const nextIndex = clampRangeDigitIndex(rangeDigitIndex);
    setCursorDigit(nextIndex);
    controlRef.current?.focus();
  };

  const handleFocus = () => {
    onActivate?.();
    setFocused(true);
    setCursorDigit(getInitialRangeDigitIndex(draftDateRange));
  };

  const handleBlur = () => {
    setFocused(false);
    const commitKey = getOutsourcingDateFilterCommitKey(draftDateRange);
    if (commitKey !== '') {
      tryCommitDateRange(draftDateRange);
      return;
    }
    if (!isOutsourcingDateRangeActive(draftDateRange)) {
      tryCommitDateRange({ ...EMPTY_OUTSOURCING_DATE_RANGE });
      return;
    }
    setDraftDateRange(dateRangeRef.current);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onActivate?.();

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
      applyDraftDateRange(setRangeDigitAt(draftDateRange, cursorDigit, event.key));
      setCursorDigit((current) => Math.min(current + 1, 15));
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (getRangeDigitValue(draftDateRange, cursorDigit)) {
        applyDraftDateRange(clearRangeDigitAt(draftDateRange, cursorDigit));
        return;
      }
      if (cursorDigit > 0) {
        const prevIndex = cursorDigit - 1;
        applyDraftDateRange(clearRangeDigitAt(draftDateRange, prevIndex));
        setCursorDigit(prevIndex);
      }
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      applyDraftDateRange(clearRangeDigitsFrom(draftDateRange, cursorDigit));
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

  const handleClearAll = () => {
    applyDraftDateRange({ ...EMPTY_OUTSOURCING_DATE_RANGE });
  };

  return (
    <div className="outsourcing-filter-field">
      <div className="outsourcing-filter-field__header">
        <span className="form-field__label">기간검색</span>
        {isActive && (
          <button
            type="button"
            className="outsourcing-filter-field__clear-all"
            onClick={handleClearAll}
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
        aria-label="기간검색 시작일 연도 포함 ----년--월--일 종료일 연도 포함 ----년--월--일 형식"
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="outsourcing-date-range-field__inner">
          <span className="outsourcing-date-range-field__inline-label">시작일</span>
          <MaskedDateDigits
            digits={draftDateRange.startDigits}
            rangeOffset={0}
            cursorDigit={cursorDigit}
            focused={focused}
          />
          <span className="outsourcing-date-range-field__sep">~</span>
          <span className="outsourcing-date-range-field__inline-label">종료일</span>
          <MaskedDateDigits
            digits={draftDateRange.endDigits}
            rangeOffset={8}
            cursorDigit={cursorDigit}
            focused={focused}
          />
        </div>
      </div>

      {!startIncompleteMessage && !endIncompleteMessage && !isInvalid && isSearchReady && (
        <p className="outsourcing-date-range-field__hint">
          {isCompleteDateWithYearDigits(draftDateRange.startDigits) &&
          isCompleteDateWithYearDigits(draftDateRange.endDigits)
            ? '외주계약일 기준 · 연도 포함 · 시작일~종료일 사이 (양쪽 포함)'
            : isCompleteDateWithYearDigits(draftDateRange.startDigits)
              ? '외주계약일 기준 · 연도 포함 · 시작일 이후 (시작일 포함)'
              : '외주계약일 기준 · 연도 포함 · 종료일까지 (종료일 포함)'}
        </p>
      )}
      {startIncompleteMessage && (
        <p className="outsourcing-date-range-field__error">{startIncompleteMessage}</p>
      )}
      {!startIncompleteMessage && endIncompleteMessage && (
        <p className="outsourcing-date-range-field__error">{endIncompleteMessage}</p>
      )}
      {isInvalid && invalidMessage && (
        <p className="outsourcing-date-range-field__error">{invalidMessage}</p>
      )}
    </div>
  );
}

export const OutsourcingDateRangeField = memo(OutsourcingDateRangeFieldComponent);
