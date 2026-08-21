import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CompetitorAnalysisToolbar } from '@/components/misc/CompetitorAnalysisToolbar';
import { CompetitorSelectionToolbar } from '@/components/misc/CompetitorSelectionToolbar';
import { CompetitorExecutiveDashboard } from '@/components/misc/CompetitorExecutiveDashboard';
import { formatCompetitorFinancialAmount } from '@/utils/competitorFinancialChart';
import { formatCompetitorDisplayCompanyName } from '@/utils/competitorCompanyName';
import {
  COMPETITOR_DRIVE_ROOT_FOLDER,
  COMPETITOR_UPLOAD_ACCEPT,
  COMPETITOR_UPLOAD_CONCURRENCY,
  fetchCompetitorPeriodAnalysis,
  fetchCompetitorDriveStatus,
  getCompetitorUploadModeLabel,
  getCompetitorUploadTargetBlockReason,
  isCompetitorUploadAllowed,
  syncCompetitorDrive,
  uploadCompetitorDriveFile,
  formatCompetitorDocumentType,
  type CompetitorDriveStatus,
} from '@/services/competitorDriveApi';
import type {
  CompetitorAnalysisSummary,
  CompetitorDriveSyncMeta,
  CompetitorMetric,
  CompetitorSector,
} from '@/types/competitorAnalysis';
import type { CompetitorExecutiveMultiYearSummary, CompetitorAnalysisPeriodWarning } from '@/types/competitorStandard';
import {
  EXECUTIVE_YEAR_MAX,
  EXECUTIVE_YEAR_MIN,
} from '@/utils/competitorExecutiveDashboard';
import {
  loadAnalysisSelection,
  saveAnalysisSelection,
  loadUploadSelection,
  saveUploadSelection,
  loadCachedPeriodAnalysis,
  saveCachedPeriodAnalysis,
  type CompetitorPeriodAnalysisCache,
} from '@/utils/competitorAnalysisStorage';
import { countIndustryAnalysisOverlayEntries } from '@/utils/competitorIndustryAnalysisOverlayClient';
import { countProductivityOverlayEntries } from '@/utils/competitorProductivityOverlayClient';

interface UploadResultItem {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  uploadedAt?: string;
}

