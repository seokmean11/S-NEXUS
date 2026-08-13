import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

import { useApp } from '@/context/AppContext';
import { useAnalysisChatRuntime } from '@/context/AnalysisChatRuntimeContext';
import { useOutsourcingSearch } from '@/context/OutsourcingSearchContext';

import { MOCK_BIDS } from '@/data/mockBidData';

import { MOCK_EXHIBITION_BUSINESS_COST } from '@/data/mockExhibitionBusinessCost';

import type {
  AnalysisChatMessage,
  AnalysisChatRoleStore,
  AnalysisAnswerResponder,
} from '@/types/analysisChatSession';

import { DEFAULT_CLAUDE_MODEL } from '@/services/claudeAnalysis';

import { formatOutsourcingSourceLabel } from '@/services/outsourcingLocalData';

import { buildAnalysisDataPayload, summarizePayloadScope } from '@/utils/buildAnalysisDataPayload';

import {

  activateAnalysisThread,

  formatAnalysisThreadDate,

  getActiveThread,

  initAnalysisChatRoleStore,

  loadAnalysisChatRoleStore,

  prepareStoreForRoleChange,

  repairAnalysisChatRoleStore,

  saveAnalysisChatRoleStore,

  sortThreadsForSidebar,

  deleteAnalysisThread,

  startNewAnalysisThread,

  updateActiveThread,

  updateThreadById,
} from '@/utils/analysisChatStorage';

import {
  evaluateLocalDataScopeSelection,
  inferSuggestedPromptScopeDomain,
  type PendingLocalDataScope,
} from '@/utils/analysisLocalDataScope';
import { DOMAIN_LABELS } from '@/utils/analysisQueryDomainLabels';
import type { AnalysisDomainKey } from '@/utils/analysisQueryClarification';

import { getClaudeApiKey, hasClaudeApiKey, saveClaudeApiKey } from '@/utils/claudeApiKey';
import {
  ensureCreditDefaults,
  formatUsd,
  getRemainingCreditUsd,
  saveRemainingCreditUsd,
  clearLastClaudeUsage,
} from '@/utils/claudeUsage';

import {
  buildCasualConversationReply,
  isCasualConversationQuery,
  isOrganizationAnalysisQuery,
} from '@/utils/analysisQueryIntent';

import {
  getAnalysisRouteLabel,
  resolveAnalysisQueryRoute,
} from '@/utils/analysisQueryRouter';
import { formatAnalysisAnswerResponder, analysisAnswerUsedClaude } from '@/utils/analysisAnswerResponder';
import { buildLocalAnalysisAggregate } from '@/utils/analysisLocalAggregate';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { askAnalyticsChatbot } from '@/utils/analyticsChatbot';
import { buildMenuHelpResponse } from '@/utils/analysisProjectLocalHandlers';
import { buildAssistantMessageFromChatbotResponse } from '@/utils/analysisChatMessage';
import {
  buildClaudeAnalysisDeclinedMessage,
  buildClaudeAnalysisOfferMessage,
  isClaudeAnalysisConfirmResponse,
  isClaudeAnalysisDeclineResponse,
} from '@/utils/analysisClaudeOffer';
import type { PendingClaudeAnalysisOffer } from '@/types/analysisChatSession';
import { buildOrgInsightReport } from '@/utils/orgInsightReport';

import { buildPersonnelRows } from '@/utils/personnelSearch';

import { summarizePersonnelResourceStats } from '@/utils/personnelResourceStats';

import {

  downloadCsv,

  downloadInsightWordReport,

  downloadWordReport,

  type ExportTable,

} from '@/utils/reportExport';



const SUGGESTED_PROMPTS = [

  '조직관리 부분 인사이트 보고서 작성해줘',

  '지금 등록된 프로젝트 인사이트 보고서 작성해줘',

  '외주정보검색 데이터 기준 상위 업체와 사업부별 외주 비중 분석해줘',

  '입찰·외주·프로젝트 데이터를 종합해서 리스크 요약해줘',

];

const WELCOME_WITH_API_KEY = `NEXUS AI입니다. **등록·동기화된 데이터**를 우선 바탕으로 객관적인 정보를 안내합니다.

1. 질문하시면 **어느 메뉴 데이터를 근거로 할지** 먼저 선택해 주세요.
2. 선택한 범위 안에서 **로컬 집계 결과**를 보여 드립니다. (크레딧 없음)
3. **인사이트·해석·평가** 등 추가 분석이 필요하면 Claude 연동 여부와 **크레딧 발생** 안내 후 진행합니다.`;

const WELCOME_WITHOUT_API_KEY = `NEXUS AI입니다. **로컬 데이터 집계**로 객관적인 정보를 먼저 안내합니다.

1. 질문 후 **메뉴 데이터 범위**(프로젝트·조직·입찰·외주 등)를 선택합니다.
2. 선택한 범위에서만 로컬 답변을 제공합니다.

Claude **추가 분석**을 쓰려면 API 키가 필요합니다.
1. Anthropic Console(https://console.anthropic.com/settings/keys)에서 API 키 발급
2. 아래 설정에 키 입력 후 저장
3. 또는 프로젝트 루트 .env 파일에 VITE_CLAUDE_API_KEY= 입력`;



