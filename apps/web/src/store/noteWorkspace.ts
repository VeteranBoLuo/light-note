import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { apiBasePost } from '@/http/request';
import type { NoteBreadcrumbItem, NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
import { NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH } from '@/utils/noteWorkspaceLayout';

export const NOTE_TREE_ROOT_KEY = '__light_note_root__';

const EXPANDED_SESSION_KEY = 'light-note-note-tree-expanded-ids';
const LIBRARY_PREVIEW_SESSION_KEY = 'light-note-note-library-preview';
const LAYOUT_STORAGE_KEY = 'light-note-workspace-layout';

export type NoteWorkspacePrimaryTab = 'pages' | 'outline';

interface NoteWorkspaceLayoutPreference {
  sidebarPreferredOpen: boolean;
  aiPreferredOpen: boolean;
  sidebarWidth: number;
}

interface LibraryPreviewSessionRecord {
  ownerKey?: string;
  noteId?: string;
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

function normalizeBreadcrumbItems(items: NoteBreadcrumbItem[]) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ id: String(item?.id || '').trim(), title: String(item?.title || '') }))
    .filter((item) => item.id);
}

function readLibraryPreviewPageId(owner: string) {
  const record = readJson<LibraryPreviewSessionRecord>(
    typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
    LIBRARY_PREVIEW_SESSION_KEY,
    {},
  );
  if (String(record.ownerKey || '') !== owner) return null;
  const noteId = normalizedId(record.noteId);
  return noteId && noteId.length <= 255 ? noteId : null;
}

function markSet(source: Set<string>, key: string, enabled: boolean) {
  const next = new Set(source);
  if (enabled) next.add(key);
  else next.delete(key);
  return next;
}

export type NoteTreeMetadataPatch = Partial<
  Pick<NoteTreeItem, 'title' | 'type' | 'hasContent' | 'isTop' | 'sort' | 'updateTime'>
>;

export type CreatedNoteTreeItem = Pick<NoteTreeItem, 'id' | 'parentId' | 'title' | 'type'>;

function compareNoteTreeItems(left: NoteTreeItem, right: NoteTreeItem) {
  const pinned = Number(Boolean(right.isTop)) - Number(Boolean(left.isTop));
  if (pinned) return pinned;
  const manualOrder = Number(left.sort || 0) - Number(right.sort || 0);
  if (manualOrder) return manualOrder;
  const leftUpdatedAt = new Date(left.updateTime || 0).getTime() || 0;
  const rightUpdatedAt = new Date(right.updateTime || 0).getTime() || 0;
  if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt;
  return String(right.id).localeCompare(String(left.id));
}

