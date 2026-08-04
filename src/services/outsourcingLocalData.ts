import { parseOutsourcingCsvAsync } from '@/services/outsourcingCsvParser';
import type { OutsourcingRecord } from '@/types/outsourcing';

export interface OutsourcingLocalInfo {
  configured: boolean;
  configuredPath?: string;
  fileName?: string;
  sourcePath?: string;
  updatedAt?: string;
  message?: string;
  error?: string;
}

export interface OutsourcingLocalPayload {
  fileName: string;
  sourcePath: string;
  updatedAt: string;
  csv: string;
}

export type OutsourcingDataSource = 'local-folder' | 'manual-file' | 'bundled-sample';

export interface OutsourcingLoadResult {
  records: OutsourcingRecord[];
  source: OutsourcingDataSource;
  fileName: string;
  sourcePath: string;
  updatedAt?: string;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `요청 실패 (${response.status})`);
  }
  return payload;
}

export async function fetchLocalOutsourcingInfo(): Promise<OutsourcingLocalInfo> {
  return readJson<OutsourcingLocalInfo>('/api/outsourcing/local/info');
}

export async function fetchLocalOutsourcingRecords(): Promise<OutsourcingLoadResult> {
  const payload = await readJson<OutsourcingLocalPayload>('/api/outsourcing/local');
  const records = await parseOutsourcingCsvAsync(payload.csv);
  if (records.length === 0) {
    throw new Error('로컬 CSV에서 외주 데이터 행을 읽지 못했습니다.');
  }

  return {
    records,
    source: 'local-folder',
    fileName: payload.fileName,
    sourcePath: payload.sourcePath,
    updatedAt: payload.updatedAt,
  };
}

export async function fetchBundledSampleRecords(): Promise<OutsourcingLoadResult> {
  const response = await fetch('/data/outsourcing-sample.csv');
  if (!response.ok) {
    throw new Error(`기본 샘플 CSV를 불러오지 못했습니다. (${response.status})`);
  }
  const csv = await response.text();
  const records = await parseOutsourcingCsvAsync(csv);
  if (records.length === 0) {
    throw new Error('기본 샘플 CSV에서 외주 데이터 행을 읽지 못했습니다.');
  }

  return {
    records,
    source: 'bundled-sample',
    fileName: 'outsourcing-sample.csv',
    sourcePath: 'public/data/outsourcing-sample.csv',
  };
}

export async function parseOutsourcingUploadFile(file: File): Promise<OutsourcingLoadResult> {
  const csv = await file.text();
  const records = await parseOutsourcingCsvAsync(csv);
  if (records.length === 0) {
    throw new Error('선택한 CSV에서 외주 데이터 행을 읽지 못했습니다.');
  }

  return {
    records,
    source: 'manual-file',
    fileName: file.name,
    sourcePath: file.name,
    updatedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
  };
}

export function getLocalOutsourcingSetupHint(): string {
  return [
    '1. AppSheet에서 CSV 내보내기(AppSheet.ViewData.*.csv) 후 PC 폴더에 저장',
    '2. 프로젝트 루트 outsourcing-data.path 파일에 폴더 경로 1줄 입력',
    '   예: C:\\Users\\seosm\\Desktop\\appsheet(외주DB)',
    '   (또는 .env OUTSOURCING_DATA_PATH 사용 가능)',
    '3. 폴더 지정 시 수정한 날짜 기준 최신 .csv 자동 선택',
    '4. npm run dev 개발 서버 재시작 → 외주정보검색에서 「폴더 새로고침」',
  ].join('\n');
}

export function formatOutsourcingSourceLabel(
  result: Pick<OutsourcingLoadResult, 'source' | 'fileName'>,
): string {
  switch (result.source) {
    case 'local-folder':
      return `로컬 폴더 · ${result.fileName}`;
    case 'manual-file':
      return `선택 파일 · ${result.fileName}`;
    default:
      return `기본 샘플 · ${result.fileName}`;
  }
}

export async function loadOutsourcingRecords(): Promise<OutsourcingLoadResult> {
  try {
    const info = await fetchLocalOutsourcingInfo();
    if (info.configured && !info.error) {
      return await fetchLocalOutsourcingRecords();
    }
  } catch {
    // 로컬 API 미사용 시 샘플로 폴백
  }

  return fetchBundledSampleRecords();
}
