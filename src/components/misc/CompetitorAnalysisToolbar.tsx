import { Button } from '@/components/ui/Button';
import { COMPETITOR_SECTORS, type CompetitorSector } from '@/services/competitorDriveApi';
import {
  EXECUTIVE_YEAR_MAX,
  EXECUTIVE_YEAR_MIN,
} from '@/utils/competitorExecutiveDashboard';

const YEAR_OPTIONS = Array.from(
  { length: EXECUTIVE_YEAR_MAX - EXECUTIVE_YEAR_MIN + 1 },
  (_, index) => EXECUTIVE_YEAR_MIN + index,
);

interface CompetitorAnalysisToolbarProps {
  sector: CompetitorSector | null;
  fromYear: number;
  toYear: number;
  onSectorChange: (sector: CompetitorSector) => void;
  onPeriodChange: (fromYear: number, toYear: number) => void;
  onRun: () => void;
  loading?: boolean;
  runDisabled?: boolean;
  className?: string;
}

export function CompetitorAnalysisToolbar({
  sector,
  fromYear,
  toYear,
  onSectorChange,
  onPeriodChange,
  onRun,
  loading = false,
  runDisabled = false,
  className = '',
}: CompetitorAnalysisToolbarProps) {
  const periodDisabled = !sector;

  return (
    <div className={`competitor-analysis-dashboard__toolbar competitor-analysis-dashboard__toolbar--analysis ${className}`.trim()}>
      <div className="competitor-analysis-dashboard__sector-group">
        <span className="competitor-analysis-dashboard__field-label">분석 사업분야</span>
        <div className="competitor-analysis-dashboard__sector-tabs" role="tablist" aria-label="분석 사업분야">
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
        <div
          className={`competitor-executive-period competitor-analysis-dashboard__period ${
            periodDisabled ? 'competitor-analysis-dashboard__period--disabled' : ''
          }`}
        >
          <label className="competitor-executive-period__field">
            <span>분석 시작</span>
            <select
              value={fromYear}
              disabled={periodDisabled}
              onChange={(event) => onPeriodChange(Number(event.target.value), toYear)}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={`from-${year}`} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </label>
          <span className="competitor-executive-period__sep">~</span>
          <label className="competitor-executive-period__field">
            <span>분석 종료</span>
            <select
              value={toYear}
              disabled={periodDisabled}
              onChange={(event) => onPeriodChange(fromYear, Number(event.target.value))}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={`to-${year}`} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button type="button" variant="secondary" onClick={onRun} disabled={runDisabled || loading}>
          {loading ? '분석 중…' : '분석 실행'}
        </Button>
      </div>
    </div>
  );
}
