import { apiBasePost } from '@/http/request';

const NOTE_DETAIL_PREFETCH_TTL = 30_000;
const NOTE_DETAIL_LOCAL_SNAPSHOT_TTL = 2 * 60_000;
const NOTE_DETAIL_INTERACTIVE_TIMEOUT = 15_000;
const MAX_PREFETCH_ENTRIES = 8;

export interface NoteDetailRequestIdentity {
  id?: string;
  role?: string;
  visitorWorkspace?: boolean;
  adminContext?: {
    id?: string;
    subjectUserId?: string;
    mode?: string;
  } | null;
}

type NoteDetailResponse = Awaited<ReturnType<typeof apiBasePost>>;

interface PrefetchEntry {
  expiresAt: number;
  promise: Promise<NoteDetailResponse>;
}

const entries = new Map<string, PrefetchEntry>();

export function buildNoteDetailRequestScope(identity: NoteDetailRequestIdentity) {
  return [
    identity.id || 'anonymous',
    identity.role || '',
    identity.visitorWorkspace ? 'visitor-workspace' : '',
    identity.adminContext?.id || '',
    identity.adminContext?.subjectUserId || '',
    identity.adminContext?.mode || '',
  ].join('|');
}

function cacheKey(identity: NoteDetailRequestIdentity, noteId: string) {
  return `${buildNoteDetailRequestScope(identity)}::${noteId}`;
}

function pruneEntries(now = Date.now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size >= MAX_PREFETCH_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
}

function createRequest(identity: NoteDetailRequestIdentity, noteId: string) {
  const key = cacheKey(identity, noteId);
  const promise = apiBasePost(
    '/api/note/getNoteDetail',
    { id: noteId, drawingSceneVersion: 1 },
    {
      silent: true,
      timeout: NOTE_DETAIL_INTERACTIVE_TIMEOUT,
    },
  );
  const entry: PrefetchEntry = {
    expiresAt: Date.now() + NOTE_DETAIL_PREFETCH_TTL,
    promise,
  };
  entries.set(key, entry);
  // 点击后用户仍可能取消导航。预取失败也必须被消费，避免产生未处理 Promise；
  // 但保留原 Promise 的拒绝状态，真正进入详情页时仍能渲染重试界面。
  void promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return promise;
}

export function prefetchNoteDetail(identity: NoteDetailRequestIdentity, noteId: string) {
  const normalizedId = String(noteId || '').trim();
  if (!normalizedId || normalizedId === 'add') return null;
  const now = Date.now();
  pruneEntries(now);
  const key = cacheKey(identity, normalizedId);
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  return createRequest(identity, normalizedId);
}

export function consumeNoteDetail(identity: NoteDetailRequestIdentity, noteId: string) {
  const normalizedId = String(noteId || '').trim();
  const key = cacheKey(identity, normalizedId);
  const entry = entries.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    // 返回笔记库后短时间再进入同一篇时复用已落定结果，避免弱网下每次都重走详情请求。
    // 保存、删除、置顶等写操作会主动调用 invalidateNoteDetailPrefetch 失效。
    return entry.promise;
  }
  if (entry) entries.delete(key);
  return createRequest(identity, normalizedId);
}

/**
 * 保存成功或离开编辑器时，用当前已由服务端确认的正文回填短期详情快照。
 * 这样返回笔记库后再次打开同一篇，不会因为写操作刚使预取失效而立刻重复走弱网请求。
 */
export function seedNoteDetail(
  identity: NoteDetailRequestIdentity,
  noteId: string,
  data: Record<string, unknown>,
) {
  const normalizedId = String(noteId || '').trim();
  if (!normalizedId || normalizedId === 'add') return null;
  pruneEntries();
  const response = { status: 200, msg: '', data } as NoteDetailResponse;
  const promise = Promise.resolve(response);
  entries.set(cacheKey(identity, normalizedId), {
    expiresAt: Date.now() + NOTE_DETAIL_LOCAL_SNAPSHOT_TTL,
    promise,
  });
  return promise;
}

export function invalidateNoteDetailPrefetch(identity: NoteDetailRequestIdentity, noteId?: string) {
  const normalizedId = String(noteId || '').trim();
  if (normalizedId) {
    entries.delete(cacheKey(identity, normalizedId));
    return;
  }
  const scopePrefix = `${buildNoteDetailRequestScope(identity)}::`;
  for (const key of entries.keys()) {
    if (key.startsWith(scopePrefix)) entries.delete(key);
  }
}

export function clearNoteDetailPrefetch() {
  entries.clear();
}
