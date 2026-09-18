/** Drafts are keyed by account and post by the editor. Migrate old tab-scoped drafts on read. */
export function readCommunityPostDraft(key: string): string | null {
  const persistent = localStorage.getItem(key);
  if (persistent !== null) return persistent;
  const legacy = sessionStorage.getItem(key);
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    sessionStorage.removeItem(key);
  }
  return legacy;
}

export function writeCommunityPostDraft(key: string, value: string): void {
  localStorage.setItem(key, value);
  sessionStorage.removeItem(key);
}

export function removeCommunityPostDraft(key: string): void {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
