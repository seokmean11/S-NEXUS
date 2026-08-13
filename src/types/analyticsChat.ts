import type { BudgetStatus } from '@/types';
import type { ExportTable } from '@/utils/reportExport';
import type {
  ContributionCard,
  Division,
  Employee,
  ExecutiveOffice,
  Project,
  ProjectTeamAllocation,
  RiskScenario,
  Team,
  TrackAllocation,
} from '@/types';
import type { Bid } from '@/types/bid';
import type { ContractAmendment } from '@/types/contractChange';
import type { ExhibitionBusinessCostSummary } from '@/types/exhibitionBusinessCost';
import type { HistoryEvent } from '@/types/history';
import type { OutsourcingRecord } from '@/types/outsourcing';
import type { PersonnelResourceStats } from '@/utils/personnelResourceStats';

export interface AnalyticsChatContext {
  projects: Project[];
  contractAmendments: ContractAmendment[];
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
  executiveOffice?: ExecutiveOffice;
  allocations: TrackAllocation[];
  historyEvents: HistoryEvent[];
}

/** 분석 챗봇용 통합 데이터 컨텍스트 (앱 전역 도메인) */
export interface AnalysisIntegratedContext extends AnalyticsChatContext {
  projectTeamAllocations: ProjectTeamAllocation[];
  riskScenario: RiskScenario;
  contributionCards: ContributionCard[];
  bids: Bid[];
  outsourcingRecords: OutsourcingRecord[];
  outsourcingMeta: {
    source: string;
    fileName: string;
    updatedAt?: string;
    localConfigured: boolean;
    localPath?: string;
  };
  exhibitionBusinessCost: ExhibitionBusinessCostSummary;
  personnelResourceStats: PersonnelResourceStats;
  budget?: BudgetStatus;
}

export interface ChatExportAction {
  id: string;
  label: string;
  format: 'csv' | 'word';
  filename: string;
  title: string;
  table: ExportTable;
  summary?: string;
  sections?: ReportSection[];
}

export interface ReportSection {
  title: string;
  narrative: string;
  table?: ExportTable;
}

export interface ChatbotResponse {
  text: string;
  sections?: ReportSection[];
  table?: ExportTable;
  exports?: ChatExportAction[];
}
