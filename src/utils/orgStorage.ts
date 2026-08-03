import type { Division, Employee, ExecutiveOffice, Project, ProjectTeamAllocation, Team, TrackAllocation } from '@/types';
import type { ContractAmendment } from '@/types/contractChange';
import type { LegacyExecutiveOffice } from '@/types/history';
import { normalizeEmployeeAccessRole, normalizeExecutiveAccessRole } from '@/utils/webAccessRole';

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
  contractAmendments?: ContractAmendment[];
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

function migrateProjectContinuity(projects: Project[]): Project[] {
  return projects.map((project) =>
    (project.continuity as string | undefined) === '이월'
      ? { ...project, continuity: '계약고' }
      : project,
  );
}

function migrateTeams(teams: Team[], divisions: Division[]): Team[] {
  const exhibitionDivisionIds = new Set(
    divisions
      .filter((division) => division.name === '전시사업본부' || division.id === 'div-ex')
      .map((division) => division.id),
  );

  return teams.filter(
    (team) => !(team.name === '건축2팀' && exhibitionDivisionIds.has(team.divisionId)),
  );
}

function migrateEmployees(employees: Employee[]): Employee[] {
  return employees.map((employee) => {
    const migrated =
      employee.id === 'emp-admin' && employee.name === '김개발'
        ? { ...employee, name: '서석민' }
        : employee;
    return normalizeEmployeeAccessRole(migrated);
  });
}

function migrateExecutiveOffice(
  office?: ExecutiveOffice | LegacyExecutiveOffice,
): ExecutiveOffice {
  const normalized = normalizeExecutiveOffice(office);
  return {
    admins: (normalized.admins ?? []).map((admin) => normalizeExecutiveAccessRole(admin)),
  };
}

export function repairStoredData(): void {
  try {
    const org = loadOrgState();
    if (org) {
      const employees = migrateEmployees(org.employees);
      saveOrgState({
        ...org,
        executiveOffice: migrateExecutiveOffice(org.executiveOffice),
        divisions: Array.isArray(org.divisions) ? org.divisions : [],
        teams: migrateTeams(
          Array.isArray(org.teams) ? org.teams : [],
          Array.isArray(org.divisions) ? org.divisions : [],
        ),
        employees: Array.isArray(employees) ? employees : [],
      });
    }
  } catch {
    try {
      localStorage.removeItem(ORG_KEY);
    } catch {
      // ignore
    }
  }

  try {
    const app = loadAppState();
    if (app) {
      const projects = migrateProjectContinuity(app.projects);
      const migrated = projects.some((project, index) => project !== app.projects[index]);
      if (migrated) {
        saveAppState({ ...app, projects });
      }
    }
  } catch {
    try {
      localStorage.removeItem(APP_KEY);
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
      employees: migrateEmployees(parsed.employees),
      executiveOffice: migrateExecutiveOffice(parsed.executiveOffice),
      teams: migrateTeams(parsed.teams, parsed.divisions),
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
    return {
      ...parsed,
      projects: migrateProjectContinuity(parsed.projects),
    };
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
