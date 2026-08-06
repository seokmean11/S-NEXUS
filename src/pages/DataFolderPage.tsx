import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { fetchLocalOutsourcingInfo, type OutsourcingLocalInfo } from '@/services/outsourcingLocalData';
import {
  fetchNexusDataFolderFiles,
  fetchNexusDataFolderStatus,
  GOOGLE_DRIVE_SETUP_STEPS,
  GOOGLE_DRIVE_OAUTH_NOTE,
  NEXUS_DATA_MENU_SLOTS,
  stripDriveFolderPrefix,
  syncNexusDataFolder,
  uploadNexusDataFolderFile,
  type NexusDataMenuSlot,
  type NexusDataMenuSlotKey,
  type NexusDriveFileInfo,
  type NexusDriveStatus,
} from '@/services/nexusDataFolderApi';

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR');
}

function formatFileSize(size?: string): string {
  if (!size) return '-';
  const kb = Math.round(Number(size) / 1024);
  if (Number.isNaN(kb)) return '-';
  return `${kb.toLocaleString('ko-KR')} KB`;
}

interface MenuSlotState {
  files: NexusDriveFileInfo[];
  outsourcingInfo: OutsourcingLocalInfo | null;
}

function getMenuConnectionLabel(
  slot: NexusDataMenuSlot,
  driveConfigured: boolean,
  menuState: MenuSlotState | undefined,
): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (!slot.enabled) {
    return { label: '준비 중', tone: 'muted' };
  }
  if (!driveConfigured) {
    return { label: 'Drive 미연결', tone: 'warn' };
  }
  if (slot.key === 'outsourcing') {
    const info = menuState?.outsourcingInfo;
    if (!info?.configured) return { label: '데이터 없음', tone: 'warn' };
    if (info.dataSource === 'google-drive') return { label: 'Drive 연결', tone: 'ok' };
    if (info.dataSource === 'local') return { label: '로컬 폴더 사용', tone: 'warn' };
    return { label: '연결됨', tone: 'ok' };
  }
  return { label: '연결됨', tone: 'ok' };
}

function getActiveFileName(slot: NexusDataMenuSlot, menuState: MenuSlotState | undefined): string {
  if (slot.key === 'outsourcing') {
    return menuState?.outsourcingInfo?.fileName ?? '-';
  }
  return '-';
}

function getActiveFileUpdatedAt(slot: NexusDataMenuSlot, menuState: MenuSlotState | undefined): string {
  if (slot.key === 'outsourcing') {
    return formatDateTime(menuState?.outsourcingInfo?.updatedAt);
  }
  return '-';
}

