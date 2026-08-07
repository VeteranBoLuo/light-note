import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { apiBasePost } from '@/http/request';
import type { NoteBreadcrumbItem, NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
import { NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH } from '@/utils/noteWorkspaceLayout';

export const NOTE_TREE_ROOT_KEY = '__light_note_root__';

const EXPANDED_SESSION_KEY = 'light-note-note-tree-expanded-ids';
const LAYOUT_STORAGE_KEY = 'light-note-workspace-layout';

export type NoteWorkspacePrimaryTab = 'pages' | 'tags' | 'outline';

interface NoteWorkspaceLayoutPreference {
  sidebarPreferredOpen: boolean;
  aiPreferredOpen: boolean;
  sidebarWidth: number;
}

function readJson<T>(storage: Storage | undefined, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(String(storage.getItem(key) || ''));
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function readExpandedIds() {
  const items = readJson<unknown[]>(
    typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
    EXPANDED_SESSION_KEY,
    [],
  );
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.length <= 255)
      .slice(0, 200),
  );
}

function readLayoutPreference(): NoteWorkspaceLayoutPreference {
  const value = readJson<Partial<NoteWorkspaceLayoutPreference>>(
    typeof localStorage === 'undefined' ? undefined : localStorage,
    LAYOUT_STORAGE_KEY,
    {},
  );
  return {
    sidebarPreferredOpen: value.sidebarPreferredOpen !== false,
    aiPreferredOpen: value.aiPreferredOpen !== false,
    sidebarWidth: Math.min(360, Math.max(220, Number(value.sidebarWidth || NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH))),
  };
}

function parentKey(parentId: string | null) {
  return parentId || NOTE_TREE_ROOT_KEY;
}

function normalizedId(value: unknown) {
  const id = String(value ?? '').trim();
  return id || null;
}

function markSet(source: Set<string>, key: string, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(key);
  else next.delete(key);
  return next;
}

export type NoteTreeMetadataPatch = Partial<Pick<NoteTreeItem, 'title' | 'type'>>;

export type CreatedNoteTreeItem = Pick<NoteTreeItem, 'id' | 'parentId' | 'title' | 'type'>;

function patchTreeItems(items: NoteTreeItem[], noteId: string, patch: NoteTreeMetadataPatch): NoteTreeItem[] {
  let changed = false;
  const nextItems = items.map((item) => {
    const nextChildren = Array.isArray(item.children) ? patchTreeItems(item.children, noteId, patch) : item.children;
    const matched = item.id === noteId;
    if (!matched && nextChildren === item.children) return item;
    changed = true;
    return {
      ...item,
      ...(matched ? patch : {}),
      ...(nextChildren !== item.children ? { children: nextChildren } : {}),
    };
  });
  return changed ? nextItems : items;
}

function patchTreeIndex(
  index: Record<string, NoteTreeItem[]>,
  noteId: string,
  patch: NoteTreeMetadataPatch,
): Record<string, NoteTreeItem[]> {
  let changed = false;
  const nextIndex = Object.fromEntries(
    Object.entries(index).map(([key, items]) => {
      const nextItems = patchTreeItems(items, noteId, patch);
      if (nextItems !== items) changed = true;
      return [key, nextItems];
    }),
  );
  return changed ? nextIndex : index;
}

function patchBreadcrumbItems(items: NoteBreadcrumbItem[], noteId: string, title: string): NoteBreadcrumbItem[] {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== noteId || item.title === title) return item;
    changed = true;
    return { ...item, title };
  });
  return changed ? nextItems : items;
}

function incrementParentChildCount(items: NoteTreeItem[], parentId: string): NoteTreeItem[] {
  let changed = false;
  const nextItems = items.map((item) => {
    const nextChildren = Array.isArray(item.children)
      ? incrementParentChildCount(item.children, parentId)
      : item.children;
    if (item.id !== parentId && nextChildren === item.children) return item;
    changed = true;
    return {
      ...item,
      ...(item.id === parentId
        ? {
            childCount: Math.max(1, Number(item.childCount || 0) + 1),
            hasChildren: true,
          }
        : {}),
      ...(nextChildren !== item.children ? { children: nextChildren } : {}),
    };
  });
  return changed ? nextItems : items;
}

function incrementParentInTreeIndex(index: Record<string, NoteTreeItem[]>, parentId: string) {
  let changed = false;
  const nextIndex = Object.fromEntries(
    Object.entries(index).map(([key, items]) => {
      const nextItems = incrementParentChildCount(items, parentId);
      if (nextItems !== items) changed = true;
      return [key, nextItems];
    }),
  );
  return changed ? nextIndex : index;
}

