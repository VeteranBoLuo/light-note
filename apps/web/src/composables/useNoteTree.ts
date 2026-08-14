import { computed, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import router from '@/router';
import useUserStore from '@/store/useUser';
import useNoteWorkspaceStore, { NOTE_TREE_ROOT_KEY } from '@/store/noteWorkspace';
import type { NoteTreeItem } from '@/types/noteTree';
import { prefetchNoteDetail } from '@/api/noteDetailPrefetch';

export { NOTE_TREE_ROOT_KEY } from '@/store/noteWorkspace';

function queryValue(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw ?? '').trim();
  return normalized || null;
}

function activeDetailPageId() {
  if (router.currentRoute.value.name !== 'noteDetail') return null;
  const pageId = queryValue(router.currentRoute.value.params?.id);
  return pageId === 'add' ? null : pageId;
}

export function useNoteTree(
  options: {
    enabled?: Ref<boolean>;
    ownerKey?: Ref<string>;
    loadTree?: Ref<boolean>;
    revealBreadcrumb?: Ref<boolean>;
  } = {},
) {
  const enabled = computed(() => options.enabled?.value !== false);
  const loadTreeEnabled = computed(() => options.loadTree?.value !== false);
  const revealBreadcrumbEnabled = computed(() => options.revealBreadcrumb?.value !== false);
  const user = useUserStore();
  const workspace = useNoteWorkspaceStore();
  const {
    activePageId,
    browseParentId,
    childrenByParent,
    currentBreadcrumb,
    currentDirectoryTitle,
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
  } = storeToRefs(workspace);

  const currentParentId = computed(() => queryValue(router.currentRoute.value.query.parent));
  const resourceOwnerKey = computed(
    () =>
      options.ownerKey?.value ||
      [
        user.id || 'anonymous',
        user.role || '',
        user.adminContext?.subjectUserId || '',
        user.adminContext?.mode || '',
      ].join('|'),
  );

  async function loadChildren(parentId: string | null = null, force = false) {
    if (!enabled.value) return [];
    return workspace.loadChildren(parentId, force);
  }

  async function loadBreadcrumb(noteId: string | null) {
    if (!enabled.value) {
      currentBreadcrumb.value = [];
      return [];
    }
    return workspace.loadBreadcrumb(noteId, { reveal: revealBreadcrumbEnabled.value });
  }

  async function toggleExpanded(node: NoteTreeItem) {
    if (!enabled.value) return;
    return workspace.toggleExpanded(node);
  }

  async function searchTree(keyword: string, _legacyParentId?: string | null) {
    if (!enabled.value) {
      workspace.clearTreeSearch();
      return [];
    }
    return workspace.searchTree(keyword);
  }

  async function selectDirectory(parentId: string | null) {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    // 目录与标签是两套独立分类体系，切换目录时只清理标签范围。
    delete query.tag;
    if (parentId) query.parent = parentId;
    else delete query.parent;
    await router.push({ path: '/noteLibrary', query });
  }

  function openDirectoryPage(noteId: string) {
    // 从卡片/目录点击的这一刻就请求正文。Vue Router 同时下载详情页与编辑器 chunk，
    // 弱网下不再先等几百 KB 的脚本到齐，才开始发正文请求。
    prefetchNoteDetail(user, noteId);
    return router.push({
      path: `/noteLibrary/${encodeURIComponent(noteId)}`,
      query: { from: router.currentRoute.value.fullPath },
    });
  }

  async function refreshTree() {
    if (!enabled.value) {
      currentBreadcrumb.value = [];
      return;
    }
    return workspace.refreshTree();
  }

  watch(
    resourceOwnerKey,
    (key) => {
      workspace.ensureOwner(key);
    },
    { immediate: true },
  );

  watch(
    [enabled, currentParentId, () => router.currentRoute.value.params?.id, () => router.currentRoute.value.name],
    ([isEnabled, parentId]) => {
      const pageId = activeDetailPageId();
      workspace.setNavigation({ activePageId: pageId, browseParentId: pageId ? null : parentId });
      if (!isEnabled) {
        currentBreadcrumb.value = [];
        workspace.clearTreeSearch();
        return;
      }
      void loadBreadcrumb(pageId || parentId);
    },
    { immediate: true },
  );

  watch(
    [enabled, loadTreeEnabled],
    ([isEnabled, shouldLoadTree]) => {
      if (isEnabled && shouldLoadTree) void loadChildren(null);
    },
    { immediate: true },
  );

  watch(revealBreadcrumbEnabled, (shouldReveal) => {
    if (!enabled.value || !shouldReveal || !currentBreadcrumb.value.length) return;
    void workspace.revealBreadcrumb(currentBreadcrumb.value);
  });

  return {
    activePageId,
    browseParentId,
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