function sortNoteTreeItems(items: NoteTreeItem[]) {
  return [...items].sort(compareNoteTreeItems);
}

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
  return changed ? sortNoteTreeItems(nextItems) : items;
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
  const libraryPreviewPageId = ref<string | null>(null);
  // 普通路由恢复与用户显式点击“笔记库”拥有相同 URL；瞬时令牌负责跨越全局导航、详情守卫和 keepAlive 根页传递后者。
  const libraryRootEntryRequestToken = ref<number | null>(null);
  const detailTab = ref<NoteWorkspacePrimaryTab>('pages');
  const detailTreeScrollTop = ref(0);
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
  let libraryRootEntryRequestSeq = 0;
  let breadcrumbTargetId: string | null = null;
  const childrenRequests = new Map<string, Promise<NoteTreeItem[]>>();
  const breadcrumbRequests = new Map<string, Promise<NoteBreadcrumbItem[]>>();
  const breadcrumbRevealRequests = new Map<string, Promise<void>>();

  const currentDirectoryTitle = computed(() => {
    const items = currentBreadcrumb.value;
    return items[items.length - 1]?.title || '';
  });

  function resetTreeState() {
    treeRequestSeq += 1;
    breadcrumbRequestSeq += 1;
    searchRequestSeq += 1;
    breadcrumbTargetId = null;
    childrenRequests.clear();
    breadcrumbRequests.clear();
    breadcrumbRevealRequests.clear();
    childrenByParent.value = {};
    loadingKeys.value = new Set();
    loadedKeys.value = new Set();
    breadcrumbByNote.value = {};
    currentBreadcrumb.value = [];
    detailTreeScrollTop.value = 0;
    treeError.value = '';
    clearTreeSearch();
  }

  function ensureOwner(nextOwnerKey: string) {
    const normalized = String(nextOwnerKey || 'anonymous');
    if (ownerKey.value === normalized) return;
    ownerKey.value = normalized;
    activePageId.value = null;
    browseParentId.value = null;
    libraryPreviewPageId.value = readLibraryPreviewPageId(normalized);
    resetTreeState();
  }

  function setLibraryPreviewPage(noteId: string | null) {
    const id = normalizedId(noteId);
    libraryPreviewPageId.value = id;
    if (typeof sessionStorage === 'undefined' || !ownerKey.value) return;
    try {
      if (id) {
        sessionStorage.setItem(LIBRARY_PREVIEW_SESSION_KEY, JSON.stringify({ ownerKey: ownerKey.value, noteId: id }));
        return;
      }
      const record = readJson<LibraryPreviewSessionRecord>(sessionStorage, LIBRARY_PREVIEW_SESSION_KEY, {});
      if (!record.ownerKey || record.ownerKey === ownerKey.value) {
        sessionStorage.removeItem(LIBRARY_PREVIEW_SESSION_KEY);
      }
    } catch {
      // 受限 WebView 禁止存储时仍保留当前内存状态。
    }
  }

  function beginLibraryRootEntryRequest() {
    libraryRootEntryRequestSeq += 1;
    libraryRootEntryRequestToken.value = libraryRootEntryRequestSeq;
    return libraryRootEntryRequestSeq;
  }

  function finishLibraryRootEntryRequest(token: number) {
    if (libraryRootEntryRequestToken.value === token) {
      libraryRootEntryRequestToken.value = null;
    }
  }

  function setNavigation(next: { activePageId?: string | null; browseParentId?: string | null }) {
    if (Object.prototype.hasOwnProperty.call(next, 'activePageId'))
      activePageId.value = normalizedId(next.activePageId);
    if (Object.prototype.hasOwnProperty.call(next, 'browseParentId')) {
      browseParentId.value = normalizedId(next.browseParentId);
      currentBreadcrumb.value = browseParentId.value ? breadcrumbByNote.value[browseParentId.value] || [] : [];
    }
  }

  function setDetailTreeScrollTop(value: number) {
    const normalized = Number(value);
    detailTreeScrollTop.value = Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
  }

  function cacheBreadcrumb(noteId: string | null, items: NoteBreadcrumbItem[]) {
    const id = normalizedId(noteId);
    if (!id) return [];
    const normalizedItems = normalizeBreadcrumbItems(items);
    breadcrumbByNote.value = { ...breadcrumbByNote.value, [id]: normalizedItems };
    return normalizedItems;
  }

  function seedBreadcrumb(noteId: string | null, items: NoteBreadcrumbItem[]) {
    const id = normalizedId(noteId);
    if (!id) return [];
    const normalizedItems = cacheBreadcrumb(id, items);
    breadcrumbTargetId = id;
    currentBreadcrumb.value = normalizedItems;
    return normalizedItems;
  }

  function loadChildren(parentId: string | null = null, force = false): Promise<NoteTreeItem[]> {
    const key = parentKey(normalizedId(parentId));
    if (!force && loadedKeys.value.has(key)) return Promise.resolve(childrenByParent.value[key] || []);
    const inFlight = childrenRequests.get(key);
    if (inFlight) return inFlight;
    const requestOwner = ownerKey.value;
    const requestGeneration = treeRequestSeq;
    loadingKeys.value = markSet(loadingKeys.value, key, true);
    treeError.value = '';
    const request = (async () => {
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
        const items = sortNoteTreeItems(Array.isArray(payload.items) ? payload.items : []);
        childrenByParent.value = { ...childrenByParent.value, [key]: items };
        loadedKeys.value = markSet(loadedKeys.value, key, true);
        // 展开状态会跨当前浏览会话保存在 sessionStorage。恢复根层时不能只恢复箭头，
        // 还要把已记住的展开分支一并取回，否则会出现“箭头朝下但子页面为空”。
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
        if (childrenRequests.get(key) === request) {
          childrenRequests.delete(key);
          loadingKeys.value = markSet(loadingKeys.value, key, false);
        }
      }
    })();
    childrenRequests.set(key, request);
    return request;
  }

  function revealBreadcrumb(items: NoteBreadcrumbItem[]) {
    const key = items.map((item) => item.id).join('/');
    if (!key) return Promise.resolve();
    const inFlight = breadcrumbRevealRequests.get(key);
    if (inFlight) return inFlight;
    const request = (async () => {
      await loadChildren(null);
      for (const item of items.slice(0, -1)) {
        expandedIds.value = markSet(expandedIds.value, item.id, true);
        await loadChildren(item.id);
      }
    })().finally(() => {
      if (breadcrumbRevealRequests.get(key) === request) breadcrumbRevealRequests.delete(key);
    });
    breadcrumbRevealRequests.set(key, request);
    return request;
  }

  function resolveBreadcrumb(noteId: string): Promise<NoteBreadcrumbItem[]> {
    const cached = breadcrumbByNote.value[noteId];
    if (cached) return Promise.resolve(cached);
    const requestOwner = ownerKey.value;
    const requestGeneration = breadcrumbRequestSeq;
    let request = breadcrumbRequests.get(noteId);
    if (!request) {
      request = (async () => {
        try {
          const response = await apiBasePost('/api/note/queryNoteBreadcrumb', { noteId }, { silent: true });
          if (requestOwner !== ownerKey.value || requestGeneration !== breadcrumbRequestSeq) return [];
          if (response.status !== 200) {
            treeError.value = String(response.msg || 'NOTE_TREE_BREADCRUMB_FAILED');
            return [];
          }
          const items = Array.isArray(response.data?.items) ? response.data.items : [];
          return cacheBreadcrumb(noteId, items);
        } catch (error) {
          if (requestOwner === ownerKey.value && requestGeneration === breadcrumbRequestSeq) {
            treeError.value = error instanceof Error ? error.message : 'NOTE_TREE_BREADCRUMB_FAILED';
          }
          return [];
        } finally {
          if (breadcrumbRequests.get(noteId) === request) breadcrumbRequests.delete(noteId);
        }
      })();
      breadcrumbRequests.set(noteId, request);
    }
    return request;
  }

  async function revealNotePath(noteId: string | null, breadcrumb?: NoteBreadcrumbItem[] | null) {
    const id = normalizedId(noteId);
    if (!id) return [];
    const bundledItems = normalizeBreadcrumbItems(Array.isArray(breadcrumb) ? breadcrumb : []);
    const items = bundledItems.length ? cacheBreadcrumb(id, bundledItems) : await resolveBreadcrumb(id);
    await revealBreadcrumb(items);
    return items;
  }

  async function loadBreadcrumb(noteId: string | null, options: { reveal?: boolean } = {}) {
    const id = normalizedId(noteId);
    breadcrumbTargetId = id;
    if (!id) {
      currentBreadcrumb.value = [];
      return [];
    }
    const items = await resolveBreadcrumb(id);
    if (breadcrumbTargetId === id) currentBreadcrumb.value = items;
    if (options.reveal !== false) await revealBreadcrumb(items);
    return items;
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

  function resetLibraryRootState() {
    detailTab.value = 'pages';
    setLibraryPreviewPage(null);
    setNavigation({ activePageId: null, browseParentId: null });
    clearTreeSearch();
  }

  function indexTreeSearchItems(items: NoteTreeItem[]) {
    const indexed: Record<string, NoteTreeItem[]> = { [NOTE_TREE_ROOT_KEY]: sortNoteTreeItems(items) };
    const expanded = new Set<string>();
    const visit = (nodes: NoteTreeItem[]) => {
      nodes.forEach((node) => {
        const children = Array.isArray(node.children) ? node.children : [];
        indexed[node.id] = sortNoteTreeItems(children);
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
    if (Object.prototype.hasOwnProperty.call(patch, 'hasContent')) {
      normalizedPatch.hasContent = Boolean(patch.hasContent);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'isTop')) normalizedPatch.isTop = Boolean(patch.isTop);
    if (Object.prototype.hasOwnProperty.call(patch, 'sort') && Number.isFinite(Number(patch.sort))) {
      normalizedPatch.sort = Number(patch.sort);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'updateTime')) {
      normalizedPatch.updateTime = patch.updateTime == null ? null : String(patch.updateTime);
    }
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

  function invalidateBreadcrumbBranch(noteId: string) {
    const id = normalizedId(noteId);
    if (!id) return;
    let changed = false;
    const nextBreadcrumbByNote = Object.fromEntries(
      Object.entries(breadcrumbByNote.value).filter(([, items]) => {
        const keep = !items.some((item) => item.id === id);
        if (!keep) changed = true;
        return keep;
      }),
    );
    if (changed) breadcrumbByNote.value = nextBreadcrumbByNote;
    if (currentBreadcrumb.value.some((item) => item.id === id)) currentBreadcrumb.value = [];
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
    const orderedSiblings = sortNoteTreeItems(nextSiblings);
    let nextChildrenByParent = { ...childrenByParent.value, [key]: orderedSiblings };
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
    detailTreeScrollTop,
    expandedIds,
    libraryPreviewPageId,
    libraryRootEntryRequestToken,
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
    beginLibraryRootEntryRequest,
    clearTreeSearch,
    ensureOwner,
    finishLibraryRootEntryRequest,
    loadBreadcrumb,
    loadChildren,
    revealBreadcrumb,
    revealNotePath,
    insertCreatedNote,
    invalidateBreadcrumbBranch,
    refreshTree,
    resetLibraryRootState,
    searchTree,
    seedBreadcrumb,
    setAiPreferredOpen,
    setDetailTreeScrollTop,
    setLibraryPreviewPage,
    setNavigation,
    setSidebarPreferredOpen,
    setSidebarWidth,
    toggleExpanded,
    updateNoteMetadata,
  };
});
