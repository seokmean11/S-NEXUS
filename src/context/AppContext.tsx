import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BUDGET_SCENARIOS,
  DEFAULT_BUDGET,
  INITIAL_ALLOCATIONS,
  INITIAL_PROJECTS,
  ROLE_CONFIGS,
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
  WebAccessRole,
  PersonnelPermissionLevel,
  PersonnelGradeLevel,
  PersonnelMenuPermissions,
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
  type StoredOrgState,
} from '@/utils/orgStorage';
import {
  buildContributionCards,
  filterProjectsByRole,
  generateOrgId,
  getPermissions,
} from '@/utils/permissions';
import { buildInitialAllocationHistory } from '@/utils/reportAnalytics';
import { mergeErpProjects } from '@/utils/erpProjectImport';
import {
  addEmployeeToTeamProjects,
  collectTeamParticipantIds,
  resolveProjectOrgNames,
  syncProjectTeamAllocationEntry,
  syncProjectTeamAllocationNames,
  syncProjectsWithOrg,
} from '@/utils/projectSync';
import {
  getPhoneDirectoryOrgState,
  PHONE_DIRECTORY_PARSE_VERSION,
  shouldSeedPhoneDirectoryOrg,
} from '@/utils/phoneDirectoryImport';
import { filterAffiliateOrg } from '@/utils/orgAffiliateFilter';
import { applyOrgManualOverrides, ORG_MANUAL_OVERRIDE_VERSION, shouldApplyOrgManualOverrides } from '@/utils/orgManualOverrides';
import { ensureSafetyManagementOrg } from '@/utils/orgSafetyOffice';
import { ensureExecutiveOfficeOrg } from '@/utils/orgExecutiveOffice';
import { inferAccessRoleFromEmployee } from '@/utils/webAccessRole';
import { resolvePersonOrgIds, resolvePersonAccessRole } from '@/utils/authPersonnel';
import {
  applyPlatformSuperAdminEmployees,
  isPlatformSuperAdminIdentity,
  PLATFORM_SUPER_ADMIN_NAME,
} from '@/utils/platformSuperAdmin';
import { webAccessRoleToSystemRole } from '@/utils/webAccessRole';
import {
  fetchNexusOrgMeta,
  fetchNexusOrgState,
  ORG_AUTO_REFRESH_INTERVAL_MS,
  saveNexusOrgState,
} from '@/services/nexusOrgApi';
import type { PersonnelAuthMap, PersonnelAuthRecord } from '@/types/auth';
import type { PersonnelRow } from '@/utils/personnelSearch';
import {
  applyPersonnelAuthToEmployees,
  applyPersonnelAuthToExecutives,
  backfillPersonnelAuthMenuPermissions,
  withPersonnelAuthMenuPermissions,
} from '@/utils/personnelAuthMenu';

type OrgMutationResult = { ok: true } | { ok: false; reason: string };

function withPlatformSuperAdminPolicies<T extends { employees: Employee[] }>(org: T): T {
  return { ...org, employees: applyPlatformSuperAdminEmployees(org.employees) };
}

function normalizeLoadedOrgState(saved: NonNullable<ReturnType<typeof loadOrgState>>) {
  const filtered = filterAffiliateOrg({
    executiveOffice: normalizeExecutiveOffice(saved.executiveOffice),
    divisions: saved.divisions,
    teams: saved.teams,
    employees: saved.employees,
  });

  if (!shouldApplyOrgManualOverrides(saved.manualOverrideVersion)) {
    return withPlatformSuperAdminPolicies(
      ensureExecutiveOfficeOrg(ensureSafetyManagementOrg(filtered)),
    );
  }

  return withPlatformSuperAdminPolicies(
    ensureExecutiveOfficeOrg(ensureSafetyManagementOrg(applyOrgManualOverrides(filtered))),
  );
}

