import type {
  Division,
  Employee,
  Project,
  ProjectTeamAllocation,
  Team,
  TeamAllocationEntry,
} from '@/types';

export function resolveProjectOrgNames(
  divisionId: string,
  teamId: string,
  divisions: Division[],
  teams: Team[],
): { divisionName: string; teamName: string } {
  return {
    divisionName: divisions.find((d) => d.id === divisionId)?.name ?? '',
    teamName: teams.find((t) => t.id === teamId)?.name ?? '',
  };
}

export function buildDefaultTeamAllocation(
  projectId: string,
  teamId: string,
  teamName: string,
  updatedAt: string,
): ProjectTeamAllocation {
  return {
    projectId,
    teams: [{ teamId, teamName, ratio: 100 }],
    updatedAt,
  };
}

export function syncProjectsWithOrg(
  projects: Project[],
  divisions: Division[],
  teams: Team[],
): Project[] {
  return projects.map((project) => {
    const team = teams.find((t) => t.id === project.teamId);
    const divisionId = team?.divisionId ?? project.divisionId;
    const { divisionName, teamName } = resolveProjectOrgNames(
      divisionId,
      project.teamId,
      divisions,
      teams,
    );

    return {
      ...project,
      divisionId,
      divisionName: divisionName || project.divisionName,
      teamName: teamName || project.teamName,
    };
  });
}

export function collectTeamParticipantIds(
  teamId: string,
  pmId: string,
  employees: Employee[],
): string[] {
  const teamMemberIds = employees.filter((e) => e.teamId === teamId).map((e) => e.id);
  const ids = new Set<string>([...teamMemberIds, pmId].filter(Boolean));
  return [...ids];
}

export function syncProjectTeamAllocationEntry(
  allocations: ProjectTeamAllocation[],
  projectId: string,
  teamId: string,
  teamName: string,
  updatedAt: string,
): ProjectTeamAllocation[] {
  const entry: TeamAllocationEntry = { teamId, teamName, ratio: 100 };
  const existing = allocations.find((a) => a.projectId === projectId);

  if (existing) {
    return allocations.map((a) =>
      a.projectId === projectId ? { ...a, teams: [entry], updatedAt } : a,
    );
  }

  return [...allocations, buildDefaultTeamAllocation(projectId, teamId, teamName, updatedAt)];
}

export function syncProjectTeamAllocationNames(
  allocations: ProjectTeamAllocation[],
  teams: Team[],
): ProjectTeamAllocation[] {
  return allocations.map((allocation) => ({
    ...allocation,
    teams: allocation.teams.map((entry) => ({
      ...entry,
      teamName: teams.find((t) => t.id === entry.teamId)?.name ?? entry.teamName,
    })),
  }));
}

export function addEmployeeToTeamProjects(
  projects: Project[],
  projectTeamAllocations: ProjectTeamAllocation[],
  teamId: string,
  employeeId: string,
): Project[] {
  return projects.map((project) => {
    const allocation = projectTeamAllocations.find((a) => a.projectId === project.id);
    const assignedTeamIds = allocation?.teams.map((entry) => entry.teamId) ?? [project.teamId];
    if (!assignedTeamIds.includes(teamId)) return project;
    if (project.participantIds.includes(employeeId)) return project;
    return { ...project, participantIds: [...project.participantIds, employeeId] };
  });
}

export function getAssignedTeamIds(
  project: Project,
  projectTeamAllocations: ProjectTeamAllocation[],
): string[] {
  const allocation = projectTeamAllocations.find((a) => a.projectId === project.id);
  return allocation?.teams.map((entry) => entry.teamId) ?? [project.teamId];
}
