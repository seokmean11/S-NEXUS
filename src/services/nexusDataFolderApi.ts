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
  uploadError?: string;
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

export async function startGoogleDriveOAuthReconnect(): Promise<{
  ok: boolean;
  authUrl: string;
  message?: string;
}> {
  return readJson('/api/google-drive-oauth/start', { method: 'POST' });
}

export async function fetchGoogleDriveOAuthStatus(): Promise<{
  ok: boolean;
  uploadConfigured: boolean;
  hasCredentials: boolean;
  error?: string;
}> {
  return readJson('/api/google-drive-oauth/status');
}

export const GOOGLE_DRIVE_SETUP_STEPS = [
  'Google Cloud Console에서 프로젝트 생성 → Google Drive API 사용 설정',
  '서비스 계정 생성 → JSON 키 다운로드 → google-service-account.json (동기화·읽기용)',
  'Google Drive에 NEXUS / 외주정보데이터 폴더 생성 → NEXUS를 서비스 계정에 편집자 공유',
  'NEXUS 폴더 ID → .env GOOGLE_DRIVE_NEXUS_FOLDER_ID',
  'OAuth 클라이언트 ID(데스크톱) 생성 → .env GOOGLE_OAUTH_CLIENT_ID / SECRET',
  '데이터폴더에서 「Drive OAuth 재연결」(또는 npm run google-drive-oauth) → Drive 소유자 계정으로 1회 허용',
  '팀 사용 시 Google Cloud Console OAuth 동의 화면을 게시(프로덕션)로 전환 (테스트 모드는 약 7일 만료)',
];

export const GOOGLE_DRIVE_OAUTH_NOTE =
  '웹 업로드는 서버 공용 OAuth 토큰으로 관리자 Drive에 저장됩니다. 로그인한 팀원 누구나 같은 Drive에 올릴 수 있습니다. 토큰이 만료되면 관리자가 「Drive OAuth 재연결」만 하면 됩니다.';

export function stripDriveFolderPrefix(fileName: string, driveFolder: string): string {
  const prefix = `${driveFolder}/`;
  return fileName.startsWith(prefix) ? fileName.slice(prefix.length) : fileName;
}