function createId(): string {

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

}



function buildScopeLabel(canViewAll: boolean, roleLabel: string): string {

  return canViewAll ? '전사' : roleLabel;

}



export function AnalysisChatbot() {

  const {

    role,

    executiveOffice,

    visibleProjects,

    contractAmendments,

    divisions,

    teams,

    employees,

    allocations,

    historyEvents,

    budget,

    roleConfig,

    permissions,

    projectTeamAllocations,

    riskScenario,

    contributionCards,

  } = useApp();

  const { inFlight, lastUsage, revision, startBackgroundAnalysis, isThreadLoading, reloadUsage } =
    useAnalysisChatRuntime();

  const { records: outsourcingRecords, loadResult, localInfo } = useOutsourcingSearch();



  const buildWelcomeMessages = useCallback((): AnalysisChatMessage[] => {

    return [

      {

        id: 'welcome',

        role: 'assistant',

        text: hasClaudeApiKey() ? WELCOME_WITH_API_KEY : WELCOME_WITHOUT_API_KEY,

      },

    ];

  }, []);



  const [sessionStore, setSessionStore] = useState(() => {

    const existing = loadAnalysisChatRoleStore(role);

    const base =
      existing ??
      initAnalysisChatRoleStore(role, [
        {
          id: 'welcome',
          role: 'assistant',
          text: 'NEXUS AI입니다.',
        },
      ]);

    const repaired = repairAnalysisChatRoleStore(base, base.threads[0]?.messages ?? []);

    saveAnalysisChatRoleStore(repaired);

    return repaired;

  });



  const activeThread = useMemo(() => {

    const repaired = repairAnalysisChatRoleStore(sessionStore, buildWelcomeMessages());

    return getActiveThread(repaired)!;

  }, [sessionStore, buildWelcomeMessages]);

  const loading = isThreadLoading(role, activeThread.id);

  const loadingStartedAt = loading && inFlight ? inFlight.startedAt : null;

  const [loadingSec, setLoadingSec] = useState(0);

  const messages = activeThread.messages;

  const lastQuery = activeThread.lastQuery;

  const pendingLocalDataScope = activeThread.pendingLocalDataScope ?? null;
  const pendingClaudeOffer = activeThread.pendingClaudeOffer;

  const pinnedRequestText = useMemo(() => {
    if (lastQuery?.trim()) return lastQuery.trim();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'user') return message.text.trim();
    }
    return '';
  }, [lastQuery, messages]);

  const sidebarThreads = useMemo(

    () => sortThreadsForSidebar(sessionStore.threads.filter((thread) => thread.archived)),

    [sessionStore.threads],

  );



  const [input, setInput] = useState('');

  const [cooldownUntil, setCooldownUntil] = useState(0);

  const [cooldownSec, setCooldownSec] = useState(0);

  const lastRequestAt = useRef(0);

  const prevRoleRef = useRef(role);

  const initializedWelcomeRef = useRef(false);

  const [apiKeyInput, setApiKeyInput] = useState(() => getClaudeApiKey());
  const [heldCreditInput, setHeldCreditInput] = useState(() => {
    ensureCreditDefaults();
    const remaining = getRemainingCreditUsd();
    return remaining != null ? remaining.toFixed(2) : '';
  });
  const [heldCreditEditing, setHeldCreditEditing] = useState(false);
  const [heldCreditConfirmOpen, setHeldCreditConfirmOpen] = useState(false);
  const heldCreditInputRef = useRef<HTMLInputElement>(null);
  const [threadDeleteConfirmOpen, setThreadDeleteConfirmOpen] = useState(false);
  const [threadEditConfirmOpen, setThreadEditConfirmOpen] = useState(false);
  const [threadActionTargetId, setThreadActionTargetId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [threadTitleDraft, setThreadTitleDraft] = useState('');
  const threadTitleInputRef = useRef<HTMLInputElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(() => !hasClaudeApiKey());

  const listRef = useRef<HTMLDivElement>(null);



  const patchActiveThread = useCallback(

    (patch: {

      messages?: AnalysisChatMessage[];

      lastQuery?: string;
      lastResponder?: AnalysisAnswerResponder | null;
      pendingClaudeOffer?: PendingClaudeAnalysisOffer | null;
      pendingLocalDataScope?: PendingLocalDataScope | null;

      title?: string;

      titleManuallyEdited?: boolean;

    }) => {

      setSessionStore((prev) => {

        const repaired = repairAnalysisChatRoleStore(prev, buildWelcomeMessages());

        const next = updateActiveThread(repaired, patch);

        saveAnalysisChatRoleStore(next);

        return next;

      });

    },

    [buildWelcomeMessages],

  );



  const setMessages = useCallback(

    (updater: AnalysisChatMessage[] | ((prev: AnalysisChatMessage[]) => AnalysisChatMessage[])) => {

      setSessionStore((prev) => {

        const repaired = repairAnalysisChatRoleStore(prev, buildWelcomeMessages());

        const current = getActiveThread(repaired)?.messages ?? [];

        const nextMessages = typeof updater === 'function' ? updater(current) : updater;

        const next = updateActiveThread(repaired, { messages: nextMessages });

        saveAnalysisChatRoleStore(next);

        return next;

      });

    },

    [buildWelcomeMessages],

  );



  const setLastQuery = useCallback(

    (value: string) => {

      patchActiveThread({ lastQuery: value });

    },

    [patchActiveThread],

  );



  const setPendingLocalDataScope = useCallback(
    (value: PendingLocalDataScope | null) => {
      patchActiveThread({ pendingLocalDataScope: value });
    },
    [patchActiveThread],
  );

  const setPendingClaudeOffer = useCallback(

    (value: PendingClaudeAnalysisOffer | null) => {

      patchActiveThread({ pendingClaudeOffer: value });

    },

    [patchActiveThread],

  );



  useEffect(() => {

    if (initializedWelcomeRef.current) return;

    initializedWelcomeRef.current = true;



    setSessionStore((prev) => {

      const repaired = repairAnalysisChatRoleStore(prev, buildWelcomeMessages());

      const active = getActiveThread(repaired);

      if (!active || active.messages.length !== 1 || active.messages[0]?.id !== 'welcome') {

        return prev;

      }

      const next = updateActiveThread(repaired, { messages: buildWelcomeMessages() });

      saveAnalysisChatRoleStore(next);

      return next;

    });

  }, [buildWelcomeMessages]);



  useEffect(() => {

    if (prevRoleRef.current === role) return;



    setSessionStore((prev) =>

      prepareStoreForRoleChange(prevRoleRef.current, prev, role, buildWelcomeMessages()),

    );

    prevRoleRef.current = role;

  }, [role, buildWelcomeMessages]);



  useEffect(() => {

    const reloadStore = () => {

      const stored = loadAnalysisChatRoleStore(role);

      if (!stored) return;

      const repaired = repairAnalysisChatRoleStore(stored, buildWelcomeMessages());

      saveAnalysisChatRoleStore(repaired);

      setSessionStore(repaired);

    };

    reloadStore();

    window.addEventListener('analysis-chat-updated', reloadStore);

    return () => window.removeEventListener('analysis-chat-updated', reloadStore);

  }, [role, revision]);

  useEffect(() => {
    ensureCreditDefaults();
    const remaining = getRemainingCreditUsd();
    if (remaining != null) setHeldCreditInput(remaining.toFixed(2));
  }, [revision]);

  const currentAnalysisUsd = loading
    ? 0
    : analysisAnswerUsedClaude(activeThread.lastResponder)
      ? (lastUsage?.estimatedUsd ?? 0)
      : 0;

  const personnelResourceStats = useMemo(() => {

    const personnelRows = buildPersonnelRows(

      executiveOffice?.admins ?? [],

      employees,

      divisions,

      teams,

    );

    return summarizePersonnelResourceStats(personnelRows);

  }, [executiveOffice, employees, divisions, teams]);



  const outsourcingMeta = useMemo(

    () => ({

      source: loadResult ? formatOutsourcingSourceLabel(loadResult) : '기본 샘플',

      fileName: loadResult?.fileName ?? 'sample',

      updatedAt: loadResult?.updatedAt,

      localConfigured: localInfo?.configured ?? false,

      localPath: localInfo?.configuredPath ?? localInfo?.sourcePath,

    }),

    [loadResult, localInfo],

  );



  const chatContext = useMemo(

    () => ({

      projects: visibleProjects,

      contractAmendments,

      divisions,

      teams,

      employees,

      executiveOffice,

      allocations,

      historyEvents,

      projectTeamAllocations,

      riskScenario,

      contributionCards,

      bids: MOCK_BIDS,

      outsourcingRecords,

      outsourcingMeta,

      exhibitionBusinessCost: MOCK_EXHIBITION_BUSINESS_COST,

      personnelResourceStats,

      budget,

    }),

    [

      visibleProjects,

      contractAmendments,

      divisions,

      teams,

      employees,

      executiveOffice,

      allocations,

      historyEvents,

      projectTeamAllocations,

      riskScenario,

      contributionCards,

      outsourcingRecords,

      outsourcingMeta,

      personnelResourceStats,

      budget,

    ],

  );



  const dataPayload = useMemo(

    () =>

      buildAnalysisDataPayload(

        chatContext,

        {

          roleLabel: roleConfig.label,

          scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),

          budget,

        },

        teams,

        lastQuery,

      ),

    [chatContext, roleConfig.label, permissions.canViewAll, budget, teams, lastQuery],

  );



  const scrollToBottom = () => {

    requestAnimationFrame(() => {

      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });

    });

  };



  useEffect(() => {

    scrollToBottom();

  }, [activeThread.id, messages.length]);



  useEffect(() => {

    if (cooldownUntil <= Date.now()) {

      setCooldownSec(0);

      return;

    }

    const tick = () => {

      const remain = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

      setCooldownSec(remain);

    };

    tick();

    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);

  }, [cooldownUntil]);



  useEffect(() => {

    const handleRateLimited = () => setCooldownUntil(Date.now() + 90_000);

    window.addEventListener('analysis-chat-rate-limited', handleRateLimited);

    return () => window.removeEventListener('analysis-chat-rate-limited', handleRateLimited);

  }, []);



  useEffect(() => {

    if (!loadingStartedAt) {

      setLoadingSec(0);

      return;

    }

    const tick = () => {

      setLoadingSec(Math.max(0, Math.floor((Date.now() - loadingStartedAt) / 1000)));

    };

    tick();

    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);

  }, [loadingStartedAt]);



  const getConversationTurns = (nextMessages: AnalysisChatMessage[]) =>

    nextMessages

      .filter((m) => m.id !== 'welcome' && !m.error)

      .map((m) => ({

        role: m.role,

        text: m.text,

      })) as { role: 'user' | 'assistant'; text: string }[];



  const persistEditingThreadTitle = useCallback(
    (store: AnalysisChatRoleStore): AnalysisChatRoleStore => {
      if (!editingThreadId) return store;
      const trimmed = threadTitleDraft.trim();
      if (!trimmed) return store;
      return updateThreadById(store, editingThreadId, {
        title: trimmed,
        titleManuallyEdited: true,
      });
    },
    [editingThreadId, threadTitleDraft],
  );

  const getThreadById = useCallback(
    (threadId: string) => sessionStore.threads.find((thread) => thread.id === threadId) ?? null,
    [sessionStore.threads],
  );

  const handleNewConversation = () => {

    setEditingThreadId(null);

    setSessionStore((prev) => {

      const withSavedTitle = persistEditingThreadTitle(prev);

      const next = startNewAnalysisThread(withSavedTitle, buildWelcomeMessages());

      saveAnalysisChatRoleStore(next);

      return next;

    });

    setInput('');

  };



  const handleSelectThread = (threadId: string) => {

    if (threadId === sessionStore.activeThreadId) return;

    setEditingThreadId(null);

    setSessionStore((prev) => {

      const withSavedTitle = persistEditingThreadTitle(prev);

      const next = activateAnalysisThread(withSavedTitle, threadId);

      saveAnalysisChatRoleStore(next);

      return next;

    });

    setInput('');

  };



  const handleThreadDeleteRequest = (threadId: string) => {
    if (loading) return;
    setThreadActionTargetId(threadId);
    setThreadDeleteConfirmOpen(true);
  };

  const handleThreadDeleteConfirm = () => {
    if (!threadActionTargetId) return;
    setThreadDeleteConfirmOpen(false);
    setEditingThreadId(null);
    setInput('');
    const targetId = threadActionTargetId;
    setThreadActionTargetId(null);
    setSessionStore((prev) => {
      const withSavedTitle =
        editingThreadId && editingThreadId !== targetId
          ? persistEditingThreadTitle(prev)
          : prev;
      const next = deleteAnalysisThread(withSavedTitle, targetId, buildWelcomeMessages());
      saveAnalysisChatRoleStore(next);
      return next;
    });
  };

  const handleThreadEditRequest = (threadId: string) => {
    if (loading) return;
    setThreadActionTargetId(threadId);
    setThreadEditConfirmOpen(true);
  };

  const handleThreadEditConfirm = () => {
    if (!threadActionTargetId) return;
    const thread = getThreadById(threadActionTargetId);
    if (!thread) return;
    setThreadEditConfirmOpen(false);
    setThreadTitleDraft(thread.title);
    setEditingThreadId(threadActionTargetId);
    setThreadActionTargetId(null);
    requestAnimationFrame(() => threadTitleInputRef.current?.focus());
  };

  const handleThreadTitleSave = () => {
    if (!editingThreadId) return;
    const thread = getThreadById(editingThreadId);
    const trimmed = threadTitleDraft.trim();
    if (!trimmed) {
      setThreadTitleDraft(thread?.title ?? '');
      setEditingThreadId(null);
      return;
    }

    setSessionStore((prev) => {
      const next = updateThreadById(prev, editingThreadId, {
        title: trimmed,
        titleManuallyEdited: true,
      });
      saveAnalysisChatRoleStore(next);
      return next;
    });
    setEditingThreadId(null);
  };

  const handleThreadTitleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    threadId: string,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleThreadTitleSave();
    }
    if (event.key === 'Escape') {
      const thread = getThreadById(threadId);
      setThreadTitleDraft(thread?.title ?? '');
      setEditingThreadId(null);
    }
  };

  const renderSidebarThreadRow = (
    thread: { id: string; title: string; updatedAt: string },
    options: { isActive?: boolean; onSelect?: () => void },
  ) => {
    const isEditing = editingThreadId === thread.id;

    return (
      <div
        className={`analysis-chat-sidebar__item analysis-chat-sidebar__current-item${
          options.isActive ? ' analysis-chat-sidebar__item--active' : ''
        }`}
      >
        {options.onSelect ? (
          <button
            type="button"
            className="analysis-chat-sidebar__current-body analysis-chat-sidebar__saved-select"
            disabled={loading || isEditing}
            onClick={options.onSelect}
          >
            {isEditing ? (
              <input
                ref={threadTitleInputRef}
                className="analysis-chat-sidebar__title-input"
                value={threadTitleDraft}
                onChange={(e) => setThreadTitleDraft(e.target.value)}
                onBlur={handleThreadTitleSave}
                onKeyDown={(e) => handleThreadTitleKeyDown(e, thread.id)}
                onClick={(e) => e.stopPropagation()}
                maxLength={60}
                aria-label="대화 제목"
              />
            ) : (
              <span className="analysis-chat-sidebar__item-title">{thread.title}</span>
            )}
            <span className="analysis-chat-sidebar__item-meta">
              {formatAnalysisThreadDate(thread.updatedAt)}
            </span>
          </button>
        ) : (
          <div className="analysis-chat-sidebar__current-body">
            {isEditing ? (
              <input
                ref={threadTitleInputRef}
                className="analysis-chat-sidebar__title-input"
                value={threadTitleDraft}
                onChange={(e) => setThreadTitleDraft(e.target.value)}
                onBlur={handleThreadTitleSave}
                onKeyDown={(e) => handleThreadTitleKeyDown(e, thread.id)}
                maxLength={60}
                aria-label="대화 제목"
              />
            ) : (
              <span className="analysis-chat-sidebar__item-title">{thread.title}</span>
            )}
            <span className="analysis-chat-sidebar__item-meta">
              {formatAnalysisThreadDate(thread.updatedAt)}
            </span>
          </div>
        )}

        <div className="analysis-chat-sidebar__current-actions">
          <button
            type="button"
            className="analysis-chat-sidebar__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleThreadEditRequest(thread.id);
            }}
            disabled={loading || isEditing}
          >
            수정
          </button>
          <button
            type="button"
            className="analysis-chat-sidebar__action-btn analysis-chat-sidebar__action-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              handleThreadDeleteRequest(thread.id);
            }}
            disabled={loading}
          >
            삭제
          </button>
        </div>
      </div>
    );
  };



  const submitQuery = async (query: string) => {

    const trimmed = query.trim();

    if (!trimmed || loading) return;



    if (cooldownSec > 0) return;



    const repairedStore = repairAnalysisChatRoleStore(sessionStore, buildWelcomeMessages());

    const resolvedThread = getActiveThread(repairedStore);

    if (!resolvedThread) return;

    const threadId = resolvedThread.id;

    if (

      repairedStore.activeThreadId !== sessionStore.activeThreadId ||

      repairedStore.threads.length !== sessionStore.threads.length

    ) {

      setSessionStore(repairedStore);

      saveAnalysisChatRoleStore(repairedStore);

    }



    const now = Date.now();

    if (now - lastRequestAt.current < 3000) return;

    lastRequestAt.current = now;

    const userMessage: AnalysisChatMessage = { id: createId(), role: 'user', text: trimmed };

    const pendingMessages = [...messages, userMessage];

    setMessages(pendingMessages);

    setInput('');

    scrollToBottom();

    if (pendingClaudeOffer) {
      if (isClaudeAnalysisConfirmResponse(trimmed)) {
        setPendingClaudeOffer(null);
        const offerQuery = pendingClaudeOffer.effectiveQuery;
        setLastQuery(offerQuery);
        const apiKey = getClaudeApiKey() ?? '';
        if (!apiKey) {
          setSettingsOpen(true);
          setMessages((prev) => [
            ...prev,
            {
              id: createId(),
              role: 'assistant',
              text: 'Claude 추가 분석에는 API 키가 필요합니다. 상단 "API 설정"에서 키를 입력·저장한 뒤 「네, AI 분석 진행」을 다시 입력해 주세요.',
              error: true,
            },
          ]);
          scrollToBottom();
          return;
        }

        startBackgroundAnalysis({
          roleId: role,
          threadId,
          apiKey,
          effectiveQuery: offerQuery,
          turns: getConversationTurns(pendingMessages),
          chatContext,
          meta: {
            roleLabel: roleConfig.label,
            scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),
            budget,
          },
          teams,
          previewMessageId: null,
          localOrgResponse: isOrganizationAnalysisQuery(offerQuery)
            ? buildOrgInsightReport(chatContext)
            : null,
          hasMultiTurnContext: getConversationTurns(pendingMessages).length > 1,
          routeOverride: 'interpret',
        });
        return;
      }

      if (isClaudeAnalysisDeclineResponse(trimmed)) {
        setPendingClaudeOffer(null);
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            text: buildClaudeAnalysisDeclinedMessage(),
          },
        ]);
        scrollToBottom();
        return;
      }

      setPendingClaudeOffer(null);
    }

    if (!pendingLocalDataScope && isCasualConversationQuery(trimmed)) {
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: buildCasualConversationReply(trimmed),
        },
      ]);
      scrollToBottom();
      return;
    }

    if (!pendingLocalDataScope && /^(안녕|도움|help|뭐\s*할\s*수)/i.test(trimmed)) {
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: buildMenuHelpResponse().text,
        },
      ]);
      scrollToBottom();
      return;
    }

    const scopeStats = {
      projectCount: visibleProjects.length,
      divisionCount: divisions.length,
      employeeCount: employees.length,
      bidCount: MOCK_BIDS.length,
      outsourcingRecordCount: outsourcingRecords.length,
      scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),
    };

    const suggestedScopeDomain = SUGGESTED_PROMPTS.includes(trimmed)
      ? inferSuggestedPromptScopeDomain(trimmed)
      : null;

    const scopeEvaluation = evaluateLocalDataScopeSelection(trimmed, {
      pending: pendingLocalDataScope,
      stats: scopeStats,
      skipSelection: Boolean(suggestedScopeDomain),
      suggestedScopeDomain,
    });

    if (scopeEvaluation.needsSelection) {
      setPendingLocalDataScope({
        originalQuery: scopeEvaluation.originalQuery,
        proposedDomains: scopeEvaluation.proposedDomains,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: scopeEvaluation.message,
          clarification: true,
        },
      ]);
      scrollToBottom();
      return;
    }

    setPendingLocalDataScope(null);
    const effectiveQuery = scopeEvaluation.effectiveQuery;
    const scopeDomain = scopeEvaluation.scopeDomain;

    setLastQuery(effectiveQuery);

    const conversationTurns = getConversationTurns(pendingMessages);

    const queryRoute = resolveAnalysisQueryRoute(effectiveQuery, {
      hasMultiTurnContext: conversationTurns.length > 1,
    });

    const scopedProjects = filterProjectsByQuery(chatContext.projects, effectiveQuery).projects;
    const localResponse =
      buildLocalAnalysisAggregate(effectiveQuery, chatContext, scopeDomain) ??
      askAnalyticsChatbot(effectiveQuery, {
        ...chatContext,
        projects: scopedProjects,
      });

    const assistantMessages: AnalysisChatMessage[] = [];
    if (localResponse) {
      assistantMessages.push(
        buildAssistantMessageFromChatbotResponse(effectiveQuery, localResponse),
      );
    }

    const finalizeLocalFirst = (
      nextAssistantMessages: AnalysisChatMessage[],
      patch?: { pendingClaudeOffer?: PendingClaudeAnalysisOffer | null },
    ) => {
      const nextMessages = [...pendingMessages, ...nextAssistantMessages];
      setMessages(nextMessages);
      patchActiveThread({
        messages: nextMessages,
        lastQuery: effectiveQuery,
        lastResponder: 'local' satisfies AnalysisAnswerResponder,
        pendingClaudeOffer: patch?.pendingClaudeOffer ?? null,
      });
      clearLastClaudeUsage();
      reloadUsage();
      scrollToBottom();
    };

    if (queryRoute === 'interpret') {
      const apiKey = getClaudeApiKey() ?? '';
      if (!apiKey) {
        finalizeLocalFirst([
          ...assistantMessages,
          {
            id: createId(),
            role: 'assistant',
            text: localResponse
              ? `${buildClaudeAnalysisOfferMessage(true)}\n\nClaude 추가 분석을 진행하려면 상단 **「API 설정」**에서 Claude API 키를 입력·저장해 주세요.`
              : `${getAnalysisRouteLabel(queryRoute)}에는 Claude API 키가 필요합니다. 상단 "API 설정"에서 키를 입력·저장해 주세요.`,
            clarification: Boolean(localResponse),
            error: !localResponse,
          },
        ]);
        if (!localResponse) setSettingsOpen(true);
        return;
      }

      finalizeLocalFirst(
        [
          ...assistantMessages,
          {
            id: createId(),
            role: 'assistant',
            text: buildClaudeAnalysisOfferMessage(Boolean(localResponse)),
            clarification: true,
          },
        ],
        {
          pendingClaudeOffer: {
            effectiveQuery,
            hasLocalData: Boolean(localResponse),
          },
        },
      );
      return;
    }

    if (localResponse) {
      finalizeLocalFirst(assistantMessages);
      return;
    }

    finalizeLocalFirst([
      {
        id: createId(),
        role: 'assistant',
        text: '등록·동기화된 데이터에서 이 질문에 맞는 **로컬 집계 결과**를 찾지 못했습니다. 질문 범위를 구체적으로 적어 주시거나, 다른 메뉴 데이터가 연결되어 있는지 확인해 주세요.',
      },
    ]);
  };



  const handleSaveApiKey = () => {

    saveClaudeApiKey(apiKeyInput);

    setSettingsOpen(false);

    setMessages((prev) => [

      ...prev,

      {

        id: createId(),

        role: 'assistant',

        text: 'Claude API 키가 저장되었습니다. 이제 대화를 시작할 수 있습니다.',

      },

    ]);

  };



  const handleHeldCreditBlur = () => {
    const parsed = Number(heldCreditInput);
    if (heldCreditInput.trim() && Number.isFinite(parsed) && parsed >= 0) {
      saveRemainingCreditUsd(parsed);
      setHeldCreditInput(parsed.toFixed(2));
      setHeldCreditEditing(false);
      return;
    }

    const remaining = getRemainingCreditUsd();
    setHeldCreditInput(remaining != null ? remaining.toFixed(2) : '');
    setHeldCreditEditing(false);
  };

  const handleHeldCreditEditRequest = () => {
    setHeldCreditConfirmOpen(true);
  };

  const handleHeldCreditEditConfirm = () => {
    setHeldCreditConfirmOpen(false);
    setHeldCreditEditing(true);
    requestAnimationFrame(() => heldCreditInputRef.current?.focus());
  };



  const exportTableCsv = (table: ExportTable, index: number) => {

    downloadCsv(`AI_분석_표_${index + 1}.csv`, table);

  };



  const exportMessageWord = (message: AnalysisChatMessage) => {

    const title = 'AI_분석_보고서';

    if (message.tables && message.tables.length > 0) {

      const sections = message.tables.map((table, index) => ({

        title: `표 ${index + 1}`,

        narrative: index === 0 ? message.text : '',

        table,

      }));

      if (sections[0]) sections[0].narrative = message.text;

      downloadInsightWordReport(`${title}.doc`, title, message.text, sections);

      return;

    }

    downloadWordReport(

      `${title}.doc`,

      title,

      { headers: ['내용'], rows: [[message.text.replace(/\n/g, ' ')]] },

      message.text,

    );

  };



  const renderTable = (

    table: ExportTable,

    keyPrefix: string,

    tableIndex: number,

    message: AnalysisChatMessage,

  ) => (

    <div key={`${keyPrefix}-table-${tableIndex}`} className="analysis-chat__table-block">

      {message.tables && message.tables.length > 1 && (

        <p className="analysis-chat__table-label">표 {tableIndex + 1}</p>

      )}

      <div className="analysis-chat__table-wrap">

        <table className="analysis-chat__table">

          <thead>

            <tr>

              {table.headers.map((header) => (

                <th key={`${keyPrefix}-${header}`}>{header}</th>

              ))}

            </tr>

          </thead>

          <tbody>

            {table.rows.map((row, rowIndex) => (

              <tr key={`${keyPrefix}-row-${rowIndex}`}>

                {row.map((cell, cellIndex) => (

                  <td key={`${keyPrefix}-${rowIndex}-${cellIndex}`}>{cell}</td>

                ))}

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      <Button variant="outline" size="sm" onClick={() => exportTableCsv(table, tableIndex)}>

        이 표 엑셀(CSV) 다운로드

      </Button>

    </div>

  );



  return (

    <div className="analysis-chat-shell">

      <aside className="analysis-chat-sidebar no-print">

        <div className="analysis-chat-sidebar__header">

          <h4>대화 기록</h4>

          <Button variant="secondary" size="sm" onClick={handleNewConversation} disabled={loading}>

            새 대화

          </Button>

        </div>

        <p className="analysis-chat-sidebar__hint">

          다른 메뉴로 이동해도 현재 대화가 유지됩니다. 권한(로그인) 변경 시 현재 대화는 기록으로

          저장되고 새 대화가 시작됩니다.

        </p>

        <div className="analysis-chat-sidebar__current">

          <span className="analysis-chat-sidebar__section-label">현재 대화</span>

          {renderSidebarThreadRow(activeThread, { isActive: true })}

        </div>

        {sidebarThreads.length > 0 && (

          <div className="analysis-chat-sidebar__list">

            <span className="analysis-chat-sidebar__section-label">저장된 대화</span>

            {sidebarThreads.map((thread) => (
              <div key={thread.id}>
                {renderSidebarThreadRow(thread, {
                  onSelect: () => handleSelectThread(thread.id),
                })}
              </div>
            ))}

          </div>

        )}

      </aside>



      <div className="analysis-chat">

        <div className="analysis-chat__pinned no-print">

        <div className="analysis-chat__header">

          <div className="analysis-chat__header-main">

            <h3>NEXUS AI</h3>

            <p className="analysis-chat__header-desc">

              로컬 데이터 우선 안내 · Claude 추가 분석은 확인 후 진행(크레딧 발생)

            </p>

          </div>

          <div className="analysis-chat__header-actions">

            <Button variant="ghost" size="sm" onClick={handleNewConversation} disabled={loading}>

              새 대화

            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((v) => !v)}>

              API 설정

            </Button>

            <span className="analysis-chat__badge">{hasClaudeApiKey() ? 'CLAUDE' : 'KEY 필요'}</span>

          </div>

        </div>

        {pinnedRequestText && (

          <div className="analysis-chat__request-bar" title={pinnedRequestText}>

            <span className="analysis-chat__request-label">요청</span>

            <p className="analysis-chat__request-text">{pinnedRequestText}</p>

          </div>

        )}

        {settingsOpen && (

          <div className="analysis-chat__settings no-print">

            <label className="analysis-chat__settings-label" htmlFor="claude-api-key">

              Claude API Key

            </label>

            <div className="analysis-chat__settings-row">

              <input

                id="claude-api-key"

                className="analysis-chat__input"

                type="password"

                value={apiKeyInput}

                onChange={(e) => setApiKeyInput(e.target.value)}

                placeholder="sk-ant-..."

                autoComplete="off"

              />

              <Button variant="secondary" size="sm" onClick={handleSaveApiKey}>

                저장

              </Button>

            </div>

            <p className="analysis-chat__settings-hint">

              키는 브라우저 localStorage에 저장됩니다. .env: <code>VITE_CLAUDE_API_KEY</code>

              · 기본 모델: {DEFAULT_CLAUDE_MODEL}

              · 잔여크레딧(추정)은 상단 사용량 바에서 관리합니다.

            </p>

          </div>

        )}



        <div className="analysis-chat__usage-banner no-print">

          <div className="analysis-chat__usage-item analysis-chat__usage-item--held">

            <label className="analysis-chat__usage-label" htmlFor="held-credit-input">

              잔여크레딧(추정)

            </label>

            <div className="analysis-chat__usage-input-row">

              <span className="analysis-chat__usage-currency">$</span>

              <input

                id="held-credit-input"

                ref={heldCreditInputRef}

                className="analysis-chat__usage-input"

                type="number"

                min="0"

                step="0.01"

                value={heldCreditInput}

                onChange={(e) => setHeldCreditInput(e.target.value)}

                onBlur={handleHeldCreditBlur}

                placeholder="19.26"

                disabled={!heldCreditEditing}

                readOnly={!heldCreditEditing}

              />

              <Button

                type="button"

                variant="outline"

                size="sm"

                className="analysis-chat__usage-edit-btn"

                onClick={handleHeldCreditEditRequest}

                disabled={heldCreditEditing}

              >

                수정

              </Button>

            </div>

          </div>

          <div className="analysis-chat__usage-item">

            <span className="analysis-chat__usage-label">이번 분석 사용</span>

            <strong>{formatUsd(currentAnalysisUsd)}</strong>

          </div>

          <div className="analysis-chat__usage-item analysis-chat__usage-item--responder">

            <span className="analysis-chat__usage-label">답변자</span>

            <strong>{formatAnalysisAnswerResponder(activeThread.lastResponder)}</strong>

          </div>

        </div>



        <ConfirmDialog

          open={heldCreditConfirmOpen}

          title="잔여크레딧(추정) 수정"

          message="잔여크레딧(추정)을 수정하시겠습니까?"

          confirmLabel="네"

          cancelLabel="아니오"

          onConfirm={handleHeldCreditEditConfirm}

          onCancel={() => setHeldCreditConfirmOpen(false)}

        />



        <ConfirmDialog

          open={threadDeleteConfirmOpen}

          title="대화 삭제"

          message="이 대화를 삭제하시겠습니까?"

          confirmLabel="네"

          cancelLabel="아니오"

          onConfirm={handleThreadDeleteConfirm}

          onCancel={() => setThreadDeleteConfirmOpen(false)}

        />



        <ConfirmDialog

          open={threadEditConfirmOpen}

          title="대화 제목 수정"

          message="대화 제목을 수정하시겠습니까?"

          confirmLabel="네"

          cancelLabel="아니오"

          onConfirm={handleThreadEditConfirm}

          onCancel={() => setThreadEditConfirmOpen(false)}

        />



        {inFlight && inFlight.roleId === role && inFlight.threadId !== activeThread.id && (

          <div className="analysis-chat__background-notice no-print">

            다른 대화에서 정보 조회가 백그라운드로 진행 중입니다. 완료되면 저장된 대화에 반영됩니다.

          </div>

        )}

        <div className="analysis-chat__suggestions no-print">

          {SUGGESTED_PROMPTS.map((prompt) => (

            <button

              key={prompt}

              type="button"

              className="analysis-chat__suggestion"

              disabled={loading}

              onClick={() => submitQuery(prompt)}

            >

              {prompt}

            </button>

          ))}

        </div>

        </div>



        <div className="analysis-chat__messages" ref={listRef}>

          {messages.map((message) => (

            <div

              key={message.id}

              className={`analysis-chat__message analysis-chat__message--${message.role}${message.error ? ' analysis-chat__message--error' : ''}`}

            >

              <div className="analysis-chat__bubble">

                <div className="analysis-chat__text">{message.text}</div>



                {message.tables?.map((table, index) =>

                  renderTable(table, message.id, index, message),

                )}



                {message.role === 'assistant' && message.exportable && (

                    <div className="analysis-chat__exports">

                      <Button variant="outline" size="sm" onClick={() => exportMessageWord(message)}>

                        워드 보고서 다운로드

                      </Button>

                    </div>

                  )}

              </div>

            </div>

          ))}



          {pendingLocalDataScope && !loading && (
            <div className="analysis-chat__scope-picker no-print">
              {pendingLocalDataScope.proposedDomains.map((domain, index) => (
                <button
                  key={domain}
                  type="button"
                  className="analysis-chat__scope-picker-btn"
                  onClick={() => void submitQuery(String(index + 1))}
                >
                  {index + 1}. {DOMAIN_LABELS[domain as AnalysisDomainKey]}
                </button>
              ))}
            </div>
          )}

          {loading && (

            <div className="analysis-chat__message analysis-chat__message--assistant">

              <div className="analysis-chat__bubble analysis-chat__bubble--loading">

                <strong>정보 조회 중</strong>

                {loadingSec > 0 ? ` · ${loadingSec}초 경과` : ''}

                <p className="analysis-chat__loading-scope">
                  {inFlight
                    ? getAnalysisRouteLabel(inFlight.route)
                    : summarizePayloadScope(dataPayload)}
                </p>

              </div>

            </div>

          )}

        </div>



        <form

          className="analysis-chat__composer no-print"

          onSubmit={(e) => {

            e.preventDefault();

            void submitQuery(input);

          }}

        >

          <div className="analysis-chat__composer-row">

            <input

              className="analysis-chat__input"

              value={input}

              onChange={(e) => setInput(e.target.value)}

              placeholder="예: 외주 상위 업체 현황 / 입찰·프로젝트 종합 리스크 / 자원정보현황 인사이트"

              disabled={loading}

            />

            <Button

              type="submit"

              variant="primary"

              disabled={loading || cooldownSec > 0 || !input.trim()}

            >

              {loading ? '조회 중…' : cooldownSec > 0 ? `${cooldownSec}초 후 재시도` : '전송'}

            </Button>

          </div>

        </form>

      </div>

    </div>

  );

}


