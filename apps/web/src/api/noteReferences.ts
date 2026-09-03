import { apiBasePost } from '@/http/request.ts';
import {
  buildResourceHref,
  parseResourceHref,
  type ResourceRef,
  type ResourceRefType,
  type ResolvedResourceRefState,
} from '@/utils/noteResourceRefs';

export interface ResourceReferenceNavigation {
  target: 'note-detail' | 'bookmark-url' | 'cloud-file';
  fileId?: string;
}

export interface ResolvedResourceReference extends ResolvedResourceRefState {
  url?: string;
  navigation: ResourceReferenceNavigation | null;
}

export interface ResourceBacklinkItem {
  sourceType: 'note' | 'todo';
  id: string;
  title: string;
  updateTime: string | null;
  status?: 'pending' | 'completed';
}

export interface ResourceBacklinksResult {
  available: boolean;
  items: ResourceBacklinkItem[];
  hasMore: boolean;
  hasMoreByType: Record<ResourceBacklinkItem['sourceType'], boolean>;
}

function normalizeRef(value: unknown): ResourceRef | null {
  const raw = value as Partial<ResourceRef> | null;
  const href = buildResourceHref({ type: raw?.type as ResourceRefType, id: String(raw?.id || '') });
  return href ? parseResourceHref(href) : null;
}

function dedupeRefs(refs: readonly ResourceRef[]) {
  const seen = new Set<string>();
  const normalized: ResourceRef[] = [];
  for (const value of refs) {
    const ref = normalizeRef(value);
    if (!ref) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(ref);
    if (normalized.length >= 100) break;
  }
  return normalized;
}

function expectedNavigation(ref: ResourceRef): ResourceReferenceNavigation {
  if (ref.type === 'note') return { target: 'note-detail' };
  if (ref.type === 'bookmark') return { target: 'bookmark-url' };
  return { target: 'cloud-file', fileId: ref.id };
}

function normalizeNavigation(value: unknown, ref: ResourceRef, available: boolean): ResourceReferenceNavigation | null {
  if (!available) return null;
  const raw = value as Partial<ResourceReferenceNavigation> | null;
  const expected = expectedNavigation(ref);
  if (raw?.target !== expected.target) return expected;
  if (expected.target === 'cloud-file' && String(raw.fileId || '') !== ref.id) return expected;
  return expected;
}

/** 打开笔记时批量解析最多 100 个去重引用；失败时保持空状态，不让未校验链接直接导航。 */
export async function resolveNoteResourceRefs(refs: readonly ResourceRef[]): Promise<ResolvedResourceReference[]> {
  const normalized = dedupeRefs(refs);
  if (!normalized.length) return [];
  const res = await apiBasePost('/api/note/resolveResourceRefs', { refs: normalized }, { silent: true });
  if (res.status !== 200 || !Array.isArray(res.data?.refs)) return [];
  const allowed = new Set(normalized.map((ref) => `${ref.type}:${ref.id}`));
  const results: ResolvedResourceReference[] = [];
  for (const item of res.data.refs) {
    const ref = normalizeRef(item);
    if (!ref || !allowed.has(`${ref.type}:${ref.id}`)) continue;
    const available = item?.available === true;
    results.push({
      ...ref,
      title: available && typeof item?.title === 'string' ? item.title : null,
      available,
      ...(available && ref.type === 'bookmark' && typeof item?.url === 'string' ? { url: item.url } : {}),
      navigation: normalizeNavigation(item?.navigation, ref, available),
    });
  }
  return results;
}

/** 反链读取；服务端二次校验目标与笔记/待办来源的当前归属。 */
export async function fetchResourceBacklinks(
  targetType: ResourceRefType,
  targetId: string,
  limit = 5,
): Promise<ResourceBacklinksResult> {
  const target = normalizeRef({ type: targetType, id: targetId });
  if (!target) return { available: false, items: [], hasMore: false, hasMoreByType: { note: false, todo: false } };
  const res = await apiBasePost(
    '/api/note/resourceBacklinks',
    { targetType: target.type, targetId: target.id, limit },
    { silent: true },
  );
  if (res.status !== 200 || !res.data?.available) {
    return { available: false, items: [], hasMore: false, hasMoreByType: { note: false, todo: false } };
  }
  return {
    available: true,
    items: Array.isArray(res.data.items)
      ? res.data.items
          .map((item: unknown) => {
            const raw = item as Partial<ResourceBacklinkItem> | null;
            const id = String(raw?.id || '');
            if (!id) return null;
            const sourceType = raw?.sourceType === 'todo' ? 'todo' : 'note';
            return {
              sourceType,
              id,
              title: String(raw?.title || ''),
              updateTime: raw?.updateTime ? String(raw.updateTime) : null,
              ...(sourceType === 'todo'
                ? { status: raw?.status === 'completed' ? ('completed' as const) : ('pending' as const) }
                : {}),
            };
          })
          .filter((item): item is ResourceBacklinkItem => Boolean(item))
      : [],
    hasMore: res.data.hasMore === true,
    hasMoreByType: {
      note: res.data.hasMoreByType?.note === true,
      todo: res.data.hasMoreByType?.todo === true,
    },
  };
}
