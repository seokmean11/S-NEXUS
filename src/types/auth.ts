import type { PersonnelMenuPermissions } from '@/types/menuPermissions';
import type { PersonnelRow } from '@/utils/personnelSearch';

export const DEFAULT_LOGIN_PIN = '1111';

export interface PersonnelAuthRecord {
  pin: string;
  pinChanged: boolean;
  /** employee.menuPermissions와 동기화 — 서버 org state 유실 시 로그인 메뉴 권한 복원용 */
  menuPermissions?: PersonnelMenuPermissions;
}

export type PersonnelAuthMap = Record<string, PersonnelAuthRecord>;

export interface AuthSession {
  personId: string;
  personKind: PersonnelRow['kind'];
  name: string;
  loggedInAt: string;
}

export interface LoginResult {
  ok: true;
  session: AuthSession;
  mustChangePassword: boolean;
  person: PersonnelRow;
}

export interface LoginFailure {
  ok: false;
  message: string;
}
