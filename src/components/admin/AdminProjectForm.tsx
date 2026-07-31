import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, ReadonlyField, Select } from '@/components/ui/Input';
import { ContractAmendmentBox } from '@/components/admin/ContractAmendmentBox';
import { ContractHistoryPanel } from '@/components/admin/ContractHistoryPanel';
import { KoreanDateInput } from '@/components/admin/KoreanDateInput';
import { ProjectNameSearchInput } from '@/components/admin/ProjectNameSearchInput';
import { ProjectCodeInput } from '@/components/admin/ProjectCodeInput';
import { useApp } from '@/context/AppContext';
import type { ProjectContinuity, ProjectMarketScope, ProjectType } from '@/types';
import type { ContractEditTarget } from '@/types/contractChange';
import { MAX_CONTRACT_AMENDMENTS } from '@/types/contractChange';
import {
  deriveProjectFieldsFromCode,
  deriveProjectFieldsFromPartialCode,
  getProjectTeamOptions,
  getProjectTypeOptions,
  isValidProjectCode,
  isValidProjectTeamForCategory,
  isValidProjectTypeForCategory,
  normalizeProjectCode,
  parseProjectCode,
  resolveProjectTeamSelection,
  validateProjectCodeInput,
} from '@/utils/projectCode';
import {
  formatAmountInput,
  formatIsoToKoreanDate,
  isCompleteKoreanDate,
  parseAmountInput,
  parseKoreanDateToIso,
} from '@/utils/formatInput';
import {
  amendmentToSnapshot,
  canRegisterAmendmentSequence,
  getAmendmentsForProject,
  getEffectiveContract,
  getNextAmendmentSequence,
  getProjectBaseline,
} from '@/utils/contractChange';

type FormMode = 'create' | 'edit';
type FormEntryMode = 'new' | 'existing';

const MARKET_SCOPE_OPTIONS: { value: ProjectMarketScope; label: string }[] = [
  { value: '국내', label: '국내' },
  { value: '해외', label: '해외' },
];

const CONTINUITY_OPTIONS: { value: ProjectContinuity; label: string }[] = [
  { value: '신규', label: '신규' },
  { value: '계약고', label: '계약고' },
];

const EMPTY_FORM = {
  name: '',
  projectCode: '',
  clientName: '',
  marketScope: '' as ProjectMarketScope | '',
  continuity: '' as ProjectContinuity | '',
  projectType: '' as ProjectType | '',
  teamId: '',
  contractAmount: '',
  startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
  endDate: '',
  pmId: '',
  participantIds: [] as string[],
};

