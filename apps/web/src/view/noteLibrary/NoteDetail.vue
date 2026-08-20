<template>
  <div class="note-container" :class="{ 'note-container--mobile': bookmark.isMobile }">
    <div v-if="isReady">
      <NoteHeader
        :updateTime="updateTime"
        :readonly="readonly"
        :isStartEdit="isStartEdit || isLeaving"
        :save-status="saveStatus"
        @back="back"
        @focusout="titleBlur"
        :note="note"
        :note-type="note.type"
        :has-backup="hasSwitchBackup"
        :has-catalog="!isDrawingNote && nStore.headings.length > 0"
        :has-navigation="canShowPrivateNavigation"
        :child-count="subpageCount"
        :page-tree-writable="noteTreeWriteEnabled"
        @del="delNote"
        @save="clickSaveNote"
        @save-version="saveManualVersion"
        @retry-save="retryPendingSave"
        @switch-mode="triggerEditorSwitch"
        @undo-switch="triggerEditorUndo"
        @history="openVersionHistory"
        @save-as-template="saveTemplateVisible = true"
        @manage-templates="router.push('/noteLibrary/templates')"
        @open-catalog="catalogDrawerOpen = true"
        @open-navigation="openMobileNavigation()"
        @browse-children="browseCurrentChildren"
        @create-child="createChildPage"
        @attach-pages="openAttachPages"
        @move-page="openMoveSelf"
        @toggle-inbox="toggleNoteInbox"
        @share="openNoteShare(note)"
        @export-drawing="exportDrawingNote"
      />
      <NoteWorkspaceShell
        class="note-body"
        :mobile="bookmark.isMobile"
        :has-sidebar="canShowDetailSidebar"
        :has-ai="!bookmark.isMobile && !isDrawingNote"
        :sidebar-open="sidebarPreferredOpen"
        :ai-open="aiPreferredOpen"
        :sidebar-overlay-open="detailSidebarOverlayOpen"
        :ai-overlay-open="detailAiOverlayOpen"
        :sidebar-width="noteWorkspaceSidebarWidth"
        @update:sidebar-open="noteWorkspace.setSidebarPreferredOpen($event)"
        @update:sidebar-overlay-open="setDetailSidebarOverlayOpen"
        @update:sidebar-width="noteWorkspace.setSidebarWidth($event)"
        @update:ai-open="noteWorkspace.setAiPreferredOpen($event)"
        @update:ai-overlay-open="setDetailAiOverlayOpen"
        @layout-change="handleDetailLayoutChange"
      >
        <template #sidebar>
          <aside class="note-detail-sidebar-panel">
            <NoteWorkspaceSidebar
              v-if="canShowPrivateNavigation"
              v-model:mode="detailSidebarMode"
              surface="detail"
              :current-parent-id="null"
              :active-page-id="note.id || null"
              :tree-scroll-top="detailTreeScrollTop"
              :browse-parent-id="browseParentId"
              :children-by-parent="sidebarTreeChildrenByParent"
              :expanded-ids="sidebarTreeExpandedIds"
              :loading-keys="sidebarTreeLoadingKeys"
              :tree-error="sidebarTreeError"
              :search-value="detailTreeSearchValue"
              :directory-enabled="noteTreeReadEnabled"
              :write-enabled="noteTreeWriteEnabled && !readonly"
              :drag-enabled="false"
              :search-active="treeSearchActive"
              :search-loading="treeSearchLoading"
              :search-match-count="treeSearchMatchCount"
              @toggle="toggleTreeNode"
              @open="openNoteDetailPage"
              @browse-children="browseSidebarChildren"
              @create="createChildPage"
              @attach="openAttachPages"
              @toggle-top="toggleSidebarPageTop"
              @move="openMoveSelf"
              @rename="openRenamePage"
              @share="openNoteShare"
              @delete="deleteSidebarPage"
              @go-library="openBreadcrumbPage(null)"
              @search="detailTreeSearchValue = $event"
            >
              <template #outline>
                <Catalog
                  v-if="!isDrawingNote"
                  variant="embedded"
                  :content="note.content"
                  :note-type="note.type"
                  @markdown-heading-click="scrollToMarkdownHeading"
                />
              </template>
            </NoteWorkspaceSidebar>
            <Catalog
              v-else
              v-show="!isDrawingNote"
              variant="embedded"
              :content="note.content"
              :note-type="note.type"
              @markdown-heading-click="scrollToMarkdownHeading"
            />
          </aside>
        </template>
        <div
          class="note-body-header editor-panel"
          :class="{ 'is-switching': isNoteSwitching }"
          :aria-busy="isNoteSwitching"
        >
          <div
            v-if="canShowPrivateNavigation || (showInboxOrganizer && !bookmark.isMobile)"
            class="note-detail-breadcrumb-row"
          >
            <nav
              v-if="canShowPrivateNavigation"
              class="note-detail-breadcrumb"
              :aria-label="t('note.currentDirectory')"
              @click.self="openMobileNavigation()"
            >
              <BButton size="small" class="note-detail-crumb" @click="openBreadcrumbPage(null)">
                {{ t('note.knowledgeRoot') }}
              </BButton>
              <template v-for="item in detailBreadcrumbTailDisplay" :key="item.key">
                <span class="note-detail-crumb-separator" aria-hidden="true">/</span>
                <span
                  v-if="item.kind === 'ellipsis'"
                  class="note-detail-crumb-ellipsis"
                  :title="t('note.hiddenBreadcrumbs')"
                  :aria-label="t('note.hiddenBreadcrumbs')"
                >
                  …
                </span>
                <span
                  v-else-if="item.id === note.id"
                  class="note-detail-crumb is-current"
                  :title="item.title || t('note.untitled')"
                  aria-current="page"
                >
                  {{ item.title || t('note.untitled') }}
                </span>
                <BButton
                  v-else
                  size="small"
                  class="note-detail-crumb"
                  :title="item.title || t('note.untitled')"
                  @click="openBreadcrumbPage(item.id)"
                >
                  {{ item.title || t('note.untitled') }}
                </BButton>
              </template>
            </nav>
            <BButton
              v-if="showInboxOrganizer && !bookmark.isMobile"
              type="primary"
              size="small"
              class="note-detail-complete-inbox"
              :loading="completingInbox"
              @click="saveAndCompleteInbox"
            >
              {{ t('inbox.saveAndComplete') }}
            </BButton>
          </div>
          <div :key="noteContentKey" class="note-detail-content">
            <div class="note-body-title n-title">
              <BInput
                v-if="bookmark.isMobile"
                class="note-title-mobile"
                height="50px"
                :disabled="readonly"
                v-model:value="note.title"
                @change="inputBlur"
                @focusout="focusout"
                :placeholder="$t('noteDetail.titlePlaceholder')"
              />
              <BInput
                v-else
                :disabled="readonly"
                v-model:value="note.title"
                @change="inputBlur"
                @focusout="focusout"
                :placeholder="$t('noteDetail.titlePlaceholder')"
              />
            </div>
            <DrawingNoteEditor
              v-if="isDrawingNote"
              ref="editorRef"
              class="editor-component"
              v-model:content="note.content"
              :readonly="readonly"
              :note-id="note.id"
              :title="note.title"
              @ready="handleEditorReady"
            />
            <Editor
              v-else
              ref="editorRef"
              class="editor-component"
              v-model:content="note.content"
              :type="note.type"
              :revision="note.revision"
              :persist-mode-conversion="persistEditorModeConversion"
              @update:type="note.type = $event"
              @switch-backup-change="hasSwitchBackup = $event"
              @mode-converted="onEditorModeConverted"
              :readonly="readonly"
              :note-id="note.id"
              :ensure-note-id="ensureNoteId"
              :resource-refs="resolvedResourceRefs"
              @set-note-id="onEditorSetNoteId"
              @ready="handleEditorReady"
              @markdown-rendered="refreshCatalog"
              @resource-refs-change="onEditorResourceRefsChange"
            />
          </div>
        </div>
        <template v-if="!isDrawingNote" #ai>
          <div class="note-detail-ai-slot">
            <AiReply class="ai-panel" />
          </div>
        </template>
      </NoteWorkspaceShell>

      <NoteMobileNavigationDrawer
        v-if="bookmark.isMobile && canShowPrivateNavigation"
        v-model:open="mobileNavigationOpen"
        :current-page-id="note.id"
        :initial-parent-id="mobileNavigationParentId"
        :content="note.content"
        :note-type="note.type"
        :initial-tab="mobileNavigationInitialTab"
        :write-enabled="noteTreeWriteEnabled && !readonly"
        @open-page="openNoteDetailPage"
        @create="createChildPage"
        @attach="openAttachPages"
        @toggle-top="toggleSidebarPageTop"
        @move="openMoveSelf"
        @rename="openRenamePage"
        @share="openNoteShare"
        @delete="deleteSidebarPage"
        @markdown-heading-click="scrollToMarkdownHeading"
      />
      <Catalog
        v-if="!isDrawingNote && !canShowPrivateNavigation && !bookmark.isDesktop"
        :content="note.content"
        :note-type="note.type"
        :drawer-open="catalogDrawerOpen"
        @markdown-heading-click="scrollToMarkdownHeading"
        @close="catalogDrawerOpen = false"
      />
    </div>
    <NoteDetailLoadingState v-if="!isReady" variant="page" :error="noteLoadFailed" @retry="retryLoadRouteNote" />
    <NoteVersionHistory
      v-if="versionHistoryVisible"
      v-model:visible="versionHistoryVisible"
      :note-id="note.id"
      :note-type="note.type"
      :current-note="note"
      @restored="onVersionRestored"
    />
    <SaveTemplateModal
      v-if="saveTemplateVisible && !isDrawingNote"
      v-model:visible="saveTemplateVisible"
      :note="note"
    />
    <NoteAttachPagesModal
      v-if="attachPagesVisible && noteTreeWriteEnabled && note.id"
      v-model:visible="attachPagesVisible"
      :target-note="attachTargetNote"
      @attached="handlePagesAttached"
    />
    <NoteMoveModal
      v-if="moveSelfVisible && noteTreeWriteEnabled && note.id"
      v-model:visible="moveSelfVisible"
      :note="moveTargetNote"
      @moved="handleSelfMoved"
    />
    <NoteRenameModal
      v-if="renamePageVisible && noteTreeWriteEnabled"
      v-model:visible="renamePageVisible"
      :note="renameTargetNote"
      @renamed="handlePageRenamed"
    />
    <NoteShareModal
      v-if="shareVisible && activeShareNote"
      v-model:visible="shareVisible"
      :note="activeShareNote"
      @close="activeShareNote = null"
    />
    <NewNotePickerModal
      v-if="childTypePickerVisible"
      v-model:visible="childTypePickerVisible"
      blank-only
      :title="t('note.newChildPage')"
      @select-blank="createChildPageWithType"
    />
    <NoteConflictModal
      v-if="conflictVisible && conflictCloudVersion && conflictLocalVersion"
      v-model:visible="conflictVisible"
      :cloud-version="conflictCloudVersion"
      :local-version="conflictLocalVersion"
      :busy-action="conflictBusyAction"
      @keep-cloud="keepConflictCloudVersion"
      @save-copy="saveConflictAsCopy"
      @overwrite="overwriteConflictWithLocal"
    />
  </div>
</template>

