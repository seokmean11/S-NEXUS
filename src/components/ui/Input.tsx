import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label?.replace(/\s/g, '-').toLowerCase();

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={inputId} className="form-field__label">
          {label}
        </label>
      )}
      <input id={inputId} className={`form-field__input ${error ? 'form-field__input--error' : ''}`} {...props} />
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({ label, options, error, id, className = '', ...props }: SelectProps) {
  const selectId = id ?? label?.replace(/\s/g, '-').toLowerCase();

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={selectId} className="form-field__label">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`form-field__input form-field__select ${error ? 'form-field__input--error' : ''}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}
