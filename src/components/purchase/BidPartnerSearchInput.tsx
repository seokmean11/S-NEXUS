import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useImeSafeInputValue, isKeyboardComposing } from '@/hooks/useImeSafeInputValue';

interface BidPartnerSearchInputProps {
  partners: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function filterPartners(partners: string[], keyword: string): string[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return partners;
  return partners.filter((name) => name.toLowerCase().includes(query));
}

export function BidPartnerSearchInput({
  partners,
  value,
  onChange,
  disabled,
}: BidPartnerSearchInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    inputValue,
    onInputChange,
    onCompositionStart,
    onCompositionEnd,
  } = useImeSafeInputValue(value, onChange);

  const filteredPartners = useMemo(
    () => filterPartners(partners, inputValue),
    [partners, inputValue],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (name: string) => {
    onChange(name);
    setDropdownOpen(false);
  };

  return (
    <div className="form-field admin-form__cell project-name-search" ref={rootRef}>
      <label htmlFor="bid-partner-search-input" className="form-field__label">
        협력사 추가(등록)
      </label>
      <div className="project-name-search__bar">
        <input
          id="bid-partner-search-input"
          type="text"
          className="form-field__input project-name-search__input"
          value={inputValue}
          placeholder="협력사 검색·선택 또는 직접 입력"
          onChange={(event) => {
            onInputChange(event.target.value);
            setDropdownOpen(true);
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={(event) => {
            if (isKeyboardComposing(event)) return;
            if (event.key === 'Escape') {
              setDropdownOpen(false);
              return;
            }
            if (event.key === 'Enter' && filteredPartners.length > 0) {
              event.preventDefault();
              handleSelect(filteredPartners[0]);
            }
          }}
          autoComplete="off"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
          aria-controls="bid-partner-search-dropdown"
          disabled={disabled}
        >
          선택
        </Button>
      </div>
      <span className="bid-trade-type-search__hint">
        등록된 협력사를 선택하거나 새 협력사명을 직접 입력할 수 있습니다.
      </span>

      {dropdownOpen && !disabled && (
        <ul
          id="bid-partner-search-dropdown"
          className="project-name-search__dropdown"
          role="listbox"
          aria-label="협력사 목록"
        >
          {filteredPartners.length === 0 ? (
            <li className="project-name-search__empty">
              {inputValue.trim() ? `"${inputValue.trim()}" 직접 입력` : '검색 결과가 없습니다.'}
            </li>
          ) : (
            filteredPartners.map((name) => (
              <li key={name} role="option" aria-selected={inputValue === name}>
                <button
                  type="button"
                  className={`project-name-search__option ${
                    inputValue === name ? 'project-name-search__option--active' : ''
                  }`}
                  onClick={() => handleSelect(name)}
                >
                  <span className="project-name-search__option-name">{name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
