import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, ReadonlyField, Select } from '@/components/ui/Input';
import { ContractAmendmentBox } from '@/components/admin/ContractAmendmentBox';
import { ContractHistoryPanel } from '@/components/admin/ContractHistoryPanel';
import { KoreanDateInput } from '@/components/admin/KoreanDateInput';
import { ProjectCodeInput } from '@/components/admin/ProjectCodeInput';
import { useApp } from '@/context/AppContext';
import type { Project, ProjectType } from '@/types';
import type { AmendmentSequence, ContractEditTarget } from '@/types/contractChange';
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
  getNextAmendmentSequence,
  getProjectBaseline,
} from '@/utils/contractChange';

type FormMode = 'create' | 'edit';

const EMPTY_FORM = {
  name: '',
  projectCode: '',
  clientName: '',
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
    saveContractAmendment,
    saveInitialContract,
    permissions,
  } = useApp();
  const [mode, setMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ContractEditTarget | null>(null);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
  });

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

  const availableSequences = useMemo(() => {
    const sequences: AmendmentSequence[] = [];
    for (let i = 1; i <= projectAmendments.length; i += 1) {
      sequences.push(i as AmendmentSequence);
    }
    if (nextSequence) sequences.push(nextSequence);
    return sequences;
  }, [projectAmendments.length, nextSequence]);

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
    });
    setEditId('');
    setMode('create');
    setError('');
    setAmendmentOpen(false);
    setSelectedTarget(null);
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
      setError(codeError);
      return false;
    }

    if (!code || !isValidProjectCode(code)) {
      setError('프로젝트 코드는 0000-0000-00 형식(숫자 10자리)으로 입력해 주세요.');
      return false;
    }

    if (!derived?.division) {
      setError(
        `코드 분류에 해당하는 "${derived?.divisionName ?? '사업본부'}"가 조직관리에 없습니다.`,
      );
      return false;
    }

    if (
      parsedCode &&
      (!form.teamId || !isValidProjectTeamForCategory(parsedCode.businessCategory, form.teamId))
    ) {
      setError('담당 팀을 선택해 주세요.');
      return false;
    }

    if (requireContractDates) {
      if (!isCompleteKoreanDate(form.startDate)) {
        setError('시작일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
        return false;
      }

      if (form.endDate && !isCompleteKoreanDate(form.endDate)) {
        setError('종료일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
        return false;
      }
    }

    if (
      parsedCode &&
      (!form.projectType || !isValidProjectTypeForCategory(parsedCode.businessCategory, form.projectType))
    ) {
      setError('유형을 선택해 주세요.');
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
        setMessage('신규 프로젝트가 등록되었습니다.');
        resetForm();
      } else if (selectedTarget === 'initial') {
        saveInitialContract(editId, buildContractFromForm(), buildGeneralPayload());
        setAmendmentOpen(false);
        setSelectedTarget(null);
        setMessage('최초 계약 정보가 저장되었습니다.');
      } else if (selectedTarget) {
        if (!canRegisterAmendmentSequence(projectAmendments, selectedTarget)) {
          setError('등록할 수 없는 변경 차수입니다.');
          return;
        }

        const contract = buildContractFromForm();
        const result = saveContractAmendment(editId, {
          sequence: selectedTarget,
          ...contract,
          generalUpdates: buildGeneralPayload(),
        });

        if (!result.ok) {
          setError(result.reason);
          return;
        }

        setAmendmentOpen(false);
        setSelectedTarget(null);
        setMessage(`변경 ${selectedTarget}차가 확정되었습니다.`);
      } else {
        updateProject(editId, {
          ...buildGeneralPayload(),
          ...buildContractFromForm(),
        });
        setMessage('프로젝트 정보가 저장되었습니다. 계약 직접 수정은 오류 수정으로 처리됩니다.');
      }
    } catch {
      setError('프로젝트 정보를 구성할 수 없습니다.');
      return;
    }

    setTimeout(() => setMessage(''), 3000);
  };

  const handleToggleAmendment = () => {
    setAmendmentOpen((prev) => {
      const next = !prev;
      if (!next) setSelectedTarget(null);
      return next;
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

  const handleSelectInitial = () => {
    if (!editingProject) return;
    setSelectedTarget('initial');
    loadContractFields(getProjectBaseline(editingProject));
  };

  const handleSelectSequence = (sequence: AmendmentSequence) => {
    if (!editingProject) return;

    setSelectedTarget(sequence);
    const existing = projectAmendments.find((a) => a.sequence === sequence);

    if (existing) {
      loadContractFields(amendmentToSnapshot(existing));
      return;
    }

    setForm((prev) => ({
      ...prev,
      contractAmount: '',
      startDate: '',
      endDate: '',
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
    setError('');
    setAmendmentOpen(false);
    setSelectedTarget(null);
    setForm({
      name: project.name,
      projectCode: project.projectCode ?? '',
      clientName: project.clientName ?? '',
      projectType: project.projectType ?? '',
      teamId: matchedTeam?.value ?? '',
      contractAmount: project.contractAmount != null ? formatAmountInput(project.contractAmount) : '',
      startDate: formatIsoToKoreanDate(project.startDate),
      endDate: project.endDate ? formatIsoToKoreanDate(project.endDate) : '',
      pmId: project.pmId,
      participantIds: project.participantIds,
    });
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

      <div className="admin-grid">
        <Card
          title={mode === 'create' ? '신규 프로젝트 등록' : '프로젝트 수정'}
          headerAction={
            mode === 'edit' ? (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                새 등록
              </Button>
            ) : undefined
          }
        >
          <form className="admin-form" onSubmit={handleSubmit}>
            <Input
              label="프로젝트명"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <ProjectCodeInput
              value={form.projectCode}
              onChange={handleProjectCodeChange}
              required
              error={projectCodeError ?? undefined}
            />
            <Input
              label="발주처"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              placeholder="발주처명 입력"
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
            <ReadonlyField label="사업본부" value={derivedPartial.divisionName} />
            <ReadonlyField label="상태" value={derivedPartial.statusLabel} />
            <Select
              label="담당 팀"
              options={[
                { value: '', label: '선택' },
                ...projectTeamOptions,
              ]}
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              disabled={projectTeamOptions.length === 0}
              required
            />

            <div className="contract-fields-group">
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
                />
                <KoreanDateInput
                  label="시작일"
                  value={form.startDate}
                  onChange={(startDate) => setForm({ ...form, startDate })}
                  required={mode === 'create' || !!selectedTarget}
                />
                <KoreanDateInput
                  label="종료일"
                  value={form.endDate}
                  onChange={(endDate) => setForm({ ...form, endDate })}
                />
                {mode === 'edit' && !selectedTarget && (
                  <p className="form-field__hint">
                    입력란 직접 수정 후 <strong>수정 저장</strong> → 오류 수정 (분석 제외)
                  </p>
                )}
                {mode === 'edit' && selectedTarget === 'initial' && (
                  <p className="form-field__hint form-field__hint--active">
                    최초 계약 수정 중 — 저장 시 이력의 <strong>최초</strong> 값이 갱신됩니다
                  </p>
                )}
                {mode === 'edit' && selectedTarget && selectedTarget !== 'initial' && (
                  <p className="form-field__hint form-field__hint--active">
                    변경 {selectedTarget}차 — 기존 값은 이력에 보존됩니다. 새 값 입력 후{' '}
                    <strong>수정 저장</strong>
                  </p>
                )}
              </div>

              {mode === 'edit' && (
                <ContractAmendmentBox
                  open={amendmentOpen}
                  selectedTarget={selectedTarget}
                  availableSequences={availableSequences}
                  nextSequence={nextSequence}
                  onToggle={handleToggleAmendment}
                  onSelectInitial={handleSelectInitial}
                  onSelectSequence={handleSelectSequence}
                />
              )}
            </div>

            <div className="admin-form__actions no-print">
              <Button type="submit" variant="primary">
                {mode === 'create' ? '등록' : '수정 저장'}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="등록된 프로젝트" subtitle="선택 후 좌측에서 수시 수정 가능">
          <div className="admin-project-list">
            {projects.map((project: Project) => (
              <div
                key={project.id}
                className={`admin-project-item ${editId === project.id ? 'admin-project-item--active' : ''}`}
              >
                <div>
                  <strong>{project.name}</strong>
                  <span className={`badge badge--sm badge--${project.status === '공모' ? 'gray' : 'blue'}`}>
                    {project.status}
                  </span>
                  {project.projectCode && (
                    <span className="admin-project-item__code">{project.projectCode}</span>
                  )}
                </div>
                <Button
                  variant={editId === project.id ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => loadForEdit(project.id)}
                >
                  {editId === project.id ? '수정 중' : 'Edit'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {mode === 'edit' && editId && (
        <div className="admin-grid admin-grid--single">
          <ContractHistoryPanel projectId={editId} />
        </div>
      )}
    </div>
  );
}
