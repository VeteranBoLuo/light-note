import { computed, onScopeDispose, ref, watch } from 'vue';
import router from '@/router';
import { apiBasePost } from '@/http/request';
import type { NoteBreadcrumbItem, NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';

export const NOTE_TREE_ROOT_KEY = '__light_note_root__';

function queryValue(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw ?? '').trim();
  return normalized || null;
}

function parentKey(parentId: string | null) {
  return parentId || NOTE_TREE_ROOT_KEY;
}

export function useNoteTree() {
  const childrenByParent = ref<Record<string, NoteTreeItem[]>>({});
  const expandedIds = ref<Set<string>>(new Set());
  const loadingKeys = ref<Set<string>>(new Set());
  const loadedKeys = ref<Set<string>>(new Set());
  const currentBreadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const treeError = ref('');
  let breadcrumbRequestSeq = 0;
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

  async function selectDirectory(parentId: string | null) {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
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
    childrenByParent.value = {};
    loadedKeys.value = new Set();
    treeError.value = '';
    await Promise.all([loadChildren(null, true), loadBreadcrumb(currentParentId.value)]);
  }

  watch(
    currentParentId,
    (parentId) => {
      void loadBreadcrumb(parentId);
    },
    { immediate: true },
  );
  void loadChildren(null);

  onScopeDispose(() => {
    disposed = true;
    breadcrumbRequestSeq += 1;
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
    loadChildren,
    loadBreadcrumb,
    openDirectoryPage,
    refreshTree,
    selectDirectory,
    toggleExpanded,
  };
}
