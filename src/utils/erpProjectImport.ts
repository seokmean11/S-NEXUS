import type { Division, Project, ProjectType } from '@/types';
import rawErpData from '@/data/erpProjects20260731.raw.json';
import {
  deriveProjectFieldsFromCode,
  getProjectTeamOptions,
  isValidProjectCode,
  isValidProjectTypeForCategory,
  normalizeProjectCode,
  parseProjectCode,
  resolveProjectTeamSelection,
  type BusinessCategoryDigit,
} from '@/utils/projectCode';
import { snapshotFromProject } from '@/utils/contractChange';

export interface ErpRawRow {
  no?: number;
  projectCode?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  erpDivision?: string;
  erpType?: string;
  clientName?: string;
  teamName?: string;
  contractAmount?: number | null;
  marketScope?: string;
}

export interface ErpImportResult {
  projects: Project[];
  skipped: { row: ErpRawRow; reason: string }[];
  warnings: { projectCode: string; messages: string[] }[];
}

const TEAM_ALIASES: Record<string, string> = {
  해외사업실: '해외영업',
};

const INTERIOR_TYPE_MAP: Record<string, ProjectType> = {
  건축시설: '건축시설',
  문화공간: '문화공간',
  복합공간: '복합공간',
  상업공간: '상업공간',
  업무공간: '업무공간',
  호텔및주거공간: '호텔및주거공간',
  인테리어시설및디자인: '상업공간',
};

const PUBLIC_TYPE_KEYWORDS = [
  '과학관',
  '체험관',
  '박물관',
  '기념관',
  '전시관',
  '홍보관',
  '비상설',
  '엑스포',
  '테마파크',
  '보존환경',
  '미술관',
  '국제',
  '지역',
];

const PUBLIC_CLIENT_KEYWORDS = [
  '청',
  '부',
  '시',
  '군',
  '구',
  '공단',
  '재단',
  '원',
  '협회',
  '대학',
  '학교',
  '센터',
  '연구원',
  '법원',
  '의회',
  '문화재청',
  '해양수산부',
];

function normalizeTeamLabel(name?: string): string {
  if (!name) return '';
  let text = name.trim();
  if (text.endsWith('팀') && text.length > 1) {
    text = text.slice(0, -1);
  }
  return TEAM_ALIASES[text] ?? text;
}

