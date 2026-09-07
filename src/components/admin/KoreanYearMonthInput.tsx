import { useEffect, useRef, useState } from 'react';
import {
  formatKoreanYearMonthInput,
  formatMonthKeyToKorean,
  parseKoreanYearMonthToKey,
} from '@/utils/formatInput';

interface KoreanYearMonthInputProps {
  label?: string;
  value: string;
  onChange: (monthKey: string) => void;
  existingMonthKeys?: string[];
  className?: string;
  autoOpen?: boolean;
}

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function KoreanYearMonthInput({
  label,
  value,
  onChange,
  existingMonthKeys = [],
  className,
  autoOpen = false,
}: KoreanYearMonthInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [draft, setDraft] = useState(formatMonthKeyToKorean(value));
  const selected = parseKoreanYearMonthToKey(value) ?? value;
  const selectedYear = Number((selected || new Date().toISOString().slice(0, 7)).slice(0, 4));
  const selectedMonth = Number((selected || new Date().toISOString().slice(0, 7)).slice(5, 7));
  const [pickerYear, setPickerYear] = useState(selectedYear || new Date().getFullYear());

  useEffect(() => {
    setDraft(formatMonthKeyToKorean(value));
  }, [value]);

  useEffect(() => {
    if (open) setPickerYear(selectedYear || new Date().getFullYear());
  }, [open, selectedYear]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const commitDraft = (next: string) => {
    const key = parseKoreanYearMonthToKey(next);
    if (key) {
      onChange(key);
      setDraft(formatMonthKeyToKorean(key));
    } else {
      setDraft(formatMonthKeyToKorean(value));
    }
  };

  const pickMonth = (month: number) => {
    const key = `${pickerYear}-${String(month).padStart(2, '0')}`;
    onChange(key);
    setDraft(formatMonthKeyToKorean(key));
    setOpen(false);
  };

  return (
    <div className={`form-field korean-year-month${className ? ` ${className}` : ''}`} ref={rootRef}>
      {label && <span className="form-field__label">{label}</span>}
      <div className="korean-year-month__bar">
        <input
          type="text"
          className="form-field__input korean-year-month__input"
          inputMode="numeric"
          value={draft}
          placeholder="YYYY년 MM월"
          aria-label={label ?? '연월'}
          aria-expanded={open}
          onChange={(event) => setDraft(formatKoreanYearMonthInput(event.target.value))}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => commitDraft(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft(draft);
              setOpen(false);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <div className="korean-year-month__picker" role="dialog" aria-label="한글 연월 달력">
          <div className="korean-year-month__year">
            <button type="button" onClick={() => setPickerYear((year) => year - 1)} aria-label="이전 해">
              ‹
            </button>
            <strong>{pickerYear}년</strong>
            <button type="button" onClick={() => setPickerYear((year) => year + 1)} aria-label="다음 해">
              ›
            </button>
          </div>
          <div className="korean-year-month__months">
            {MONTH_LABELS.map((labelText, index) => {
              const month = index + 1;
              const key = `${pickerYear}-${String(month).padStart(2, '0')}`;
              const active = pickerYear === selectedYear && month === selectedMonth;
              const hasReport = existingMonthKeys.includes(key);
              return (
                <button
                  key={labelText}
                  type="button"
                  className={`${active ? 'is-active' : ''}${hasReport ? ' has-report' : ''}`.trim()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickMonth(month);
                  }}
                >
                  {labelText}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
