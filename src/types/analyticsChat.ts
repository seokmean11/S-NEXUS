import type { ExportTable } from '@/utils/reportExport';
import type { Division, Employee, ExecutiveOffice, Project, Team, TrackAllocation } from '@/types';
import type { ContractAmendment } from '@/types/contractChange';
import type { HistoryEvent } from '@/types/history';

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