function isPublicClient(clientName?: string): boolean {
  if (!clientName) return false;
  const text = clientName.trim();
  if (!text || text === '미등록거래처') return false;
  if (text.includes('(주)')) return false;
  return PUBLIC_CLIENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function inferGeneralProjectType(erpType?: string, clientName?: string): ProjectType {
  const typeText = erpType?.trim() ?? '';
  if (PUBLIC_TYPE_KEYWORDS.some((keyword) => typeText.includes(keyword))) {
    return '공공';
  }
  if (isPublicClient(clientName)) {
    return '공공';
  }
  return '민간';
}

function mapProjectType(
  category: BusinessCategoryDigit,
  erpType?: string,
  clientName?: string,
): ProjectType {
  if (category === '4') {
    const mapped = erpType ? INTERIOR_TYPE_MAP[erpType.trim()] : undefined;
    if (mapped) return mapped;
    return '업무공간';
  }
  return inferGeneralProjectType(erpType, clientName);
}

function defaultTeamLabel(category: BusinessCategoryDigit, erpDivision?: string): string {
  const options = getProjectTeamOptions(category);
  const normalizedDivision = erpDivision?.replace('해외사업실', '해외사업본부') ?? '';

  if (normalizedDivision.includes('뉴미디어')) {
    return options.find((opt) => opt.label === '스튜디오스페이스타임')?.label ?? options[0]?.label ?? '';
  }
  if (normalizedDivision.includes('해외')) {
    return options.find((opt) => opt.label === '해외영업')?.label ?? options[0]?.label ?? '';
  }
  if (normalizedDivision.includes('인테리어')) {
    return options.find((opt) => opt.label === '사업1')?.label ?? options[0]?.label ?? '';
  }
  return options.find((opt) => opt.label === '전시컨설팅')?.label ?? options[0]?.label ?? '';
}

function resolveTeam(
  category: BusinessCategoryDigit,
  erpTeamName?: string,
  erpDivision?: string,
): { teamId: string; teamLabel: string; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = normalizeTeamLabel(erpTeamName);
  let matched = resolveProjectTeamSelection(category, undefined, normalized);

  if (!matched && normalized) {
    const options = getProjectTeamOptions(category);
    matched =
      options.find((opt) => normalized.includes(opt.label) || opt.label.includes(normalized)) ??
      null;
  }

  if (!matched) {
    const fallbackLabel = defaultTeamLabel(category, erpDivision);
    matched = resolveProjectTeamSelection(category, undefined, fallbackLabel);
    warnings.push(
      `담당팀 "${erpTeamName ?? '-'}"을(를) 코드 분류 팀으로 매핑하지 못해 "${fallbackLabel}"(으)로 대체했습니다.`,
    );
  }

  return {
    teamId: matched!.value,
    teamLabel: matched!.label,
    warnings,
  };
}

function normalizeMarketScope(value?: string): '국내' | '해외' | null {
  const text = value?.trim();
  if (text === '국내' || text === '해외') return text;
  return null;
}

function normalizeAmount(value?: number | null): number | undefined {
  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

function mapErpRow(row: ErpRawRow, divisions: Division[], index: number): {
  project?: Omit<Project, 'createdAt' | 'updatedAt'>;
  skipReason?: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const projectCode = normalizeProjectCode(row.projectCode ?? '');
  const name = row.name?.trim();

  if (!name) {
    return { warnings, skipReason: '프로젝트명 없음' };
  }
  if (!projectCode || !isValidProjectCode(projectCode)) {
    return { warnings, skipReason: `유효하지 않은 프로젝트 코드: ${row.projectCode ?? '-'}` };
  }
  if (!row.startDate) {
    return { warnings, skipReason: '계약시작일 없음' };
  }

  const parsed = parseProjectCode(projectCode);
  const derived = deriveProjectFieldsFromCode(projectCode, divisions);
  if (!parsed || !derived?.division) {
    return { warnings, skipReason: '코드에서 사업본부를 확인할 수 없음' };
  }

  const marketScope = normalizeMarketScope(row.marketScope);
  if (!marketScope) {
    return { warnings, skipReason: `국내·해외 값 오류: ${row.marketScope ?? '-'}` };
  }

  const projectType = mapProjectType(parsed.businessCategory, row.erpType, row.clientName);
  if (!isValidProjectTypeForCategory(parsed.businessCategory, projectType)) {
    return { warnings, skipReason: `유형 매핑 실패: ${row.erpType ?? '-'}` };
  }

  const team = resolveTeam(parsed.businessCategory, row.teamName, row.erpDivision);
  warnings.push(...team.warnings);

  if (row.erpDivision && row.erpDivision !== derived.divisionName) {
    warnings.push(
      `ERP 사업본부 "${row.erpDivision}"와 코드 기준 "${derived.divisionName}"가 다릅니다. 코드 기준을 사용합니다.`,
    );
  }

  const clientName = row.clientName?.trim();
  const normalizedClient =
    clientName && clientName !== '미등록거래처' ? clientName : undefined;

  const project: Omit<Project, 'createdAt' | 'updatedAt'> = {
    id: `erp-${projectCode.replace(/-/g, '')}`,
    name,
    projectCode,
    clientName: normalizedClient,
    marketScope,
    continuity: '계약고',
    projectType,
    divisionId: derived.division.id,
    divisionName: derived.division.name,
    teamId: team.teamId,
    teamName: team.teamLabel,
    status: derived.status,
    contractAmount: normalizeAmount(row.contractAmount),
    startDate: row.startDate,
    endDate: row.endDate ?? undefined,
    initialContract: snapshotFromProject({
      contractAmount: normalizeAmount(row.contractAmount),
      startDate: row.startDate,
      endDate: row.endDate ?? undefined,
    }),
    pmId: '',
    participantIds: [],
  };

  void index;
  return { project, warnings };
}

export function importErpProjects(
  divisions: Division[],
  existingProjects: Project[] = [],
): ErpImportResult {
  const rows = (rawErpData as { rows: ErpRawRow[] }).rows ?? [];
  const existingCodes = new Set(
    existingProjects
      .map((project) => normalizeProjectCode(project.projectCode))
      .filter((code): code is string => !!code),
  );

  const projects: Project[] = [];
  const skipped: ErpImportResult['skipped'] = [];
  const warnings: ErpImportResult['warnings'] = [];

  rows.forEach((row, index) => {
    const code = normalizeProjectCode(row.projectCode ?? '');
    if (code && existingCodes.has(code)) {
      skipped.push({ row, reason: '이미 등록된 프로젝트 코드' });
      return;
    }

    const mapped = mapErpRow(row, divisions, index);
    if (!mapped.project) {
      skipped.push({ row, reason: mapped.skipReason ?? '매핑 실패' });
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    projects.push({
      ...mapped.project,
      createdAt: now,
      updatedAt: now,
    });

    if (mapped.warnings.length > 0 && mapped.project.projectCode) {
      warnings.push({
        projectCode: mapped.project.projectCode,
        messages: mapped.warnings,
      });
    }

    if (code) existingCodes.add(code);
  });

  return { projects, skipped, warnings };
}

export function mergeErpProjects(
  divisions: Division[],
  existingProjects: Project[],
): Project[] {
  const { projects } = importErpProjects(divisions, existingProjects);
  if (projects.length === 0) return existingProjects;
  return [...existingProjects, ...projects];
}
