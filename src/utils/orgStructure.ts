/** S-NEXUS 조직도 — 내선연락망(2026.08) 6열 기준 */

export const ORG_DIVISIONS = [
  { id: 'div-exec', name: '임원실' },
  { id: 'div-plan', name: '경영기획본부' },
  { id: 'div-os', name: '해외사업실' },
  { id: 'div-selfstorage', name: '셀프스토리지사업팀' },
  { id: 'div-ex', name: '전시사업본부' },
  { id: 'div-in', name: '인테리어사업본부' },
  { id: 'div-nm', name: '뉴미디어사업실' },
] as const;

/** PDF 열 index → 사업본부 */
export const COLUMN_DIVISION_IDS = [
  'div-exec',
  'div-plan',
  'div-os',
  'div-ex',
  'div-in',
  'div-nm',
] as const;

/** 사업본부별 공식 하위팀 */
export const DIVISION_TEAMS: Record<string, string[]> = {
  'div-exec': ['임원실'],
  'div-plan': ['경영지원팀', '재경팀', '사업관리팀'],
  'div-os': ['해외영업팀', '해외디자인팀'],
  'div-selfstorage': ['셀프스토리지사업팀'],
  'div-ex': [
    '전시디자인1팀',
    '전시디자인2팀',
    '전시컨설팅팀',
    'CX디자인팀',
    '제작연출팀',
  ],
  'div-in': ['인테리어디자인팀', '견적팀', '사업1팀', '사업2팀', '사업3팀'],
  'div-nm': ['문화기술연구소', '스튜디오스페이스타임'],
};

/** PDF 팀명 → 공식 팀명 */
export const TEAM_ALIASES: Record<string, string> = {
  회장실: '임원실',
  관리팀: '경영지원팀',
  '재 경 팀': '재경팀',
  재경팀: '재경팀',
  경영지원팀: '경영지원팀',
  사업관리팀: '사업관리팀',
  구매팀: '사업관리팀',
  견적팀: '견적팀',
  자금팀: '재경팀',
  회계팀: '재경팀',
  인사총무팀: '경영지원팀',
  안전관리실: '경영지원팀',
  해외영업팀: '해외영업팀',
  해외디자인팀: '해외디자인팀',
  셀프스토리지사업팀: '셀프스토리지사업팀',
  전시디자인1팀: '전시디자인1팀',
  전시디자인2팀: '전시디자인2팀',
  전시컨설팅팀: '전시컨설팅팀',
  CX디자인팀: 'CX디자인팀',
  제작연출팀: '제작연출팀',
  헤리티지사업팀: '전시컨설팅팀',
  인테리어디자인팀: '인테리어디자인팀',
  사업1팀: '사업1팀',
  사업2팀: '사업2팀',
  사업3팀: '사업3팀',
  문화기술연구소: '문화기술연구소',
  스튜디오스페이스타임: '스튜디오스페이스타임',
  임원실: '임원실',
};

/** 열별 첫 팀 (PDF 상단 기본값) */
export const COLUMN_DEFAULT_TEAMS = [
  '임원실',
  '경영지원팀',
  '해외영업팀',
  '전시컨설팅팀',
  '인테리어디자인팀',
  '문화기술연구소',
] as const;

export function normalizeTeamName(rawTeam: string, divisionId: string): string {
  const trimmed = rawTeam.trim().replace(/\s+/g, '');
  const aliased = TEAM_ALIASES[rawTeam.trim()] ?? TEAM_ALIASES[trimmed] ?? rawTeam.trim();
  const allowed = DIVISION_TEAMS[divisionId] ?? [];
  if (allowed.includes(aliased)) return aliased;
  return allowed[0] ?? aliased;
}

export function getDivisionName(divisionId: string): string {
  return ORG_DIVISIONS.find((d) => d.id === divisionId)?.name ?? divisionId;
}
