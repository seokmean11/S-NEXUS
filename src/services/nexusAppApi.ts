import type { HistoryEvent } from '@/types/history';
import type { StoredAppState } from '@/utils/orgStorage';

export interface NexusAppBundle {
  savedAt: string;
  app: StoredAppState;
  history: HistoryEvent[];
}

export async function fetchNexusAppBundle(): Promise<{
  bundle: NexusAppBundle | null;
  writable: boolean;
}> {
  try {
    const response = await fetch('/api/nexus-app/state');
    if (!response.ok) return { bundle: null, writable: false };
    const payload = (await response.json()) as {
      bundle?: NexusAppBundle | null;
      writable?: boolean;
    };
    return {
      bundle: payload.bundle ?? null,
      writable: payload.writable === true,
    };
  } catch {
    return { bundle: null, writable: false };
  }
}

export async function saveNexusAppBundle(bundle: NexusAppBundle): Promise<boolean> {
  try {
    const response = await fetch('/api/nexus-app/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
