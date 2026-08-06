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
  /** 분석 요청에 대한 완료 응답일 때만 true — 워드 보고서 다운로드 노출 */
  exportable?: boolean;
}

export interface AnalysisChatThread {
  id: string;
  title: string;
  titleManuallyEdited?: boolean;
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
