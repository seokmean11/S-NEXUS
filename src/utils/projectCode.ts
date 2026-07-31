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
  if (Number.isNaN(year) || middleSeq < 1 || Number.isNaN(phaseSeq)) return null;

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

/** 부분 입력 중에도 사업본부·상태를 실시간 표시 */
export function deriveProjectFieldsFromPartialCode(
  code: string,
  divisions: Division[],
): {
  division: Division | null;
  divisionName: string;
  status: ProjectStatus | null;
  statusLabel: string;
} {
  const complete = deriveProjectFieldsFromCode(code, divisions);
  if (complete) {
    return {
      division: complete.division,
      divisionName: complete.divisionName,
      status: complete.status,
      statusLabel: complete.status,
    };
  }

  const { middle, last } = splitProjectCodeSegments(code);
  let division: Division | null = null;
  let divisionName = '';
  let status: ProjectStatus | null = null;
  let statusLabel = '';

  if (middle.length >= 1) {
    const category = middle[0] as BusinessCategoryDigit;
    if (['1', '2', '3', '4'].includes(category)) {
      division = resolveDivisionForCategory(category, divisions);
      divisionName = division?.name ?? getIntendedDivisionName(category);
    }
  }

  if (last.length >= 1) {
    const phase = last[0] as PhaseDigit;
    if (['1', '2', '3'].includes(phase)) {
      status = getStatusFromPhase(phase);
      statusLabel = status;
    }
  }

  return { division, divisionName, status, statusLabel };
}

export function splitProjectCodeSegments(code: string): {
  year: string;
  middle: string;
  last: string;
} {
  if (code.includes('-')) {
    const [yearPart = '', middlePart = '', lastPart = ''] = code.split('-');
    return {
      year: yearPart.replace(/\D/g, '').slice(0, 4),
      middle: middlePart.replace(/\D/g, '').slice(0, 4),
      last: lastPart.replace(/\D/g, '').slice(0, 2),
    };
  }

  const digits = code.replace(/\D/g, '').slice(0, 10);
  return {
    year: digits.slice(0, 4),
    middle: digits.slice(4, 8),
    last: digits.slice(8, 10),
  };
}

export function joinProjectCodeSegments(parts: {
  year: string;
  middle: string;
  last: string;
}): string {
  const year = parts.year.replace(/\D/g, '').slice(0, 4);
  const middle = parts.middle.replace(/\D/g, '').slice(0, 4);
  const last = parts.last.replace(/\D/g, '').slice(0, 2);

  if (!year && !middle && !last) return '';
  if (middle || last) {
    if (last) return `${year}-${middle}-${last}`;
    return `${year}-${middle}`;
  }
  return year;
}

const PROJECT_CODE_SLOT_CURSORS = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11] as const;
export const PROJECT_CODE_SLOT_COUNT = 10;

export function getProjectCodeDisplay(value: string): string {
  return joinProjectCodeSegments(splitProjectCodeSegments(value));
}

export function getProjectCodeDigitIndices(display: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < display.length && indices.length < PROJECT_CODE_SLOT_COUNT; i++) {
    if (/\d/.test(display[i])) indices.push(i);
  }
  return indices;
}

export function getProjectCodeSlotFromCursor(value: string, cursor: number): number {
  const display = getProjectCodeDisplay(value);
  if (!display) return 0;

  const indices = getProjectCodeDigitIndices(display);
  for (let slot = 0; slot < indices.length; slot++) {
    if (cursor <= indices[slot]) return slot;
  }

  if (cursor <= 4) return Math.min(3, indices.length);
  if (cursor <= 9) return cursor <= 5 ? 4 : cursor <= 8 ? 7 : 5;
  return cursor <= 10 ? 8 : 9;
}

export function getProjectCodeCursorForSlot(value: string, slot: number): number {
  const display = getProjectCodeDisplay(value);
  const indices = getProjectCodeDigitIndices(display);
  if (slot < indices.length) return indices[slot];

  const parts = splitProjectCodeSegments(value);
  if (slot < 4) return Math.min(slot, display.length);
  if (parts.year.length < 4) return display.length;
  if (slot <= 7) return PROJECT_CODE_SLOT_CURSORS[slot];
  if (parts.middle.length < 4) return display.length;
  return PROJECT_CODE_SLOT_CURSORS[slot];
}

export function setProjectCodeDigitAtSlot(value: string, slot: number, digit: string): string {
  const parts = splitProjectCodeSegments(value);
  const seg = slot < 4 ? 'year' : slot < 8 ? 'middle' : 'last';
  const localIdx = slot < 4 ? slot : slot < 8 ? slot - 4 : slot - 8;
  const maxLen = seg === 'year' ? 4 : seg === 'middle' ? 4 : 2;
  const chars = parts[seg].split('');

  if (localIdx < chars.length) chars[localIdx] = digit;
  else {
    while (chars.length < localIdx) chars.push('0');
    chars.push(digit);
  }

  parts[seg] = chars.join('').slice(0, maxLen);
  return joinProjectCodeSegments(parts);
}

export function clearProjectCodeDigitAtSlot(value: string, slot: number): string {
  const parts = splitProjectCodeSegments(value);
  if (slot < 4) parts.year = parts.year.slice(0, slot) + parts.year.slice(slot + 1);
  else if (slot < 8) {
    const i = slot - 4;
    parts.middle = parts.middle.slice(0, i) + parts.middle.slice(i + 1);
  } else {
    const i = slot - 8;
    parts.last = parts.last.slice(0, i) + parts.last.slice(i + 1);
  }
  return joinProjectCodeSegments(parts);
}

export function applyProjectCodePaste(raw: string): string {
  return joinProjectCodeSegments(splitProjectCodeSegments(formatProjectCode(raw)));
}

/** 입력 중·완료 후 코드 유효성 검사. 문제 없으면 null */
export function validateProjectCodeInput(code: string, divisions: Division[]): string | null {
  const { year, middle, last } = splitProjectCodeSegments(code);
  const digitCount = `${year}${middle}${last}`.replace(/\D/g, '').length;

  if (digitCount === 0) return null;

  if (year.length === 4) {
    const yearNum = Number(year);
    if (Number.isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return '연도는 2000~2100 사이 숫자 4자리여야 합니다.';
    }
  }

  if (middle.length >= 1) {
    const category = middle[0];
    if (!['1', '2', '3', '4'].includes(category)) {
      return '사업분류는 1(전시), 2(뉴미디어), 3(해외), 4(인테리어)만 입력할 수 있습니다.';
    }
  }

  if (last.length >= 1) {
    const phase = last[0];
    if (!['1', '2', '3'].includes(phase)) {
      return '마지막 2자리 중 첫째 자리는 1(공모), 2(설계), 3(제작)만 입력할 수 있습니다.';
    }
  }

  if (digitCount === 10) {
    if (last.length !== 2) {
      return '마지막 단계 코드는 숫자 2자리를 입력해 주세요.';
    }

    const parsed = parseProjectCode(code);
    if (!parsed) {
      return '프로젝트 코드 형식이 올바르지 않습니다. (사업 일련번호는 1 이상)';
    }

    const division = resolveDivisionForCategory(parsed.businessCategory, divisions);
    if (!division) {
      return `코드 분류에 해당하는 "${getIntendedDivisionName(parsed.businessCategory)}"가 조직관리에 없습니다.`;
    }
  }

  return null;
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
