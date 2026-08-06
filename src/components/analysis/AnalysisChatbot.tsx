import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

import { useApp } from '@/context/AppContext';
import { useAnalysisChatRuntime } from '@/context/AnalysisChatRuntimeContext';
import { useOutsourcingSearch } from '@/context/OutsourcingSearchContext';

import { MOCK_BIDS } from '@/data/mockBidData';

import { MOCK_EXHIBITION_BUSINESS_COST } from '@/data/mockExhibitionBusinessCost';

import type { AnalysisChatMessage, AnalysisChatRoleStore } from '@/types/analysisChatSession';

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

  evaluateAnalysisQueryClarification,

  type PendingAnalysisClarification,

} from '@/utils/analysisQueryClarification';

import { getClaudeApiKey, hasClaudeApiKey, saveClaudeApiKey } from '@/utils/claudeApiKey';
import {
  ensureCreditDefaults,
  formatUsd,
  getRemainingCreditUsd,
  saveRemainingCreditUsd,
} from '@/utils/claudeUsage';

import {
  buildCasualConversationReply,
  isCasualConversationQuery,
  isOrganizationAnalysisQuery,
} from '@/utils/analysisQueryIntent';

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

const WELCOME_WITH_API_KEY = `NEXUS AI입니다. 저는 항상 데이터 기반의 정보 제공을 위해 최선을 다하고 있어요.

필요한 정보가 있으면 편하게 말씀해 주세요. 범위가 불명확하면 확인 질문을 드립니다.

이어서 "네, 진행해줘", "외주만"처럼 **대화로 범위를 조정**할 수 있습니다.`;

const WELCOME_WITHOUT_API_KEY = `Claude API 키를 설정하면 NEXUS AI 대화형 정보 조회를 사용할 수 있습니다.

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

  const { inFlight, lastUsage, revision, startBackgroundAnalysis, isThreadLoading } =
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

  const pendingClarification = activeThread.pendingClarification;

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

      pendingClarification?: PendingAnalysisClarification | null;

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



  const setPendingClarification = useCallback(

    (value: PendingAnalysisClarification | null) => {

      patchActiveThread({ pendingClarification: value });

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

  const currentAnalysisUsd = loading ? 0 : (lastUsage?.estimatedUsd ?? 0);

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



    const apiKey = getClaudeApiKey();

    if (!apiKey) {

      setSettingsOpen(true);

      setMessages((prev) => [

        ...prev,

        { id: createId(), role: 'user', text: trimmed },

        {

          id: createId(),

          role: 'assistant',

          text: 'Claude API 키가 필요합니다. 상단 "API 설정"에서 키를 입력·저장해 주세요.',

          error: true,

        },

      ]);

      setInput('');

      scrollToBottom();

      return;

    }



    const userMessage: AnalysisChatMessage = { id: createId(), role: 'user', text: trimmed };

    const pendingMessages = [...messages, userMessage];

    setMessages(pendingMessages);

    setInput('');

    scrollToBottom();



    const clarificationStats = {

      projectCount: visibleProjects.length,

      divisionCount: divisions.length,

      employeeCount: employees.length,

      bidCount: MOCK_BIDS.length,

      outsourcingRecordCount: outsourcingRecords.length,

      scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),

    };



    const clarification = evaluateAnalysisQueryClarification(trimmed, {

      pendingClarification,

      conversationTurns: getConversationTurns(pendingMessages),

      stats: clarificationStats,

      skipClarification: SUGGESTED_PROMPTS.includes(trimmed),

    });



    if (clarification.needsClarification) {

      setPendingClarification({

        originalQuery: clarification.originalQuery,

        proposedDomains: clarification.proposedDomains,

      });

      setMessages((prev) => [

        ...prev,

        {

          id: createId(),

          role: 'assistant',

          text: clarification.message,

          clarification: true,

        },

      ]);

      scrollToBottom();

      return;

    }



    setPendingClarification(null);

    const effectiveQuery = clarification.effectiveQuery;

    if (isCasualConversationQuery(effectiveQuery)) {

      setMessages((prev) => [

        ...prev,

        {

          id: createId(),

          role: 'assistant',

          text: buildCasualConversationReply(effectiveQuery),

        },

      ]);

      scrollToBottom();

      return;

    }

    setLastQuery(effectiveQuery);

    scrollToBottom();



    const isOrgQuery = isOrganizationAnalysisQuery(effectiveQuery);

    startBackgroundAnalysis({

      roleId: role,

      threadId,

      apiKey,

      effectiveQuery,

      turns: getConversationTurns(pendingMessages),

      chatContext,

      meta: {

        roleLabel: roleConfig.label,

        scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),

        budget,

      },

      teams,

      previewMessageId: null,

      localOrgResponse: isOrgQuery ? buildOrgInsightReport(chatContext) : null,

    });

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

            <h3>{activeThread.title}</h3>

            <p className="analysis-chat__header-desc">

              데이터 기반 정보 제공 · 범위 확인 후 대화로 조정·심화

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



          {loading && (

            <div className="analysis-chat__message analysis-chat__message--assistant">

              <div className="analysis-chat__bubble analysis-chat__bubble--loading">

                <strong>정보 조회 중</strong>

                {loadingSec > 0 ? ` · ${loadingSec}초 경과` : ''}

                <p className="analysis-chat__loading-scope">

                  {summarizePayloadScope(dataPayload)}

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


