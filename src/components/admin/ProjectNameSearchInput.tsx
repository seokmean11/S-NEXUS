import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useImeSafeInputValue, isKeyboardComposing } from '@/hooks/useImeSafeInputValue';
import type { Project } from '@/types';
import { filterProjects } from '@/utils/projectListFilter';

interface ProjectNameSearchInputProps {
  projects: Project[];
  value: string;
  selectedProjectId?: string;
  onChange: (value: string) => void;
  onSelect: (project: Project) => void;
  label?: string;
  required?: boolean;
}

export function ProjectNameSearchInput({
  projects,
  value,
  selectedProjectId,
  onChange,
  onSelect,
  label = '프로젝트명',
  required,
}: ProjectNameSearchInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    inputValue,
    onInputChange,
    onCompositionStart,
    onCompositionEnd,
  } = useImeSafeInputValue(value, onChange);

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
    <div className="form-field admin-form__cell project-name-search" ref={rootRef}>
      <label htmlFor="project-name-search-input" className="form-field__label">
        {label}
        {required && ' *'}
      </label>
      <div className="project-name-search__bar">
        <input
          id="project-name-search-input"
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
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="project-name-search__toggle"
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
          aria-controls="project-name-search-dropdown"
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>

      {dropdownOpen && (
        <ul
          id="project-name-search-dropdown"
          className="project-name-search__dropdown"
          role="listbox"
          aria-label="등록된 프로젝트 목록"
        >
          {filteredProjects.length === 0 ? (
            <li className="project-name-search__empty">검색 결과가 없습니다.</li>
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
