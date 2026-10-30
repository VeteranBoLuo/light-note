export type NoteReferenceType = 'note' | 'file';

export interface NoteReferenceTarget {
  type: NoteReferenceType;
  id: string;
}

export interface NoteReferenceRecent extends NoteReferenceTarget {
  title: string;
}

/** 参考内容写进编辑页地址，刷新与在页面树里切换笔记时保持；不加入浏览器历史。 */
export const NOTE_REFERENCE_QUERY_KEY = 'ref';
const RECENT_STORAGE_PREFIX = 'light-note-note-reference-recent:';
const RECENT_LIMIT = 5;
const MAX_ID_LENGTH = 255;

function normalizeTarget(type: unknown, id: unknown): NoteReferenceTarget | null {
  const normalizedId = String(id ?? '').trim();
  if ((type !== 'note' && type !== 'file') || !normalizedId || normalizedId.length > MAX_ID_LENGTH) return null;
  return { type, id: normalizedId };
}

export function noteReferenceKey(target: NoteReferenceTarget) {
  return `${target.type}:${target.id}`;
}

export function formatNoteReferenceQuery(target: NoteReferenceTarget) {
  return noteReferenceKey(target);
}

export function parseNoteReferenceQuery(value: unknown): NoteReferenceTarget | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const separator = raw.indexOf(':');
  if (separator <= 0) return null;
  return normalizeTarget(raw.slice(0, separator), raw.slice(separator + 1));
}

function recentStorageKey(ownerKey: string) {
  return `${RECENT_STORAGE_PREFIX}${ownerKey || 'guest'}`;
}

/** 最近参考只服务本机快捷选择；按账号隔离，读取失败时退化为空列表。 */
export function readRecentNoteReferences(ownerKey: string): NoteReferenceRecent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentStorageKey(ownerKey)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const target = normalizeTarget(item?.type, item?.id);
        return target ? { ...target, title: String(item?.title || '').slice(0, 200) } : null;
      })
      .filter((item): item is NoteReferenceRecent => Boolean(item))
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberNoteReference(ownerKey: string, item: NoteReferenceRecent): NoteReferenceRecent[] {
  const target = normalizeTarget(item.type, item.id);
  if (!target) return readRecentNoteReferences(ownerKey);
  const key = noteReferenceKey(target);
  const next = [
    { ...target, title: String(item.title || '').slice(0, 200) },
    ...readRecentNoteReferences(ownerKey).filter((recent) => noteReferenceKey(recent) !== key),
  ].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(recentStorageKey(ownerKey), JSON.stringify(next));
  } catch {
    // 受限 WebView 禁止存储时只保留本次内存结果。
  }
  return next;
}

export function forgetNoteReference(ownerKey: string, target: NoteReferenceTarget): NoteReferenceRecent[] {
  const key = noteReferenceKey(target);
  const next = readRecentNoteReferences(ownerKey).filter((recent) => noteReferenceKey(recent) !== key);
  try {
    localStorage.setItem(recentStorageKey(ownerKey), JSON.stringify(next));
  } catch {
    // 同上。
  }
  return next;
}
