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
  runAnalysisJob,
  type AnalysisBackgroundJob,
  type RunAnalysisJobParams,
} from '@/services/analysisChatJobRunner';
import {
  clearLastClaudeUsage,
  getLastClaudeUsage,
  type ClaudeUsageSnapshot,
} from '@/utils/claudeUsage';
import type { AnalysisDataPayloadMeta } from '@/utils/buildAnalysisDataPayload';

const INFLIGHT_STORAGE_KEY = 'perf-dashboard-analysis-inflight';

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
}

interface AnalysisChatRuntimeContextValue {
  inFlight: AnalysisBackgroundJob | null;
  lastUsage: ClaudeUsageSnapshot | null;
  revision: number;
  startBackgroundAnalysis: (params: StartBackgroundAnalysisParams) => void;
  reloadUsage: () => void;
  isThreadLoading: (roleId: Role, threadId: string) => boolean;
}

const AnalysisChatRuntimeContext = createContext<AnalysisChatRuntimeContextValue | null>(null);

function writePersistedInFlight(job: AnalysisBackgroundJob | null): void {
  if (!job) {
    sessionStorage.removeItem(INFLIGHT_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(INFLIGHT_STORAGE_KEY, JSON.stringify(job));
}

export function AnalysisChatRuntimeProvider({ children }: { children: ReactNode }) {
  const [inFlight, setInFlight] = useState<AnalysisBackgroundJob | null>(null);
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
    const job: AnalysisBackgroundJob = {
      roleId: params.roleId,
      threadId: params.threadId,
      startedAt: Date.now(),
      previewMessageId: params.previewMessageId,
      effectiveQuery: params.effectiveQuery,
    };

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
        reloadUsage();
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
