import { loadAuthSession } from '@/utils/authStorage';

export function currentWorkspacePersonId(): string {
  return loadAuthSession()?.personId?.trim() || '__anon';
}

export function workspaceStorageKey(baseKey: string, rest = ''): string {
  const personId = currentWorkspacePersonId();
  return rest ? `${baseKey}::${personId}:${rest}` : `${baseKey}::${personId}`;
}

export function removeLocalStorageByPrefix(prefix: string): void {
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function removeSessionStorageByPrefix(prefix: string): void {
  const keysToRemove: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}
