import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import router from '@/router';
import { apiBasePost } from '@/http/request';
import type { NoteBreadcrumbItem, NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';

export const NOTE_TREE_ROOT_KEY = '__light_note_root__';
const NOTE_TREE_EXPANDED_SESSION_KEY = 'light-note-note-tree-expanded-ids';

function readExpandedIds() {
  if (typeof sessionStorage === 'undefined') return new Set<string>();
  try {
    const value = JSON.parse(String(sessionStorage.getItem(NOTE_TREE_EXPANDED_SESSION_KEY) || '[]'));
    if (!Array.isArray(value)) return new Set<string>();
    return new Set(
      value
        .map((item) => String(item || '').trim())
        .filter((item) => item && item.length <= 255)
        .slice(0, 200),
    );
  } catch {
    return new Set<string>();
  }
}

function persistExpandedIds(value: Set<string>) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(NOTE_TREE_EXPANDED_SESSION_KEY, JSON.stringify([...value].slice(0, 200)));
  } catch {
    // 受限 WebView 禁止 sessionStorage 时只保留当前页面内存状态。
  }
}

function queryValue(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw ?? '').trim();
  return normalized || null;
}

function parentKey(parentId: string | null) {
  return parentId || NOTE_TREE_ROOT_KEY;
}

export function useNoteTree(options: { enabled?: Ref<boolean> } = {}) {
  const enabled = computed(() => options.enabled?.value !== false);
  const childrenByParent = ref<Record<string, NoteTreeItem[]>>({});
  const expandedIds = ref<Set<string>>(readExpandedIds());
  const loadingKeys = ref<Set<string>>(new Set());
  const loadedKeys = ref<Set<string>>(new Set());
  const currentBreadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const treeError = ref('');
  const treeSearchChildrenByParent = ref<Record<string, NoteTreeItem[]>>({});
  const treeSearchExpandedIds = ref<Set<string>>(new Set());
  const treeSearchKeyword = ref('');
  const treeSearchParentId = ref<string | null>(null);
  const treeSearchMatchCount = ref(0);
  const treeSearchLoading = ref(false);
  const treeSearchError = ref('');
  let breadcrumbRequestSeq = 0;
  let searchRequestSeq = 0;
  let disposed = false;

  const currentParentId = computed(() => queryValue(router.currentRoute.value.query.parent));
  const currentDirectoryTitle = computed(() => {
    const items = currentBreadcrumb.value;
    return items[items.length - 1]?.title || '';
  });

  function markSet(source: Set<string>, key: string, enabled: boolean) {
    const next = new Set(source);
    if (enabled) next.add(key);
    else next.delete(key);
    return next;
  }

  async function loadChildren(parentId: string | null = null, force = false) {
    if (!enabled.value) return [];
    const key = parentKey(parentId);
    if (!force && loadedKeys.value.has(key)) return childrenByParent.value[key] || [];
    if (loadingKeys.value.has(key)) return childrenByParent.value[key] || [];
    loadingKeys.value = markSet(loadingKeys.value, key, true);
    treeError.value = '';
    try {
      const response = await apiBasePost('/api/note/queryNoteTree', { parentId, depth: 1 }, { silent: true });
      if (disposed) return [];
      if (response.status !== 200) {
        treeError.value = String(response.msg || 'NOTE_TREE_LOAD_FAILED');
        return [];
      }
      const payload = (response.data || {}) as NoteTreeQueryResult;
      const items = Array.isArray(payload.items) ? payload.items : [];
      childrenByParent.value = { ...childrenByParent.value, [key]: items };
      loadedKeys.value = markSet(loadedKeys.value, key, true);
      return items;
    } catch (error) {
      if (!disposed) treeError.value = error instanceof Error ? error.message : 'NOTE_TREE_LOAD_FAILED';
      return [];
    } finally {
      loadingKeys.value = markSet(loadingKeys.value, key, false);
    }
  }

  async function loadBreadcrumb(noteId: string | null) {
    if (!enabled.value) {
      currentBreadcrumb.value = [];
      return [];
    }
    const seq = ++breadcrumbRequestSeq;
    if (!noteId) {
      currentBreadcrumb.value = [];
      return [];
    }
    try {
      const response = await apiBasePost('/api/note/queryNoteBreadcrumb', { noteId }, { silent: true });
      if (disposed || seq !== breadcrumbRequestSeq) return [];
      if (response.status !== 200) {
        treeError.value = String(response.msg || 'NOTE_TREE_BREADCRUMB_FAILED');
        return [];
      }
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      currentBreadcrumb.value = items;
      await revealBreadcrumb(items);
      return items;
    } catch (error) {
      if (!disposed && seq === breadcrumbRequestSeq) {
        treeError.value = error instanceof Error ? error.message : 'NOTE_TREE_BREADCRUMB_FAILED';
      }
      return [];
    }
  }

  async function revealBreadcrumb(items: NoteBreadcrumbItem[]) {
    await loadChildren(null);
    for (const item of items.slice(0, -1)) {
      expandedIds.value = markSet(expandedIds.value, item.id, true);
      await loadChildren(item.id);
    }
  }

  async function toggleExpanded(node: NoteTreeItem) {
    if (!node.hasChildren) return;
    const nextExpanded = !expandedIds.value.has(node.id);
    expandedIds.value = markSet(expandedIds.value, node.id, nextExpanded);
    if (nextExpanded) await loadChildren(node.id);
  }

  function clearTreeSearch() {
    searchRequestSeq += 1;
    treeSearchChildrenByParent.value = {};
    treeSearchExpandedIds.value = new Set();
    treeSearchKeyword.value = '';
    treeSearchParentId.value = null;
    treeSearchMatchCount.value = 0;
    treeSearchLoading.value = false;
    treeSearchError.value = '';
  }

  function indexTreeSearchItems(items: NoteTreeItem[]) {
    const childrenByParent: Record<string, NoteTreeItem[]> = { [NOTE_TREE_ROOT_KEY]: items };
    const expanded = new Set<string>();
    const visit = (nodes: NoteTreeItem[]) => {
      nodes.forEach((node) => {
        const children = Array.isArray(node.children) ? node.children : [];
        childrenByParent[node.id] = children;
        if (children.length) {
          expanded.add(node.id);
          visit(children);
        }
      });
    };
    visit(items);
    return { childrenByParent, expanded };
  }

  async function searchTree(keyword: string, parentId: string | null = currentParentId.value) {
    const normalizedKeyword = String(keyword || '').trim();
    if (!enabled.value || !normalizedKeyword) {
      clearTreeSearch();
      return [];
    }
    const normalizedParentId = queryValue(parentId);
    const seq = ++searchRequestSeq;
    treeSearchKeyword.value = normalizedKeyword;
    treeSearchParentId.value = normalizedParentId;
    treeSearchChildrenByParent.value = {};
    treeSearchExpandedIds.value = new Set();
    treeSearchMatchCount.value = 0;
    treeSearchLoading.value = true;
    treeSearchError.value = '';
    try {
      const response = await apiBasePost(
        '/api/note/queryNoteTree',
        { parentId: normalizedParentId, depth: 'all', keyword: normalizedKeyword },
        { silent: true },
      );
      if (disposed || seq !== searchRequestSeq) return [];
      if (response.status !== 200) {
        treeSearchError.value = String(response.msg || 'NOTE_TREE_SEARCH_FAILED');
        return [];
      }
      const payload = (response.data || {}) as NoteTreeQueryResult;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const indexed = indexTreeSearchItems(items);
      treeSearchChildrenByParent.value = indexed.childrenByParent;
      treeSearchExpandedIds.value = indexed.expanded;
      treeSearchMatchCount.value = Math.max(0, Number(payload.matchCount || 0));
      return items;
    } catch (error) {
      if (!disposed && seq === searchRequestSeq) {
        treeSearchError.value = error instanceof Error ? error.message : 'NOTE_TREE_SEARCH_FAILED';
      }
      return [];
    } finally {
      if (seq === searchRequestSeq) treeSearchLoading.value = false;
    }
  }

  async function selectDirectory(parentId: string | null) {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    // 目录与标签是两套互斥的分类范围；进入目录时不能继续叠加旧标签。
    delete query.tag;
    if (parentId) query.parent = parentId;
    else delete query.parent;
    await router.push({ path: '/noteLibrary', query });
  }

  function openDirectoryPage(noteId: string) {
    return router.push({
      path: `/noteLibrary/${encodeURIComponent(noteId)}`,
      query: { from: router.currentRoute.value.fullPath },
    });
  }

  async function refreshTree() {
    const activeSearch = treeSearchKeyword.value;
    const activeSearchParentId = treeSearchParentId.value;
    childrenByParent.value = {};
    loadedKeys.value = new Set();
    treeError.value = '';
    if (!enabled.value) {
      currentBreadcrumb.value = [];
      return;
    }
    await Promise.all([
      loadChildren(null, true),
      loadBreadcrumb(currentParentId.value),
      ...(activeSearch ? [searchTree(activeSearch, activeSearchParentId)] : []),
    ]);
  }

  watch(
    [enabled, currentParentId],
    ([isEnabled, parentId]) => {
      if (!isEnabled) {
        currentBreadcrumb.value = [];
        clearTreeSearch();
        return;
      }
      void loadBreadcrumb(parentId);
    },
    { immediate: true },
  );
  watch(expandedIds, persistExpandedIds);
  watch(
    enabled,
    (isEnabled) => {
      if (isEnabled) void loadChildren(null);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disposed = true;
    breadcrumbRequestSeq += 1;
    searchRequestSeq += 1;
  });

  return {
    childrenByParent,
    currentBreadcrumb,
    currentDirectoryTitle,
    currentParentId,
    expandedIds,
    loadedKeys,
    loadingKeys,
    treeError,
    treeSearchChildrenByParent,
    treeSearchError,
    treeSearchExpandedIds,
    treeSearchKeyword,
    treeSearchLoading,
    treeSearchMatchCount,
    loadChildren,
    loadBreadcrumb,
    openDirectoryPage,
    refreshTree,
    searchTree,
    selectDirectory,
    toggleExpanded,
  };
}
