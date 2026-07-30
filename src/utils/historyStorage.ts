import type { HistoryEvent } from '@/types/history';

const STORAGE_KEY = 'performance-dashboard-history';

export function loadHistoryEvents(): HistoryEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoryEvents(events: HistoryEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // ignore quota errors
  }
}

export function appendHistoryEvent(event: HistoryEvent): void {
  const events = loadHistoryEvents();
  events.push(event);
  saveHistoryEvents(events);
}
