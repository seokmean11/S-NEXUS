import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { Project, ProjectStatus } from '@/types';

type FormMode = 'create' | 'edit';

export function AdminProjectForm() {
  const { projects, divisions, teams, createProject, updateProject, syncPPM, permissions } = useApp();
  const [mode, setMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    name: '',
    divisionId: divisions[0]?.id ?? '',
    teamId: teams[0]?.id ?? '',
    status: '공모' as ProjectStatus,
    contractAmount: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    pmId: '',
    participantIds: [] as string[],
  });

  const divisionTeams = teams.filter((t) => t.divisionId === form.divisionId);

  const resetForm = () => {
    setForm({
      name: '',
      divisionId: divisions[0]?.id ?? '',
      teamId: teams[0]?.id ?? '',
      status: '공모',
      contractAmount: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      pmId: '',
      participantIds: [],
    });
    setEditId('');
    setMode('create');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const division = divisions.find((d) => d.id === form.divisionId)!;
    const team = teams.find((t) => t.id === form.teamId)!;

    const projectData = {
      name: form.name,
      divisionId: form.divisionId,
      divisionName: division.name,
      teamId: form.teamId,
      teamName: team.name,
      status: form.status,
      contractAmount: form.contractAmount ? Number(form.contractAmount) : undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      pmId: form.pmId || 'emp-mgr-a1',
      participantIds: form.participantIds.length > 0 ? form.participantIds : [form.pmId || 'emp-mgr-a1'],
    };

    if (mode === 'create') {
      createProject(projectData);
      setMessage('신규 프로젝트가 등록되었습니다.');
    } else {
      updateProject(editId, projectData);
      setMessage('프로젝트 정보가 수정되었습니다.');
    }

    resetForm();
    setTimeout(() => setMessage(''), 3000);
  };

  const loadForEdit = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    setEditId(project.id);
    setMode('edit');
    setForm({
      name: project.name,
      divisionId: project.divisionId,
      teamId: project.teamId,
      status: project.status,
      contractAmount: project.contractAmount?.toString() ?? '',
      startDate: project.startDate,
      endDate: project.endDate ?? '',
      pmId: project.pmId,
      participantIds: project.participantIds,
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    await syncPPM();
    setSyncing(false);
    setMessage('PPM(DB) 동기화가 완료되었습니다.');
    setTimeout(() => setMessage(''), 3000);
  };

  if (!permissions.canCreateProject) {
    return null;
  }

  return (
    <div className="admin-page">
      <div className="page-header no-print">
        <h2>프로젝트 마스터 관리</h2>
        <p>신규 등록 및 수주 후 계약금액 수정</p>
      </div>

      {message && <div className="toast toast--success no-print">{message}</div>}

      <div className="admin-grid">
        <Card
          title={mode === 'create' ? '신규 프로젝트 등록' : '프로젝트 수정'}
          headerAction={
            mode === 'edit' ? (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                취소
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
            <Select
              label="사업본부"
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              value={form.divisionId}
              onChange={(e) => {
                const nextTeams = teams.filter((t) => t.divisionId === e.target.value);
                setForm({
                  ...form,
                  divisionId: e.target.value,
                  teamId: nextTeams[0]?.id ?? '',
                });
              }}
            />
            <Select
              label="담당 팀"
              options={divisionTeams.map((t) => ({ value: t.id, label: t.name }))}
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
            />
            <Select
              label="상태"
              options={[
                { value: '공모', label: '공모' },
                { value: '수주', label: '수주' },
                { value: '실행', label: '실행' },
                { value: '완료', label: '완료' },
              ]}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
            />
            <Input
              label="계약금액 (원)"
              type="number"
              value={form.contractAmount}
              onChange={(e) => setForm({ ...form, contractAmount: e.target.value })}
              placeholder="수주 확정 후 입력"
            />
            <Input
              label="시작일"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              required
            />
            <Input
              label="종료일"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
            <div className="admin-form__actions no-print">
              <Button type="submit" variant="primary">
                {mode === 'create' ? '등록' : '수정 저장'}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="등록된 프로젝트" subtitle="수주/실행 프로젝트는 수정 가능">
          <div className="admin-project-list">
            {projects.map((project: Project) => (
              <div key={project.id} className="admin-project-item">
                <div>
                  <strong>{project.name}</strong>
                  <span className={`badge badge--sm badge--${project.status === '공모' ? 'gray' : 'blue'}`}>
                    {project.status}
                  </span>
                </div>
                {(project.status === '수주' || project.status === '실행' || project.status === '완료') && (
                  <Button variant="outline" size="sm" onClick={() => loadForEdit(project.id)}>
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </div>

          {permissions.canSyncPPM && (
            <div className="admin-sync no-print">
              <Button variant="secondary" loading={syncing} onClick={handleSync}>
                PPM(DB) 동기화
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
