import type { Division, Project, ProjectStatus } from '@/types';

/** 사업 분류 (중간 4자리 첫째 숫자) */
export type BusinessCategoryDigit = '1' | '2' | '3' | '4';

/** 업무 단계 (마지막 2자리 첫째 숫자) */
export type PhaseDigit = '1' | '2' | '3';

export const BUSINESS_CATEGORY_OPTIONS: { value: BusinessCategoryDigit; label: string }[] = [
  { value: '1', label: '전시' },
  { value: '2', label: '뉴미디어' },
  { value: '3', label: '해외' },
  { value: '4', label: '인테리어' },
];

export const PHASE_OPTIONS: { value: PhaseDigit; label: string }[] = [
  { value: '1', label: '공모' },
  { value: '2', label: '설계' },
  { value: '3', label: '제작' },
];

const BUSINESS_DIVISION_NAMES: Record<BusinessCategoryDigit, string> = {
  '1': '전시사업본부',
  '2': '뉴미디어사업본부',
  '3': '해외사업본부',
  '4': '인테리어사업본부',
};

export const GENERAL_PROJECT_TYPE_OPTIONS = [
  { value: '공공', label: '공공' },
  { value: '민간', label: '민간' },
] as const;

export const INTERIOR_PROJECT_TYPE_OPTIONS = [
  { value: '건축시설', label: '건축시설' },
  { value: '문화공간', label: '문화공간' },
  { value: '복합공간', label: '복합공간' },
  { value: '상업공간', label: '상업공간' },
  { value: '업무공간', label: '업무공간' },
  { value: '호텔및주거공간', label: '호텔및주거공간' },
] as const;

export function getProjectTypeOptions(
  category?: BusinessCategoryDigit | null,
): { value: string; label: string }[] {
  if (!category) return [];
  if (category === '4') return [...INTERIOR_PROJECT_TYPE_OPTIONS];
  if (category === '1' || category === '2' || category === '3') {
    return [...GENERAL_PROJECT_TYPE_OPTIONS];
  }
  return [];
}

export function isValidProjectTypeForCategory(
  category: BusinessCategoryDigit,
  projectType?: string,
): boolean {
  if (!projectType) return false;
  return getProjectTypeOptions(category).some((opt) => opt.value === projectType);
}

/** 프로젝트 코드 사업분류별 담당 팀 */
export const PROJECT_TEAM_NAMES: Record<BusinessCategoryDigit, readonly string[]> = {
  '1': ['전시디자인1', '전시디자인2', '전시컨설팅', 'CX디자인', '제작연출'],
  '2': ['문화기술연구소', '스튜디오스페이스타임'],
  '3': ['해외영업', '해외디자인'],
  '4': ['견적', '인테리어디자인', '사업1', '사업2', '사업3'],
};

export function toProjectTeamId(category: BusinessCategoryDigit, teamName: string): string {
  return `proj-team-${category}-${teamName}`;
}

export function getProjectTeamOptions(
  category?: BusinessCategoryDigit | null,
): { value: string; label: string }[] {
  if (!category) return [];
  return PROJECT_TEAM_NAMES[category].map((name) => ({
    value: toProjectTeamId(category, name),
    label: name,
  }));
}

export function resolveProjectTeamSelection(
  category: BusinessCategoryDigit | undefined,
  teamId?: string,
  teamName?: string,
): { value: string; label: string } | null {
  if (!category) return null;
  const options = getProjectTeamOptions(category);
  return (
    options.find((opt) => opt.value === teamId) ??
    options.find((opt) => opt.label === teamName) ??
    null
  );
}

export function isValidProjectTeamForCategory(
  category: BusinessCategoryDigit,
  teamId?: string,
): boolean {
  if (!teamId) return false;
  return getProjectTeamOptions(category).some((opt) => opt.value === teamId);
}

export interface ParsedProjectCode {
  year: number;
  businessCategory: BusinessCategoryDigit;
  middleSeq: number;
  phase: PhaseDigit;
  phaseSeq: number;
  formatted: string;
}

export function formatProjectCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

export function isValidProjectCode(code: string): boolean {
  return parseProjectCode(code) !== null;
}

export function normalizeProjectCode(code?: string): string | undefined {
  if (!code) return undefined;
  const formatted = formatProjectCode(code);
  return formatted.length > 0 ? formatted : undefined;
}

export function parseProjectCode(code?: string): ParsedProjectCode | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 10) return null;

  const year = Number(digits.slice(0, 4));
  const businessCategory = digits[4] as BusinessCategoryDigit;
  const middleSeq = Number(digits.slice(5, 8));
  const phase = digits[8] as PhaseDigit;
  const phaseSeq = Number(digits[9]);

  if (!['1', '2', '3', '4'].includes(businessCategory)) return null;
  if (!['1', '2', '3'].includes(phase)) return null;
  if (Number.isNaN(year) || middleSeq < 1 || phaseSeq < 1) return null;

  return {
    year,
    businessCategory,
    middleSeq,
    phase,
    phaseSeq,
    formatted: formatProjectCode(digits),
  };
}

