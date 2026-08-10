import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { NoteTreeFeatures } from '@/api/noteTree';

const MAX_LIST_SNAPSHOTS = 8;
export const NOTE_LIBRARY_LIST_FRESH_MS = 30_000;
export const NOTE_LIBRARY_TAGS_FRESH_MS = 5 * 60_000;
export const NOTE_LIBRARY_FEATURES_FRESH_MS = 5 * 60_000;

export interface NoteLibraryListSnapshot {
  items: any[];
  total: number;
  page: number;
  hasMore: boolean;
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
  mode: 'directory' | 'tags';
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
    mode: query.mode,
    parentId: String(query.parentId || ''),
    tagId: String(query.tagId || ''),
    keyword: String(query.keyword || '').trim().toLowerCase(),
  });
}

export default defineStore('noteLibraryCache', () => {
  const listSnapshots = ref<Record<string, NoteLibraryListSnapshot>>({});
  const listAccessOrder = ref<string[]>([]);
  const tagsByScope = ref<Record<string, NoteLibraryTagSnapshot>>({});
  const featuresByScope = ref<Record<string, NoteLibraryFeatureSnapshot>>({});

  function touchListKey(key: string) {
    listAccessOrder.value = [...listAccessOrder.value.filter((item) => item !== key), key];
    while (listAccessOrder.value.length > MAX_LIST_SNAPSHOTS) {
      const oldest = listAccessOrder.value.shift();
      if (oldest) delete listSnapshots.value[oldest];
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
    listAccessOrder.value = [];
    tagsByScope.value = {};
    featuresByScope.value = {};
  }

  return {
    readList,
    writeList,
    markListsStale,
    readTags,
    writeTags,
    readFeatures,
    writeFeatures,
    reset,
  };
});
