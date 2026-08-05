import { useMemo, useRef, useState } from 'react';
import { ProjectNameSearchInput } from '@/components/admin/ProjectNameSearchInput';
import { KoreanDateTimeInput } from '@/components/admin/KoreanDateTimeInput';
import { BidProjectCodeSearchInput } from '@/components/purchase/BidProjectCodeSearchInput';
import { BidQuotationAttachmentPanel } from '@/components/purchase/BidQuotationAttachmentPanel';
import { BidTradeTypeSearchInput } from '@/components/purchase/BidTradeTypeSearchInput';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, ReadonlyField, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import { useBidManagement } from '@/context/BidManagementContext';
import { MOCK_BIDS } from '@/data/mockBidData';
import type { Project } from '@/types';
import {
  BID_REGISTRATION_METHOD_OPTIONS,
  type BidRegistrationForm,
  type BidRegistrationMethod,
} from '@/types/bidRegistration';
import { getBidRegistrationMissingFields, isBidRegistrationComplete } from '@/utils/bidRegistrationValidation';
import { collectBidTradeTypes } from '@/utils/bidTradeTypeSearch';
import { formatAmountInput, parseAmountInput } from '@/utils/formatInput';

function applyProjectToForm(project: Project): Partial<BidRegistrationForm> {
  return {
    projectName: project.name,
    projectCode: project.projectCode ?? '',
    clientName: project.clientName ?? '',
    divisionId: project.divisionId,
    teamId: project.teamId,
  };
}

export function BidNewRegistrationForm() {
  const { projects } = useApp();
  const {
    registrationForm: form,
    setRegistrationForm: setForm,
    selectedProjectId,
    setSelectedProjectId,
    attachmentPanelOpen,
    setAttachmentPanelOpen,
    quotationAttachments,
    setQuotationAttachments,
    resetRegistration,
  } = useBidManagement();
  const attachmentPanelRef = useRef<HTMLDivElement>(null);

  const [analysisConfirmOpen, setAnalysisConfirmOpen] = useState(false);

  const isComplete = useMemo(
    () => isBidRegistrationComplete(form, selectedProjectId),
    [form, selectedProjectId],
  );

  const missingFields = useMemo(
    () => getBidRegistrationMissingFields(form, selectedProjectId),
    [form, selectedProjectId],
  );

  const existingTradeTypes = useMemo(() => collectBidTradeTypes(MOCK_BIDS), []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const executionBudgetAmount = useMemo(
    () => parseAmountInput(form.executionBudget) ?? 0,
    [form.executionBudget],
  );

  const setField = <K extends keyof BidRegistrationForm>(key: K, value: BidRegistrationForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const clearProjectLink = () => {
    setSelectedProjectId('');
    setForm((prev) => ({
      ...prev,
      clientName: '',
      divisionId: '',
      teamId: '',
    }));
  };

  const applyProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setForm((prev) => ({
      ...prev,
      ...applyProjectToForm(project),
    }));
  };

  const handleProjectNameChange = (value: string) => {
    if (selectedProject && selectedProject.name !== value) {
      clearProjectLink();
    }
    setField('projectName', value);
  };

  const handleProjectCodeChange = (value: string) => {
    const normalized = value.replace(/\D/g, '');
    if (selectedProject && (selectedProject.projectCode ?? '').replace(/\D/g, '') !== normalized) {
      clearProjectLink();
    }
    setField('projectCode', value);
  };

  const handleReset = () => {
    resetRegistration();
  };

  const handleConfirmAnalysis = () => {
    setAnalysisConfirmOpen(false);
    setAttachmentPanelOpen(true);
    requestAnimationFrame(() => {
      attachmentPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <>
      <Card
        title="신규 입찰 등록"
        subtitle="프로젝트명·코드는 프로젝트 관리 데이터에서 검색·선택합니다"
      >
        <div className="bid-registration">
          <section className="bid-registration__section">
            <h4 className="bid-registration__section-title">프로젝트 기본 정보</h4>
            <div className="bid-registration__grid">
              <ProjectNameSearchInput
                projects={projects}
                value={form.projectName}
                selectedProjectId={selectedProjectId}
                onChange={handleProjectNameChange}
                onSelect={applyProject}
                label="프로젝트명"
                required
              />
              <BidProjectCodeSearchInput
                projects={projects}
                value={form.projectCode}
                selectedProjectId={selectedProjectId}
                onChange={handleProjectCodeChange}
                onSelect={applyProject}
                required
              />
              <ReadonlyField
                label="발주처 *"
                value={form.clientName}
                placeholder="프로젝트 선택 시 자동 입력"
              />
              <ReadonlyField
                label="사업본부 *"
                value={selectedProject?.divisionName ?? ''}
                placeholder="프로젝트 선택 시 자동 입력"
              />
              <ReadonlyField
                label="담당팀 *"
                value={selectedProject?.teamName ?? ''}
                placeholder="프로젝트 선택 시 자동 입력"
              />
            </div>
          </section>

          <section className="bid-registration__section">
            <h4 className="bid-registration__section-title">외주발주 입찰 정보</h4>
            <div className="bid-registration__grid">
              <BidTradeTypeSearchInput
                tradeTypes={existingTradeTypes}
                value={form.tradeType}
                onChange={(value) => setField('tradeType', value)}
                required
              />
              <Select
                label="입찰방식 *"
                value={form.bidMethod}
                onChange={(e) =>
                  setField('bidMethod', e.target.value as BidRegistrationMethod | '')
                }
                options={[{ value: '', label: '선택' }, ...BID_REGISTRATION_METHOD_OPTIONS]}
              />
              <Input
                label="수주금액 (원) *"
                value={form.orderAmount}
                onChange={(e) => setField('orderAmount', formatAmountInput(e.target.value))}
                placeholder="예: 1,200,000,000"
                inputMode="numeric"
              />
              <Input
                label="실행예산 (원) *"
                value={form.executionBudget}
                onChange={(e) => setField('executionBudget', formatAmountInput(e.target.value))}
                placeholder="예: 500,000,000"
                inputMode="numeric"
              />
              <KoreanDateTimeInput
                label="입찰일시"
                value={form.bidDateTime}
                onChange={(value) => setField('bidDateTime', value)}
                required
              />
            </div>
          </section>

          <div className="bid-registration__actions">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              입력 초기화
            </Button>
            {isComplete && (
              <Button variant="primary" onClick={() => setAnalysisConfirmOpen(true)}>
                입찰사 등록
              </Button>
            )}
          </div>

          {!isComplete && (
            <p className="bid-registration__hint">
              프로젝트를 목록에서 선택하고 모든 필수 항목을 입력하면{' '}
              <strong>입찰사 등록</strong> 버튼이 표시됩니다.
              {missingFields.length > 0 && (
                <>
                  <br />
                  미입력: {missingFields.join(' · ')}
                </>
              )}
            </p>
          )}
        </div>
      </Card>

      {attachmentPanelOpen && (
        <div ref={attachmentPanelRef}>
          <BidQuotationAttachmentPanel
            projectName={form.projectName}
            projectCode={form.projectCode}
            executionBudget={executionBudgetAmount}
            attachments={quotationAttachments}
            onAttachmentsChange={setQuotationAttachments}
            onClose={() => setAttachmentPanelOpen(false)}
          />
        </div>
      )}

      <ConfirmDialog
        open={analysisConfirmOpen}
        title="입찰사 등록"
        message="입찰사 등록을 진행 하시겠습니까?"
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleConfirmAnalysis}
        onCancel={() => setAnalysisConfirmOpen(false)}
      />
    </>
  );
}