function countExecutiveOverlayEntries(
  summary: CompetitorExecutiveMultiYearSummary | null | undefined,
): number {
  return (
    countProductivityOverlayEntries(summary) + countIndustryAnalysisOverlayEntries(summary)
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR');
}

function formatMetricValue(metric: CompetitorMetric): string {
  if (metric.value == null || metric.value === '') return '-';
  if (typeof metric.value === 'number') {
    if (metric.key === 'employees') return `${metric.value.toLocaleString('ko-KR')}명`;
    if (metric.key === 'creditRating') return String(metric.value);
    if (metric.unit === '%' || metric.unit === '회') {
      return `${metric.value.toLocaleString('ko-KR')}${metric.unit}`;
    }
    return formatCompetitorFinancialAmount(metric.value);
  }
  return String(metric.value);
}

function resolveSummaryCardRevenue(company: {
  financials?: { revenue?: number };
  metrics: CompetitorMetric[];
}): number {
  const revenue = company.financials?.revenue;
  if (typeof revenue === 'number' && Number.isFinite(revenue) && revenue > 0) {
    return revenue;
  }

  const metric = company.metrics.find((item) => item.key === 'revenue');
  if (metric?.value != null && metric.value !== '') {
    const parsed =
      typeof metric.value === 'number'
        ? metric.value
        : Number(String(metric.value).replace(/[,，]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

function buildFolderPath(sector: CompetitorSector | null, year: number | null): string {
  return sector && year
    ? `${COMPETITOR_DRIVE_ROOT_FOLDER}/${year}/${sector}`
    : `${COMPETITOR_DRIVE_ROOT_FOLDER}/(연도)/(사업분야)`;
}

function formatAnalysisPeriodLabel(fromYear: number, toYear: number): string {
  const from = Math.min(fromYear, toYear);
  const to = Math.max(fromYear, toYear);
  return from === to ? `${to}년` : `${from}–${to}년`;
}

function normalizeAnalysisPeriod(fromYear: number, toYear: number): { fromYear: number; toYear: number } {
  return {
    fromYear: Math.min(fromYear, toYear),
    toYear: Math.max(fromYear, toYear),
  };
}

function createEmptyAnalysisResults() {
  return {
    analysis: null as CompetitorAnalysisSummary | null,
    executiveSummary: null as CompetitorExecutiveMultiYearSummary | null,
    analysisWarnings: [] as CompetitorAnalysisPeriodWarning[],
    analysisSummaryYear: null as number | null,
    analysisHasResult: false,
  };
}

function analysisResultsFromPeriodCache(cache: CompetitorPeriodAnalysisCache) {
  return {
    analysis: cache.analysis,
    executiveSummary: cache.executive,
    analysisWarnings: cache.warnings ?? [],
    analysisSummaryYear: cache.summaryYear,
    analysisHasResult: Boolean(cache.executive || cache.analysis),
  };
}

function loadInitialAnalysisResults(
  sector: CompetitorSector | null,
  fromYear: number,
  toYear: number,
) {
  if (!sector) return createEmptyAnalysisResults();
  const cached = loadCachedPeriodAnalysis(sector, fromYear, toYear);
  if (!cached) return createEmptyAnalysisResults();
  return analysisResultsFromPeriodCache(cached);
}

function saveExecutiveOnlyPeriodCache(
  sector: CompetitorSector,
  fromYear: number,
  toYear: number,
  executive: CompetitorExecutiveMultiYearSummary,
): void {
  const from = Math.min(fromYear, toYear);
  const to = Math.max(fromYear, toYear);
  const existing = loadCachedPeriodAnalysis(sector, from, to);
  if (!existing) return;

  saveCachedPeriodAnalysis(sector, from, to, {
    summaryYear: existing.summaryYear,
    warnings: existing.warnings,
    analysis: existing.analysis,
    executive,
  });
}

export function CompetitorAnalysisDashboard() {
  const uploadInitial = loadUploadSelection();
  const analysisInitial = loadAnalysisSelection();
  const initialAnalysisFromYear = analysisInitial.fromYear ?? EXECUTIVE_YEAR_MIN;
  const initialAnalysisToYear = analysisInitial.toYear ?? EXECUTIVE_YEAR_MAX;
  const initialAnalysisResults = loadInitialAnalysisResults(
    analysisInitial.sector,
    initialAnalysisFromYear,
    initialAnalysisToYear,
  );

  const [uploadSector, setUploadSector] = useState<CompetitorSector | null>(uploadInitial.sector);
  const [uploadYear, setUploadYear] = useState<number | null>(uploadInitial.year);
  const [uploadMeta, setUploadMeta] = useState<Pick<CompetitorDriveSyncMeta, 'syncedAt' | 'fileCount'> | null>(
    null,
  );

  const [analysisSector, setAnalysisSector] = useState<CompetitorSector | null>(analysisInitial.sector);
  const [analysisFromYear, setAnalysisFromYear] = useState(initialAnalysisFromYear);
  const [analysisToYear, setAnalysisToYear] = useState(initialAnalysisToYear);
  const [analysis, setAnalysis] = useState<CompetitorAnalysisSummary | null>(initialAnalysisResults.analysis);
  const [executiveSummary, setExecutiveSummary] = useState<CompetitorExecutiveMultiYearSummary | null>(
    initialAnalysisResults.executiveSummary,
  );
  const [analysisWarnings, setAnalysisWarnings] = useState<CompetitorAnalysisPeriodWarning[]>(
    initialAnalysisResults.analysisWarnings,
  );
  const [analysisSummaryYear, setAnalysisSummaryYear] = useState<number | null>(
    initialAnalysisResults.analysisSummaryYear,
  );
  const [analysisHasResult, setAnalysisHasResult] = useState(initialAnalysisResults.analysisHasResult);

  const [driveStatus, setDriveStatus] = useState<CompetitorDriveStatus | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<UploadResultItem[]>([]);
  const [uploadComplete, setUploadComplete] = useState(false);
  const analysisRunIdRef = useRef(0);

  const uploadReady = Boolean(uploadSector && uploadYear);
  const analysisFormReady = Boolean(analysisSector);
  const uploadAllowed = isCompetitorUploadAllowed(uploadSector, uploadYear, driveStatus);
  const uploadFolderPath = buildFolderPath(uploadSector, uploadYear);
  const analysisPeriodLabel = formatAnalysisPeriodLabel(analysisFromYear, analysisToYear);

  const summaryCompaniesByRevenue = useMemo(() => {
    if (!analysis?.companies.length) return [];
    return [...analysis.companies].sort(
      (a, b) => resolveSummaryCardRevenue(b) - resolveSummaryCardRevenue(a),
    );
  }, [analysis?.companies]);

  const resetUploadWorkspace = () => {
    setUploadResults([]);
    setUploadComplete(false);
    setUploadNotice(null);
    setUploadError(null);
  };

  const resetAnalysisResults = () => {
    const empty = createEmptyAnalysisResults();
    setAnalysis(empty.analysis);
    setExecutiveSummary(empty.executiveSummary);
    setAnalysisWarnings(empty.analysisWarnings);
    setAnalysisSummaryYear(empty.analysisSummaryYear);
    setAnalysisHasResult(empty.analysisHasResult);
    setAnalysisError(null);
  };

  const restoreAnalysisResultsForSelection = (
    sector: CompetitorSector | null,
    fromYear: number,
    toYear: number,
  ) => {
    if (!sector) {
      resetAnalysisResults();
      return;
    }

    const cached = loadCachedPeriodAnalysis(sector, fromYear, toYear);
    if (!cached) {
      resetAnalysisResults();
      return;
    }

    const restored = analysisResultsFromPeriodCache(cached);
    setAnalysis(restored.analysis);
    setExecutiveSummary(restored.executiveSummary);
    setAnalysisWarnings(restored.analysisWarnings);
    setAnalysisSummaryYear(restored.analysisSummaryYear);
    setAnalysisHasResult(restored.analysisHasResult);
    setAnalysisError(null);
  };

  const refreshAnalysis = useCallback(async () => {
    if (!analysisSector) {
      setAnalysisLoading(false);
      setChartRefreshing(false);
      return;
    }

    const fromYear = Math.min(analysisFromYear, analysisToYear);
    const toYear = Math.max(analysisFromYear, analysisToYear);
    const runId = ++analysisRunIdRef.current;

    setAnalysisLoading(true);
    setChartRefreshing(true);
    setAnalysisError(null);

    try {
      const result = await fetchCompetitorPeriodAnalysis({
        sector: analysisSector,
        fromYear,
        toYear,
        force: false,
      });

      if (runId !== analysisRunIdRef.current) return;

      setAnalysis(result.analysis);
      if (runId !== analysisRunIdRef.current) return;

      setExecutiveSummary(result.executive);
      setAnalysisWarnings(result.warnings);
      setAnalysisSummaryYear(result.summaryYear);
      setAnalysisHasResult(true);

      saveCachedPeriodAnalysis(analysisSector, fromYear, toYear, {
        summaryYear: result.summaryYear,
        warnings: result.warnings,
        analysis: result.analysis,
        executive: result.executive,
      });

      saveAnalysisSelection({
        sector: analysisSector,
        fromYear,
        toYear,
      });
    } catch (refreshError) {
      if (runId !== analysisRunIdRef.current) return;
      resetAnalysisResults();
      setAnalysisError(
        refreshError instanceof Error ? refreshError.message : '분석 데이터를 불러오지 못했습니다.',
      );
    } finally {
      if (runId === analysisRunIdRef.current) {
        setAnalysisLoading(false);
        setChartRefreshing(false);
      }
    }
  }, [analysisSector, analysisFromYear, analysisToYear]);

  useEffect(() => {
    void fetchCompetitorDriveStatus()
      .then(setDriveStatus)
      .catch(() => setDriveStatus(null));
  }, []);

  const handleExecutiveSummaryEnriched = useCallback(
    (enriched: CompetitorExecutiveMultiYearSummary) => {
      setExecutiveSummary((current) => {
        if (
          countExecutiveOverlayEntries(enriched) <= countExecutiveOverlayEntries(current)
        ) {
          return current;
        }
        return enriched;
      });
      if (!analysisSector) return;
      const fromYear = Math.min(analysisFromYear, analysisToYear);
      const toYear = Math.max(analysisFromYear, analysisToYear);
      saveExecutiveOnlyPeriodCache(analysisSector, fromYear, toYear, enriched);
    },
    [analysisFromYear, analysisSector, analysisToYear],
  );

  const handleUploadSectorSelect = (nextSector: CompetitorSector) => {
    if (nextSector === uploadSector) return;
    resetUploadWorkspace();
    setUploadSector(nextSector);
    setUploadYear(null);
    setUploadMeta(null);
    saveUploadSelection({ sector: nextSector, year: null });
  };

  const handleUploadYearSelect = (nextYear: number) => {
    if (nextYear === uploadYear) return;
    resetUploadWorkspace();
    setUploadYear(nextYear);
    setUploadMeta(null);
    if (uploadSector) {
      saveUploadSelection({ sector: uploadSector, year: nextYear });
    }
  };

  const handleAnalysisSectorSelect = (nextSector: CompetitorSector) => {
    if (nextSector === analysisSector) return;
    setAnalysisSector(nextSector);
    restoreAnalysisResultsForSelection(nextSector, analysisFromYear, analysisToYear);
    saveAnalysisSelection({
      sector: nextSector,
      fromYear: analysisFromYear,
      toYear: analysisToYear,
    });
  };

  const handleAnalysisPeriodChange = (from: number, to: number) => {
    const { fromYear: nextFrom, toYear: nextTo } = normalizeAnalysisPeriod(from, to);
    setAnalysisFromYear(nextFrom);
    setAnalysisToYear(nextTo);
    restoreAnalysisResultsForSelection(analysisSector, nextFrom, nextTo);
    if (analysisSector) {
      saveAnalysisSelection({
        sector: analysisSector,
        fromYear: nextFrom,
        toYear: nextTo,
      });
    }
  };

  const handleRunAnalysis = () => {
    if (!analysisSector) return;
    void refreshAnalysis();
  };

  const handleSync = async () => {
    if (!uploadSector || !uploadYear) {
      setUploadError(getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus));
      return;
    }

    setSyncing(true);
    setUploadError(null);
    try {
      const result = await syncCompetitorDrive(uploadYear, uploadSector, true);
      setUploadMeta({
        syncedAt: result.meta.syncedAt,
        fileCount: result.meta.fileCount,
      });
      setUploadNotice('Google Drive에서 동기화했습니다. 분석은 하단에서 별도로 실행하세요.');
    } catch (syncError) {
      setUploadError(syncError instanceof Error ? syncError.message : '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!uploadSector || !uploadYear) {
      setUploadError(getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus));
      return;
    }

    if (!uploadAllowed) {
      setUploadError(getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus));
      return;
    }

    const files = Array.from(fileList);
    if (files.length === 0) return;

    const entries: UploadResultItem[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      status: 'pending',
    }));

    setUploading(true);
    setUploadComplete(false);
    setUploadError(null);
    setUploadNotice(null);
    setUploadResults(entries);

    let successCount = 0;

    try {
      await runWithConcurrency(
        files.map((file, index) => ({ file, entry: entries[index] })),
        COMPETITOR_UPLOAD_CONCURRENCY,
        async ({ file, entry }) => {
          setUploadResults((current) =>
            current.map((item) =>
              item.id === entry.id ? { ...item, status: 'uploading' as const } : item,
            ),
          );

          try {
            await uploadCompetitorDriveFile(file, uploadYear, uploadSector);
            successCount += 1;
            const uploadedAt = new Date().toISOString();
            setUploadResults((current) =>
              current.map((item) =>
                item.id === entry.id ? { ...item, status: 'done' as const, uploadedAt } : item,
              ),
            );
          } catch (fileError) {
            const message =
              fileError instanceof Error ? fileError.message : '업로드에 실패했습니다.';
            setUploadResults((current) =>
              current.map((item) =>
                item.id === entry.id ? { ...item, status: 'error' as const, error: message } : item,
              ),
            );
          }
        },
      );

      if (successCount > 0) {
        setUploadComplete(true);
        setUploadNotice(
          `${successCount}개 파일을 Google Drive에 업로드했습니다. 분석은 하단에서 사업분야·기간을 설정하고 실행하세요.`,
        );
        setUploadMeta((current) => ({
          syncedAt: new Date().toISOString(),
          fileCount: (current?.fileCount ?? 0) + successCount,
        }));
      }

      if (successCount < files.length) {
        setUploadError(`${files.length - successCount}개 파일 업로드에 실패했습니다.`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="competitor-analysis-dashboard">
      <section className="competitor-analysis-dashboard__section" aria-labelledby="competitor-upload-heading">
        <div className="competitor-analysis-dashboard__section-head">
          <div>
            <h2 id="competitor-upload-heading" className="competitor-analysis-dashboard__section-title">
              자료 업로드
            </h2>
            <p className="competitor-analysis-dashboard__section-desc">
              업로드 대상 폴더를 선택한 뒤 PDF·Excel 파일을 Drive에 저장합니다.
            </p>
          </div>
        </div>

        <CompetitorSelectionToolbar
          sector={uploadSector}
          year={uploadYear}
          sectorLabel="업로드 사업분야"
          yearLabel="업로드 연도"
          onSectorChange={handleUploadSectorSelect}
          onYearChange={handleUploadYearSelect}
          trailing={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSync()}
              disabled={syncing || !driveStatus?.configured || !uploadReady}
            >
              {syncing ? '동기화 중…' : 'Drive 동기화'}
            </Button>
          }
        />

        {!uploadSector && (
          <p className="competitor-analysis-dashboard__selection-hint">
            1단계 · 업로드 전 <strong>사업분야(전시사업·인테리어)</strong>를 선택하세요.
          </p>
        )}
        {uploadSector && !uploadYear && (
          <p className="competitor-analysis-dashboard__selection-hint">
            2단계 · <strong>{uploadSector}</strong> 선택됨. 연도를 선택하면 업로드할 수 있습니다.
          </p>
        )}

        {uploadNotice && <p className="competitor-analysis-dashboard__notice">{uploadNotice}</p>}
        {uploadError && (
          <p className="competitor-analysis-dashboard__error" role="alert">
            {uploadError}
          </p>
        )}

        <div className="competitor-analysis-dashboard__grid">
          <Card title="파일 업로드" subtitle={uploadFolderPath} className="competitor-analysis-dashboard__upload-card">
            <p className="competitor-analysis-dashboard__upload-help">
              감사보고서·신용평가서(PDF) 또는 재무자료(Excel/CSV)를 업로드하세요. Drive에 직접 넣은
              파일은 「Drive 동기화」로 반영합니다.
            </p>

            {uploadReady && (
              <p className="competitor-analysis-dashboard__upload-target-hint">
                선택하신 사업과 연도에 맞는 파일을 업로드 해주세요.
              </p>
            )}

            <div
              className={`competitor-analysis-dashboard__dropzone ${
                dragOver && uploadAllowed ? 'competitor-analysis-dashboard__dropzone--active' : ''
              } ${!uploadAllowed ? 'competitor-analysis-dashboard__dropzone--disabled' : ''} ${
                uploadResults.length > 0 ? 'competitor-analysis-dashboard__dropzone--has-files' : ''
              } ${uploadComplete ? 'competitor-analysis-dashboard__dropzone--complete' : ''}`}
              onDragOver={(event) => {
                if (!uploadAllowed) return;
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                if (!uploadAllowed) {
                  setUploadError(getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus));
                  return;
                }
                void handleUploadFiles(event.dataTransfer.files);
              }}
            >
              {(uploading || uploadResults.length > 0) && (
                <div className="competitor-analysis-dashboard__dropzone-files" aria-live="polite">
                  {uploadComplete && (
                    <p className="competitor-analysis-dashboard__upload-complete">
                      업로드 완료 · {uploadResults.filter((item) => item.status === 'done').length}개
                      파일이 Google Drive에 저장되었습니다.
                    </p>
                  )}
                  {uploading && !uploadComplete && (
                    <p className="competitor-analysis-dashboard__upload-progress">
                      업로드 중… ({uploadResults.filter((item) => item.status === 'done').length}/
                      {uploadResults.length})
                    </p>
                  )}
                  <ul className="competitor-analysis-dashboard__upload-list">
                    {uploadResults.map((item) => (
                      <li
                        key={item.id}
                        className={`competitor-analysis-dashboard__upload-item competitor-analysis-dashboard__upload-item--${item.status}`}
                      >
                        <span className="competitor-analysis-dashboard__upload-item-name">{item.name}</span>
                        <span className="competitor-analysis-dashboard__upload-item-meta">
                          {formatFileSize(item.size)}
                          {item.status === 'done' && item.uploadedAt
                            ? ` · ${formatDateTime(item.uploadedAt)}`
                            : ''}
                          {item.status === 'uploading' ? ' · 업로드 중…' : ''}
                          {item.status === 'pending' ? ' · 대기' : ''}
                          {item.status === 'error' ? ` · ${item.error ?? '실패'}` : ''}
                          {item.status === 'done' ? ' · 완료' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className={`competitor-analysis-dashboard__dropzone-prompt ${
                  uploadResults.length > 0 ? 'competitor-analysis-dashboard__dropzone-prompt--compact' : ''
                }`}
              >
                <input
                  type="file"
                  accept={COMPETITOR_UPLOAD_ACCEPT}
                  multiple
                  disabled={uploading || !uploadAllowed}
                  onChange={(event) => {
                    if (event.target.files) void handleUploadFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
                <strong>
                  {uploading
                    ? '업로드 중…'
                    : uploadResults.length > 0
                      ? uploadAllowed
                        ? '추가 파일을 끌어다 놓거나 클릭하여 선택'
                        : getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus) ??
                          '업로드 준비 중…'
                      : uploadAllowed
                        ? '파일을 끌어다 놓거나 클릭하여 선택'
                        : getCompetitorUploadTargetBlockReason(uploadSector, uploadYear, driveStatus) ??
                          '업로드 준비 중…'}
                </strong>
                {uploadResults.length === 0 && <span>PDF · CSV · Excel</span>}
                <span className="competitor-analysis-dashboard__upload-mode">
                  {getCompetitorUploadModeLabel(uploadSector, uploadYear, driveStatus)}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Drive 연결" className="competitor-analysis-dashboard__status-card">
            <dl className="competitor-analysis-dashboard__status-list">
              <div>
                <dt>연동</dt>
                <dd>
                  {!driveStatus
                    ? '확인 중…'
                    : driveStatus.configured && driveStatus.uploadConfigured
                      ? 'Drive 업로드 가능 (팀 공용)'
                      : driveStatus.configured
                        ? 'Drive 읽기만 가능 (OAuth 재연결 필요)'
                        : '미설정'}
                </dd>
              </div>
              <div>
                <dt>저장 위치</dt>
                <dd>Google Drive · {COMPETITOR_DRIVE_ROOT_FOLDER}</dd>
              </div>
              <div>
                <dt>업로드 폴더</dt>
                <dd>{uploadFolderPath}</dd>
              </div>
              <div>
                <dt>마지막 동기화</dt>
                <dd>{formatDateTime(uploadMeta?.syncedAt)}</dd>
              </div>
              <div>
                <dt>폴더 파일</dt>
                <dd>{uploadMeta?.fileCount != null ? `${uploadMeta.fileCount}건` : '—'}</dd>
              </div>
            </dl>
            {!uploadAllowed && driveStatus && !driveStatus.uploadConfigured && (
              <div className="competitor-analysis-dashboard__setup">
                <p>
                  {driveStatus.uploadError ??
                    '업로드·동기화를 사용하려면 Google Drive NEXUS 연동과 OAuth 업로드 설정이 필요합니다.'}
                </p>
                <p>
                  관리자가 <a href="/data-folder">데이터 폴더</a>에서 「Drive OAuth 재연결」을 한 번
                  완료하면, 로그인한 팀원 누구나 같은 Drive에 업로드할 수 있습니다.
                </p>
              </div>
            )}
          </Card>
        </div>
      </section>

      <section className="competitor-analysis-dashboard__section" aria-labelledby="competitor-analysis-heading">
        <div className="competitor-analysis-dashboard__section-head">
          <div>
            <h2 id="competitor-analysis-heading" className="competitor-analysis-dashboard__section-title">
              경쟁사 분석
            </h2>
            <p className="competitor-analysis-dashboard__section-desc">
              분석 사업분야와 분석 기간을 설정한 뒤 「분석 실행」을 클릭하면 Drive에서 해당 기간
              데이터를 가져와 분석합니다.
            </p>
          </div>
        </div>

        <CompetitorAnalysisToolbar
          sector={analysisSector}
          fromYear={analysisFromYear}
          toYear={analysisToYear}
          onSectorChange={handleAnalysisSectorSelect}
          onPeriodChange={handleAnalysisPeriodChange}
          onRun={handleRunAnalysis}
          loading={analysisLoading || chartRefreshing}
          runDisabled={!analysisFormReady}
        />

        {!analysisSector && (
          <p className="competitor-analysis-dashboard__selection-hint">
            분석할 <strong>사업분야</strong>를 선택하고, 분석 기간을 설정한 뒤 「분석 실행」을 누르세요.
          </p>
        )}

        {analysisError && (
          <p className="competitor-analysis-dashboard__error" role="alert">
            {analysisError}
          </p>
        )}

        {analysisWarnings.length > 0 && (
          <div className="competitor-analysis-dashboard__warnings" role="status">
            <strong>데이터 안내</strong>
            <ul>
              {analysisWarnings.map((warning) => (
                <li key={`${warning.kind}-${warning.year}-${warning.fallbackYear ?? 'none'}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <CompetitorExecutiveDashboard
          summary={executiveSummary}
          sector={analysisSector ?? undefined}
          fromYear={Math.min(analysisFromYear, analysisToYear)}
          toYear={Math.max(analysisFromYear, analysisToYear)}
          loading={analysisLoading && !executiveSummary}
          refreshing={chartRefreshing && analysisHasResult}
          hasResult={analysisHasResult}
          onSummaryEnriched={handleExecutiveSummaryEnriched}
        />

        <Card
          title={analysisSector ? `${analysisSector} 경쟁사 요약` : '경쟁사 요약'}
          subtitle={
            analysisHasResult && analysisSummaryYear
              ? `${analysisPeriodLabel} · ${analysisSummaryYear}년 Drive 폴더 · ${analysis?.companies.length ?? 0}개사 · PDF ${analysis?.fileCount ?? 0}건`
              : analysisHasResult
                ? `${analysisPeriodLabel} · Drive 추출 데이터 ${analysis?.fileCount ?? 0}건`
                : '분석 실행 후 표시'
          }
          className="competitor-analysis-dashboard__summary-card"
        >
          {!analysisHasResult ? (
            <p>사업분야·분석 기간을 설정하고 「분석 실행」을 클릭하면 요약 결과를 확인할 수 있습니다.</p>
          ) : analysisLoading && !analysis ? (
            <p>분석 데이터를 불러오는 중…</p>
          ) : analysis && summaryCompaniesByRevenue.length > 0 ? (
            <div className="competitor-analysis-dashboard__company-grid">
              {summaryCompaniesByRevenue.map((company) => (
                <article
                  key={company.sourceFile ?? company.companyName}
                  className="competitor-analysis-dashboard__company-card"
                >
                  <header>
                    <h3>
                      {formatCompetitorDisplayCompanyName(
                        company.companyName,
                        company.sourceFile,
                        analysis?.sector,
                      )}
                    </h3>
                    <span>
                      {company.documentTypes.map((type) => formatCompetitorDocumentType(type)).join(' · ')}
                    </span>
                  </header>
                  <ul>
                    {company.metrics.slice(0, 8).map((metric) => (
                      <li key={`${company.companyName}-${metric.key}`}>
                        <span>{metric.label}</span>
                        <strong>{formatMetricValue(metric)}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p>해당 기간·사업분야에 분석할 파일이 없습니다. 자료를 업로드하거나 Drive에서 동기화하세요.</p>
          )}
        </Card>

        <Card
          title="원본 파일 분석 내역"
          subtitle={
            analysisSummaryYear
              ? `${analysisSummaryYear}년 Drive 폴더 · 파일별 추출 지표`
              : '파일별 추출 지표'
          }
        >
          {!analysisHasResult ? (
            <p>사업분야·분석 기간을 설정하고 「분석 실행」을 클릭하면 분석 내역을 확인할 수 있습니다.</p>
          ) : analysisLoading && !analysis ? (
            <p>…</p>
          ) : analysis && analysis.documents.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table competitor-analysis-table">
                <thead>
                  <tr>
                    <th>파일</th>
                    <th>유형</th>
                    <th>회사</th>
                    <th>회계연도</th>
                    <th>감사인</th>
                    <th>추출 지표</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.documents.map((document) => (
                    <tr key={document.fileName}>
                      <td>{document.fileName}</td>
                      <td>{formatCompetitorDocumentType(document.documentType)}</td>
                      <td>
                        {formatCompetitorDisplayCompanyName(
                          document.companyName ?? '-',
                          document.fileName,
                          analysis?.sector,
                        )}
                      </td>
                      <td>{document.fiscalYear ?? '-'}</td>
                      <td>{document.auditFirm ?? '-'}</td>
                      <td>
                        {document.metrics.length > 0
                          ? document.metrics
                              .slice(0, 4)
                              .map((metric) => `${metric.label}: ${formatMetricValue(metric)}`)
                              .join(' · ')
                          : '-'}
                      </td>
                      <td>{document.warnings[0] ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>표시할 분석 내역이 없습니다.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
