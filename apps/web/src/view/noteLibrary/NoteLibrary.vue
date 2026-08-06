<template>
  <ResourcePageShell
    :title="$t('note.title')"
    :subtitle="$t('note.subtitle')"
    accent="note"
    layout="workspace"
    compact-mobile-heading
    :title-actionable="!bookmark.isMobile"
    @title-click="resetNoteLibrary"
  >
    <template #meta>
      <span class="note-count-chip">{{ $t('note.visibleCount', { total: noteTotal }) }}</span>
    </template>

    <template #actions>
      <BTooltip v-if="isMediumNoteLayout" :title="$t(noteSidebarExpanded ? 'note.hideSidebar' : 'note.showSidebar')">
        <BButton
          class="note-action-button note-sidebar-toggle"
          :class="{ 'is-active': noteSidebarExpanded }"
          :aria-label="$t(noteSidebarExpanded ? 'note.hideSidebar' : 'note.showSidebar')"
          :aria-pressed="noteSidebarExpanded"
          @click="toggleNoteSidebar"
        >
          <SvgIcon :src="icon.cloudSpace.preview.sidebar" size="17" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <template v-if="batchMode">
        <span class="note-batch-summary">{{ $t('note.selectedCount', { count: selectedVisibleCount }) }}</span>
        <template v-if="bookmark.isMobile">
          <BButton
            class="note-action-button note-batch-icon-button"
            :aria-label="allVisibleChecked ? $t('note.unselectAllCurrent') : $t('note.selectAllCurrent')"
            :title="allVisibleChecked ? $t('note.unselectAllCurrent') : $t('note.selectAllCurrent')"
            @click="toggleSelectAllVisible"
          >
            <SvgIcon :src="allVisibleChecked ? icon.common.close : icon.filterPanel.check" size="17" />
          </BButton>
          <BButton
            class="note-action-button note-batch-icon-button"
            :disabled="!selectedVisibleCount"
            :aria-label="$t('common.more')"
            :title="$t('common.more')"
            @click="mobileBatchActionsOpen = true"
          >
            <SvgIcon :src="icon.common.more" size="17" />
          </BButton>
          <BButton
            class="note-action-button note-batch-icon-button"
            :aria-label="$t('note.exitBatch')"
            :title="$t('note.exitBatch')"
            @click="exitBatch"
          >
            <SvgIcon :src="icon.common.close" size="17" />
          </BButton>
        </template>
        <template v-else>
          <BButton class="note-action-button" @click="toggleSelectAllVisible">
            {{ allVisibleChecked ? $t('note.unselectAllCurrent') : $t('note.selectAllCurrent') }}
          </BButton>
          <BButton
            class="note-action-button"
            :disabled="!selectedVisibleCount"
            @click="openSelectedNotesAi('organize')"
          >
            <SvgIcon :src="icon.ai.materials" size="16" />
            {{ $t('ai.entry.addSelectedToAssistant') }}
          </BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="openSelectedAiOrganize">
            <SvgIcon :src="icon.ai.organize" size="16" />
            {{ $t('bookmarkMg.aiOrganizeBtn') }}
          </BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="openBatchTags('add')">{{
            $t('note.batchAddTags')
          }}</BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="openBatchTags('remove')">{{
            $t('note.batchRemoveTags')
          }}</BButton>
          <BButton
            v-if="noteTreeWriteEnabled"
            class="note-action-button"
            :disabled="!selectedVisibleCount"
            @click="openBatchMove"
          >
            <SvgIcon :src="icon.noteTree.move" size="16" />
            {{ $t('note.movePages') }}
          </BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="exportSelectedNotes">{{
            $t('note.batchExport')
          }}</BButton>
          <BButton type="danger" class="note-action-button" :disabled="!selectedVisibleCount" @click="batchDeleteNote">
            <SvgIcon :src="icon.noteDetail.delete" size="16" />
            {{ $t('note.deleteSelected') }}
          </BButton>
          <BButton class="note-action-button" @click="exitBatch">{{ $t('note.exitBatch') }}</BButton>
        </template>
      </template>
      <template v-else>
        <!-- 移动端不放第二个文本搜索框：找笔记统一走顶栏全局搜索，这里只保留标签筛选 -->
        <div v-if="bookmark.isMobile" class="note-mobile-actions">
          <BButton
            v-if="noteTreeMobileEnabled"
            class="note-mobile-directory"
            @click="openMobileDirectory('directory')"
          >
            <SvgIcon :src="currentParentId ? icon.resource.note : icon.noteTree.root" size="16" aria-hidden="true" />
            <span>{{ currentDirectoryTitle || $t('note.knowledgeRoot') }}</span>
            <SvgIcon :src="icon.noteTree.chevron" size="12" aria-hidden="true" />
          </BButton>
          <BButton class="note-mobile-tag" @click="openMobileDirectory('tags')">
            <SvgIcon :src="icon.manage_categoryBtn_tag" size="15" aria-hidden="true" />
            {{ $t('note.tagsTab') }}
          </BButton>
          <ViewModeToggle compact />
        </div>
        <template v-else>
          <ViewModeToggle />
          <div class="note-search" v-click-log="OPERATION_LOG_MAP.noteLibrary.searchNote">
            <BInput v-model:value="searchValue" :placeholder="$t('note.searchNote')" clearable>
              <template #prefix>
                <SvgIcon :src="icon.navigation.search" size="16" />
              </template>
            </BInput>
          </div>
          <BButton
            class="note-action-button note-ai-button"
            @click="openGlobalAiOrganize"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.aiOrganize"
          >
            <SvgIcon :src="icon.ai.organize" size="17" />
            {{ $t('bookmarkMg.aiOrganizeBtn') }}
          </BButton>
          <BButton
            v-if="!currentParentId || noteTreeWriteEnabled"
            type="primary"
            class="note-action-button note-create-button"
            @click="showNewNotePicker"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
          >
            <SvgIcon :src="icon.common.add" size="16" />
            {{ currentParentId ? $t('note.newChildPage') : $t('note.newNote') }}
          </BButton>
        </template>
      </template>
    </template>

    <div
      ref="noteWorkspaceRef"
      class="note-workspace"
      :class="{ 'is-split': showNoteSidebar }"
      @scroll.capture.passive="onNoteScroll"
      @touchstart.passive="pullRefresh.onTouchStart"
      @touchmove="pullRefresh.onTouchMove"
      @touchend.passive="pullRefresh.onTouchEnd"
      @touchcancel.passive="pullRefresh.onTouchCancel"
    >
      <aside v-if="showNoteSidebar" class="note-sidebar-panel">
        <NoteLibrarySidebar
          v-model:mode="noteSidebarMode"
          :current-parent-id="currentParentId"
          :children-by-parent="sidebarTreeChildrenByParent"
          :expanded-ids="sidebarTreeExpandedIds"
          :loading-keys="sidebarTreeLoadingKeys"
          :tree-error="sidebarTreeError"
          :all-tags="visibleNoteTags"
          :total-count="allNoteCount"
          :untagged-count="untaggedNoteCount"
          :tag-loading="tagLoading"
          :search-value="searchValue"
          :directory-enabled="noteTreeReadEnabled"
          :write-enabled="noteTreeWriteEnabled"
          :search-active="treeSearchActive"
          :search-loading="treeSearchLoading"
          :search-match-count="treeSearchMatchCount"
          @toggle="toggleTreeNode"
          @select="selectDirectory"
          @open="openDirectoryPage"
          @create="showNewChildPicker"
          @move="openMoveNote"
          @rename="openRenameNote"
          @copy-link="copyNoteLink"
          @delete="deleteSingleNote"
          @search="searchValue = $event"
        />
      </aside>

      <div class="note-main-panel">
        <header v-if="!bookmark.isMobile && noteTreeReadEnabled" class="note-directory-header">
          <nav class="note-directory-breadcrumbs" :aria-label="$t('note.currentDirectory')">
            <BButton
              class="note-directory-crumb"
              :class="{ 'is-current': currentParentId === null }"
              @click="selectDirectory(null)"
            >
              {{ $t('note.knowledgeRoot') }}
            </BButton>
            <template v-for="item in currentBreadcrumb" :key="item.id">
              <span class="note-directory-separator" aria-hidden="true">/</span>
              <BButton
                class="note-directory-crumb"
                :class="{ 'is-current': item.id === currentParentId }"
                @click="selectDirectory(item.id)"
              >
                {{ item.title || $t('note.untitled') }}
              </BButton>
            </template>
          </nav>
          <div class="note-directory-title-row">
            <div class="note-directory-title-copy">
              <h2>{{ currentDirectoryTitle || $t('note.knowledgeRoot') }}</h2>
              <span v-if="hasActiveFilter">{{ $t('note.visibleCount', { total: noteTotal }) }}</span>
              <span v-else-if="currentParentId">{{ $t('note.directChildren', { count: noteTotal }) }}</span>
              <span v-else>{{ $t('note.rootDirectoryHint') }}</span>
            </div>
            <div class="note-directory-actions">
              <BButton
                v-if="currentParentId"
                class="note-open-directory-page"
                @click="openDirectoryPage(currentParentId)"
              >
                <SvgIcon :src="icon.noteTree.openPage" size="15" aria-hidden="true" />
                {{ $t('note.openPageBody') }}
              </BButton>
              <BButton
                v-if="!currentParentId || noteTreeWriteEnabled"
                type="primary"
                class="note-new-child-page"
                @click="showNewNotePicker"
              >
                <SvgIcon :src="icon.common.add" size="15" aria-hidden="true" />
                {{ currentParentId ? $t('note.newChildPage') : $t('note.newNote') }}
              </BButton>
              <BDropdown
                v-if="currentDirectoryNode"
                :trigger="'click'"
                :align="'right'"
                :menu-options="currentDirectoryMenuOptions"
              >
                <BButton class="note-directory-more" :aria-label="$t('common.more')">
                  <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
                </BButton>
              </BDropdown>
            </div>
          </div>
        </header>
        <div
          v-if="loading && currentViewMode === 'card'"
          class="note-library-body note-card-skeleton-wrap"
          data-mobile-resource-scroll
        >
          <div v-for="n in bookmark.isMobile ? 4 : 30" :key="`card-skeleton-${n}`" class="note-card-skeleton">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-tags">
              <div class="skeleton-chip"></div>
              <div class="skeleton-chip"></div>
            </div>
          </div>
        </div>
        <VueDraggable
          v-else-if="currentViewMode === 'card' && visibleDragNoteList.length"
          v-auto-scrollbar
          :disabled="!canDragNote"
          :animation="200"
          v-model="visibleDragNoteList"
          class="note-library-body"
          data-mobile-resource-scroll
          @start="onStart"
          @end="onEnd"
          ghost-class="note-card-drag-ghost"
          chosen-class="note-card-drag-chosen"
          drag-class="note-card-dragging"
          :scroll-sensitivity="50"
          :forceFallback="true"
          :touchStartThreshold="10"
          :delay="100"
        >
          <RightMenu
            v-for="note in visibleDragNoteList"
            :key="note.id"
            :menu="menuForNote(note)"
            @select="handleNoteMenuSelect($event, note)"
          >
            <note-card
              :note="note"
              :batch-mode="batchMode"
              :tree-read-enabled="noteTreeReadEnabled"
              :tree-write-enabled="noteTreeWriteEnabled"
              @nodeTypeChange="handleNodeTypeChange"
              @action="handleNoteCardAction($event, note)"
            />
          </RightMenu>
        </VueDraggable>
        <div
          v-if="currentViewMode === 'list' && (loading || visibleDragNoteList.length)"
          class="note-library-body-list"
        >
          <div v-if="loading" class="note-list note-list-skeleton-wrap" data-mobile-resource-scroll>
            <!--
              骨架高度要贴住真实行高,否则数据落地时列表会跳。
              桌面:标题 + 摘要两行(标签与摘要同占一行,不额外占高)。
              手机:标题、摘要、chip 行是纵向堆叠的三段(实测整项 109px),
              少了 chip 那段骨架就会比真实项矮约 40px。
            -->
            <div v-for="n in 12" :key="`list-skeleton-${n}`" class="note-list-skeleton-item">
              <div class="skeleton-line long"></div>
              <div class="skeleton-line short"></div>
              <template v-if="bookmark.isMobile">
                <div class="skeleton-line medium"></div>
                <div class="skeleton-list-chips">
                  <div class="skeleton-chip"></div>
                  <div class="skeleton-chip"></div>
                </div>
              </template>
            </div>
          </div>
          <VueDraggable
            v-else
            v-auto-scrollbar
            :disabled="!canDragNote"
            :animation="200"
            ref="el"
            v-model="visibleDragNoteList"
            class="note-list"
            data-mobile-resource-scroll
            @start="onStart"
            @end="onEnd"
            :scroll-sensitivity="50"
            :forceFallback="true"
            :touchStartThreshold="10"
            :delay="100"
          >
            <RightMenu
              v-for="note in visibleDragNoteList"
              :key="note.id"
              :menu="menuForNote(note)"
              @select="handleNoteMenuSelect($event, note)"
            >
              <note-list-item
                :note="note"
                :batch-mode="batchMode"
                :tree-read-enabled="noteTreeReadEnabled"
                :tree-write-enabled="noteTreeWriteEnabled"
                @nodeTypeChange="handleNodeTypeChange"
                @action="handleNoteCardAction($event, note)"
              />
            </RightMenu>
          </VueDraggable>
        </div>
        <div v-if="loadingMore" class="note-load-more">
          <BLoading inline loading :title="$t('common.loading')" />
        </div>
        <div v-if="!loading && !visibleDragNoteList.length" class="note-empty-state">
          <span class="note-empty-icon"><SvgIcon :src="icon.resource.note" size="28" /></span>
          <!-- 区分「搜索/标签筛选无命中」与「新用户没笔记」 -->
          <template v-if="hasActiveFilter">
            <strong>{{ $t('note.noFilterMatch') }}</strong>
            <BButton type="primary" class="note-create-button" @click="clearFilters">
              {{ $t('note.clearFilter') }}
            </BButton>
          </template>
          <template v-else>
            <strong>{{ $t('note.empty') }}</strong>
            <p>{{ $t('note.emptyHint') }}</p>
            <BButton type="primary" class="note-create-button" @click="showNewNotePicker">
              {{ $t('note.newNote') }}
            </BButton>
          </template>
        </div>
      </div>
    </div>

    <!-- 新建笔记类型选择 -->
    <NewNotePickerModal
      v-if="bookmark.isMobile"
      v-model:visible="showTypePicker"
      :builtin-templates="orderedBuiltinTemplates"
      :my-templates="orderedMyTemplates"
      :my-templates-state="myTemplatesState"
      :template-icons="TEMPLATE_ICONS"
      @select-blank="handleMobileBlankSelection"
      @select-builtin="handleMobileBuiltinSelection"
      @select-mine="handleMobileTemplateSelection"
      @remove-mine="confirmDeleteTemplate"
      @retry="loadMyTemplates"
    />
    <ActionCardModal
      v-else
      v-model:visible="showTypePicker"
      :mask-closable="false"
      :title="$t('note.pickEditor')"
      width="min(760px, 80vw)"
      :sections="typePickerSections"
      :note="$t('note.pickEditorTip')"
    />

    <!-- AI 智能整理(笔记):自动为未打标签的笔记推荐标签 -->
    <AiOrganizeModal
      v-model:visible="aiOrgVisible"
      init-type="note"
      :selected-ids="selectedAiOrganizeIds"
      @applied="init"
    />
    <NoteTagConfig
      v-if="tagConfigVisible && activeTagNote"
      v-model:visible="tagConfigVisible"
      :note="activeTagNote"
      @saveTag="handleNoteTagsSaved"
    />
    <NoteMoveModal
      v-if="noteTreeWriteEnabled && (activeMoveNote || activeMoveNotes.length)"
      v-model:visible="moveNoteVisible"
      :note="activeMoveNote"
      :notes="activeMoveNotes"
      @moved="handleNoteMoved"
    />
    <NoteRenameModal
      v-if="activeRenameNote"
      v-model:visible="renameNoteVisible"
      :note="activeRenameNote"
      @renamed="handleNoteRenamed"
    />
    <NoteDirectoryDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileDirectoryOpen"
      :initial-tab="mobileDirectoryInitialTab"
      :current-parent-id="currentParentId"
      :all-tags="visibleNoteTags"
      :total-count="allNoteCount"
      :untagged-count="untaggedNoteCount"
      :tag-loading="tagLoading"
      :directory-enabled="noteTreeMobileEnabled"
      :write-enabled="noteTreeWriteEnabled"
      @select="selectDirectory"
      @select-tag="selectMobileDirectoryTag"
      @open-page="openDirectoryPage($event.id)"
      @create="showNewChildPicker"
      @move="openMoveNote"
      @delete="deleteSingleNote"
    />
    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobilePageActionsOpen"
      :title="t('common.more')"
      :actions="mobilePageActions"
      @action="handleMobilePageAction"
    />
    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileBatchActionsOpen"
      :title="t('note.selectedCount', { count: selectedVisibleCount })"
      :actions="mobileBatchActions"
      @action="handleMobileBatchAction"
    />
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import { apiBasePost } from '@/http/request.ts';
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { VueDraggable } from 'vue-draggable-plus';
  import NoteLibrarySidebar from '@/components/noteLibrary/tree/NoteLibrarySidebar.vue';
  import NoteDirectoryDrawer from '@/components/noteLibrary/tree/NoteDirectoryDrawer.vue';
  import NoteMoveModal from '@/components/noteLibrary/tree/NoteMoveModal.vue';
  import NoteRenameModal from '@/components/noteLibrary/tree/NoteRenameModal.vue';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { registerGlobalRefreshSource } from '@/composables/useGlobalRefreshBar';
  import AiOrganizeModal from '@/components/manage/bookmarkMg/AiOrganizeModal.vue';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import NoteListItem from '@/components/noteLibrary/library/NoteListItem.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import ViewModeToggle from '@/components/base/ViewModeToggle.vue';
  import { DEFAULT_NOTE_VIEW_MODE } from '@/utils/preferences.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import {
    collapseNoteDeletePreviews,
    DISABLED_NOTE_TREE_FEATURES,
    fetchNoteDeletePreview,
    fetchNoteTreeFeatures,
    type NoteDeletePreview,
    type NoteTreeFeatures,
  } from '@/api/noteTree';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';
  import ActionCardModal from '@/components/base/ActionCardModal.vue';
  import NewNotePickerModal from '@/components/noteLibrary/library/NewNotePickerModal.vue';
  import { BUILTIN_NOTE_TEMPLATES, pickTemplateLocale } from '@/config/noteTemplates.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import RightMenu from '@/components/base/RightMenu.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import { openAiAssistant, type AiAssistantIntent } from '@/utils/aiEntry';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { NOTE_TREE_ROOT_KEY, useNoteTree } from '@/composables/useNoteTree';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import {
    RESOURCE_LIST_PAGE_SIZE,
    buildResourceSortMove,
    hasResourceOrderChanged,
    isNearResourceScrollEnd,
    mergeResourcePage,
  } from '@/utils/resourcePagination';
  const NoteTagConfig = defineAsyncComponent(() => import('@/components/noteLibrary/detail/NoteTagConfig.vue'));
  const TEMPLATE_ICONS: Record<string, string> = {
    daily: icon.noteTemplate.daily,
    weekly: icon.noteTemplate.weekly,
    meeting: icon.noteTemplate.meeting,
    reading: icon.noteTemplate.reading,
    project: icon.noteTemplate.project,
    review: icon.noteTemplate.review,
    knowledge: icon.noteTemplate.knowledge,
    mindmap: icon.noteTemplate.mindmap,
  };

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const noteTreeFeatures = ref<NoteTreeFeatures>({ ...DISABLED_NOTE_TREE_FEATURES });
  const noteTreeFeaturesReady = ref(false);
  const noteTreeReadEnabled = computed(() => noteTreeFeatures.value.note_tree_read);
  const noteTreeWriteEnabled = computed(() => noteTreeFeatures.value.note_tree_write);
  const noteTreeMobileEnabled = computed(
    () => noteTreeReadEnabled.value && noteTreeFeatures.value.note_tree_mobile,
  );
  const noteTreeSubtreeTrashEnabled = computed(
    () => noteTreeWriteEnabled.value && noteTreeFeatures.value.note_tree_subtree_trash,
  );
  const NOTE_SIDEBAR_EXPANDED_KEY = 'light-note-note-tree-sidebar-expanded';
  const NOTE_SIDEBAR_MODE_KEY = 'light-note-note-tree-sidebar-mode';

  function readSessionValue(key: string) {
    if (typeof sessionStorage === 'undefined') return '';
    try {
      return String(sessionStorage.getItem(key) || '');
    } catch {
      return '';
    }
  }

  const noteSidebarExpanded = ref(readSessionValue(NOTE_SIDEBAR_EXPANDED_KEY) !== '0');
  const noteSidebarMode = ref<'directory' | 'tags'>(
    readSessionValue(NOTE_SIDEBAR_MODE_KEY) === 'tags' ? 'tags' : 'directory',
  );
  const isMediumNoteLayout = computed(() => bookmark.isTablet);
  const showNoteSidebar = computed(
    () => !bookmark.isMobile && (!isMediumNoteLayout.value || noteSidebarExpanded.value),
  );

  function writeSessionValue(key: string, value: string) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // 隐私模式或受限 WebView 可能禁用存储；布局本身仍保持当前内存状态。
    }
  }

  function toggleNoteSidebar() {
    noteSidebarExpanded.value = !noteSidebarExpanded.value;
  }

  watch(noteSidebarExpanded, (expanded) => writeSessionValue(NOTE_SIDEBAR_EXPANDED_KEY, expanded ? '1' : '0'));
  watch(noteSidebarMode, (mode) => writeSessionValue(NOTE_SIDEBAR_MODE_KEY, mode));
  const { resetCurrentResourceScroll } = useMobileNavigationState();
  const { addResourcesToInbox, removeResourcesFromInbox } = useInboxEnqueue();
  const {
    childrenByParent,
    currentBreadcrumb,
    currentDirectoryTitle,
    currentParentId,
    expandedIds,
    loadingKeys: treeLoadingKeys,
    treeError,
    treeSearchChildrenByParent,
    treeSearchError,
    treeSearchExpandedIds,
    treeSearchKeyword,
    treeSearchLoading,
    treeSearchMatchCount,
    openDirectoryPage: openTreeDirectoryPage,
    refreshTree,
    searchTree,
    selectDirectory: selectTreeDirectory,
    toggleExpanded: toggleTreeNodeBase,
  } = useNoteTree({ enabled: noteTreeReadEnabled });

  async function loadNoteTreeFeatureSnapshot() {
    let next = { ...DISABLED_NOTE_TREE_FEATURES } as NoteTreeFeatures;
    try {
      next = await fetchNoteTreeFeatures();
    } catch {
      // 前端先于后端发布、网络异常或灰度接口不可用时失败关闭；普通平铺笔记库仍可使用。
    }
    noteTreeFeatures.value = next;
    if (!next.note_tree_read) {
      noteSidebarMode.value = 'tags';
      const query = { ...router.currentRoute.value.query };
      if (Object.prototype.hasOwnProperty.call(query, 'parent')) {
        delete query.parent;
        delete query._rt;
        await router.replace({ path: '/noteLibrary', query });
      }
    }
    noteTreeFeaturesReady.value = true;
  }

  void loadNoteTreeFeatureSnapshot();
  const noteList = ref<any[]>([]);
  const visibleDragNoteList = ref<any[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  // 只切标签时走软刷新:保留旧列表并降透明度,不整屏换骨架屏
  const refreshing = ref(false);
  const tagLoading = ref(true);
  const noteTotal = ref(0);
  const notePage = ref(0);
  const noteHasMore = ref(false);
  const noteDragging = ref(false);
  const searchValue = ref('');
  const debouncedSearch = ref('');
  const searchTimer = ref<number | null>(null);
  const treeSearchActive = computed(
    () => noteTreeReadEnabled.value && Boolean(treeSearchKeyword.value.trim()),
  );
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
  const sidebarTreeError = computed(() =>
    treeSearchActive.value ? treeSearchError.value : treeError.value,
  );
  let noteRequestSeq = 0;
  const showTypePicker = ref(false);
  const createParentOverride = ref<string | null | undefined>(undefined);
  const aiOrgVisible = ref(false); // AI 智能整理(笔记)弹框
  const selectedAiOrganizeIds = ref<string[]>([]);
  const tagConfigVisible = ref(false);
  const activeTagNote = ref<any | null>(null);
  const activeMoveNote = ref<any | null>(null);
  const activeMoveNotes = ref<any[]>([]);
  const moveNoteVisible = ref(false);
  const activeRenameNote = ref<{ id: string; title?: string } | null>(null);
  const renameNoteVisible = ref(false);
  const batchMode = ref(false);
  const mobilePageActionsOpen = ref(false);
  const mobileBatchActionsOpen = ref(false);
  const mobileDirectoryOpen = ref(false);
  const mobileDirectoryInitialTab = ref<'directory' | 'tags'>('directory');
  // 用户自存模板(元信息,不含正文);打开 picker 时异步刷新,不阻塞弹窗展示
  const myTemplates = ref<Array<{ id: string; name: string; description?: string; type: string }>>([]);
  const myTemplatesState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
  const templateUsage = ref<Record<string, number>>(readTemplateUsage());
  let templatesRequestSeq = 0; // 防旧响应覆盖新响应
  async function loadMyTemplates() {
    const seq = ++templatesRequestSeq;
    if (myTemplatesState.value !== 'success') myTemplatesState.value = 'loading';
    try {
      const res = await apiBasePost('/api/note/queryNoteTemplates');
      if (seq !== templatesRequestSeq) return;
      if (res.status === 200) {
        myTemplates.value = res.data ?? [];
        myTemplatesState.value = 'success';
      } else {
        myTemplatesState.value = 'error';
      }
    } catch {
      if (seq === templatesRequestSeq) myTemplatesState.value = 'error';
    }
  }
  async function gotoNewNote(query: Record<string, string>) {
    if (blockGuestWrite('add-note')) {
      showTypePicker.value = false;
      return;
    }
    const usageKey = query.builtin ? `builtin:${query.builtin}` : query.templateId ? `mine:${query.templateId}` : '';
    if (usageKey) {
      templateUsage.value = { ...templateUsage.value, [usageKey]: Date.now() };
      localStorage.setItem('note-template-recent-usage', JSON.stringify(templateUsage.value));
    }
    const targetQuery = { ...query };
    const requestedParentId =
      createParentOverride.value === undefined ? currentParentId.value : createParentOverride.value;
    const parentId = noteTreeWriteEnabled.value ? requestedParentId : null;
    if (parentId) targetQuery.parent = parentId;
    try {
      await closeCurrentMobileOverlayThen(
        () => {
          showTypePicker.value = false;
        },
        () => router.push({ path: '/noteLibrary/add', query: targetQuery }),
      );
    } finally {
      createParentOverride.value = undefined;
    }
  }
  function readTemplateUsage() {
    try {
      const parsed = JSON.parse(localStorage.getItem('note-template-recent-usage') || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  const orderedBuiltinTemplates = computed(() =>
    [...BUILTIN_NOTE_TEMPLATES].sort(
      (a, b) =>
        Number(templateUsage.value[`builtin:${b.key}`] || 0) - Number(templateUsage.value[`builtin:${a.key}`] || 0),
    ),
  );
  const orderedMyTemplates = computed(() =>
    [...myTemplates.value].sort(
      (a, b) => Number(templateUsage.value[`mine:${b.id}`] || 0) - Number(templateUsage.value[`mine:${a.id}`] || 0),
    ),
  );
  const templateTypeTag = (type: string) => (type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml'));
  function confirmDeleteTemplate(tpl: { id: string; name: string }) {
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.tplDeleteConfirm', { name: tpl.name }),
      onOk() {
        apiBasePost('/api/note/delNoteTemplate', { id: tpl.id }).then((res) => {
          if (res.status === 200) {
            recordOperation({ module: '笔记库', operation: `删除笔记模板【${tpl.name}】` });
            message.success(t('note.tplDeleted'));
            loadMyTemplates();
          } else {
            message.error(res.msg);
          }
        });
      },
    });
  }
  // "我的模板"区按状态渲染:加载/空态给提示行(hint),失败给可点重试卡,成功给模板卡
  const myTemplateSection = computed(() => {
    if (myTemplatesState.value === 'error') {
      return {
        key: 'mine',
        title: t('note.tplMineSection'),
        actions: [
          {
            key: 'retry',
            label: t('note.tplRetryLabel'),
            description: t('note.tplRetryDesc'),
            onClick: () => loadMyTemplates(),
          },
        ],
      };
    }
    if (myTemplatesState.value === 'success' && myTemplates.value.length) {
      return {
        key: 'mine',
        title: t('note.tplMineSection'),
        actions: orderedMyTemplates.value.map((tpl) => ({
          key: tpl.id,
          label: tpl.name,
          description: tpl.description || '',
          tag: templateTypeTag(tpl.type),
          removable: true,
          onRemove: () => confirmDeleteTemplate(tpl),
          onClick: () => gotoNewNote({ type: tpl.type, templateId: tpl.id }),
        })),
      };
    }
    return {
      key: 'mine',
      title: t('note.tplMineSection'),
      actions: [],
      hint: myTemplatesState.value === 'loading' ? t('note.tplLoading') : t('note.tplEmptyMine'),
    };
  });
  const typePickerSections = computed(() => {
    const templateLocale = pickTemplateLocale(locale.value);
    return [
      {
        key: 'type',
        title: t('note.pickMode'),
        actions: [
          {
            key: 'html',
            label: t('note.htmlLabel'),
            description: t('note.htmlDesc'),
            onClick: () => gotoNewNote({ type: 'html' }),
          },
          {
            key: 'markdown',
            label: t('note.mdLabel'),
            description: t('note.mdDesc'),
            onClick: () => gotoNewNote({ type: 'markdown' }),
          },
        ],
      },
      {
        key: 'builtin',
        title: t('note.tplBuiltinSection'),
        actions: orderedBuiltinTemplates.value.map((tpl) => ({
          key: tpl.key,
          label: t(tpl.nameKey),
          description: t(tpl.descKey),
          tag: templateTypeTag(tpl.type),
          icon: TEMPLATE_ICONS[tpl.key] ?? icon.resource.note,
          preview: tpl.preview[templateLocale],
          onClick: () => gotoNewNote({ type: tpl.type, builtin: tpl.key }),
        })),
      },
      myTemplateSection.value,
    ];
  });

  function showNewNotePicker() {
    createParentOverride.value = noteTreeWriteEnabled.value ? currentParentId.value : null;
    showTypePicker.value = true;
    loadMyTemplates();
  }

  function showNewChildPicker(note: any) {
    if (!noteTreeWriteEnabled.value || !note?.id) return;
    createParentOverride.value = String(note.id);
    showTypePicker.value = true;
    loadMyTemplates();
  }

  function handleMobileBlankSelection(type: 'html' | 'markdown') {
    gotoNewNote({ type });
  }

  function handleMobileBuiltinSelection(template: { key: string; type: 'html' | 'markdown' }) {
    gotoNewNote({ type: template.type, builtin: template.key });
  }

  function handleMobileTemplateSelection(template: { id: string; type: string }) {
    gotoNewNote({ type: template.type, templateId: template.id });
  }

  async function toggleNoteInbox(note: any) {
    const resource = [{ resourceType: 'note' as const, resourceId: String(note.id) }];
    const ok = note.isPending
      ? await removeResourcesFromInbox(resource, '笔记库')
      : await addResourcesToInbox(resource, '笔记库');
    if (ok) note.isPending = !note.isPending;
  }
  function menuForNote(note: any) {
    return [
      {
        key: 'toggleTop',
        label: note.isTop ? t('common.unpin') : t('common.pin'),
        icon: note.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
      },
      { key: 'relateTags', label: t('note.relateTags'), icon: icon.manage_categoryBtn_tag },
      {
        key: 'toggleInbox',
        label: note.isPending ? t('inbox.removeExisting') : t('inbox.addExisting'),
        icon: icon.contextMenu.inbox,
      },
      ...(noteTreeWriteEnabled.value
        ? [{ key: 'move', label: t('note.movePage'), icon: icon.noteTree.move }]
        : []),
      { key: 'note-actions-divider', divider: true },
      { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
    ];
  }

  const togglingTopIds = new Set<string>();
  const sortPinnedFirst = (notes: any[]) =>
    [...notes].sort((a: any, b: any) => Number(Boolean(b.isTop)) - Number(Boolean(a.isTop)));

  async function toggleNoteTop(note: any) {
    if (blockGuestWrite('pin-note')) return;
    const noteId = String(note?.id || '');
    if (!noteId || togglingTopIds.has(noteId)) return;
    togglingTopIds.add(noteId);
    try {
      const res = await apiBasePost('/api/note/toggleNoteTop', { id: noteId });
      if (res.status !== 200) return;
      note.isTop = Boolean(res.data?.isTop);
      await reloadNotes();
      message.success(note.isTop ? t('common.pinned') : t('common.unpinned'));
      recordOperation({
        module: '笔记库',
        operation: `${note.isTop ? '置顶' : '取消置顶'}笔记【${note.title}】`,
      });
    } catch (error) {
      console.error('Error toggling note pin:', error);
    } finally {
      togglingTopIds.delete(noteId);
    }
  }

  function openNoteTagConfig(note: any) {
    activeTagNote.value = note;
    tagConfigVisible.value = true;
  }

  function handleNoteTagsSaved(tags: any[]) {
    if (!activeTagNote.value) return;
    activeTagNote.value.tags = tags;
    void init();
  }

  function findLoadedTreeNode(noteId: string) {
    for (const store of [childrenByParent.value, treeSearchChildrenByParent.value]) {
      for (const nodes of Object.values(store)) {
        const match = nodes.find((node) => node.id === noteId);
        if (match) return match;
      }
    }
    return null;
  }

  function noteTreeSurface(): 'desktop' | 'mobile' {
    return bookmark.isMobile ? 'mobile' : 'desktop';
  }

  function noteTreeNodeMetrics(noteId: string | null) {
    if (!noteId) {
      return {
        depth: 0,
        childCount: (childrenByParent.value[NOTE_TREE_ROOT_KEY] || []).length,
      };
    }
    const node = findLoadedTreeNode(noteId);
    if (!node) return {};
    let depth = 1;
    let parentId = node.parentId;
    const visited = new Set([node.id]);
    while (parentId && depth <= 9) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      depth += 1;
      parentId = findLoadedTreeNode(parentId)?.parentId || null;
    }
    return { depth, childCount: Math.max(0, Number(node.childCount || 0)) };
  }

  async function selectDirectory(noteId: string | null) {
    void recordNoteTreeProductEvent('note_tree_branch_selected', {
      surface: noteTreeSurface(),
      ...noteTreeNodeMetrics(noteId),
      result: 'success',
    });
    return selectTreeDirectory(noteId);
  }

  function openDirectoryPage(noteId: string) {
    void recordNoteTreeProductEvent('note_tree_page_opened', {
      surface: noteTreeSurface(),
      ...noteTreeNodeMetrics(noteId),
      result: 'success',
    });
    return openTreeDirectoryPage(noteId);
  }

  async function toggleTreeNode(node: any) {
    const nodeId = String(node?.id || '');
    const wasExpanded = expandedIds.value.has(nodeId);
    await toggleTreeNodeBase(node);
    if (!wasExpanded && expandedIds.value.has(nodeId)) {
      void recordNoteTreeProductEvent('note_tree_node_expanded', {
        surface: noteTreeSurface(),
        ...noteTreeNodeMetrics(nodeId),
        result: 'success',
      });
    }
  }

  let desktopTreeOpenedRecorded = false;
  watch(
    [noteTreeReadEnabled, showNoteSidebar, noteSidebarMode],
    ([enabled, visible, mode]) => {
      if (!enabled || !visible || mode !== 'directory' || desktopTreeOpenedRecorded) return;
      desktopTreeOpenedRecorded = true;
      void recordNoteTreeProductEvent('note_tree_opened', {
        surface: 'desktop',
        depth: currentBreadcrumb.value.length,
        result: 'success',
      });
    },
    { immediate: true },
  );

  const currentDirectoryNode = computed(() => {
    const noteId = currentParentId.value;
    if (!noteId) return null;
    const loaded = findLoadedTreeNode(noteId);
    if (loaded) return loaded;
    const path = currentBreadcrumb.value;
    const current = path[path.length - 1];
    if (!current) return null;
    return {
      id: current.id,
      title: current.title,
      parentId: path.length > 1 ? path[path.length - 2].id : null,
    };
  });

  const currentDirectoryMenuOptions = computed(() => {
    const note = currentDirectoryNode.value;
    if (!note) return [];
    return [
      {
        label: t('note.renamePage'),
        icon: icon.cloudSpace.rename,
        function: () => openRenameNote(note),
      },
      ...(noteTreeWriteEnabled.value
        ? [
            {
              label: t('note.movePage'),
              icon: icon.noteTree.move,
              function: () => openMoveNote(note),
            },
          ]
        : []),
      {
        label: t('common.copyLink'),
        icon: icon.cloudSpace.preview.copy,
        function: () => copyNoteLink(note),
      },
      { key: 'current-directory-actions-divider', divider: true },
      {
        label: t('note.moveToTrash'),
        icon: icon.table_delete,
        danger: true,
        function: () => deleteSingleNote(note),
      },
    ];
  });

  function openRenameNote(note: any) {
    if (blockGuestWrite('rename-note')) return;
    const id = String(note?.id || '').trim();
    if (!id) return;
    activeRenameNote.value = { id, title: String(note?.title || '') };
    renameNoteVisible.value = true;
  }

  async function handleNoteRenamed(updated: { id: string; title: string }) {
    renameNoteVisible.value = false;
    recordOperation({ module: '笔记库', operation: `重命名笔记【${updated.title}】` });
    await Promise.all([refreshTree(), reloadNotes()]);
    activeRenameNote.value = null;
  }

  async function copyNoteLink(note: any) {
    const noteId = String(note?.id || '').trim();
    if (!noteId) return;
    const relative = router.resolve({ path: `/noteLibrary/${encodeURIComponent(noteId)}` }).href;
    let link = relative;
    if (typeof window !== 'undefined') {
      try {
        link = new URL(relative, window.location.origin).toString();
      } catch {
        // 某些 APK WebView 使用不完整的自定义 origin；相对路由仍可安全复制和打开。
      }
    }
    if (await copyTextToClipboard(link)) message.success(t('common.linkCopied'));
    else message.error(t('note.copyLinkFailed'));
  }

  function isDeleteScopeConflict(response: any) {
    return response?.status === 409 && response?.data?.code === 'NOTE_TREE_DELETE_CONFLICT';
  }

  async function deleteSingleNote(note: any) {
    if (blockGuestWrite('delete-note')) return;
    if (!noteTreeSubtreeTrashEnabled.value) {
      Alert.alert({
        title: t('note.deleteOneTitle'),
        content: t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
        footer: [
          { label: t('common.cancel'), function: () => undefined },
          {
            label: t('note.moveToTrash'),
            type: 'danger',
            async function() {
              const res = await apiBasePost('/api/note/delNote', { ids: [String(note.id)] });
              if (res.status === 409 && res.data?.code === 'NOTE_HAS_CHILDREN') {
                message.warning(res.msg || t('note.deleteScopeChanged'));
                return;
              }
              if (res.status !== 200) return;
              message.success(t('common.deleteSuccess'));
              recordOperation({ module: '笔记库', operation: `删除笔记成功【${note.title}】` });
              if (noteTreeReadEnabled.value) {
                void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
                  surface: noteTreeSurface(),
                  ...noteTreeNodeMetrics(String(note.id)),
                  subtreeSize: 1,
                  result: 'success',
                });
              }
              await init();
            },
          },
        ],
      });
      return;
    }
    let preview: NoteDeletePreview;
    try {
      preview = await fetchNoteDeletePreview(note.id);
    } catch (error) {
      console.warn('[note-library] delete preview failed', error);
      message.error(t('note.deletePreviewFailed'));
      return;
    }
    Alert.alert({
      title: t('note.deleteOneTitle'),
      content: preview.descendantCount
        ? t('note.deleteSubtreeConfirm', {
            title: note.title || t('note.untitled'),
            descendants: preview.descendantCount,
          })
        : t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
      footer: [
        { label: t('common.cancel'), function: () => undefined },
        {
          label:
            preview.totalCount > 1
              ? t('note.moveItemsToTrash', { count: preview.totalCount })
              : t('note.moveToTrash'),
          type: 'danger',
          async function() {
            const res = await apiBasePost('/api/note/deleteNoteSubtree', {
              id: preview.id,
              expectedDescendantCount: preview.descendantCount,
            });
            if (isDeleteScopeConflict(res)) {
              message.warning(t('note.deleteScopeChanged'));
              void deleteSingleNote(note);
              return;
            }
            if (res.status !== 200) return;
            message.success(t('common.deleteSuccess'));
            const deletedCount = Number(res.data?.deletedCount || preview.totalCount);
            recordOperation({ module: '笔记库', operation: `删除笔记成功【${note.title}，共${deletedCount}篇】` });
            void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
              surface: noteTreeSurface(),
              ...noteTreeNodeMetrics(String(note.id)),
              subtreeSize: deletedCount,
              result: 'success',
            });
            if (currentParentId.value === String(note.id)) {
              const fallbackParentId = note.parentId
                ? String(note.parentId)
                : currentBreadcrumb.value.length > 1
                  ? currentBreadcrumb.value[currentBreadcrumb.value.length - 2].id
                  : null;
              await selectDirectory(fallbackParentId);
            }
            await init();
          },
        },
      ],
    });
  }

  function openMoveNote(note: any) {
    if (!noteTreeWriteEnabled.value || blockGuestWrite('move-note')) return;
    activeMoveNotes.value = [];
    activeMoveNote.value = note;
    moveNoteVisible.value = true;
  }

  function openBatchMove() {
    if (!noteTreeWriteEnabled.value || blockGuestWrite('move-note')) return;
    const selected = getSelectedNotes();
    if (!selected.length) return;
    mobileBatchActionsOpen.value = false;
    activeMoveNote.value = null;
    activeMoveNotes.value = [...selected];
    moveNoteVisible.value = true;
  }

  async function handleNoteMoved() {
    const wasBatchMove = activeMoveNotes.value.length > 0;
    moveNoteVisible.value = false;
    if (wasBatchMove) exitBatch();
    await Promise.all([refreshTree(), reloadNotes()]);
    activeMoveNote.value = null;
    activeMoveNotes.value = [];
  }

  function handleNoteMenuSelect(action: string, note: any) {
    if (action === 'toggleTop') toggleNoteTop(note);
    else if (action === 'relateTags') openNoteTagConfig(note);
    else if (action === 'toggleInbox') toggleNoteInbox(note);
    else if (action === 'enterDirectory' && noteTreeReadEnabled.value) selectDirectory(String(note.id));
    else if (action === 'createChild') showNewChildPicker(note);
    else if (action === 'move') openMoveNote(note);
    else if (action === 'delete') deleteSingleNote(note);
  }

  function handleNoteCardAction(
    action: 'toggleTop' | 'relateTags' | 'toggleInbox' | 'enterDirectory' | 'createChild' | 'move' | 'delete',
    note: any,
  ) {
    handleNoteMenuSelect(action, note);
  }
  // 手机与桌面共用同一个 noteViewMode 偏好：设置里能配、笔记库顶部也能快切，与 PC 一致
  const currentViewMode = computed(() => user.preferences.noteViewMode || DEFAULT_NOTE_VIEW_MODE);
  const noteWorkspaceRef = ref<HTMLElement | null>(null);

  /*
   * 下拉刷新。走 reloadNotes(true) 的软刷新路径:保留旧列表、不进骨架屏,
   * 只降透明度加顶部进度条 —— 与「下拉刷新不清空数据」的要求正好一致。
   * 当前标签(URL query 驱动)、视图、搜索词、路由、排序都不受影响。
   *
   * 骨架屏容器和卡片列表是两个轮换出现的 DOM 节点(都带 data-mobile-resource-scroll),
   * 所以容器要动态取当前存在的那个,不能绑死一个 ref。
   */
  const pullRefresh = useAndroidPullRefresh({
    enabled: computed(() => !batchMode.value),
    externalBusy: computed(() => loading.value || refreshing.value || loadingMore.value || noteDragging.value),
    getScrollContainer: () =>
      noteWorkspaceRef.value?.querySelector<HTMLElement>('[data-mobile-resource-scroll]') ?? null,
    onRefresh: () => Promise.all([reloadNotes(true), getAllTags(), refreshTree()]),
  });
  /*
   * 从后台切回来时补一次数据。走的是同一条软刷新路径,区别只在触发方式:
   * 这里没有手势,所以反馈只有顶部那条进度条。
   */
  useForegroundRefresh({
    refresh: () => Promise.all([reloadNotes(true), getAllTags(), refreshTree()]),
    canRefresh: () =>
      !batchMode.value && !loading.value && !refreshing.value && !loadingMore.value && !noteDragging.value,
  });
  /*
   * 切标签的软刷新也要有提示,走顶部那条全局进度条(App.vue)。
   * 前台恢复刷新由 composable 自己注册,这一条是页面自己的软刷新 ——
   * 必须排除下拉引起的那次,否则和跟手的胶囊指示器重复。
   */
  registerGlobalRefreshSource(() => refreshing.value && !pullRefresh.refreshing.value);
  const allTags = ref<any[]>([]);
  const untaggedNoteCount = ref<number | null>(null);
  const totalNoteCount = ref<number | null>(null);
  // 侧栏的三个计数取同一次标签查询的快照,避免"全部"和各标签之和对不上;
  // 旧后端没有该字段时回退到无筛选列表写入的 user.noteTotal
  const allNoteCount = computed(() => totalNoteCount.value ?? user.noteTotal ?? 0);

  async function init() {
    await Promise.all([reloadNotes(), getAllTags(), refreshTree()]);
  }

  function getActiveNoteTagId() {
    const rawTag = router.currentRoute.value.query.tag;
    if (Array.isArray(rawTag)) return String(rawTag[0] || '') || undefined;
    if (rawTag === undefined || rawTag === null) return undefined;
    return String(rawTag);
  }

  async function queryNotePage(targetPage: number, append = false, soft = false) {
    const requestSeq = append ? noteRequestSeq : ++noteRequestSeq;
    if (append) loadingMore.value = true;
    else {
      // soft 时不动 loading:模板继续渲染旧列表,避免切标签整屏闪骨架屏
      if (soft) refreshing.value = true;
      else loading.value = true;
      loadingMore.value = false;
      notePage.value = 0;
      noteHasMore.value = false;
    }

    try {
      const res = await apiBasePost('/api/note/queryNoteList', {
        page: targetPage,
        pageSize: RESOURCE_LIST_PAGE_SIZE,
        ...(noteTreeReadEnabled.value ? { parentId: currentParentId.value } : {}),
        keyword: debouncedSearch.value,
        tagId: getActiveNoteTagId(),
      });
      if (requestSeq !== noteRequestSeq) return false;
      if (res.status !== 200) {
        message.error(t('note.loadFailed'));
        return false;
      }

      const pageItems = Array.isArray(res.data?.items) ? res.data.items : [];
      noteList.value = append ? mergeResourcePage(noteList.value, pageItems) : pageItems;
      noteTotal.value = Number(res.data?.total || 0);
      notePage.value = Number(res.data?.page || targetPage);
      noteHasMore.value = Boolean(res.data?.hasMore);
      return true;
    } catch (error) {
      console.error('加载笔记列表失败:', error);
      message.error(t('note.loadFailed'));
      return false;
    } finally {
      if (requestSeq === noteRequestSeq) {
        loading.value = false;
        loadingMore.value = false;
        refreshing.value = false;
      }
    }
  }

  function reloadNotes(soft = false) {
    return queryNotePage(1, false, soft);
  }

  function loadMoreNotes() {
    if (noteDragging.value || loading.value || loadingMore.value || !noteHasMore.value) return Promise.resolve(false);
    return queryNotePage(notePage.value + 1, true);
  }

  function onNoteScroll(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // 左侧标签目录也在这个捕获范围内,只认笔记列表自身的滚动容器,
    // 否则标签列表滚到底会被当成"笔记列表触底"而误加载下一页
    if (!target.hasAttribute('data-mobile-resource-scroll')) return;
    if (isNearResourceScrollEnd(target)) {
      void loadMoreNotes();
    }
  }

  async function getAllTags() {
    try {
      const res = await apiBasePost('/api/note/queryNoteTagList', { userId: user.id });
      if (res.status === 200) {
        // 兼容旧后端:老版本直接返回标签数组,新版本返回带汇总计数的对象
        const payload: any = res.data;
        const isLegacyArray = Array.isArray(payload);
        allTags.value = isLegacyArray ? payload : Array.isArray(payload?.items) ? payload.items : [];
        untaggedNoteCount.value = isLegacyArray ? null : toFiniteCount(payload?.untaggedCount);
        totalNoteCount.value = isLegacyArray ? null : toFiniteCount(payload?.totalCount);
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    } finally {
      tagLoading.value = false;
    }
  }

  function toFiniteCount(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // 空态区分用:搜索词或标签筛选(?tag=,含 'null'=无标签筛选)任一激活
  const hasActiveFilter = computed(
    () => Boolean(debouncedSearch.value.trim()) || router.currentRoute.value.query.tag != null,
  );
  function clearFilters() {
    searchValue.value = '';
    debouncedSearch.value = '';
    if (router.currentRoute.value.query.tag != null) {
      const query = { ...router.currentRoute.value.query };
      delete query.tag;
      delete query._rt;
      router.replace({ path: '/noteLibrary', query });
    }
  }
  const canDragNote = computed(
    () =>
      !bookmark.isMobile &&
      (!noteTreeReadEnabled.value || noteTreeWriteEnabled.value) &&
      !loading.value &&
      !loadingMore.value &&
      !debouncedSearch.value &&
      router.currentRoute.value.query.tag == null &&
      visibleDragNoteList.value.length > 1 &&
      !noteList.value.some((note) => note.isCheck === true),
  );

  watch(
    () => searchValue.value,
    (val) => {
      if (searchTimer.value) clearTimeout(searchTimer.value);
      searchTimer.value = window.setTimeout(() => {
        debouncedSearch.value = val.trim().toLowerCase();
        searchTimer.value = null;
      }, 200);
    },
    { immediate: true },
  );

  watch(
    [noteTreeReadEnabled, debouncedSearch, currentParentId],
    ([enabled, keyword, parentId]) => {
      if (!enabled || !keyword) {
        void searchTree('', parentId);
        return;
      }
      void searchTree(keyword, parentId);
    },
    { immediate: true },
  );

  watch(
    [
      noteTreeFeaturesReady,
      debouncedSearch,
      () => router.currentRoute.value.query.tag,
      () => router.currentRoute.value.query._rt,
      currentParentId,
    ],
    ([featuresReady, search, tag, refreshToken, parentId], previous) => {
      if (!featuresReady) return;
      // 只有"页面已有内容 + 本次仅标签变化"才软刷新;首屏、搜索和强制刷新仍用骨架屏
      const onlyTagChanged =
        Array.isArray(previous) &&
        search === previous[1] &&
        refreshToken === previous[3] &&
        parentId === previous[4] &&
        tag !== previous[2];
      const soft = onlyTagChanged && visibleDragNoteList.value.length > 0;
      if (batchMode.value) exitBatch();
      void reloadNotes(soft);
      if (bookmark.isMobile) {
        nextTick(() => {
          window.requestAnimationFrame(resetCurrentResourceScroll);
        });
      }
    },
    { immediate: true },
  );
  void getAllTags();

  function applyNoteSearchImmediately() {
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    searchTimer.value = null;
    debouncedSearch.value = searchValue.value.trim().toLowerCase();
  }

  useMobileTopBar(['noteLibrary'], {
    searchSourceType: 'note',
    onAuxiliaryAction: () => {
      if (batchMode.value) {
        exitBatch();
        return;
      }
      mobilePageActionsOpen.value = true;
    },
    auxiliaryActionLabel: () => t(batchMode.value ? 'note.exitBatch' : 'common.more'),
    auxiliaryActionIcon: () => (batchMode.value ? icon.common.close : icon.common.more),
    onAdd: showNewNotePicker,
    addLabel: () => t(currentParentId.value && noteTreeWriteEnabled.value ? 'note.newChildPage' : 'note.newNote'),
  });

  async function resetNoteLibrary() {
    const alreadyReset =
      !debouncedSearch.value && router.currentRoute.value.query.tag == null && currentParentId.value === null;
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    searchTimer.value = null;
    searchValue.value = '';
    debouncedSearch.value = '';
    exitBatch();
    await router.replace('/noteLibrary');
    if (alreadyReset) await reloadNotes();
    await getAllTags();
  }

  onBeforeUnmount(() => {
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    noteRequestSeq += 1;
  });

  const viewNoteList = computed(() => noteList.value);

  watch(
    viewNoteList,
    (val) => {
      const visibleIds = new Set(val.map((note) => String(note.id)));
      noteList.value.forEach((note) => {
        if (!visibleIds.has(String(note.id))) note.isCheck = false;
      });
      visibleDragNoteList.value = [...val];
    },
    { immediate: true },
  );

  const visibleNoteTags = computed(() => {
    return allTags.value.filter((tag) => Number(tag.noteCount || 0) > 0);
  });

  const selectedVisibleCount = computed(() => viewNoteList.value.filter((data) => data.isCheck === true).length);
  // 桌面端复选框是进入批量模式的直接入口。复选框更新 note.isCheck 后必须同步页级模式，
  // 否则卡片虽然已选中，ResourcePageShell 的 actions 仍会继续显示普通操作栏。
  watch(
    selectedVisibleCount,
    (count) => {
      if (count > 0 && !batchMode.value) batchMode.value = true;
    },
    { flush: 'sync' },
  );
  const mobilePageActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'aiOrganize',
      label: t('bookmarkMg.aiOrganizeBtn'),
      icon: icon.ai.organize,
    },
    {
      key: 'batch',
      label: t(batchMode.value ? 'note.exitBatch' : 'inbox.mobileBatchSelect'),
      icon: icon.filterPanel.check,
    },
  ]);
  const mobileBatchActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'assistant',
      label: t('ai.entry.addSelectedToAssistant'),
      icon: icon.ai.materials,
      disabled: selectedVisibleCount.value < 1,
    },
    {
      key: 'smartOrganize',
      label: t('bookmarkMg.aiOrganizeBtn'),
      icon: icon.ai.organize,
      disabled: selectedVisibleCount.value < 1,
    },
    {
      key: 'addTags',
      label: t('note.batchAddTags'),
      icon: icon.manage_categoryBtn_tag,
      disabled: selectedVisibleCount.value < 1,
    },
    {
      key: 'removeTags',
      label: t('note.batchRemoveTags'),
      icon: icon.manage_categoryBtn_tag,
      disabled: selectedVisibleCount.value < 1,
    },
    ...(noteTreeWriteEnabled.value
      ? [
          {
            key: 'move',
            label: t('note.movePages'),
            icon: icon.noteTree.move,
            disabled: selectedVisibleCount.value < 1,
          },
        ]
      : []),
    {
      key: 'export',
      label: t('note.batchExport'),
      icon: icon.cloudSpace.download,
      disabled: selectedVisibleCount.value < 1,
    },
    {
      key: 'delete',
      label: t('note.deleteSelected'),
      icon: icon.noteDetail.delete,
      danger: true,
      disabled: selectedVisibleCount.value < 1,
    },
  ]);

  function openSelectedNotesAi(intent: AiAssistantIntent) {
    const checked = viewNoteList.value.filter((data: any) => data.isCheck === true);
    if (!checked.length) return;
    if (checked.length > 5) message.info(t('ai.materialLimit', { count: 5 }));
    const selected = checked.slice(0, 5);
    mobileBatchActionsOpen.value = false;
    openAiAssistant({
      surface: 'note_library',
      suggestedIntent: intent,
      contextRefs: selected.map((item: any) => ({
        type: 'note',
        id: String(item.id),
        title: String(item.title || ''),
      })),
    });
  }

  function openGlobalAiOrganize() {
    selectedAiOrganizeIds.value = [];
    aiOrgVisible.value = true;
  }

  function openSelectedAiOrganize() {
    const selectedIds = getSelectedNotes()
      .map((note) => String(note.id || '').trim())
      .filter(Boolean);
    if (!selectedIds.length) return;
    selectedAiOrganizeIds.value = selectedIds;
    mobileBatchActionsOpen.value = false;
    aiOrgVisible.value = true;
  }
  const allVisibleChecked = computed(
    () => viewNoteList.value.length > 0 && selectedVisibleCount.value === viewNoteList.value.length,
  );

  function toggleSelectAllVisible() {
    const nextChecked = !allVisibleChecked.value;
    viewNoteList.value.forEach((note) => {
      note.isCheck = nextChecked;
    });
  }

  function exitBatch() {
    mobileBatchActionsOpen.value = false;
    noteList.value.forEach((data) => {
      data.isCheck = false;
    });
    batchMode.value = false;
  }

  function enterBatch() {
    noteList.value.forEach((data) => {
      data.isCheck = false;
    });
    batchMode.value = true;
  }

  function handleMobilePageAction(action: MobilePageActionItem) {
    if (action.key === 'aiOrganize') {
      openGlobalAiOrganize();
    } else if (action.key === 'batch') {
      if (batchMode.value) exitBatch();
      else enterBatch();
    }
  }

  function openMobileDirectory(tab: 'directory' | 'tags') {
    mobileDirectoryInitialTab.value = tab === 'directory' && !noteTreeMobileEnabled.value ? 'tags' : tab;
    mobileDirectoryOpen.value = true;
    if (mobileDirectoryInitialTab.value === 'directory') {
      const metrics = noteTreeNodeMetrics(currentParentId.value);
      void recordNoteTreeProductEvent('note_tree_opened', {
        surface: 'mobile',
        ...metrics,
        result: 'success',
      });
      void recordNoteTreeProductEvent('note_tree_mobile_sheet_opened', {
        surface: 'mobile',
        ...metrics,
        result: 'success',
      });
    }
  }

  function selectMobileDirectoryTag(key: string) {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    if (key === 'all') delete query.tag;
    else query.tag = key;
    void router.push({ path: '/noteLibrary', query });
  }

  function handleMobileBatchAction(action: MobilePageActionItem) {
    if (action.key === 'assistant') openSelectedNotesAi('organize');
    else if (action.key === 'smartOrganize') openSelectedAiOrganize();
    else if (action.key === 'addTags') openBatchTags('add');
    else if (action.key === 'removeTags') openBatchTags('remove');
    else if (action.key === 'move') openBatchMove();
    else if (action.key === 'export') void exportSelectedNotes();
    else if (action.key === 'delete') batchDeleteNote();
  }

  function getSelectedNotes() {
    return viewNoteList.value.filter((data) => data.isCheck === true);
  }

  function openBatchTags(mode: 'add' | 'remove') {
    const selected = getSelectedNotes();
    if (!selected.length) return;
    sessionStorage.setItem(
      'resource-center-batch-items',
      JSON.stringify(selected.map((note) => ({ id: String(note.id), type: 'note', title: String(note.title || '') }))),
    );
    router.push({
      path: '/search/batch-tags',
      query: { mode, from: router.currentRoute.value.fullPath },
    });
  }

  async function exportSelectedNotes() {
    const selected = getSelectedNotes();
    if (!selected.length) return;
    const results = await Promise.allSettled(
      selected.map((note) => apiBasePost('/api/note/getNoteDetail', { id: String(note.id) }, { silent: true })),
    );
    const notes = results
      .filter((result) => result.status === 'fulfilled' && result.value.status === 200 && result.value.data)
      .map((result) => (result as PromiseFulfilledResult<any>).value.data);
    if (!notes.length) {
      message.error(t('note.batchExportFailed'));
      return;
    }
    const payload = {
      formatVersion: 2,
      backupKind: 'selected_notes_export',
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      notes,
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `lightnote-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(blobUrl);
    if (notes.length < selected.length) {
      message.warning(t('note.batchExportPartial', { count: notes.length, total: selected.length }));
    } else {
      message.success(t('note.batchExportSuccess', { count: notes.length }));
    }
  }

  async function batchDeleteNote() {
    if (blockGuestWrite('delete-note')) return;
    const selectedNotes = viewNoteList.value.filter((data) => data.isCheck);
    if (!selectedNotes.length) return;
    if (!noteTreeSubtreeTrashEnabled.value) {
      Alert.alert({
        title: t('common.defaultTitle'),
        content: t('note.deleteBatchTreeConfirm', { total: selectedNotes.length }),
        okText: t('note.moveItemsToTrash', { count: selectedNotes.length }),
        async onOk() {
          const res = await apiBasePost('/api/note/delNote', {
            ids: selectedNotes.map((note) => String(note.id)),
          });
          if (res.status === 409 && res.data?.code === 'NOTE_HAS_CHILDREN') {
            message.warning(res.msg || t('note.deleteScopeChanged'));
            return;
          }
          if (res.status !== 200) return;
          recordOperation({ module: '笔记库', operation: `批量删除笔记成功【${selectedNotes.length}篇】` });
          if (noteTreeReadEnabled.value) {
            void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
              surface: noteTreeSurface(),
              subtreeSize: selectedNotes.length,
              result: 'success',
            });
          }
          message.success(t('common.deleteSuccess'));
          exitBatch();
          await init();
        },
      });
      return;
    }
    let previews: NoteDeletePreview[];
    try {
      previews = await Promise.all(selectedNotes.map((note) => fetchNoteDeletePreview(note.id)));
    } catch (error) {
      console.warn('[note-library] batch delete preview failed', error);
      message.error(t('note.deletePreviewFailed'));
      return;
    }
    const scope = collapseNoteDeletePreviews(previews);
    if (!scope.items.length) return;
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.deleteBatchTreeConfirm', { total: scope.totalCount }),
      okText: t('note.moveItemsToTrash', { count: scope.totalCount }),
      async onOk() {
        const res = await apiBasePost('/api/note/deleteNoteSubtree', {
          items: scope.items.map((item) => ({
            id: item.id,
            expectedDescendantCount: item.descendantCount,
          })),
        });
        if (isDeleteScopeConflict(res)) {
          message.warning(t('note.deleteScopeChanged'));
          void batchDeleteNote();
          return;
        }
        if (res.status === 200) {
          const deletedCount = Number(res.data?.deletedCount || scope.totalCount);
          recordOperation({ module: '笔记库', operation: `批量删除笔记成功【${deletedCount}篇】` });
          void recordNoteTreeProductEvent('note_tree_subtree_deleted', {
            surface: noteTreeSurface(),
            subtreeSize: deletedCount,
            result: 'success',
          });
          message.success(t('common.deleteSuccess'));
          exitBatch();
          await init();
        }
      },
    });
  }

  const handleNodeTypeChange = (tag) => {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    if (tag === null) delete query.tag;
    else query.tag = String(tag.id);
    router.push({ path: '/noteLibrary', query });
  };

  function onStart() {
    document.body.style.userSelect = 'none';
    noteDragging.value = true;
  }

  function moveVisibleNoteInAllNotes(
    allNotes: any[],
    sortedVisibleNotes: any[],
    event?: { oldIndex?: number; newIndex?: number },
  ) {
    const oldIndex = Number(event?.oldIndex);
    const newIndex = Number(event?.newIndex);
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) {
      return allNotes;
    }

    const movedNote = Number.isInteger(newIndex) ? sortedVisibleNotes[newIndex] : null;
    if (!movedNote) {
      return allNotes;
    }

    const movedId = String(movedNote.id);
    const nextNotes = allNotes.filter((note: any) => String(note.id) !== movedId);
    const prevVisibleNote = sortedVisibleNotes[newIndex - 1];
    const nextVisibleNote = sortedVisibleNotes[newIndex + 1];

    if (prevVisibleNote) {
      const prevIndex = nextNotes.findIndex((note: any) => String(note.id) === String(prevVisibleNote.id));
      if (prevIndex >= 0) {
        nextNotes.splice(prevIndex + 1, 0, movedNote);
        return nextNotes;
      }
    }

    if (nextVisibleNote) {
      const nextIndex = nextNotes.findIndex((note: any) => String(note.id) === String(nextVisibleNote.id));
      if (nextIndex >= 0) {
        nextNotes.splice(nextIndex, 0, movedNote);
        return nextNotes;
      }
    }

    nextNotes.push(movedNote);
    return nextNotes;
  }

  async function onEnd(event?: { oldIndex?: number; newIndex?: number }) {
    document.body.style.userSelect = '';
    const sourceNotes = [...noteList.value];
    try {
      if (blockGuestWrite('reorder-note')) {
        visibleDragNoteList.value = [...viewNoteList.value]; // 拖拽库已就地改了 DOM 顺序,游客态复位视觉
        return;
      }

      const newIndex = Number(event?.newIndex);
      const movedNote = Number.isInteger(newIndex) ? visibleDragNoteList.value[newIndex] : null;
      const mergedNotes = moveVisibleNoteInAllNotes(sourceNotes, visibleDragNoteList.value, event);
      if (mergedNotes === sourceNotes || !movedNote) {
        visibleDragNoteList.value = [...viewNoteList.value];
        return;
      }
      // 置顶组始终位于普通组之前；组内仍保留用户刚完成的拖拽顺序。
      const groupedNotes = sortPinnedFirst(mergedNotes);
      const sameGroup = (item: any) => Boolean(item.isTop) === Boolean(movedNote.isTop);
      const beforeGroup = sortPinnedFirst(sourceNotes).filter(sameGroup);
      const afterGroup = groupedNotes.filter(sameGroup);
      if (!hasResourceOrderChanged(beforeGroup, afterGroup)) {
        visibleDragNoteList.value = [...viewNoteList.value];
        return;
      }

      const move = buildResourceSortMove(
        groupedNotes,
        String(movedNote.id),
        (candidate: any, target: any) => Boolean(candidate.isTop) === Boolean(target.isTop),
      );
      if (!move) {
        visibleDragNoteList.value = [...viewNoteList.value];
        return;
      }

      const res = await apiBasePost('/api/note/updateNoteSort', {
        move: { ...move, parentId: currentParentId.value },
      });
      if (res.status === 200) {
        noteList.value = groupedNotes;
        recordOperation({ module: '笔记库', operation: '调整笔记排序成功' });
      } else {
        visibleDragNoteList.value = [...viewNoteList.value];
      }
    } catch (error) {
      noteList.value = sourceNotes;
      visibleDragNoteList.value = [...viewNoteList.value];
      console.error('Error updating note sort:', error);
    } finally {
      noteDragging.value = false;
    }
  }
</script>

<style lang="less" scoped>
  .note-library-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .note-library-container {
    padding: 20px;
    width: 100%;
    height: 100%;
    border-top: 1px solid var(--notePage-topBody-border-color);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .note-library-header {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 60px;
    padding: 0 20px;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-content {
      display: flex;
      align-items: center;
      gap: 20px;
    }
  }
  .note-library-body {
    height: calc(100% - 20px);
    width: 100%;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--note-card-min-width, 320px), 1fr));
    column-gap: 24px;
    row-gap: 22px;
    overflow: auto;
    box-sizing: border-box;
    align-content: start;
    transition: opacity 180ms ease;

    :deep(.note-card) {
      transition:
        box-shadow 0.2s ease,
        border-color 0.2s ease,
        opacity 0.2s ease !important;
    }

    :deep(.note-card-drag-chosen) {
      box-shadow:
        0 14px 34px rgba(97, 92, 237, 0.18),
        0 4px 12px rgba(0, 0, 0, 0.12);
      border-color: var(--primary-color);
    }

    :deep(.note-card-drag-ghost) {
      opacity: 0.35;
      border: 1px dashed var(--primary-color);
      background: var(--category-item-ba-color);
      box-shadow: none;
    }

    :deep(.note-card-dragging) {
      opacity: 0.95;
      transform: rotate(1deg) scale(1.02);
      box-shadow:
        0 18px 40px rgba(97, 92, 237, 0.22),
        0 8px 20px rgba(0, 0, 0, 0.14);
    }
  }

  :global(.note-card-dragging) {
    opacity: 0.95;
    transform: rotate(1deg) scale(1.02);
    box-shadow:
      0 18px 40px rgba(97, 92, 237, 0.22),
      0 8px 20px rgba(0, 0, 0, 0.14);
  }

  .note-card-skeleton-wrap {
    grid-template-columns: repeat(auto-fill, minmax(var(--note-card-min-width, 320px), 1fr));
  }

  .note-card-skeleton,
  .note-list-skeleton-item {
    position: relative;
    overflow: hidden;
    background: var(--card-background);
  }

  .note-card-skeleton,
  .note-list-skeleton-item {
    border-radius: 12px;
    padding: 14px;
    box-sizing: border-box;
  }

  .note-card-skeleton {
    height: 282px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    box-shadow: none;
  }

  .skeleton-line {
    height: 12px;
    border-radius: 6px;
    background: rgba(120, 120, 120, 0.18);
    margin-bottom: 10px;
  }

  .skeleton-line.long {
    width: 88%;
  }

  .skeleton-line.medium {
    width: 72%;
  }

  .skeleton-line.short {
    width: 56%;
  }

  .skeleton-tags {
    position: absolute;
    left: 14px;
    bottom: 14px;
    display: flex;
    gap: 8px;
  }

  /* 列表项的 chip 行是随内容流排的(卡片那版 .skeleton-tags 绝对定位贴底,列表不能照搬:
     列表项高度由内容撑开,绝对定位不占高,骨架照样矮) */
  .skeleton-list-chips {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .skeleton-chip {
    width: 52px;
    height: 16px;
    border-radius: 8px;
    background: rgba(120, 120, 120, 0.18);
  }

  .note-card-skeleton::after,
  .note-list-skeleton-item::after {
    content: '';
    position: absolute;
    top: 0;
    left: -60%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
    animation: note-skeleton-shine 2s infinite;
  }

  @keyframes note-skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
  }

  .note-library-body-list {
    display: flex;
    height: calc(100% - 20px);
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    gap: 20px;
    transition: opacity 180ms ease;
    .note-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 10px;
    }

    .note-list-skeleton-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      padding: 0 10px;
      flex: 1;
    }

    .note-list-skeleton-item {
      /* 贴住真实列表项:padding 22 + 标题 22 + 摘要 38 + gap 4 + chip 22 ≈ 109(实测 109~111)。
         最后一条骨架线的 margin-bottom 由下面收掉,不然整项会比真实的高出一截。 */
      min-height: 108px;
      padding: 11px 14px;
      border: 1px solid var(--card-border-color);

      .skeleton-list-chips {
        margin-bottom: 0;
      }
    }
  }

  .back-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    height: 30px;
    width: 30px;
    cursor: pointer;
    border: 1px solid #e8eaf2;
  }
  .handle-btn-group {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .deleteText {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    color: #f54e4e;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(245, 78, 78, 0.1);
    transition: all 0.2s;
    &:hover {
      background: rgba(245, 78, 78, 0.2);
    }
  }
  .search-icon {
    overflow: hidden; // 防止因为padding变化导致动画开始时的错位问题
    height: 32px;
    width: 32px;
    border-radius: 16px;
    border-color: var(--card-border-color) !important;
    transition: all 0.3s;
    :deep(.b-input) {
      border-radius: 16px;
    }
  }
  .icon-input {
    :deep(.b-input) {
      padding: 0 !important;
      cursor: pointer;
    }
    :deep(.prefix-icon) {
      left: 8px;
    }
    :deep(.icon-base64) {
      transition: color 0.3s !important;
    }
    &:hover {
      :deep(.b-input) {
        border-color: var(--primary-color);
      }
      :deep(.icon-base64) {
        color: var(--primary-color) !important;
      }
    }
  }
  @media (max-width: 767px) {
    .note-library-container {
      min-width: 0;
      overflow-x: hidden;
    }

    .note-library-header {
      gap: 10px;
      padding: 0 12px;

      .header-content {
        min-width: 0;
        gap: 10px;

        > div:last-child {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .handle-btn-group {
        flex: 0 0 auto;
        gap: 6px;

        :deep(.noteType-select) {
          max-width: 112px;
          padding-inline: 8px;
        }
      }
    }

    .mobile-add-note-btn {
      padding-inline: 10px;
    }

    .note-library-body {
      margin-top: 40px;
      min-width: 0;
      max-width: 100%;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      padding: 12px;
    }

    .note-library-body > * {
      min-width: 0;
      max-width: 100%;
    }
  }

  .note-count-chip {
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .note-batch-summary {
    height: 32px;
    padding: 0 10px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .note-search {
    width: min(220px, 18vw);
  }

  .note-search :deep(.b-input) {
    height: 36px;
    border-radius: 10px;
  }

  .note-action-button {
    height: 36px;
    gap: 6px;
    border-radius: 10px;
  }

  .note-ai-button {
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, var(--menu-body-bg-color));
  }

  .note-mobile-actions {
    width: 100%;
    display: grid;
    /* 中间列按内容宽（图标态视图切换约 73px），两侧平分剩余，三个控件挤在同一行。
       原来是两等列，加进视图切换后第三个控件被顶到第二行，切换器还被拉满一整列留下大片空白。 */
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
  }

  .note-mobile-actions :deep(.noteType-select) {
    width: 100%;
    min-width: 0;
    justify-content: center;
  }

  .note-mobile-directory,
  .note-mobile-tag {
    min-width: 0;
    height: 36px;
    padding: 0 9px;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--menu-body-bg-color);
  }

  .note-mobile-directory {
    justify-content: flex-start;

    span {
      min-width: 0;
      overflow: hidden;
      color: var(--text-color);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.icon-base64:last-child) {
      margin-left: auto;
    }
  }

  .note-mobile-tag {
    white-space: nowrap;
  }

  .note-create-button {
    background: var(--resource-note-color, #00a884);
  }

  .note-create-button:hover {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 88%, #ffffff);
  }

  .note-sidebar-toggle {
    width: 36px;
    padding: 0;
    border: 1px solid var(--surface-border-color, var(--card-border-color));

    &.is-active {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }
  }

  .note-workspace {
    --note-card-min-width: 320px;
    --note-sidebar-panel-width: 248px;

    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
    container-type: inline-size;

    // 两列常驻,卡片视图把第一列收到 0:列数不变,侧栏进出才有宽度过渡可做。
    // 子项显式占列,移动端不渲染侧栏时主区也不会掉进第一列。
    display: grid;
    grid-template-columns: 0px minmax(0, 1fr);
    transition: grid-template-columns 300ms cubic-bezier(0.22, 0.61, 0.36, 1);

    &.is-split {
      grid-template-columns: var(--note-sidebar-panel-width) minmax(0, 1fr);
    }

    @supports (width: 1cqi) {
      // 以工作区宽度自适应:1470 左右保持可读卡宽,2560 左右自然落到 6 列。
      --note-card-min-width: clamp(320px, 15cqi, 460px);
    }
  }

  .note-sidebar-panel {
    grid-column: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    padding: 12px 0 12px 12px;
    border-right: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
  }

  .note-main-panel {
    grid-column: 2;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .note-directory-header {
    flex: 0 0 auto;
    padding: 12px 16px 11px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
  }

  .note-directory-breadcrumbs {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
  }

  .note-directory-crumb {
    min-width: 0;
    max-width: 180px;
    height: 24px;
    padding: 0 4px;
    overflow: hidden;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 12px;
    text-overflow: ellipsis;

    &.is-current {
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }
  }

  .note-directory-separator {
    flex: 0 0 auto;
    color: var(--muted-text-color, var(--desc-color));
    font-size: 11px;
  }

  .note-directory-title-row {
    min-width: 0;
    margin-top: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .note-directory-title-copy {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 9px;

    h2 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      color: var(--text-color);
      font-size: 18px;
      font-weight: 720;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      flex: 0 0 auto;
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .note-open-directory-page {
    height: 32px;
    flex: 0 0 auto;
    gap: 6px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 9px;
    color: var(--resource-note-color, #00a884);
    background: var(--menu-body-bg-color);
  }

  .note-directory-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .note-new-child-page {
    height: 32px;
    gap: 6px;
    border-radius: 9px;
  }

  @media (prefers-reduced-motion: reduce) {
    .note-workspace,
    .note-sidebar-panel,
    .note-library-body,
    .note-library-body-list {
      transition: none;
    }
  }

  .note-library-body {
    height: auto;
    flex: 1;
    min-height: 0;
    padding: 14px;
    grid-template-columns: repeat(auto-fill, minmax(var(--note-card-min-width), 1fr));
    gap: 14px;
    scrollbar-gutter: stable;
  }

  .note-library-body > * {
    min-width: 0;
    content-visibility: auto;
    contain-intrinsic-size: 282px;
  }

  .note-library-body-list {
    width: 100%;
    height: auto;
    flex: 1;
    min-height: 0;
    padding: 12px;
    gap: 0;
  }

  .note-library-body-list .note-list,
  .note-library-body-list .note-list-skeleton-wrap {
    width: 100%;
    // 右侧留出与滚动条的呼吸位,列表项不贴着滑块
    padding: 0 8px 0 4px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  /*
   * 手机端去掉这两层的横向内边距。
   * 卡片视图的容器是 0 padding，列表这边两层各留一点，列表项被内缩到 315px，
   * 比工具栏和卡片(都是 351px)窄 36px，左右都对不齐。触控端也没有占位滚动条，
   * 不需要给滑块留呼吸位。上面两条是全局规则(不在媒体查询里)，所以必须单独覆盖，
   * 不能直接改它们——那会连桌面一起改。
   */
  @media (max-width: 767px) {
    /* padding 归零而不只是去掉左右：卡片视图的容器是 0 padding，列表这边留 12px 上边距
       会让首项离工具栏 22px，比卡片的 10px 明显远一截。首项与工具栏的间隔由外层负责。 */
    .note-library-body-list {
      padding: 0;
    }

    .note-library-body-list .note-list,
    .note-library-body-list .note-list-skeleton-wrap {
      padding: 0;
    }
  }

  .note-empty-state {
    min-height: 0;
    flex: 1;
    padding: 56px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 9px;
    text-align: center;
    color: var(--desc-color);
  }

  .note-load-more {
    position: absolute;
    left: 50%;
    bottom: 12px;
    z-index: 3;
    transform: translateX(-50%);
    min-height: 30px;
    padding: 4px 10px;
    box-sizing: border-box;
    border-radius: 999px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--menu-body-bg-color) 92%, transparent);
    box-shadow: 0 8px 24px -18px color-mix(in srgb, var(--text-color) 45%, transparent);
    pointer-events: none;
  }

  .note-empty-state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .note-empty-state p {
    margin: 0 0 6px;
    font-size: 13px;
  }

  .note-empty-icon {
    width: 52px;
    height: 52px;
    margin-bottom: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
  }

  @media (max-width: 1200px) {
    .note-ai-button {
      font-size: 0;
      width: 36px;
      min-width: 36px;
      padding: 0;
    }

    .note-search {
      width: 180px;
    }
  }

  @media (max-width: 767px) {
    .note-count-chip {
      display: none;
    }

    .note-workspace {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }

    .note-library-body {
      height: 100%;
      margin-top: 0;
      padding: 0;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .note-action-button {
      height: 34px;
    }

    .note-batch-icon-button {
      width: 34px;
      min-width: 34px;
      padding: 0;
    }

    .note-mobile-actions .note-ai-button {
      width: 100%;
      min-width: 0;
      height: 36px;
      padding: 0 10px;
      justify-content: center;
      color: var(--text-color);
      background: var(--primary-btn-bg-color);
      font-size: 14px;
    }

    .note-mobile-actions .note-ai-button:hover,
    .note-mobile-actions .note-ai-button:active {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, var(--menu-body-bg-color));
    }
  }

  @media (min-width: 520px) and (max-width: 767px) {
    .note-library-body {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
