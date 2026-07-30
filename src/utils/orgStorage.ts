import type { Division, Employee, ExecutiveOffice, Project, ProjectTeamAllocation, Team, TrackAllocation } from '@/types';
import type { LegacyExecutiveOffice } from '@/types/history';

const ORG_KEY = 'performance-dashboard-org';
const APP_KEY = 'performance-dashboard-app';

export interface StoredOrgState {
  executiveOffice?: ExecutiveOffice | LegacyExecutiveOffice;
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
}

export interface StoredAppState {
  projects: Project[];
  allocations: TrackAllocation[];
  projectTeamAllocations?: ProjectTeamAllocation[];
  historySeeded?: boolean;
}

export function normalizeExecutiveOffice(
  office?: ExecutiveOffice | LegacyExecutiveOffice,
): ExecutiveOffice {
  if (office && 'admins' in office && Array.isArray(office.admins)) {
    return { admins: office.admins };
  }
  if (office && 'adminName' in office && office.adminName) {
    return {
      admins: [
        {
          id: 'exec-legacy',
          name: office.adminName,
          rank: office.adminRank ?? '',
        },
      ],
    };
  }
  return { admins: [] };
}

export function repairStoredData(): void {
  try {
    const org = loadOrgState();
    if (org) {
      saveOrgState({
        ...org,
        executiveOffice: normalizeExecutiveOffice(org.executiveOffice),
        divisions: Array.isArray(org.divisions) ? org.divisions : [],
        teams: Array.isArray(org.teams) ? org.teams : [],
        employees: Array.isArray(org.employees) ? org.employees : [],
      });
    }
  } catch {
    try {
      localStorage.removeItem(ORG_KEY);
    } catch {
      // ignore
    }
  }
}

export function loadOrgState(): StoredOrgState | null {
  try {
    const raw = localStorage.getItem(ORG_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredOrgState;
    if (
      !Array.isArray(parsed.divisions) ||
      !Array.isArray(parsed.teams) ||
      !Array.isArray(parsed.employees)
    ) {
      return null;
    }

    return {
      ...parsed,
      executiveOffice: normalizeExecutiveOffice(parsed.executiveOffice),
    };
  } catch {
    return null;
  }
}

export function saveOrgState(state: StoredOrgState & { executiveOffice: ExecutiveOffice }): void {
  try {
    localStorage.setItem(ORG_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadAppState(): StoredAppState | null {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAppState;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.allocations)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAppState(state: StoredAppState): void {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
