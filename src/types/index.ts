export type Role =
  | 'dev_admin'
  | 'c_level'
  | 'division_head'
  | 'team_manager'
  | 'team_member';

export interface RoleConfig {
  id: Role;
  label: string;
  description: string;
  userId: string;
  userName: string;
  divisionId?: string;
  teamId?: string;
}

export type ProjectStatus = '공모' | '설계' | '제작' | '수주' | '실행' | '완료';

/** 전시·뉴미·해외사업 유형 */
export type GeneralProjectType = '공공' | '민간';

/** 인테리어사업 유형 */
export type InteriorProjectType =
  | '건축시설'
  | '문화공간'
  | '복합공간'
  | '상업공간'
  | '업무공간'
  | '호텔및주거공간';

export type ProjectType = GeneralProjectType | InteriorProjectType;

/** 프로젝트 수행 지역 구분 */
export type ProjectMarketScope = '국내' | '해외';

/** 신규·계약고 구분 */
export type ProjectContinuity = '신규' | '계약고';

import type { ContractSnapshot } from '@/types/contractChange';

export interface Project {
  id: string;
  name: string;
  /** 외부 집행원가 연동용 코드 (0000-0000-00) */
  projectCode?: string;
  /** 발주처 */
  clientName?: string;
  /** 사업본부별 세부 유형 (분석용) */
  projectType?: ProjectType;
  /** 국내·해외 구분 (분석용) */
  marketScope?: ProjectMarketScope;
  /** 신규·계약고 구분 (분석용) */
  continuity?: ProjectContinuity;
  divisionId: string;
  divisionName: string;
  teamId: string;
  teamName: string;
  status: ProjectStatus;
  contractAmount?: number;
  startDate: string;
  endDate?: string;
  /** 최초 등록 시점 계약 정보 (변경 불가) */
  initialContract?: ContractSnapshot;
  pmId: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutiveAdmin {
  id: string;
  name: string;
  rank: string;
}

export interface ExecutiveOffice {
  admins: ExecutiveAdmin[];
}

export interface Division {
  id: string;
  name: string;
  headName?: string;
  headRank?: string;
}

export interface Team {
  id: string;
  name: string;
  divisionId: string;
  headName?: string;
  headRank?: string;
}

export interface Employee {
  id: string;
  name: string;
  divisionId: string;
  divisionName: string;
  teamId: string;
  teamName: string;
  role: string;
}

export interface AllocationEntry {
  employeeId: string;
  employeeName: string;
  ratio: number;
}

export interface TeamAllocationEntry {
  teamId: string;
  teamName: string;
  ratio: number;
}

export interface ProjectTeamAllocation {
  projectId: string;
  teams: TeamAllocationEntry[];
  updatedAt: string;
}

export interface TrackAllocation {
  projectId: string;
  bid: AllocationEntry[];
  design: AllocationEntry[];
  production: AllocationEntry[];
  updatedAt: string;
}

export interface BudgetStatus {
  contractAmount: number;
  cumulativeBilling: number;
  remainingBilling: number;
  billingRate: number;
  executionBudget: number;
  spentBudget: number;
  remainingBudget: number;
  budgetBurnRate: number;
}

export type RiskScenario =
  | 'normal'
  | 'cash_flow'
  | 'budget_burn'
  | 'budget_exceed';

export interface ContributionCard {
  projectId: string;
  projectName: string;
  employeeId: string;
  employeeName: string;
  bidRatio: number;
  designRatio: number;
  productionRatio: number;
  totalContribution: number;
  teamName: string;
  divisionName: string;
}

export interface PermissionFlags {
  canViewAll: boolean;
  canCreateProject: boolean;
  canEditProject: boolean;
  canSyncPPM: boolean;
  canAccessAllocationForm: boolean;
  canAccessProjectAllocationForm: boolean;
  canExportPDF: boolean;
  isReadOnly: boolean;
}
