export interface NexusDriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export interface NexusDriveSyncMeta {
  syncedAt: string;
  folderId: string;
  fileCount: number;
  files: Array<{ name: string; modifiedTime: string }>;
}

export interface NexusDriveStatus {
  configured: boolean;
  folderId?: string;
  cacheDir?: string;
  lastSync?: NexusDriveSyncMeta;
  error?: string;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `요청 실패 (${response.status})`);
  }
  return payload;
}

export function fetchNexusDataFolderStatus(): Promise<NexusDriveStatus> {
  return readJson<NexusDriveStatus>('/api/nexus-data-folder/status');
}

export function fetchNexusDataFolderFiles(): Promise<{
  configured: boolean;
  files: NexusDriveFileInfo[];
}> {
  return readJson('/api/nexus-data-folder/files');
}

export function syncNexusDataFolder(force = true): Promise<{ ok: boolean; meta: NexusDriveSyncMeta }> {
  return readJson('/api/nexus-data-folder/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
}

export async function uploadNexusDataFolderFile(file: File): Promise<{
  ok: boolean;
  file: NexusDriveFileInfo;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/nexus-data-folder/upload', {
    method: 'POST',
    body: formData,
  });
  const payload = (await response.json()) as { ok: boolean; file: NexusDriveFileInfo; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `업로드 실패 (${response.status})`);
  }
  return payload;
}

export const GOOGLE_DRIVE_SETUP_STEPS = [
  'Google Cloud Console에서 프로젝트 생성 → Google Drive API 사용 설정',
  '서비스 계정 생성 → JSON 키 다운로드 → 프로젝트 루트에 google-service-account.json 저장 (Git 제외)',
  'Google Drive에 NEXUS 루트 폴더 생성 → 그 안에 외주정보데이터 하위 폴더 생성',
  'NEXUS 루트 폴더를 서비스 계정 이메일에 편집자 권한 공유 (하위 폴더 자동 포함)',
  'NEXUS 루트 폴더 URL에서 ID 복사 → .env에 GOOGLE_DRIVE_NEXUS_FOLDER_ID 입력',
  'PC 개발웹·서비스 서버 .env에 동일 값 + 키 경로 설정 → dev 서버 재시작',
  '외주 CSV 등을 데이터폴더에 업로드하면 NEXUS/외주정보데이터에 저장되고 외주정보검색에 반영',
];
