import type { StoredOrgState } from '@/utils/orgStorage';

export interface NexusOrgMeta {
  exists: boolean;
  updatedAt?: string;
  dataSource?: 'local' | 'drive-cache';
  driveConfigured?: boolean;
  driveUploadConfigured?: boolean;
  lastDriveSyncAt?: string;
}

const ORG_AUTO_REFRESH_INTERVAL_MS = 60_000;

export { ORG_AUTO_REFRESH_INTERVAL_MS };

export async function fetchNexusOrgMeta(): Promise<NexusOrgMeta | null> {
  try {
    const response = await fetch('/api/nexus-org/meta');
    if (!response.ok) return null;
    return (await response.json()) as NexusOrgMeta;
  } catch {
    return null;
  }
}

export async function fetchNexusOrgState(): Promise<{
  state: StoredOrgState | null;
  meta: NexusOrgMeta | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    const response = await fetch('/api/nexus-org/state', { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return { state: null, meta: null };
    const payload = (await response.json()) as {
      state?: StoredOrgState | null;
      meta?: NexusOrgMeta;
    };
    return {
      state: payload.state ?? null,
      meta: payload.meta ?? null,
    };
  } catch {
    return { state: null, meta: null };
  }
}

export async function saveNexusOrgState(state: StoredOrgState): Promise<NexusOrgMeta | null> {
  try {
    const response = await fetch('/api/nexus-org/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { meta?: NexusOrgMeta };
    return payload.meta ?? null;
  } catch {
    return null;
  }
}

export async function isNexusOrgServerAvailable(): Promise<boolean> {
  const meta = await fetchNexusOrgMeta();
  return meta !== null;
}
