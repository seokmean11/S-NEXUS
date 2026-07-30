import type { HistoryAction, HistoryCategory, HistoryEvent } from '@/types/history';
import { appendHistoryEvent } from '@/utils/historyStorage';

export function getQuarterInfo(date = new Date()): {
  year: number;
  quarter: 1 | 2 | 3 | 4;
} {
  const year = date.getFullYear();
  const quarter = Math.ceil((date.getMonth() + 1) / 3) as 1 | 2 | 3 | 4;
  return { year, quarter };
}

interface LogParams {
  category: HistoryCategory;
  action: HistoryAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function logHistory(params: LogParams): HistoryEvent {
  const occurredAt = new Date().toISOString();
  const { year, quarter } = getQuarterInfo(new Date(occurredAt));
  const event: HistoryEvent = {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    occurredAt,
    year,
    quarter,
    ...params,
  };
  appendHistoryEvent(event);
  return event;
}
