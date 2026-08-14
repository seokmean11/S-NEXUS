import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  subtitleAside?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  noPadding?: boolean;
}

export function Card({
  title,
  subtitle,
  subtitleAside,
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
            {(subtitle || subtitleAside) && (
              <div className="card__subtitle-row">
                {subtitle && <p className="card__subtitle">{subtitle}</p>}
                {subtitleAside && <span className="card__subtitle-aside">{subtitleAside}</span>}
              </div>
            )}
          </div>
          {headerAction}
        </div>
      )}
      <div className={noPadding ? '' : 'card__body'}>{children}</div>
    </div>
  );
}
