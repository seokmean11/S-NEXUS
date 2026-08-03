import { useRef, useState } from 'react';
import { BidPartnerSearchInput } from '@/components/purchase/BidPartnerSearchInput';
import { BidQuotationComparison } from '@/components/purchase/BidQuotationComparison';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MOCK_BID_PARTNERS } from '@/data/mockBidPartnerData';
import type { BidPartnerEntry } from '@/types/bidRegistration';
import {
  analyzePartnerQuotations,
  downloadQuotationComparison,
  type BidQuotationCompareItem,
} from '@/utils/bidQuotationAnalysis';

const ACCEPTED_EXTENSIONS = '.pdf,.xlsx,.xls,.doc,.docx,.hwp,.png,.jpg,.jpeg';
const ACCEPTED_FILE_EXTENSIONS = new Set([
  'pdf',
  'xlsx',
  'xls',
  'doc',
  'docx',
  'hwp',
  'png',
  'jpg',
  'jpeg',
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ACCEPTED_FILE_EXTENSIONS.has(ext);
}

function pickAcceptedFile(files: File[]): File | null {
  return files.find(isAcceptedFile) ?? null;
}

interface BidQuotationAttachmentPanelProps {
  projectName: string;
  projectCode: string;
  executionBudget: number;
  attachments: BidPartnerEntry[];
  onAttachmentsChange: (attachments: BidPartnerEntry[]) => void;
  onClose: () => void;
}

export function BidQuotationAttachmentPanel({
  projectName,
  projectCode,
  executionBudget,
  attachments,
  onAttachmentsChange,
  onClose,
}: BidQuotationAttachmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const [draftVendorName, setDraftVendorName] = useState('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [message, setMessage] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVendorName, setEditVendorName] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [compareItems, setCompareItems] = useState<BidQuotationCompareItem[]>([]);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [comparisonBlob, setComparisonBlob] = useState<Blob | null>(null);
  const [comparisonFileName, setComparisonFileName] = useState('');

  const resetAnalysis = () => {
    setAnalysisComplete(false);
    setCompareItems([]);
    setAnalysisMessage('');
    setComparisonBlob(null);
    setComparisonFileName('');
  };

  const partnerOptions = [...MOCK_BID_PARTNERS];
  const canAdd = draftVendorName.trim().length > 0 && draftFile != null;

  const resetDraft = () => {
    setDraftVendorName('');
    setDraftFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setPendingFile = (file: File | null) => {
    if (!file) {
      setDraftFile(null);
      return;
    }
    if (!isAcceptedFile(file)) {
      setMessage('지원하지 않는 파일 형식입니다. PDF, Excel, Word, HWP, 이미지만 첨부할 수 있습니다.');
      return;
    }
    setMessage('');
    setDraftFile(file);
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleDraftFileSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingFile(pickAcceptedFile(Array.from(files)));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    setPendingFile(pickAcceptedFile(Array.from(event.dataTransfer.files)));
  };

  const handleAddPartner = () => {
    if (!canAdd || !draftFile) return;

    onAttachmentsChange([
      ...attachments,
      {
        id: createId(),
        vendorName: draftVendorName.trim(),
        file: draftFile,
      },
    ]);
    resetDraft();
    setMessage('');
    resetAnalysis();
  };

  const handleRemove = (id: string) => {
    if (editingId === id) {
      setEditingId(null);
      setEditVendorName('');
      setEditFile(null);
    }
    onAttachmentsChange(attachments.filter((item) => item.id !== id));
    resetAnalysis();
  };

  const startEdit = (entry: BidPartnerEntry) => {
    setEditingId(entry.id);
    setEditVendorName(entry.vendorName);
    setEditFile(entry.file);
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditVendorName('');
    setEditFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const saveEdit = () => {
    if (!editingId || !editVendorName.trim() || !editFile) return;

    onAttachmentsChange(
      attachments.map((item) =>
        item.id === editingId
          ? { ...item, vendorName: editVendorName.trim(), file: editFile }
          : item,
      ),
    );
    cancelEdit();
    resetAnalysis();
  };

  const handleStartAnalysis = async () => {
    if (attachments.length === 0) {
      setAnalysisMessage('분석할 참여 협력사를 먼저 등록해 주세요.');
      return;
    }

    setAnalyzing(true);
    setAnalysisMessage('');
    setAnalysisComplete(false);
    setComparisonBlob(null);
    setComparisonFileName('');
    try {
      const result = await analyzePartnerQuotations(attachments, projectCode);
      setCompareItems(result.items);
      setComparisonBlob(result.comparisonBlob);
      setComparisonFileName(result.comparisonFileName);
      const successCount = result.items.filter((item) => item.rank > 0).length;
      if (successCount === 0) {
        const firstError = result.items.find((item) => item.message)?.message;
        setAnalysisMessage(firstError ?? '견적서 총액을 추출하지 못했습니다.');
        setAnalysisComplete(false);
      } else {
        setAnalysisComplete(true);
      }
    } catch {
      setAnalysisMessage('견적서 분석 중 오류가 발생했습니다.');
      setCompareItems([]);
      setAnalysisComplete(false);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleEditFileSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = pickAcceptedFile(Array.from(files));
    if (!file) {
      setMessage('지원하지 않는 파일 형식입니다.');
      return;
    }
    setEditFile(file);
    setMessage('');
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const clearEditFile = () => {
    setEditFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  return (
    <Card
      title="입찰 협력사 등록"
      subtitle={`${projectName} (${projectCode}) — 참여 협력사와 견적서를 등록하세요`}
      headerAction={
        <Button variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="bid-quotation-attach">
        <div className="bid-quotation-attach__picker">
          <BidPartnerSearchInput
            partners={partnerOptions}
            value={draftVendorName}
            onChange={setDraftVendorName}
            disabled={editingId != null}
          />
          <div
            className={`bid-quotation-attach__dropzone${isDragOver ? ' bid-quotation-attach__dropzone--active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="bid-quotation-attach__file-input"
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => handleDraftFileSelected(e.target.files)}
              disabled={editingId != null}
            />
            <p className="bid-quotation-attach__hint">
              견적서 1건을 드래그하거나 파일 선택 후 <strong>추가</strong>를 누르세요.
              <br />
              PDF, Excel, Word, HWP, 이미지 지원
            </p>
            {draftFile ? (
              <div className="bid-quotation-attach__pending-file">
                <span className="bid-quotation-attach__filename">{draftFile.name}</span>
                <span className="bid-quotation-attach__filesize">
                  {formatFileSize(draftFile.size)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setDraftFile(null)}>
                  파일 취소
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePickFile}
                disabled={editingId != null}
              >
                파일 선택
              </Button>
            )}
          </div>
        </div>

        <div className="bid-quotation-attach__add-row">
          <Button variant="primary" size="sm" onClick={handleAddPartner} disabled={!canAdd}>
            추가
          </Button>
          {!canAdd && (
            <span className="bid-quotation-attach__add-hint">
              협력사명과 견적서 파일을 모두 입력하면 추가할 수 있습니다.
            </span>
          )}
        </div>

        {message && (
          <p className="bid-quotation-attach__drop-message" role="status">
            {message}
          </p>
        )}

        {attachments.length > 0 ? (
          <ul className="bid-quotation-attach__list">
            {attachments.map((item, index) => {
              const isEditing = editingId === item.id;

              return (
                <li key={item.id} className="bid-partner-entry">
                  <div className="bid-partner-entry__header">
                    <strong className="bid-partner-entry__title">참여협력사{index + 1}</strong>
                    {!isEditing ? (
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                        수정
                      </Button>
                    ) : (
                      <div className="bid-partner-entry__edit-actions">
                        <Button variant="primary" size="sm" onClick={saveEdit}>
                          저장
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          취소
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="bid-partner-entry__body bid-partner-entry__body--edit">
                      <BidPartnerSearchInput
                        partners={partnerOptions}
                        value={editVendorName}
                        onChange={setEditVendorName}
                      />
                      <div className="bid-partner-entry__file-row">
                        <input
                          ref={editFileInputRef}
                          type="file"
                          className="bid-quotation-attach__file-input"
                          accept={ACCEPTED_EXTENSIONS}
                          onChange={(e) => handleEditFileSelected(e.target.files)}
                        />
                        {editFile ? (
                          <>
                            <div className="bid-quotation-attach__file-meta">
                              <span className="bid-quotation-attach__filename">
                                {editFile.name}
                              </span>
                              <span className="bid-quotation-attach__filesize">
                                {formatFileSize(editFile.size)}
                              </span>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => editFileInputRef.current?.click()}>
                              재첨부
                            </Button>
                            <Button variant="ghost" size="sm" onClick={clearEditFile}>
                              파일 삭제
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => editFileInputRef.current?.click()}
                          >
                            파일 첨부
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bid-partner-entry__body">
                      <div className="bid-partner-entry__info">
                        <span className="bid-partner-entry__label">협력사</span>
                        <span className="bid-partner-entry__value">{item.vendorName}</span>
                      </div>
                      <div className="bid-partner-entry__info">
                        <span className="bid-partner-entry__label">견적서</span>
                        <div className="bid-quotation-attach__file-meta">
                          <span className="bid-quotation-attach__filename">{item.file.name}</span>
                          <span className="bid-quotation-attach__filesize">
                            {formatFileSize(item.file.size)}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(item.id)}>
                        삭제
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="bid-quotation-attach__empty">등록된 참여 협력사가 없습니다.</p>
        )}

        <div className="bid-quotation-compare__actions">
          <Button
            variant={analysisComplete ? 'outline' : 'primary'}
            onClick={() => void handleStartAnalysis()}
            disabled={
              analyzing || analysisComplete || attachments.length === 0 || editingId != null
            }
            loading={analyzing}
          >
            {analyzing ? '분석 중…' : analysisComplete ? '분석 완료' : '분석시작'}
          </Button>
        </div>

        {analysisMessage && (
          <p className="bid-quotation-attach__drop-message" role="status">
            {analysisMessage}
          </p>
        )}

        {compareItems.length > 0 && (
          <BidQuotationComparison
            items={compareItems}
            executionBudget={executionBudget}
            comparisonBlob={comparisonBlob}
            comparisonFileName={comparisonFileName}
            onDownloadAnalysis={() => {
              if (comparisonBlob) {
                downloadQuotationComparison(comparisonBlob, comparisonFileName);
              }
            }}
          />
        )}
      </div>
    </Card>
  );
}
