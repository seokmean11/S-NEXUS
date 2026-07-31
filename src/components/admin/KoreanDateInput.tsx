import { useEffect, useRef } from 'react';
import {
  applyKoreanDatePaste,
  clearKoreanDateDigitAtSlot,
  getKoreanDateCursorForSlot,
  getKoreanDateDigitIndices,
  getKoreanDateDisplay,
  getKoreanDateSlotFromCursor,
  setKoreanDateDigitAtSlot,
} from '@/utils/formatInput';

interface KoreanDateInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function KoreanDateInput({ label, value, onChange, required, disabled }: KoreanDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);
  const display = getKoreanDateDisplay(value);
  const inputId = label?.replace(/\s/g, '-').toLowerCase();

  const syncSelection = (slot: number) => {
    slotRef.current = slot;
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const pos = getKoreanDateCursorForSlot(value, slot);
      const indices = getKoreanDateDigitIndices(getKoreanDateDisplay(value));
      const end = indices[slot] != null ? indices[slot] + 1 : pos + 1;
      input.setSelectionRange(pos, Math.min(end, display.length || pos + 1));
    });
  };

  useEffect(() => {
    syncSelection(slotRef.current);
  }, [display]);

  const handleFocus = () => {
    const slot = value ? getKoreanDateSlotFromCursor(value, 0) : 0;
    syncSelection(slot);
  };

  const handleClick = () => {
    const input = inputRef.current;
    if (!input) return;
    const slot = getKoreanDateSlotFromCursor(value, input.selectionStart ?? 0);
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
      syncSelection(Math.min(7, slot + 1));
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(clearKoreanDateDigitAtSlot(value, slot));
      syncSelection(Math.max(0, slot - (e.key === 'Backspace' ? 1 : 0)));
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = setKoreanDateDigitAtSlot(value, slot, e.key);
      onChange(next);
      syncSelection(Math.min(7, slot + 1));
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const next = applyKoreanDatePaste(value, e.clipboardData.getData('text'));
    onChange(next);
    const digits = next.replace(/\D/g, '');
    syncSelection(Math.min(digits.length, 7));
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
        placeholder="YYYY년 MM월 DD일"
        aria-label={label ?? '날짜'}
        disabled={disabled}
      />
    </div>
  );
}
