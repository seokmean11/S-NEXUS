import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OutsourcingFilterFieldState, OutsourcingFilterKey } from '@/types/outsourcing';
import { OUTSOURCING_FILTER_LABELS } from '@/types/outsourcing';

const POPOVER_MAX_HEIGHT = 280;
const POPOVER_GAP = 6;
const KEYWORD_DEBOUNCE_MS = 160;

interface OutsourcingMultiSelectFilterProps {
  filterKey: OutsourcingFilterKey;
  options: string[];
  field: OutsourcingFilterFieldState;
  activeFilterKey: OutsourcingFilterKey | 'date' | null;
  onActivate: () => void;
  onChange: (field: OutsourcingFilterFieldState) => void;
}

function OutsourcingMultiSelectFilterComponent({
  filterKey,
  options,
  field,
  activeFilterKey,
  onActivate,
  onChange,
}: OutsourcingMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [localKeyword, setLocalKeyword] = useState(field.keyword);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [openAbove, setOpenAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    return options.filter((option) => option.toLowerCase().includes(keyword));
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
    const merged = new Set([...field.selected, ...filteredOptions]);
    setSelected([...merged]);
  };

  const handleClearAll = () => {
    setSelected([]);
  };

  const removeValue = (value: string) => {
    setSelected(field.selected.filter((item) => item !== value));
  };

  const openPanel = () => {
    onActivate();
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const popover = open ? (
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
            <label key={option} className="outsourcing-filter-popover__option">
              <input
                type="checkbox"
                checked={selectedSet.has(option)}
                onChange={() => toggleValue(option)}
              />
              <span>{option}</span>
            </label>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="outsourcing-filter-field" ref={rootRef}>
      <div className="outsourcing-filter-field__header">
        <span className="form-field__label">{OUTSOURCING_FILTER_LABELS[filterKey]}_선택</span>
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
        className={`outsourcing-filter-field__control ${open ? 'outsourcing-filter-field__control--open' : ''}`}
        onClick={openPanel}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${OUTSOURCING_FILTER_LABELS[filterKey]} 검색·선택`}
      >
        <div className="outsourcing-filter-field__main">
          {hasSelection && (
            <div className="outsourcing-filter-field__chips-scroll" onClick={(event) => event.stopPropagation()}>
              {field.selected.map((value) => (
                <span key={value} className="outsourcing-filter-chip">
                  {value}
                  <button
                    type="button"
                    className="outsourcing-filter-chip__remove"
                    onClick={() => removeValue(value)}
                    aria-label={`${value} 제거`}
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
            onChange={(e) => {
              setLocalKeyword(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              onActivate();
              setOpen(true);
            }}
            onClick={(event) => event.stopPropagation()}
            placeholder={
              hasSelection ? '키워드 검색 또는 추가 선택' : '키워드 검색 · 항목 선택'
            }
            aria-label={`${OUTSOURCING_FILTER_LABELS[filterKey]} 키워드 검색 및 선택`}
          />
        </div>
        <button
          type="button"
          className="outsourcing-filter-field__add"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((prev) => !prev);
            if (!open) requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-expanded={open}
          aria-label={`${OUTSOURCING_FILTER_LABELS[filterKey]} 선택 목록`}
        >
          +
        </button>
      </div>

      {popover && createPortal(popover, document.body)}
    </div>
  );
}

export const OutsourcingMultiSelectFilter = memo(OutsourcingMultiSelectFilterComponent);
