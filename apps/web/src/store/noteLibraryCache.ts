import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { NoteTreeFeatures } from '@/api/noteTree';

const MAX_LIST_SNAPSHOTS = 8;
export const NOTE_LIBRARY_LIST_FRESH_MS = 30_000;
export const NOTE_LIBRARY_TAGS_FRESH_MS = 5 * 60_000;
export const NOTE_LIBRARY_FEATURES_FRESH_MS = 5 * 60_000;
export const NOTE_LIBRARY_RETURN_SCROLL_TTL_MS = 12 * 60 * 60_000;

export interface NoteLibraryListSnapshot {
  items: any[];
  total: number;
  page: number;
  hasMore: boolean;
  updatedAt: number;
}

export interface NoteLibraryReturnScrollSnapshot {
  top: number;
  left: number;
  viewMode: string;
  routeFullPath: string;
  loadedPage: number;
  updatedAt: number;
}

interface NoteLibraryTagSnapshot {
  items: any[];
  untaggedCount: number | null;
  totalCount: number | null;
  updatedAt: number;
}

interface NoteLibraryFeatureSnapshot {
  features: NoteTreeFeatures;
  updatedAt: number;
}

export interface NoteLibraryCacheQuery {
  parentId?: string | null;
  tagId?: string | null;
  keyword?: string;
}

function cloneItems(items: any[]) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    ...(Array.isArray(item?.tags) ? { tags: item.tags.map((tag: any) => ({ ...tag })) } : {}),
    isCheck: false,
  }));
}

export function buildNoteLibraryListCacheKey(scope: string, query: NoteLibraryCacheQuery) {
  return JSON.stringify({
    scope: String(scope || 'anonymous'),
    parentId: String(query.parentId || ''),
    tagId: String(query.tagId || ''),
    keyword: String(query.keyword || '')
      .trim()
      .toLowerCase(),
  });
}

export default defineStore('noteLibraryCache', () => {
  const listSnapshots = ref<Record<string, NoteLibraryListSnapshot>>({});
  const returnScrollSnapshots = ref<Record<string, NoteLibraryReturnScrollSnapshot>>({});
  const listAccessOrder = ref<string[]>([]);
  const tagsByScope = ref<Record<string, NoteLibraryTagSnapshot>>({});
  const featuresByScope = ref<Record<string, NoteLibraryFeatureSnapshot>>({});

  function touchListKey(key: string) {
    listAccessOrder.value = [...listAccessOrder.value.filter((item) => item !== key), key];
    while (listAccessOrder.value.length > MAX_LIST_SNAPSHOTS) {
      const oldest = listAccessOrder.value.shift();
      if (oldest) {
        delete listSnapshots.value[oldest];
        delete returnScrollSnapshots.value[oldest];
      }
    }
  }

  function readList(key: string) {
    const snapshot = listSnapshots.value[key];
    if (!snapshot) return null;
    touchListKey(key);
    return {
      ...snapshot,
      items: cloneItems(snapshot.items),
    };
  }

  function writeList(key: string, snapshot: Omit<NoteLibraryListSnapshot, 'updatedAt'>) {
    listSnapshots.value = {
      ...listSnapshots.value,
      [key]: {
        ...snapshot,
        items: cloneItems(snapshot.items),
        updatedAt: Date.now(),
      },
    };
    touchListKey(key);
  }

  function readReturnScroll(key: string) {
    const snapshot = returnScrollSnapshots.value[key];
    if (!snapshot) return null;
    if (Date.now() - snapshot.updatedAt > NOTE_LIBRARY_RETURN_SCROLL_TTL_MS) {
      delete returnScrollSnapshots.value[key];
      return null;
    }
    touchListKey(key);
    return { ...snapshot };
  }

  function writeReturnScroll(key: string, snapshot: Omit<NoteLibraryReturnScrollSnapshot, 'updatedAt'>) {
    returnScrollSnapshots.value = {
      ...returnScrollSnapshots.value,
      [key]: {
        ...snapshot,
        top: Math.max(0, Number(snapshot.top) || 0),
        left: Math.max(0, Number(snapshot.left) || 0),
        loadedPage: Math.max(1, Number(snapshot.loadedPage) || 1),
        updatedAt: Date.now(),
      },
    };
    touchListKey(key);
  }

  function clearReturnScroll(key: string) {
    delete returnScrollSnapshots.value[key];
  }

  function markListsStale(scope: string) {
    const normalizedScope = String(scope || 'anonymous');
    const next = { ...listSnapshots.value };
    for (const [key, snapshot] of Object.entries(next)) {
      try {
        if (JSON.parse(key)?.scope === normalizedScope) next[key] = { ...snapshot, updatedAt: 0 };
      } catch {
        // 忽略旧版本留下的非 JSON key，不得因单条异常清空其他账号快照。
      }
    }
    listSnapshots.value = next;
  }

  /**
   * 待整理是资源关系状态，不应为了切换一个布尔值整页重拉列表。
   * 只更新同一账号已经缓存的笔记副本，并保留原 updatedAt：原本过期的快照仍然过期，
   * 原本新鲜的快照则可以在返回笔记库时立即显示正确角标。
   */
  function updateNotePendingState(scope: string, noteId: string, isPending: boolean) {
    const normalizedScope = String(scope || 'anonymous');
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId) return;
    const next = { ...listSnapshots.value };
    for (const [key, snapshot] of Object.entries(next)) {
      try {
        if (JSON.parse(key)?.scope !== normalizedScope) continue;
      } catch {
        continue;
      }
      let changed = false;
      const items = snapshot.items.map((item) => {
        if (String(item?.id || '') !== normalizedId) return item;
        changed = true;
        return { ...item, isPending };
      });
      if (changed) next[key] = { ...snapshot, items };
    }
    listSnapshots.value = next;
  }

  function readTags(scope: string) {
    const snapshot = tagsByScope.value[String(scope || 'anonymous')];
    if (!snapshot) return null;
    return {
      ...snapshot,
      items: cloneItems(snapshot.items),
    };
  }

  function writeTags(scope: string, snapshot: Omit<NoteLibraryTagSnapshot, 'updatedAt'>) {
    tagsByScope.value = {
      ...tagsByScope.value,
      [String(scope || 'anonymous')]: {
        ...snapshot,
        items: cloneItems(snapshot.items),
        updatedAt: Date.now(),
      },
    };
  }

  function readFeatures(scope: string) {
    const snapshot = featuresByScope.value[String(scope || 'anonymous')];
    return snapshot ? { ...snapshot, features: { ...snapshot.features } } : null;
  }

  function writeFeatures(scope: string, features: NoteTreeFeatures) {
    featuresByScope.value = {
      ...featuresByScope.value,
      [String(scope || 'anonymous')]: {
        features: { ...features },
        updatedAt: Date.now(),
      },
    };
  }

  function reset() {
    listSnapshots.value = {};
    returnScrollSnapshots.value = {};
    listAccessOrder.value = [];
    tagsByScope.value = {};
    featuresByScope.value = {};
  }

  return {
    readList,
    writeList,
    readReturnScroll,
    writeReturnScroll,
    clearReturnScroll,
    markListsStale,
    updateNotePendingState,
    readTags,
    writeTags,
    readFeatures,
    writeFeatures,
    reset,
  };
});