<script lang="ts" setup>
  import {
    computed,
    defineAsyncComponent,
    h,
    nextTick,
    onMounted,
    onUnmounted,
    provide,
    reactive,
    ref,
    watch,
  } from 'vue';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import router from '@/router';
  import { cloneDeep } from 'lodash-es';
  import { apiBasePost } from '@/http/request.ts';
  import Catalog from '@/components/noteLibrary/detail/Catalog.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, noteStore, useNoteLibraryCacheStore, useNoteWorkspaceStore, useUserStore } from '@/store';
  import NoteHeader from '@/components/noteLibrary/detail/NoteHeader.vue';
  import NoteDetailLoadingState from '@/components/noteLibrary/detail/NoteDetailLoadingState.vue';
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import NoteWorkspaceShell from '@/components/noteLibrary/workspace/NoteWorkspaceShell.vue';
  import NoteWorkspaceSidebar from '@/components/noteLibrary/workspace/NoteWorkspaceSidebar.vue';
  import NoteMobileNavigationDrawer from '@/components/noteLibrary/workspace/NoteMobileNavigationDrawer.vue';
  import NoteConflictModal from '@/components/noteLibrary/detail/NoteConflictModal.vue';
  import { renderNoteTemplate } from '@/utils/noteTemplate.ts';
  import { findBuiltinNoteTemplate, pickTemplateLocale } from '@/config/noteTemplates.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { invalidateDrawingPreview } from '@/api/drawingPreview';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';
  import {
    DISABLED_NOTE_TREE_FEATURES,
    fetchNoteDeletePreview,
    fetchNoteTreeFeatures,
    normalizeNoteTreeFeatures,
    type NoteTreeFeatures,
  } from '@/api/noteTree';
  import { normalizeNoteContentResourceUrls } from '@/utils/common.ts';
  import { useGuestGuard } from '@/composables/useGuestGuard';
  import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import { resolveNoteResourceRefs, type ResolvedResourceReference } from '@/api/noteReferences';
  import { buildResourceHref, resourceRefKey, type ResourceRef } from '@/utils/noteResourceRefs';
  import { normalizeMarkdownBlockquoteEntities } from '@lightnote/shared';
  import { noteHtmlToMarkdown } from '@/utils/noteHtmlToMarkdown';
  import { buildNoteBreadcrumbDisplay } from '@/utils/noteBreadcrumb';
  import { resolveNoteDetailReturnPath } from '@/utils/noteDetailNavigation';
  import { resolveNoteWorkspaceLayout, type NoteWorkspaceLayoutState } from '@/utils/noteWorkspaceLayout';
  import { markNoteDraftPromoted } from '@/utils/routeViewKey';
  import { NOTE_TREE_ROOT_KEY, useNoteTree } from '@/composables/useNoteTree';
  import type { NoteTreeItem } from '@/types/noteTree';
  import {
    buildNoteDetailRequestScope,
    consumeNoteDetail,
    invalidateNoteDetailPrefetch,
    prefetchNoteDetail,
    seedNoteDetail,
  } from '@/api/noteDetailPrefetch';
  import { preloadNoteEditorRuntime } from '@/components/noteLibrary/detail/editorRuntimeLoader';
  import { NOTE_LIBRARY_FEATURES_FRESH_MS } from '@/store/noteLibraryCache';
  import AsyncFeatureLoadingOverlay from '@/components/base/AsyncFeatureLoadingOverlay.vue';
  import { confirmNoteShareExposure } from '@/utils/noteShareExposure';

  const createDeferredDetailFeature = (loader: () => Promise<any>) =>
    defineAsyncComponent({
      loader,
      loadingComponent: AsyncFeatureLoadingOverlay,
      delay: 280,
      suspensible: false,
    });
  const NoteVersionHistory = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/detail/NoteVersionHistory.vue'),
  );
  const SaveTemplateModal = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/detail/SaveTemplateModal.vue'),
  );
  const NoteAttachPagesModal = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/tree/NoteAttachPagesModal.vue'),
  );
  const NoteMoveModal = createDeferredDetailFeature(() => import('@/components/noteLibrary/tree/NoteMoveModal.vue'));
  const NoteShareModal = createDeferredDetailFeature(() => import('@/components/noteLibrary/share/NoteShareModal.vue'));
  const NewNotePickerModal = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/library/NewNotePickerModal.vue'),
  );
  const NoteRenameModal = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/tree/NoteRenameModal.vue'),
  );
  // 手绘运行时只在明确打开 drawing 类型后请求，HTML / Markdown 详情和应用启动均不下载画布代码。
  const DrawingNoteEditor = createDeferredDetailFeature(
    () => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
  );

  function exportDrawingNote(format: 'png' | 'json') {
    const editor = editorRef.value as { exportPng?: () => Promise<void>; exportJson?: () => Promise<void> } | null;
    if (format === 'png') void editor?.exportPng?.();
    else void editor?.exportJson?.();
  }
  /*
   * AI 助手面板按需加载,但 chunk 到达前若什么都不渲染,note-body 会先按「右边没有面板」
   * 分配一次宽度,等它挂上再重排一次 —— 表现为进笔记后正文和目录轻轻抖一下
   * (实测面板晚 330ms 挂载,正文宽度从 1150px 缩到 875px、左边界从 270 挪到 215)。
   *
   * 占位是个空 div,宽度全由父级 .ai-panel 决定(flex: 3 + min-width: 310px),
   * 首帧就把位置占住,组件到位后原地填充,布局自始至终不变。
   * delay: 0 不能省 —— defineAsyncComponent 默认等 200ms 才显示 loading 组件
   * (为了避免快速加载时闪一下),那样占位会迟到,等于问题只解决一半。
   */
  const AiPanelPlaceholder = { render: () => h('div', { class: 'ai-panel-skeleton' }) };
  const AiReply = defineAsyncComponent({
    loader: () => import('@/components/noteLibrary/detail/AiReply.vue'),
    loadingComponent: AiPanelPlaceholder,
    delay: 0,
  });
  const bookmark = bookmarkStore();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const nStore = noteStore();
  const { guardWrite } = useGuestGuard();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();
  const { addResourcesToInbox, removeResourcesFromInbox } = useInboxEnqueue();
  const DEFAULT_NOTE_TITLE = t('note.untitledDoc');
  const DEFAULT_NOTE_CONTENT = '<p><br></p>';
  const DEFAULT_DRAWING_CONTENT = '{"v":2,"page":{"width":1448,"height":1448},"elements":[]}';
  const routeQueryValue = (value: unknown) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return String(raw ?? '').trim();
  };
  const noteLibraryFallback = () => {
    const parent = routeQueryValue(router.currentRoute.value.query.parent);
    return parent ? { path: '/noteLibrary', query: { parent } } : { path: '/noteLibrary' };
  };
  const sourceReturnPath = () => resolveNoteDetailReturnPath(router.currentRoute.value.query.from);
  const detailSourceQuery = () => {
    const from = sourceReturnPath();
    return from ? { from } : {};
  };
  const returnToSource = () => router.push(sourceReturnPath() || noteLibraryFallback());
  // 新建笔记时必须在 Editor 子组件挂载前就按 query(显式 type 或内置模板的 type)同步定好编辑器类型:
  // 子组件挂载早于父 onMounted,若此刻仍是默认富文本(html),随后灌入的 markdown 模板正文会经 TinyMCE,
  // 其中的 `>` 等被 HTML 转义成 &gt; 再回写存库。编辑已有笔记时该初值会被加载覆盖,不受影响。
  const resolveInitialNoteType = (query = router.currentRoute.value.query): 'html' | 'markdown' | 'drawing' => {
    if (query.type === 'drawing') return 'drawing';
    if (query.type === 'markdown') return 'markdown';
    if (query.builtin) {
      const tpl = findBuiltinNoteTemplate(String(query.builtin));
      if (tpl?.type === 'markdown') return 'markdown';
    }
    return 'html';
  };
  const initialNoteType = resolveInitialNoteType();
  const note = reactive({
    id: '',
    title: DEFAULT_NOTE_TITLE,
    lastTitle: DEFAULT_NOTE_TITLE,
    content:
      initialNoteType === 'drawing'
        ? DEFAULT_DRAWING_CONTENT
        : initialNoteType === 'markdown'
          ? ''
          : DEFAULT_NOTE_CONTENT,
    createBy: '',
    type: initialNoteType,
    revision: 1,
    parentId: null as string | null,
    isPending: false,
  });
  const isDrawingNote = computed(() => note.type === 'drawing');
  const nodeType = ref<'edit' | 'add' | 'share'>('edit');
  const noteWorkspace = useNoteWorkspaceStore();
  const noteLibraryCache = useNoteLibraryCacheStore();
  const noteCacheScope = computed(() => buildNoteDetailRequestScope(user));
  const initialFeatureSnapshot = noteLibraryCache.readFeatures(noteCacheScope.value);
  const noteTreeFeatures = ref<NoteTreeFeatures>({
    ...(initialFeatureSnapshot?.features || DISABLED_NOTE_TREE_FEATURES),
  });
  const noteTreeReadEnabled = computed(() => noteTreeFeatures.value.note_tree_read);
  const noteTreeWriteEnabled = computed(() => noteTreeFeatures.value.note_tree_write);
  const noteTreeSubtreeTrashEnabled = computed(
    () => noteTreeWriteEnabled.value && noteTreeFeatures.value.note_tree_subtree_trash,
  );
  const canShowPrivateNavigation = computed(
    () =>
      noteTreeReadEnabled.value &&
      Boolean(user.id) &&
      (nodeType.value === 'add' || (nodeType.value === 'edit' && Boolean(note.id) && user.id === note.createBy)),
  );
  const canShowDetailSidebar = computed(
    () => canShowPrivateNavigation.value || (!bookmark.isMobile && nStore.headings.length > 0),
  );
  function invalidateNoteReadCaches(noteId = note.id) {
    invalidateNoteDetailPrefetch(user, noteId);
    noteLibraryCache.markListsStale(buildNoteDetailRequestScope(user));
  }
  const {
    aiPreferredOpen,
    browseParentId,
    detailTab,
    detailTreeScrollTop,
    sidebarPreferredOpen,
    sidebarWidth: noteWorkspaceSidebarWidth,
  } = storeToRefs(noteWorkspace);
  const shouldLoadDetailTree = computed(
    () => canShowPrivateNavigation.value && !bookmark.isMobile && sidebarPreferredOpen.value,
  );
  const initialDetailWorkspaceLayout = resolveNoteWorkspaceLayout(
    typeof window === 'undefined' ? 1420 : window.innerWidth,
    bookmark.isMobile,
  );
  const detailWorkspaceMode = ref(initialDetailWorkspaceLayout.mode);
  const detailSidebarOverlayOpen = ref(false);
  const detailAiOverlayOpen = ref(false);

  function handleDetailLayoutChange(layout: NoteWorkspaceLayoutState) {
    if (detailWorkspaceMode.value !== layout.mode) {
      detailSidebarOverlayOpen.value = false;
      detailAiOverlayOpen.value = false;
    }
    detailWorkspaceMode.value = layout.mode;
  }

  function setDetailSidebarOverlayOpen(value: boolean) {
    detailSidebarOverlayOpen.value = value;
    if (value) detailAiOverlayOpen.value = false;
  }

  function setDetailAiOverlayOpen(value: boolean) {
    detailAiOverlayOpen.value = value;
    if (value) detailSidebarOverlayOpen.value = false;
  }

  const {
    childrenByParent,
    currentBreadcrumb: detailBreadcrumb,
    expandedIds,
    loadingKeys: treeLoadingKeys,
    treeError,
    treeSearchChildrenByParent,
    treeSearchError,
    treeSearchExpandedIds,
    treeSearchKeyword,
    treeSearchLoading,
    treeSearchMatchCount,
    loadBreadcrumb: loadWorkspaceBreadcrumb,
    loadChildren: loadTreeChildren,
    refreshTree,
    searchTree,
    toggleExpanded,
  } = useNoteTree({
    enabled: canShowPrivateNavigation,
    loadTree: shouldLoadDetailTree,
    revealBreadcrumb: shouldLoadDetailTree,
  });
  const detailSidebarMode = computed<'directory' | 'outline'>({
    get: () => (detailTab.value === 'outline' ? 'outline' : 'directory'),
    set: (value) => {
      detailTab.value = value === 'outline' ? 'outline' : 'pages';
    },
  });
  const detailTreeSearchValue = ref('');
  const treeSearchActive = computed(() => Boolean(treeSearchKeyword.value.trim()));
  const sidebarTreeChildrenByParent = computed(() =>
    treeSearchActive.value ? treeSearchChildrenByParent.value : childrenByParent.value,
  );
  const sidebarTreeExpandedIds = computed(() =>
    treeSearchActive.value ? treeSearchExpandedIds.value : expandedIds.value,
  );
  const sidebarTreeLoadingKeys = computed(() =>
    treeSearchActive.value && treeSearchLoading.value
      ? new Set([NOTE_TREE_ROOT_KEY])
      : treeSearchActive.value
        ? new Set<string>()
        : treeLoadingKeys.value,
  );
  const sidebarTreeError = computed(() => (treeSearchActive.value ? treeSearchError.value : treeError.value));
  let detailTreeSearchTimer = 0;
  interface NoteEditorHandle {
    focusToEnd?: () => void;
    replaceContentWithUndo?: (content: string, type?: 'html' | 'markdown' | 'drawing') => boolean | Promise<boolean>;
    scrollToMarkdownHeading?: (index: number, sourceOffset?: number) => void;
    scrollToResourceRef?: (href: string) => void | Promise<void>;
    triggerModeSwitch?: () => void | Promise<void>;
    triggerUndoSwitch?: boolean;
  }
  const editorRef = ref<NoteEditorHandle | null>(null);
  const noteContentKey = ref('note-content:initial');
  const isNoteSwitching = ref(false);
  const openingPageId = ref<string | null>(null);
  let noteOpenRequestVersion = 0;
  const contentAutosaveReady = ref(false);
  let promotedDraftRouteId = '';
  const hasSwitchBackup = ref(false);
  const versionHistoryVisible = ref(false);
  const shareVisible = ref(false);
  const activeShareNote = ref<{ id: string; title?: string } | null>(null);

  function openNoteShare(target: { id?: string | number | null; title?: string | null }) {
    if (readonly.value) return;
    const id = String(target?.id || '').trim();
    if (!id) return;
    activeShareNote.value = { id, title: String(target?.title || '') };
    shareVisible.value = true;
  }
  type ConflictVersion = {
    id?: string;
    title: string;
    content: string;
    type: 'html' | 'markdown' | 'drawing';
    revision: number;
    updatedAt?: number | string | null;
    parentId?: string | null;
  };
  const conflictVisible = ref(false);
  const conflictCloudVersion = ref<ConflictVersion | null>(null);
  const conflictLocalVersion = ref<ConflictVersion | null>(null);
  const conflictBusyAction = ref<'' | 'copy' | 'overwrite'>('');
  let conflictEditorUsesLocal = false;
  const catalogDrawerOpen = ref(false);
  const resolvedResourceRefs = ref<ResolvedResourceReference[]>([]);
  const detailBreadcrumbDisplay = computed(() => buildNoteBreadcrumbDisplay(detailBreadcrumb.value, bookmark.isMobile));
  const detailBreadcrumbTailDisplay = computed(() =>
    detailBreadcrumbDisplay.value.filter((item) => item.kind !== 'root'),
  );
  let resourceResolveVersion = 0;
  let lastResourceRefSignature = '';
  let currentEditorResourceRefs: ResourceRef[] = [];

  async function loadNoteTreeFeatureSnapshot() {
    const requestScope = noteCacheScope.value;
    try {
      const next = await fetchNoteTreeFeatures();
      if (requestScope !== noteCacheScope.value) return;
      noteTreeFeatures.value = next;
      noteLibraryCache.writeFeatures(requestScope, next);
    } catch {
      // 已有快照时保留可用能力；弱网刷新失败不能让面包屑/目录突然消失。
      if (!noteLibraryCache.readFeatures(requestScope)) {
        noteTreeFeatures.value = { ...DISABLED_NOTE_TREE_FEATURES };
      }
    }
  }

  const initialFeatureRouteRawId = router.currentRoute.value.params.id;
  const initialFeatureRouteId = Array.isArray(initialFeatureRouteRawId)
    ? initialFeatureRouteRawId.join('/')
    : String(initialFeatureRouteRawId || '');
  // 已有笔记由 getNoteDetail 同一响应携带能力快照和面包屑，避免冷启动时额外请求后
  // 再逐段点亮导航。新建页没有详情请求，仍沿用独立能力接口。
  const receivesTreeBootstrapFromDetail = Boolean(initialFeatureRouteId && initialFeatureRouteId !== 'add');
  const noteTreeFeaturePromise =
    !receivesTreeBootstrapFromDetail &&
    (!initialFeatureSnapshot || Date.now() - initialFeatureSnapshot.updatedAt > NOTE_LIBRARY_FEATURES_FRESH_MS)
      ? loadNoteTreeFeatureSnapshot()
      : Promise.resolve();

  watch(noteCacheScope, (scope, previousScope) => {
    if (!previousScope || scope === previousScope) return;
    const cached = noteLibraryCache.readFeatures(scope);
    noteTreeFeatures.value = { ...(cached?.features || DISABLED_NOTE_TREE_FEATURES) };
    if (!cached || Date.now() - cached.updatedAt > NOTE_LIBRARY_FEATURES_FRESH_MS) {
      void loadNoteTreeFeatureSnapshot();
    }
  });

  async function resolveEditorResourceRefs(refs: ResourceRef[], force = false) {
    const normalized = refs.slice(0, 100);
    const signature = `${note.id}|${normalized.map(resourceRefKey).join('|')}`;
    if (!force && signature === lastResourceRefSignature) return;
    lastResourceRefSignature = signature;
    const request = ++resourceResolveVersion;
    if (!normalized.length) {
      resolvedResourceRefs.value = [];
      return;
    }
    // 内容改动时先清掉旧映射，避免新链接短暂套用旧资源的可用状态或标题。
    resolvedResourceRefs.value = [];
    try {
      const resolved = await resolveNoteResourceRefs(normalized);
      if (request === resourceResolveVersion) {
        resolvedResourceRefs.value = resolved;
      }
    } catch {
      if (request === resourceResolveVersion) {
        resolvedResourceRefs.value = [];
      }
    }
  }

  async function onEditorResourceRefsChange(refs: ResourceRef[]) {
    currentEditorResourceRefs = refs.slice(0, 100);
    await resolveEditorResourceRefs(currentEditorResourceRefs);
  }

  function refreshEditorResourceRefs() {
    if (document.visibilityState === 'hidden' || !currentEditorResourceRefs.length) return;
    void resolveEditorResourceRefs(currentEditorResourceRefs, true);
  }

  function handleResourceRefVisibilityChange() {
    if (document.visibilityState === 'visible') refreshEditorResourceRefs();
  }

  watch(
    () => note.id,
    () => {
      catalogDrawerOpen.value = false;
      lastResourceRefSignature = '';
      resolvedResourceRefs.value = [];
    },
  );

  type NoteType = 'html' | 'markdown' | 'drawing';
  const normalizeNoteType = (type?: string): NoteType =>
    type === 'drawing' ? 'drawing' : type === 'markdown' || type === 'md' ? 'markdown' : 'html';
  const normalizeLoadedContent = (content: string, rawType?: string) => {
    const raw = content || '';
    if (normalizeNoteType(rawType) === 'drawing') return raw || DEFAULT_DRAWING_CONTENT;
    // Markdown 源文本(type='markdown')绝不能过 normalizeNoteContentResourceUrls:
    // 它用 innerHTML 往返做图片 URL 归一化,DOM 序列化会把文本节点里的 `>` 转成 `&gt;`
    // ——这是「日报模板引用块被转义」反复复发的真正根因(加载即污染显示,一保存就污染入库)。
    // md 的图片是 ![](url) 语法,DOM 方式本也处理不到,跳过无损失。老 'md' 类型正文实际存 HTML,仍需归一化。
    if (rawType !== 'md' && normalizeNoteType(rawType) === 'markdown') {
      // 已污染的历史正文也要在编辑区立即恢复为真正的 Markdown 源码；
      // 规范函数只处理语义明确的行首引用标记，不会把普通 HTML 实体整体解码。
      return normalizeMarkdownBlockquoteEntities(raw);
    }
    const normalized = normalizeNoteContentResourceUrls(raw);
    // 早期 Markdown 笔记使用 type=md，正文实际存的是 HTML；加载时转回 Markdown 源文本。
    if (rawType !== 'md' || !/^\s*<(?:h[1-6]|p|ul|ol|blockquote|pre|div)\b/i.test(normalized)) return normalized;
    return noteHtmlToMarkdown(normalized);
  };

  function currentNoteVersion(updatedAt: number | string | null = Date.now()): ConflictVersion {
    return {
      id: note.id || undefined,
      title: String(note.title || ''),
      content: String(note.content || ''),
      type: normalizeNoteType(note.type),
      revision: Math.max(1, Number(note.revision || 1)),
      updatedAt,
      parentId: note.parentId,
    };
  }

  function normalizeConflictVersion(value: any, fallbackId = note.id): ConflictVersion | null {
    if (!value || typeof value !== 'object') return null;
    const type = normalizeNoteType(value.type);
    const revision = Math.max(1, Number(value.revision || 1));
    return {
      id: String(value.id || fallbackId || '') || undefined,
      title: String(value.title || ''),
      content: normalizeLoadedContent(String(value.content || ''), value.type || type),
      type,
      revision,
      updatedAt: value.updatedAt ?? value.updateTime ?? null,
      parentId: value.parentId ?? note.parentId,
    };
  }

  // 历史版本恢复后:回写标题/正文并刷新编辑器与目录
  async function onVersionRestored(data: any) {
    if (!data) return;
    // 恢复的版本可能是不同编辑模式(md/html):模式变了直接重载,保证编辑器与内容一致(罕见路径)
    const restoredType = normalizeNoteType(data.type || note.type);
    if (restoredType !== note.type) {
      window.location.reload();
      return;
    }
    if (typeof data.title === 'string') {
      note.title = data.title;
      note.lastTitle = cloneDeep(note.title);
      if (note.id) noteWorkspace.updateNoteMetadata(note.id, { title: note.title, type: restoredType });
      syncHeaderTitle();
    }
    note.revision = Math.max(1, Number(data.revision || note.revision || 1));
    if (typeof data.content === 'string') {
      const content = normalizeLoadedContent(data.content, data.type);
      const applied = await editorRef.value?.replaceContentWithUndo?.(content, restoredType);
      if (!applied) {
        note.content = content;
      }
    }
    setUpdateTime();
    nextTick(() => void refreshCatalog());
  }

  function resetSaveQueueAfterConflict() {
    clearScheduledSave();
    requestedSaveVersion = 0;
    persistedSaveVersion = 0;
    latestRequestedTitle = note.title;
    saveQueue = Promise.resolve(true);
  }

  async function applyVersionSnapshot(snapshot: ConflictVersion) {
    contentAutosaveReady.value = false;
    isNoteSwitching.value = true;
    note.title = snapshot.title;
    note.lastTitle = snapshot.title;
    note.content = snapshot.content;
    note.type = snapshot.type;
    note.revision = snapshot.revision;
    note.parentId = snapshot.parentId ?? note.parentId;
    noteContentKey.value = `note-content:${note.id || 'add'}:conflict:${Date.now()}`;
    await nextTick();
    await syncHeaderTitle();
    if (snapshot.type === 'markdown') completeMarkdownContentSwitch();
  }

  function openVersionConflict(cloud: ConflictVersion, local: ConflictVersion = currentNoteVersion()) {
    conflictCloudVersion.value = cloud;
    conflictLocalVersion.value = local;
    conflictEditorUsesLocal = true;
    conflictBusyAction.value = '';
    conflictVisible.value = true;
    saveStatus.value = 'error';
  }

  async function keepConflictCloudVersion() {
    const cloud = conflictCloudVersion.value;
    if (!cloud || conflictBusyAction.value) return;
    resetSaveQueueAfterConflict();
    conflictVisible.value = false;
    await applyVersionSnapshot(cloud);
    saveStatus.value = 'saved';
    conflictCloudVersion.value = null;
    conflictLocalVersion.value = null;
    conflictEditorUsesLocal = false;
  }

  async function saveConflictAsCopy() {
    const local = conflictLocalVersion.value;
    if (!local || conflictBusyAction.value) return;
    conflictBusyAction.value = 'copy';
    try {
      const payload = {
        title: `${local.title || DEFAULT_NOTE_TITLE}${t('noteDetail.conflict.copyTitleSuffix')}`.slice(0, 255),
        content: local.content,
        type: local.type,
        parentId: local.parentId ?? note.parentId ?? null,
      };
      let response = await apiBasePost('/api/note/addNote', payload);
      const exposureDecision = await confirmNoteShareExposure(response);
      if (exposureDecision === false) return;
      if (exposureDecision === true) {
        response = await apiBasePost('/api/note/addNote', { ...payload, shareExposureAcknowledged: true });
      }
      if (response.status !== 200 || !response.data?.id) {
        message.error(response.msg || t('noteDetail.saveFailed'));
        return;
      }
      resetSaveQueueAfterConflict();
      conflictVisible.value = false;
      conflictEditorUsesLocal = false;
      skipSaveOnLeave = true;
      message.success(t('noteDetail.conflict.copySaved'));
      recordOperation({
        module: '笔记',
        operation: `冲突内容另存为新笔记【${response.data.title || local.title}】`,
      });
      await router.push({
        path: `/noteLibrary/${encodeURIComponent(String(response.data.id))}`,
        query: detailSourceQuery(),
      });
    } catch {
      message.error(t('noteDetail.saveFailed'));
    } finally {
      conflictBusyAction.value = '';
    }
  }

  function overwriteConflictWithLocal() {
    const local = conflictLocalVersion.value;
    const cloud = conflictCloudVersion.value;
    if (!local || !cloud || conflictBusyAction.value) return;
    Alert.alert({
      title: t('noteDetail.conflict.overwriteConfirmTitle'),
      content: t('noteDetail.conflict.overwriteConfirm'),
      okText: t('noteDetail.conflict.overwrite'),
      okType: 'danger',
      onOk: () => void performConflictOverwrite(local, cloud),
    });
  }

  async function performConflictOverwrite(local: ConflictVersion, cloud: ConflictVersion) {
    if (conflictBusyAction.value) return;
    conflictBusyAction.value = 'overwrite';
    try {
      resetSaveQueueAfterConflict();
      await applyVersionSnapshot({ ...local, revision: cloud.revision });
      conflictVisible.value = false;
      conflictEditorUsesLocal = false;
      conflictCloudVersion.value = null;
      conflictLocalVersion.value = null;
      const saved = await saveImmediately(false);
      if (saved) {
        message.success(t('noteDetail.conflict.overwriteSuccess'));
      }
    } finally {
      conflictBusyAction.value = '';
    }
  }

  async function openVersionHistory() {
    if (readonly.value) {
      versionHistoryVisible.value = true;
      return;
    }
    // 历史恢复只基于已经落库的 revision。先保存当前编辑内容，避免“刚写完还没到
    // 自动保存计时点就点恢复”时，本地新内容没有进入恢复前快照。
    const saved = await saveImmediately(false);
    if (saved) versionHistoryVisible.value = true;
  }

  async function triggerEditorSwitch() {
    // 格式转换前先把“尚未转换的原文”完整落库；确认弹窗随后携带这个 revision
    // 调用独立原子转换接口，服务端会强制创建 format_conversion 还原点。
    if (note.id || hasNewNoteDraft()) {
      const saved = await saveImmediately(false);
      if (!saved) return;
    }
    await nextTick();
    await editorRef.value?.triggerModeSwitch?.();
  }

  async function persistEditorModeConversion(payload: {
    targetType: 'html' | 'markdown';
    convertedContent: string;
    baseRevision: number;
    analysisHash: string;
  }) {
    if (!note.id) return null;
    try {
      const response = await apiBasePost('/api/note/convertMode', {
        id: note.id,
        ...payload,
      });
      if (response.status === 409 && response.data?.code === 'NOTE_VERSION_CONFLICT') {
        const cloud = normalizeConflictVersion(response.data?.details?.current, note.id);
        if (cloud) {
          openVersionConflict(cloud, {
            ...currentNoteVersion(),
            content: payload.convertedContent,
            type: payload.targetType,
            revision: payload.baseRevision,
          });
        }
        return null;
      }
      if (response.status !== 200 || !response.data) {
        message.error(response.msg || t('noteDetail.saveFailed'));
        return null;
      }
      return {
        content: String(response.data.content || ''),
        type: normalizeNoteType(response.data.type),
        revision: Math.max(1, Number(response.data.revision || payload.baseRevision + 1)),
        updateTime: response.data.updateTime ?? null,
      };
    } catch (error) {
      console.error('转换笔记格式失败:', error);
      message.error(t('noteDetail.saveFailed'));
      return null;
    }
  }

  function onEditorModeConverted(result: {
    content: string;
    type: 'html' | 'markdown';
    revision: number;
    updateTime?: number | string | null;
  }) {
    clearScheduledSave();
    note.content = result.content;
    note.type = result.type;
    note.revision = Math.max(1, Number(result.revision || note.revision || 1));
    // Editor 在服务端原子转换成功后才更新本地 v-model；这几次同步赋值会经过普通
    // autosave watcher。转换结果已经落库，清掉它们刚排入的 500ms 定时保存，避免
    // 紧跟着再发一笔内容完全相同的 updateNote。
    clearScheduledSave();
    if (result.updateTime) updateTime.value = String(result.updateTime);
    else setUpdateTime();
    persistedSaveVersion = Math.max(persistedSaveVersion, requestedSaveVersion);
    saveQueue = Promise.resolve(true);
    saveStatus.value = 'saved';
    if (note.id) noteWorkspace.updateNoteMetadata(note.id, { title: note.title, type: note.type });
  }

  async function triggerEditorUndo() {
    if (!editorRef.value?.triggerUndoSwitch) return;
    if (note.id || hasNewNoteDraft()) {
      const saved = await saveImmediately(false);
      if (!saved) return;
    }
    await nextTick();
    editorRef.value.triggerUndoSwitch();
  }

  provide('note', note);
  provide('triggerSave', () => saveFunc());
  provide('applyTitleFromAi', (newTitle: string) => {
    note.title = newTitle;
    syncHeaderTitle();
  });
  provide('focusEditorToEnd', () => {
    editorRef.value?.focusToEnd?.();
  });
  provide('applyContentFromAi', async (content: string, type: 'html' | 'markdown') => {
    if (isDrawingNote.value) return;
    const normalizedContent = type === 'markdown' ? normalizeMarkdownBlockquoteEntities(content) : content;
    const applied = await editorRef.value?.replaceContentWithUndo?.(normalizedContent, type);
    if (!applied) {
      note.content = normalizedContent;
    }
  });
  const readonly = computed(() => {
    if (user.role === 'root') {
      return false;
    } else if (nodeType.value === 'share') {
      return true;
    } else if (nodeType.value === 'add') {
      return false;
    } else {
      return user.id !== note.createBy;
    }
  });
  const showInboxOrganizer = computed(() => !readonly.value && Boolean(note.id) && Boolean(note.isPending));
  function inputBlur() {
    if (note.title?.trim() && note.title !== note.lastTitle) {
      void syncHeaderTitle();
      void saveImmediately();
    }
  }

  function focusout() {
    if (!note.title?.trim()) {
      note.title = note.lastTitle;
      void syncHeaderTitle();
      return;
    }
  }

  function syncDesktopTitleToNote() {
    const title = document.getElementById('note-header-title');
    if (!title) return false;
    const text = title.innerText;
    if (!text?.trim()) {
      note.title = note.lastTitle;
      title.innerText = note.lastTitle;
      return false;
    }
    if (text === note.title) return false;
    note.title = text;
    return true;
  }

  function titleBlur() {
    const titleChanged = syncDesktopTitleToNote();
    if (titleChanged || (note.title?.trim() && note.title !== note.lastTitle)) {
      void saveImmediately();
    }
  }

  const isStartEdit = ref(false);
  const saveStatus = ref<'saved' | 'pending' | 'saving' | 'offline' | 'error'>('saved');
  const isLeaving = ref(false);
  const updateTime = ref('');
  const timer = ref<ReturnType<typeof setTimeout> | null>(null);
  // 正文草稿已由 IndexedDB 以更短合并窗口托底；服务端保存放宽到 1.5s，
  // 离开路由、切换笔记和显式保存仍会立即 flush，减少连续输入的重复写入。
  const TEXT_SAVE_DEBOUNCE_DELAY = 1_500;
  const DRAWING_SAVE_DEBOUNCE_DELAY = 3_000;
  let requestedSaveVersion = 0;
  let persistedSaveVersion = 0;
  let latestRequestedTitle = note.title;
  let skipSaveOnLeave = false;
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  // 把当前笔记标题同步给 note store,供全局 AI 抽屉「@当前页面」显示真实笔记名
  // (抽屉是全局组件、拿不到详情页的响应式 note;离开笔记页后该值不再被读到,无需清理)。
  watch(
    () => note.title,
    (title) => {
      nStore.currentTitle = title || '';
    },
    { immediate: true },
  );
  async function syncHeaderTitle() {
    if (bookmark.isMobile) return;
    await nextTick();
    const title = document.getElementById('note-header-title');
    if (title) {
      title.innerText = note.title;
    }
  }

  function setUpdateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    updateTime.value = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  function isBlankNoteContent(content?: string) {
    const wrap = document.createElement('div');
    wrap.innerHTML = content || '';
    const text = (wrap.textContent || '').replace(/\u00a0/g, '').trim();
    if (text) return false;
    return !wrap.querySelector('img, video, audio, iframe, table, input, canvas, pre, blockquote');
  }

  function hasNewNoteDraft() {
    if (isDrawingNote.value) {
      return note.title.trim() !== DEFAULT_NOTE_TITLE || note.content !== DEFAULT_DRAWING_CONTENT;
    }
    return note.title.trim() !== DEFAULT_NOTE_TITLE || !isBlankNoteContent(note.content);
  }

  /*
   * 进笔记时目录那一下「闪」的两处根因,分开治:
   *
   * 一是版面。generateTOC 要等编辑器把内容铺进 DOM 才解析得出标题(富文本还带重试),
   * 那之前 headings 是空的 —— 照此渲染,正文先占满整宽,一百多毫秒后目录解析出来又把它推回去。
   * 但内容在 isReady 之前就已经拿到了,所以先按字符串粗判有没有标题(catalogPresumed),
   * 首帧就把目录该占的位置留出来,解析完成后这个预判即失效,一切以真实 headings 为准。
   *
   * 二是过渡。那 0.26s 的展开是给「编辑时新打一个标题」准备的,首屏定型不该表演一次,
   * 所以过渡等首屏解析完再开(catalogTransitionReady)。
   * 不用 requestAnimationFrame 挂这个开关:后台标签页里 rAF 不触发,
   * 在新标签打开的笔记会永远开不了过渡 —— 首帧版面既然已经摆对,这里直接开即可。
   */
  async function refreshCatalog() {
    if (isDrawingNote.value) {
      nStore.headings = [];
      return;
    }
    await nStore.generateTOC(note.content, note.type);
  }

  async function handleEditorReady() {
    const rawRouteId = router.currentRoute.value.params.id;
    const currentRouteId = Array.isArray(rawRouteId) ? rawRouteId.join('/') : String(rawRouteId || '');
    // 快速切换时旧编辑器可能晚到一个 ready；它不能重新开启自动保存，也不能覆盖新页面的大纲。
    if (currentRouteId !== 'add' && currentRouteId !== note.id) return;
    editorRuntimeReady.value = true;
    contentAutosaveReady.value = true;
    isNoteSwitching.value = false;
    // 不 await:目录解析最长要等 6 次重试，focusRef 定位不该被它拖着
    void refreshCatalog();
    const raw = String(router.currentRoute.value.query.focusRef || '');
    const separator = raw.indexOf(':');
    if (separator <= 0) return;
    const href = buildResourceHref({
      type: raw.slice(0, separator) as ResourceRef['type'],
      id: raw.slice(separator + 1),
    });
    if (!href) return;
    await nextTick();
    await editorRef.value?.scrollToResourceRef?.(href);
  }

  function scrollToMarkdownHeading(index: number) {
    const heading = nStore.headings[index];
    if (!heading) return;
    editorRef.value?.scrollToMarkdownHeading?.(index, heading.sourceOffset);
  }

  const attachPagesVisible = ref(false);
  const moveSelfVisible = ref(false);
  const renamePageVisible = ref(false);
  const activeAttachTarget = ref<NoteTreeItem | null>(null);
  const activeMoveTarget = ref<NoteTreeItem | null>(null);
  const renameTargetNote = ref<{ id: string; title?: string; revision?: number } | null>(null);
  const subpageCount = ref(0);
  const mobileNavigationOpen = ref(false);
  const mobileNavigationParentId = ref<string | null>(null);
  const mobileNavigationInitialTab = ref<'pages' | 'outline'>('pages');
  const childTypePickerVisible = ref(false);
  const childCreateParentId = ref('');
  const currentTreeNote = computed(() => ({
    id: note.id,
    title: note.title,
    parentId: note.parentId || detailBreadcrumb.value.at(-2)?.id || null,
  }));
  const attachTargetNote = computed(() => activeAttachTarget.value || currentTreeNote.value);
  const moveTargetNote = computed(() => activeMoveTarget.value || currentTreeNote.value);

  function createChildPage(target?: NoteTreeItem) {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    childCreateParentId.value = target?.id || note.id;
    childTypePickerVisible.value = true;
  }

  function createChildPageWithType(type: 'html' | 'markdown' | 'drawing') {
    if (!childCreateParentId.value) return;
    childTypePickerVisible.value = false;
    router.push({
      path: '/noteLibrary/add',
      query: { type, parent: childCreateParentId.value, ...detailSourceQuery() },
    });
  }

  function openAttachPages(target?: NoteTreeItem) {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    activeAttachTarget.value = target || null;
    attachPagesVisible.value = true;
  }

  function handlePagesAttached() {
    attachPagesVisible.value = false;
    activeAttachTarget.value = null;
    void refreshTree();
    void loadDetailBreadcrumb(note.id);
  }

  function openMoveSelf(target?: NoteTreeItem) {
    if (!noteTreeWriteEnabled.value || !note.id || readonly.value) return;
    activeMoveTarget.value = target || null;
    moveSelfVisible.value = true;
  }

  function handleSelfMoved(result: { parentId?: string | null } | null) {
    moveSelfVisible.value = false;
    const movedCurrentPage = !activeMoveTarget.value || activeMoveTarget.value.id === note.id;
    if (movedCurrentPage && result && Object.prototype.hasOwnProperty.call(result, 'parentId')) {
      note.parentId = result.parentId || null;
    }
    activeMoveTarget.value = null;
    void refreshTree();
    void loadDetailBreadcrumb(note.id);
  }

  function openRenamePage(target: NoteTreeItem) {
    if (!guardWrite(undefined, 'rename-note') || readonly.value) return;
    renameTargetNote.value = {
      id: target.id,
      title: target.title || '',
      revision: target.id === note.id ? note.revision : target.revision,
    };
    renamePageVisible.value = true;
  }

  async function handlePageRenamed(updated: { id: string; title: string; revision?: number }) {
    renamePageVisible.value = false;
    renameTargetNote.value = null;
    if (updated.id === note.id) {
      note.title = updated.title;
      note.lastTitle = updated.title;
      if (updated.revision) note.revision = updated.revision;
    }
    recordOperation({ module: '笔记', operation: `重命名笔记【${updated.title}】` });
    invalidateNoteReadCaches(updated.id);
    await refreshTree();
    if (updated.id === note.id) await loadDetailBreadcrumb(note.id);
  }

  async function toggleSidebarPageTop(target: NoteTreeItem) {
    if (!guardWrite(undefined, 'pin-note') || readonly.value) return;
    const response = await apiBasePost('/api/note/toggleNoteTop', { id: target.id });
    if (response.status !== 200) return;
    target.isTop = Boolean(response.data?.isTop);
    invalidateNoteReadCaches(target.id);
    message.success(target.isTop ? t('common.pinned') : t('common.unpinned'));
    await refreshTree();
  }

  async function deleteSidebarPage(target: NoteTreeItem) {
    if (target.id === note.id) {
      await delNote();
      return;
    }
    if (!guardWrite(undefined, 'delete-note') || readonly.value) return;
    let preview;
    try {
      preview = await fetchNoteDeletePreview(target.id);
    } catch {
      message.error(t('note.deletePreviewFailed'));
      return;
    }
    Alert.alert({
      title: t('note.deleteOneTitle'),
      content: preview.descendantCount
        ? t('note.deleteSubtreeConfirm', {
            title: target.title || t('note.untitled'),
            descendants: preview.descendantCount,
          })
        : t('note.deleteOneConfirm', { title: target.title || t('note.untitled') }),
      okText:
        preview.totalCount > 1 ? t('note.moveItemsToTrash', { count: preview.totalCount }) : t('note.moveToTrash'),
      async onOk() {
        const endpoint = noteTreeSubtreeTrashEnabled.value ? '/api/note/deleteNoteSubtree' : '/api/note/delNote';
        const payload = noteTreeSubtreeTrashEnabled.value
          ? { id: preview.id, expectedDescendantCount: preview.descendantCount }
          : { ids: [String(target.id)] };
        const response = await apiBasePost(endpoint, payload);
        if (response.status === 409) {
          message.warning(response.msg || t('note.deleteScopeChanged'));
          return;
        }
        if (response.status !== 200) return;
        invalidateNoteReadCaches(target.id);
        message.success(t('common.deleteSuccess'));
        await refreshTree();
        await loadDetailBreadcrumb(note.id);
      },
    });
  }

  async function toggleTreeNode(node: any) {
    await toggleExpanded(node);
  }

  async function browseSidebarChildren(id: string) {
    noteWorkspace.setNavigation({ browseParentId: id });
    await loadTreeChildren(id);
  }

  function openMobileNavigation(parentId: string | null = null, tab: 'pages' | 'outline' = 'pages') {
    mobileNavigationParentId.value = parentId ?? note.parentId ?? detailBreadcrumb.value.at(-2)?.id ?? null;
    mobileNavigationInitialTab.value = tab;
    mobileNavigationOpen.value = true;
  }

  async function browseCurrentChildren() {
    if (!note.id) return;
    if (bookmark.isMobile) {
      openMobileNavigation(note.id, 'pages');
      return;
    }
    if (detailWorkspaceMode.value === 'wide' || detailWorkspaceMode.value === 'standard') {
      noteWorkspace.setSidebarPreferredOpen(true);
    } else {
      setDetailSidebarOverlayOpen(true);
    }
    noteWorkspace.setNavigation({ browseParentId: note.id });
    await loadTreeChildren(note.id);
    const currentNode = Object.values(childrenByParent.value)
      .flat()
      .find((item) => item.id === note.id);
    if (currentNode?.hasChildren && !expandedIds.value.has(note.id)) await toggleExpanded(currentNode);
  }

  async function openNoteDetailPage(id: string) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId || normalizedId === note.id || normalizedId === openingPageId.value) return;

    const requestVersion = ++noteOpenRequestVersion;
    openingPageId.value = normalizedId;
    isNoteSwitching.value = true;
    try {
      // 目标详情仍使用独立 RouterView key 隔离编辑器与保存队列，但先让当前页面留在屏幕上。
      // 请求落入现有的有界预取缓存后再换路由，新实例可同步消费结果，不会暴露整页骨架。
      await prefetchNoteDetail(user, normalizedId);
    } catch {
      // 预取失败仍进入目标页，由详情页既有的错误/重试态收口。
    }
    if (requestVersion !== noteOpenRequestVersion) return;
    try {
      await router.push({
        path: `/noteLibrary/${encodeURIComponent(normalizedId)}`,
        query: detailSourceQuery(),
      });
    } finally {
      if (requestVersion === noteOpenRequestVersion) {
        openingPageId.value = null;
        isNoteSwitching.value = false;
      }
    }
  }

  function openBreadcrumbPage(pageId: string | null) {
    if (!pageId) {
      void router.push(
        bookmark.isMobile
          ? {
              path: '/noteLibrary',
              query: { openDirectory: '1' },
            }
          : '/noteLibrary',
      );
      return;
    }
    void openNoteDetailPage(pageId);
  }

  async function loadDetailBreadcrumb(noteId: string) {
    if (!canShowPrivateNavigation.value || !noteId) {
      detailBreadcrumb.value = [];
      return;
    }
    const items = await loadWorkspaceBreadcrumb(noteId);
    if (items.length) note.parentId = items.at(-2)?.id || null;
  }

  watch(detailTreeSearchValue, (value) => {
    window.clearTimeout(detailTreeSearchTimer);
    detailTreeSearchTimer = window.setTimeout(() => void searchTree(value), 180);
  });

  // —— 模板实例化(新建时从 query 读取模板并预填标题/正文) ——
  const saveTemplateVisible = ref(false);
  let appliedTemplateName = ''; // 创建成功日志附带模板名,便于区分模板使用情况
  let templateTitleApplied = false; // 预填了标题时,isReady 后需同步桌面端 header 标题
  // 不静默回落:明确告知加载失败,让用户选择返回还是从空白继续,避免不知情下当成模板在编辑;
  // 接口非 200 与网络异常(catch)两个失败分支共用
  function promptTemplateLoadFailure() {
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.tplLoadFailedChoice'),
      onOk() {
        returnToSource();
      },
    });
  }
  async function applyTemplateFromQuery(query: Record<string, any>, shouldApply: () => boolean = () => true) {
    const isUserTemplate = Boolean(query.templateId);
    try {
      let rawTitle = '';
      let rawContent = '';
      let tplType: NoteType = note.type as NoteType;
      if (query.builtin) {
        const tpl = findBuiltinNoteTemplate(String(query.builtin));
        if (!tpl) return;
        const tplLocale = pickTemplateLocale(String(locale.value));
        rawTitle = tpl.titleTemplate[tplLocale];
        rawContent = tpl.content[tplLocale];
        tplType = tpl.type;
        appliedTemplateName = t(tpl.nameKey);
      } else if (query.templateId) {
        const res = await apiBasePost('/api/note/getNoteTemplateDetail', { id: String(query.templateId) });
        if (res.status !== 200 || !res.data) {
          promptTemplateLoadFailure();
          return;
        }
        // 默认标题优先用 titleTemplate(与模板库显示名 name 语义分离),老数据无该字段时回退 name
        rawTitle = res.data.titleTemplate || res.data.name || '';
        rawContent = res.data.content || '';
        tplType = normalizeNoteType(res.data.type);
        appliedTemplateName = res.data.name || '';
      } else {
        return;
      }
      if (!shouldApply()) return;
      const opts = { locale: String(locale.value) };
      note.type = tplType;
      const renderedContent = renderNoteTemplate(rawContent, opts);
      note.content = tplType === 'markdown' ? normalizeMarkdownBlockquoteEntities(renderedContent) : renderedContent;
      const renderedTitle = renderNoteTemplate(rawTitle, opts).trim();
      if (renderedTitle) {
        note.title = renderedTitle;
        note.lastTitle = cloneDeep(note.title);
        templateTitleApplied = true;
      }
    } catch (e) {
      console.error('应用笔记模板失败:', e);
      // 用户模板走网络请求,异常(断网/超时)同样明确提示,不静默留在空白页;内置模板为本地常量,异常仅记录
      if (isUserTemplate && shouldApply()) promptTemplateLoadFailure();
    }
  }

  // 守卫式创建：同一时刻只允许一次"新建笔记"请求在途。
  // 新建笔记时若并发触发（自动保存 + 粘贴图片同时想建），都复用这一个 Promise，绝不会建出多条。
  // 建成后写回 note.id，之后一律走 updateNote。
  let createPromise: Promise<string> | null = null;
  function promoteSavedDraftInTree() {
    if (!note.id) return;
    const createdId = note.id;
    const createdParentId = note.parentId;
    const parentBreadcrumb =
      createdParentId && detailBreadcrumb.value.at(-1)?.id === createdParentId
        ? detailBreadcrumb.value.map((item) => ({ ...item }))
        : [];
    const canSeedBreadcrumb = !createdParentId || parentBreadcrumb.length > 0;
    nodeType.value = 'edit';
    if (!noteTreeReadEnabled.value) return;
    noteWorkspace.insertCreatedNote({
      id: createdId,
      parentId: createdParentId,
      title: note.title,
      type: note.type,
    });
    if (canSeedBreadcrumb) {
      noteWorkspace.seedBreadcrumb(createdId, [...parentBreadcrumb, { id: createdId, title: note.title }]);
    }
    // 服务端已经确认创建成功，本地目录也已完整插入；清除创建前遗留的瞬时读取错误。
    treeError.value = '';
    noteWorkspace.setNavigation({ activePageId: createdId, browseParentId: null });
    // 新节点的父级、排序和标题均已由创建结果与本地树规则确定，不再强制刷新整棵目录。
    // 只有直达新增地址且父路径尚未加载的异常场景，才读取一次完整面包屑兜底。
    if (!canSeedBreadcrumb) {
      void nextTick().then(async () => {
        if (note.id === createdId) await loadDetailBreadcrumb(createdId);
      });
    }
  }

  function createNote(): Promise<string> {
    if (note.id) return Promise.resolve(note.id);
    if (createPromise) return createPromise;
    const params: any = cloneDeep(note);
    delete params.lastTitle;
    delete params.revision;
    if (!params.title || !params.title.trim()) {
      params.title = DEFAULT_NOTE_TITLE;
    }
    createPromise = (async () => {
      await noteTreeFeaturePromise;
      {
        const parentId = noteTreeWriteEnabled.value ? routeQueryValue(router.currentRoute.value.query.parent) : '';
        if (parentId) params.parentId = parentId;
      }
      let res = await apiBasePost('/api/note/addNote', params);
      const exposureDecision = await confirmNoteShareExposure(res);
      if (exposureDecision === false) {
        throw Object.assign(new Error('NOTE_SHARE_EXPOSURE_CANCELLED'), { code: 'NOTE_SHARE_EXPOSURE_CANCELLED' });
      }
      if (exposureDecision === true) {
        res = await apiBasePost('/api/note/addNote', { ...params, shareExposureAcknowledged: true });
      }
      if (res.status === 200 && res.data?.id) {
        note.id = res.data.id;
        note.revision = Math.max(1, Number(res.data.revision || 1));
        note.createBy = user.id;
        note.parentId = params.parentId || null;
        if (!note.title || !note.title.trim()) {
          note.title = params.title;
        }
        promoteSavedDraftInTree();
        // 详情工作区的路由 key 保持稳定，草稿首次保存只替换地址，不重挂编辑器内容区。
        // replace 保留原 query(type/builtin)，让刷新后的编辑器类型仍能按原始模板恢复。
        promotedDraftRouteId = note.id as string;
        markNoteDraftPromoted(promotedDraftRouteId);
        router.replace({ path: `/noteLibrary/${note.id}`, query: router.currentRoute.value.query }).then();
        recordOperation({
          module: '笔记',
          operation: `新建笔记成功【${note.title}】${appliedTemplateName ? `（模板：${appliedTemplateName}）` : ''}`,
        });
        if (params.parentId) {
          void recordNoteTreeProductEvent('note_tree_child_created', {
            surface: bookmark.isMobile ? 'mobile' : 'desktop',
            subtreeSize: 1,
            result: 'success',
          });
        }
        invalidateNoteReadCaches(note.id);
        return note.id as string;
      }
      throw new Error(res.msg || '创建笔记失败');
    })().finally(() => {
      createPromise = null;
    });
    return createPromise;
  }
  // 供编辑器在“新建笔记还没 id 就粘贴图片”时调用：先确保笔记已创建，返回其 id，让图片带真实 noteId 上传
  async function ensureNoteId(): Promise<string> {
    if (note.id) return note.id;
    return await createNote();
  }
  // 兜底：编辑器若从后端拿回 noteId（历史自动建笔记逻辑），本地还没 id 时采纳它，避免各建各的
  async function onEditorSetNoteId(id: string) {
    if (id && !note.id) {
      note.id = id;
      note.revision = 1;
      note.createBy = user.id;
      promoteSavedDraftInTree();
      promotedDraftRouteId = note.id;
      markNoteDraftPromoted(promotedDraftRouteId);
      router.replace({ path: `/noteLibrary/${note.id}`, query: router.currentRoute.value.query }).then();
    }
  }

  function clearScheduledSave() {
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
  }

  function requestSaveVersion() {
    requestedSaveVersion += 1;
    latestRequestedTitle = note.title;
    saveStatus.value = navigator.onLine ? 'pending' : 'offline';
    return requestedSaveVersion;
  }

  async function saveNote(isMsg?: boolean) {
    if (!note.title || !note.title.trim()) {
      message.warning(t('noteDetail.titleRequired'));
      return false;
    }
    if (!isMsg && !note.id && !hasNewNoteDraft()) {
      saveStatus.value = 'saved';
      return false;
    }
    if (!navigator.onLine) {
      saveStatus.value = 'offline';
      return false;
    }
    isStartEdit.value = true;
    saveStatus.value = 'saving';
    const titleAtSave = note.title;
    let ok = false;

    try {
      if (note.id) {
        let res;
        if (isDrawingNote.value) {
          res = await apiBasePost('/api/note/updateDrawingNote', {
            id: note.id,
            title: note.title,
            scene: note.content,
            revision: note.revision,
          });
        } else {
          const params: any = cloneDeep(note);
          delete params.lastTitle;
          delete params.createBy;
          delete params.updateTime;
          res = await apiBasePost('/api/note/updateNote', params);
        }
        if (res.status === 409 && res.data?.code === 'NOTE_VERSION_CONFLICT') {
          const cloud = normalizeConflictVersion(res.data?.details?.current, note.id);
          if (cloud) openVersionConflict(cloud, currentNoteVersion());
          return false;
        }
        ok = res.status === 200;
        if (ok) {
          const nextRevision = Math.max(1, Number(res.data?.revision || note.revision || 1));
          note.revision = nextRevision;
        }
        if (ok && isMsg) {
          recordOperation({ module: '笔记', operation: `保存笔记成功【${titleAtSave}】` });
        }
      } else {
        // 新建统一走守卫式创建（与粘贴图片共用同一个在途 Promise，绝不并发建多条）
        await createNote();
        ok = !!note.id;
      }
      if (ok) {
        // 只在服务端确认成功后才推进已保存标题，避免失败时把草稿误认为已落库。
        note.lastTitle = cloneDeep(titleAtSave);
        if (note.id) noteWorkspace.updateNoteMetadata(note.id, { title: titleAtSave, type: note.type });
        if (isMsg) {
          message.success(t('common.saveSuccess'));
        }
        setUpdateTime();
        saveStatus.value = 'saved';
        if (isDrawingNote.value && note.id) invalidateDrawingPreview(note.id);
        invalidateNoteReadCaches(note.id);
      } else {
        saveStatus.value = 'error';
      }
    } catch (error: any) {
      if (error?.code === 'NOTE_SHARE_EXPOSURE_CANCELLED') {
        saveStatus.value = 'pending';
        ok = false;
        return ok;
      }
      console.error('保存笔记失败:', error);
      ok = false;
      saveStatus.value = navigator.onLine ? 'error' : 'offline';
    } finally {
      isStartEdit.value = false;
    }
    return ok;
  }

  function queueSave(version: number, isMsg?: boolean) {
    const task = saveQueue
      .catch(() => false)
      .then(async () => {
        if (version <= persistedSaveVersion) return true;
        const snapshotVersion = requestedSaveVersion;
        // 空白新建笔记没有需要落库的数据，允许直接离开，不因一次被取消的编辑而拦截用户。
        if (!isMsg && !note.id && !hasNewNoteDraft()) {
          persistedSaveVersion = Math.max(persistedSaveVersion, snapshotVersion);
          return true;
        }
        const saved = await saveNote(isMsg);
        if (saved) {
          persistedSaveVersion = Math.max(persistedSaveVersion, snapshotVersion);
        }
        return saved;
      });
    saveQueue = task;
    return task;
  }

  function saveImmediately(isMsg?: boolean) {
    if (!guardWrite(undefined, 'save-note')) {
      return Promise.resolve(false);
    }
    if (conflictCloudVersion.value && conflictLocalVersion.value) {
      conflictVisible.value = true;
      saveStatus.value = 'error';
      return Promise.resolve(false);
    }
    clearScheduledSave();
    return queueSave(requestSaveVersion(), isMsg);
  }

  async function flushPendingSave() {
    clearScheduledSave();
    let targetVersion = requestedSaveVersion;
    while (targetVersion > persistedSaveVersion) {
      const saved = await queueSave(targetVersion);
      if (!saved) return false;
      targetVersion = requestedSaveVersion;
    }
    return true;
  }

  async function saveAndCompleteInbox() {
    if (!guardWrite(undefined, 'save-note') || !note.id) return;
    const shouldReturnToInbox = isOrganizingFromInbox.value;
    const saved = await saveImmediately(false);
    if (!saved) return;
    const completed = await completeInboxResource('note', note.id);
    if (!completed) {
      message.warning(t('inbox.completeFailed'));
      return;
    }
    note.isPending = false;
    invalidateNoteDetailPrefetch(user, note.id);
    noteLibraryCache.updateNotePendingState(noteCacheScope.value, note.id, false);
    recordOperation({ module: '笔记', operation: `保存并完成整理笔记【${note.title}】` });
    message.success(t('inbox.saveAndCompleteSuccess'));
    if (shouldReturnToInbox) router.push('/inbox');
  }

  const togglingInbox = ref(false);
  async function toggleNoteInbox() {
    if (!note.id || readonly.value || togglingInbox.value) return;
    const wasPending = Boolean(note.isPending);
    const resource = [{ resourceType: 'note' as const, resourceId: note.id }];
    togglingInbox.value = true;
    try {
      const ok = wasPending
        ? await removeResourcesFromInbox(resource, '笔记')
        : await addResourcesToInbox(resource, '笔记');
      if (!ok) return;
      const nextPending = !wasPending;
      note.isPending = nextPending;
      invalidateNoteDetailPrefetch(user, note.id);
      noteLibraryCache.updateNotePendingState(noteCacheScope.value, note.id, nextPending);
    } finally {
      togglingInbox.value = false;
    }
  }

  function clickSaveNote(flag?: boolean) {
    void saveImmediately(flag);
  }

  const savingManualVersion = ref(false);
  async function saveManualVersion() {
    if (savingManualVersion.value || readonly.value) return;
    savingManualVersion.value = true;
    try {
      const saved = await saveImmediately(false);
      if (!saved || !note.id) return;
      const response = await apiBasePost('/api/note/createNoteVersion', {
        id: note.id,
        revision: note.revision,
      });
      if (response.status === 409 && response.data?.code === 'NOTE_VERSION_CONFLICT') {
        const cloud = normalizeConflictVersion(response.data?.details?.current, note.id);
        if (cloud) openVersionConflict(cloud, currentNoteVersion());
        return;
      }
      if (response.status !== 200) throw new Error(response.msg || t('noteDetail.saveVersionFailed'));
      message.success(t('noteDetail.saveVersionSuccess'));
    } catch (error: any) {
      message.error(error?.message || t('noteDetail.saveVersionFailed'));
    } finally {
      savingManualVersion.value = false;
    }
  }

  async function retryPendingSave() {
    if (!navigator.onLine) {
      saveStatus.value = 'offline';
      return;
    }
    if (requestedSaveVersion <= persistedSaveVersion) requestSaveVersion();
    const saved = await flushPendingSave();
    if (!saved && navigator.onLine) message.error(t('noteDetail.saveFailed'));
  }

  function handleNetworkOffline() {
    if (requestedSaveVersion > persistedSaveVersion || isStartEdit.value) saveStatus.value = 'offline';
  }

  function handleNetworkOnline() {
    if (requestedSaveVersion > persistedSaveVersion) void retryPendingSave();
  }

  function saveFunc(isMsg?: boolean) {
    if (!guardWrite(undefined, 'save-note')) {
      return;
    }
    if (conflictCloudVersion.value && conflictLocalVersion.value) {
      requestSaveVersion();
      saveStatus.value = 'error';
      return;
    }
    clearScheduledSave();
    const version = requestSaveVersion();
    timer.value = setTimeout(
      () => {
        timer.value = null;
        void queueSave(version, isMsg);
      },
      isDrawingNote.value ? DRAWING_SAVE_DEBOUNCE_DELAY : TEXT_SAVE_DEBOUNCE_DELAY,
    );
  }

  async function delNote() {
    if (!guardWrite(undefined, 'delete-note')) {
      return;
    }
    if (!noteTreeSubtreeTrashEnabled.value) {
      Alert.alert({
        title: t('note.deleteOneTitle'),
        content: t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
        okText: t('note.moveToTrash'),
        async onOk() {
          const res = await apiBasePost('/api/note/delNote', { ids: [String(note.id)] });
          if (res.status === 409 && res.data?.code === 'NOTE_HAS_CHILDREN') {
            message.warning(res.msg || t('note.deleteScopeChanged'));
            return;
          }
          if (res.status !== 200) return;
          invalidateNoteReadCaches(note.id);
          message.success(t('common.deleteSuccess'));
          recordOperation({ module: '笔记', operation: `删除笔记成功【${note.title}】` });
          if (noteTreeReadEnabled.value) {
            void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
              surface: bookmark.isMobile ? 'mobile' : 'desktop',
              depth: detailBreadcrumb.value.length,
              subtreeSize: 1,
              result: 'success',
            });
          }
          skipSaveOnLeave = true;
          clearScheduledSave();
          noteWorkspace.setNavigation({ activePageId: null });
          await refreshTree();
          returnToSource();
        },
      });
      return;
    }
    let preview;
    try {
      preview = await fetchNoteDeletePreview(note.id);
    } catch (error) {
      console.warn('[note-detail] delete preview failed', error);
      message.error(t('note.deletePreviewFailed'));
      return;
    }
    // 与笔记库卡片删除保持一致:统一"移入回收站、可恢复"口径(此前笔记详情用的是老的"确认删除/确定",没提回收站)
    Alert.alert({
      title: t('note.deleteOneTitle'),
      content: preview.descendantCount
        ? t('note.deleteSubtreeConfirm', {
            title: note.title || t('note.untitled'),
            descendants: preview.descendantCount,
          })
        : t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
      okText:
        preview.totalCount > 1 ? t('note.moveItemsToTrash', { count: preview.totalCount }) : t('note.moveToTrash'),
      async onOk() {
        const res = await apiBasePost('/api/note/deleteNoteSubtree', {
          id: preview.id,
          expectedDescendantCount: preview.descendantCount,
        });
        if (res.status === 409 && res.data?.code === 'NOTE_TREE_DELETE_CONFLICT') {
          message.warning(t('note.deleteScopeChanged'));
          void delNote();
          return;
        }
        if (res.status !== 200) return;
        invalidateNoteReadCaches(note.id);
        message.success(t('common.deleteSuccess'));
        const deletedCount = Number(res.data?.deletedCount || preview.totalCount);
        recordOperation({ module: '笔记', operation: `删除笔记成功【${note.title}，共${deletedCount}篇】` });
        void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
          surface: bookmark.isMobile ? 'mobile' : 'desktop',
          depth: detailBreadcrumb.value.length,
          subtreeSize: deletedCount,
          result: 'success',
        });
        // 删除已在服务端成功完成，离开时不能再把排队中的旧编辑内容写回已删除笔记。
        skipSaveOnLeave = true;
        clearScheduledSave();
        noteWorkspace.setNavigation({ activePageId: null });
        await refreshTree();
        returnToSource();
      },
    });
  }

  const handleKeyDown = (event) => {
    // Windows/Linux 使用 Ctrl，macOS 使用 Command；两端统一拦截浏览器“保存网页”。
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault(); // 阻止默认的保存行为
      void saveManualVersion();
    }
  };

  function captureTitleBeforeLeave() {
    if (!bookmark.isMobile) {
      syncDesktopTitleToNote();
    }
    if (!note.title?.trim()) {
      note.title = note.lastTitle;
      void syncHeaderTitle();
    }
  }

  function captureDetailTreeScroll() {
    if (bookmark.isMobile) return;
    const treeScroll = document.querySelector<HTMLElement>('.note-detail-sidebar-panel .note-tree-scroll');
    if (treeScroll) noteWorkspace.setDetailTreeScrollTop(treeScroll.scrollTop);
  }

  function seedCurrentNoteDetail() {
    if (!note.id || nodeType.value === 'share') return;
    seedNoteDetail(user, note.id, {
      id: note.id,
      title: note.title,
      content: note.content,
      createBy: note.createBy,
      type: note.type,
      revision: note.revision,
      parentId: note.parentId,
      isPending: Boolean(note.isPending),
      updateTime: updateTime.value,
      breadcrumb: detailBreadcrumb.value.map((item) => ({ ...item })),
      noteTreeFeatures: { ...noteTreeFeatures.value },
    });
  }

  async function persistBeforeLeave() {
    captureDetailTreeScroll();
    captureTitleBeforeLeave();
    // 返回发生在失焦事件之前时，主动把当前标题纳入保存队列；不能依赖事件时序。
    if (note.title?.trim() && note.title !== note.lastTitle && note.title !== latestRequestedTitle) {
      const titleSaved = await saveImmediately();
      if (!titleSaved) {
        message.error(t('noteDetail.saveFailed'));
        return false;
      }
    }
    const saved = await flushPendingSave();
    if (!saved) {
      message.error(t('noteDetail.saveFailed'));
    } else {
      seedCurrentNoteDetail();
    }
    return saved;
  }

  async function back() {
    if (isLeaving.value) return;
    isLeaving.value = true;
    const saved = await persistBeforeLeave();
    if (!saved) {
      isLeaving.value = false;
      return;
    }
    returnToSource();
  }

  onBeforeRouteLeave(async () => {
    if (skipSaveOnLeave) return true;
    return await persistBeforeLeave();
  });

  onBeforeRouteUpdate(async (to) => {
    if (skipSaveOnLeave) return true;
    // 新建笔记首次保存时会把 /add 替换为真实 id；此时同一草稿正在完成保存，不能反向等待自己。
    if (String(to.params.id || '') === note.id) return true;
    return await persistBeforeLeave();
  });
  const isReady = ref(false);
  const noteLoadFailed = ref(false);
  const editorRuntimeReady = ref(false);

  function resetPerNoteRuntime() {
    clearScheduledSave();
    readonlyToolbarObserver?.disconnect();
    readonlyToolbarObserver = null;
    requestedSaveVersion = 0;
    persistedSaveVersion = 0;
    latestRequestedTitle = note.title;
    saveQueue = Promise.resolve(true);
    saveStatus.value = 'saved';
    isStartEdit.value = false;
    isLeaving.value = false;
    skipSaveOnLeave = false;
    hasSwitchBackup.value = false;
    contentAutosaveReady.value = false;
    editorRuntimeReady.value = false;
    conflictVisible.value = false;
    conflictCloudVersion.value = null;
    conflictLocalVersion.value = null;
    conflictBusyAction.value = '';
    conflictEditorUsesLocal = false;
    currentEditorResourceRefs = [];
    resolvedResourceRefs.value = [];
    lastResourceRefSignature = '';
    resourceResolveVersion += 1;
    nStore.headings = [];
    versionHistoryVisible.value = false;
    saveTemplateVisible.value = false;
    attachPagesVisible.value = false;
    moveSelfVisible.value = false;
    renamePageVisible.value = false;
    activeAttachTarget.value = null;
    activeMoveTarget.value = null;
    renameTargetNote.value = null;
    subpageCount.value = 0;
    catalogDrawerOpen.value = false;
    mobileNavigationOpen.value = false;
  }

  let noteLoadVersion = 0;
  let readonlyToolbarObserver: MutationObserver | null = null;

  function syncReadonlyEditorChrome() {
    readonlyToolbarObserver?.disconnect();
    readonlyToolbarObserver = null;
    if (user.id === note.createBy || isDrawingNote.value) return;
    readonlyToolbarObserver = new MutationObserver(() => {
      const toolbar = document.querySelector<HTMLElement>('.tox-editor-header');
      if (!toolbar) return;
      toolbar.style.display = 'none';
      readonlyToolbarObserver?.disconnect();
      readonlyToolbarObserver = null;
    });
    readonlyToolbarObserver.observe(document.body, { childList: true, subtree: true });
  }

  function completeMarkdownContentSwitch() {
    if (note.type !== 'markdown') return;
    // CodeMirror 是异步运行时，必须等它真正发出 ready；nextTick 只代表 Vue 壳已挂载。
    void preloadNoteEditorRuntime('markdown').catch(() => {
      // 异步组件挂载时会重试，并由统一的 chunk 错误链路提供反馈。
    });
  }

  async function loadRouteNote(routeId: string, query: Record<string, any>) {
    if (!routeId) return;
    if (promotedDraftRouteId && routeId === promotedDraftRouteId && note.id === routeId) {
      promotedDraftRouteId = '';
      void loadDetailBreadcrumb(routeId);
      return;
    }

    const requestVersion = ++noteLoadVersion;
    const isInitialLoad = !isReady.value;
    noteLoadFailed.value = false;
    if (!isInitialLoad) isNoteSwitching.value = true;
    resetPerNoteRuntime();

    if (routeId === 'add') {
      appliedTemplateName = '';
      templateTitleApplied = false;
      const nextType = resolveInitialNoteType(query);
      Object.assign(note, {
        id: '',
        title: DEFAULT_NOTE_TITLE,
        lastTitle: DEFAULT_NOTE_TITLE,
        content: nextType === 'drawing' ? DEFAULT_DRAWING_CONTENT : nextType === 'markdown' ? '' : DEFAULT_NOTE_CONTENT,
        createBy: '',
        type: nextType,
        revision: 1,
        parentId: routeQueryValue(query.parent) || null,
        isPending: false,
      });
      updateTime.value = '';
      nodeType.value = 'add';
      await applyTemplateFromQuery(query, () => requestVersion === noteLoadVersion);
      if (requestVersion !== noteLoadVersion) return;
      latestRequestedTitle = note.title;
      noteContentKey.value = `note-content:add:${requestVersion}`;
      isReady.value = true;
      await nextTick();
      if (templateTitleApplied) await syncHeaderTitle();
      completeMarkdownContentSwitch();
      return;
    }

    let contentApplied = false;
    try {
      const response = await consumeNoteDetail(user, routeId);
      if (requestVersion !== noteLoadVersion) return;
      if (response.status === 200 && response.data) {
        const {
          breadcrumb: bundledBreadcrumb,
          noteTreeFeatures: bundledFeaturePayload,
          ...detailRecord
        } = response.data;
        if (bundledFeaturePayload && typeof bundledFeaturePayload === 'object') {
          const bundledFeatures = normalizeNoteTreeFeatures(bundledFeaturePayload as Record<string, unknown>);
          noteTreeFeatures.value = bundledFeatures;
          noteLibraryCache.writeFeatures(noteCacheScope.value, bundledFeatures);
        } else if (
          !initialFeatureSnapshot ||
          Date.now() - initialFeatureSnapshot.updatedAt > NOTE_LIBRARY_FEATURES_FRESH_MS
        ) {
          // 兼容前后端短暂错版本：旧服务端没有聚合字段时仍能恢复原来的独立能力读取。
          void loadNoteTreeFeatureSnapshot();
        }
        const rawType = detailRecord.type;
        Object.assign(note, {
          ...detailRecord,
          id: String(detailRecord.id || routeId),
          type: normalizeNoteType(rawType),
          content: normalizeLoadedContent(detailRecord.content || '', rawType),
          revision: Math.max(1, Number(detailRecord.revision || 1)),
          parentId: detailRecord.parentId || null,
          isPending: Boolean(detailRecord.isPending),
        });
        if (Array.isArray(bundledBreadcrumb)) {
          const seededBreadcrumb = noteWorkspace.seedBreadcrumb(note.id, bundledBreadcrumb);
          if (seededBreadcrumb.length) note.parentId = seededBreadcrumb.at(-2)?.id || null;
        }
        note.lastTitle = cloneDeep(note.title);
        latestRequestedTitle = note.title;
        noteWorkspace.updateNoteMetadata(String(note.id), { title: note.title, type: note.type });
        updateTime.value = detailRecord.updateTime ?? detailRecord.createTime;
        nodeType.value = user.id === note.createBy ? 'edit' : 'share';
        noteContentKey.value = `note-content:${note.id}`;
        contentApplied = true;
        isReady.value = true;
        // 正文拿到类型后立刻预热对应引擎；手绘组件由独立异步分支自行加载，
        // 不进入这里的 HTML / Markdown 大运行时预热。
        if (!isDrawingNote.value) {
          void preloadNoteEditorRuntime(note.type).catch(() => {
            // 预热失败时异步组件仍会按正常挂载链路重试并由路由错误处理兜底。
          });
        }
        await nextTick();
        await syncHeaderTitle();
        completeMarkdownContentSwitch();
        syncReadonlyEditorChrome();
      } else {
        noteLoadFailed.value = true;
        isReady.value = false;
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
      if (requestVersion === noteLoadVersion) {
        noteLoadFailed.value = true;
        isReady.value = false;
      }
    } finally {
      if (requestVersion === noteLoadVersion) {
        if (!contentApplied) isNoteSwitching.value = false;
      }
    }
  }

  function retryLoadRouteNote() {
    const route = router.currentRoute.value;
    const rawId = route.params.id;
    const id = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
    if (!id) return;
    void loadRouteNote(id, { ...route.query });
  }

  const routeNoteLoadKey = computed(() => {
    const route = router.currentRoute.value;
    const rawId = route.params.id;
    const id = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
    if (id !== 'add') return id;
    return [id, route.query.parent, route.query.type, route.query.builtin, route.query.templateId]
      .map((item) => routeQueryValue(item))
      .join('|');
  });
  const detailInstanceRouteId = routeNoteLoadKey.value.split('|', 1)[0];

  watch(
    routeNoteLoadKey,
    () => {
      const route = router.currentRoute.value;
      const rawId = route.params.id;
      const id = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
      // 不同笔记 ID 会由 RouterView 的 key 创建新实例。旧实例可能在路由提交与卸载之间
      // 收到一次 watch 回调，必须忽略，避免重复请求或让旧编辑器参与新笔记的状态更新。
      // 唯一例外是 add 首次保存为真实 ID：它有意沿用当前编辑器实例。
      const isPromotedCurrentDraft =
        detailInstanceRouteId === 'add' && id === promotedDraftRouteId && note.id === promotedDraftRouteId;
      if (id !== detailInstanceRouteId && !isPromotedCurrentDraft) return;
      void loadRouteNote(id, { ...route.query });
    },
    { immediate: true },
  );

  watch(
    () => note.content,
    () => {
      if (contentAutosaveReady.value) saveFunc();
    },
    { flush: 'sync' },
  );

  watch(
    () => [note.title, note.content, note.type, note.revision] as const,
    () => {
      if (conflictEditorUsesLocal && conflictLocalVersion.value) {
        conflictLocalVersion.value = currentNoteVersion();
      }
    },
    { flush: 'sync' },
  );

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleResourceRefVisibilityChange);
    window.addEventListener('focus', refreshEditorResourceRefs);
    window.addEventListener('pageshow', refreshEditorResourceRefs);
    window.addEventListener('offline', handleNetworkOffline);
    window.addEventListener('online', handleNetworkOnline);
  });
  onUnmounted(() => {
    markNoteDraftPromoted(null);
    noteLoadVersion += 1;
    window.clearTimeout(detailTreeSearchTimer);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('visibilitychange', handleResourceRefVisibilityChange);
    window.removeEventListener('focus', refreshEditorResourceRefs);
    window.removeEventListener('pageshow', refreshEditorResourceRefs);
    window.removeEventListener('offline', handleNetworkOffline);
    window.removeEventListener('online', handleNetworkOnline);
    readonlyToolbarObserver?.disconnect();
    clearScheduledSave();
    nStore.headings = [];
  });
