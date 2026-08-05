import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  PersonnelFilterFieldState,
  PersonnelFilterKey,
  PersonnelFilterOption,
} from '@/utils/personnelSearch';

const POPOVER_MAX_HEIGHT = 280;
const POPOVER_GAP = 6;
const KEYWORD_DEBOUNCE_MS = 160;

const FILTER_LABELS: Record<PersonnelFilterKey, string> = {
  division: '사업본부',
  team: '팀',
  person: '이름·직급',
};

interface PersonnelMultiSelectFilterProps {
  filterKey: PersonnelFilterKey;
  options: PersonnelFilterOption[];
  field: PersonnelFilterFieldState;
  activeFilterKey: PersonnelFilterKey | null;
  disabled?: boolean;
  placeholder?: string;
  onActivate: () => void;
  onChange: (field: PersonnelFilterFieldState) => void;
}

function PersonnelMultiSelectFilterComponent({
  filterKey,
  options,
  field,
  activeFilterKey,
  disabled = false,
  placeholder,
  onActivate,
  onChange,
}: PersonnelMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [localKeyword, setLocalKeyword] = useState(field.keyword);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [openAbove, setOpenAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelByValue = useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options]);
  const chipLabelByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option.chipLabel ?? option.label])),
    [options],
  );
  const selectedSet = useMemo(() => new Set(field.selected), [field.selected]);

  useEffect(() => {
    setLocalKeyword(field.keyword);
  }, [field.keyword]);

  useEffect(() => {
    if (localKeyword === field.keyword) return undefined;
    const timer = window.setTimeout(() => {
      onChange({ ...field, keyword: localKeyword });
    }, KEYWORD_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [field, localKeyword, onChange]);

  useEffect(() => {
    if (activeFilterKey === null || activeFilterKey === filterKey) return;
    if (field.selected.length > 0) return;
    if (!localKeyword.trim() && !field.keyword.trim()) return;

    setLocalKeyword('');
    setOpen(false);
    onChange({ ...field, keyword: '' });
  }, [activeFilterKey, field, filterKey, localKeyword, onChange]);

  const filteredOptions = useMemo(() => {
    const keyword = localKeyword.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword),
    );
  }, [localKeyword, options]);

  const hasSelection = field.selected.length > 0;

  const updatePopoverPosition = () => {
    if (!controlRef.current) return;

    const rect = controlRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP;
    const spaceAbove = rect.top - POPOVER_GAP;
    const shouldOpenAbove = spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow;

    setOpenAbove(shouldOpenAbove);

    if (shouldOpenAbove) {
      setPopoverStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + POPOVER_GAP,
        maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceAbove),
      });
      return;
    }

    setPopoverStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: rect.bottom + POPOVER_GAP,
      maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceBelow),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, filteredOptions.length, localKeyword, hasSelection]);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleReposition = () => updatePopoverPosition();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, filteredOptions.length, localKeyword, hasSelection]);

  const setSelected = (selected: string[]) => {
    onChange({ ...field, keyword: localKeyword, selected });
  };

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      setSelected(field.selected.filter((item) => item !== value));
      return;
    }
    setSelected([...field.selected, value]);
  };

  const handleSelectAll = () => {
    const merged = new Set([...field.selected, ...filteredOptions.map((option) => option.value)]);
    setSelected([...merged]);
  };

  const handleClearAll = () => {
    setSelected([]);
  };

  const removeValue = (value: string) => {
    setSelected(field.selected.filter((item) => item !== value));
  };

  const openPanel = () => {
    if (disabled) return;
    onActivate();
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const popover = open && !disabled ? (
    <div
      ref={popoverRef}
      className={`outsourcing-filter-popover ${openAbove ? 'outsourcing-filter-popover--above' : ''}`}
      style={popoverStyle}
    >
      <div className="outsourcing-filter-popover__toolbar">
        <span className="outsourcing-filter-popover__count">
          {filteredOptions.length.toLocaleString('ko-KR')}건 · 선택{' '}
          {field.selected.length.toLocaleString('ko-KR')}건
        </span>
        <div className="outsourcing-filter-popover__actions">
          <button type="button" className="outsourcing-filter-popover__action" onClick={handleSelectAll}>
            모두 선택
          </button>
        </div>
      </div>

      <div className="outsourcing-filter-popover__list" role="listbox">
        {filteredOptions.length === 0 ? (
          <p className="outsourcing-filter-popover__empty">선택 가능한 값이 없습니다.</p>
        ) : (
          filteredOptions.map((option) => (
            <label key={option.value} className="outsourcing-filter-popover__option">
              <input
                type="checkbox"
                checked={selectedSet.has(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="outsourcing-filter-field personnel-filter-field" ref={rootRef}>
      <div className="outsourcing-filter-field__header">
        <span className="form-field__label">{FILTER_LABELS[filterKey]}</span>
        {hasSelection && (
          <button
            type="button"
            className="outsourcing-filter-field__clear-all"
            onClick={handleClearAll}
          >
            모두 삭제 ({field.selected.length.toLocaleString('ko-KR')})
          </button>
        )}
      </div>

      <div
        ref={controlRef}
        className={`outsourcing-filter-field__control ${open ? 'outsourcing-filter-field__control--open' : ''} ${disabled ? 'outsourcing-filter-field__control--disabled' : ''}`}
        onClick={openPanel}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        aria-label={`${FILTER_LABELS[filterKey]} 검색·선택`}
      >
        <div className="outsourcing-filter-field__main">
          {hasSelection && (
            <div className="outsourcing-filter-field__chips-scroll" onClick={(event) => event.stopPropagation()}>
              {field.selected.map((value) => (
                <span key={value} className="outsourcing-filter-chip">
                  {chipLabelByValue.get(value) ?? value}
                  <button
                    type="button"
                    className="outsourcing-filter-chip__remove"
                    onClick={() => removeValue(value)}
                    aria-label={`${labelByValue.get(value) ?? value} 제거`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            className="outsourcing-filter-field__input"
            value={localKeyword}
            disabled={disabled}
            onChange={(e) => {
              setLocalKeyword(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (disabled) return;
              onActivate();
              setOpen(true);
            }}
            onClick={(event) => event.stopPropagation()}
            placeholder={
              disabled
                ? '해당 없음'
                : placeholder ?? (hasSelection ? '키워드 검색 또는 추가 선택' : '키워드 검색 · 항목 선택')
            }
            aria-label={`${FILTER_LABELS[filterKey]} 키워드 검색 및 선택`}
          />
        </div>
        <button
          type="button"
          className="outsourcing-filter-field__add"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (disabled) return;
            setOpen((prev) => !prev);
            if (!open) requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-expanded={open}
          aria-label={`${FILTER_LABELS[filterKey]} 선택 목록`}
        >
          +
        </button>
      </div>

      {popover && createPortal(popover, document.body)}
    </div>
  );
}

export const PersonnelMultiSelectFilter = memo(PersonnelMultiSelectFilterComponent);
