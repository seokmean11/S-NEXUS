import type { Project } from '@/types';

export function sortProjectsByName(projects: Project[]) {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function filterProjects(projects: Project[], query: string) {
  const sorted = sortProjectsByName(projects);
  const keyword = query.trim().toLowerCase();
  if (!keyword) return sorted;

  return sorted.filter((project) => {
    const searchable = [
      project.name,
      project.projectCode,
      project.clientName,
      project.status,
      project.divisionName,
      project.teamName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(keyword);
  });
}

export function filterProjectsByCode(projects: Project[], query: string) {
  const sorted = sortProjectsByName(projects);
  const digits = query.replace(/\D/g, '');
  if (!digits) return sorted;

  return sorted.filter((project) => {
    const codeDigits = (project.projectCode ?? '').replace(/\D/g, '');
    return codeDigits.includes(digits);
  });
}