export function getBusinessCategoryLabel(category: BusinessCategoryDigit): string {
  return BUSINESS_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

export function getPhaseLabel(phase: PhaseDigit): string {
  return PHASE_OPTIONS.find((o) => o.value === phase)?.label ?? phase;
}

export function getStatusFromPhase(phase: PhaseDigit): ProjectStatus {
  switch (phase) {
    case '1':
      return '공모';
    case '2':
      return '설계';
    case '3':
      return '제작';
  }
}

export function getPhaseFromStatus(status: ProjectStatus): PhaseDigit | null {
  switch (status) {
    case '공모':
      return '1';
    case '설계':
      return '2';
    case '제작':
      return '3';
    default:
      return null;
  }
}

export function resolveDivisionForCategory(
  category: BusinessCategoryDigit,
  divisions: Division[],
): Division | null {
  const targetName = BUSINESS_DIVISION_NAMES[category];
  return (
    divisions.find((d) => d.name === targetName) ??
    divisions.find((d) => d.name.includes(getBusinessCategoryLabel(category))) ??
    null
  );
}

export function getIntendedDivisionName(category: BusinessCategoryDigit): string {
  return BUSINESS_DIVISION_NAMES[category];
}

function nextMiddleSeq(
  year: number,
  category: BusinessCategoryDigit,
  projects: Project[],
  excludeProjectId?: string,
): number {
  const seqs = projects
    .filter((p) => p.id !== excludeProjectId)
    .map((p) => parseProjectCode(p.projectCode))
    .filter(
      (parsed): parsed is ParsedProjectCode =>
        !!parsed && parsed.year === year && parsed.businessCategory === category,
    )
    .map((parsed) => parsed.middleSeq);

  return (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
}

function nextPhaseSeq(
  year: number,
  category: BusinessCategoryDigit,
  phase: PhaseDigit,
  projects: Project[],
  excludeProjectId?: string,
): number {
  const seqs = projects
    .filter((p) => p.id !== excludeProjectId)
    .map((p) => parseProjectCode(p.projectCode))
    .filter(
      (parsed): parsed is ParsedProjectCode =>
        !!parsed &&
        parsed.year === year &&
        parsed.businessCategory === category &&
        parsed.phase === phase,
    )
    .map((parsed) => parsed.phaseSeq);

  return (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
}

export function generateProjectCode(params: {
  year: number;
  businessCategory: BusinessCategoryDigit;
  phase: PhaseDigit;
  projects: Project[];
  existingCode?: string;
  excludeProjectId?: string;
}): string {
  const { year, businessCategory, phase, projects, existingCode, excludeProjectId } = params;
  const parsedExisting = parseProjectCode(existingCode);

  if (
    parsedExisting &&
    parsedExisting.year === year &&
    parsedExisting.businessCategory === businessCategory &&
    parsedExisting.phase === phase
  ) {
    return parsedExisting.formatted;
  }

  const middleSeq =
    parsedExisting &&
    parsedExisting.year === year &&
    parsedExisting.businessCategory === businessCategory
      ? parsedExisting.middleSeq
      : nextMiddleSeq(year, businessCategory, projects, excludeProjectId);

  const phaseSeq = nextPhaseSeq(year, businessCategory, phase, projects, excludeProjectId);

  const middle = `${businessCategory}${String(middleSeq).padStart(3, '0')}`;
  const last = `${phase}${phaseSeq}`;
  return `${year}-${middle}-${last}`;
}

export function deriveProjectFieldsFromCode(
  code: string,
  divisions: Division[],
): {
  division: Division | null;
  divisionName: string;
  status: ProjectStatus;
} | null {
  const parsed = parseProjectCode(code);
  if (!parsed) return null;

  const division = resolveDivisionForCategory(parsed.businessCategory, divisions);
  return {
    division,
    divisionName: division?.name ?? getIntendedDivisionName(parsed.businessCategory),
    status: getStatusFromPhase(parsed.phase),
  };
}

/** 분석·리포트용 분류 정보 */
export function getProjectClassification(code?: string, projectType?: string) {
  const parsed = parseProjectCode(code);
  if (!parsed) return null;

  return {
    year: parsed.year,
    businessCategory: parsed.businessCategory,
    businessCategoryLabel: getBusinessCategoryLabel(parsed.businessCategory),
    phase: parsed.phase,
    phaseLabel: getPhaseLabel(parsed.phase),
    status: getStatusFromPhase(parsed.phase),
    divisionName: getIntendedDivisionName(parsed.businessCategory),
    projectType,
  };
}
