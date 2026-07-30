import type {
  BudgetStatus,
  Division,
  Employee,
  Project,
  RoleConfig,
  Team,
  TrackAllocation,
} from '@/types';

export const DIVISIONS: Division[] = [
  { id: 'div-a', name: '건축사업본부', headName: '이본부', headRank: '상무' },
  { id: 'div-b', name: '인프라사업본부', headName: '강인프', headRank: '상무' },
  { id: 'div-c', name: '스마트시티사업본부' },
];

export const TEAMS: Team[] = [
  { id: 'team-a1', name: '건축1팀', divisionId: 'div-a', headName: '최팀장', headRank: '수석매니저' },
  { id: 'team-a2', name: '건축2팀', divisionId: 'div-a' },
  { id: 'team-b1', name: '도로설계팀', divisionId: 'div-b', headName: '윤도로', headRank: '책임매니저' },
  { id: 'team-c1', name: '스마트플랫폼팀', divisionId: 'div-c' },
];

export const EMPLOYEES: Employee[] = [
  { id: 'emp-admin', name: '김개발', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '개발관리자' },
  { id: 'emp-ceo', name: '박경영', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '경영관리' },
  { id: 'emp-div-a', name: '이본부', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '사업본부장' },
  { id: 'emp-mgr-a1', name: '최팀장', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '팀장' },
  { id: 'emp-mem-1', name: '정민수', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '팀원' },
  { id: 'emp-mem-2', name: '한지영', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '팀원' },
  { id: 'emp-mem-3', name: '오성훈', divisionId: 'div-a', divisionName: '건축사업본부', teamId: 'team-a1', teamName: '건축1팀', role: '팀원' },
  { id: 'emp-div-b', name: '강인프', divisionId: 'div-b', divisionName: '인프라사업본부', teamId: 'team-b1', teamName: '도로설계팀', role: '사업본부장' },
  { id: 'emp-mgr-b1', name: '윤도로', divisionId: 'div-b', divisionName: '인프라사업본부', teamId: 'team-b1', teamName: '도로설계팀', role: '팀장' },
  { id: 'emp-mem-4', name: '송미래', divisionId: 'div-b', divisionName: '인프라사업본부', teamId: 'team-b1', teamName: '도로설계팀', role: '팀원' },
];

export const ROLE_CONFIGS: RoleConfig[] = [
  {
    id: 'dev_admin',
    label: '개발관리자',
    description: '전사 데이터 + 마스터 관리 + PPM 동기화',
    userId: 'emp-admin',
    userName: '김개발',
    divisionId: 'div-a',
    teamId: 'team-a1',
  },
  {
    id: 'c_level',
    label: '경영관리',
    description: '전사 열람 (Read-only) + PDF 보고서',
    userId: 'emp-ceo',
    userName: '박경영',
    divisionId: 'div-a',
    teamId: 'team-a1',
  },
  {
    id: 'division_head',
    label: '사업본부장',
    description: '소속 사업부 데이터만',
    userId: 'emp-div-a',
    userName: '이본부',
    divisionId: 'div-a',
    teamId: 'team-a1',
  },
  {
    id: 'team_manager',
    label: '팀장',
    description: '소속 팀 + PM 인력 배분',
    userId: 'emp-mgr-a1',
    userName: '최팀장',
    divisionId: 'div-a',
    teamId: 'team-a1',
  },
  {
    id: 'team_member',
    label: '일반 팀원',
    description: '참여 프로젝트 기여도만',
    userId: 'emp-mem-1',
    userName: '정민수',
    divisionId: 'div-a',
    teamId: 'team-a1',
  },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'pjt-001',
    name: '서울역 복합개발 설계',
    divisionId: 'div-a',
    divisionName: '건축사업본부',
    teamId: 'team-a1',
    teamName: '건축1팀',
    status: '실행',
    contractAmount: 8500000000,
    startDate: '2025-03-01',
    endDate: '2026-12-31',
    pmId: 'emp-mgr-a1',
    participantIds: ['emp-mgr-a1', 'emp-mem-1', 'emp-mem-2', 'emp-mem-3'],
    createdAt: '2025-01-15',
    updatedAt: '2025-06-01',
  },
  {
    id: 'pjt-002',
    name: '판교 테크노밸리 리모델링',
    divisionId: 'div-a',
    divisionName: '건축사업본부',
    teamId: 'team-a1',
    teamName: '건축1팀',
    status: '수주',
    contractAmount: 5200000000,
    startDate: '2025-07-01',
    pmId: 'emp-mgr-a1',
    participantIds: ['emp-mgr-a1', 'emp-mem-1', 'emp-mem-3'],
    createdAt: '2025-04-20',
    updatedAt: '2025-07-10',
  },
  {
    id: 'pjt-003',
    name: '부산 해운대 관광단지 공모',
    divisionId: 'div-a',
    divisionName: '건축사업본부',
    teamId: 'team-a2',
    teamName: '건축2팀',
    status: '공모',
    startDate: '2025-08-01',
    pmId: 'emp-mgr-a1',
    participantIds: ['emp-mem-2'],
    createdAt: '2025-07-01',
    updatedAt: '2025-07-01',
  },
  {
    id: 'pjt-004',
    name: '경부고속도로 확장 설계',
    divisionId: 'div-b',
    divisionName: '인프라사업본부',
    teamId: 'team-b1',
    teamName: '도로설계팀',
    status: '실행',
    contractAmount: 12000000000,
    startDate: '2024-09-01',
    endDate: '2027-06-30',
    pmId: 'emp-mgr-b1',
    participantIds: ['emp-mgr-b1', 'emp-mem-4'],
    createdAt: '2024-06-01',
    updatedAt: '2025-05-15',
  },
];

