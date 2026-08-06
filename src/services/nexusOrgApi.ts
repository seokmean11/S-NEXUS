import type { StoredOrgState } from '@/utils/orgStorage';

export interface NexusOrgMeta {
  exists: boolean;
  updatedAt?: string;
}

export async function fetchNexusOrgMeta(): Promise<NexusOrgMeta | null> {
  try {
    const response = await fetch('/api/nexus-org/meta');
    if (!response.ok) return null;
    return (await response.json()) as NexusOrgMeta;
  } catch {
    return null;
  }
}

export async function fetchNexusOrgState(): Promise<StoredOrgState | null> {
  try {
    const response = await fetch('/api/nexus-org/state');
    if (!response.ok) return null;
    const payload = (await response.json()) as { state?: StoredOrgState | null };
    return payload.state ?? null;
  } catch {
    return null;
  }
}

export async function saveNexusOrgState(state: StoredOrgState): Promise<boolean> {
  try {
    const response = await fetch('/api/nexus-org/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isNexusOrgServerAvailable(): Promise<boolean> {
  const meta = await fetchNexusOrgMeta();
  return meta !== null;
}
