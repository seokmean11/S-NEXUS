import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { Project, ProjectStatus, ProjectType } from '@/types';
import {
  deriveProjectFieldsFromCode,
  formatProjectCode,
  getProjectTeamOptions,
  getProjectTypeOptions,
  isValidProjectCode,
  isValidProjectTeamForCategory,
  isValidProjectTypeForCategory,
  normalizeProjectCode,
  parseProjectCode,
  resolveProjectTeamSelection,
} from '@/utils/projectCode';
import {
  formatAmountInput,
  formatIsoToKoreanDate,
  formatKoreanDateInput,
  isCompleteKoreanDate,
  parseAmountInput,
  parseKoreanDateToIso,
} from '@/utils/formatInput';

type FormMode = 'create' | 'edit';

const EMPTY_FORM = {
  name: '',
  projectCode: '',
  projectType: '' as ProjectType | '',
  teamId: '',
  contractAmount: '',
  startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
  endDate: '',
  pmId: '',
  participantIds: [] as string[],
};

export function AdminProjectForm() {
  const { projects, divisions, createProject, updateProject, permissions } = useApp();
  const [mode, setMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    ...EMPTY_FORM,
  });

  const derived = useMemo(
    () => deriveProjectFieldsFromCode(form.projectCode, divisions),
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

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      startDate: formatIsoToKoreanDate(new Date().toISOString().slice(0, 10)),
    });
    setEditId('');
    setMode('create');
    setError('');
  };

  const buildProjectPayload = () => {
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
      projectType: form.projectType as ProjectType,
      divisionId: derived.division.id,
      divisionName: derived.division.name,
      teamId: team.value,
      teamName: team.label,
      status: derived.status,
      contractAmount: parseAmountInput(form.contractAmount),
      startDate: parseKoreanDateToIso(form.startDate)!,
      endDate: form.endDate ? parseKoreanDateToIso(form.endDate) ?? undefined : undefined,
      pmId: form.pmId || 'emp-mgr-a1',
      participantIds:
        form.participantIds.length > 0 ? form.participantIds : [form.pmId || 'emp-mgr-a1'],
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = normalizeProjectCode(form.projectCode);
    if (!code || !isValidProjectCode(code)) {
      setError('프로젝트 코드는 0000-0000-00 형식(숫자 10자리)으로 입력해 주세요.');
      return;
    }

    if (!derived?.division) {
      setError(
        `코드 분류에 해당하는 "${derived?.divisionName ?? '사업본부'}"가 조직관리에 없습니다.`,
      );
      return;
    }

    if (
      parsedCode &&
      (!form.teamId || !isValidProjectTeamForCategory(parsedCode.businessCategory, form.teamId))
    ) {
      setError('담당 팀을 선택해 주세요.');
      return;
    }

    if (!isCompleteKoreanDate(form.startDate)) {
      setError('시작일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
      return;
    }

    if (form.endDate && !isCompleteKoreanDate(form.endDate)) {
      setError('종료일을 YYYY년 MM월 DD일 형식으로 입력해 주세요.');
      return;
    }

    if (
      parsedCode &&
      (!form.projectType || !isValidProjectTypeForCategory(parsedCode.businessCategory, form.projectType))
    ) {
      setError('유형을 선택해 주세요.');
      return;
    }

    let projectData;
    try {
      projectData = buildProjectPayload();
    } catch {
      setError('프로젝트 정보를 구성할 수 없습니다.');
      return;
    }

    if (mode === 'create') {
      createProject(projectData);
      setMessage('신규 프로젝트가 등록되었습니다.');
      resetForm();
    } else {
      updateProject(editId, projectData);
      setMessage('프로젝트 정보가 저장되었습니다. 계속 수정할 수 있습니다.');
    }

    setTimeout(() => setMessage(''), 3000);
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
    setForm({
      name: project.name,
      projectCode: project.projectCode ?? '',
      projectType: project.projectType ?? '',
      teamId: matchedTeam?.value ?? '',
      contractAmount: project.contractAmount != null ? formatAmountInput(project.contractAmount) : '',
      startDate: formatIsoToKoreanDate(project.startDate),
      endDate: project.endDate ? formatIsoToKoreanDate(project.endDate) : '',
      pmId: project.pmId,
      participantIds: project.participantIds,
    });
  };

  const handleProjectCodeChange = (raw: string) => {
    const projectCode = formatProjectCode(raw);
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

  const statusOptions: { value: ProjectStatus; label: string }[] = derived
    ? [{ value: derived.status, label: derived.status }]
    : [{ value: '공모' as ProjectStatus, label: '코드 입력 후 자동 설정' }];

  const divisionOptions = derived?.division
    ? [{ value: derived.division.id, label: derived.divisionName }]
    : [{ value: '', label: '코드 입력 후 자동 설정' }];

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
            <Input
              label="프로젝트 코드"
              value={form.projectCode}
              onChange={(e) => handleProjectCodeChange(e.target.value)}
              placeholder="0000-0000-00"
              maxLength={12}
              required
            />
            <p className="form-field__hint">
              연도-사업분류-단계 (10자리) · 외부 집행원가 연동 키
            </p>
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
            <Select
              label="사업본부"
              options={divisionOptions}
              value={derived?.division?.id ?? ''}
              disabled
            />
            <Select
              label="상태"
              options={statusOptions}
              value={derived?.status ?? '공모'}
              disabled
            />
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
            <Input
              label="계약금액 (원)"
              type="text"
              inputMode="numeric"
              value={form.contractAmount}
              onChange={(e) =>
                setForm({ ...form, contractAmount: formatAmountInput(e.target.value) })
              }
              placeholder="수주 확정 후 입력"
            />
            <Input
              label="시작일"
              type="text"
              inputMode="numeric"
              value={form.startDate}
              onChange={(e) =>
                setForm({ ...form, startDate: formatKoreanDateInput(e.target.value) })
              }
              placeholder="YYYY년 MM월 DD일"
              required
            />
            <Input
              label="종료일"
              type="text"
              inputMode="numeric"
              value={form.endDate}
              onChange={(e) =>
                setForm({ ...form, endDate: formatKoreanDateInput(e.target.value) })
              }
              placeholder="YYYY년 MM월 DD일"
            />
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
    </div>
  );
}