function persistOrgStateIfNeeded(
  saved: NonNullable<ReturnType<typeof loadOrgState>>,
  org: ReturnType<typeof normalizeLoadedOrgState> & { personnelAuth?: PersonnelAuthMap },
) {
  const shouldPersistOverrideVersion = shouldApplyOrgManualOverrides(saved.manualOverrideVersion);
  const shouldRestoreParseVersion = saved.parseVersion == null;

  if (!shouldPersistOverrideVersion && !shouldRestoreParseVersion) {
    return;
  }

  saveOrgState({
    executiveOffice: org.executiveOffice,
    divisions: org.divisions,
    teams: org.teams,
    employees: org.employees,
    personnelAuth: org.personnelAuth,
    parseVersion: saved.parseVersion ?? PHONE_DIRECTORY_PARSE_VERSION,
    manualOverrideVersion: shouldPersistOverrideVersion
      ? ORG_MANUAL_OVERRIDE_VERSION
      : saved.manualOverrideVersion,
  });
}

function finalizeOrgAuthState(
  org: ReturnType<typeof normalizeLoadedOrgState> & { personnelAuth?: PersonnelAuthMap },
): ReturnType<typeof normalizeLoadedOrgState> & { personnelAuth: PersonnelAuthMap } {
  const personnelAuth = backfillPersonnelAuthMenuPermissions(
    org.employees,
    org.executiveOffice.admins ?? [],
    org.personnelAuth ?? {},
  );

  return {
    ...org,
    personnelAuth,
    employees: applyPersonnelAuthToEmployees(org.employees, personnelAuth),
    executiveOffice: {
      admins: applyPersonnelAuthToExecutives(org.executiveOffice.admins ?? [], personnelAuth),
    },
  };
}

function buildOrgStateFromStored(saved: StoredOrgState) {
  return finalizeOrgAuthState({
    ...normalizeLoadedOrgState(saved),
    personnelAuth: saved.personnelAuth ?? {},
  });
}

function createInitialOrgState() {
  try {
    repairStoredData();
    const saved = loadOrgState();
    if (saved && !shouldSeedPhoneDirectoryOrg(saved)) {
      const normalized = normalizeLoadedOrgState(saved);
      const withAuth = finalizeOrgAuthState({
        ...normalized,
        personnelAuth: saved.personnelAuth ?? {},
      });
      persistOrgStateIfNeeded(saved, withAuth);
      return withAuth;
    }
    if (saved && shouldSeedPhoneDirectoryOrg(saved)) {
      return { ...getPhoneDirectoryOrgState(), personnelAuth: saved.personnelAuth ?? {} };
    }
  } catch {
    // fall through to phone directory seed
  }

  return { ...getPhoneDirectoryOrgState(), personnelAuth: {} as PersonnelAuthMap };
}

function createInitialAppState(divisions: Division[]) {
  try {
    const saved = loadAppState();
    if (saved) {
      const projects = mergeErpProjects(divisions, saved.projects);
      return {
        ...saved,
        projects,
        projectTeamAllocations:
          saved.projectTeamAllocations ??
          buildInitialProjectTeamAllocations(projects),
        contractAmendments: saved.contractAmendments ?? [],
      };
    }
  } catch {
    // fall through to defaults
  }
  const projects = mergeErpProjects(divisions, INITIAL_PROJECTS);
  return {
    projects,
    allocations: INITIAL_ALLOCATIONS,
    projectTeamAllocations: buildInitialProjectTeamAllocations(projects),
    contractAmendments: [],
    historySeeded: false,
  };
}

