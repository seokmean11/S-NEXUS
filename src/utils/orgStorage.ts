import type { Division, Employee, Team } from '@/types';

const STORAGE_KEY = 'performance-dashboard-org';

export interface StoredOrgState {
  divisions: Division[];
  teams: Team[];
  employees: Employee[];
}

export function loadOrgState(): StoredOrgState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredOrgState;
    if (
      !Array.isArray(parsed.divisions) ||
      !Array.isArray(parsed.teams) ||
      !Array.isArray(parsed.employees)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveOrgState(state: StoredOrgState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable or quota exceeded — ignore
  }
}
