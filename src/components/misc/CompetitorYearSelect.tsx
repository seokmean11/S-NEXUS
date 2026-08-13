import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { buildYearOptions } from '@/services/competitorDriveApi';

interface CompetitorYearSelectProps {
  value: number | null;
  disabled?: boolean;
  placeholder: string;
  onChange: (year: number) => void;
}

export function CompetitorYearSelect({
  value,
  disabled = false,
  placeholder,
  onChange,
}: CompetitorYearSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open || value == null || !listRef.current) return;

    const activeOption = listRef.current.querySelector(
      '.competitor-year-select__option--active',
    );
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [open, value]);

  return (
    <div
      ref={rootRef}
      className={`competitor-year-select ${disabled ? 'competitor-year-select--disabled' : ''} ${
        open ? 'competitor-year-select--open' : ''
      }`}
    >
      <button
        type="button"
        className="competitor-year-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!disabled) setOpen((previous) => !previous);
        }}
      >
        <span>{value ? `${value}년` : placeholder}</span>
        <span className="competitor-year-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && !disabled && (
        <div className="competitor-year-select__panel">
          <ul
            id={listId}
            ref={listRef}
            className="competitor-year-select__list"
            role="listbox"
            aria-label="연도 선택"
          >
            {yearOptions.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option}
                  className={`competitor-year-select__option ${
                    value === option ? 'competitor-year-select__option--active' : ''
                  }`}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  {option}년
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