</script>

<style lang="less">
  .note-container {
    --note-detail-header-height: 58px;

    width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: fixed !important;
    top: 0 !important;
    display: flex;
    flex-direction: column;
  }
  .note-container--mobile {
    --note-detail-header-height: 56px;
  }
  .note-body-title {
    height: 56px;
    flex-shrink: 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--note-editor-header-bg);
    transition: background-color 0.18s ease;

    &:focus-within {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 4%, var(--note-editor-header-bg));
    }

    .input-container {
      height: 100%;
    }

    .b-input {
      height: 100%;
      padding: 0 16px !important;
      border: 0 !important;
      border-radius: 0;
      outline: none;
      box-shadow: none !important;
      background: transparent !important;
      color: var(--bl-input-color);
      font-size: 21px;
      font-weight: 650;

      &:hover,
      &:focus,
      &:focus-visible {
        background: transparent !important;
      }
    }
  }
  .note-detail-breadcrumb-row {
    min-width: 0;
    height: 30px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--muted-text-color, var(--desc-color));
    background: var(--surface-page-bg, var(--background-color));
    font-size: 11px;
  }

  .note-detail-breadcrumb {
    min-width: 0;
    height: 100%;
    padding: 0 12px;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 3px;
    overflow: hidden;
  }

  .note-detail-complete-inbox.b_btn {
    flex: 0 0 auto;
    height: 24px;
    margin-right: 8px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 11px;
  }

  .note-detail-crumb {
    min-width: 0;
    max-width: 180px;
    height: 22px;
    padding: 0 3px;
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    color: var(--desc-color);
    border: 0 !important;
    border-radius: 4px;
    background: transparent !important;
    font-size: 11px;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover,
    &:focus-visible {
      color: var(--resource-note-color, #00a884);
      background: transparent !important;
    }

    &.is-current {
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }
  }

  .note-detail-crumb-separator {
    flex: 0 0 auto;
    color: var(--muted-text-color, var(--desc-color));
    opacity: 0.65;
  }

  .note-detail-crumb-ellipsis {
    flex: 0 0 auto;
    padding: 0 3px;
    color: var(--muted-text-color, var(--desc-color));
    font-weight: 650;
  }
  .note-title-mobile {
    width: 100%;

    .b-input {
      border-radius: 0;
      padding: 0 15px !important;
      background: transparent !important;
      color: var(--bl-input-color);
      font-size: 25px;
      font-weight: 600;
      text-overflow: ellipsis;

      &:hover,
      &:focus,
      &:focus-visible {
        background: transparent !important;
      }
    }
  }
  .note-body.note-workspace-shell {
    display: grid;
    padding: 0;
    box-sizing: border-box;
    height: calc(100% - var(--note-detail-header-height));
    position: fixed;
    top: var(--note-detail-header-height);
    width: 100%;
    min-width: 0;
    background: var(--workspace-panel-bg-color, var(--surface-page-bg));
  }
  .note-body > .note-workspace-shell__main {
    min-width: 0;
    min-height: 0;
    padding: 16px;
    display: flex;
    box-sizing: border-box;
  }

  .note-detail-sidebar-panel {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 12px;
    box-sizing: border-box;
  }

  /*
   * 目录「从无到有 / 从有到无」时平滑让出空间（新打一个标题就会触发）。
   *
   * 动 flex-grow 而不是 width：.catalog-panel 的 flex-basis 是 0%，宽度完全由 grow
   * 决定，动它编辑区会跟着连续变宽；动 width 反而要和 flex 打架。
   *
   * margin-right 抵掉 .note-body 的 20px gap——折叠到 0 宽后那道空隙还在，
   * 编辑区就还差 20px 没补上，等于问题只解决了一半。
   *
   * 挂在 .is-animatable 上而不是 .catalog-panel：进入笔记时的「空目录 → 有目录」
   * 是首屏定型，不该表演一次展开。这个类由 NoteDetail 在首屏目录落定后才加。
   */
  .catalog-panel.is-animatable {
    transition:
      flex-grow 0.26s ease,
      margin-right 0.26s ease,
      opacity 0.18s ease;
  }

  .catalog-panel.is-collapsed {
    flex-grow: 0;
    // 抵掉 .note-body 的 20px gap，否则折叠到 0 宽后编辑区还差 20px 没补上
    margin-right: -20px;
    opacity: 0;
    // 折叠过程中不要冒出滚动条(.toc-container 本身是 overflow: auto)
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    /* 选择器要和上面等特异性，否则 .catalog-panel.is-animatable 会把这条盖掉 */
    .catalog-panel.is-animatable {
      transition: none;
    }
  }

  .note-detail-content {
    position: relative;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .editor-panel {
    --note-editor-header-bg: var(--surface-panel-bg);

    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));

    &.is-switching {
      pointer-events: none;
    }
  }

  .ai-panel {
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .note-detail-ai-slot {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  /* AI 侧栏加载时保持同一块完整底色，避免异步组件到位前出现白闪。 */
  .ai-panel-skeleton {
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: var(--workspace-panel-bg-color);
  }
  .editor-component {
    flex: 1 1 auto;
    min-height: 0;
  }
  .back-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    height: 30px;
    width: 30px;
    cursor: pointer;
    border: 1px solid var(--surface-border-color);
    transition: border-color 0.1s linear;
    &:hover {
      border-color: var(--primary-color);
    }
  }
  .note-body-header {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tag-container {
    padding-left: 15px;
    .note-tag {
      height: 20px;
      box-sizing: border-box;
      cursor: pointer;
      line-height: 16px;
      width: max-content;
      color: var(--desc-color);
      font-size: 12px;
      font-weight: 550;
      padding: 2px 6px;
      background-color: var(--common-tag-bg-color);
      border-radius: 4px;
    }
  }

  @media (max-width: 1024px) {
    .note-body > .note-workspace-shell__main {
      padding: 10px;
    }
    .note-body-header {
      width: 100%;
    }
    #editor-toolbar .tox-toolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto;
    }
  }

  @media (max-width: 767px) {
    .note-body > .note-workspace-shell__main {
      padding: 0;
    }

    .editor-panel {
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }

    .note-body-header {
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .note-detail-breadcrumb-row {
      height: 35px;
    }

    .note-detail-breadcrumb {
      cursor: pointer;
    }

    .note-detail-crumb {
      height: 30px;
      font-size: 12px;
    }

    .note-body-title {
      height: 50px;
      width: 100%;
      box-sizing: border-box;

      .b-input {
        font-size: 20px;
      }
    }
  }
</style>
