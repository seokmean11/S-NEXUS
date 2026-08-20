import type {
  CompetitorAnalysisSummary,
  CompetitorDriveFileInfo,
  CompetitorDriveSyncMeta,
  CompetitorSector,
  CompetitorTrendSummary,
  CompetitorMultiYearSummary,
  MasterCompetitorData,
} from '@/types/competitorAnalysis';
import type { CompetitorExecutiveMultiYearSummary } from '@/types/competitorStandard';
import type { CompetitorAnalysisPeriodWarning } from '@/types/competitorStandard';
import { COMPETITOR_DRIVE_ROOT_FOLDER, COMPETITOR_SECTORS } from '@/types/competitorAnalysis';
import { GOOGLE_DRIVE_OAUTH_NOTE, GOOGLE_DRIVE_SETUP_STEPS } from '@/services/nexusDataFolderApi';

export { COMPETITOR_DRIVE_ROOT_FOLDER, COMPETITOR_SECTORS, GOOGLE_DRIVE_SETUP_STEPS };
export type { CompetitorSector };

export interface CompetitorDriveStatus {
  configured: boolean;
  folderId?: string;
  cacheDir?: string;
  uploadConfigured: boolean;
  rootFolder: string;
  folderPattern: string;
}

async function readResponsePayload<T>(response: Response): Promise<T & { error?: string }> {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? '서버 응답이 비어 있습니다. dev 서버(npm run dev)를 재시작했는지 확인하세요.'
        : `요청 실패 (${response.status}). API 서버가 응답하지 않습니다.`,
    );
  }

  try {
    return JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(`서버 응답을 해석하지 못했습니다. (${response.status})`);
  }
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readResponsePayload<T>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? `요청 실패 (${response.status})`);
  }
  return payload;
}

export function fetchCompetitorDriveStatus(): Promise<CompetitorDriveStatus> {
  return readJson<CompetitorDriveStatus>('/api/competitor/status');
}

export function fetchCompetitorDriveFiles(
  year: number,
  sector: CompetitorSector,
): Promise<{ configured: boolean; files: CompetitorDriveFileInfo[]; year: number; sector: CompetitorSector }> {
  return readJson(
    `/api/competitor/files?year=${year}&sector=${encodeURIComponent(sector)}`,
  );
}

export function syncCompetitorDrive(
  year: number,
  sector: CompetitorSector,
  force = true,
): Promise<{ ok: boolean; meta: CompetitorDriveSyncMeta; year: number; sector: CompetitorSector }> {
  return readJson('/api/competitor/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, sector, force }),
  });
}

export async function uploadCompetitorDriveFile(
  file: File,
  year: number,
  sector: CompetitorSector,
): Promise<{ ok: boolean; file: CompetitorDriveFileInfo; year: number; sector: CompetitorSector }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));
  formData.append('sector', sector);
  const response = await fetch('/api/competitor/upload', {
    method: 'POST',
    body: formData,
  });
  const payload = await readResponsePayload<{
    ok: boolean;
    file: CompetitorDriveFileInfo;
    year: number;
    sector: CompetitorSector;
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? `업로드 실패 (${response.status})`);
  }
  return payload;
}

export function fetchCompetitorAnalysis(
  year: number,
  sector: CompetitorSector,
  force = false,
): Promise<CompetitorAnalysisSummary> {
  const forceQuery = force ? '&force=1' : '';
  return readJson(
    `/api/competitor/analysis?year=${year}&sector=${encodeURIComponent(sector)}${forceQuery}`,
  );
}

export function fetchCompetitorPeriodAnalysis(options: {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  force?: boolean;
}): Promise<{
  sector: CompetitorSector;
  requestedFromYear: number;
  requestedToYear: number;
  effectiveFromYear: number | null;
  effectiveToYear: number | null;
  baseYear: number;
  summaryYear: number | null;
  warnings: CompetitorAnalysisPeriodWarning[];
  executive: CompetitorExecutiveMultiYearSummary;
  analysis: CompetitorAnalysisSummary | null;
  configured: boolean;
  folderPath: string;
}> {
  const params = new URLSearchParams({
    sector: options.sector,
    fromYear: String(Math.min(options.fromYear, options.toYear)),
    toYear: String(Math.max(options.fromYear, options.toYear)),
  });
  if (options.force) params.set('force', '1');
  return readJson(`/api/competitor/period-analysis?${params.toString()}`);
}

