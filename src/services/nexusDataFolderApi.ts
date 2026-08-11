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
  uploadConfigured?: boolean;
  uploadMethod?: 'oauth' | 'unavailable';
  error?: string;
}

export type NexusDataMenuSlotKey = 'outsourcing' | 'organization';

export interface NexusDataMenuSlot {
  key: NexusDataMenuSlotKey;
  menuLabel: string;
  driveFolder: string;
  route: string;
  enabled: boolean;
  description: string;
}

/** 메뉴별 Drive 하위 폴더 매핑 — 기능 추가 시 여기에 슬롯 추가 */
export const NEXUS_DATA_MENU_SLOTS: NexusDataMenuSlot[] = [
  {
    key: 'outsourcing',
    menuLabel: '외주정보검색',
    driveFolder: '외주정보데이터',
    route: '/outsourcing',
    enabled: true,
    description: 'AppSheet CSV · Excel 외주 DB',
  },
  {
    key: 'organization',
    menuLabel: '조직관리',
    driveFolder: '조직인원데이터',
    route: '/org',
    enabled: true,
    description: '조직·인원 state.json (자동 저장)',
  },
];

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

export function fetchNexusDataFolderFiles(
  slot: NexusDataMenuSlotKey = 'outsourcing',
): Promise<{
  configured: boolean;
  files: NexusDriveFileInfo[];
  slot: NexusDataMenuSlotKey;
}> {
  return readJson(`/api/nexus-data-folder/files?slot=${slot}`);
}

export function syncNexusDataFolder(
  force = true,
  slot: NexusDataMenuSlotKey = 'outsourcing',
): Promise<{ ok: boolean; meta: NexusDriveSyncMeta; slot: NexusDataMenuSlotKey }> {
  return readJson('/api/nexus-data-folder/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force, slot }),
  });
}

export async function uploadNexusDataFolderFile(
  file: File,
  slot: NexusDataMenuSlotKey = 'outsourcing',
): Promise<{
  ok: boolean;
  file: NexusDriveFileInfo;
  slot: NexusDataMenuSlotKey;
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('slot', slot);
  const response = await fetch('/api/nexus-data-folder/upload', {
    method: 'POST',
    body: formData,
  });
  const payload = (await response.json()) as {
    ok: boolean;
    file: NexusDriveFileInfo;
    slot: NexusDataMenuSlotKey;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `업로드 실패 (${response.status})`);
  }
  return payload;
}

export const GOOGLE_DRIVE_SETUP_STEPS = [
  'Google Cloud Console에서 프로젝트 생성 → Google Drive API 사용 설정',
  '서비스 계정 생성 → JSON 키 다운로드 → google-service-account.json (동기화·읽기용)',
  'Google Drive에 NEXUS / 외주정보데이터 폴더 생성 → NEXUS를 서비스 계정에 편집자 공유',
  'NEXUS 폴더 ID → .env GOOGLE_DRIVE_NEXUS_FOLDER_ID',
  'OAuth 클라이언트 ID(데스크톱) 생성 → .env GOOGLE_OAUTH_CLIENT_ID / SECRET → npm run google-drive-oauth',
  '발급된 GOOGLE_OAUTH_REFRESH_TOKEN을 .env에 추가 → dev 서버 재시작',
];

export const GOOGLE_DRIVE_OAUTH_NOTE =
  '개인 Google Drive는 서비스 계정 업로드 할당량이 없습니다. 웹에서 파일 업로드하려면 OAuth 설정이 필요합니다. Drive 웹에서 직접 넣으면 동기화만으로도 사용 가능합니다.';

export function stripDriveFolderPrefix(fileName: string, driveFolder: string): string {
  const prefix = `${driveFolder}/`;
  return fileName.startsWith(prefix) ? fileName.slice(prefix.length) : fileName;
}
