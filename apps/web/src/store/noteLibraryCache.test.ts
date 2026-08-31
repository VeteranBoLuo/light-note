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
      parentId: 'root-a',
      keyword: ' Test ',
    });
    const secondKey = buildNoteLibraryListCacheKey('user-b', {
      parentId: 'root-a',
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
    const firstKey = buildNoteLibraryListCacheKey('user-a', {});
    const secondKey = buildNoteLibraryListCacheKey('user-b', {});
    store.writeList(firstKey, { items: [], total: 0, page: 1, hasMore: false });
    store.writeList(secondKey, { items: [], total: 0, page: 1, hasMore: false });

    store.markListsStale('user-a');

    expect(store.readList(firstKey)?.updatedAt).toBe(0);
    expect(store.readList(secondKey)?.updatedAt).toBe(Date.now());
  });

  it('移动页面后只删除同账号原父级和新父级的全部列表与返回位置快照', () => {
    const store = useNoteLibraryCacheStore();
    const sourceKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'pc' });
    const targetKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'development' });
    const targetFilteredKey = buildNoteLibraryListCacheKey('user-a', {
      parentId: 'development',
      tagId: 'bugfix',
    });
    const unrelatedKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'app' });
    const otherUserKey = buildNoteLibraryListCacheKey('user-b', { parentId: 'pc' });
    for (const key of [sourceKey, targetKey, targetFilteredKey, unrelatedKey, otherUserKey]) {
      store.writeList(key, { items: [{ id: key }], total: 1, page: 1, hasMore: false });
    }
    store.writeReturnScroll(sourceKey, {
      top: 480,
      left: 0,
      viewMode: 'card',
      routeFullPath: '/noteLibrary?parent=pc',
      loadedPage: 1,
    });

    store.invalidateMovedNoteLists('user-a', {
      id: 'feature-fixes',
      previousParentId: 'pc',
      parentId: 'development',
      moved: true,
    });

    expect(store.readList(sourceKey)).toBeNull();
    expect(store.readList(targetKey)).toBeNull();
    expect(store.readList(targetFilteredKey)).toBeNull();
    expect(store.readReturnScroll(sourceKey)).toBeNull();
    expect(store.readList(unrelatedKey)?.items).toHaveLength(1);
    expect(store.readList(otherUserKey)?.items).toHaveLength(1);
  });

  it('批量移动会同时失效多个来源父级和根层列表', () => {
    const store = useNoteLibraryCacheStore();
    const rootKey = buildNoteLibraryListCacheKey('user-a', { parentId: null });
    const firstSourceKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'folder-a' });
    const secondSourceKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'folder-b' });
    const unrelatedKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'folder-c' });
    for (const key of [rootKey, firstSourceKey, secondSourceKey, unrelatedKey]) {
      store.writeList(key, { items: [], total: 0, page: 1, hasMore: false });
    }

    store.invalidateMovedNoteLists('user-a', {
      items: [
        { id: 'a', previousParentId: 'folder-a', parentId: null, moved: true },
        { id: 'b', previousParentId: 'folder-b', parentId: null, moved: true },
      ],
    });

    expect(store.readList(rootKey)).toBeNull();
    expect(store.readList(firstSourceKey)).toBeNull();
    expect(store.readList(secondSourceKey)).toBeNull();
    expect(store.readList(unrelatedKey)).not.toBeNull();
  });

  it('读取快照时返回副本，不会把界面选中态写回缓存', () => {
    const store = useNoteLibraryCacheStore();
    const key = buildNoteLibraryListCacheKey('user-a', {});
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
    const firstKey = buildNoteLibraryListCacheKey('user-a', {});
    const secondKey = buildNoteLibraryListCacheKey('user-a', { tagId: 'tag-a' });
    const otherUserKey = buildNoteLibraryListCacheKey('user-b', {});
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
    const firstKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'folder-a' });
    const secondKey = buildNoteLibraryListCacheKey('user-a', { parentId: 'folder-a', tagId: 'tag-a' });
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
    const key = buildNoteLibraryListCacheKey('user-a', {});
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
