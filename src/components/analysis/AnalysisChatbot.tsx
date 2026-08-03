import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { DEFAULT_CLAUDE_MODEL, formatClaudeError, isClaudeQuotaError } from '@/services/claudeAnalysis';
import { sendAnalysisMessage } from '@/services/analysisClaudeAnalysis';
import { buildAnalysisDataPayload, summarizePayloadScope } from '@/utils/buildAnalysisDataPayload';
import { getClaudeApiKey, hasClaudeApiKey, saveClaudeApiKey } from '@/utils/claudeApiKey';
import { askAnalyticsChatbot, getProjectStatsSummary } from '@/utils/analyticsChatbot';
import { isOrganizationAnalysisQuery } from '@/utils/analysisQueryIntent';
import { buildOrgInsightReport } from '@/utils/orgInsightReport';
import { filterProjectsByQuery } from '@/utils/analysisQueryFilter';
import { parseMarkdownTables, stripMarkdownTables } from '@/utils/markdownTableParser';
import {
  downloadCsv,
  downloadInsightWordReport,
  downloadWordReport,
  type ExportTable,
} from '@/utils/reportExport';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tables?: ExportTable[];
  error?: boolean;
}

const SUGGESTED_PROMPTS = [
  '조직관리 부분 인사이트 보고서 작성해줘',
  '지금 등록된 프로젝트 인사이트 보고서 작성해줘',
  '올해 상반기 사업부별 수주 현황 분석해줘',
  '인테리어 사업부만 골라서 금액 구간별로 다시 정리해줘',
];

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildScopeLabel(canViewAll: boolean, roleLabel: string): string {
  return canViewAll ? '전사' : roleLabel;
}

export function AnalysisChatbot() {
  const {
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
  } = useApp();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [lastQuery, setLastQuery] = useState('');
  const lastRequestAt = useRef(0);
  const [apiKeyInput, setApiKeyInput] = useState(() => getClaudeApiKey());
  const [settingsOpen, setSettingsOpen] = useState(() => !hasClaudeApiKey());
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: hasClaudeApiKey()
        ? `Claude AI 분석 챗봇입니다. ${getProjectStatsSummary({
            projects: visibleProjects,
            contractAmendments,
            divisions,
            teams,
            employees,
            executiveOffice,
            allocations,
            historyEvents,
          })}\n\n자연어로 요청하고, 이어서 "인테리어만", "상반기로 좁혀줘", "표를 엑셀용으로 다시"처럼 **대화로 수정**할 수 있습니다.`
        : `Claude API 키를 설정하면 대화형 AI 분석을 사용할 수 있습니다.\n\n1. Anthropic Console(https://console.anthropic.com/settings/keys)에서 API 키 발급\n2. 아래 설정에 키 입력 후 저장\n3. 또는 프로젝트 루트 .env 파일에 VITE_CLAUDE_API_KEY= 입력`,
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

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
    }),
    [visibleProjects, contractAmendments, divisions, teams, employees, executiveOffice, allocations, historyEvents],
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

  const getConversationTurns = (nextMessages: ChatMessage[]) =>
    nextMessages
      .filter((m) => m.id !== 'welcome' && !m.error)
      .map((m) => ({
        role: m.role,
        text: m.role === 'assistant' ? m.text : m.text,
      })) as { role: 'user' | 'assistant'; text: string }[];

  const submitQuery = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    if (cooldownSec > 0) return;

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

    const userMessage: ChatMessage = { id: createId(), role: 'user', text: trimmed };
    const pendingMessages = [...messages, userMessage];
    setMessages(pendingMessages);
    setInput('');
    setLastQuery(trimmed);
    setLoading(true);
    scrollToBottom();

    try {
      const reply = await sendAnalysisMessage({
        apiKey,
        turns: getConversationTurns(pendingMessages),
        dataPayload: buildAnalysisDataPayload(
          chatContext,
          {
            roleLabel: roleConfig.label,
            scopeLabel: buildScopeLabel(permissions.canViewAll, roleConfig.label),
            budget,
          },
          teams,
          trimmed,
        ),
      });
      const tables = parseMarkdownTables(reply);
      const displayText = tables.length > 0 ? stripMarkdownTables(reply) : reply;

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: displayText,
          tables: tables.length > 0 ? tables : undefined,
        },
      ]);
    } catch (error) {
      if (isClaudeQuotaError(error)) {
        const localResponse = isOrganizationAnalysisQuery(trimmed)
          ? buildOrgInsightReport(chatContext)
          : askAnalyticsChatbot(trimmed, {
              ...chatContext,
              projects: filterProjectsByQuery(chatContext.projects, trimmed).projects,
            });

        const fallbackNote =
          '\n\n---\nClaude **사용 한도**로 AI 분석을 사용할 수 없어, **로컬 분석** 결과입니다. 잠시 후 다시 시도하거나 Anthropic Console에서 한도를 확인해 주세요.';
        const sectionTables =
          localResponse.sections?.map((section) => section.table).filter(Boolean) as
            | ExportTable[]
            | undefined;
        const tables = localResponse.table
          ? [localResponse.table, ...(sectionTables ?? [])]
          : sectionTables;
        const uniqueTables = tables
          ? tables.filter(
              (table, index, array) =>
                array.findIndex(
                  (candidate) => candidate.headers.join('|') === table.headers.join('|'),
                ) === index,
            )
          : undefined;

        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            text: `${localResponse.text}${fallbackNote}`,
            tables: uniqueTables && uniqueTables.length > 0 ? uniqueTables : undefined,
          },
        ]);
        setLoading(false);
        scrollToBottom();
        return;
      }

      const errorText = formatClaudeError(error);
      if (/429|RPM|too many requests/i.test(errorText)) {
        setCooldownUntil(Date.now() + 90_000);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: errorText,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleSaveApiKey = () => {
    saveClaudeApiKey(apiKeyInput);
    setSettingsOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'assistant',
        text: 'Claude API 키가 저장되었습니다. 이제 대화형 분석을 시작할 수 있습니다.',
      },
    ]);
  };

  const exportTableCsv = (table: ExportTable, index: number) => {
    downloadCsv(`AI_분석_표_${index + 1}.csv`, table);
  };

  const exportMessageWord = (message: ChatMessage) => {
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

  const renderTable = (table: ExportTable, keyPrefix: string, tableIndex: number, message: ChatMessage) => (
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
    <div className="analysis-chat">
      <div className="analysis-chat__header">
        <div>
          <h3>Claude AI 분석</h3>
          <p>
            등록된 프로젝트·계약·조직·배분 데이터를 Claude에 연동합니다. 대화로 보고서를 수정·심화 분석하세요.
          </p>
        </div>
        <div className="analysis-chat__header-actions">
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
            API 설정
          </Button>
          <span className="analysis-chat__badge">{hasClaudeApiKey() ? 'CLAUDE' : 'KEY 필요'}</span>
        </div>
      </div>

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
          </p>
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

              {message.role === 'assistant' && !message.error && message.id !== 'welcome' && (
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
              Claude가 데이터를 분석 중입니다…
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
            placeholder="예: 조직관리 인사이트 / 인테리어사업본부 수주 분석"
            disabled={loading}
          />
          <Button type="submit" variant="primary" disabled={loading || cooldownSec > 0 || !input.trim()}>
            {loading ? '분석 중…' : cooldownSec > 0 ? `${cooldownSec}초 후 재시도` : '전송'}
          </Button>
        </div>
        {lastQuery && (
          <p className="analysis-chat__scope-hint">
            분석 범위: {summarizePayloadScope(dataPayload)}
          </p>
        )}
      </form>
    </div>
  );
}