export function fetchProductivityEmployeesOverlay(options: {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  force?: boolean;
}): Promise<{
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  productivityEmployeesByYear: Record<
    string,
    Record<string, import('@/types/competitorStandard').ProductivityEmployeeEntry>
  >;
}> {
  const params = new URLSearchParams({
    sector: options.sector,
    fromYear: String(Math.min(options.fromYear, options.toYear)),
    toYear: String(Math.max(options.fromYear, options.toYear)),
  });
  if (options.force) params.set('force', '1');
  return readJson(`/api/competitor/productivity-employees?${params.toString()}`);
}

export function fetchIndustryAnalysisOverlay(options: {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  force?: boolean;
}): Promise<{
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  industryAnalysisByYear: Record<
    string,
    Record<string, import('@/types/competitorStandard').IndustryAnalysisEntry>
  >;
}> {
  const params = new URLSearchParams({
    sector: options.sector,
    fromYear: String(Math.min(options.fromYear, options.toYear)),
    toYear: String(Math.max(options.fromYear, options.toYear)),
  });
  if (options.force) params.set('force', '1');
  return readJson(`/api/competitor/industry-analysis?${params.toString()}`);
}

export function fetchCompetitorExecutive(options: {
  sector: CompetitorSector;
  baseYear: number;
  fromYear?: number;
  toYear?: number;
  force?: boolean;
}): Promise<CompetitorExecutiveMultiYearSummary & { folderPath?: string; configured?: boolean }> {
  const params = new URLSearchParams({
    sector: options.sector,
    baseYear: String(options.baseYear),
    fromYear: String(options.fromYear ?? 2021),
    toYear: String(options.toYear ?? 2025),
  });
  if (options.force) params.set('force', '1');
  return readJson(`/api/competitor/executive?${params.toString()}`);
}

export function fetchCompetitorTrends(options: {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  companyKeys?: string[];
  companyNames?: string[];
}): Promise<CompetitorTrendSummary> {
  const params = new URLSearchParams({
    sector: options.sector,
    fromYear: String(options.fromYear),
    toYear: String(options.toYear),
  });
  if (options.companyKeys?.length) {
    params.set('companyKeys', options.companyKeys.join(','));
  } else if (options.companyNames?.length) {
    params.set('companyNames', options.companyNames.join(','));
  }
  return readJson(`/api/competitor/trends?${params.toString()}`);
}

export function fetchCompetitorAiInsights(options: {
  sector: CompetitorSector;
  fromYear: number;
  toYear: number;
  records: Array<Record<string, unknown>>;
  validationSummary?: { review: number; reparse: number; claudeReparsed: number };
  apiKey: string;
}): Promise<{ ok: boolean; insights: string }> {
  return readJson('/api/competitor/ai-insights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
    },
    body: JSON.stringify({
      sector: options.sector,
      fromYear: options.fromYear,
      toYear: options.toYear,
      records: options.records,
      validationSummary: options.validationSummary,
    }),
  });
}

export function fetchCompetitorExecutiveClaudeInsights(options: {
  context: Record<string, unknown>;
  cacheKey?: string;
  apiKey: string;
}): Promise<{
  ok: boolean;
  insights: {
    timeline: Array<{ severity: string; title: string; detail: string }>;
    revenueRanking: Array<{ severity: string; title: string; detail: string }>;
    costStructure: Array<{ severity: string; title: string; detail: string }>;
    productivity: Array<{ severity: string; title: string; detail: string }>;
    financialHealth?: Array<{ severity: string; title: string; detail: string }>;
  };
  usage?: { input_tokens: number; output_tokens: number };
  usedFallback?: boolean;
  cacheHit?: boolean;
}> {
  return readJson('/api/competitor/executive-insights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
    },
    body: JSON.stringify({ context: options.context, cacheKey: options.cacheKey }),
  });
}

export function fetchCompetitorMultiYear(options: {
  sector: CompetitorSector;
  baseYear: number;
  periodYears: number;
  rebuild?: boolean;
}): Promise<CompetitorMultiYearSummary> {
  const params = new URLSearchParams({
    sector: options.sector,
    baseYear: String(options.baseYear),
    periodYears: String(options.periodYears),
  });
  if (options.rebuild) {
    params.set('rebuild', '1');
  }
  return readJson(`/api/competitor/multi-year?${params.toString()}`);
}