export const INITIAL_ALLOCATIONS: TrackAllocation[] = [
  {
    projectId: 'pjt-001',
    bid: [
      { employeeId: 'emp-mgr-a1', employeeName: '최팀장', ratio: 30 },
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 40 },
      { employeeId: 'emp-mem-2', employeeName: '한지영', ratio: 30 },
    ],
    design: [
      { employeeId: 'emp-mgr-a1', employeeName: '최팀장', ratio: 20 },
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 35 },
      { employeeId: 'emp-mem-2', employeeName: '한지영', ratio: 25 },
      { employeeId: 'emp-mem-3', employeeName: '오성훈', ratio: 20 },
    ],
    production: [
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 40 },
      { employeeId: 'emp-mem-2', employeeName: '한지영', ratio: 35 },
      { employeeId: 'emp-mem-3', employeeName: '오성훈', ratio: 25 },
    ],
    updatedAt: '2025-07-20T10:00:00',
  },
  {
    projectId: 'pjt-002',
    bid: [
      { employeeId: 'emp-mgr-a1', employeeName: '최팀장', ratio: 50 },
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 50 },
    ],
    design: [
      { employeeId: 'emp-mgr-a1', employeeName: '최팀장', ratio: 25 },
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 40 },
      { employeeId: 'emp-mem-3', employeeName: '오성훈', ratio: 35 },
    ],
    production: [
      { employeeId: 'emp-mem-1', employeeName: '정민수', ratio: 60 },
      { employeeId: 'emp-mem-3', employeeName: '오성훈', ratio: 40 },
    ],
    updatedAt: '2025-07-15T14:30:00',
  },
];

export const DEFAULT_BUDGET: BudgetStatus = {
  contractAmount: 8500000000,
  cumulativeBilling: 3400000000,
  remainingBilling: 5100000000,
  billingRate: 40,
  executionBudget: 6800000000,
  spentBudget: 2900000000,
  remainingBudget: 3900000000,
  budgetBurnRate: 42.6,
};

export const BUDGET_SCENARIOS: Record<string, BudgetStatus> = {
  normal: DEFAULT_BUDGET,
  cash_flow: {
    ...DEFAULT_BUDGET,
    cumulativeBilling: 2000000000,
    remainingBilling: 6500000000,
    billingRate: 23.5,
    spentBudget: 3500000000,
    remainingBudget: 3300000000,
    budgetBurnRate: 51.5,
  },
  budget_burn: {
    ...DEFAULT_BUDGET,
    spentBudget: 6200000000,
    remainingBudget: 600000000,
    budgetBurnRate: 91.2,
  },
  budget_exceed: {
    ...DEFAULT_BUDGET,
    spentBudget: 7200000000,
    remainingBudget: -400000000,
    budgetBurnRate: 105.9,
  },
};

export function formatCurrency(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만`;
  }
  return value.toLocaleString('ko-KR');
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
