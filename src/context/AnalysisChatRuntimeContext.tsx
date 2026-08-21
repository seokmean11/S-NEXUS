import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@/types';
import type { Team } from '@/types';
import type { AnalysisIntegratedContext } from '@/types/analyticsChat';
import type { ClaudeChatTurn } from '@/services/claudeAnalysis';
import type { ChatbotResponse } from '@/types/analyticsChat';
import {
  createAnalysisBackgroundJob,
  runAnalysisJob,
  type RunAnalysisJobParams,
} from '@/services/analysisChatJobRunner';
import type { AnalysisQueryRoute } from '@/utils/analysisQueryRouter';
import {
  clearLastClaudeUsage,
  getLastClaudeUsage,
  type ClaudeUsageSnapshot,
} from '@/utils/claudeUsage';
import type { AnalysisDataPayloadMeta } from '@/utils/buildAnalysisDataPayload';
import { workspaceStorageKey } from '@/utils/userWorkspaceStorage';

const INFLIGHT_STORAGE_KEY = 'perf-dashboard-analysis-inflight';

function inflightStorageKey(): string {
  return workspaceStorageKey(INFLIGHT_STORAGE_KEY);
}

interface StartBackgroundAnalysisParams {
  roleId: Role;
  threadId: string;
  apiKey: string;
  effectiveQuery: string;
  turns: ClaudeChatTurn[];
  chatContext: AnalysisIntegratedContext;
  meta: AnalysisDataPayloadMeta;
  teams: Team[];
  previewMessageId: string | null;
  localOrgResponse: ChatbotResponse | null;
  hasMultiTurnContext: boolean;
  routeOverride?: AnalysisQueryRoute;
}

interface AnalysisChatRuntimeContextValue {
  inFlight: ReturnType<typeof createAnalysisBackgroundJob> | null;
  lastUsage: ClaudeUsageSnapshot | null;
  revision: number;
  startBackgroundAnalysis: (params: StartBackgroundAnalysisParams) => void;
  reloadUsage: () => void;
  isThreadLoading: (roleId: Role, threadId: string) => boolean;
}

const AnalysisChatRuntimeContext = createContext<AnalysisChatRuntimeContextValue | null>(null);

function writePersistedInFlight(job: ReturnType<typeof createAnalysisBackgroundJob> | null): void {
  if (!job) {
    sessionStorage.removeItem(inflightStorageKey());
    return;
  }
  sessionStorage.setItem(inflightStorageKey(), JSON.stringify(job));
}

export function AnalysisChatRuntimeProvider({ children }: { children: ReactNode }) {
  const [inFlight, setInFlight] = useState<ReturnType<typeof createAnalysisBackgroundJob> | null>(null);
  const [lastUsage, setLastUsage] = useState<ClaudeUsageSnapshot | null>(() =>
    getLastClaudeUsage(),
  );
  const [revision, setRevision] = useState(0);

  const notifyComplete = useCallback(() => {
    setRevision((value) => value + 1);
    window.dispatchEvent(new CustomEvent('analysis-chat-updated'));
  }, []);

  const reloadUsage = useCallback(() => {
    setLastUsage(getLastClaudeUsage());
  }, []);

  const startBackgroundAnalysis = useCallback((params: StartBackgroundAnalysisParams) => {
    const job = createAnalysisBackgroundJob({
      roleId: params.roleId,
      threadId: params.threadId,
      effectiveQuery: params.effectiveQuery,
      previewMessageId: params.previewMessageId,
      hasMultiTurnContext: params.hasMultiTurnContext,
      routeOverride: params.routeOverride,
    });

    setInFlight(job);
    writePersistedInFlight(job);
    clearLastClaudeUsage();
    setLastUsage(null);

    const runnerParams: RunAnalysisJobParams = {
      job,
      apiKey: params.apiKey,
      turns: params.turns,
      chatContext: params.chatContext,
      meta: params.meta,
      teams: params.teams,
      localOrgResponse: params.localOrgResponse,
    };

    void runAnalysisJob(runnerParams).then((result) => {
      setInFlight(null);
      writePersistedInFlight(null);
      if (result.usage) {
        setLastUsage(result.usage);
      } else {
        clearLastClaudeUsage();
        setLastUsage(null);
      }
      notifyComplete();
    });
  }, [notifyComplete, reloadUsage]);

  useEffect(() => {
    writePersistedInFlight(inFlight);
  }, [inFlight]);

  const isThreadLoading = useCallback(
    (roleId: Role, threadId: string) =>
      inFlight?.roleId === roleId && inFlight.threadId === threadId,
    [inFlight],
  );

  const value = useMemo(
    () => ({
      inFlight,
      lastUsage,
      startBackgroundAnalysis,
      reloadUsage,
      isThreadLoading,
      revision,
    }),
    [inFlight, lastUsage, startBackgroundAnalysis, reloadUsage, isThreadLoading, revision],
  );

  return (
    <AnalysisChatRuntimeContext.Provider value={value}>
      {children}
    </AnalysisChatRuntimeContext.Provider>
  );
}

export function useAnalysisChatRuntime() {
  const ctx = useContext(AnalysisChatRuntimeContext);
  if (!ctx) {
    throw new Error('useAnalysisChatRuntime must be used within AnalysisChatRuntimeProvider');
  }
  return ctx;
}

export function useOptionalAnalysisChatRuntime() {
  return useContext(AnalysisChatRuntimeContext);
}
