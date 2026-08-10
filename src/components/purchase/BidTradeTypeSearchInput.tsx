import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useImeSafeInputValue, isKeyboardComposing } from '@/hooks/useImeSafeInputValue';
import { filterBidTradeTypes } from '@/utils/bidTradeTypeSearch';

interface BidTradeTypeSearchInputProps {
  tradeTypes: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function BidTradeTypeSearchInput({
  tradeTypes,
  value,
  onChange,
  required,
}: BidTradeTypeSearchInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    inputValue,
    onInputChange,
    onCompositionStart,
    onCompositionEnd,
  } = useImeSafeInputValue(value, onChange);

  const filteredTradeTypes = useMemo(
    () => filterBidTradeTypes(tradeTypes, inputValue),
    [tradeTypes, inputValue],
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

  const handleSelect = (tradeType: string) => {
    onChange(tradeType);
    setDropdownOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isKeyboardComposing(event)) return;

    if (event.key === 'Escape') {
      setDropdownOpen(false);
      return;
    }

    if (event.key === 'Enter' && filteredTradeTypes.length > 0) {
      event.preventDefault();
      handleSelect(filteredTradeTypes[0]);
    }
  };

  return (
    <div className="form-field admin-form__cell project-name-search" ref={rootRef}>
      <label htmlFor="bid-trade-type-search-input" className="form-field__label">
        외주공종 *
      </label>
      <div className="project-name-search__bar">
        <input
          id="bid-trade-type-search-input"
          type="text"
          className="form-field__input project-name-search__input"
          value={inputValue}
          placeholder="기존 공종 검색 또는 직접 입력"
          onChange={(event) => {
            onInputChange(event.target.value);
            setDropdownOpen(true);
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
          aria-controls="bid-trade-type-search-dropdown"
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>
      <span className="bid-trade-type-search__hint">
        등록된 입찰 공종을 검색하거나 새 공종명을 직접 입력할 수 있습니다.
      </span>

      {dropdownOpen && (
        <ul
          id="bid-trade-type-search-dropdown"
          className="project-name-search__dropdown"
          role="listbox"
          aria-label="입찰 공종 목록"
        >
          {filteredTradeTypes.length === 0 ? (
            <li className="project-name-search__empty">
              {inputValue.trim() ? `"${inputValue.trim()}" 직접 입력` : '검색 결과가 없습니다.'}
            </li>
          ) : (
            filteredTradeTypes.map((tradeType) => (
              <li key={tradeType} role="option" aria-selected={inputValue === tradeType}>
                <button
                  type="button"
                  className={`project-name-search__option ${
                    inputValue === tradeType ? 'project-name-search__option--active' : ''
                  }`}
                  onClick={() => handleSelect(tradeType)}
                >
                  <span className="project-name-search__option-name">{tradeType}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
