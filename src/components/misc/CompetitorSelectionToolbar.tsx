import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { CompetitorYearSelect } from '@/components/misc/CompetitorYearSelect';
import { COMPETITOR_SECTORS, type CompetitorSector } from '@/services/competitorDriveApi';

interface CompetitorSelectionToolbarProps {
  sector: CompetitorSector | null;
  year: number | null;
  onSectorChange: (sector: CompetitorSector) => void;
  onYearChange: (year: number) => void;
  sectorLabel?: string;
  yearLabel?: string;
  yearPlaceholder?: string;
  className?: string;
  trailing?: ReactNode;
}

export function CompetitorSelectionToolbar({
  sector,
  year,
  onSectorChange,
  onYearChange,
  sectorLabel = '사업분야',
  yearLabel = '연도',
  yearPlaceholder,
  className = '',
  trailing,
}: CompetitorSelectionToolbarProps) {
  return (
    <div className={`competitor-analysis-dashboard__toolbar ${className}`.trim()}>
      <div className="competitor-analysis-dashboard__sector-group">
        <span className="competitor-analysis-dashboard__field-label">{sectorLabel}</span>
        <div className="competitor-analysis-dashboard__sector-tabs" role="tablist" aria-label={sectorLabel}>
          {COMPETITOR_SECTORS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={sector === item}
              className={`competitor-analysis-dashboard__sector-tab ${
                sector === item ? 'competitor-analysis-dashboard__sector-tab--active' : ''
              }`}
              onClick={() => onSectorChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="competitor-analysis-dashboard__controls">
        <label
          className={`competitor-analysis-dashboard__year-field ${
            !sector ? 'competitor-analysis-dashboard__year-field--disabled' : ''
          }`}
        >
          <span>{yearLabel}</span>
          <CompetitorYearSelect
            value={year}
            disabled={!sector}
            placeholder={
              yearPlaceholder ?? (sector ? `${yearLabel} 선택` : '사업분야 선택 후 활성화')
            }
            onChange={onYearChange}
          />
        </label>
        {trailing}
      </div>
    </div>
  );
}

interface CompetitorRefreshButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function CompetitorRefreshButton({ loading, disabled, onClick }: CompetitorRefreshButtonProps) {
  return (
    <Button type="button" variant="secondary" onClick={onClick} disabled={disabled || loading}>
      {loading ? '분석 중…' : '분석 실행'}
    </Button>
  );
}
