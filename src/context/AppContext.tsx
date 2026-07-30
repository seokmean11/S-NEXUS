import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  BUDGET_SCENARIOS,
  DEFAULT_BUDGET,
  DIVISIONS,
  EMPLOYEES,
  INITIAL_ALLOCATIONS,
  INITIAL_PROJECTS,
  ROLE_CONFIGS,
  TEAMS,
} from '@/data/mockData';
import type {
  AllocationEntry,
  BudgetStatus,
  ContributionCard,
  Division,
  Employee,
  Project,
  RiskScenario,
  Role,
  RoleConfig,
  Team,
  TrackAllocation,
} from '@/types';
import {
  buildContributionCards,
  filterProjectsByRole,
  generateOrgId,
  getPermissions,
} from '@/utils/permissions';

type OrgMutationResult = { ok: true } | { ok: false; reason: string };

interface AppContextValue {
  role: Role;
  roleConfig: RoleConfig;
  permissions: ReturnType<typeof getPermissions>;
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
  projects: Project[];
  visibleProjects: Project[];
  allocations: TrackAllocation[];
  budget: BudgetStatus;
  riskScenario: RiskScenario;
  contributionCards: ContributionCard[];
  setRole: (role: Role) => void;
  addDivision: (name: string) => void;
  updateDivision: (
    id: string,
    updates: { name?: string; headName?: string; headRank?: string },
  ) => void;
  removeDivision: (id: string) => OrgMutationResult;
  addTeam: (divisionId: string, name: string) => void;
  updateTeam: (
    id: string,
    updates: {
      name?: string;
      divisionId?: string;
      headName?: string;
      headRank?: string;
    },
  ) => void;
  removeTeam: (id: string) => OrgMutationResult;
  addEmployee: (teamId: string, name: string, role: string) => void;
  updateEmployee: (
    id: string,
    updates: Partial<Pick<Employee, 'name' | 'role' | 'teamId'>>,
  ) => void;
  removeEmployee: (id: string) => OrgMutationResult;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  syncPPM: () => Promise<void>;
  saveAllocation: (
    projectId: string,
    track: 'bid' | 'design' | 'production',
    entries: AllocationEntry[],
  ) => void;
  setRiskScenario: (scenario: RiskScenario) => void;
  getAllocationForProject: (projectId: string) => TrackAllocation | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('dev_admin');
  const [divisions, setDivisions] = useState<Division[]>([...DIVISIONS]);
  const [teams, setTeams] = useState<Team[]>([...TEAMS]);
  const [employees, setEmployees] = useState<Employee[]>([...EMPLOYEES]);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [allocations, setAllocations] =
    useState<TrackAllocation[]>(INITIAL_ALLOCATIONS);
  const [riskScenario, setRiskScenario] = useState<RiskScenario>('normal');

  const roleConfig = useMemo(
    () => ROLE_CONFIGS.find((r) => r.id === role)!,
    [role],
  );

  const permissions = useMemo(() => getPermissions(role), [role]);

  const visibleProjects = useMemo(
    () => filterProjectsByRole(projects, roleConfig),
    [projects, roleConfig],
  );

  const budget = useMemo(
    () => BUDGET_SCENARIOS[riskScenario] ?? DEFAULT_BUDGET,
    [riskScenario],
  );

  const contributionCards = useMemo(() => {
    if (role !== 'team_member') return [];
    return buildContributionCards(
      visibleProjects,
      allocations,
      roleConfig.userId,
    ).map((card) => ({
      ...card,
      employeeName: roleConfig.userName,
    }));
  }, [role, visibleProjects, allocations, roleConfig]);

  const createProject = useCallback(
    (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString().slice(0, 10);
      const newProject: Project = {
        ...project,
        id: `pjt-${Date.now().toString(36)}`,
        createdAt: now,
        updatedAt: now,
      };
      setProjects((prev) => [...prev, newProject]);
    },
    [],
  );

  const syncDivisionNames = useCallback((divisionId: string, name: string) => {
    setEmployees((prev) =>
      prev.map((e) => (e.divisionId === divisionId ? { ...e, divisionName: name } : e)),
    );
    setProjects((prev) =>
      prev.map((p) => (p.divisionId === divisionId ? { ...p, divisionName: name } : p)),
    );
  }, []);

  const addDivision = useCallback((name: string) => {
    setDivisions((prev) => [...prev, { id: generateOrgId('div'), name }]);
  }, []);

  const updateDivision = useCallback(
    (id: string, updates: { name?: string; headName?: string; headRank?: string }) => {
      setDivisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      if (updates.name) {
        syncDivisionNames(id, updates.name);
      }
    },
    [syncDivisionNames],
  );

  const removeDivision = useCallback(
    (id: string): OrgMutationResult => {
      const hasTeams = teams.some((t) => t.divisionId === id);
      if (hasTeams) {
        return { ok: false, reason: '하위 팀이 있는 사업본부는 삭제할 수 없습니다.' };
      }
      const hasProjects = projects.some((p) => p.divisionId === id);
      if (hasProjects) {
        return { ok: false, reason: '연결된 프로젝트가 있는 사업본부는 삭제할 수 없습니다.' };
      }
      setDivisions((prev) => prev.filter((d) => d.id !== id));
      return { ok: true };
    },
    [teams, projects],
  );

  const addTeam = useCallback((divisionId: string, name: string) => {
    setTeams((prev) => [...prev, { id: generateOrgId('team'), name, divisionId }]);
  }, []);

