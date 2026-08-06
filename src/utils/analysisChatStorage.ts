import type { Role } from '@/types';
import type {
  AnalysisChatMessage,
  AnalysisChatRoleStore,
  AnalysisChatStorageRoot,
  AnalysisChatThread,
} from '@/types/analysisChatSession';
import type { PendingAnalysisClarification } from '@/utils/analysisQueryClarification';

const STORAGE_KEY = 'perf-dashboard-analysis-chat-sessions';

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function readRoot(): AnalysisChatStorageRoot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, byRole: {} };
    const parsed = JSON.parse(raw) as AnalysisChatStorageRoot;
    if (parsed.version !== 1 || typeof parsed.byRole !== 'object') {
      return { version: 1, byRole: {} };
    }
    return parsed;
  } catch {
    return { version: 1, byRole: {} };
  }
}

function writeRoot(root: AnalysisChatStorageRoot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
}

export function threadHasUserMessages(messages: AnalysisChatMessage[]): boolean {
  return messages.some((message) => message.role === 'user');
}

export function deriveThreadTitle(messages: AnalysisChatMessage[], fallback = '새 분석 대화'): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return fallback;

  const normalized = firstUser.text.trim().replace(/\s+/g, ' ');
  if (!normalized) return fallback;
  if (normalized.length <= 36) return normalized;
  return `${normalized.slice(0, 36)}…`;
}

export function createAnalysisChatThread(
  welcomeMessages: AnalysisChatMessage[],
  archived = false,
): AnalysisChatThread {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: deriveThreadTitle(welcomeMessages),
    messages: welcomeMessages,
    lastQuery: '',
    pendingClarification: null,
    createdAt: now,
    updatedAt: now,
    archived,
  };
}

export function loadAnalysisChatRoleStore(roleId: Role): AnalysisChatRoleStore | null {
  const root = readRoot();
  return root.byRole[roleId] ?? null;
}

export function saveAnalysisChatRoleStore(store: AnalysisChatRoleStore): void {
  const root = readRoot();
  root.byRole[store.roleId] = store;
  writeRoot(root);
}

export function initAnalysisChatRoleStore(
  roleId: Role,
  welcomeMessages: AnalysisChatMessage[],
): AnalysisChatRoleStore {
  const thread = createAnalysisChatThread(welcomeMessages, false);
  return {
    roleId,
    activeThreadId: thread.id,
    threads: [thread],
  };
}

export function getActiveThread(store: AnalysisChatRoleStore): AnalysisChatThread | null {
  const byId = store.threads.find(
    (thread) => thread.id === store.activeThreadId && !thread.archived,
  );
  if (byId) return byId;

  return store.threads.find((thread) => !thread.archived) ?? null;
}

export function repairAnalysisChatRoleStore(
  store: AnalysisChatRoleStore,
  welcomeMessages: AnalysisChatMessage[],
): AnalysisChatRoleStore {
  const current = getActiveThread(store);
  if (current) {
    if (store.activeThreadId === current.id) return store;
    return {
      ...store,
      activeThreadId: current.id,
      threads: store.threads.map((thread) => ({
        ...thread,
        archived: thread.id !== current.id,
      })),
    };
  }

  const thread = createAnalysisChatThread(welcomeMessages, false);
  return {
    ...store,
    activeThreadId: thread.id,
    threads: [thread, ...store.threads],
  };
}

export function sortThreadsForSidebar(threads: AnalysisChatThread[]): AnalysisChatThread[] {
  return [...threads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function updateThreadById(
  store: AnalysisChatRoleStore,
  threadId: string,
  patch: {
    messages?: AnalysisChatMessage[];
    lastQuery?: string;
    pendingClarification?: PendingAnalysisClarification | null;
    title?: string;
  },
): AnalysisChatRoleStore {
  const now = new Date().toISOString();

  const threads = store.threads.map((thread) => {
    if (thread.id !== threadId) return thread;

    const messages = patch.messages ?? thread.messages;
    const title =
      patch.title ??
      (threadHasUserMessages(messages) ? deriveThreadTitle(messages) : thread.title);

    return {
      ...thread,
      messages,
      lastQuery: patch.lastQuery ?? thread.lastQuery,
      pendingClarification:
        patch.pendingClarification !== undefined
          ? patch.pendingClarification
          : thread.pendingClarification,
      title,
      updatedAt: now,
      archived: thread.archived,
    };
  });

  return { ...store, threads };
}

export function updateActiveThread(
  store: AnalysisChatRoleStore,
  patch: {
    messages?: AnalysisChatMessage[];
    lastQuery?: string;
    pendingClarification?: PendingAnalysisClarification | null;
    title?: string;
  },
): AnalysisChatRoleStore {
  const active = getActiveThread(store);
  if (!active) return store;

  return updateThreadById(store, active.id, patch);
}

function removeThreadById(threads: AnalysisChatThread[], threadId: string): AnalysisChatThread[] {
  return threads.filter((thread) => thread.id !== threadId);
}

export function archiveActiveThread(
  store: AnalysisChatRoleStore,
  title?: string,
): AnalysisChatRoleStore {
  const active = getActiveThread(store);
  if (!active) return store;

  if (!threadHasUserMessages(active.messages)) {
    const remaining = removeThreadById(store.threads, active.id);
    const nextActive = remaining.find((thread) => !thread.archived) ?? remaining[0];
    return {
      ...store,
      threads: remaining,
      activeThreadId: nextActive?.id ?? store.activeThreadId,
    };
  }

  const now = new Date().toISOString();
  const archivedThread: AnalysisChatThread = {
    ...active,
    title: title ?? deriveThreadTitle(active.messages),
    archived: true,
    updatedAt: now,
  };

  const threads = store.threads.map((thread) =>
    thread.id === active.id ? archivedThread : thread,
  );

  return { ...store, threads };
}

export function startNewAnalysisThread(
  store: AnalysisChatRoleStore,
  welcomeMessages: AnalysisChatMessage[],
): AnalysisChatRoleStore {
  const withArchived = archiveActiveThread(store);
  const nextThread = createAnalysisChatThread(welcomeMessages, false);

  return {
    ...withArchived,
    activeThreadId: nextThread.id,
    threads: [nextThread, ...withArchived.threads],
  };
}

export function activateAnalysisThread(
  store: AnalysisChatRoleStore,
  threadId: string,
): AnalysisChatRoleStore {
  const target = store.threads.find((thread) => thread.id === threadId);
  if (!target) return store;

  const withArchived = archiveActiveThread(store);
  const now = new Date().toISOString();

  const threads = withArchived.threads.map((thread) => {
    if (thread.id === threadId) {
      return { ...thread, archived: false, updatedAt: now };
    }
    return thread;
  });

  return {
    ...withArchived,
    activeThreadId: threadId,
    threads,
  };
}

export function prepareStoreForRoleChange(
  _previousRoleId: Role,
  previousStore: AnalysisChatRoleStore,
  nextRoleId: Role,
  welcomeMessages: AnalysisChatMessage[],
): AnalysisChatRoleStore {
  saveAnalysisChatRoleStore(archiveActiveThread(previousStore));

  const existing = loadAnalysisChatRoleStore(nextRoleId);
  if (existing) {
    const repaired = repairAnalysisChatRoleStore(existing, welcomeMessages);
    saveAnalysisChatRoleStore(repaired);
    return repaired;
  }

  const fresh = initAnalysisChatRoleStore(nextRoleId, welcomeMessages);
  saveAnalysisChatRoleStore(fresh);
  return fresh;
}

export function formatAnalysisThreadDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
