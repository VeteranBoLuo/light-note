const MAX_REMEMBERED_DRAFTS = 32;
const draftMemory = new Map<string, string>();

function draftKey(identityKey: string, roomSlug: string) {
  return `${String(identityKey || '').trim()}::${String(roomSlug || '').trim()}`;
}

export function getCommunityChatDraft(identityKey: string, roomSlug: string) {
  if (!identityKey || !roomSlug) return '';
  return draftMemory.get(draftKey(identityKey, roomSlug)) || '';
}

export function rememberCommunityChatDraft(identityKey: string, roomSlug: string, value: string) {
  if (!identityKey || !roomSlug) return;
  const key = draftKey(identityKey, roomSlug);
  const draft = String(value || '');
  if (!draft) {
    draftMemory.delete(key);
    return;
  }
  // 刷新页面允许丢失，因此只保存在当前 JS 运行期；同时限制账号/频道切换积累的内存上限。
  draftMemory.delete(key);
  draftMemory.set(key, draft);
  while (draftMemory.size > MAX_REMEMBERED_DRAFTS) {
    const oldestKey = draftMemory.keys().next().value;
    if (!oldestKey) break;
    draftMemory.delete(oldestKey);
  }
}

export function clearCommunityChatDraftMemory() {
  draftMemory.clear();
}
