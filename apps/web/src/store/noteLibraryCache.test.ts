import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useNoteLibraryCacheStore, {
  NOTE_LIBRARY_RETURN_SCROLL_TTL_MS,
  buildNoteLibraryListCacheKey,
} from './noteLibraryCache';

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

  it('只同步指定账号快照中的笔记待整理状态，并保留快照新鲜度', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    const store = useNoteLibraryCacheStore();
    const firstKey = buildNoteLibraryListCacheKey('user-a', { mode: 'directory' });
    const secondKey = buildNoteLibraryListCacheKey('user-a', { mode: 'tags', tagId: 'tag-a' });
    const otherUserKey = buildNoteLibraryListCacheKey('user-b', { mode: 'directory' });
    store.writeList(firstKey, {
      items: [{ id: 'note-a', isPending: false }],
      total: 1,
      page: 1,
      hasMore: false,
    });
    store.writeList(secondKey, {
      items: [{ id: 'note-a', isPending: false }],
      total: 1,
      page: 1,
      hasMore: false,
    });
    store.writeList(otherUserKey, {
      items: [{ id: 'note-a', isPending: false }],
      total: 1,
      page: 1,
      hasMore: false,
    });

    store.updateNotePendingState('user-a', 'note-a', true);

    expect(store.readList(firstKey)).toMatchObject({ updatedAt: Date.now(), items: [{ isPending: true }] });
    expect(store.readList(secondKey)).toMatchObject({ updatedAt: Date.now(), items: [{ isPending: true }] });
    expect(store.readList(otherUserKey)?.items[0]?.isPending).toBe(false);
  });

  it('按列表范围隔离一次性返回位置，并允许恢复后清除', () => {
    const store = useNoteLibraryCacheStore();
    const firstKey = buildNoteLibraryListCacheKey('user-a', { mode: 'directory', parentId: 'folder-a' });
    const secondKey = buildNoteLibraryListCacheKey('user-a', { mode: 'tags', tagId: 'tag-a' });
    const snapshot = {
      top: 640,
      left: 0,
      viewMode: 'card',
      routeFullPath: '/noteLibrary?parent=folder-a',
      loadedPage: 3,
    };

    store.writeReturnScroll(firstKey, snapshot);

    expect(store.readReturnScroll(firstKey)).toMatchObject(snapshot);
    expect(store.readReturnScroll(secondKey)).toBeNull();
    store.clearReturnScroll(firstKey);
    expect(store.readReturnScroll(firstKey)).toBeNull();
  });

  it('返回位置只保留在短期内存会话中', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'));
    const store = useNoteLibraryCacheStore();
    const key = buildNoteLibraryListCacheKey('user-a', { mode: 'directory' });
    store.writeReturnScroll(key, {
      top: 240,
      left: 0,
      viewMode: 'list',
      routeFullPath: '/noteLibrary',
      loadedPage: 1,
    });

    vi.advanceTimersByTime(NOTE_LIBRARY_RETURN_SCROLL_TTL_MS + 1);

    expect(store.readReturnScroll(key)).toBeNull();
  });
});
