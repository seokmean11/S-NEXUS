import { useEffect, useRef } from 'react';
import {
  applyKoreanDateTimePaste,
  clearKoreanDateTimeDigitAtSlot,
  getKoreanDateTimeCursorForSlot,
  getKoreanDateTimeDigitIndices,
  getKoreanDateTimeDisplay,
  getKoreanDateTimeSlotFromCursor,
  setKoreanDateTimeDigitAtSlot,
} from '@/utils/formatInput';

interface KoreanDateTimeInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function KoreanDateTimeInput({
  label,
  value,
  onChange,
  required,
  disabled,
}: KoreanDateTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);
  const display = getKoreanDateTimeDisplay(value);
  const inputId = label?.replace(/\s/g, '-').toLowerCase();

  const syncSelection = (slot: number) => {
    slotRef.current = slot;
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const pos = getKoreanDateTimeCursorForSlot(value, slot);
      const indices = getKoreanDateTimeDigitIndices(getKoreanDateTimeDisplay(value));
      const end = indices[slot] != null ? indices[slot] + 1 : pos + 1;
      input.setSelectionRange(pos, Math.min(end, display.length || pos + 1));
    });
  };

  useEffect(() => {
    syncSelection(slotRef.current);
  }, [display]);

  const handleFocus = () => {
    const slot = value ? getKoreanDateTimeSlotFromCursor(value, 0) : 0;
    syncSelection(slot);
  };

  const handleClick = () => {
    const input = inputRef.current;
    if (!input) return;
    const slot = getKoreanDateTimeSlotFromCursor(value, input.selectionStart ?? 0);
    syncSelection(slot);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = inputRef.current;
    if (!input) return;

    let slot = slotRef.current;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      syncSelection(Math.max(0, slot - 1));
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      syncSelection(Math.min(11, slot + 1));
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(clearKoreanDateTimeDigitAtSlot(value, slot));
      syncSelection(Math.max(0, slot - (e.key === 'Backspace' ? 1 : 0)));
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = setKoreanDateTimeDigitAtSlot(value, slot, e.key);
      onChange(next);
      syncSelection(Math.min(11, slot + 1));
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const next = applyKoreanDateTimePaste(value, e.clipboardData.getData('text'));
    onChange(next);
    const digits = next.replace(/\D/g, '');
    syncSelection(Math.min(digits.length, 11));
  };

  const handleChange = () => {
    syncSelection(slotRef.current);
  };

  return (
    <div className="form-field">
      {label && (
        <label htmlFor={inputId} className="form-field__label">
          {label}
          {required && ' *'}
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        className="form-field__input"
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="0000년 00월 00일 00시 00분"
        aria-label={label ?? '일시'}
        disabled={disabled}
      />
    </div>
  );
}
