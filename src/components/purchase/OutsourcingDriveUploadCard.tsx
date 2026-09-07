import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fetchNexusDataFolderStatus } from '@/services/nexusDataFolderApi';

interface OutsourcingDriveUploadCardProps {
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onRefreshFromDrive: () => Promise<void>;
}

export function OutsourcingDriveUploadCard({
  uploading,
  onUpload,
  onRefreshFromDrive,
}: OutsourcingDriveUploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadConfigured, setUploadConfigured] = useState<boolean | null>(null);
  const [driveWritable, setDriveWritable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchNexusDataFolderStatus()
      .then((status) => {
        setUploadConfigured(Boolean(status.uploadConfigured));
        setDriveWritable(status.writable !== false);
      })
      .catch(() => setUploadConfigured(false));
  }, []);

  const allowed = uploadConfigured === true && !uploading;

  const handleFiles = (fileList: FileList | File[] | null) => {
    const file = fileList?.[0];
    if (!file || !allowed) return;
    void onUpload(file);
  };

  return (
    <Card
      title="외주 DB 업로드"
      subtitle="NEXUS > 외주정보데이터"
      className="outsourcing-drive-upload-card no-print"
      headerAction={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={refreshing || uploading}
          onClick={() => {
            setRefreshing(true);
            void onRefreshFromDrive().finally(() => setRefreshing(false));
          }}
        >
          {refreshing ? '동기화 중…' : 'Drive에서 새로고침'}
        </Button>
      }
    >
      <p className="outsourcing-drive-upload-card__help">
        AppSheet CSV 또는 Excel을 올리면 Google Drive에 저장되고, 이 화면 검색 데이터에 바로
        반영됩니다. 폴더에 파일이 여러 개이면 수정 시각이 가장 최근인 파일을 사용합니다.
      </p>

      {driveWritable === false ? (
        <p className="outsourcing-drive-upload-card__warn" role="status">
          개발웹입니다. 공용 Drive에는 올리지 않습니다. 「Drive에서 새로고침」으로 서비스웹 최신을 불러오고,
          로컬 CSV/Excel 선택으로 기능만 테스트하세요.
        </p>
      ) : uploadConfigured === false ? (
        <p className="outsourcing-drive-upload-card__warn" role="alert">
          Drive 업로드가 아직 연결되지 않았습니다. 경쟁사 분석의 Drive 연결에서 OAuth를 재연결한 뒤 다시 시도하세요.
        </p>
      ) : null}

      <div
        className={`outsourcing-drive-upload-card__dropzone ${
          dragOver && allowed ? 'outsourcing-drive-upload-card__dropzone--active' : ''
        } ${!allowed ? 'outsourcing-drive-upload-card__dropzone--disabled' : ''}`}
        onDragOver={(event) => {
          if (!allowed) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          if (!allowed) return;
          event.preventDefault();
          setDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <label className="outsourcing-drive-upload-card__prompt">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!allowed}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <span>
            {uploading
              ? 'Drive에 저장하고 데이터를 반영하는 중…'
              : 'CSV / Excel 파일을 끌어다 놓거나 클릭해서 업로드'}
          </span>
        </label>
      </div>
    </Card>
  );
}