export function fetchMasterCompetitorData(rebuild = false, force = false): Promise<MasterCompetitorData> {
  const params = new URLSearchParams();
  if (rebuild) params.set('rebuild', '1');
  if (force) params.set('force', '1');
  const query = params.toString();
  return readJson(`/api/competitor/master${query ? `?${query}` : ''}`);
}

export function rebuildMasterCompetitorDataApi(options?: {
  force?: boolean;
  sectors?: CompetitorSector[];
}): Promise<{ ok: boolean; master: MasterCompetitorData }> {
  return readJson('/api/competitor/master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  });
}

export const COMPETITOR_UPLOAD_ACCEPT = '.pdf,.csv,.xlsx,.xls';
export const COMPETITOR_UPLOAD_CONCURRENCY = 5;

export const COMPETITOR_DRIVE_GUIDE = [
  `Google Drive NEXUS 폴더 아래 「${COMPETITOR_DRIVE_ROOT_FOLDER}」를 사용합니다.`,
  '웹 업로드 시 「경쟁사분석/{연도}/{전시사업|인테리어}」 폴더가 없으면 자동 생성됩니다.',
  '업로드된 PDF는 연도/사업분야 폴더에 저장되고, 파싱 결과는 「master-competitor-data.json」 통합 정본에 기업별 시계열로 Merge됩니다.',
  '장기 추이 분석은 기준 연도 폴더의 분석 대상 기업을 확정한 뒤 과거 N개년 history를 조회합니다.',
  'Drive 웹에서 직접 파일을 넣은 경우 「Drive 동기화」로 분석 데이터를 갱신합니다.',
  GOOGLE_DRIVE_OAUTH_NOTE,
];

export const COMPETITOR_YEAR_MIN = 2021;
export const COMPETITOR_YEAR_MAX = 2050;

export function buildYearOptions(
  minYear = COMPETITOR_YEAR_MIN,
  maxYear = COMPETITOR_YEAR_MAX,
): number[] {
  const years: number[] = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(year);
  }
  return years;
}

export function formatCompetitorDocumentType(type: string): string {
  switch (type) {
    case 'audit-report':
      return '감사보고서';
    case 'credit-rating':
      return '신용평가서';
    case 'financial-sheet':
      return '재무제표';
    default:
      return '기타';
  }
}

export function isCompetitorDriveUploadReady(status: CompetitorDriveStatus | null): boolean {
  return Boolean(status?.configured && status.uploadConfigured);
}

export function isCompetitorUploadAllowed(
  sector: CompetitorSector | null,
  year: number | null,
  status: CompetitorDriveStatus | null,
): boolean {
  return Boolean(sector && year && isCompetitorDriveUploadReady(status));
}

export function getCompetitorUploadTargetBlockReason(
  sector: CompetitorSector | null,
  year: number | null,
  status: CompetitorDriveStatus | null,
): string | null {
  if (!sector) return '먼저 사업분야(전시사업·인테리어)를 선택하세요.';
  if (!year) return '연도를 선택하면 업로드할 수 있습니다.';
  return getCompetitorUploadBlockReason(status);
}

export function getCompetitorUploadBlockReason(status: CompetitorDriveStatus | null): string | null {
  if (!status) return 'Drive 연결 상태를 확인하는 중입니다.';
  if (!status.configured) {
    return 'Google Drive NEXUS 연동이 필요합니다. GOOGLE_DRIVE_NEXUS_FOLDER_ID와 서비스 계정 키를 설정하세요.';
  }
  if (!status.uploadConfigured) {
    return 'Google Drive OAuth 업로드 설정이 필요합니다. GOOGLE_OAUTH_* 설정 후 npm run google-drive-oauth를 실행하세요.';
  }
  return null;
}

export function getCompetitorUploadModeLabel(
  sector: CompetitorSector | null,
  year: number | null,
  status: CompetitorDriveStatus | null,
): string {
  const targetReason = getCompetitorUploadTargetBlockReason(sector, year, status);
  if (targetReason) return targetReason;
  return 'Google Drive 업로드 연동됨 · 선택한 연도·사업분야 폴더에 저장됩니다.';
}
