import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import {
  fetchNexusDataFolderFiles,
  fetchNexusDataFolderStatus,
  GOOGLE_DRIVE_SETUP_STEPS,
  syncNexusDataFolder,
  uploadNexusDataFolderFile,
  type NexusDriveFileInfo,
  type NexusDriveStatus,
} from '@/services/nexusDataFolderApi';

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR');
}

export function DataFolderPage() {
  const [status, setStatus] = useState<NexusDriveStatus | null>(null);
  const [files, setFiles] = useState<NexusDriveFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await fetchNexusDataFolderStatus();
      setStatus(nextStatus);
      if (nextStatus.configured) {
        const nextFiles = await fetchNexusDataFolderFiles();
        setFiles(nextFiles.files);
      } else {
        setFiles([]);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const items = Array.from(fileList);
    if (items.length === 0) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      for (const file of items) {
        await uploadNexusDataFolderFile(file);
      }
      setNotice(`${items.length}개 파일을 Google Drive NEXUS 폴더에 업로드했습니다.`);
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await syncNexusDataFolder(true);
      setNotice(
        `Drive → 로컬 캐시 동기화 완료 (${result.meta.fileCount}개 데이터 파일, ${formatDateTime(result.meta.syncedAt)})`,
      );
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="data-folder-page">
      <div className="page-header no-print">
        <h2>데이터폴더</h2>
        <p>
          Google Drive <strong>NEXUS</strong> 루트 아래 기능별 폴더에 파일을 올리면 개발웹·서비스 웹이
          같은 데이터를 자동으로 가져옵니다. 외주정보검색은{' '}
          <strong>외주정보데이터</strong> 폴더를 사용합니다.
        </p>
      </div>

      <div className="data-folder-page__toolbar no-print">
        <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
          상태 새로고침
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleSync()}
          disabled={!status?.configured || syncing}
        >
          {syncing ? '동기화 중…' : 'Drive 동기화'}
        </Button>
      </div>

      {notice && <p className="data-folder-page__notice no-print">{notice}</p>}
      {error && <p className="data-folder-page__error no-print">{error}</p>}

      <section className="data-folder-page__status card">
        <h3>연결 상태</h3>
        {loading && !status ? (
          <p>불러오는 중…</p>
        ) : (
          <dl className="data-folder-page__meta">
            <div>
              <dt>Google Drive</dt>
              <dd>{status?.configured ? '연결됨' : '미설정'}</dd>
            </div>
            <div>
              <dt>폴더 ID</dt>
              <dd>{status?.folderId ?? '-'}</dd>
            </div>
            <div>
              <dt>로컬 캐시</dt>
              <dd>{status?.cacheDir ?? '-'}</dd>
            </div>
            <div>
              <dt>마지막 동기화</dt>
              <dd>{formatDateTime(status?.lastSync?.syncedAt)}</dd>
            </div>
            {status?.error && (
              <div>
                <dt>안내</dt>
                <dd className="data-folder-page__error-text">{status.error}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {!status?.configured && (
        <section className="data-folder-page__setup card no-print">
          <h3>Google Drive 연동 설정 (1회)</h3>
          <ol className="data-folder-page__setup-list">
            {GOOGLE_DRIVE_SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <section
        className={`data-folder-page__dropzone card no-print${dragOver ? ' data-folder-page__dropzone--active' : ''}${!status?.configured ? ' data-folder-page__dropzone--disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (status?.configured) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!status?.configured || uploading) return;
          void handleUploadFiles(event.dataTransfer.files);
        }}
      >
        <h3>파일 업로드</h3>
        <p>CSV · Excel(xlsx, xls) 파일을 이 영역에 끌어다 놓거나 아래에서 선택하세요.</p>
        <label className="data-folder-page__file-input">
          <input
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!status?.configured || uploading}
            onChange={(event) => {
              if (!event.target.files) return;
              void handleUploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
          {uploading ? '업로드 중…' : '파일 선택'}
        </label>
        {!status?.configured && (
          <p className="data-folder-page__hint">Drive 연동 후 업로드할 수 있습니다.</p>
        )}
      </section>

      <section className="data-folder-page__files card">
        <h3>외주정보데이터 폴더 파일</h3>
        {files.length === 0 ? (
          <p className="empty-state">표시할 파일이 없습니다.</p>
        ) : (
          <div className="data-folder-page__table-wrap">
            <table className="data-folder-page__table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>수정일</th>
                  <th>크기</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>{file.name}</td>
                    <td>{formatDateTime(file.modifiedTime)}</td>
                    <td>{file.size ? `${Math.round(Number(file.size) / 1024).toLocaleString()} KB` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
