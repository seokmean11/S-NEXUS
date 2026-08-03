import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MOCK_BIDS } from '@/data/mockBidData';
import { formatClaudeError } from '@/services/claudeAnalysis';
import {
  buildBidAnalysisPayload,
  isClaudeQuotaError,
  sendBidAnalysisMessage,
} from '@/services/bidClaudeAnalysis';
import type { Bid } from '@/types/bid';
import { getClaudeApiKey, hasClaudeApiKey, saveClaudeApiKey } from '@/utils/claudeApiKey';
import { parseMarkdownTables, stripMarkdownTables } from '@/utils/markdownTableParser';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

const SUGGESTED_PROMPTS = [
  '진행 중 입찰 일정과 리스크 분석해줘',
  '7일 내 마감 입찰 우선순위 정리해줘',
  '사업본부별 입찰 현황 요약해줘',
];

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

interface BidAnalysisChatbotProps {
  bids?: Bid[];
}

export function BidAnalysisChatbot({ bids = MOCK_BIDS }: BidAnalysisChatbotProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getClaudeApiKey());
  const [settingsOpen, setSettingsOpen] = useState(() => !hasClaudeApiKey());
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: hasClaudeApiKey()
        ? `입찰 AI 분석입니다. 등록 입찰 ${bids.length}건을 기준으로 Claude가 일정·리스크·전략을 분석합니다.`
        : 'Claude API 키를 설정하면 입찰 AI 분석을 사용할 수 있습니다.',
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const localSummary = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400000;
    const upcoming = bids.filter((bid) => {
      const deadline = new Date(bid.bidDeadline).getTime();
      return deadline >= now && deadline <= now + week && bid.status !== '낙찰';
    }).length;
    return `전체 ${bids.length}건 · 진행 ${bids.filter((b) => b.status === '진행').length}건 · 7일 내 마감 ${upcoming}건`;
  }, [bids]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const submitQuery = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'user', text: trimmed },
        {
          id: createId(),
          role: 'assistant',
          text: 'Claude API 키가 필요합니다. API 설정에서 키를 입력해 주세요.',
          error: true,
        },
      ]);
      setInput('');
      return;
    }

    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const reply = await sendBidAnalysisMessage({
        apiKey,
        query: trimmed,
        payload: buildBidAnalysisPayload(bids, trimmed),
      });
      const tables = parseMarkdownTables(reply);
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: tables.length > 0 ? stripMarkdownTables(reply) : reply,
        },
      ]);
    } catch (error) {
      if (isClaudeQuotaError(error)) {
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            text: `Claude 사용 한도 초과로 AI 분석을 사용할 수 없습니다.\n\n로컬 요약: ${localSummary}`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            text: formatClaudeError(error),
            error: true,
          },
        ]);
      }
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  return (
    <div className="analysis-chat bid-analysis-chat">
      <div className="analysis-chat__header">
        <div>
          <h3>입찰 AI 분석</h3>
          <p>입찰 일정·리스크·사업본부별 현황을 Claude로 분석합니다.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
          API 설정
        </Button>
      </div>

      {settingsOpen && (
        <div className="analysis-chat__settings no-print">
          <div className="analysis-chat__settings-row">
            <input
              className="analysis-chat__input"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                saveClaudeApiKey(apiKeyInput);
                setSettingsOpen(false);
              }}
            >
              저장
            </Button>
          </div>
        </div>
      )}

      <div className="analysis-chat__suggestions no-print">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="analysis-chat__suggestion"
            disabled={loading}
            onClick={() => void submitQuery(prompt)}
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
            </div>
          </div>
        ))}
        {loading && (
          <div className="analysis-chat__message analysis-chat__message--assistant">
            <div className="analysis-chat__bubble analysis-chat__bubble--loading">
              Claude가 입찰 데이터를 분석 중…
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
            placeholder="예: 마감 임박 입찰 우선순위 분석"
            disabled={loading}
          />
          <Button type="submit" variant="primary" disabled={loading || !input.trim()}>
            {loading ? '분석 중…' : '전송'}
          </Button>
        </div>
      </form>
    </div>
  );
}
