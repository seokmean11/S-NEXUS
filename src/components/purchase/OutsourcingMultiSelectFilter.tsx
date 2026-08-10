import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  OutsourcingFilterFieldState,
  OutsourcingFilterKey,
} from '@/types/outsourcing';
import { OUTSOURCING_FILTER_LABELS } from '@/types/outsourcing';
import { resolveOutsourcingPopoverRect } from '@/utils/outsourcingMobileLayout';

const POPOVER_MAX_HEIGHT = 280;
const POPOVER_GAP = 6;
const KEYWORD_RESULT_COMMIT_MS = 120;

function areSelectedEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

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
  const [draftKeyword, setDraftKeyword] = useState(field.keyword);
  const [draftSelected, setDraftSelected] = useState<string[]>(field.selected);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [openAbove, setOpenAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef(false);
  const fieldRef = useRef(field);
  const draftKeywordRef = useRef(draftKeyword);
  const draftSelectedRef = useRef(draftSelected);
  fieldRef.current = field;
  draftKeywordRef.current = draftKeyword;
  draftSelectedRef.current = draftSelected;

  useEffect(() => {
    if (isFocusedRef.current) return;
    setDraftKeyword(field.keyword);
  }, [field.keyword]);

  useEffect(() => {
    if (field.selected.length > 0 || field.keyword.trim().length > 0) return;
    setDraftSelected([]);
    setDraftKeyword('');
  }, [field.selected, field.keyword]);

  const scheduleCommit = useCallback(() => {
    startTransition(() => {
      const current = fieldRef.current;
      const next = {
        keyword: draftKeywordRef.current,
        selected: draftSelectedRef.current,
      };
      if (
        next.keyword === current.keyword &&
        areSelectedEqual(next.selected, current.selected)
      ) {
        return;
      }
      onChange(next);
    });
  }, [onChange]);

  useEffect(() => {
    if (draftSelected.length > 0) return undefined;
    if (draftKeyword === field.keyword) return undefined;

    const timer = window.setTimeout(() => {
      scheduleCommit();
    }, KEYWORD_RESULT_COMMIT_MS);

    return () => window.clearTimeout(timer);
  }, [draftKeyword, draftSelected.length, field.keyword, scheduleCommit]);

  useEffect(() => {
    if (activeFilterKey === null || activeFilterKey === filterKey) return;
    if (draftSelected.length > 0) return;
    if (!draftKeyword.trim() && !field.keyword.trim()) return;

    setDraftKeyword('');
    setOpen(false);
    draftKeywordRef.current = '';
    scheduleCommit();
  }, [
    activeFilterKey,
    draftKeyword,
    draftSelected.length,
    field.keyword,
    filterKey,
    scheduleCommit,
  ]);

  const selectedSet = useMemo(() => new Set(draftSelected), [draftSelected]);

  const filteredOptions = useMemo(() => {
    const keyword = draftKeyword.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => option.toLowerCase().includes(keyword));
  }, [draftKeyword, options]);

  const hasSelection = draftSelected.length > 0;

  const handleKeywordChange = (keyword: string) => {
    setDraftKeyword(keyword);
    draftKeywordRef.current = keyword;
  };

  const flushField = () => {
    scheduleCommit();
  };

  const commitSelected = (selected: string[]) => {
    setDraftSelected(selected);
    draftSelectedRef.current = selected;
    scheduleCommit();
  };

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      commitSelected(draftSelected.filter((item) => item !== value));
      return;
    }
    commitSelected([...draftSelected, value]);
  };

  const handleSelectAll = () => {
    const merged = new Set([...draftSelected, ...filteredOptions]);
    commitSelected([...merged]);
  };

  const handleClearAll = () => {
    commitSelected([]);
  };

  const removeValue = (value: string) => {
    commitSelected(draftSelected.filter((item) => item !== value));
  };

  const updatePopoverPosition = () => {
    if (!controlRef.current) return;

    const rect = controlRef.current.getBoundingClientRect();
    const { left: popoverLeft, width: popoverWidth } = resolveOutsourcingPopoverRect(rect);
    const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP;
    const spaceAbove = rect.top - POPOVER_GAP;
    const shouldOpenAbove = spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow;

    setOpenAbove(shouldOpenAbove);

    if (shouldOpenAbove) {
      setPopoverStyle({
        position: 'fixed',
        left: popoverLeft,
        width: popoverWidth,
        bottom: window.innerHeight - rect.top + POPOVER_GAP,
        maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceAbove),
      });
      return;
    }

    setPopoverStyle({
      position: 'fixed',
      left: popoverLeft,
      width: popoverWidth,
      top: rect.bottom + POPOVER_GAP,
      maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceBelow),
    });
  };

  const openPanel = () => {
    onActivate();
    updatePopoverPosition();
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, filteredOptions.length]);

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
  }, [open]);

  const popover = open ? (
    <div
      ref={popoverRef}
      className={`outsourcing-filter-popover ${openAbove ? 'outsourcing-filter-popover--above' : ''}`}
      style={popoverStyle}
    >
      <div className="outsourcing-filter-popover__toolbar">
        <span className="outsourcing-filter-popover__count">
          {`${filteredOptions.length.toLocaleString('ko-KR')}건 · 선택 ${draftSelected.length.toLocaleString('ko-KR')}건`}
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
            모두 삭제 ({draftSelected.length.toLocaleString('ko-KR')})
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
              {draftSelected.map((value) => (
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
            value={draftKeyword}
            onChange={(e) => {
              handleKeywordChange(e.target.value);
              if (!open) {
                updatePopoverPosition();
                setOpen(true);
              }
            }}
            onFocus={() => {
              isFocusedRef.current = true;
              onActivate();
              if (!open) {
                updatePopoverPosition();
                setOpen(true);
              }
            }}
            onBlur={() => {
              isFocusedRef.current = false;
              flushField();
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
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onActivate();
            if (!open) {
              updatePopoverPosition();
              setOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
              return;
            }
            setOpen(false);
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

function areFilterFieldStatesEqual(
  prev: OutsourcingFilterFieldState,
  next: OutsourcingFilterFieldState,
): boolean {
  if (prev.keyword !== next.keyword) return false;
  if (prev.selected.length !== next.selected.length) return false;
  return prev.selected.every((value, index) => value === next.selected[index]);
}

function areMultiSelectFilterPropsEqual(
  prev: OutsourcingMultiSelectFilterProps,
  next: OutsourcingMultiSelectFilterProps,
): boolean {
  return (
    prev.filterKey === next.filterKey &&
    prev.options === next.options &&
    areFilterFieldStatesEqual(prev.field, next.field) &&
    prev.activeFilterKey === next.activeFilterKey &&
    prev.onChange === next.onChange &&
    prev.onActivate === next.onActivate
  );
}

export const OutsourcingMultiSelectFilter = memo(
  OutsourcingMultiSelectFilterComponent,
  areMultiSelectFilterPropsEqual,
);
