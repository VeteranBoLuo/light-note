import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useNoteLibraryCacheStore, { buildNoteLibraryListCacheKey } from './noteLibraryCache';

describe('noteLibraryCache', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useRealTimers();
  });

  it('按账号、范围、标签和搜索词隔离列表快照', () => {
    const store = useNoteLibraryCacheStore();
    const firstKey = buildNoteLibraryListCacheKey('user-a', {
      mode: 'directory',
      parentId: 'root-a',
      keyword: ' Test ',
    });
    const secondKey = buildNoteLibraryListCacheKey('user-b', {
      mode: 'tags',
      tagId: 'tag-1',
      keyword: 'test',
    });
    store.writeList(firstKey, { items: [{ id: 'note-a', isCheck: true }], total: 1, page: 1, hasMore: false });
    store.writeList(secondKey, { items: [{ id: 'note-b' }], total: 1, page: 1, hasMore: false });

    expect(store.readList(firstKey)?.items).toEqual([{ id: 'note-a', isCheck: false }]);
    expect(store.readList(secondKey)?.items[0]?.id).toBe('note-b');
  });

  it('只会把指定账号的列表快照标记为过期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const store = useNoteLibraryCacheStore();
    const firstKey = buildNoteLibraryListCacheKey('user-a', { mode: 'directory' });
    const secondKey = buildNoteLibraryListCacheKey('user-b', { mode: 'directory' });
    store.writeList(firstKey, { items: [], total: 0, page: 1, hasMore: false });
    store.writeList(secondKey, { items: [], total: 0, page: 1, hasMore: false });

    store.markListsStale('user-a');

    expect(store.readList(firstKey)?.updatedAt).toBe(0);
    expect(store.readList(secondKey)?.updatedAt).toBe(Date.now());
  });

  it('读取快照时返回副本，不会把界面选中态写回缓存', () => {
    const store = useNoteLibraryCacheStore();
    const key = buildNoteLibraryListCacheKey('user-a', { mode: 'directory' });
    store.writeList(key, { items: [{ id: 'note-a' }], total: 1, page: 1, hasMore: false });
    const snapshot = store.readList(key)!;
    snapshot.items[0].title = 'changed';
    snapshot.items[0].isCheck = true;

    expect(store.readList(key)?.items[0]).toEqual({ id: 'note-a', isCheck: false });
  });
});
