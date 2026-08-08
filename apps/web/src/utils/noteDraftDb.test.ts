import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeNoteDraftDb,
  promoteNoteDraftInDb,
  readNoteDraftFromDb,
  removeNoteDraftFromDb,
  writeNoteDraftToDb,
} from './noteDraftDb';
import { buildNoteDraftIdentityKey, buildNoteDraftStorageKey, type NoteDraftRecord } from './noteDraftStorage';

const identityKey = buildNoteDraftIdentityKey({ actorUserId: 'user-1' });

function draft(noteId: string, updatedAt = Date.now()): NoteDraftRecord {
  return {
    schemaVersion: 1,
    identityKey,
    noteId,
    title: `标题 ${noteId}`,
    content: `正文 ${noteId}`,
    type: 'markdown',
    revision: 3,
    updatedAt,
    parentId: null,
  };
}

describe('noteDraftDb', () => {
  beforeEach(() => {
    closeNoteDraftDb();
    window.localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  afterEach(() => {
    closeNoteDraftDb();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('以 IndexedDB 为主存储，并支持删除与临时 ID 提升', async () => {
    expect(await writeNoteDraftToDb(draft('temporary:abc'))).toBe(true);
    expect(window.localStorage.length).toBe(0);
    expect(await readNoteDraftFromDb(identityKey, 'temporary:abc')).toMatchObject({ revision: 3 });

    await promoteNoteDraftInDb(identityKey, 'temporary:abc', 'note-real', 4);
    expect(await readNoteDraftFromDb(identityKey, 'temporary:abc')).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-real')).toMatchObject({ noteId: 'note-real', revision: 4 });

    await removeNoteDraftFromDb(identityKey, 'note-real');
    expect(await readNoteDraftFromDb(identityKey, 'note-real')).toBeNull();
  });

  it('每个身份最多保留 20 条，并清理超过 30 天的草稿', async () => {
    const base = Date.now();
    await writeNoteDraftToDb(draft('expired', base - 31 * 24 * 60 * 60 * 1000));
    for (let index = 0; index < 22; index += 1) {
      await writeNoteDraftToDb(draft(`note-${index}`, base + index));
    }

    expect(await readNoteDraftFromDb(identityKey, 'expired')).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-0')).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-1')).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-2')).toMatchObject({ noteId: 'note-2' });
    expect(await readNoteDraftFromDb(identityKey, 'note-21')).toMatchObject({ noteId: 'note-21' });
  });

  it('IndexedDB 不可用时写入同步应急副本，恢复后自动迁移并清掉副本', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await writeNoteDraftToDb(draft('note-fallback'))).toBe(true);
    const storageKey = buildNoteDraftStorageKey(identityKey, 'note-fallback');
    expect(window.localStorage.getItem(storageKey)).toBeTruthy();

    vi.stubGlobal('indexedDB', new IDBFactory());
    expect(await readNoteDraftFromDb(identityKey, 'note-fallback')).toMatchObject({ content: '正文 note-fallback' });
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-fallback')).toMatchObject({ noteId: 'note-fallback' });
  });

  it('IndexedDB 已恢复但临时草稿仍只在 localStorage 时也能提升为正式 ID', async () => {
    const temporary = draft('temporary:legacy');
    window.localStorage.setItem(buildNoteDraftStorageKey(identityKey, temporary.noteId), JSON.stringify(temporary));

    await promoteNoteDraftInDb(identityKey, temporary.noteId, 'note-promoted', 7);

    expect(window.localStorage.getItem(buildNoteDraftStorageKey(identityKey, temporary.noteId))).toBeNull();
    expect(await readNoteDraftFromDb(identityKey, 'note-promoted')).toMatchObject({
      noteId: 'note-promoted',
      revision: 7,
      content: temporary.content,
    });
  });
});
