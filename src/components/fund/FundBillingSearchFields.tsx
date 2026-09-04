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
  onChange: (value: string) => void;
  onSelect: (project: Project) => void;
  hideLabel?: boolean;
}

export function FundBillingProjectSearch({
  projects,
  value,
  selectedProjectId,
  onChange,
  onSelect,
  hideLabel,
}: FundBillingProjectSearchProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { inputValue, onInputChange, onCompositionStart, onCompositionEnd } = useImeSafeInputValue(
    value,
    onChange,
  );
  const filteredProjects = useMemo(() => filterProjects(projects, inputValue), [projects, inputValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelect = (project: Project) => {
    onSelect(project);
    onChange(project.name);
    setDropdownOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isKeyboardComposing(event)) return;
    if (event.key === 'Escape') {
      setDropdownOpen(false);
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
          placeholder="프로젝트명·코드 검색 후 선택"
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
        <ul className="project-name-search__dropdown" role="listbox" aria-label="프로젝트 목록">
          {filteredProjects.length === 0 ? (
            <li className="project-name-search__empty">계약 목록에 없습니다. 등록된 프로젝트면 검색어를 바꿔 보세요.</li>
          ) : (
            filteredProjects.map((project) => (
              <li key={project.id} role="option" aria-selected={selectedProjectId === project.id}>
                <button
                  type="button"
                  className={`project-name-search__option ${
                    selectedProjectId === project.id ? 'project-name-search__option--active' : ''
                  }`}
                  onClick={() => handleSelect(project)}
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
