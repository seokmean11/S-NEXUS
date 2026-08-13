import type { Role } from '@/types';
import type { ExportTable } from '@/utils/reportExport';
import type { PendingAnalysisClarification } from '@/utils/analysisQueryClarification';
import type { PendingLocalDataScope } from '@/utils/analysisLocalDataScope';

export interface PendingClaudeAnalysisOffer {
  effectiveQuery: string;
  hasLocalData: boolean;
}

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

/** 마지막 분석 답변의 처리 주체 */
export type AnalysisAnswerResponder = 'local' | 'claude' | 'local+claude';

export interface AnalysisChatThread {
  id: string;
  title: string;
  titleManuallyEdited?: boolean;
  messages: AnalysisChatMessage[];
  lastQuery: string;
  /** 직전 분석 답변의 처리 주체 (로컬 / Claude / 혼합) */
  lastResponder?: AnalysisAnswerResponder | null;
  /** Claude 추가 분석 진행 대기 (로컬 답변 후) */
  pendingClaudeOffer?: PendingClaudeAnalysisOffer | null;
  pendingClarification: PendingAnalysisClarification | null;
  /** 로컬 답변 전 데이터 범위 선택 대기 */
  pendingLocalDataScope: PendingLocalDataScope | null;
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