export function DataFolderPage() {
  const [status, setStatus] = useState<NexusDriveStatus | null>(null);
  const [menuStates, setMenuStates] = useState<Partial<Record<NexusDataMenuSlotKey, MenuSlotState>>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<NexusDataMenuSlotKey | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<NexusDataMenuSlotKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await fetchNexusDataFolderStatus();
      setStatus(nextStatus);

      const nextMenuStates: Partial<Record<NexusDataMenuSlotKey, MenuSlotState>> = {};
      for (const slot of NEXUS_DATA_MENU_SLOTS) {
        if (!slot.enabled) continue;
        const filesResult = nextStatus.configured
          ? await fetchNexusDataFolderFiles(slot.key)
          : { files: [] as NexusDriveFileInfo[] };
        const outsourcingInfo = slot.key === 'outsourcing' ? await fetchLocalOutsourcingInfo() : null;
        nextMenuStates[slot.key] = {
          files: filesResult.files,
          outsourcingInfo,
        };
      }
      setMenuStates(nextMenuStates);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUploadFiles = async (slot: NexusDataMenuSlot, fileList: FileList | File[]) => {
    const items = Array.from(fileList);
    if (items.length === 0 || !slot.enabled) return;

    setUploadingSlot(slot.key);
    setError(null);
    setNotice(null);
    try {
      for (const file of items) {
        await uploadNexusDataFolderFile(file, slot.key);
      }
      setNotice(
        `${slot.menuLabel}: ${items.length}개 파일을 Google Drive NEXUS/${slot.driveFolder}에 저장했습니다.`,
      );
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const results = await Promise.all(
        NEXUS_DATA_MENU_SLOTS.filter((slot) => slot.enabled).map((slot) =>
          syncNexusDataFolder(true, slot.key),
        ),
      );
      const totalFiles = results.reduce((sum, result) => sum + result.meta.fileCount, 0);
      setNotice(`Drive → 로컬 캐시 동기화 완료 (${totalFiles}개 데이터 파일)`);
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const driveConfigured = Boolean(status?.configured);
  const uploadConfigured = Boolean(status?.uploadConfigured);

  return (
    <div className="data-folder-page">
      <div className="page-header no-print">
        <h2>데이터폴더</h2>
        <p>
          Google Drive <strong>NEXUS</strong> 아래 메뉴별 폴더에 파일을 올리면, 연결된 메뉴가 개발웹·서비스
          웹에서 같은 데이터를 자동으로 사용합니다.
        </p>
      </div>

      <section className="data-folder-page__drive-bar card no-print">
        <div className="data-folder-page__drive-bar-main">
          <span
            className={`data-folder-page__badge data-folder-page__badge--${driveConfigured ? 'ok' : 'warn'}`}
          >
            {driveConfigured ? 'Google Drive 연결됨' : 'Google Drive 미연결'}
          </span>
          <div className="data-folder-page__drive-bar-meta">
            <span>NEXUS 루트 · {status?.folderId ?? '미설정'}</span>
            <span>마지막 동기화 · {formatDateTime(status?.lastSync?.syncedAt)}</span>
            <span>
              웹 업로드 ·{' '}
              {uploadConfigured ? 'OAuth 준비됨' : 'OAuth 미설정 (Drive 웹에서 직접 업로드 가능)'}
            </span>
          </div>
          {status?.error && <p className="data-folder-page__error-text">{status.error}</p>}
        </div>
        <div className="data-folder-page__toolbar">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            상태 새로고침
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleSync()} disabled={!driveConfigured || syncing}>
            {syncing ? '동기화 중…' : '전체 동기화'}
          </Button>
        </div>
      </section>

      {notice && <p className="data-folder-page__notice no-print">{notice}</p>}
      {error && <p className="data-folder-page__error no-print">{error}</p>}

      {driveConfigured && !uploadConfigured && (
        <p className="data-folder-page__oauth-note no-print">{GOOGLE_DRIVE_OAUTH_NOTE}</p>
      )}

      {!driveConfigured && (
        <section className="data-folder-page__setup card no-print">
          <h3>Google Drive 연동 설정 (1회)</h3>
          <ol className="data-folder-page__setup-list">
            {GOOGLE_DRIVE_SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <div className="data-folder-page__menu-grid">
        {NEXUS_DATA_MENU_SLOTS.map((slot) => {
          const menuState = menuStates[slot.key];
          const connection = getMenuConnectionLabel(slot, driveConfigured, menuState);
          const uploading = uploadingSlot === slot.key;
          const dragOver = dragOverSlot === slot.key;
          const activeFileName = getActiveFileName(slot, menuState);
          const activeUpdatedAt = getActiveFileUpdatedAt(slot, menuState);
          const folderFiles = menuState?.files ?? [];

          return (
            <section key={slot.key} className={`data-folder-page__menu-card card${slot.enabled ? '' : ' data-folder-page__menu-card--disabled'}`}>
              <header className="data-folder-page__menu-card-header">
                <div>
                  <h3>{slot.menuLabel}</h3>
                  <p className="data-folder-page__menu-path">
                    NEXUS / {slot.driveFolder}
                  </p>
                </div>
                <span className={`data-folder-page__badge data-folder-page__badge--${connection.tone}`}>
                  {connection.label}
                </span>
              </header>

              <dl className="data-folder-page__menu-meta">
                <div>
                  <dt>웹에서 사용 중인 파일</dt>
                  <dd>{activeFileName}</dd>
                </div>
                <div>
                  <dt>파일 갱신</dt>
                  <dd>{activeUpdatedAt}</dd>
                </div>
                <div>
                  <dt>Drive 폴더 파일 수</dt>
                  <dd>{folderFiles.length.toLocaleString('ko-KR')}개</dd>
                </div>
              </dl>

              {slot.enabled && driveConfigured && uploadConfigured && (
                <div
                  className={`data-folder-page__dropzone${dragOver ? ' data-folder-page__dropzone--active' : ''}${uploading ? ' data-folder-page__dropzone--busy' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverSlot(slot.key);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOverSlot(null);
                    if (uploading) return;
                    void handleUploadFiles(slot, event.dataTransfer.files);
                  }}
                >
                  <p className="data-folder-page__dropzone-title">파일 업로드</p>
                  <p className="data-folder-page__dropzone-desc">
                    CSV · Excel을 끌어다 놓으면 <strong>Google Drive NEXUS/{slot.driveFolder}</strong>에
                    저장됩니다.
                  </p>
                  <label className="data-folder-page__file-input">
                    <input
                      type="file"
                      multiple
                      accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      disabled={uploading}
                      onChange={(event) => {
                        if (!event.target.files) return;
                        void handleUploadFiles(slot, event.target.files);
                        event.target.value = '';
                      }}
                    />
                    {uploading ? '업로드 중…' : '파일 선택'}
                  </label>
                </div>
              )}

              {slot.enabled && driveConfigured && !uploadConfigured && (
                <p className="data-folder-page__hint">
                  웹 업로드는 OAuth 설정 후 사용할 수 있습니다. 지금은{' '}
                  <a
                    href={`https://drive.google.com/drive/folders/${status?.folderId ?? ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Drive NEXUS/{slot.driveFolder}
                  </a>
                  에 직접 넣은 뒤 「전체 동기화」를 눌러 주세요.
                </p>
              )}

              {!slot.enabled && (
                <p className="data-folder-page__hint">이 메뉴는 Drive 폴더 연동 준비 중입니다.</p>
              )}

              {slot.enabled && folderFiles.length > 0 && (
                <div className="data-folder-page__file-list">
                  <p className="data-folder-page__file-list-title">Drive 폴더 파일</p>
                  <ul>
                    {folderFiles.map((file) => (
                      <li key={file.id}>
                        <span className="data-folder-page__file-name">
                          {stripDriveFolderPrefix(file.name, slot.driveFolder)}
                        </span>
                        <span className="data-folder-page__file-meta">
                          {formatDateTime(file.modifiedTime)} · {formatFileSize(file.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {slot.enabled && (
                <footer className="data-folder-page__menu-card-footer no-print">
                  <Link to={slot.route} className="data-folder-page__menu-link">
                    {slot.menuLabel} 화면 열기 →
                  </Link>
                </footer>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
