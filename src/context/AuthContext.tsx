import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import type { AuthSession } from '@/types/auth';
import { DEFAULT_LOGIN_PIN } from '@/types/auth';
import type { PersonnelMenuPermissionKey, PersonnelMenuPermissions } from '@/types/menuPermissions';
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from '@/utils/authStorage';
import { clearCompetitorAnalysisStorage } from '@/utils/competitorAnalysisStorage';
import {
  findPersonnelById,
  isDeveloperPerson,
  isValidLoginPin,
  resolvePersonAccessRole,
  validateLogin,
} from '@/utils/authPersonnel';
import {
  canAccessPathWithMenuPermissions,
  isMenuPermissionReadOnly,
  pathnameMenuReadOnly,
  pathnameToMenuPermissionKey,
} from '@/utils/menuAccess';
import { resolvePersonMenuPermissions } from '@/utils/personnelAuthMenu';
import { webAccessRoleToSystemRole } from '@/utils/webAccessRole';
import type { PersonnelRow } from '@/utils/personnelSearch';

interface AuthContextValue {
  session: AuthSession | null;
  authPerson: PersonnelRow | null;
  isAuthenticated: boolean;
  isDeveloper: boolean;
  orgReady: boolean;
  mustChangePassword: boolean;
  menuPermissions: PersonnelMenuPermissions | undefined;
  login: (name: string, pin: string) => string | null;
  logout: () => void;
  completePasswordChange: (newPin: string, confirmPin: string) => string | null;
  canAccessPath: (pathname: string) => boolean;
  canEditMenu: (key: PersonnelMenuPermissionKey) => boolean;
  isPathReadOnly: (pathname: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    executiveOffice,
    divisions,
    teams,
    employees,
    personnelAuth,
    orgReady,
    permissions,
    setAuthPerson,
    setRole,
    updatePersonnelAuth,
  } = useApp();

  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  const authPerson = useMemo(() => {
    if (!session) return null;
    return (
      findPersonnelById(
        session.personId,
        executiveOffice.admins ?? [],
        employees,
        divisions,
        teams,
      ) ?? null
    );
  }, [session, executiveOffice.admins, employees, divisions, teams]);

  const isDeveloper = useMemo(() => {
    if (!authPerson) return false;
    return isDeveloperPerson(authPerson, employees, executiveOffice.admins ?? []);
  }, [authPerson, employees, executiveOffice.admins]);

  const menuPermissions = useMemo(() => {
    if (!authPerson) return undefined;
    return resolvePersonMenuPermissions(
      authPerson.id,
      authPerson.menuPermissions,
      personnelAuth,
    );
  }, [authPerson, personnelAuth]);

  useEffect(() => {
    setAuthPerson(authPerson);
  }, [authPerson, setAuthPerson]);

  useEffect(() => {
    if (!session || !orgReady) return;
    if (!authPerson) {
      clearAuthSession();
      setSession(null);
      setMustChangePassword(false);
      setPendingPersonId(null);
      setAuthPerson(null);
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
      return;
    }

    const accessRole = resolvePersonAccessRole(
      authPerson,
      employees,
      executiveOffice.admins ?? [],
    );
    setRole(webAccessRoleToSystemRole(accessRole));
  }, [
    session,
    authPerson,
    orgReady,
    employees,
    executiveOffice.admins,
    setRole,
    setAuthPerson,
    navigate,
    location.pathname,
  ]);

  useEffect(() => {
    if (!session || mustChangePassword || !orgReady) return;
    if (location.pathname === '/login') {
      navigate('/', { replace: true });
      return;
    }
    if (!canAccessPathWithMenuPermissions(location.pathname, menuPermissions, isDeveloper, {
      canCreateProject: permissions.canCreateProject,
      canAccessAllocationForm: permissions.canAccessAllocationForm,
    })) {
      navigate('/', { replace: true });
    }
  }, [
    session,
    mustChangePassword,
    orgReady,
    location.pathname,
    menuPermissions,
    isDeveloper,
    permissions.canCreateProject,
    permissions.canAccessAllocationForm,
    navigate,
  ]);

