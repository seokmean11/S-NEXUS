import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useImeSafeInputValue, isKeyboardComposing } from '@/hooks/useImeSafeInputValue';
import type { Project } from '@/types';
import type { PersonnelRow } from '@/utils/personnelSearch';
import { filterProjects } from '@/utils/projectListFilter';

interface FundBillingProjectSearchProps {
  projects: Project[];
  value: string;
  selectedProjectId?: string;
  onChange?: (value: string) => void;
  onSelect: (project: Project) => void;
  hideLabel?: boolean;
  startOpen?: boolean;
}

export function FundBillingProjectSearch({
  projects,
  value,
  selectedProjectId,
  onChange,
  onSelect,
  hideLabel,
  startOpen = false,
}: FundBillingProjectSearchProps) {
  const [dropdownOpen, setDropdownOpen] = useState(startOpen);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const { inputValue, onInputChange, onCompositionStart, onCompositionEnd } = useImeSafeInputValue(
    draft,
    setDraft,
  );
  const filteredProjects = useMemo(() => filterProjects(projects, inputValue), [projects, inputValue]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const closeDropdown = () => {
    setDropdownOpen(false);
    setDraft(value);
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [value]);

  const handleSelect = (project: Project) => {
    onSelect(project);
    onChange?.(project.name);
    setDraft(project.name);
    setDropdownOpen(false);
  };

  const selectFromPointer = (event: React.MouseEvent, project: Project) => {
    event.preventDefault();
    event.stopPropagation();
    handleSelect(project);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isKeyboardComposing(event)) return;
    if (event.key === 'Escape') {
      closeDropdown();
      return;
    }
    if (event.key === 'Enter' && filteredProjects.length > 0) {
      event.preventDefault();
      handleSelect(filteredProjects[0]);
    }
  };

  return (
    <div className={`form-field project-name-search${hideLabel ? ' project-name-search--bare' : ''}`} ref={rootRef}>
      {!hideLabel && (
        <label htmlFor="fund-billing-project-search" className="form-field__label">
          프로젝트
        </label>
      )}
      <div className="project-name-search__bar">
        <input
          id="fund-billing-project-search"
          type="text"
          className="form-field__input project-name-search__input"
          value={inputValue}
          placeholder="월별 기성보고서 검색 후 선택"
          onChange={(event) => {
            onInputChange(event.target.value);
            setDropdownOpen(true);
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => {
            if (dropdownOpen) closeDropdown();
            else setDropdownOpen(true);
          }}
          aria-expanded={dropdownOpen}
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>
      {dropdownOpen && (
        <ul className="project-name-search__dropdown" role="listbox" aria-label="프로젝트 목록">
          {filteredProjects.length === 0 ? (
            <li className="project-name-search__empty">월별 기성보고서에 없습니다. 검색어를 바꿔 보세요.</li>
          ) : (
            filteredProjects.map((project) => (
              <li
                key={`${project.id}:${project.projectCode ?? ''}:${project.name}`}
                role="option"
                aria-selected={selectedProjectId === project.id}
              >
                <button
                  type="button"
                  className={`project-name-search__option ${
                    selectedProjectId === project.id ? 'project-name-search__option--active' : ''
                  }`}
                  onMouseDown={(event) => selectFromPointer(event, project)}
                >
                  <span className="project-name-search__option-name">{project.name}</span>
                  {project.projectCode && (
                    <span className="project-name-search__option-meta">{project.projectCode}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

interface FundBillingSummaryProjectFilterProps {
  projects: Array<{ id: string; name: string; projectCode?: string }>;
  value: string;
  onChange: (value: string) => void;
  onSelectProject?: (project: { id: string; name: string }) => void;
}

export function FundBillingSummaryProjectFilter({
  projects,
  value,
  onChange,
  onSelectProject,
}: FundBillingSummaryProjectFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { inputValue, onInputChange, onCompositionStart, onCompositionEnd } = useImeSafeInputValue(
    value,
    onChange,
  );

  const filteredProjects = useMemo(() => {
    const keyword = inputValue.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!keyword) return sorted;
    return sorted.filter((project) => {
      const haystack = `${project.name} ${project.projectCode ?? ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [projects, inputValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (project: { id: string; name: string }) => {
    onChange(project.name);
    onSelectProject?.(project);
    setDropdownOpen(false);
  };

  return (
    <div className="form-field project-name-search" ref={rootRef}>
      <label htmlFor="fund-billing-summary-project-search" className="form-field__label">
        프로젝트
      </label>
      <div className="project-name-search__bar">
        <input
          id="fund-billing-summary-project-search"
          type="text"
          className="form-field__input project-name-search__input"
          value={inputValue}
          placeholder="키워드 입력 또는 목록에서 선택"
          onChange={(event) => {
            onInputChange(event.target.value);
            setDropdownOpen(true);
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          onFocus={() => setDropdownOpen(true)}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>
      {dropdownOpen && (
        <ul className="project-name-search__dropdown" role="listbox" aria-label="집계 프로젝트 목록">
          {filteredProjects.length === 0 ? (
            <li className="project-name-search__empty">해당 연월 집계에 없습니다.</li>
          ) : (
            filteredProjects.map((project) => (
              <li key={project.id} role="option">
                <button
                  type="button"
                  className="project-name-search__option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(project);
                  }}
                >
                  <span className="project-name-search__option-name">{project.name}</span>
                  {project.projectCode ? (
                    <span className="project-name-search__option-meta">{project.projectCode}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

interface FundBillingPmSearchProps {
  people: PersonnelRow[];
  value: string;
  onChange: (value: string) => void;
}

export function FundBillingPmSearch({ people, value, onChange }: FundBillingPmSearchProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { inputValue, onInputChange, onCompositionStart, onCompositionEnd } = useImeSafeInputValue(
    value,
    onChange,
  );

  const filteredPeople = useMemo(() => {
    const keyword = inputValue.trim().toLowerCase();
    const source = keyword
      ? people.filter(
          (person) =>
            person.name.toLowerCase().includes(keyword) ||
            person.divisionName.toLowerCase().includes(keyword) ||
            person.teamName.toLowerCase().includes(keyword),
        )
      : people;
    return source.slice(0, 40);
  }, [people, inputValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (person: PersonnelRow) => {
    onChange(person.name);
    setDropdownOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isKeyboardComposing(event)) return;
    if (event.key === 'Escape') {
      setDropdownOpen(false);
      return;
    }
    if (event.key === 'Enter' && filteredPeople.length > 0) {
      event.preventDefault();
      handleSelect(filteredPeople[0]);
    }
  };

  return (
    <div className="form-field project-name-search" ref={rootRef}>
      <label htmlFor="fund-billing-pm-search" className="form-field__label">
        담당자
      </label>
      <div className="project-name-search__bar">
        <input
          id="fund-billing-pm-search"
          type="text"
          className="form-field__input project-name-search__input"
          value={inputValue}
          placeholder="조직 인원 검색 또는 직접 입력"
          onChange={(event) => {
            onInputChange(event.target.value);
            setDropdownOpen(true);
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>
      {dropdownOpen && (
        <ul className="project-name-search__dropdown" role="listbox" aria-label="담당자 목록">
          {filteredPeople.length === 0 ? (
            <li className="project-name-search__empty">검색 결과가 없습니다. 이름을 직접 입력하세요.</li>
          ) : (
            filteredPeople.map((person) => (
              <li key={person.id} role="option">
                <button type="button" className="project-name-search__option" onClick={() => handleSelect(person)}>
                  <span className="project-name-search__option-name">{person.name}</span>
                  <span className="project-name-search__option-meta">
                    {[person.rank, person.divisionName, person.teamName].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

interface FundBillingDepartmentMultiSelectProps {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function FundBillingDepartmentMultiSelect({
  label = '사업유형',
  options,
  selected,
  onChange,
}: FundBillingDepartmentMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const displayLabel =
    selected.length === 0
      ? '전체 본부'
      : options.filter((item) => selectedSet.has(item.value)).map((item) => item.label).join(', ');

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className="form-field fund-billing-dept-select" ref={rootRef}>
      <span className="form-field__label">{label}</span>
      <button
        type="button"
        className="form-field__input form-field__select fund-billing-dept-select__toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {displayLabel}
      </button>
      {open ? (
        <ul className="fund-billing-dept-select__menu" role="listbox" aria-multiselectable="true" aria-label="사업유형">
          <li>
            <button
              type="button"
              className={`fund-billing-dept-select__option${selected.length === 0 ? ' is-active' : ''}`}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              전체 본부
            </button>
          </li>
          {options.map((option) => {
            const checked = selectedSet.has(option.value);
            return (
              <li key={option.value}>
                <label className={`fund-billing-dept-select__option${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
