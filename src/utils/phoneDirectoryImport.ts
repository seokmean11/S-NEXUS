import type { Division, Employee, ExecutiveOffice, Team } from '@/types';
import {
  PHONE_DIRECTORY_DIVISIONS,
  PHONE_DIRECTORY_EMPLOYEES,
  PHONE_DIRECTORY_EXECUTIVE_OFFICE,
  PHONE_DIRECTORY_ORG_META,
  PHONE_DIRECTORY_TEAMS,
} from '@/data/orgPhoneDirectory202608';
import { filterAffiliateOrg } from '@/utils/orgAffiliateFilter';
import { applyOrgManualOverrides, ORG_MANUAL_OVERRIDE_VERSION } from '@/utils/orgManualOverrides';
import { ensureSafetyManagementOrg } from '@/utils/orgSafetyOffice';
import { ensureExecutiveOfficeOrg } from '@/utils/orgExecutiveOffice';
import { normalizeExecutiveOffice, saveOrgState, type StoredOrgState } from '@/utils/orgStorage';

export { PHONE_DIRECTORY_ORG_META };

/** PDF 좌표 기반 <>팀명-하위인원 파서 + 수동 보정 버전 */
export const PHONE_DIRECTORY_PARSE_VERSION = PHONE_DIRECTORY_ORG_META.parseVersion ?? 3;

export interface PhoneDirectoryOrgState {
  executiveOffice: ExecutiveOffice;
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
}

export function getPhoneDirectoryOrgState(): PhoneDirectoryOrgState {
  return ensureExecutiveOfficeOrg(
    ensureSafetyManagementOrg(
      applyOrgManualOverrides(
        filterAffiliateOrg({
          executiveOffice: normalizeExecutiveOffice(PHONE_DIRECTORY_EXECUTIVE_OFFICE),
          divisions: [...PHONE_DIRECTORY_DIVISIONS],
          teams: [...PHONE_DIRECTORY_TEAMS],
          employees: [...PHONE_DIRECTORY_EMPLOYEES],
        }),
      ),
    ),
  );
}

export function applyPhoneDirectoryOrg(): PhoneDirectoryOrgState {
  const org = getPhoneDirectoryOrgState();
  saveOrgState({
    executiveOffice: org.executiveOffice,
    divisions: org.divisions,
    teams: org.teams,
    employees: org.employees,
    parseVersion: PHONE_DIRECTORY_PARSE_VERSION,
    manualOverrideVersion: ORG_MANUAL_OVERRIDE_VERSION,
  });
  return org;
}

/** mock/소량 조직 데이터 여부 */
export function isLikelyMockOrg(saved: StoredOrgState | null): boolean {
  if (!saved) return true;
  return saved.employees.length <= 20;
}

export function shouldSeedPhoneDirectoryOrg(saved: StoredOrgState | null): boolean {
  if (!saved) return true;
  if (saved.employees.length <= 20) return true;
  // 공식 조직도(17개 팀) 미반영 시 재시드
  if (saved.teams.length < 17) return true;
  if (saved.parseVersion !== PHONE_DIRECTORY_PARSE_VERSION) return true;
  // 이전 파서 버그: 특정 팀에 인원 과다 쏠림
  const teamCounts = new Map<string, number>();
  for (const e of saved.employees) {
    teamCounts.set(e.teamId, (teamCounts.get(e.teamId) ?? 0) + 1);
  }
  if ([...teamCounts.values()].some((count) => count >= 50)) return true;
  return false;
}
