import {
  NOTE_DRAFT_LIMIT_PER_IDENTITY,
  NOTE_DRAFT_MAX_AGE_MS,
  buildNoteDraftStorageKey,
  normalizeNoteDraftRecord,
  readNoteDraft,
  removeNoteDraft,
  writeNoteDraft,
  type NoteDraftRecord,
} from './noteDraftStorage';

const NOTE_DRAFT_DB_NAME = 'lightnote-note-drafts-v1';
const NOTE_DRAFT_DB_VERSION = 1;
const NOTE_DRAFT_STORE = 'noteDrafts';

type PersistedNoteDraft = NoteDraftRecord & { key: string };

let openDatabasePromise: Promise<IDBDatabase> | null = null;
let draftOperationQueue: Promise<unknown> = Promise.resolve();

function fallbackStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.reject(new Error('INDEXED_DB_UNAVAILABLE'));
  if (openDatabasePromise) return openDatabasePromise;
  openDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(NOTE_DRAFT_DB_NAME, NOTE_DRAFT_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(NOTE_DRAFT_STORE)
        ? request.transaction?.objectStore(NOTE_DRAFT_STORE)
        : database.createObjectStore(NOTE_DRAFT_STORE, { keyPath: 'key' });
      if (store && !store.indexNames.contains('identityKey')) store.createIndex('identityKey', 'identityKey');
      if (store && !store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', 'updatedAt');
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        openDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      openDatabasePromise = null;
      reject(request.error || new Error('INDEXED_DB_OPEN_FAILED'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      openDatabasePromise = null;
      reject(new Error('INDEXED_DB_OPEN_BLOCKED'));
    };
  });
  return openDatabasePromise;
}

function enqueueDraftOperation<T>(operation: () => Promise<T>): Promise<T> {
  const task = draftOperationQueue.catch(() => undefined).then(operation);
  draftOperationQueue = task.catch(() => undefined);
  return task;
}

async function readFromIndexedDb(identityKey: string, noteId: string) {
  const database = await openDatabase();
  const key = buildNoteDraftStorageKey(identityKey, noteId);
  return await new Promise<NoteDraftRecord | null>((resolve, reject) => {
    const transaction = database.transaction(NOTE_DRAFT_STORE, 'readwrite');
    const store = transaction.objectStore(NOTE_DRAFT_STORE);
    const request = store.get(key);
    let result: NoteDraftRecord | null = null;
    request.onsuccess = () => {
      result = normalizeNoteDraftRecord(request.result, identityKey, noteId);
      if (!result && request.result) store.delete(key);
    };
    request.onerror = () => reject(request.error || new Error('NOTE_DRAFT_READ_FAILED'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('NOTE_DRAFT_READ_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('NOTE_DRAFT_READ_ABORTED'));
  });
}

async function writeToIndexedDb(draft: NoteDraftRecord) {
  const database = await openDatabase();
  const persisted: PersistedNoteDraft = {
    ...draft,
    key: buildNoteDraftStorageKey(draft.identityKey, draft.noteId),
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(NOTE_DRAFT_STORE, 'readwrite');
    const store = transaction.objectStore(NOTE_DRAFT_STORE);
    store.put(persisted);

    // 每个身份域独立执行 TTL 与数量收敛，避免管理员代管上下文或其他账号的草稿互相挤占。
    const allRequest = store.index('identityKey').getAll(draft.identityKey);
    allRequest.onsuccess = () => {
      const now = Date.now();
      const records = (allRequest.result as PersistedNoteDraft[])
        .filter((item) => item?.key)
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
      records.forEach((item, index) => {
        const expired = now - Number(item.updatedAt || 0) > NOTE_DRAFT_MAX_AGE_MS;
        if (expired || index >= NOTE_DRAFT_LIMIT_PER_IDENTITY) store.delete(item.key);
      });
    };
    allRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('NOTE_DRAFT_WRITE_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('NOTE_DRAFT_WRITE_ABORTED'));
  });
}

async function removeFromIndexedDb(identityKey: string, noteId: string) {
  const database = await openDatabase();
  const key = buildNoteDraftStorageKey(identityKey, noteId);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(NOTE_DRAFT_STORE, 'readwrite');
    transaction.objectStore(NOTE_DRAFT_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('NOTE_DRAFT_DELETE_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('NOTE_DRAFT_DELETE_ABORTED'));
  });
}

export function readNoteDraftFromDb(identityKey: string, noteId: string) {
  return enqueueDraftOperation(async () => {
    try {
      const indexedDraft = await readFromIndexedDb(identityKey, noteId);
      if (indexedDraft) return indexedDraft;
    } catch {
      // IndexedDB 被禁用、配额异常或旧 WebView 打开失败时，继续读取同步应急副本。
    }

    const storage = fallbackStorage();
    const fallbackDraft = storage ? readNoteDraft(storage, identityKey, noteId) : null;
    if (!fallbackDraft) return null;
    try {
      await writeToIndexedDb(fallbackDraft);
      removeNoteDraft(storage!, identityKey, noteId);
    } catch {
      // 迁移失败时保留应急副本，下一次仍可恢复。
    }
    return fallbackDraft;
  });
}

export function writeNoteDraftToDb(draft: NoteDraftRecord) {
  return enqueueDraftOperation(async () => {
    const storage = fallbackStorage();
    try {
      await writeToIndexedDb(draft);
      if (storage) removeNoteDraft(storage, draft.identityKey, draft.noteId);
      return true;
    } catch {
      return storage ? writeNoteDraft(storage, draft) : false;
    }
  });
}

export function removeNoteDraftFromDb(identityKey: string, noteId: string) {
  return enqueueDraftOperation(async () => {
    try {
      await removeFromIndexedDb(identityKey, noteId);
    } catch {
      // 仍要清理可能存在的同步应急副本。
    }
    const storage = fallbackStorage();
    if (storage) removeNoteDraft(storage, identityKey, noteId);
  });
}

export function promoteNoteDraftInDb(
  identityKey: string,
  temporaryNoteId: string,
  persistedNoteId: string,
  revision = 1,
) {
  return enqueueDraftOperation(async () => {
    let draft: NoteDraftRecord | null = null;
    try {
      draft = await readFromIndexedDb(identityKey, temporaryNoteId);
    } catch {
      // IndexedDB 不可用时继续尝试同步应急副本。
    }
    // 旧版本只写 localStorage；即使 IndexedDB 已恢复且读取成功返回 null，也要迁移这份遗留草稿。
    if (!draft) {
      const storage = fallbackStorage();
      draft = storage ? readNoteDraft(storage, identityKey, temporaryNoteId) : null;
    }
    if (!draft) return null;
    const promoted: NoteDraftRecord = {
      ...draft,
      noteId: persistedNoteId,
      revision: Math.max(1, Number(revision || 1)),
      updatedAt: Date.now(),
    };
    try {
      await writeToIndexedDb(promoted);
      await removeFromIndexedDb(identityKey, temporaryNoteId);
      const storage = fallbackStorage();
      if (storage) {
        removeNoteDraft(storage, identityKey, temporaryNoteId);
        removeNoteDraft(storage, identityKey, persistedNoteId);
      }
      return promoted;
    } catch {
      const storage = fallbackStorage();
      if (!storage || !writeNoteDraft(storage, promoted)) return null;
      removeNoteDraft(storage, identityKey, temporaryNoteId);
      return promoted;
    }
  });
}

export function closeNoteDraftDb() {
  const current = openDatabasePromise;
  openDatabasePromise = null;
  void current?.then((database) => database.close()).catch(() => undefined);
}
