import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  BUDGET_SCENARIOS,
  DEFAULT_BUDGET,
  EXECUTIVE_OFFICE,
  DIVISIONS,
  EMPLOYEES,
  INITIAL_ALLOCATIONS,
  INITIAL_PROJECTS,
  ROLE_CONFIGS,
  TEAMS,
  buildInitialProjectTeamAllocations,
} from '@/data/mockData';
import type {
  AllocationEntry,
  BudgetStatus,
  ContributionCard,
  Division,
  Employee,
  ExecutiveAdmin,
  ExecutiveOffice,
  Project,
  ProjectTeamAllocation,
  RiskScenario,
  Role,
  RoleConfig,
  Team,
  TeamAllocationEntry,
  TrackAllocation,
} from '@/types';
import type { HistoryEvent } from '@/types/history';
import type {
  AmendmentSequence,
  ContractAmendment,
  ContractSnapshot,
} from '@/types/contractChange';
import {
  canRegisterAmendmentSequence,
  getAmendmentsForProject,
  getEffectiveContract,
  getProjectBaseline,
  snapshotFromProject,
} from '@/utils/contractChange';
import { logHistory } from '@/utils/historyLogger';
import { loadHistoryEvents, saveHistoryEvents } from '@/utils/historyStorage';
import {
  loadAppState,
  loadOrgState,
  normalizeExecutiveOffice,
  repairStoredData,
  saveAppState,
  saveOrgState,
} from '@/utils/orgStorage';
import {
  buildContributionCards,
  filterProjectsByRole,
  generateOrgId,
  getPermissions,
} from '@/utils/permissions';
import { buildInitialAllocationHistory } from '@/utils/reportAnalytics';
import {
  addEmployeeToTeamProjects,
  collectTeamParticipantIds,
  resolveProjectOrgNames,
  syncProjectTeamAllocationEntry,
  syncProjectTeamAllocationNames,
  syncProjectsWithOrg,
} from '@/utils/projectSync';

type OrgMutationResult = { ok: true } | { ok: false; reason: string };

function createInitialOrgState() {
  try {
    repairStoredData();
    const saved = loadOrgState();
    if (saved) {
      return {
        executiveOffice: normalizeExecutiveOffice(saved.executiveOffice),
        divisions: saved.divisions,
        teams: saved.teams,
        employees: saved.employees,
      };
    }
  } catch {
    // fall through to defaults
  }

  return {
    executiveOffice: normalizeExecutiveOffice(EXECUTIVE_OFFICE),
    divisions: [...DIVISIONS],
    teams: [...TEAMS],
    employees: [...EMPLOYEES],
  };
}

function createInitialAppState() {
  try {
    const saved = loadAppState();
    if (saved) {
      return {
        ...saved,
        projectTeamAllocations:
          saved.projectTeamAllocations ??
          buildInitialProjectTeamAllocations(saved.projects),
        contractAmendments: saved.contractAmendments ?? [],
      };
    }
  } catch {
    // fall through to defaults
  }
  return {
    projects: INITIAL_PROJECTS,
    allocations: INITIAL_ALLOCATIONS,
    projectTeamAllocations: buildInitialProjectTeamAllocations(INITIAL_PROJECTS),
    contractAmendments: [],
    historySeeded: false,
  };
}

interface AppContextValue {
  role: Role;
  roleConfig: RoleConfig;
  permissions: ReturnType<typeof getPermissions>;
  executiveOffice: ExecutiveOffice;
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
  projects: Project[];
  visibleProjects: Project[];
  allocations: TrackAllocation[];
  projectTeamAllocations: ProjectTeamAllocation[];
  contractAmendments: ContractAmendment[];
  budget: BudgetStatus;
  riskScenario: RiskScenario;
  contributionCards: ContributionCard[];
  historyEvents: HistoryEvent[];
  setRole: (role: Role) => void;
  addExecutiveAdmin: (name: string, rank: string) => void;
  removeExecutiveAdmin: (id: string) => void;
  updateExecutiveAdmin: (id: string, updates: { name?: string; rank?: string }) => void;
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
  saveContractAmendment: (
    projectId: string,
    params: {
      sequence: AmendmentSequence;
      contractAmount?: number;
      startDate: string;
      endDate?: string;
      generalUpdates?: Partial<Project>;
    },
  ) => { ok: true } | { ok: false; reason: string };
  saveInitialContract: (
    projectId: string,
    params: {
      contractAmount?: number;
      startDate: string;
      endDate?: string;
    },
    generalUpdates?: Partial<Project>,
  ) => void;
  syncPPM: () => Promise<void>;
  saveAllocation: (
    projectId: string,
    track: 'bid' | 'design' | 'production',
    entries: AllocationEntry[],
  ) => void;
  saveProjectTeamAllocation: (projectId: string, entries: TeamAllocationEntry[]) => void;
  setRiskScenario: (scenario: RiskScenario) => void;
  getAllocationForProject: (projectId: string) => TrackAllocation | undefined;
  getProjectTeamAllocationForProject: (projectId: string) => ProjectTeamAllocation | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const initialOrg = useMemo(() => createInitialOrgState(), []);
  const initialApp = useMemo(() => createInitialAppState(), []);

