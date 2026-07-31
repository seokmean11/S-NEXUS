import { useEffect, useRef } from 'react';
import {
  applyProjectCodePaste,
  clearProjectCodeDigitAtSlot,
  getProjectCodeCursorForSlot,
  getProjectCodeDigitIndices,
  getProjectCodeDisplay,
  getProjectCodeSlotFromCursor,
  PROJECT_CODE_SLOT_COUNT,
  setProjectCodeDigitAtSlot,
} from '@/utils/projectCode';

interface ProjectCodeInputProps {
  label?: string;
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  error?: string;
}

export function ProjectCodeInput({
  label = '프로젝트 코드',
  value,
  onChange,
  required,
  error,
}: ProjectCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);
  const display = getProjectCodeDisplay(value);
  const inputId = label.replace(/\s/g, '-').toLowerCase();

  const syncSelection = (slot: number) => {
    slotRef.current = slot;
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const pos = getProjectCodeCursorForSlot(value, slot);
      const indices = getProjectCodeDigitIndices(getProjectCodeDisplay(value));
      const end = indices[slot] != null ? indices[slot] + 1 : pos + 1;
      input.setSelectionRange(pos, Math.min(end, display.length || pos + 1));
    });
  };

  useEffect(() => {
    syncSelection(slotRef.current);
  }, [display]);

  const handleFocus = () => {
    const slot = value ? getProjectCodeSlotFromCursor(value, 0) : 0;
    syncSelection(slot);
  };

  const handleClick = () => {
    const input = inputRef.current;
    if (!input) return;
    const slot = getProjectCodeSlotFromCursor(value, input.selectionStart ?? 0);
    syncSelection(slot);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const slot = slotRef.current;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      syncSelection(Math.max(0, slot - 1));
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      syncSelection(Math.min(PROJECT_CODE_SLOT_COUNT - 1, slot + 1));
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(clearProjectCodeDigitAtSlot(value, slot));
      syncSelection(Math.max(0, slot - (e.key === 'Backspace' ? 1 : 0)));
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      onChange(setProjectCodeDigitAtSlot(value, slot, e.key));
      syncSelection(Math.min(PROJECT_CODE_SLOT_COUNT - 1, slot + 1));
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const next = applyProjectCodePaste(e.clipboardData.getData('text'));
    onChange(next);
    const digits = next.replace(/\D/g, '');
    syncSelection(Math.min(digits.length, PROJECT_CODE_SLOT_COUNT - 1));
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
        className={`form-field__input${error ? ' form-field__input--error' : ''}`}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="YYYY-XXXX-XX"
        aria-label={label}
      />
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}
