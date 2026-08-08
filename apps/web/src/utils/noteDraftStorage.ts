export type NoteDraftType = 'html' | 'markdown';

export interface NoteDraftIdentity {
  actorUserId: string;
  subjectUserId?: string;
  role?: string;
  visitorWorkspace?: boolean;
  adminContextId?: string;
  adminContextMode?: string;
}

export interface NoteDraftRecord {
  schemaVersion: 1;
  identityKey: string;
  noteId: string;
  title: string;
  content: string;
  type: NoteDraftType;
  revision: number;
  updatedAt: number;
  parentId?: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const DRAFT_PREFIX = 'light-note:note-draft:v1';
export const NOTE_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const NOTE_DRAFT_LIMIT_PER_IDENTITY = 20;

const normalizedIdentityPart = (value: unknown, fallback = '-') => {
  const text = String(value ?? '').trim();
  return encodeURIComponent(text || fallback);
};

export function buildNoteDraftIdentityKey(identity: NoteDraftIdentity) {
  return [
    normalizedIdentityPart(identity.actorUserId, 'anonymous'),
    normalizedIdentityPart(identity.subjectUserId || identity.actorUserId, 'anonymous'),
    normalizedIdentityPart(identity.role),
    identity.visitorWorkspace ? 'visitor-workspace' : 'regular-workspace',
    normalizedIdentityPart(identity.adminContextMode || 'self'),
    normalizedIdentityPart(identity.adminContextId || 'self'),
  ].join(':');
}

export function buildNoteDraftStorageKey(identityKey: string, noteId: string) {
  return `${DRAFT_PREFIX}:${normalizedIdentityPart(identityKey)}:${normalizedIdentityPart(noteId, 'temporary')}`;
}

export function noteDraftFingerprint(value: Pick<NoteDraftRecord, 'title' | 'content' | 'type' | 'revision'>) {
  return JSON.stringify([
    String(value.title || ''),
    String(value.content || ''),
    value.type,
    Number(value.revision || 1),
  ]);
}

export function normalizeNoteDraftRecord(
  value: unknown,
  expectedIdentityKey: string,
  expectedNoteId: string,
): NoteDraftRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<NoteDraftRecord>;
  const revision = Number(source.revision);
  const updatedAt = Number(source.updatedAt);
  if (
    source.schemaVersion !== 1 ||
    source.identityKey !== expectedIdentityKey ||
    source.noteId !== expectedNoteId ||
    typeof source.title !== 'string' ||
    typeof source.content !== 'string' ||
    !['html', 'markdown'].includes(String(source.type)) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= 0 ||
    Date.now() - updatedAt > NOTE_DRAFT_MAX_AGE_MS
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    identityKey: expectedIdentityKey,
    noteId: expectedNoteId,
    title: source.title,
    content: source.content,
    type: source.type as NoteDraftType,
    revision,
    updatedAt,
    parentId: source.parentId == null ? null : String(source.parentId),
  };
}

export function readNoteDraft(storage: StorageLike, identityKey: string, noteId: string): NoteDraftRecord | null {
  const key = buildNoteDraftStorageKey(identityKey, noteId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = normalizeNoteDraftRecord(JSON.parse(raw), identityKey, noteId);
    if (!draft) storage.removeItem(key);
    return draft;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // 存储不可用时保持无副作用。
    }
    return null;
  }
}

export function writeNoteDraft(storage: StorageLike, draft: NoteDraftRecord) {
  try {
    storage.setItem(buildNoteDraftStorageKey(draft.identityKey, draft.noteId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeNoteDraft(storage: StorageLike, identityKey: string, noteId: string) {
  try {
    storage.removeItem(buildNoteDraftStorageKey(identityKey, noteId));
  } catch {
    // 隐私模式、配额或 WebView 禁用 localStorage 时不影响在线保存主链路。
  }
}

export function promoteNoteDraft(
  storage: StorageLike,
  identityKey: string,
  temporaryNoteId: string,
  persistedNoteId: string,
  revision = 1,
) {
  const draft = readNoteDraft(storage, identityKey, temporaryNoteId);
  if (!draft) return null;
  const promoted: NoteDraftRecord = {
    ...draft,
    noteId: persistedNoteId,
    revision: Math.max(1, Number(revision || 1)),
    updatedAt: Date.now(),
  };
  if (!writeNoteDraft(storage, promoted)) return null;
  removeNoteDraft(storage, identityKey, temporaryNoteId);
  return promoted;
}
