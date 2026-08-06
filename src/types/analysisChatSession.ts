import type { Role } from '@/types';
import type { ExportTable } from '@/utils/reportExport';
import type { PendingAnalysisClarification } from '@/utils/analysisQueryClarification';

export interface AnalysisChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tables?: ExportTable[];
  error?: boolean;
  clarification?: boolean;
}

export interface AnalysisChatThread {
  id: string;
  title: string;
  messages: AnalysisChatMessage[];
  lastQuery: string;
  pendingClarification: PendingAnalysisClarification | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface AnalysisChatRoleStore {
  roleId: Role;
  activeThreadId: string;
  threads: AnalysisChatThread[];
}

export interface AnalysisChatStorageRoot {
  version: 1;
  byRole: Partial<Record<Role, AnalysisChatRoleStore>>;
}
