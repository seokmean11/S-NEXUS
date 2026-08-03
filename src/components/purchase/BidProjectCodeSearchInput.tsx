import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/types';
import { filterProjectsByCode } from '@/utils/projectListFilter';
import { getProjectCodeDisplay } from '@/utils/projectCode';

interface BidProjectCodeSearchInputProps {
  projects: Project[];
  value: string;
  selectedProjectId?: string;
  onChange: (value: string) => void;
  onSelect: (project: Project) => void;
  required?: boolean;
}

export function BidProjectCodeSearchInput({
  projects,
  value,
  selectedProjectId,
  onChange,
  onSelect,
  required,
}: BidProjectCodeSearchInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const display = getProjectCodeDisplay(value);

  const filteredProjects = useMemo(
    () => filterProjectsByCode(projects, value),
    [projects, value],
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

  const handleSelect = (project: Project) => {
    onSelect(project);
    onChange(project.projectCode ?? '');
    setDropdownOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
      <label htmlFor="bid-project-code-search-input" className="form-field__label">
        프로젝트 코드
        {required && ' *'}
      </label>
      <div className="project-name-search__bar">
        <input
          id="bid-project-code-search-input"
          type="search"
          className="form-field__input project-name-search__input"
          value={display}
          placeholder="코드 검색 후 선택"
          onChange={(event) => {
            onChange(event.target.value.replace(/\D/g, '').slice(0, 10));
            setDropdownOpen(true);
          }}
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
          aria-controls="bid-project-code-search-dropdown"
        >
          {dropdownOpen ? '닫기' : '목록'}
        </Button>
      </div>

      {dropdownOpen && (
        <ul
          id="bid-project-code-search-dropdown"
          className="project-name-search__dropdown"
          role="listbox"
          aria-label="등록된 프로젝트 코드 목록"
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
                  <span className="project-name-search__option-name">
                    {project.projectCode ?? '-'}
                  </span>
                  <span className="project-name-search__option-meta">{project.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
