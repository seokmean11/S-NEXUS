import type {
  ContributionCard,
  PermissionFlags,
  Project,
  ProjectTeamAllocation,
  Role,
  RoleConfig,
} from '@/types';

function projectVisibleToTeam(
  project: Project,
  teamId: string,
  projectTeamAllocations: ProjectTeamAllocation[],
): boolean {
  const allocation = projectTeamAllocations.find((a) => a.projectId === project.id);
  if (allocation && allocation.teams.length > 0) {
    return allocation.teams.some((entry) => entry.teamId === teamId);
  }
  return project.teamId === teamId;
}

export function getPermissions(role: Role): PermissionFlags {
  switch (role) {
    case 'dev_admin':
      return {
        canViewAll: true,
        canCreateProject: true,
        canEditProject: true,
        canSyncPPM: true,
        canAccessAllocationForm: true,
        canAccessProjectAllocationForm: true,
        canExportPDF: false,
        isReadOnly: false,
      };
    case 'c_level':
      return {
        canViewAll: true,
        canCreateProject: false,
        canEditProject: false,
        canSyncPPM: false,
        canAccessAllocationForm: false,
        canAccessProjectAllocationForm: false,
        canExportPDF: true,
        isReadOnly: true,
      };
    case 'division_head':
      return {
        canViewAll: false,
        canCreateProject: false,
        canEditProject: false,
        canSyncPPM: false,
        canAccessAllocationForm: false,
        canAccessProjectAllocationForm: true,
        canExportPDF: false,
        isReadOnly: true,
      };
    case 'team_manager':
      return {
        canViewAll: false,
        canCreateProject: false,
        canEditProject: false,
        canSyncPPM: false,
        canAccessAllocationForm: true,
        canAccessProjectAllocationForm: false,
        canExportPDF: false,
        isReadOnly: false,
      };
    case 'team_member':
      return {
        canViewAll: false,
        canCreateProject: false,
        canEditProject: false,
        canSyncPPM: false,
        canAccessAllocationForm: false,
        canAccessProjectAllocationForm: false,
        canExportPDF: false,
        isReadOnly: true,
      };
  }
}

export function filterProjectsByRole(
  projects: Project[],
  roleConfig: RoleConfig,
  projectTeamAllocations: ProjectTeamAllocation[] = [],
): Project[] {
  switch (roleConfig.id) {
    case 'dev_admin':
    case 'c_level':
      return projects;
    case 'division_head':
      return projects.filter((p) => p.divisionId === roleConfig.divisionId);
    case 'team_manager':
      return projects.filter((p) =>
        projectVisibleToTeam(p, roleConfig.teamId!, projectTeamAllocations),
      );
    case 'team_member':
      return projects.filter((p) =>
        p.participantIds.includes(roleConfig.userId),
      );
  }
}

export function buildContributionCards(
  projects: Project[],
  allocations: import('@/types').TrackAllocation[],
  userId: string,
): ContributionCard[] {
  const cards: ContributionCard[] = [];

  for (const project of projects) {
    if (!project.participantIds.includes(userId)) continue;

    const allocation = allocations.find((a) => a.projectId === project.id);
    const bidEntry = allocation?.bid.find((e) => e.employeeId === userId);
    const designEntry = allocation?.design.find((e) => e.employeeId === userId);
    const productionEntry = allocation?.production.find(
      (e) => e.employeeId === userId,
    );

    const bidRatio = bidEntry?.ratio ?? 0;
    const designRatio = designEntry?.ratio ?? 0;
    const productionRatio = productionEntry?.ratio ?? 0;
    const totalContribution = bidRatio + designRatio + productionRatio;

    cards.push({
      projectId: project.id,
      projectName: project.name,
      employeeId: userId,
      employeeName: '',
      bidRatio,
      designRatio,
      productionRatio,
      totalContribution,
      teamName: project.teamName,
      divisionName: project.divisionName,
    });
  }

  return cards;
}

export function validateAllocationSum(ratios: number[]): {
  valid: boolean;
  sum: number;
} {
  const sum = ratios.reduce((acc, r) => acc + r, 0);
  return { valid: Math.abs(sum - 100) < 0.01, sum };
}

export function generateProjectId(): string {
  return `pjt-${Date.now().toString(36)}`;
}

export function generateOrgId(prefix: 'div' | 'team' | 'emp' | 'exec'): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