  const login = useCallback(
    (name: string, pin: string): string | null => {
      const result = validateLogin(
        name,
        pin,
        personnelAuth,
        executiveOffice.admins ?? [],
        employees,
        divisions,
        teams,
      );
      if (!result.ok) return result.message;

      saveAuthSession(result.session);
      setSession(result.session);
      setAuthPerson(result.person);

      if (result.mustChangePassword) {
        setMustChangePassword(true);
        setPendingPersonId(result.person.id);
        return null;
      }

      setMustChangePassword(false);
      setPendingPersonId(null);
      return null;
    },
    [
      personnelAuth,
      executiveOffice.admins,
      employees,
      divisions,
      teams,
      setAuthPerson,
    ],
  );

  const logout = useCallback(() => {
    clearCompetitorAnalysisStorage();
    clearAuthSession();
    setSession(null);
    setAuthPerson(null);
    setMustChangePassword(false);
    setPendingPersonId(null);
    setRole('team_member');
    navigate('/login', { replace: true });
  }, [navigate, setAuthPerson, setRole]);

  const completePasswordChange = useCallback(
    (newPin: string, confirmPin: string): string | null => {
      const personId = pendingPersonId ?? session?.personId;
      if (!personId) return '비밀번호 변경 대상을 찾을 수 없습니다.';

      if (!isValidLoginPin(newPin)) {
        return '새 비밀번호는 4자리 숫자입니다.';
      }
      if (newPin === DEFAULT_LOGIN_PIN) {
        return '초기 비밀번호(1111)는 사용할 수 없습니다. 다른 번호를 입력해 주세요.';
      }
      if (newPin !== confirmPin) {
        return '새 비밀번호가 일치하지 않습니다.';
      }

      updatePersonnelAuth(personId, {
        pin: newPin,
        pinChanged: true,
        menuPermissions: personnelAuth[personId]?.menuPermissions,
      });
      setMustChangePassword(false);
      setPendingPersonId(null);
      navigate('/', { replace: true });
      return null;
    },
    [pendingPersonId, session?.personId, personnelAuth, updatePersonnelAuth, navigate],
  );

  const canAccessPath = useCallback(
    (pathname: string) =>
      canAccessPathWithMenuPermissions(pathname, menuPermissions, isDeveloper, {
        canCreateProject: permissions.canCreateProject,
        canAccessAllocationForm: permissions.canAccessAllocationForm,
      }),
    [
      menuPermissions,
      isDeveloper,
      permissions.canCreateProject,
      permissions.canAccessAllocationForm,
    ],
  );

  const canEditMenu = useCallback(
    (key: PersonnelMenuPermissionKey) => {
      if (isDeveloper) return true;
      if (!menuPermissions?.[key]) return false;
      return !isMenuPermissionReadOnly(menuPermissions, key);
    },
    [isDeveloper, menuPermissions],
  );

  const isPathReadOnly = useCallback(
    (pathname: string) => {
      if (isDeveloper) return false;
      return pathnameMenuReadOnly(pathname, menuPermissions);
    },
    [isDeveloper, menuPermissions],
  );

  const value = useMemo(
    (): AuthContextValue => ({
      session,
      authPerson,
      isAuthenticated: Boolean(session && authPerson && !mustChangePassword),
      isDeveloper,
      orgReady,
      mustChangePassword,
      menuPermissions,
      login,
      logout,
      completePasswordChange,
      canAccessPath,
      canEditMenu,
      isPathReadOnly,
    }),
    [
      session,
      authPerson,
      mustChangePassword,
      isDeveloper,
      orgReady,
      menuPermissions,
      login,
      logout,
      completePasswordChange,
      canAccessPath,
      canEditMenu,
      isPathReadOnly,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export { pathnameToMenuPermissionKey };
