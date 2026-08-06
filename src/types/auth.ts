import type { PersonnelRow } from '@/utils/personnelSearch';

export const DEFAULT_LOGIN_PIN = '1111';

export interface PersonnelAuthRecord {
  pin: string;
  pinChanged: boolean;
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