export function AdminProjectForm() {
  const {
    projects,
    divisions,
    contractAmendments,
    createProject,
    updateProject,
    deleteProject,
    saveContractAmendment,
    saveInitialContract,
    permissions,
  } = useApp();
  const [mode, setMode] = useState<FormMode>('create');
  const [formEntryMode, setFormEntryMode] = useState<FormEntryMode>('new');
  const [existingNameQuery, setExistingNameQuery] = useState('');
  const [editId, setEditId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ContractEditTarget | null>(null);
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
  });

  const showSuccessMessage = (text: string) => {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 3000);
  };

  const showErrorMessage = (text: string) => {
    setError(text);
    setMessage('');
    setTimeout(() => setError(''), 3000);
  };

  const derivedPartial = useMemo(
    () => deriveProjectFieldsFromPartialCode(form.projectCode, divisions),
    [form.projectCode, divisions],
  );

  const derived = useMemo(
    () => deriveProjectFieldsFromCode(form.projectCode, divisions),
    [form.projectCode, divisions],
  );

  const projectCodeError = useMemo(
    () => validateProjectCodeInput(form.projectCode, divisions),
    [form.projectCode, divisions],
  );

  const parsedCode = useMemo(() => parseProjectCode(form.projectCode), [form.projectCode]);
  const projectTypeOptions = useMemo(
    () => getProjectTypeOptions(parsedCode?.businessCategory),
    [parsedCode?.businessCategory],
  );
  const projectTeamOptions = useMemo(
    () => getProjectTeamOptions(parsedCode?.businessCategory),
    [parsedCode?.businessCategory],
  );

  const editingProject = useMemo(
    () => (editId ? projects.find((p) => p.id === editId) : undefined),
    [projects, editId],
  );

  const projectAmendments = useMemo(
    () => (editId ? getAmendmentsForProject(contractAmendments, editId) : []),
    [contractAmendments, editId],
  );

  const nextSequence = useMemo(
    () => (editId ? getNextAmendmentSequence(contractAmendments, editId) : null),
    [contractAmendments, editId],
  );

  const isNewAmendmentRegistration =
    nextSequence != null && selectedTarget === nextSequence;

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
    });
    setEditId('');
    setMode('create');
    setFormEntryMode('new');
    setExistingNameQuery('');
    setError('');
    setAmendmentOpen(false);
    setSelectedTarget(null);
    setDeleteConfirmProjectId(null);
  };

  const handleNewEntry = () => {
    resetForm();
  };

  const handleExistingEntry = () => {
    setFormEntryMode('existing');
    setEditId('');
    setMode('create');
    setExistingNameQuery('');
    setError('');
    setAmendmentOpen(false);
    setSelectedTarget(null);
    setForm({
      ...EMPTY_FORM,
      startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
    });
  };

  const fieldsLocked = formEntryMode === 'existing' && !editId;

  const handleExistingNameChange = (value: string) => {
    setExistingNameQuery(value);
    if (editId) {
      setEditId('');
      setMode('create');
      setForm({
        ...EMPTY_FORM,
        startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
      });
    }
  };

  const buildGeneralPayload = () => {
    const projectCode = normalizeProjectCode(form.projectCode);
    if (!projectCode || !isValidProjectCode(projectCode) || !derived?.division) {
      throw new Error('invalid_code');
    }

    const team = projectTeamOptions.find((t) => t.value === form.teamId) ?? projectTeamOptions[0];
    if (!team) {
      throw new Error('team_missing');
    }

    return {
      name: form.name,
      projectCode,
      clientName: form.clientName.trim() || undefined,
      marketScope: form.marketScope as ProjectMarketScope,
      continuity: form.continuity as ProjectContinuity,
      projectType: form.projectType as ProjectType,
      divisionId: derived.division.id,
      divisionName: derived.division.name,
      teamId: team.value,
      teamName: team.label,
      status: derived.status,
      pmId: form.pmId || 'emp-mgr-a1',
      participantIds:
        form.participantIds.length > 0 ? form.participantIds : [form.pmId || 'emp-mgr-a1'],
    };
  };

  const buildContractFromForm = () => ({
    contractAmount: parseAmountInput(form.contractAmount),
    startDate: parseKoreanDateToIso(form.startDate)!,
    endDate: form.endDate ? parseKoreanDateToIso(form.endDate) ?? undefined : undefined,
  });

  const validateForm = (requireContractDates: boolean) => {
    const code = normalizeProjectCode(form.projectCode);
    const codeError = validateProjectCodeInput(form.projectCode, divisions);
    if (codeError) {
      showErrorMessage(codeError);
      return false;
    }

    if (!code || !isValidProjectCode(code)) {
      showErrorMessage('프로젝트 코드는 0000-0000-00 형식(숫자 10자리)으로 입력해 주세요.');
      return false;
    }

    if (!derived?.division) {
      showErrorMessage(
        `코드 분류에 해당하는 "${derived?.divisionName ?? '사업본부'}"가 조직관리에 없습니다.`,
      );
      return false;
    }

    if (
      parsedCode &&
      (!form.teamId || !isValidProjectTeamForCategory(parsedCode.businessCategory, form.teamId))
    ) {
      showErrorMessage('담당 팀을 선택해 주세요.');
      return false;
    }

    if (requireContractDates) {
      if (!isCompleteKoreanDate(form.startDate)) {
        showErrorMessage('시작일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
        return false;
      }

      if (form.endDate && !isCompleteKoreanDate(form.endDate)) {
        showErrorMessage('종료일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
        return false;
      }
    }

    if (!form.marketScope) {
      showErrorMessage('국내·해외를 선택해 주세요.');
      return false;
    }

    if (!form.continuity) {
      showErrorMessage('신규·계약고를 선택해 주세요.');
      return false;
    }

    if (
      parsedCode &&
      (!form.projectType || !isValidProjectTypeForCategory(parsedCode.businessCategory, form.projectType))
    ) {
      showErrorMessage('유형을 선택해 주세요.');
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const requireContract = mode === 'create' || !!selectedTarget;
    if (!validateForm(requireContract)) return;

    try {
      if (mode === 'create') {
        createProject({
          ...buildGeneralPayload(),
          ...buildContractFromForm(),
        });
        showSuccessMessage('등록이 완료되었습니다.');
        resetForm();
      } else if (selectedTarget === 'initial') {
        saveInitialContract(editId, buildContractFromForm(), buildGeneralPayload());
        setAmendmentOpen(false);
        setSelectedTarget(null);
        showSuccessMessage('저장이 완료되었습니다.');
      } else if (selectedTarget) {
        if (!canRegisterAmendmentSequence(projectAmendments, selectedTarget)) {
          showErrorMessage('등록할 수 없는 변경 차수입니다.');
          return;
        }

        const contract = buildContractFromForm();
        const result = saveContractAmendment(editId, {
          sequence: selectedTarget,
          ...contract,
          generalUpdates: buildGeneralPayload(),
        });

        if (!result.ok) {
          showErrorMessage(result.reason);
          return;
        }

        setAmendmentOpen(false);
        setSelectedTarget(null);
        showSuccessMessage('저장이 완료되었습니다.');
      } else {
        updateProject(editId, {
          ...buildGeneralPayload(),
          ...buildContractFromForm(),
        });
        showSuccessMessage('저장이 완료되었습니다.');
      }
    } catch {
      showErrorMessage('프로젝트 정보를 구성할 수 없습니다.');
    }
  };

  const handleToggleAmendment = () => {
    if (!editingProject) return;

    if (amendmentOpen) {
      setAmendmentOpen(false);
      setSelectedTarget(null);
      return;
    }

    if (!nextSequence) {
      showErrorMessage(`최대 ${MAX_CONTRACT_AMENDMENTS}차까지 등록되었습니다.`);
      return;
    }

    const effective = getEffectiveContract(
      getProjectBaseline(editingProject),
      projectAmendments,
    );
    loadContractFields(effective);
    setSelectedTarget(nextSequence);
    setAmendmentOpen(true);
  };

  const handleEditContractTarget = (target: ContractEditTarget) => {
    if (!editingProject) return;

    setAmendmentOpen(true);
    setSelectedTarget(target);

    if (target === 'initial') {
      loadContractFields(getProjectBaseline(editingProject));
    } else {
      const existing = projectAmendments.find((a) => a.sequence === target);
      if (existing) {
        loadContractFields(amendmentToSnapshot(existing));
      }
    }

    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const loadContractFields = (snapshot: {
    contractAmount?: number;
    startDate: string;
    endDate?: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      contractAmount:
        snapshot.contractAmount != null ? formatAmountInput(snapshot.contractAmount) : '',
      startDate: formatIsoToKoreanDate(snapshot.startDate),
      endDate: snapshot.endDate ? formatIsoToKoreanDate(snapshot.endDate) : '',
    }));
  };

  const loadForEdit = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const parsed = parseProjectCode(project.projectCode ?? '');
    const matchedTeam = resolveProjectTeamSelection(
      parsed?.businessCategory,
      project.teamId,
      project.teamName,
    );

    setEditId(project.id);
    setMode('edit');
    setFormEntryMode('existing');
    setExistingNameQuery(project.name);
    setError('');
    setAmendmentOpen(false);
    setSelectedTarget(null);
    setForm({
      name: project.name,
      projectCode: project.projectCode ?? '',
      clientName: project.clientName ?? '',
      marketScope: project.marketScope ?? '',
      continuity: project.continuity ?? '',
      projectType: project.projectType ?? '',
      teamId: matchedTeam?.value ?? '',
      contractAmount: project.contractAmount != null ? formatAmountInput(project.contractAmount) : '',
      startDate: formatIsoToKoreanDate(project.startDate),
      endDate: project.endDate ? formatIsoToKoreanDate(project.endDate) : '',
      pmId: project.pmId,
      participantIds: project.participantIds,
    });

    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirmProjectId) return;

    deleteProject(deleteConfirmProjectId);
    setDeleteConfirmProjectId(null);

    if (editId === deleteConfirmProjectId) {
      resetForm();
    }

    showSuccessMessage('삭제가 완료되었습니다.');
  };

  const handleProjectCodeChange = (projectCode: string) => {
    const nextParsed = parseProjectCode(projectCode);
    const nextTypeOptions = getProjectTypeOptions(nextParsed?.businessCategory);
    const nextTeamOptions = getProjectTeamOptions(nextParsed?.businessCategory);

    setForm((prev) => {
      const validType = nextTypeOptions.some((opt) => opt.value === prev.projectType);
      const validTeam = nextTeamOptions.some((opt) => opt.value === prev.teamId);
      return {
        ...prev,
        projectCode,
        projectType: (validType ? prev.projectType : (nextTypeOptions[0]?.value ?? '')) as ProjectType | '',
        teamId: validTeam ? prev.teamId : (nextTeamOptions[0]?.value ?? ''),
      };
    });
  };

  if (!permissions.canCreateProject) {
    return null;
  }

  return (
    <div className="admin-page">
      <div className="page-header no-print">
        <h2>프로젝트 마스터 관리</h2>
        <p>프로젝트 코드 입력 시 사업본부·상태가 자동 설정됩니다</p>
      </div>

      {message && <div className="toast toast--success no-print">{message}</div>}
      {error && <div className="toast toast--error no-print">{error}</div>}

      <div className="admin-layout">
        <div ref={formCardRef}>
          <Card title="프로젝트 등록·수정">
            <div className="admin-form__entry-toggle no-print">
              <Button
                type="button"
                variant={formEntryMode === 'new' ? 'primary' : 'outline'}
                size="sm"
                onClick={handleNewEntry}
              >
                신규
              </Button>
              <Button
                type="button"
                variant={formEntryMode === 'existing' ? 'primary' : 'outline'}
                size="sm"
                onClick={handleExistingEntry}
              >
                기존
              </Button>
              {formEntryMode === 'existing' && !editId && (
                <span className="admin-form__entry-hint">프로젝트명에서 등록된 프로젝트를 검색·선택하세요</span>
              )}
            </div>
            <form className="admin-form admin-form--horizontal" onSubmit={handleSubmit}>
              {formEntryMode === 'existing' ? (
                <ProjectNameSearchInput
                  projects={projects}
                  value={editId ? form.name : existingNameQuery}
                  selectedProjectId={editId}
                  onChange={handleExistingNameChange}
                  onSelect={(project) => loadForEdit(project.id)}
                  required
                />
              ) : (
                <Input
                  className="admin-form__cell"
                  label="프로젝트명"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              )}
              <div className="admin-form__cell">
                <ProjectCodeInput
                  value={form.projectCode}
                  onChange={handleProjectCodeChange}
                  required
                  error={projectCodeError ?? undefined}
                  disabled={fieldsLocked}
                />
              </div>
              <Input
                className="admin-form__cell"
                label="발주처"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="발주처명 입력"
                disabled={fieldsLocked}
              />
              <Select
                className="admin-form__cell"
                label="담당 팀"
                options={[
                  { value: '', label: '선택' },
                  ...projectTeamOptions,
                ]}
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                disabled={fieldsLocked || projectTeamOptions.length === 0}
                required
              />

              <div className="admin-form__type-row admin-form__span-full">
                <Select
                  label="신규·계약고"
                  options={[{ value: '', label: '선택' }, ...CONTINUITY_OPTIONS]}
                  value={form.continuity}
                  onChange={(e) =>
                    setForm({ ...form, continuity: e.target.value as ProjectContinuity | '' })
                  }
                  disabled={fieldsLocked}
                  required
                />
                <Select
                  label="국내·해외"
                  options={[{ value: '', label: '선택' }, ...MARKET_SCOPE_OPTIONS]}
                  value={form.marketScope}
                  onChange={(e) =>
                    setForm({ ...form, marketScope: e.target.value as ProjectMarketScope | '' })
                  }
                  disabled={fieldsLocked}
                  required
                />
                {projectTypeOptions.length > 0 ? (
                  <Select
                    label="유형"
                    options={[
                      { value: '', label: '선택' },
                      ...projectTypeOptions,
                    ]}
                    value={form.projectType}
                    onChange={(e) =>
                      setForm({ ...form, projectType: e.target.value as ProjectType | '' })
                    }
                    disabled={fieldsLocked}
                    required
                  />
                ) : (
                  <Select
                    label="유형"
                    options={[{ value: '', label: '프로젝트 코드 입력 후 선택' }]}
                    value=""
                    disabled
                  />
                )}
              </div>

              <div className="admin-form__cell">
                <ReadonlyField label="사업본부" value={derivedPartial.divisionName} />
              </div>
              <div className="admin-form__cell">
                <ReadonlyField label="상태" value={derivedPartial.statusLabel} />
              </div>

              <div className="admin-form__contract admin-form__span-full">
                <div className="contract-fields-group contract-fields-group--horizontal">
                  <div className="contract-fields-group__inputs">
                    <Input
                      label="계약금액 (원)"
                      type="text"
                      inputMode="numeric"
                      value={form.contractAmount}
                      onChange={(e) =>
                        setForm({ ...form, contractAmount: formatAmountInput(e.target.value) })
                      }
                      placeholder={
                        selectedTarget && selectedTarget !== 'initial'
                          ? '변경 후 계약금액'
                          : '수주 확정 후 입력'
                      }
                      disabled={fieldsLocked}
                    />
                    <KoreanDateInput
                      label="시작일"
                      value={form.startDate}
                      onChange={(startDate) => setForm({ ...form, startDate })}
                      required={mode === 'create' || !!selectedTarget}
                      disabled={fieldsLocked}
                    />
                    <KoreanDateInput
                      label="종료일"
                      value={form.endDate}
                      onChange={(endDate) => setForm({ ...form, endDate })}
                      disabled={fieldsLocked}
                    />
                    {mode === 'edit' && !selectedTarget && (
                      <p className="form-field__hint admin-form__hint-span">
                        입력란 직접 수정 후 <strong>수정 저장</strong> → 오류 수정 (분석 제외)
                      </p>
                    )}
                    {mode === 'edit' && isNewAmendmentRegistration && (
                      <p className="form-field__hint form-field__hint--active admin-form__hint-span">
                        변경 {nextSequence}차 신규 등록 — 직전 차수 계약 내용을 확인한 뒤,{' '}
                        <strong>새로운 계약변경 내용을 입력하세요.</strong> 입력 후{' '}
                        <strong>수정 저장</strong>
                      </p>
                    )}
                    {mode === 'edit' && selectedTarget === 'initial' && (
                      <p className="form-field__hint form-field__hint--active admin-form__hint-span">
                        최초 계약 수정 중 — 저장 시 이력의 <strong>최초</strong> 값이 갱신됩니다
                      </p>
                    )}
                    {mode === 'edit' &&
                      selectedTarget &&
                      selectedTarget !== 'initial' &&
                      !isNewAmendmentRegistration && (
                      <p className="form-field__hint form-field__hint--active admin-form__hint-span">
                        변경 {selectedTarget}차 수정 중 — 변경 후 <strong>수정 저장</strong>
                      </p>
                    )}
                  </div>

                  {mode === 'edit' && (
                    <ContractAmendmentBox
                      open={amendmentOpen}
                      selectedTarget={selectedTarget}
                      nextSequence={nextSequence}
                      onToggle={handleToggleAmendment}
                    />
                  )}
                </div>
              </div>

              <div className="admin-form__actions admin-form__span-full no-print">
                <Button type="submit" variant="primary" disabled={fieldsLocked}>
                  {mode === 'create' ? '등록' : '수정 저장'}
                </Button>
                {mode === 'edit' && editId && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setDeleteConfirmProjectId(editId)}
                  >
                    프로젝트 삭제
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>

        {mode === 'edit' && editId && (
          <ContractHistoryPanel projectId={editId} onEditTarget={handleEditContractTarget} />
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmProjectId !== null}
        title="프로젝트 삭제"
        message="정말 삭제하시겠습니까?"
        confirmLabel="네"
        cancelLabel="아니오"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmProjectId(null)}
      />
    </div>
  );
}
