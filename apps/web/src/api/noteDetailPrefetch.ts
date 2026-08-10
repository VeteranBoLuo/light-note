import { apiBasePost } from '@/http/request';

const NOTE_DETAIL_PREFETCH_TTL = 15_000;
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
    { id: noteId },
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
    // 同一点击可能同时触发桌面预览、路由切换等多个消费者。等请求真正落定后再清理，
    // 让并发消费者继续复用同一个 Promise；落定即删又避免 15 秒内重开读到旧正文。
    const clearSettledEntry = () => {
      if (entries.get(key) === entry) entries.delete(key);
    };
    void entry.promise.then(clearSettledEntry, clearSettledEntry);
    return entry.promise;
  }
  if (entry) entries.delete(key);
  return createRequest(identity, normalizedId);
}

export function clearNoteDetailPrefetch() {
  entries.clear();
}
