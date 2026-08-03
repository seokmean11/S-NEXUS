/**
 * orgPhoneDirectory202608.json → 계열사 제외 후 .ts 재생성
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const AFFILIATE_DIVISION_PATTERN = /시공문화|아이스크림미디어/i;
const AFFILIATE_TEAM_PATTERN = /시공문화|아이스크림미디어|^경영관리실$/i;
const AFFILIATE_EMPLOYEE_NAMES = new Set([
  '허주환', '현준우', '김형준', '장재영', '문희아', '윤지예', '우해준', '이안나', '이두연',
  '김효진', '노영준', '이성준', '한정화', '박재용', '이영미',   '이정수', '최현규',
]);

function filterAffiliateOrg(org) {
  const excludedDivisionIds = new Set(
    org.divisions.filter((d) => AFFILIATE_DIVISION_PATTERN.test(d.name)).map((d) => d.id),
  );
  const excludedTeamIds = new Set(
    org.teams
      .filter((t) => excludedDivisionIds.has(t.divisionId) || AFFILIATE_TEAM_PATTERN.test(t.name))
      .map((t) => t.id),
  );
  const employees = org.employees.filter(
    (e) =>
      !excludedDivisionIds.has(e.divisionId) &&
      !excludedTeamIds.has(e.teamId) &&
      !AFFILIATE_EMPLOYEE_NAMES.has(e.name),
  );
  const teams = org.teams.filter((t) => !excludedTeamIds.has(t.id));
  const divisions = org.divisions.filter((d) => !excludedDivisionIds.has(d.id));
  const admins = (org.executiveOffice.admins ?? []).filter((a) => !AFFILIATE_EMPLOYEE_NAMES.has(a.name));
  return {
    ...org,
    executiveOffice: { admins },
    divisions,
    teams,
    employees,
    stats: {
      divisions: divisions.length,
      teams: teams.length,
      employees: employees.length,
      executives: admins.length,
    },
  };
}

const rawPath = path.join(root, 'src/data/orgPhoneDirectory202608.raw.json');
const jsonPath = path.join(root, 'src/data/orgPhoneDirectory202608.json');
const tsPath = path.join(root, 'src/data/orgPhoneDirectory202608.ts');

let source;
if (fs.existsSync(rawPath)) {
  source = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
} else {
  source = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  fs.writeFileSync(rawPath, JSON.stringify(source, null, 2), 'utf8');
}

const filtered = filterAffiliateOrg(source);
filtered.generatedAt = new Date().toISOString();
filtered.source = '내선전화표(2026.08, 계열사 제외)';

fs.writeFileSync(jsonPath, JSON.stringify(filtered, null, 2), 'utf8');

const meta = {
  source: filtered.source,
  generatedAt: filtered.generatedAt,
  parseVersion: 3,
  stats: filtered.stats,
};

const ts = `/* eslint-disable */
/** Auto-generated from 내선전화표(2026.08) — affiliate orgs excluded */
import type { Division, Employee, ExecutiveOffice, Team } from '@/types';

export const PHONE_DIRECTORY_ORG_META = ${JSON.stringify(meta, null, 2)} as const;

export const PHONE_DIRECTORY_EXECUTIVE_OFFICE: ExecutiveOffice = ${JSON.stringify(filtered.executiveOffice, null, 2)};

export const PHONE_DIRECTORY_DIVISIONS: Division[] = ${JSON.stringify(filtered.divisions, null, 2)};

export const PHONE_DIRECTORY_TEAMS: Team[] = ${JSON.stringify(filtered.teams, null, 2)};

export const PHONE_DIRECTORY_EMPLOYEES: Employee[] = ${JSON.stringify(filtered.employees, null, 2)};
`;
fs.writeFileSync(tsPath, ts, 'utf8');

console.log('Before:', source.stats ?? { employees: source.employees.length });
console.log('After:', filtered.stats);
console.log('Removed employees:', (source.employees?.length ?? 0) - filtered.employees.length);