interface AppContextValue {
  role: Role;
  roleConfig: RoleConfig;
  permissions: ReturnType<typeof getPermissions>;
  orgReady: boolean;
  personnelAuth: PersonnelAuthMap;
  authPerson: PersonnelRow | null;
  setAuthPerson: (person: PersonnelRow | null) => void;
  updatePersonnelAuth: (personId: string, record: PersonnelAuthRecord) => void;
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
  addExecutiveAdmin: (name: string, rank: string, accessRole?: WebAccessRole) => void;
  removeExecutiveAdmin: (id: string) => void;
  updateExecutiveAdmin: (
    id: string,
    updates: {
      name?: string;
      rank?: string;
      accessRole?: WebAccessRole;
      permissionLevel?: PersonnelPermissionLevel;
      position?: string;
      gradeLevel?: PersonnelGradeLevel;
      gradeRank?: string;
      divisionId?: string;
      teamId?: string;
    },
  ) => void;
  addDivision: (name: string) => string;
  updateDivision: (
    id: string,
    updates: {
      name?: string;
      headName?: string;
      headRank?: string;
      headPermissionLevel?: PersonnelPermissionLevel;
      headPosition?: string;
      headGradeLevel?: PersonnelGradeLevel;
      headGradeRank?: string;
    },
  ) => void;
  removeDivision: (id: string) => OrgMutationResult;
  addTeam: (divisionId: string, name: string) => string;
  updateTeam: (
    id: string,
    updates: {
      name?: string;
      divisionId?: string;
      headName?: string;
      headRank?: string;
      headPermissionLevel?: PersonnelPermissionLevel;
      headPosition?: string;
      headGradeLevel?: PersonnelGradeLevel;
      headGradeRank?: string;
    },
  ) => void;
  removeTeam: (id: string) => OrgMutationResult;
  addEmployee: (
    teamId: string,
    name: string,
    role: string,
    accessRole?: WebAccessRole,
  ) => string | undefined;
  updateEmployee: (
    id: string,
    updates: Partial<
      Pick<
        Employee,
        | 'name'
        | 'role'
        | 'teamId'
        | 'divisionId'
        | 'divisionName'
        | 'teamName'
        | 'accessRole'
        | 'gradeLevel'
        | 'gradeRank'
        | 'permissionLevel'
        | 'position'
        | 'menuPermissions'
      >
    >,
  ) => void;
  removeEmployee: (id: string) => OrgMutationResult;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  deleteContractAmendment: (
    projectId: string,
    amendmentId: string,
  ) => { ok: true } | { ok: false; reason: string };
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
  const orgStorageMeta = useMemo(() => {
    const saved = loadOrgState();
    return {
      parseVersion: saved?.parseVersion ?? PHONE_DIRECTORY_PARSE_VERSION,
      manualOverrideVersion: saved?.manualOverrideVersion ?? ORG_MANUAL_OVERRIDE_VERSION,
    };
  }, []);
  const initialApp = useMemo(
    () => createInitialAppState(initialOrg.divisions),
    [initialOrg.divisions],
  );

  const [role, setRole] = useState<Role>('team_member');
  const [authPerson, setAuthPerson] = useState<PersonnelRow | null>(null);
  const [personnelAuth, setPersonnelAuth] = useState<PersonnelAuthMap>(
    initialOrg.personnelAuth ?? {},
  );
  const [orgReady, setOrgReady] = useState(false);
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
  const remoteOrgUpdatedAtRef = useRef<string | null>(null);
  const lastLocalOrgSaveAtRef = useRef(0);

  const applyOrgStatePayload = useCallback((saved: StoredOrgState) => {
    const withAuth = buildOrgStateFromStored(saved);
    setExecutiveOffice(withAuth.executiveOffice);
    setDivisions(withAuth.divisions);
    setTeams(withAuth.teams);
    setEmployees(withAuth.employees);
    setPersonnelAuth(withAuth.personnelAuth);
  }, []);

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
    let cancelled = false;

    (async () => {
      const { state: serverState, meta } = await fetchNexusOrgState();
      if (cancelled) return;

      if (serverState) {
        applyOrgStatePayload(serverState);
        remoteOrgUpdatedAtRef.current = meta?.updatedAt ?? null;
      }

      setOrgReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyOrgStatePayload]);