  const [role, setRole] = useState<Role>('dev_admin');
  const [executiveOffice, setExecutiveOffice] = useState<ExecutiveOffice>(
    initialOrg.executiveOffice,
  );
  const [divisions, setDivisions] = useState<Division[]>(initialOrg.divisions);
  const [teams, setTeams] = useState<Team[]>(initialOrg.teams);
  const [employees, setEmployees] = useState<Employee[]>(initialOrg.employees);
  const [projects, setProjects] = useState<Project[]>(initialApp.projects);
  const [allocations, setAllocations] = useState<TrackAllocation[]>(
    initialApp.allocations,
  );
  const [projectTeamAllocations, setProjectTeamAllocations] = useState<
    ProjectTeamAllocation[]
  >(initialApp.projectTeamAllocations);
  const [contractAmendments, setContractAmendments] = useState<ContractAmendment[]>(
    initialApp.contractAmendments ?? [],
  );
  const [riskScenario, setRiskScenario] = useState<RiskScenario>('normal');
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);

  const refreshHistory = useCallback(() => {
    setHistoryEvents(loadHistoryEvents());
  }, []);

  const recordHistory = useCallback(
    (params: Parameters<typeof logHistory>[0]) => {
      logHistory(params);
      refreshHistory();
    },
    [refreshHistory],
  );

  useEffect(() => {
    if (!initialApp.historySeeded && loadHistoryEvents().length === 0) {
      saveHistoryEvents(
        buildInitialAllocationHistory(initialApp.allocations, initialApp.projects),
      );
    }
    if (!initialApp.historySeeded) {
      saveAppState({ ...initialApp, historySeeded: true });
    }
    refreshHistory();
  }, [initialApp, refreshHistory]);

  useEffect(() => {
    setProjects((prev) => {
      const needsBaseline = prev.some((p) => !p.initialContract);
      if (!needsBaseline) return prev;
      return prev.map((p) =>
        p.initialContract ? p : { ...p, initialContract: snapshotFromProject(p) },
      );
    });
  }, []);

  useEffect(() => {
    saveOrgState({ executiveOffice, divisions, teams, employees });
  }, [executiveOffice, divisions, teams, employees]);

  useEffect(() => {
    saveAppState({
      projects,
      allocations,
      projectTeamAllocations,
      contractAmendments,
      historySeeded: true,
    });
  }, [projects, allocations, projectTeamAllocations, contractAmendments]);

  useEffect(() => {
    setProjects((prev) => syncProjectsWithOrg(prev, divisions, teams));
    setProjectTeamAllocations((prev) => syncProjectTeamAllocationNames(prev, teams));
  }, [divisions, teams]);

  const roleConfig = useMemo(() => {
    const base = ROLE_CONFIGS.find((r) => r.id === role)!;
    const employee = employees.find((e) => e.id === base.userId);
    if (!employee) return base;

    return {
      ...base,
      userName: employee.name,
      divisionId: employee.divisionId,
      teamId: employee.teamId,
    };
  }, [role, employees]);

  const permissions = useMemo(() => getPermissions(role), [role]);

  const visibleProjects = useMemo(
    () => filterProjectsByRole(projects, roleConfig, projectTeamAllocations),
    [projects, roleConfig, projectTeamAllocations],
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

  const syncDivisionNames = useCallback((divisionId: string, name: string) => {
    setEmployees((prev) =>
      prev.map((e) => (e.divisionId === divisionId ? { ...e, divisionName: name } : e)),
    );
    setProjects((prev) =>
      prev.map((p) => (p.divisionId === divisionId ? { ...p, divisionName: name } : p)),
    );
  }, []);

  const addExecutiveAdmin = useCallback(
    (name: string, rank: string) => {
      const admin: ExecutiveAdmin = {
        id: generateOrgId('exec'),
        name,
        rank,
      };
      setExecutiveOffice((prev) => ({ admins: [...(prev.admins ?? []), admin] }));
      recordHistory({
        category: 'executive',
        action: 'created',
        entityType: 'executive_admin',
        entityId: admin.id,
        entityName: name,
        summary: `총괄관리자 등록: ${name} (${rank})`,
        after: { name, rank },
      });
    },
    [recordHistory],
  );

  const removeExecutiveAdmin = useCallback(
    (id: string) => {
      const target = executiveOffice.admins?.find((a) => a.id === id);
      setExecutiveOffice((prev) => ({
        admins: (prev.admins ?? []).filter((a) => a.id !== id),
      }));
      if (target) {
        recordHistory({
          category: 'executive',
          action: 'deleted',
          entityType: 'executive_admin',
          entityId: id,
          entityName: target.name,
          summary: `총괄관리자 삭제: ${target.name}`,
          before: { name: target.name, rank: target.rank },
        });
      }
    },
    [executiveOffice.admins, recordHistory],
  );

  const updateExecutiveAdmin = useCallback(
    (id: string, updates: { name?: string; rank?: string }) => {
      const before = executiveOffice.admins?.find((a) => a.id === id);
      setExecutiveOffice((prev) => ({
        admins: (prev.admins ?? []).map((a) => (a.id === id ? { ...a, ...updates } : a)),
      }));
      const after = before ? { ...before, ...updates } : undefined;
      if (before && after) {
        recordHistory({
          category: 'executive',
          action: 'updated',
          entityType: 'executive_admin',
          entityId: id,
          entityName: after.name,
          summary: `총괄관리자 수정: ${before.name} → ${after.name}`,
          before: { name: before.name, rank: before.rank },
          after: { name: after.name, rank: after.rank },
        });
      }
    },
    [executiveOffice.admins, recordHistory],
  );

  const createProject = useCallback(
    (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString().slice(0, 10);
      const { divisionName, teamName } = resolveProjectOrgNames(
        project.divisionId,
        project.teamId,
        divisions,
        teams,
      );
      const pmId =
        project.pmId ||
        employees.find((e) => e.teamId === project.teamId && e.role === '팀장')?.id ||
        employees.find((e) => e.teamId === project.teamId)?.id ||
        '';
      const participantIds = collectTeamParticipantIds(project.teamId, pmId, employees);

      const initialContract: ContractSnapshot = snapshotFromProject(project);

      const newProject: Project = {
        ...project,
        divisionName,
        teamName,
        pmId,
        participantIds,
        initialContract,
        id: `pjt-${Date.now().toString(36)}`,
        createdAt: now,
        updatedAt: now,
      };

      setProjects((prev) => [...prev, newProject]);
      setProjectTeamAllocations((prev) =>
        syncProjectTeamAllocationEntry(
          prev,
          newProject.id,
          newProject.teamId,
          newProject.teamName,
          new Date().toISOString(),
        ),
      );
      recordHistory({
        category: 'project',
        action: 'created',
        entityType: 'project',
        entityId: newProject.id,
        entityName: newProject.name,
        summary: `프로젝트 등록: ${newProject.name}`,
        after: { status: newProject.status, teamName: newProject.teamName },
      });
    },
    [divisions, teams, employees, recordHistory],
  );

  const addDivision = useCallback(
    (name: string) => {
      const division = { id: generateOrgId('div'), name };
      setDivisions((prev) => [...prev, division]);
      recordHistory({
        category: 'organization',
        action: 'created',
        entityType: 'division',
        entityId: division.id,
        entityName: name,
        summary: `사업본부 추가: ${name}`,
      });
    },
    [recordHistory],
  );

  const updateDivision = useCallback(
    (id: string, updates: { name?: string; headName?: string; headRank?: string }) => {
      const before = divisions.find((d) => d.id === id);
      setDivisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      if (updates.name) syncDivisionNames(id, updates.name);

      if (before) {
        if (updates.name && updates.name !== before.name) {
          recordHistory({
            category: 'organization',
            action: 'updated',
            entityType: 'division',
            entityId: id,
            entityName: updates.name,
            summary: `사업본부명 변경: ${before.name} → ${updates.name}`,
            before: { name: before.name },
            after: { name: updates.name },
          });
        }
        if (updates.headName) {
          recordHistory({
            category: 'organization',
            action: 'updated',
            entityType: 'division_head',
            entityId: id,
            entityName: updates.headName,
            summary: `본부장 등록/수정: ${updates.headName} (${updates.headRank ?? ''})`,
            after: { headName: updates.headName, headRank: updates.headRank },
          });
        }
      }
    },
    [divisions, syncDivisionNames, recordHistory],
  );

  const removeDivision = useCallback(
    (id: string): OrgMutationResult => {
      const target = divisions.find((d) => d.id === id);
      const hasTeams = teams.some((t) => t.divisionId === id);
      if (hasTeams) {
        return { ok: false, reason: '하위 팀이 있는 사업본부는 삭제할 수 없습니다.' };
      }
      const hasProjects = projects.some((p) => p.divisionId === id);
      if (hasProjects) {
        return { ok: false, reason: '연결된 프로젝트가 있는 사업본부는 삭제할 수 없습니다.' };
      }
      setDivisions((prev) => prev.filter((d) => d.id !== id));
      if (target) {
        recordHistory({
          category: 'organization',
          action: 'deleted',
          entityType: 'division',
          entityId: id,
          entityName: target.name,
          summary: `사업본부 삭제: ${target.name}`,
        });
      }
      return { ok: true };
    },
    [teams, projects, divisions, recordHistory],
  );

  const addTeam = useCallback(
    (divisionId: string, name: string) => {
      const team = { id: generateOrgId('team'), name, divisionId };
      setTeams((prev) => [...prev, team]);
      recordHistory({
        category: 'organization',
        action: 'created',
        entityType: 'team',
        entityId: team.id,
        entityName: name,
        summary: `팀 추가: ${name}`,
        metadata: { divisionId },
      });
    },
    [recordHistory],
  );

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
      const before = teams.find((t) => t.id === id);
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

      if (before) {
        if (updates.name && updates.name !== before.name) {
          recordHistory({
            category: 'organization',
            action: 'updated',
            entityType: 'team',
            entityId: id,
            entityName: updates.name,
            summary: `팀명 변경: ${before.name} → ${updates.name}`,
          });
        }
        if (updates.headName) {
          recordHistory({
            category: 'organization',
            action: 'updated',
            entityType: 'team_head',
            entityId: id,
            entityName: updates.headName,
            summary: `팀장 등록/수정: ${updates.headName} (${updates.headRank ?? ''})`,
            after: { headName: updates.headName, headRank: updates.headRank },
          });
        }
      }
    },
    [teams, divisions, recordHistory],
  );

  const removeTeam = useCallback(
    (id: string): OrgMutationResult => {
      const target = teams.find((t) => t.id === id);
      const hasMembers = employees.some((e) => e.teamId === id);
      if (hasMembers) {
        return { ok: false, reason: '구성원이 있는 팀은 삭제할 수 없습니다.' };
      }
      const hasProjects = projects.some((p) => p.teamId === id);
      if (hasProjects) {
        return { ok: false, reason: '연결된 프로젝트가 있는 팀은 삭제할 수 없습니다.' };
      }
      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (target) {
        recordHistory({
          category: 'organization',
          action: 'deleted',
          entityType: 'team',
          entityId: id,
          entityName: target.name,
          summary: `팀 삭제: ${target.name}`,
        });
      }
      return { ok: true };
    },
    [employees, projects, teams, recordHistory],
  );

  const addEmployee = useCallback(
    (teamId: string, name: string, roleTitle: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      const division = divisions.find((d) => d.id === team.divisionId);
      const employee: Employee = {
        id: generateOrgId('emp'),
        name,
        role: roleTitle,
        teamId,
        teamName: team.name,
        divisionId: team.divisionId,
        divisionName: division?.name ?? '',
      };
      setEmployees((prev) => [...prev, employee]);
      setProjects((prev) =>
        addEmployeeToTeamProjects(prev, projectTeamAllocations, teamId, employee.id),
      );
      recordHistory({
        category: 'organization',
        action: 'created',
        entityType: 'employee',
        entityId: employee.id,
        entityName: name,
        summary: `팀원 등록: ${name} (${roleTitle}) · ${team.name}`,
        after: { role: roleTitle, teamName: team.name, divisionName: division?.name },
        metadata: { teamId, divisionId: team.divisionId },
      });
    },
    [teams, divisions, projectTeamAllocations, recordHistory],
  );

  const updateEmployee = useCallback(
    (id: string, updates: Partial<Pick<Employee, 'name' | 'role' | 'teamId'>>) => {
      const before = employees.find((e) => e.id === id);
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const nextTeamId = updates.teamId ?? e.teamId;
          const team = teams.find((t) => t.id === nextTeamId);
          const division = team ? divisions.find((d) => d.id === team.divisionId) : undefined;
          return {
            ...e,
            ...updates,
            name: updates.name ?? e.name,
            role: updates.role ?? e.role,
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
      if (updates.teamId && updates.teamId !== before?.teamId) {
        setProjects((prev) =>
          addEmployeeToTeamProjects(prev, projectTeamAllocations, updates.teamId!, id),
        );
      }
      if (before) {
        recordHistory({
          category: 'organization',
          action: 'updated',
          entityType: 'employee',
          entityId: id,
          entityName: updates.name ?? before.name,
          summary: `팀원 수정: ${before.name} → ${updates.name ?? before.name}`,
          before: { name: before.name, role: before.role },
          after: { name: updates.name ?? before.name, role: updates.role ?? before.role },
        });
      }
    },
    [employees, teams, divisions, projectTeamAllocations, recordHistory],
  );

  const removeEmployee = useCallback(
    (id: string): OrgMutationResult => {
      const target = employees.find((e) => e.id === id);

      setProjects((prev) =>
        prev.map((project) => {
          if (project.pmId !== id && !project.participantIds.includes(id)) {
            return project;
          }
          const participantIds = project.participantIds.filter((p) => p !== id);
          const pmId = project.pmId === id ? (participantIds[0] ?? '') : project.pmId;
          return { ...project, pmId, participantIds };
        }),
      );

      setAllocations((prev) =>
        prev.map((allocation) => ({
          ...allocation,
          bid: allocation.bid.filter((entry) => entry.employeeId !== id),
          design: allocation.design.filter((entry) => entry.employeeId !== id),
          production: allocation.production.filter((entry) => entry.employeeId !== id),
        })),
      );

      setEmployees((prev) => prev.filter((e) => e.id !== id));

      if (target) {
        recordHistory({
          category: 'organization',
          action: 'deleted',
          entityType: 'employee',
          entityId: id,
          entityName: target.name,
          summary: `팀원 삭제: ${target.name} · ${target.teamName}`,
          before: { name: target.name, role: target.role },
        });
      }
      return { ok: true };
    },
    [employees, recordHistory],
  );

  const applyProjectUpdate = useCallback(
    (id: string, updates: Partial<Project>): { before: Project; merged: Project } | null => {
      let result: { before: Project; merged: Project } | null = null;

      setProjects((prev) => {
        const before = prev.find((p) => p.id === id);
        if (!before) return prev;

        const divisionId = updates.divisionId ?? before.divisionId;
        const teamId = updates.teamId ?? before.teamId;
        const { divisionName, teamName } = resolveProjectOrgNames(
          divisionId,
          teamId,
          divisions,
          teams,
        );
        const teamChanged = teamId !== before.teamId;
        const pmId = updates.pmId ?? before.pmId;
        const participantIds = teamChanged
          ? collectTeamParticipantIds(teamId, pmId, employees)
          : (updates.participantIds ?? before.participantIds);

        const merged: Project = {
          ...before,
          ...updates,
          divisionId,
          teamId,
          divisionName,
          teamName,
          pmId,
          participantIds,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        result = { before, merged };

        if (teamChanged) {
          setProjectTeamAllocations((pta) =>
            syncProjectTeamAllocationEntry(
              pta,
              id,
              teamId,
              teamName,
              new Date().toISOString(),
            ),
          );
        }

        return prev.map((p) => (p.id === id ? merged : p));
      });

      return result;
    },
    [divisions, teams, employees],
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Project>) => {
      const applied = applyProjectUpdate(id, updates);
      if (!applied) return;

      const { before, merged } = applied;

      const contractChanged =
        before.contractAmount !== merged.contractAmount ||
        before.startDate !== merged.startDate ||
        before.endDate !== merged.endDate;

      recordHistory({
        category: 'project',
        action: 'updated',
        entityType: 'project',
        entityId: id,
        entityName: before.name,
        summary: contractChanged
          ? `계약 정보 오류 수정: ${before.name}`
          : `프로젝트 수정: ${before.name}`,
        before: {
          status: before.status,
          contractAmount: before.contractAmount,
          startDate: before.startDate,
          endDate: before.endDate,
        },
        after: {
          status: merged.status,
          contractAmount: merged.contractAmount,
          startDate: merged.startDate,
          endDate: merged.endDate,
        },
        metadata: {
          changeKind: contractChanged ? 'correction' : 'general',
          excludedFromAnalysis: contractChanged ? true : undefined,
        },
      });
    },
    [applyProjectUpdate, recordHistory],
  );

  const saveContractAmendment = useCallback(
    (
      projectId: string,
      params: {
        sequence: AmendmentSequence;
        contractAmount?: number;
        startDate: string;
        endDate?: string;
        generalUpdates?: Partial<Project>;
      },
    ): { ok: true } | { ok: false; reason: string } => {
      const existing = getAmendmentsForProject(contractAmendments, projectId);
      if (!canRegisterAmendmentSequence(existing, params.sequence)) {
        return { ok: false, reason: '등록할 수 없는 변경 차수입니다.' };
      }

      const now = new Date().toISOString();
      const amendment: ContractAmendment = {
        id: `cam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        projectId,
        sequence: params.sequence,
        contractAmount: params.contractAmount,
        startDate: params.startDate,
        endDate: params.endDate,
        registeredBy: roleConfig.userId,
        registeredByName: roleConfig.userName,
        registeredAt: now,
      };

      const nextAmendments = [
        ...existing.filter((a) => a.sequence !== params.sequence),
        amendment,
      ].sort((a, b) => a.sequence - b.sequence);

      setContractAmendments((prev) => [
        ...prev.filter((a) => a.projectId !== projectId),
        ...nextAmendments,
      ]);

      let baselineSnapshot: ContractSnapshot | null = null;
      let projectName = '';

      setProjects((prev) => {
        const project = prev.find((p) => p.id === projectId);
        if (project) {
          projectName = project.name;
          baselineSnapshot = getProjectBaseline(project);
        }
        return prev;
      });

      if (!baselineSnapshot || !projectName) {
        return { ok: false, reason: '프로젝트를 찾을 수 없습니다.' };
      }

      const effective = getEffectiveContract(baselineSnapshot, nextAmendments);
      applyProjectUpdate(projectId, {
        ...params.generalUpdates,
        contractAmount: effective.contractAmount,
        startDate: effective.startDate,
        endDate: effective.endDate,
      });

      recordHistory({
        category: 'project',
        action: 'updated',
        entityType: 'contract_amendment',
        entityId: amendment.id,
        entityName: projectName,
        summary: `변경 ${params.sequence}차: ${projectName}`,
        after: {
          sequence: params.sequence,
          contractAmount: params.contractAmount,
          startDate: params.startDate,
          endDate: params.endDate,
        },
        metadata: {
          changeKind: 'amendment',
          amendmentSequence: params.sequence,
          projectId,
        },
      });

      return { ok: true };
    },
    [contractAmendments, roleConfig.userId, roleConfig.userName, applyProjectUpdate, recordHistory],
  );

  const saveInitialContract = useCallback(
    (
      projectId: string,
      params: {
        contractAmount?: number;
        startDate: string;
        endDate?: string;
      },
      generalUpdates?: Partial<Project>,
    ) => {
      let projectName = '';
      let hasProject = false;

      setProjects((prev) => {
        const project = prev.find((p) => p.id === projectId);
        if (project) {
          hasProject = true;
          projectName = project.name;
        }
        return prev;
      });

      if (!hasProject) return;

      const initialContract: ContractSnapshot = {
        contractAmount: params.contractAmount,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      const amendments = getAmendmentsForProject(contractAmendments, projectId);
      const contractUpdates =
        amendments.length === 0
          ? {
              contractAmount: params.contractAmount,
              startDate: params.startDate,
              endDate: params.endDate,
            }
          : {};

      applyProjectUpdate(projectId, {
        ...generalUpdates,
        ...contractUpdates,
        initialContract,
      });

      recordHistory({
        category: 'project',
        action: 'updated',
        entityType: 'initial_contract',
        entityId: projectId,
        entityName: projectName,
        summary: `최초 계약 수정: ${projectName}`,
        after: { ...initialContract },
        metadata: { changeKind: 'initial_contract', projectId },
      });
    },
    [contractAmendments, applyProjectUpdate, recordHistory],
  );

  const syncPPM = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    recordHistory({
      category: 'project',
      action: 'saved',
      entityType: 'ppm_sync',
      summary: 'PPM(DB) 동기화 실행',
    });
  }, [recordHistory]);

  const saveAllocation = useCallback(
    (
      projectId: string,
      track: 'bid' | 'design' | 'production',
      entries: AllocationEntry[],
    ) => {
      const project = projects.find((p) => p.id === projectId);
      setAllocations((prev) => {
        const existing = prev.find((a) => a.projectId === projectId);
        const now = new Date().toISOString();

        if (existing) {
          return prev.map((a) =>
            a.projectId === projectId ? { ...a, [track]: entries, updatedAt: now } : a,
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

      if (project) {
        for (const entry of entries) {
          recordHistory({
            category: 'allocation',
            action: 'saved',
            entityType: 'allocation_entry',
            entityId: entry.employeeId,
            entityName: entry.employeeName,
            summary: `인력 배분: ${project.name} · ${track} · ${entry.employeeName} ${entry.ratio}%`,
            after: {
              employeeId: entry.employeeId,
              employeeName: entry.employeeName,
              ratio: entry.ratio,
              track,
              projectId,
              projectName: project.name,
            },
            metadata: {
              divisionId: project.divisionId,
              divisionName: project.divisionName,
              teamId: project.teamId,
              teamName: project.teamName,
            },
          });
        }
      }
    },
    [projects, recordHistory],
  );

  const saveProjectTeamAllocation = useCallback(
    (projectId: string, entries: TeamAllocationEntry[]) => {
      const project = projects.find((p) => p.id === projectId);
      const now = new Date().toISOString();

      setProjectTeamAllocations((prev) => {
        const existing = prev.find((a) => a.projectId === projectId);
        if (existing) {
          return prev.map((a) =>
            a.projectId === projectId ? { ...a, teams: entries, updatedAt: now } : a,
          );
        }
        return [...prev, { projectId, teams: entries, updatedAt: now }];
      });

      const primaryTeam = [...entries].sort((a, b) => b.ratio - a.ratio)[0];
      if (project && primaryTeam) {
        const participantIds = new Set<string>();
        for (const entry of entries) {
          for (const employee of employees.filter((e) => e.teamId === entry.teamId)) {
            participantIds.add(employee.id);
          }
        }

        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  teamId: primaryTeam.teamId,
                  teamName: primaryTeam.teamName,
                  participantIds: [...participantIds],
                  updatedAt: now.slice(0, 10),
                }
              : p,
          ),
        );

        for (const entry of entries) {
          recordHistory({
            category: 'project',
            action: 'saved',
            entityType: 'project_team_allocation',
            entityId: entry.teamId,
            entityName: entry.teamName,
            summary: `프로젝트 팀 배분: ${project.name} · ${entry.teamName} ${entry.ratio}%`,
            after: {
              teamId: entry.teamId,
              teamName: entry.teamName,
              ratio: entry.ratio,
              projectId,
              projectName: project.name,
            },
            metadata: {
              divisionId: project.divisionId,
              divisionName: project.divisionName,
            },
          });
        }
      }
    },
    [projects, employees, recordHistory],
  );

  const getAllocationForProject = useCallback(
    (projectId: string) => allocations.find((a) => a.projectId === projectId),
    [allocations],
  );

  const getProjectTeamAllocationForProject = useCallback(
    (projectId: string) => projectTeamAllocations.find((a) => a.projectId === projectId),
    [projectTeamAllocations],
  );

  const value: AppContextValue = {
    role,
    roleConfig,
    permissions,
    executiveOffice,
    divisions,
    teams,
    employees,
    projects,
    visibleProjects,
    allocations,
    projectTeamAllocations,
    contractAmendments,
    budget,
    riskScenario,
    contributionCards,
    historyEvents,
    setRole,
    addExecutiveAdmin,
    removeExecutiveAdmin,
    updateExecutiveAdmin,
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
    saveContractAmendment,
    saveInitialContract,
    syncPPM,
    saveAllocation,
    saveProjectTeamAllocation,
    setRiskScenario,
    getAllocationForProject,
    getProjectTeamAllocationForProject,
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
