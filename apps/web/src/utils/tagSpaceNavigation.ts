import { fetchTagSpace, fetchTagSpaces } from '@/api/tagSpace';

const LAST_TAG_SPACE_ID_KEY = 'light-note:last-tag-space-id';

export function readLastTagSpaceId() {
  try {
    return String(window.localStorage.getItem(LAST_TAG_SPACE_ID_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function rememberTagSpaceId(id: string) {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;
  try {
    window.localStorage.setItem(LAST_TAG_SPACE_ID_KEY, normalizedId);
  } catch {
    // 隐私模式或受限 WebView 禁用 storage 时，标签空间仍可按最近活跃标签回退。
  }
}

export function forgetTagSpaceId(id?: string) {
  try {
    const storedId = readLastTagSpaceId();
    if (!id || storedId === String(id).trim()) window.localStorage.removeItem(LAST_TAG_SPACE_ID_KEY);
  } catch {
    // storage 不可用时无需额外处理。
  }
}

export async function resolveRememberedTagSpaceId() {
  const rememberedId = readLastTagSpaceId();
  if (!rememberedId) return '';
  try {
    await fetchTagSpace(rememberedId, 1);
    return rememberedId;
  } catch {
    forgetTagSpaceId(rememberedId);
    return '';
  }
}

export async function resolveTagSpaceEntryId() {
  const rememberedId = await resolveRememberedTagSpaceId();
  if (rememberedId) return rememberedId;
  const result = await fetchTagSpaces({ sort: 'recent', includeEmpty: true, page: 1, pageSize: 1 });
  return String(result.items[0]?.id || '').trim();
}