  useEffect(() => {
    if (!orgReady) return undefined;

    const syncIfRemoteUpdated = async () => {
      if (Date.now() - lastLocalOrgSaveAtRef.current < 3000) return;

      const meta = await fetchNexusOrgMeta();
      if (!meta?.driveConfigured || !meta.updatedAt) return;
      if (meta.updatedAt === remoteOrgUpdatedAtRef.current) return;

      const { state: serverState, meta: nextMeta } = await fetchNexusOrgState();
      if (!serverState) return;

      applyOrgStatePayload(serverState);
      remoteOrgUpdatedAtRef.current = nextMeta?.updatedAt ?? meta.updatedAt;
    };

    const timer = window.setInterval(() => {
      void syncIfRemoteUpdated();
    }, ORG_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [applyOrgStatePayload, orgReady]);

  useEffect(() => {
    if (!orgReady) return;

    const payload = {
      executiveOffice,
      divisions,
      teams,
      employees,
      personnelAuth,
      parseVersion: orgStorageMeta.parseVersion,
      manualOverrideVersion: orgStorageMeta.manualOverrideVersion,
    };

    saveOrgState(payload);
    lastLocalOrgSaveAtRef.current = Date.now();
    void saveNexusOrgState(payload).then((meta) => {
      if (meta?.updatedAt) {
        remoteOrgUpdatedAtRef.current = meta.updatedAt;
      }
    });
  }, [
    executiveOffice,
    divisions,
    teams,
    employees,
    personnelAuth,
    orgStorageMeta,
    orgReady,
  ]);

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

  const updatePersonnelAuth = useCallback((personId: string, record: PersonnelAuthRecord) => {
    setPersonnelAuth((prev) => ({
      ...prev,
      [personId]: {
        ...withPersonnelAuthMenuPermissions(prev[personId], prev[personId]?.menuPermissions),
        ...record,
      },
    }));
  }, []);

  const clearPersonnelAuth = useCallback((personId: string) => {
    setPersonnelAuth((prev) => {
      if (!prev[personId]) return prev;
      const next = { ...prev };
      delete next[personId];
      return next;
    });
  }, []);

  const roleConfig = useMemo(() => {
    if (authPerson) {
      const accessRole = resolvePersonAccessRole(
        authPerson,
        employees,
        executiveOffice.admins ?? [],
      );
      const base = ROLE_CONFIGS.find((r) => r.id === webAccessRoleToSystemRole(accessRole))!;
      const orgIds = resolvePersonOrgIds(authPerson);
      return {
        ...base,
        userId: orgIds.userId,
        userName: authPerson.name,
        divisionId: orgIds.divisionId,
        teamId: orgIds.teamId,
      };
    }

    const base = ROLE_CONFIGS.find((r) => r.id === role)!;
    return base;
  }, [authPerson, role, employees, executiveOffice.admins]);

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
    (name: string, rank: string, accessRole: WebAccessRole = '경영진') => {
      const admin: ExecutiveAdmin = {
        id: generateOrgId('exec'),
        name,
        rank,
        accessRole,
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
      clearPersonnelAuth(id);
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
    [executiveOffice.admins, recordHistory, clearPersonnelAuth],
  );

  const updateExecutiveAdmin = useCallback(
    (
      id: string,
      updates: {
        name?: string;
        rank?: string;
        accessRole?: WebAccessRole;
        permissionLevel?: PersonnelPermissionLevel;
        position?: string;
        gradeLevel?: PersonnelGradeLevel;
        gradeRank?: string;
        divisionId?: string;
        teamId?: string;
        menuPermissions?: PersonnelMenuPermissions;
      },
    ) => {
      const before = executiveOffice.admins?.find((a) => a.id === id);
      setExecutiveOffice((prev) => ({
        admins: (prev.admins ?? []).map((a) => {
          if (a.id !== id) return a;
          return {
            ...a,
            ...updates,
            permissionLevel:
              'permissionLevel' in updates ? updates.permissionLevel : a.permissionLevel,
            menuPermissions: 'menuPermissions' in updates ? updates.menuPermissions : a.menuPermissions,
            position: 'position' in updates ? updates.position : a.position,
            gradeLevel: 'gradeLevel' in updates ? updates.gradeLevel : a.gradeLevel,
            gradeRank: 'gradeRank' in updates ? updates.gradeRank : a.gradeRank,
            divisionId: 'divisionId' in updates ? updates.divisionId : a.divisionId,
            teamId: 'teamId' in updates ? updates.teamId : a.teamId,
          };
        }),
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

      if ('menuPermissions' in updates) {
        setPersonnelAuth((prev) => ({
          ...prev,
          [id]: withPersonnelAuthMenuPermissions(prev[id], updates.menuPermissions),
        }));
      }
    },
    [executiveOffice.admins, recordHistory],
  );

  const createProject = useCallback(
    (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString().slice(0, 10);
      const { divisionName, teamName: orgTeamName } = resolveProjectOrgNames(
        project.divisionId,
        project.teamId,
        divisions,
        teams,
      );
      const teamName = orgTeamName || project.teamName;
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
      return division.id;
    },
    [recordHistory],
  );

  const updateDivision = useCallback(
    (
      id: string,
      updates: {
        name?: string;
        headName?: string;
        headRank?: string;
        headPermissionLevel?: PersonnelPermissionLevel;
        headPosition?: string;
        headGradeLevel?: PersonnelGradeLevel;
        headGradeRank?: string;
        headMenuPermissions?: PersonnelMenuPermissions;
      },
    ) => {
      const before = divisions.find((d) => d.id === id);
      setDivisions((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          return {
            ...d,
            ...updates,
            headPermissionLevel:
              'headPermissionLevel' in updates
                ? updates.headPermissionLevel
                : d.headPermissionLevel,
            headMenuPermissions:
              'headMenuPermissions' in updates ? updates.headMenuPermissions : d.headMenuPermissions,
            headPosition: 'headPosition' in updates ? updates.headPosition : d.headPosition,
            headGradeLevel: 'headGradeLevel' in updates ? updates.headGradeLevel : d.headGradeLevel,
            headGradeRank: 'headGradeRank' in updates ? updates.headGradeRank : d.headGradeRank,
          };
        }),
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
      return team.id;
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
        headPermissionLevel?: PersonnelPermissionLevel;
        headPosition?: string;
        headGradeLevel?: PersonnelGradeLevel;
        headGradeRank?: string;
        headMenuPermissions?: PersonnelMenuPermissions;
      },
    ) => {
      const before = teams.find((t) => t.id === id);
      setTeams((prev) => {
        const current = prev.find((t) => t.id === id);
        if (!current) return prev;

        const updated = {
          ...current,
          ...updates,
          headPermissionLevel:
            'headPermissionLevel' in updates
              ? updates.headPermissionLevel
              : current.headPermissionLevel,
          headMenuPermissions:
            'headMenuPermissions' in updates ? updates.headMenuPermissions : current.headMenuPermissions,
          headPosition: 'headPosition' in updates ? updates.headPosition : current.headPosition,
          headGradeLevel:
            'headGradeLevel' in updates ? updates.headGradeLevel : current.headGradeLevel,
          headGradeRank: 'headGradeRank' in updates ? updates.headGradeRank : current.headGradeRank,
        };
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
    (teamId: string, name: string, roleTitle: string, accessRole?: WebAccessRole): string | undefined => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return undefined;
      const division = divisions.find((d) => d.id === team.divisionId);
      const employee: Employee = {
        id: generateOrgId('emp'),
        name,
        role: roleTitle,
        accessRole: accessRole ?? inferAccessRoleFromEmployee({ id: '', role: roleTitle }),
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
      return employee.id;
    },
    [teams, divisions, projectTeamAllocations, recordHistory],
  );

  const updateEmployee = useCallback(
    (
      id: string,
      updates: Partial<
        Pick<
          Employee,
          | 'name'
          | 'role'
          | 'teamId'
          | 'divisionId'
          | 'divisionName'
          | 'teamName'
          | 'accessRole'
          | 'gradeLevel'
          | 'gradeRank'
          | 'permissionLevel'
          | 'position'
          | 'menuPermissions'
        >
      >,
    ) => {
      const before = employees.find((e) => e.id === id);
      const lockedSuperAdmin = before && isPlatformSuperAdminIdentity(before.name, before.id);
      let nextUpdates = { ...updates };

      if (lockedSuperAdmin) {
        nextUpdates = {
          ...nextUpdates,
          name: PLATFORM_SUPER_ADMIN_NAME,
          accessRole: '개발자',
        };
        delete nextUpdates.menuPermissions;
      }

      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;

          const nextName = lockedSuperAdmin ? PLATFORM_SUPER_ADMIN_NAME : (nextUpdates.name ?? e.name);
          const nextAccessRole = lockedSuperAdmin
            ? '개발자'
            : (nextUpdates.accessRole ?? e.accessRole);

          if ('teamId' in nextUpdates && !nextUpdates.teamId) {
            const nextDivisionId = nextUpdates.divisionId ?? e.divisionId;
            const division = divisions.find((d) => d.id === nextDivisionId);
            return {
              ...e,
              ...nextUpdates,
              name: nextName,
              role: nextUpdates.role ?? e.role,
              gradeLevel: 'gradeLevel' in nextUpdates ? nextUpdates.gradeLevel : e.gradeLevel,
              gradeRank: 'gradeRank' in nextUpdates ? nextUpdates.gradeRank : e.gradeRank,
              permissionLevel:
                'permissionLevel' in nextUpdates ? nextUpdates.permissionLevel : e.permissionLevel,
              menuPermissions: lockedSuperAdmin
                ? e.menuPermissions
                : 'menuPermissions' in nextUpdates
                  ? nextUpdates.menuPermissions
                  : e.menuPermissions,
              position: 'position' in nextUpdates ? nextUpdates.position : e.position,
              accessRole: nextAccessRole,
              teamId: '',
              teamName: '없음',
              divisionId: division?.id ?? nextDivisionId,
              divisionName: division?.name ?? e.divisionName,
            };
          }

          const nextTeamId = nextUpdates.teamId ?? e.teamId;
          const team = teams.find((t) => t.id === nextTeamId);
          const division = team
            ? divisions.find((d) => d.id === team.divisionId)
            : divisions.find((d) => d.id === (nextUpdates.divisionId ?? e.divisionId));
          return {
            ...e,
            ...nextUpdates,
            name: nextName,
            role: nextUpdates.role ?? e.role,
            gradeLevel: 'gradeLevel' in nextUpdates ? nextUpdates.gradeLevel : e.gradeLevel,
            gradeRank: 'gradeRank' in nextUpdates ? nextUpdates.gradeRank : e.gradeRank,
            permissionLevel:
              'permissionLevel' in nextUpdates ? nextUpdates.permissionLevel : e.permissionLevel,
            menuPermissions: lockedSuperAdmin
              ? e.menuPermissions
              : 'menuPermissions' in nextUpdates
                ? nextUpdates.menuPermissions
                : e.menuPermissions,
            position: 'position' in nextUpdates ? nextUpdates.position : e.position,
            accessRole: nextAccessRole,
            teamId: nextTeamId,
            teamName: team?.name ?? e.teamName,
            divisionId: team?.divisionId ?? division?.id ?? e.divisionId,
            divisionName: division?.name ?? e.divisionName,
          };
        }),
      );
      if (nextUpdates.name) {
        setAllocations((prev) =>
          prev.map((a) => ({
            ...a,
            bid: a.bid.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: nextUpdates.name! } : entry,
            ),
            design: a.design.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: nextUpdates.name! } : entry,
            ),
            production: a.production.map((entry) =>
              entry.employeeId === id ? { ...entry, employeeName: nextUpdates.name! } : entry,
            ),
          })),
        );
      }
      if (nextUpdates.teamId && nextUpdates.teamId !== before?.teamId) {
        setProjects((prev) =>
          addEmployeeToTeamProjects(prev, projectTeamAllocations, nextUpdates.teamId!, id),
        );
      }
      if (before) {
        recordHistory({
          category: 'organization',
          action: 'updated',
          entityType: 'employee',
          entityId: id,
          entityName: nextUpdates.name ?? before.name,
          summary: `팀원 수정: ${before.name} → ${nextUpdates.name ?? before.name}`,
          before: { name: before.name, role: before.role },
          after: { name: nextUpdates.name ?? before.name, role: nextUpdates.role ?? before.role },
        });
      }

      if ('menuPermissions' in nextUpdates && !lockedSuperAdmin) {
        setPersonnelAuth((prev) => ({
          ...prev,
          [id]: withPersonnelAuthMenuPermissions(prev[id], nextUpdates.menuPermissions),
        }));
      }
    },
    [employees, teams, divisions, projectTeamAllocations, recordHistory],
  );

  const removeEmployee = useCallback(
    (id: string): OrgMutationResult => {
      const target = employees.find((e) => e.id === id);
      if (target && isPlatformSuperAdminIdentity(target.name, target.id)) {
        return {
          ok: false,
          reason: '플랫폼 통합관리자(서석민)는 삭제할 수 없습니다.',
        };
      }

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
      clearPersonnelAuth(id);

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
    [employees, recordHistory, clearPersonnelAuth],
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

  const deleteProject = useCallback(
    (id: string) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;

      setProjects((prev) => prev.filter((p) => p.id !== id));
      setAllocations((prev) => prev.filter((a) => a.projectId !== id));
      setProjectTeamAllocations((prev) => prev.filter((a) => a.projectId !== id));
      setContractAmendments((prev) => prev.filter((a) => a.projectId !== id));

      recordHistory({
        category: 'project',
        action: 'deleted',
        entityType: 'project',
        entityId: id,
        entityName: target.name,
        summary: `프로젝트 삭제: ${target.name}`,
        before: {
          status: target.status,
          teamName: target.teamName,
          projectCode: target.projectCode,
        },
      });
    },
    [projects, recordHistory],
  );

  const deleteContractAmendment = useCallback(
    (
      projectId: string,
      amendmentId: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        return { ok: false, reason: '프로젝트를 찾을 수 없습니다.' };
      }

      const existing = getAmendmentsForProject(contractAmendments, projectId);
      const target = existing.find((a) => a.id === amendmentId);
      if (!target) {
        return { ok: false, reason: '삭제할 계약변경 이력을 찾을 수 없습니다.' };
      }

      const nextAmendments = existing.filter((a) => a.id !== amendmentId);
      setContractAmendments((prev) => [
        ...prev.filter((a) => a.projectId !== projectId),
        ...nextAmendments,
      ]);

      const baseline = getProjectBaseline(project);
      const effective = getEffectiveContract(baseline, nextAmendments);
      applyProjectUpdate(projectId, {
        contractAmount: effective.contractAmount,
        startDate: effective.startDate,
        endDate: effective.endDate,
      });

      recordHistory({
        category: 'project',
        action: 'deleted',
        entityType: 'contract_amendment',
        entityId: amendmentId,
        entityName: project.name,
        summary: `변경 ${target.sequence}차 삭제: ${project.name}`,
        before: {
          sequence: target.sequence,
          contractAmount: target.contractAmount,
          startDate: target.startDate,
          endDate: target.endDate,
        },
        metadata: {
          changeKind: 'amendment_delete',
          amendmentSequence: target.sequence,
          projectId,
        },
      });

      return { ok: true };
    },
    [projects, contractAmendments, applyProjectUpdate, recordHistory],
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
    orgReady,
    personnelAuth,
    authPerson,
    setAuthPerson,
    updatePersonnelAuth,
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
    deleteProject,
    deleteContractAmendment,
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
