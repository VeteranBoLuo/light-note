import { describe, expect, it } from 'vitest';
import {
  buildNoteDraftIdentityKey,
  buildNoteDraftStorageKey,
  noteDraftFingerprint,
  promoteNoteDraft,
  readNoteDraft,
  removeNoteDraft,
  writeNoteDraft,
  type NoteDraftRecord,
} from './noteDraftStorage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

const identityKey = buildNoteDraftIdentityKey({
  actorUserId: 'root-1',
  subjectUserId: 'user-1',
  role: 'root',
  adminContextMode: 'maintain',
  adminContextId: 'ctx-1',
});

const draft = (noteId = 'note-1'): NoteDraftRecord => ({
  schemaVersion: 1,
  identityKey,
  noteId,
  title: '本地标题',
  content: '# 本地正文',
  type: 'markdown',
  revision: 4,
  updatedAt: Date.now(),
  parentId: null,
});

describe('noteDraftStorage', () => {
  it('按 actor、subject、管理员上下文与 noteId 隔离草稿', () => {
    const storage = memoryStorage();
    expect(writeNoteDraft(storage, draft())).toBe(true);
    expect(readNoteDraft(storage, identityKey, 'note-1')).toMatchObject({ content: '# 本地正文', revision: 4 });
    expect(readNoteDraft(storage, identityKey, 'note-2')).toBeNull();
    expect(buildNoteDraftStorageKey(identityKey, 'note-1')).not.toBe(
      buildNoteDraftStorageKey(buildNoteDraftIdentityKey({ actorUserId: 'user-1' }), 'note-1'),
    );
  });

  it('临时草稿在首次创建后原子提升到真实笔记 ID', () => {
    const storage = memoryStorage();
    writeNoteDraft(storage, draft('temp:abc'));
    expect(promoteNoteDraft(storage, identityKey, 'temp:abc', 'note-real', 1)).toMatchObject({
      noteId: 'note-real',
      revision: 1,
    });
    expect(readNoteDraft(storage, identityKey, 'temp:abc')).toBeNull();
    expect(readNoteDraft(storage, identityKey, 'note-real')).toMatchObject({ noteId: 'note-real' });
    removeNoteDraft(storage, identityKey, 'note-real');
    expect(readNoteDraft(storage, identityKey, 'note-real')).toBeNull();
  });

  it('损坏、过期或身份不匹配的数据不恢复，指纹包含 revision', () => {
    const storage = memoryStorage();
    const key = buildNoteDraftStorageKey(identityKey, 'note-1');
    storage.setItem(key, '{broken');
    expect(readNoteDraft(storage, identityKey, 'note-1')).toBeNull();

    storage.setItem(key, JSON.stringify({ ...draft(), updatedAt: 1 }));
    expect(readNoteDraft(storage, identityKey, 'note-1')).toBeNull();

    expect(noteDraftFingerprint(draft())).not.toBe(noteDraftFingerprint({ ...draft(), revision: 5 }));
  });
});