export default defineStore('noteWorkspace', () => {
  const layout = readLayoutPreference();
  const ownerKey = ref('');
  const activePageId = ref<string | null>(null);
  const browseParentId = ref<string | null>(null);
  const libraryTab = ref<NoteWorkspacePrimaryTab>('pages');
  const detailTab = ref<NoteWorkspacePrimaryTab>('pages');
  const sidebarPreferredOpen = ref(layout.sidebarPreferredOpen);
  const aiPreferredOpen = ref(layout.aiPreferredOpen);
  const sidebarWidth = ref(layout.sidebarWidth);

  const childrenByParent = ref<Record<string, NoteTreeItem[]>>({});
  const expandedIds = ref<Set<string>>(readExpandedIds());
  const loadingKeys = ref<Set<string>>(new Set());
  const loadedKeys = ref<Set<string>>(new Set());
  const breadcrumbByNote = ref<Record<string, NoteBreadcrumbItem[]>>({});
  const currentBreadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const treeError = ref('');

  const treeSearchChildrenByParent = ref<Record<string, NoteTreeItem[]>>({});
  const treeSearchExpandedIds = ref<Set<string>>(new Set());
  const treeSearchKeyword = ref('');
  const treeSearchMatchCount = ref(0);
  const treeSearchLoading = ref(false);
  const treeSearchError = ref('');

  let breadcrumbRequestSeq = 0;
  let searchRequestSeq = 0;
  let treeRequestSeq = 0;

  const currentDirectoryTitle = computed(() => {
    const items = currentBreadcrumb.value;
    return items[items.length - 1]?.title || '';
  });

  function resetTreeState() {
    treeRequestSeq += 1;
    breadcrumbRequestSeq += 1;
    searchRequestSeq += 1;
    childrenByParent.value = {};
    loadingKeys.value = new Set();
    loadedKeys.value = new Set();
    breadcrumbByNote.value = {};
    currentBreadcrumb.value = [];
    treeError.value = '';
    clearTreeSearch();
  }

  function ensureOwner(nextOwnerKey: string) {
    const normalized = String(nextOwnerKey || 'anonymous');
    if (ownerKey.value === normalized) return;
    ownerKey.value = normalized;
    activePageId.value = null;
    browseParentId.value = null;
    resetTreeState();
  }

  function setNavigation(next: { activePageId?: string | null; browseParentId?: string | null }) {
    if (Object.prototype.hasOwnProperty.call(next, 'activePageId'))
      activePageId.value = normalizedId(next.activePageId);
    if (Object.prototype.hasOwnProperty.call(next, 'browseParentId')) {
      browseParentId.value = normalizedId(next.browseParentId);
      currentBreadcrumb.value = browseParentId.value ? breadcrumbByNote.value[browseParentId.value] || [] : [];
    }
  }

  async function loadChildren(parentId: string | null = null, force = false) {
    const key = parentKey(normalizedId(parentId));
    if (!force && loadedKeys.value.has(key)) return childrenByParent.value[key] || [];
    if (loadingKeys.value.has(key)) return childrenByParent.value[key] || [];
    const requestOwner = ownerKey.value;
    const requestGeneration = treeRequestSeq;
    loadingKeys.value = markSet(loadingKeys.value, key, true);
    treeError.value = '';
    try {
      const response = await apiBasePost(
        '/api/note/queryNoteTree',
        { parentId: normalizedId(parentId), depth: 1 },
        { silent: true },
      );
      if (requestOwner !== ownerKey.value || requestGeneration !== treeRequestSeq) return [];
      if (response.status !== 200) {
        treeError.value = String(response.msg || 'NOTE_TREE_LOAD_FAILED');
        return [];
      }
      const payload = (response.data || {}) as NoteTreeQueryResult;
      const items = Array.isArray(payload.items) ? payload.items : [];
      childrenByParent.value = { ...childrenByParent.value, [key]: items };
      loadedKeys.value = markSet(loadedKeys.value, key, true);
      // 展开状态会跨当前浏览会话保存在 sessionStorage。恢复根层时不能只恢复箭头，
      // 还要把已记住的展开分支一并取回，否则会出现“箭头朝下但子页面为空”，
      // 用户必须先折叠再展开一次才能看到内容。
      const restoredBranches = items.filter((item) => item.hasChildren && expandedIds.value.has(item.id));
      if (restoredBranches.length) {
        await Promise.all(restoredBranches.map((item) => loadChildren(item.id)));
      }
      return items;
    } catch (error) {
      if (requestOwner === ownerKey.value && requestGeneration === treeRequestSeq) {
        treeError.value = error instanceof Error ? error.message : 'NOTE_TREE_LOAD_FAILED';
      }
      return [];
    } finally {
      loadingKeys.value = markSet(loadingKeys.value, key, false);
    }
  }

  async function revealBreadcrumb(items: NoteBreadcrumbItem[]) {
    await loadChildren(null);
    for (const item of items.slice(0, -1)) {
      expandedIds.value = markSet(expandedIds.value, item.id, true);
      await loadChildren(item.id);
    }
  }

  async function loadBreadcrumb(noteId: string | null) {
    const id = normalizedId(noteId);
    const seq = ++breadcrumbRequestSeq;
    if (!id) {
      currentBreadcrumb.value = [];
      return [];
    }
    const cached = breadcrumbByNote.value[id];
    if (cached) {
      currentBreadcrumb.value = cached;
      await revealBreadcrumb(cached);
      return cached;
    }
    const requestOwner = ownerKey.value;
    try {
      const response = await apiBasePost('/api/note/queryNoteBreadcrumb', { noteId: id }, { silent: true });
      if (requestOwner !== ownerKey.value || seq !== breadcrumbRequestSeq) return [];
      if (response.status !== 200) {
        treeError.value = String(response.msg || 'NOTE_TREE_BREADCRUMB_FAILED');
        return [];
      }
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      breadcrumbByNote.value = { ...breadcrumbByNote.value, [id]: items };
      currentBreadcrumb.value = items;
      await revealBreadcrumb(items);
      return items;
    } catch (error) {
      if (requestOwner === ownerKey.value && seq === breadcrumbRequestSeq) {
        treeError.value = error instanceof Error ? error.message : 'NOTE_TREE_BREADCRUMB_FAILED';
      }
      return [];
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
    treeSearchMatchCount.value = 0;
    treeSearchLoading.value = false;
    treeSearchError.value = '';
  }

  function indexTreeSearchItems(items: NoteTreeItem[]) {
    const indexed: Record<string, NoteTreeItem[]> = { [NOTE_TREE_ROOT_KEY]: items };
    const expanded = new Set<string>();
    const visit = (nodes: NoteTreeItem[]) => {
      nodes.forEach((node) => {
        const children = Array.isArray(node.children) ? node.children : [];
        indexed[node.id] = children;
        if (children.length) {
          expanded.add(node.id);
          visit(children);
        }
      });
    };
    visit(items);
    return { indexed, expanded };
  }

  async function searchTree(keyword: string) {
    const normalizedKeyword = String(keyword || '').trim();
    if (!normalizedKeyword) {
      clearTreeSearch();
      return [];
    }
    const seq = ++searchRequestSeq;
    const requestOwner = ownerKey.value;
    treeSearchKeyword.value = normalizedKeyword;
    treeSearchChildrenByParent.value = {};
    treeSearchExpandedIds.value = new Set();
    treeSearchMatchCount.value = 0;
    treeSearchLoading.value = true;
    treeSearchError.value = '';
    try {
      // 页面树搜索始终覆盖整棵树，不受当前浏览范围限制。
      const response = await apiBasePost(
        '/api/note/queryNoteTree',
        { parentId: null, depth: 'all', keyword: normalizedKeyword },
        { silent: true },
      );
      if (requestOwner !== ownerKey.value || seq !== searchRequestSeq) return [];
      if (response.status !== 200) {
        treeSearchError.value = String(response.msg || 'NOTE_TREE_SEARCH_FAILED');
        return [];
      }
      const payload = (response.data || {}) as NoteTreeQueryResult;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const { indexed, expanded } = indexTreeSearchItems(items);
      treeSearchChildrenByParent.value = indexed;
      treeSearchExpandedIds.value = expanded;
      treeSearchMatchCount.value = Math.max(0, Number(payload.matchCount || 0));
      return items;
    } catch (error) {
      if (requestOwner === ownerKey.value && seq === searchRequestSeq) {
        treeSearchError.value = error instanceof Error ? error.message : 'NOTE_TREE_SEARCH_FAILED';
      }
      return [];
    } finally {
      if (seq === searchRequestSeq) treeSearchLoading.value = false;
    }
  }

  async function refreshTree() {
    const activeSearch = treeSearchKeyword.value;
    childrenByParent.value = {};
    loadedKeys.value = new Set();
    treeError.value = '';
    await Promise.all([
      loadChildren(null, true),
      loadBreadcrumb(browseParentId.value || activePageId.value),
      ...(activeSearch ? [searchTree(activeSearch)] : []),
    ]);
  }

  function updateNoteMetadata(noteId: string, patch: NoteTreeMetadataPatch) {
    const id = normalizedId(noteId);
    if (!id) return;
    const normalizedPatch: NoteTreeMetadataPatch = {};
    if (typeof patch.title === 'string') normalizedPatch.title = patch.title;
    if (Object.prototype.hasOwnProperty.call(patch, 'type')) normalizedPatch.type = patch.type;
    if (!Object.keys(normalizedPatch).length) return;

    childrenByParent.value = patchTreeIndex(childrenByParent.value, id, normalizedPatch);
    treeSearchChildrenByParent.value = patchTreeIndex(treeSearchChildrenByParent.value, id, normalizedPatch);

    if (typeof normalizedPatch.title === 'string') {
      const title = normalizedPatch.title;
      let breadcrumbChanged = false;
      const nextBreadcrumbByNote = Object.fromEntries(
        Object.entries(breadcrumbByNote.value).map(([key, items]) => {
          const nextItems = patchBreadcrumbItems(items, id, title);
          if (nextItems !== items) breadcrumbChanged = true;
          return [key, nextItems];
        }),
      );
      if (breadcrumbChanged) breadcrumbByNote.value = nextBreadcrumbByNote;
      currentBreadcrumb.value = patchBreadcrumbItems(currentBreadcrumb.value, id, title);
    }
  }

  function insertCreatedNote(input: CreatedNoteTreeItem) {
    const id = normalizedId(input.id);
    if (!id) return;
    const parentId = normalizedId(input.parentId);
    const key = parentKey(parentId);
    const siblings = childrenByParent.value[key] || [];
    const existingIndex = siblings.findIndex((item) => item.id === id);
    const maxNormalSort = siblings.reduce(
      (max, item) => (item.isTop ? max : Math.max(max, Number(item.sort) || 0)),
      -1,
    );
    const createdNode: NoteTreeItem = {
      id,
      parentId,
      title: String(input.title || ''),
      type: input.type || 'html',
      childCount: 0,
      hasChildren: false,
      isTop: false,
      sort: maxNormalSort + 1,
      updateTime: new Date().toISOString(),
    };
    const nextSiblings =
      existingIndex >= 0
        ? siblings.map((item, index) => (index === existingIndex ? { ...item, ...createdNode } : item))
        : [...siblings, createdNode];
    let nextChildrenByParent = { ...childrenByParent.value, [key]: nextSiblings };
    if (existingIndex < 0 && parentId) {
      nextChildrenByParent = incrementParentInTreeIndex(nextChildrenByParent, parentId);
      treeSearchChildrenByParent.value = incrementParentInTreeIndex(treeSearchChildrenByParent.value, parentId);
    }
    childrenByParent.value = nextChildrenByParent;
  }

  function setSidebarPreferredOpen(open: boolean) {
    sidebarPreferredOpen.value = open;
  }

  function setAiPreferredOpen(open: boolean) {
    aiPreferredOpen.value = open;
  }

  function setSidebarWidth(width: number) {
    sidebarWidth.value = Math.min(360, Math.max(220, Math.round(width)));
  }

  watch(expandedIds, (value) => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(EXPANDED_SESSION_KEY, JSON.stringify([...value].slice(0, 200)));
    } catch {
      // 受限 WebView 禁止存储时保留当前内存状态。
    }
  });

  watch([sidebarPreferredOpen, aiPreferredOpen, sidebarWidth], () => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          sidebarPreferredOpen: sidebarPreferredOpen.value,
          aiPreferredOpen: aiPreferredOpen.value,
          sidebarWidth: sidebarWidth.value,
        }),
      );
    } catch {
      // 受限 WebView 禁止存储时保留当前内存状态。
    }
  });

  return {
    activePageId,
    aiPreferredOpen,
    browseParentId,
    breadcrumbByNote,
    childrenByParent,
    currentBreadcrumb,
    currentDirectoryTitle,
    detailTab,
    expandedIds,
    libraryTab,
    loadedKeys,
    loadingKeys,
    ownerKey,
    sidebarPreferredOpen,
    sidebarWidth,
    treeError,
    treeSearchChildrenByParent,
    treeSearchError,
    treeSearchExpandedIds,
    treeSearchKeyword,
    treeSearchLoading,
    treeSearchMatchCount,
    clearTreeSearch,
    ensureOwner,
    loadBreadcrumb,
    loadChildren,
    insertCreatedNote,
    refreshTree,
    searchTree,
    setAiPreferredOpen,
    setNavigation,
    setSidebarPreferredOpen,
    setSidebarWidth,
    toggleExpanded,
    updateNoteMetadata,
  };
});
