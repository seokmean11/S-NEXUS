import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  noPadding?: boolean;
}

export function Card({
  title,
  subtitle,
  children,
  className = '',
  headerAction,
  noPadding = false,
}: CardProps) {
  return (
    <div className={`card ${className}`}>
      {(title || headerAction) && (
        <div className="card__header">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {headerAction}
        </div>
      )}
      <div className={noPadding ? '' : 'card__body'}>{children}</div>
    </div>
  );
}
