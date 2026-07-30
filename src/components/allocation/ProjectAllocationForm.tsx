import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { Project, Team, TeamAllocationEntry } from '@/types';
import { validateAllocationSum } from '@/utils/permissions';

interface TeamAllocationFormProps {
  project: Project;
  divisionTeams: Team[];
  initialEntries: TeamAllocationEntry[];
  onSave: (entries: TeamAllocationEntry[]) => void;
}

function TeamAllocationForm({
  project,
  divisionTeams,
  initialEntries,
  onSave,
}: TeamAllocationFormProps) {
  const [entries, setEntries] = useState<TeamAllocationEntry[]>(
    initialEntries.length > 0
      ? initialEntries
      : [{ teamId: '', teamName: '', ratio: 0 }],
  );
  const [error, setError] = useState('');

  const addEntry = () => {
    setEntries((prev) => [...prev, { teamId: '', teamName: '', ratio: 0 }]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEntry = (
    index: number,
    field: keyof TeamAllocationEntry,
    value: string | number,
  ) => {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;
        if (field === 'teamId') {
          const team = divisionTeams.find((t) => t.id === value);
          return { ...entry, teamId: value as string, teamName: team?.name ?? '' };
        }
        return { ...entry, [field]: value };
      }),
    );
    setError('');
  };

  const handleSave = () => {
    const filled = entries.filter((e) => e.teamId);
    const { valid, sum } = validateAllocationSum(filled.map((e) => e.ratio));

    if (filled.length === 0) {
      setError('최소 1개 팀을 선택해 주세요.');
      return;
    }

    const teamIds = filled.map((e) => e.teamId);
    if (new Set(teamIds).size !== teamIds.length) {
      setError('같은 팀을 중복 선택할 수 없습니다.');
      return;
    }

    if (!valid) {
      setError(`배분 비율 합계가 100%여야 합니다. (현재: ${sum.toFixed(1)}%)`);
      return;
    }

    onSave(filled);
    setError('');
  };

  const currentSum = entries.reduce((acc, e) => acc + (e.ratio || 0), 0);

  return (
    <Card title="팀별 프로젝트 배분" className="track-form-card">
      <p className="project-allocation__desc">
        {project.name} — 소속 사업본부 팀에 배분합니다. 합계 100% 필수
      </p>
      <div className="track-form">
        {entries.map((entry, index) => (
          <div key={index} className="track-form__row">
            <Select
              label={index === 0 ? '팀' : undefined}
              options={[
                { value: '', label: '선택' },
                ...divisionTeams.map((team) => ({ value: team.id, label: team.name })),
              ]}
              value={entry.teamId}
              onChange={(e) => updateEntry(index, 'teamId', e.target.value)}
            />
            <Input
              label={index === 0 ? '배분 비율 (%)' : undefined}
              type="number"
              min={0}
              max={100}
              value={entry.ratio || ''}
              onChange={(e) => updateEntry(index, 'ratio', Number(e.target.value))}
            />
            <Button
              variant="ghost"
              size="sm"
              className="track-form__remove no-print"
              onClick={() => removeEntry(index)}
              disabled={entries.length <= 1}
            >
              삭제
            </Button>
          </div>
        ))}

        <div className="track-form__footer">
          <div className="track-form__sum">
            합계:{' '}
            <strong
              className={Math.abs(currentSum - 100) < 0.01 ? 'text-success' : 'text-danger'}
            >
              {currentSum.toFixed(1)}%
            </strong>
            {Math.abs(currentSum - 100) >= 0.01 && (
              <span className="text-muted"> / 100%</span>
            )}
          </div>
          <div className="track-form__actions no-print">
            <Button variant="secondary" size="sm" onClick={addEntry}>
              + 팀 추가
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              저장
            </Button>
          </div>
        </div>
        {error && <p className="form-field__error">{error}</p>}
      </div>
    </Card>
  );
}

export function ProjectAllocationForm() {
  const {
    permissions,
    visibleProjects,
    teams,
    getProjectTeamAllocationForProject,
    saveProjectTeamAllocation,
  } = useApp();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    visibleProjects[0]?.id ?? '',
  );
  const [savedMessage, setSavedMessage] = useState('');

  const selectedProject = visibleProjects.find((p) => p.id === selectedProjectId);
  const allocation = selectedProject
    ? getProjectTeamAllocationForProject(selectedProject.id)
    : undefined;

  const divisionTeams = useMemo(() => {
    if (!selectedProject) return [];
    return teams.filter((team) => team.divisionId === selectedProject.divisionId);
  }, [selectedProject, teams]);

  const handleSave = (entries: TeamAllocationEntry[]) => {
    saveProjectTeamAllocation(selectedProjectId, entries);
    setSavedMessage('팀 배분 저장 완료 — 팀장 대시보드·인력 배분에 반영되었습니다.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  if (!permissions.canAccessProjectAllocationForm) {
    return null;
  }

  if (visibleProjects.length === 0) {
    return (
      <Card title="프로젝트 팀 배분">
        <p className="empty-state">배분 가능한 프로젝트가 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className="allocation-page">
      <div className="page-header no-print">
        <h2>프로젝트 팀 배분</h2>
        <p>사업본부 프로젝트를 소속 팀에 배분 — 합계 100% 필수</p>
      </div>

      <Card title="프로젝트 선택" className="no-print">
        <Select
          label="프로젝트"
          options={visibleProjects.map((project: Project) => ({
            value: project.id,
            label: project.name,
          }))}
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        />
      </Card>

      {savedMessage && <div className="toast toast--success no-print">{savedMessage}</div>}

      {selectedProject && divisionTeams.length > 0 && (
        <TeamAllocationForm
          key={selectedProjectId}
          project={selectedProject}
          divisionTeams={divisionTeams}
          initialEntries={allocation?.teams ?? []}
          onSave={handleSave}
        />
      )}

      {selectedProject && divisionTeams.length === 0 && (
        <Card title="팀별 프로젝트 배분">
          <p className="empty-state">이 사업본부에 등록된 팀이 없습니다.</p>
        </Card>
      )}
    </div>
  );
}