  const updateTeam = useCallback(
    (
      id: string,
      updates: {
        name?: string;
        divisionId?: string;
        headName?: string;
        headRank?: string;
      },
    ) => {
      setTeams((prev) => {
        const current = prev.find((t) => t.id === id);
        if (!current) return prev;

        const updated = { ...current, ...updates };
        const divisionName =
          divisions.find((d) => d.id === updated.divisionId)?.name ?? '';

        setEmployees((emps) =>
          emps.map((e) =>
            e.teamId === id
              ? {
                  ...e,
                  teamName: updated.name,
                  divisionId: updated.divisionId,
                  divisionName: divisionName || e.divisionName,
                }
              : e,
          ),
        );
        setProjects((projs) =>
          projs.map((p) => (p.teamId === id ? { ...p, teamName: updated.name } : p)),
        );

        return prev.map((t) => (t.id === id ? updated : t));
      });
    },
    [divisions],
  );

  const removeTeam = useCallback(
    (id: string): OrgMutationResult => {
      const hasMembers = employees.some((e) => e.teamId === id);
      if (hasMembers) {
        return { ok: false, reason: '구성원이 있는 팀은 삭제할 수 없습니다.' };
      }
      const hasProjects = projects.some((p) => p.teamId === id);
      if (hasProjects) {
        return { ok: false, reason: '연결된 프로젝트가 있는 팀은 삭제할 수 없습니다.' };
      }
      setTeams((prev) => prev.filter((t) => t.id !== id));
      return { ok: true };
    },
    [employees, projects],
  );

  const addEmployee = useCallback(
    (teamId: string, name: string, role: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const division = divisions.find((d) => d.id === team.divisionId);
      const employee: Employee = {
        id: generateOrgId('emp'),
        name,
        role,
        teamId,
        teamName: team.name,
        divisionId: team.divisionId,
        divisionName: division?.name ?? '',
      };
      setEmployees((prev) => [...prev, employee]);
    },
    [teams, divisions],
  );

  const updateEmployee = useCallback(
    (id: string, updates: Partial<Pick<Employee, 'name' | 'role' | 'teamId'>>) => {
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const nextTeamId = updates.teamId ?? e.teamId;
          const team = teams.find((t) => t.id === nextTeamId);
          const division = team ? divisions.find((d) => d.id === team.divisionId) : undefined;
          const nextName = updates.name ?? e.name;
          const nextRole = updates.role ?? e.role;
          return {
            ...e,
            ...updates,
            name: nextName,
            role: nextRole,
            teamId: nextTeamId,
            teamName: team?.name ?? e.teamName,
            divisionId: team?.divisionId ?? e.divisionId,
            divisionName: division?.name ?? e.divisionName,
          };
        }),
      );
      if (updates.name) {
        setAllocations((prev) =>
          prev.map((a) => ({
            ...a,
            bid: a.bid.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: updates.name! } : entry,
            ),
            design: a.design.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: updates.name! } : entry,
            ),
            production: a.production.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: updates.name! } : entry,
            ),
          })),
        );
      }
    },
    [teams, divisions],
  );

  const removeEmployee = useCallback(
    (id: string): OrgMutationResult => {
      const usedInProjects = projects.some(
        (p) => p.pmId === id || p.participantIds.includes(id),
      );
      if (usedInProjects) {
        return { ok: false, reason: '프로젝트 PM/참여자로 등록된 구성원은 삭제할 수 없습니다.' };
      }
      const usedInAllocations = allocations.some((a) =>
        [...a.bid, ...a.design, ...a.production].some((entry) => entry.employeeId === id),
      );
      if (usedInAllocations) {
        return { ok: false, reason: '인력 배분에 등록된 구성원은 삭제할 수 없습니다.' };
      }
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      return { ok: true };
    },
    [projects, allocations],
  );

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...updates, updatedAt: new Date().toISOString().slice(0, 10) }
          : p,
      ),
    );
  }, []);

  const syncPPM = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, []);

  const saveAllocation = useCallback(
    (
      projectId: string,
      track: 'bid' | 'design' | 'production',
      entries: AllocationEntry[],
    ) => {
      setAllocations((prev) => {
        const existing = prev.find((a) => a.projectId === projectId);
        const now = new Date().toISOString();

        if (existing) {
          return prev.map((a) =>
            a.projectId === projectId
              ? { ...a, [track]: entries, updatedAt: now }
              : a,
          );
        }

        return [
          ...prev,
          {
            projectId,
            bid: track === 'bid' ? entries : [],
            design: track === 'design' ? entries : [],
            production: track === 'production' ? entries : [],
            updatedAt: now,
          },
        ];
      });
    },
    [],
  );

  const getAllocationForProject = useCallback(
    (projectId: string) => allocations.find((a) => a.projectId === projectId),
    [allocations],
  );

  const value: AppContextValue = {
    role,
    roleConfig,
    permissions,
    divisions,
    teams,
    employees,
    projects,
    visibleProjects,
    allocations,
    budget,
    riskScenario,
    contributionCards,
    setRole,
    addDivision,
    updateDivision,
    removeDivision,
    addTeam,
    updateTeam,
    removeTeam,
    addEmployee,
    updateEmployee,
    removeEmployee,
    createProject,
    updateProject,
    syncPPM,
    saveAllocation,
    setRiskScenario,
    getAllocationForProject,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
