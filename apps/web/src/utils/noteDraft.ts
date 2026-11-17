export interface NoteDraftContent {
  title: string;
  content: string;
  type: 'html' | 'markdown' | 'drawing';
  revision: number;
}

interface StoredNoteDraft extends NoteDraftContent {
  updatedAt: number;
  writeId: string;
}

const DRAFT_DATABASE = 'lightnote-note-editor';
const STORE = 'drafts';
const WRITE_INTERVAL = 200;
const ENTRY_KEY = 'lightnoteNewNoteDraft';
let openingDatabase: Promise<IDBDatabase> | undefined;

function draftDatabase() {
  if (!openingDatabase) {
    openingDatabase = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DRAFT_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          openingDatabase = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Draft database is blocked'));
    }).catch((error) => {
      openingDatabase = undefined;
      throw error;
    });
  }
  return openingDatabase;
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, setResult: (result: T) => void) => void,
): Promise<T | undefined> {
  const db = await draftDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
    run(tx.objectStore(STORE), (value) => { result = value; });
  });
}

function newToken() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newNoteDraftEntry(scope: string, source: string): string {
  const current = window.history.state?.[ENTRY_KEY];
  if (current?.scope === scope && current?.source === source && typeof current.token === 'string') {
    return current.token;
  }
  const token = newToken();
  try {
    window.history.replaceState({ ...window.history.state, [ENTRY_KEY]: { scope, source, token } }, '');
  } catch {
    // Some embedded views disallow updating history. That must not prevent editing or cloud saving.
  }
  return token;
}

export function sameNoteDraftContent(left: NoteDraftContent, right: NoteDraftContent) {
  return left.title === right.title && left.content === right.content && left.type === right.type;
}

export function createNoteDraftSession(scope: string, noteKey: string) {
  const key = JSON.stringify([scope, noteKey]);
  const editorToken = newToken();
  let writeNumber = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: StoredNoteDraft | undefined;
  let lastStoredWrite: string | undefined;
  let inOrder = Promise.resolve();

  function enqueue(work: () => Promise<void>) {
    // A blocked or full local database must never prevent cloud saves.
    inOrder = inOrder.then(work).catch(() => {});
    return inOrder;
  }

  async function read() {
    try {
      const draft = await transaction<StoredNoteDraft>('readonly', (store, setResult) => {
        const request = store.get(key);
        request.onsuccess = () => setResult(request.result);
      });
      if (!draft) return undefined;
      lastStoredWrite = draft.writeId;
      return draft;
    } catch {
      return undefined;
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    const current = pending;
    pending = undefined;
    if (!current) return inOrder.then(() => true);
    return enqueue(async () => {
      await transaction('readwrite', (store) => { store.put(current, key); });
      lastStoredWrite = current.writeId;
    }).then(() => lastStoredWrite === current.writeId);
  }

  function stage(content: NoteDraftContent) {
    pending = { ...content, updatedAt: Date.now(), writeId: `${editorToken}:${++writeNumber}` };
    timer ??= setTimeout(flush, WRITE_INTERVAL);
  }

  function clear() {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    return enqueue(async () => {
      const expected = lastStoredWrite;
      if (!expected) return;
      await transaction('readwrite', (store) => {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result?.writeId === expected) store.delete(key);
        };
      });
      lastStoredWrite = undefined;
    });
  }

  return { read, stage, flush, clear };
}
