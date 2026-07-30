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

export type ProjectStatus = '공모' | '수주' | '실행' | '완료';

export interface Project {
  id: string;
  name: string;
  divisionId: string;
  divisionName: string;
  teamId: string;
  teamName: string;
  status: ProjectStatus;
  contractAmount?: number;
  startDate: string;
  endDate?: string;
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
  canExportPDF: boolean;
  isReadOnly: boolean;
}
