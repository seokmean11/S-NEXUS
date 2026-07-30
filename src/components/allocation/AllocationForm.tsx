import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import type { AllocationEntry, Employee, Project } from '@/types';
import { validateAllocationSum } from '@/utils/permissions';

type TrackType = 'bid' | 'design' | 'production';

const TRACK_LABELS: Record<TrackType, string> = {
  bid: '공모 수주 배분',
  design: '설계 실행 배분',
  production: '제작 실행 배분',
};

interface TrackFormProps {
  track: TrackType;
  projectId: string;
  initialEntries: AllocationEntry[];
  teamEmployeeIds: string[];
  employees: Employee[];
  onSave: (entries: AllocationEntry[]) => void;
}

function TrackForm({
  track,
  initialEntries,
  teamEmployeeIds,
  employees,
  onSave,
}: TrackFormProps) {
  const [entries, setEntries] = useState<AllocationEntry[]>(
    initialEntries.length > 0 ? initialEntries : [{ employeeId: '', employeeName: '', ratio: 0 }],
  );
  const [error, setError] = useState('');

  const teamEmployees = employees.filter((e) => teamEmployeeIds.includes(e.id));

  const addEntry = () => {
    setEntries((prev) => [...prev, { employeeId: '', employeeName: '', ratio: 0 }]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof AllocationEntry, value: string | number) => {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;
        if (field === 'employeeId') {
          const emp = employees.find((e) => e.id === value);
          return { ...entry, employeeId: value as string, employeeName: emp?.name ?? '' };
        }
        return { ...entry, [field]: value };
      }),
    );
    setError('');
  };

  const handleSave = () => {
    const filled = entries.filter((e) => e.employeeId);
    const { valid, sum } = validateAllocationSum(filled.map((e) => e.ratio));

    if (filled.length === 0) {
      setError('최소 1명의 참여자를 추가해 주세요.');
      return;
    }

    if (!valid) {
      setError(`투입 비율 합계가 100%여야 합니다. (현재: ${sum.toFixed(1)}%)`);
      return;
    }

    onSave(filled);
    setError('');
  };

  const currentSum = entries.reduce((acc, e) => acc + (e.ratio || 0), 0);

  return (
    <Card title={TRACK_LABELS[track]} className="track-form-card">
      <div className="track-form">
        {entries.map((entry, index) => (
          <div key={index} className="track-form__row">
            <Select
              label={index === 0 ? '참여자' : undefined}
              options={[
                { value: '', label: '선택' },
                ...teamEmployees.map((e) => ({ value: e.id, label: e.name })),
              ]}
              value={entry.employeeId}
              onChange={(e) => updateEntry(index, 'employeeId', e.target.value)}
            />
            <Input
              label={index === 0 ? '투입 비율 (%)' : undefined}
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
            합계: <strong className={Math.abs(currentSum - 100) < 0.01 ? 'text-success' : 'text-danger'}>{currentSum.toFixed(1)}%</strong>
            {Math.abs(currentSum - 100) >= 0.01 && <span className="text-muted"> / 100%</span>}
          </div>
          <div className="track-form__actions no-print">
            <Button variant="secondary" size="sm" onClick={addEntry}>
              + 참여자 추가
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

export function AllocationForm() {
  const { visibleProjects, roleConfig, employees, getAllocationForProject, saveAllocation } = useApp();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    visibleProjects[0]?.id ?? '',
  );
  const [savedMessage, setSavedMessage] = useState('');

  const selectedProject = visibleProjects.find((p) => p.id === selectedProjectId);
  const allocation = getAllocationForProject(selectedProjectId);

  const teamEmployees = employees.filter((e) => e.teamId === roleConfig.teamId);

  const handleSave = (track: TrackType, entries: AllocationEntry[]) => {
    saveAllocation(selectedProjectId, track, entries);
    setSavedMessage(`${TRACK_LABELS[track]} 저장 완료 — 팀원 대시보드에 반영되었습니다.`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  if (visibleProjects.length === 0) {
    return (
      <Card title="PM 인력 배분">
        <p className="empty-state">배분 가능한 프로젝트가 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className="allocation-page">
      <div className="page-header no-print">
        <h2>PM 인력 배분</h2>
        <p>3-Track 인력 배분 — 각 Track 합계 100% 필수</p>
      </div>

      <Card title="프로젝트 선택" className="no-print">
        <Select
          label="프로젝트"
          options={visibleProjects.map((p: Project) => ({
            value: p.id,
            label: p.name,
          }))}
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        />
      </Card>

      {savedMessage && (
        <div className="toast toast--success no-print">{savedMessage}</div>
      )}

      {selectedProject && (
        <div className="track-forms">
          <TrackForm
            key={`${selectedProjectId}-bid`}
            track="bid"
            projectId={selectedProjectId}
            initialEntries={allocation?.bid ?? []}
            teamEmployeeIds={teamEmployees.map((e) => e.id)}
            employees={employees}
            onSave={(entries) => handleSave('bid', entries)}
          />
          <TrackForm
            key={`${selectedProjectId}-design`}
            track="design"
            projectId={selectedProjectId}
            initialEntries={allocation?.design ?? []}
            teamEmployeeIds={teamEmployees.map((e) => e.id)}
            employees={employees}
            onSave={(entries) => handleSave('design', entries)}
          />
          <TrackForm
            key={`${selectedProjectId}-production`}
            track="production"
            projectId={selectedProjectId}
            initialEntries={allocation?.production ?? []}
            teamEmployeeIds={teamEmployees.map((e) => e.id)}
            employees={employees}
            onSave={(entries) => handleSave('production', entries)}
          />
        </div>
      )}
    </div>
  );
}
