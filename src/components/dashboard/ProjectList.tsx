import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/data/mockData';
import type { Project } from '@/types';
import { downloadProjectListExcel } from '@/utils/projectListExport';

const STATUS_COLORS: Record<string, string> = {
  공모: 'badge--gray',
  설계: 'badge--blue',
  제작: 'badge--green',
  수주: 'badge--blue',
  실행: 'badge--green',
  완료: 'badge--purple',
};

interface ProjectListProps {
  projects: Project[];
  onSelect?: (project: Project) => void;
  selectedId?: string;
  readOnly?: boolean;
}

export function ProjectList({
  projects,
  onSelect,
  selectedId,
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card title="프로젝트 목록">
        <p className="empty-state">표시할 프로젝트가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card
      title="프로젝트 목록"
      subtitle={`총 ${projects.length}건`}
      headerAction={
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() => downloadProjectListExcel(projects)}
        >
          엑셀 다운로드
        </Button>
      }
    >
      <div className="project-list">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`project-item ${selectedId === project.id ? 'project-item--selected' : ''}`}
            onClick={() => onSelect?.(project)}
          >
            <div className="project-item__header">
              <span className="project-item__name">{project.name}</span>
              <span className={`badge ${STATUS_COLORS[project.status]}`}>
                {project.status}
              </span>
            </div>
            <div className="project-item__meta">
              <span>{project.divisionName}</span>
              <span>·</span>
              <span>{project.teamName}</span>
            </div>
            {project.contractAmount && (
              <p className="project-item__amount">
                계약금액 {formatCurrency(project.contractAmount)}
              </p>
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}
