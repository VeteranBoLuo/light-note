<template>
  <ResourcePageShell
    :title="$t('note.title')"
    :subtitle="$t('note.subtitle')"
    accent="note"
    layout="workspace"
    compact-mobile-heading
    :title-actionable="!bookmark.isMobile"
    @title-click="handleNoteLibraryTitleClick"
  >
    <template #meta>
      <span class="note-count-chip">{{ $t('note.visibleCount', { total: noteTotal }) }}</span>
    </template>

    <template #actions>
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
            class="note-action-button note-ai-button"
            :disabled="!selectedVisibleCount"
            @click="openSelectedAiOrganize"
          >
            <SvgIcon :src="icon.ai.organize" size="16" />
            {{ $t('bookmarkMg.aiOrganizeBtn') }}
          </BButton>
          <BButton
            v-if="noteTreeWriteEnabled"
            class="note-action-button"
            :disabled="!selectedVisibleCount"
            @click="openBatchMove"
          >
            <SvgIcon :src="icon.noteTree.move" size="16" />
            {{ $t('note.movePages') }}
          </BButton>
          <BDropdown trigger="click" align="right" :menu-options="desktopBatchMoreOptions">
            <BButton
              class="note-action-button"
              :disabled="!selectedVisibleCount || batchExporting"
              :aria-label="$t('common.more')"
            >
              <SvgIcon :src="icon.common.more" size="16" />
              {{ $t('common.more') }}
            </BButton>
          </BDropdown>
          <BButton type="danger" class="note-action-button" :disabled="!selectedVisibleCount" @click="batchDeleteNote">
            <SvgIcon :src="icon.noteDetail.delete" size="16" />
            {{ $t('note.deleteSelected') }}
          </BButton>
          <BButton class="note-action-button" @click="exitBatch">{{ $t('note.exitBatch') }}</BButton>
        </template>
      </template>
      <template v-else>
        <div v-if="bookmark.isMobile" class="note-mobile-actions">
          <BButton
            v-if="!noteTreeFeaturesReady || noteTreeMobileEnabled"
            class="note-mobile-directory"
            :class="{ 'is-loading': !noteTreeFeaturesReady }"
            :disabled="!noteTreeFeaturesReady"
            :title="mobileScopeLabel"
            @click="openMobileDirectory"
          >
            <SvgIcon :src="currentParentId ? icon.resource.note : icon.noteTree.root" size="16" aria-hidden="true" />
            <span>{{ mobileScopeLabel }}</span>
            <SvgIcon :src="icon.noteTree.chevron" size="12" aria-hidden="true" />
          </BButton>
          <TagFilterSelector compact :all-tags="visibleNoteTags" @select="handleTagFilterSelect" />
          <ViewModeToggle compact />
        </div>
        <template v-else>
          <BButton
            v-if="noteTreeReadEnabled"
            type="primary"
            class="note-action-button note-create-button note-root-create-button"
            @click="showRootNotePicker"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
          >
            <SvgIcon :src="icon.common.add" size="16" />
            {{ $t('note.newNote') }}
          </BButton>
          <BButton class="note-action-button" @click="openTemplateManager">
            <SvgIcon :src="icon.noteDetail.template" size="16" />
            {{ $t('note.templateManager.title') }}
          </BButton>
          <ViewModeToggle />
          <TagFilterSelector :all-tags="visibleNoteTags" @select="handleTagFilterSelect" />
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
            v-if="!noteTreeReadEnabled && (!currentParentId || noteTreeWriteEnabled)"
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

    <NoteWorkspaceShell
      ref="noteWorkspaceRef"
      class="note-workspace"
      :mobile="bookmark.isMobile"
      :has-sidebar="showNoteWorkspaceSidebar"
      :has-ai="false"
      :sidebar-width="noteWorkspaceSidebarWidth"
      v-model:sidebar-open="noteSidebarExpanded"
      :sidebar-overlay-open="librarySidebarOverlayOpen"
      @update:sidebar-overlay-open="setLibrarySidebarOverlayOpen"
      @update:sidebar-width="noteWorkspace.setSidebarWidth($event)"
      @layout-change="handleLibraryLayoutChange"
      @scroll.capture.passive="onNoteScroll"
      @touchstart.passive="pullRefresh.onTouchStart"
      @touchmove="pullRefresh.onTouchMove"
      @touchend.passive="pullRefresh.onTouchEnd"
      @touchcancel.passive="pullRefresh.onTouchCancel"
    >
      <template #sidebar>
        <aside class="note-sidebar-panel">
          <NoteWorkspaceSidebar
            v-model:mode="librarySidebarMode"
            :current-parent-id="currentParentId"
            :active-page-id="previewNoteId"
            :browse-parent-id="currentParentId"
            surface="library"
            :children-by-parent="sidebarTreeChildrenByParent"
            :expanded-ids="sidebarTreeExpandedIds"
            :loading-keys="sidebarTreeLoadingKeys"
            :motion-expansion-ids="treeMotionExpansionIds"
            :tree-error="sidebarTreeError"
            :search-value="treeSearchValue"
            :directory-enabled="!noteTreeFeaturesReady || noteTreeReadEnabled"
            :outline-enabled="hasLibraryNoteContext"
            :write-enabled="noteTreeWriteEnabled"
            :drag-enabled="treeDragEnabled && !treeMovePending"
            :search-active="treeSearchActive"
            :search-loading="treeSearchLoading"
            :search-match-count="treeSearchMatchCount"
            :drop-target-key="dragDropTarget?.key || ''"
            :drop-target-active="dragDropTargetActive"
            :drop-target-position="dragDropTarget?.position || ''"
            :menu-disabled="noteDragging"
            @toggle="toggleTreeNode"
            @select="selectDirectory"
            @open="openLibraryNote"
            @browse-children="selectDirectory"
            @create="showNewChildPicker"
            @attach="openAttachPages"
            @toggle-top="toggleTreeNoteTop"
            @move="openMoveNote"
            @rename="openRenameNote"
            @share="openNoteShare"
            @delete="deleteSingleNote"
            @search="treeSearchValue = $event"
            @drag-start="onTreeDragStart"
            @drag-end="onTreeDragEnd"
          >
            <template #outline>
              <NoteOutlineList
                :headings="previewOutline"
                :active-index="previewActiveOutlineIndex"
                @select="selectPreviewOutline"
              />
            </template>
          </NoteWorkspaceSidebar>
        </aside>
      </template>

      <div class="note-main-panel">
        <NoteReadonlyPreview
          v-if="desktopPreviewOpen && previewNoteId"
          :note-id="previewNoteId"
          :seed="previewNoteSeed"
          :breadcrumb="previewBreadcrumb"
          :child-count="previewChildCount"
          :menu-options="previewMenuOptions"
          :outline-target="previewOutlineTarget"
          @close="closeDesktopPreview"
          @open-page="openPreviewBreadcrumbPage"
          @edit="openDirectoryPage(previewNoteId)"
          @browse-children="selectDirectory(previewNoteId)"
          @breadcrumb-resolved="handlePreviewBreadcrumbResolved"
          @detail-resolved="handlePreviewDetailResolved"
          @unavailable="handlePreviewUnavailable"
          @pending-state="syncPreviewNotePendingState"
          @outline-change="previewOutline = $event"
          @outline-active-change="previewActiveOutlineId = $event"
        />
        <header v-else-if="showDesktopDirectoryHeader" class="note-directory-header">
          <nav class="note-directory-breadcrumbs" :aria-label="$t('note.currentDirectory')">
            <BButton
              class="note-directory-crumb"
              :class="{
                'is-current': currentParentId === null,
                'is-drop-candidate': dragDropTarget?.key === NOTE_TREE_ROOT_KEY,
                'is-drop-target': dragDropTarget?.key === NOTE_TREE_ROOT_KEY && dragDropTargetActive,
                'is-drop-root-start':
                  dragDropTarget?.key === NOTE_TREE_ROOT_KEY && dragDropTarget?.position === 'root-start',
              }"
              :data-note-drop-parent="NOTE_TREE_ROOT_KEY"
              :data-note-drop-title="$t('note.knowledgeRoot')"
              @click="selectDirectory(null)"
            >
              {{ $t('note.knowledgeRoot') }}
            </BButton>
            <template v-for="item in currentBreadcrumb" :key="item.id">
              <span class="note-directory-separator" aria-hidden="true">/</span>
              <BButton
                class="note-directory-crumb"
                :class="{
                  'is-current': item.id === currentParentId,
                  'is-drop-candidate': dragDropTarget?.key === item.id && dragDropTarget?.position === 'inside',
                  'is-drop-target':
                    dragDropTarget?.key === item.id && dragDropTarget?.position === 'inside' && dragDropTargetActive,
                }"
                :data-note-drop-parent="item.id"
                :data-note-drop-title="item.title || $t('note.untitled')"
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
              <span v-else-if="currentParentId">{{ $t('note.directoryOrderHint', { count: noteTotal }) }}</span>
              <span v-else>{{ $t('note.rootDirectoryHint') }}</span>
            </div>
            <div class="note-directory-actions">
              <BButton
                v-if="currentParentId"
                class="note-open-directory-page"
                :loading="openingPageBodyId === currentParentId"
                @click="openPageBody(currentParentId)"
              >
                <SvgIcon :src="icon.noteTree.openPage" size="15" aria-hidden="true" />
                {{ $t('note.openPageBody') }}
              </BButton>
              <BButton
                v-if="currentParentId && noteTreeWriteEnabled"
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
        <BButton
          v-if="bookmark.isMobile && currentParentId"
          class="note-mobile-current-page-card"
          :loading="openingPageBodyId === currentParentId"
          @click="openPageBody(currentParentId)"
        >
          <span class="note-mobile-current-page-icon">
            <SvgIcon :src="icon.resource.note" size="18" aria-hidden="true" />
          </span>
          <span class="note-mobile-current-page-copy">
            <span class="note-mobile-current-page-label">{{ $t('note.currentPageShort') }}</span>
            <strong>{{ currentDirectoryTitle || $t('note.untitled') }}</strong>
          </span>
          <span class="note-mobile-current-page-action">{{ $t('note.openPageBody') }}</span>
          <SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
        </BButton>
        <div
          v-if="!desktopPreviewOpen && loading && currentViewMode === 'card'"
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
          v-else-if="!desktopPreviewOpen && currentViewMode === 'card' && visibleDragNoteList.length"
          v-auto-scrollbar
          :disabled="!canDragNote"
          :sort="false"
          :animation="200"
          v-model="visibleDragNoteList"
          class="note-library-body"
          data-mobile-resource-scroll
          @start="onStart"
          @move="onDragMove"
          @end="onEnd"
          ghost-class="note-card-drag-ghost"
          chosen-class="note-card-drag-chosen"
          drag-class="note-card-dragging"
          :scroll-sensitivity="50"
          :forceFallback="true"
          :touchStartThreshold="10"
          :delay="0"
          :fallback-tolerance="4"
        >
          <RightMenu
            v-for="note in visibleDragNoteList"
            :key="note.id"
            :data-note-sort-id="String(note.id)"
            :data-note-drop-parent="String(note.id)"
            :data-note-drop-title="note.title || $t('note.untitled')"
            :class="{
              'note-sort-item': true,
              'note-drop-candidate': dragDropTarget?.key === String(note.id) && dragDropTarget?.position === 'inside',
              'note-drop-target':
                dragDropTarget?.key === String(note.id) &&
                dragDropTarget?.position === 'inside' &&
                dragDropTargetActive,
            }"
            :menu="menuForNote(note)"
            @select="handleNoteMenuSelect($event, note)"
          >
            <note-card
              :note="note"
              :batch-mode="batchMode"
              :tree-read-enabled="noteTreeReadEnabled"
              :tree-write-enabled="noteTreeWriteEnabled"
              @open="openLibraryNote(note)"
              @open-parent="openLibraryNote"
              @nodeTypeChange="handleNodeTypeChange"
              @action="handleNoteCardAction($event, note)"
            />
          </RightMenu>
        </VueDraggable>
        <div
          v-if="!desktopPreviewOpen && currentViewMode === 'list' && (loading || visibleDragNoteList.length)"
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
            :sort="false"
            :animation="200"
            ref="el"
            v-model="visibleDragNoteList"
            class="note-list"
            data-mobile-resource-scroll
            @start="onStart"
            @move="onDragMove"
            @end="onEnd"
            :scroll-sensitivity="50"
            :forceFallback="true"
            :touchStartThreshold="10"
            :delay="0"
            :fallback-tolerance="4"
          >
            <RightMenu
              v-for="note in visibleDragNoteList"
              :key="note.id"
              :data-note-sort-id="String(note.id)"
              :data-note-drop-parent="String(note.id)"
              :data-note-drop-title="note.title || $t('note.untitled')"
              :class="{
                'note-sort-item': true,
                'note-drop-candidate': dragDropTarget?.key === String(note.id) && dragDropTarget?.position === 'inside',
                'note-drop-target':
                  dragDropTarget?.key === String(note.id) &&
                  dragDropTarget?.position === 'inside' &&
                  dragDropTargetActive,
              }"
              :menu="menuForNote(note)"
              @select="handleNoteMenuSelect($event, note)"
            >
              <note-list-item
                :note="note"
                :batch-mode="batchMode"
                :tree-read-enabled="noteTreeReadEnabled"
                :tree-write-enabled="noteTreeWriteEnabled"
                @open="openLibraryNote(note)"
                @open-parent="openLibraryNote"
                @nodeTypeChange="handleNodeTypeChange"
                @action="handleNoteCardAction($event, note)"
              />
            </RightMenu>
          </VueDraggable>
        </div>
        <div v-if="!desktopPreviewOpen && loadingMore" class="note-load-more">
          <BLoading inline loading :title="$t('common.loading')" />
        </div>
        <div v-if="!desktopPreviewOpen && !loading && !visibleDragNoteList.length" class="note-empty-state">
          <span class="note-empty-icon"><SvgIcon :src="icon.resource.note" size="28" /></span>
          <!-- 区分「搜索/标签筛选无命中」与「新用户没笔记」 -->
          <template v-if="hasActiveFilter">
            <strong>{{ $t('note.noFilterMatch') }}</strong>
            <BButton type="primary" class="note-create-button" @click="clearFilters">
              {{ $t('note.clearFilter') }}
            </BButton>
          </template>
          <template v-else-if="currentParentId">
            <strong>{{ $t('note.noSubpagesForCurrent') }}</strong>
            <p>{{ $t('note.noSubpagesHint', { title: currentDirectoryTitle || $t('note.untitled') }) }}</p>
            <div v-if="noteTreeWriteEnabled" class="note-empty-actions">
              <BButton type="primary" class="note-create-button" @click="showNewNotePicker">
                {{ $t('note.newChildPage') }}
              </BButton>
              <BButton
                v-if="currentDirectoryNode"
                class="note-attach-button"
                @click="openAttachPages(currentDirectoryNode)"
              >
                <SvgIcon :src="icon.noteTree.move" size="15" aria-hidden="true" />
                {{ $t('note.addExistingPages') }}
              </BButton>
            </div>
          </template>
          <template v-else>
            <strong>{{ $t('note.empty') }}</strong>
            <p>{{ $t('note.emptyHint') }}</p>
            <BButton type="primary" class="note-create-button" @click="showNewNotePicker">
              {{ $t('note.newNote') }}
            </BButton>
          </template>
        </div>
        <NoteTreeDropFeedback
          :visible="!desktopPreviewOpen && noteDragging && Boolean(dragDropTarget)"
          :ready="dragDropTargetActive"
          :text="dragDropHint"
        />
      </div>
    </NoteWorkspaceShell>

    <!-- 新建笔记类型选择 -->
    <NewNotePickerModal
      v-if="bookmark.isMobile && showTypePicker"
      v-model:visible="showTypePicker"
      :builtin-templates="orderedBuiltinTemplates"
      :my-templates="orderedMyTemplates"
      :my-templates-state="myTemplatesState"
      :template-icons="TEMPLATE_ICONS"
      @select-blank="handleMobileBlankSelection"
      @select-builtin="handleMobileBuiltinSelection"
      @select-mine="handleMobileTemplateSelection"
      @manage="openTemplateManager"
      @retry="loadMyTemplates"
    />
    <ActionCardModal
      v-if="!bookmark.isMobile && showTypePicker"
      v-model:visible="showTypePicker"
      :mask-closable="false"
      :title="$t('note.pickEditor')"
      width="min(760px, 80vw)"
      :sections="typePickerSections"
      :note="$t('note.pickEditorTip')"
    />
    <ActionCardModal
      v-if="batchExportModalVisible"
      v-model:visible="batchExportModalVisible"
      mask-closable
      :title="$t('note.batchExportTitle')"
      width="min(680px, 88vw)"
      :sections="batchExportSections"
      :note="$t('note.batchExportArchiveHint', { count: selectedVisibleCount })"
    />

    <!-- 智能打标签(笔记):自动为未打标签的笔记推荐标签 -->
    <AiOrganizeModal
      v-if="aiOrgVisible"
      v-model:visible="aiOrgVisible"
      init-type="note"
      :selected-ids="selectedAiOrganizeIds"
      @applied="init"
    />
    <NoteAiDialog v-model:visible="noteAiVisible" :notes="noteAiItems" />
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
    <NoteAttachPagesModal
      v-if="noteTreeWriteEnabled && activeAttachTarget"
      v-model:visible="attachPagesVisible"
      :target-note="activeAttachTarget"
      @attached="handlePagesAttached"
    />
    <NoteRenameModal
      v-if="activeRenameNote"
      v-model:visible="renameNoteVisible"
      :note="activeRenameNote"
      @renamed="handleNoteRenamed"
    />
    <NoteShareModal
      v-if="activeShareNote"
      v-model:visible="shareNoteVisible"
      :note="activeShareNote"
      @close="activeShareNote = null"
    />
    <NoteDirectoryDrawer
      v-if="bookmark.isMobile && mobileDirectoryMounted"
      v-model:open="mobileDirectoryOpen"
      :current-parent-id="currentParentId"
      :directory-enabled="noteTreeMobileEnabled"
      :write-enabled="noteTreeWriteEnabled"
      @select="selectDirectory"
      @open-page="openPageBody($event.id)"
      @create="showNewChildPicker"
      @attach="openAttachPages"
      @toggle-top="toggleTreeNoteTop"
      @move="openMoveNote"
      @share="openNoteShare"
      @delete="deleteSingleNote"
    />
    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileNoteActionsOpen"
      :object-title="String(activeMobileNote?.title || t('note.untitled'))"
      :actions="mobileNoteActions"
      @action="handleMobileNoteAction"
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
  import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, ref, watch } from 'vue';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useNoteLibraryCacheStore, useNoteWorkspaceStore, useUserStore } from '@/store';
  import { VueDraggable } from 'vue-draggable-plus';
  import NoteWorkspaceShell from '@/components/noteLibrary/workspace/NoteWorkspaceShell.vue';
  import NoteWorkspaceSidebar from '@/components/noteLibrary/workspace/NoteWorkspaceSidebar.vue';
  import NoteTreeDropFeedback from '@/components/noteLibrary/tree/NoteTreeDropFeedback.vue';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import NoteListItem from '@/components/noteLibrary/library/NoteListItem.vue';
  import TagFilterSelector from '@/components/noteLibrary/library/TagFilterSelector.vue';
  import NoteOutlineList from '@/components/noteLibrary/detail/NoteOutlineList.vue';
  import { preloadNoteEditorRuntime } from '@/components/noteLibrary/detail/editorRuntimeLoader';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import ViewModeToggle from '@/components/base/ViewModeToggle.vue';
  import { DEFAULT_NOTE_VIEW_MODE, getNoteParentOpenMode, shouldOpenNoteDirectly } from '@/utils/preferences.ts';
  import { hasMeaningfulNoteContent, shouldBrowseNoteChildrenOnOpen } from '@/utils/noteTree';
  import type { NoteWorkspaceLayoutState } from '@/utils/noteWorkspaceLayout';
  import { recordOperation } from '@/api/commonApi.ts';
  import {
    collapseNoteDeletePreviews,
    DISABLED_NOTE_TREE_FEATURES,
    fetchNoteDeletePreview,
    fetchNoteTreeFeatures,
    type NoteDeletePreview,
    type NoteTreeFeatures,
    type NoteTreeMoveResult,
  } from '@/api/noteTree';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';
  import {
    buildNoteDetailRequestScope,
    invalidateNoteDetailPrefetch,
    prefetchNoteDetail,
  } from '@/api/noteDetailPrefetch';
  import { BUILTIN_NOTE_TEMPLATES, pickTemplateLocale, sortBuiltinNoteTemplates } from '@/config/noteTemplates.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import RightMenu from '@/components/base/RightMenu.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import NoteAiDialog from '@/components/noteLibrary/library/NoteAiDialog.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { NOTE_TREE_ROOT_KEY, useNoteTree } from '@/composables/useNoteTree';
  import { useNoteTreeDragDrop } from '@/composables/useNoteTreeDragDrop';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { prefetchResolvedRoute } from '@/utils/routePrefetch';
  import { deliverExportViaAndroidBridge } from '@/utils/androidFileExport';
  import type { NoteBatchExportMode } from '@/utils/noteBatchExport';
  import {
    RESOURCE_LIST_PAGE_SIZE,
    isNearResourceScrollEnd,
    mergeResourcePage,
    mergeResourceRefreshedHead,
  } from '@/utils/resourcePagination';
  import { confirmNoteCreateShareExposure } from '@/utils/noteShareExposure';
  import AsyncFeatureLoadingOverlay from '@/components/base/AsyncFeatureLoadingOverlay.vue';
  import {
    NOTE_LIBRARY_FEATURES_FRESH_MS,
    NOTE_LIBRARY_LIST_FRESH_MS,
    NOTE_LIBRARY_TAGS_FRESH_MS,
    buildNoteLibraryListCacheKey,
    type NoteLibraryReturnScrollSnapshot,
  } from '@/store/noteLibraryCache';

  const createDeferredLibraryFeature = (loader: () => Promise<any>) =>
    defineAsyncComponent({
      loader,
      loadingComponent: AsyncFeatureLoadingOverlay,
      delay: 180,
      suspensible: false,
    });
  const NoteDirectoryDrawer = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/tree/NoteDirectoryDrawer.vue'),
  );
  const NoteAttachPagesModal = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/tree/NoteAttachPagesModal.vue'),
  );
  const NoteMoveModal = createDeferredLibraryFeature(() => import('@/components/noteLibrary/tree/NoteMoveModal.vue'));
  const NoteRenameModal = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/tree/NoteRenameModal.vue'),
  );
  const NoteShareModal = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/share/NoteShareModal.vue'),
  );
  const AiOrganizeModal = createDeferredLibraryFeature(
    () => import('@/components/manage/bookmarkMg/AiOrganizeModal.vue'),
  );
  const ActionCardModal = createDeferredLibraryFeature(() => import('@/components/base/ActionCardModal.vue'));
  const NewNotePickerModal = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/library/NewNotePickerModal.vue'),
  );
  const NoteReadonlyPreview = createDeferredLibraryFeature(
    () => import('@/components/noteLibrary/library/NoteReadonlyPreview.vue'),
  );
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
  const noteWorkspace = useNoteWorkspaceStore();
  const noteLibraryCache = useNoteLibraryCacheStore();
  const noteCacheScope = computed(() => buildNoteDetailRequestScope(user));
  const {
    detailTab,
    libraryPreviewPageId: previewNoteId,
    libraryRootEntryRequestToken,
    sidebarPreferredOpen: noteSidebarExpanded,
    sidebarWidth: noteWorkspaceSidebarWidth,
  } = storeToRefs(noteWorkspace);
  const librarySidebarOverlayOpen = ref(false);
  const libraryWorkspaceMode = ref<NoteWorkspaceLayoutState['mode'] | null>(null);

  function setLibrarySidebarOverlayOpen(value: boolean) {
    librarySidebarOverlayOpen.value = value;
  }

  function handleLibraryLayoutChange(layout: NoteWorkspaceLayoutState) {
    if (libraryWorkspaceMode.value && libraryWorkspaceMode.value !== layout.mode) {
      librarySidebarOverlayOpen.value = false;
    }
    libraryWorkspaceMode.value = layout.mode;
  }
  const initialFeatureSnapshot = noteLibraryCache.readFeatures(noteCacheScope.value);
  const noteTreeFeatures = ref<NoteTreeFeatures>({
    ...(initialFeatureSnapshot?.features || DISABLED_NOTE_TREE_FEATURES),
  });
  const noteTreeFeaturesReady = ref(Boolean(initialFeatureSnapshot));
  const noteTreeReadEnabled = computed(() => noteTreeFeatures.value.note_tree_read);
  const noteTreeWriteEnabled = computed(() => noteTreeFeatures.value.note_tree_write);
  const noteTreeMobileEnabled = computed(() => noteTreeReadEnabled.value && noteTreeFeatures.value.note_tree_mobile);
  const noteTreeSubtreeTrashEnabled = computed(
    () => noteTreeWriteEnabled.value && noteTreeFeatures.value.note_tree_subtree_trash,
  );
  // 目录能力快照返回前先按账号的目录偏好渲染同尺寸标题栏，避免首屏骨架整体下移。
  const showDesktopDirectoryHeader = computed(
    () => !bookmark.isMobile && (!noteTreeFeaturesReady.value || noteTreeReadEnabled.value),
  );
  // Store 在 setup 时已从 localStorage 同步恢复展开偏好；展开用户先占住最终侧栏宽度，折叠用户维持单栏。
  const showNoteWorkspaceSidebar = computed(
    () =>
      noteTreeReadEnabled.value ||
      (!bookmark.isMobile && desktopPreviewOpen.value) ||
      (!bookmark.isMobile && !noteTreeFeaturesReady.value && noteSidebarExpanded.value),
  );
  const isMediumNoteLayout = computed(() => bookmark.isTablet);
  const showNoteSidebar = computed(
    () => !bookmark.isMobile && (!isMediumNoteLayout.value || noteSidebarExpanded.value),
  );

  const { resetCurrentResourceScroll } = useMobileNavigationState();
  const { addResourcesToInbox, removeResourcesFromInbox } = useInboxEnqueue();
  const {
    childrenByParent,
    currentBreadcrumb,
    currentDirectoryTitle,
    currentParentId,
    expandedIds,
    loadingKeys: treeLoadingKeys,
    loadBreadcrumb,
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
    const requestScope = noteCacheScope.value;
    let next = { ...DISABLED_NOTE_TREE_FEATURES } as NoteTreeFeatures;
    try {
      next = await fetchNoteTreeFeatures();
    } catch {
      // 前端先于后端发布、网络异常或灰度接口不可用时失败关闭；普通平铺笔记库仍可使用。
    }
    if (requestScope !== noteCacheScope.value) return;
    noteTreeFeatures.value = next;
    noteLibraryCache.writeFeatures(requestScope, next);
    if (!next.note_tree_read) {
      const query = { ...router.currentRoute.value.query };
      if (Object.prototype.hasOwnProperty.call(query, 'parent')) {
        delete query.parent;
        delete query._rt;
        await router.replace({ path: '/noteLibrary', query });
      }
    }
    noteTreeFeaturesReady.value = true;
  }

  if (!initialFeatureSnapshot || Date.now() - initialFeatureSnapshot.updatedAt > NOTE_LIBRARY_FEATURES_FRESH_MS) {
    void loadNoteTreeFeatureSnapshot();
  }
  watch(noteCacheScope, (scope, previousScope) => {
    if (!previousScope || scope === previousScope) return;
    const cached = noteLibraryCache.readFeatures(scope);
    noteTreeFeatures.value = { ...(cached?.features || DISABLED_NOTE_TREE_FEATURES) };
    noteTreeFeaturesReady.value = Boolean(cached);
    if (!cached || Date.now() - cached.updatedAt > NOTE_LIBRARY_FEATURES_FRESH_MS) {
      void loadNoteTreeFeatureSnapshot();
    }
  });
  const noteList = ref<any[]>([]);
  const visibleDragNoteList = ref<any[]>([]);
  const openingNoteId = ref('');
  // 首次列表请求要等待目录功能开关快照；默认进入加载态，避免请求启动前短暂误显空状态。
  const loading = ref(true);
  const loadingMore = ref(false);
  // 只切标签时走软刷新:保留旧列表并降透明度,不整屏换骨架屏
  const refreshing = ref(false);
  const initialTagSnapshot = noteLibraryCache.readTags(noteCacheScope.value);
  const noteTotal = ref(0);
  const notePage = ref(0);
  const noteHasMore = ref(false);
  const treeMotionExpansionIds = ref<Set<string>>(new Set());
  const treeMotionCleanupTimers = new Map<string, number>();
  const searchValue = ref('');
  const treeSearchValue = ref('');
  const debouncedSearch = ref('');
  const searchTimer = ref<number | null>(null);
  const treeSearchTimer = ref<number | null>(null);
  const treeSearchActive = computed(() => noteTreeReadEnabled.value && Boolean(treeSearchKeyword.value.trim()));
  const sidebarTreeChildrenByParent = computed(() =>
    treeSearchActive.value ? treeSearchChildrenByParent.value : childrenByParent.value,
  );
  const sidebarTreeExpandedIds = computed(() =>
    treeSearchActive.value ? treeSearchExpandedIds.value : expandedIds.value,
  );
  const sidebarTreeLoadingKeys = computed(() => {
    if (!noteTreeFeaturesReady.value && showNoteWorkspaceSidebar.value) {
      return new Set([NOTE_TREE_ROOT_KEY]);
    }
    if (treeSearchActive.value && treeSearchLoading.value) return new Set([NOTE_TREE_ROOT_KEY]);
    if (treeSearchActive.value) return new Set<string>();
    return treeLoadingKeys.value;
  });
  const sidebarTreeError = computed(() => (treeSearchActive.value ? treeSearchError.value : treeError.value));
  const treeDragEnabled = computed(() => !bookmark.isMobile && noteTreeWriteEnabled.value && !treeSearchActive.value);
  const {
    beginPointerDrag,
    completePointerDrag,
    dragDropHint,
    dragDropTarget,
    dragDropTargetActive,
    moveNoteIntoTarget,
    noteDragging,
    onTreeDragEnd,
    onTreeDragStart,
    resolveDropTargetAtPoint,
    scheduleDragDropTarget,
    takePointerDropSnapshot,
    treeMovePending,
  } = useNoteTreeDragDrop({
    enabled: treeDragEnabled,
    childrenByParent,
    visibleChildrenByParent: sidebarTreeChildrenByParent,
    t,
    getScrollElement: noteTreeScrollElement,
    getSourceParentId(sourceId) {
      const source = noteList.value.find((item) => String(item.id) === sourceId);
      if (!source) return undefined;
      return source.parentId ? String(source.parentId) : null;
    },
    canCommit: () => !blockGuestWrite('move-note'),
    async onMoveConfirmed({ sourceId, result }) {
      noteLibraryCache.invalidateMovedNoteLists(noteCacheScope.value, result);
      const shouldRefreshBreadcrumb = currentBreadcrumb.value.some((item) => item.id === sourceId);
      if (shouldRefreshBreadcrumb) noteWorkspace.invalidateBreadcrumbBranch(sourceId);
      await Promise.all([
        reloadNotes(),
        shouldRefreshBreadcrumb ? loadBreadcrumb(currentParentId.value) : Promise.resolve(),
      ]);
    },
    logLabel: 'note-library',
  });
  let noteRequestSeq = 0;
  const showTypePicker = ref(false);
  const createParentOverride = ref<string | null | undefined>(undefined);
  const aiOrgVisible = ref(false); // 智能打标签(笔记)弹框
  const selectedAiOrganizeIds = ref<string[]>([]);
  const tagConfigVisible = ref(false);
  const activeTagNote = ref<any | null>(null);
  const activeMoveNote = ref<any | null>(null);
  const activeMoveNotes = ref<any[]>([]);
  const moveNoteVisible = ref(false);
  const activeAttachTarget = ref<{ id: string; title?: string } | null>(null);
  const attachPagesVisible = ref(false);
  const activeRenameNote = ref<{ id: string; title?: string; revision?: number } | null>(null);
  const renameNoteVisible = ref(false);
  const batchMode = ref(false);
  const batchExportModalVisible = ref(false);
  const batchExporting = ref(false);
  const mobilePageActionsOpen = ref(false);
  const mobileNoteActionsOpen = ref(false);
  const activeMobileNote = ref<any | null>(null);
  const mobileBatchActionsOpen = ref(false);
  const mobileDirectoryOpen = ref(false);
  // 首次打开仍然懒加载；之后保持实例挂载。抽屉关闭会先释放移动端 history 占位，
  // 若随 open=false 立即卸载，子组件稍后派发的目录 select 会被 Vue 丢弃。
  const mobileDirectoryMounted = ref(false);
  const previewNoteSeed = ref<Record<string, any> | null>(null);
  interface PreviewOutlineItem {
    id?: string;
    text: string;
    level: number;
  }
  interface PreviewBreadcrumbTarget {
    id: string;
    title?: string;
  }
  interface PreviewBreadcrumbResolution {
    noteId: string;
    items: PreviewBreadcrumbTarget[];
  }
  interface PreviewDetailResolution {
    noteId: string;
    detail: Record<string, any>;
  }
  const previewOutline = ref<PreviewOutlineItem[]>([]);
  const previewActiveOutlineId = ref<string | null>(null);
  const previewOutlineTarget = ref<{ id: string; requestId: number } | null>(null);
  const openingPageBodyId = ref('');
  let previewOutlineRequestId = 0;
  let previewPendingLocallyChanged = false;
  let previewSeedScope = '';
  let pendingPreviewPathId = '';
  const desktopPreviewOpen = computed(() => !bookmark.isMobile && Boolean(previewNoteId.value));
  const previewBreadcrumb = computed(() =>
    previewNoteId.value ? noteWorkspace.breadcrumbByNote[previewNoteId.value] || [] : [],
  );
  const hasLibraryNoteContext = computed(() => desktopPreviewOpen.value || Boolean(currentParentId.value));
  const librarySidebarMode = computed<'directory' | 'outline'>({
    get: () => (hasLibraryNoteContext.value && detailTab.value === 'outline' ? 'outline' : 'directory'),
    set: (value) => {
      if (!hasLibraryNoteContext.value) return;
      detailTab.value = value === 'outline' ? 'outline' : 'pages';
      if (value === 'outline' && !desktopPreviewOpen.value && currentParentId.value) {
        openCurrentDirectoryOutline(currentParentId.value);
      }
    },
  });
  const previewActiveOutlineIndex = computed(() => {
    if (!previewActiveOutlineId.value) return null;
    const index = previewOutline.value.findIndex((heading) => heading.id === previewActiveOutlineId.value);
    return index >= 0 ? index : null;
  });

  function selectPreviewOutline(index: number) {
    const headingId = previewOutline.value[index]?.id;
    if (!headingId) return;
    previewActiveOutlineId.value = headingId;
    previewOutlineTarget.value = { id: headingId, requestId: ++previewOutlineRequestId };
  }
  const previewChildCount = computed(() => {
    const noteId = String(previewNoteId.value || '').trim();
    const loadedNode = noteId ? findLoadedTreeNode(noteId) : null;
    return Math.max(0, Number(previewNoteSeed.value?.childCount || 0), Number(loadedNode?.childCount || 0));
  });
  interface DesktopPreviewScrollSnapshot {
    top: number;
    left: number;
    viewMode: string;
  }
  let desktopPreviewScrollSnapshot: DesktopPreviewScrollSnapshot | null = null;
  const MOBILE_RETURN_SCROLL_RETRY_DELAYS = [80, 240, 640] as const;
  const mobileReturnScrollRestoreTimers = new Set<number>();
  let mobileReturnScrollRestoreRequestId = 0;
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
    const targetQuery = { ...query };
    const requestedParentId =
      createParentOverride.value === undefined ? currentParentId.value : createParentOverride.value;
    const parentId = noteTreeWriteEnabled.value ? requestedParentId : null;
    if (parentId) {
      targetQuery.parent = parentId;
      try {
        const exposureDecision = await confirmNoteCreateShareExposure(parentId);
        if (exposureDecision === false) return;
        if (exposureDecision === true) targetQuery.shareExposureAcknowledged = 'true';
      } catch {
        message.error(t('noteShare.manageFailed'));
        return;
      }
    }
    const usageKey = query.builtin ? `builtin:${query.builtin}` : query.templateId ? `mine:${query.templateId}` : '';
    if (usageKey) {
      templateUsage.value = { ...templateUsage.value, [usageKey]: Date.now() };
      localStorage.setItem('note-template-recent-usage', JSON.stringify(templateUsage.value));
    }
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
  const orderedBuiltinTemplates = computed(() => sortBuiltinNoteTemplates(BUILTIN_NOTE_TEMPLATES, templateUsage.value));
  const orderedMyTemplates = computed(() =>
    [...myTemplates.value].sort(
      (a, b) => Number(templateUsage.value[`mine:${b.id}`] || 0) - Number(templateUsage.value[`mine:${a.id}`] || 0),
    ),
  );
  const templateTypeTag = (type: string) => (type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml'));
  const manageTemplateHeaderAction = computed(() => ({
    label: t('note.templateManager.title'),
    icon: icon.noteDetail.template,
    onClick: openTemplateManager,
  }));
  // "我的模板"区按状态渲染:加载/空态给提示行(hint),失败给可点重试卡,成功给模板卡
  const myTemplateSection = computed(() => {
    if (myTemplatesState.value === 'error') {
      return {
        key: 'mine',
        title: t('note.tplMineSection'),
        headerAction: manageTemplateHeaderAction.value,
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
        headerAction: manageTemplateHeaderAction.value,
        actions: orderedMyTemplates.value.map((tpl) => ({
          key: tpl.id,
          label: tpl.name,
          description: tpl.description || '',
          tag: templateTypeTag(tpl.type),
          onClick: () => gotoNewNote({ type: tpl.type, templateId: tpl.id }),
        })),
      };
    }
    return {
      key: 'mine',
      title: t('note.tplMineSection'),
      headerAction: manageTemplateHeaderAction.value,
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
          {
            key: 'drawing',
            label: t('note.drawingLabel'),
            description: t('note.drawingDesc'),
            onClick: () => gotoNewNote({ type: 'drawing' }),
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

  function showRootNotePicker() {
    createParentOverride.value = null;
    showTypePicker.value = true;
    loadMyTemplates();
  }

  function showNewChildPicker(note: any) {
    if (!noteTreeWriteEnabled.value || !note?.id) return;
    createParentOverride.value = String(note.id);
    showTypePicker.value = true;
    loadMyTemplates();
  }

  async function openTemplateManager() {
    await closeCurrentMobileOverlayThen(
      () => {
        showTypePicker.value = false;
        mobilePageActionsOpen.value = false;
      },
      () => router.push('/noteLibrary/templates'),
    );
  }

  function openAttachPages(note: any) {
    if (!noteTreeWriteEnabled.value || blockGuestWrite('move-note')) return;
    const id = String(note?.id || '').trim();
    if (!id) return;
    activeAttachTarget.value = { id, title: String(note?.title || '') };
    attachPagesVisible.value = true;
  }

  function handleMobileBlankSelection(type: 'html' | 'markdown' | 'drawing') {
    gotoNewNote({ type });
  }

  function handleMobileBuiltinSelection(template: { key: string; type: 'html' | 'markdown' }) {
    gotoNewNote({ type: template.type, builtin: template.key });
  }

  function handleMobileTemplateSelection(template: { id: string; type: string }) {
    gotoNewNote({ type: template.type, templateId: template.id });
  }

  function syncNotePendingState(noteId: string | null, isPending: boolean) {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId) return;
    const pending = Boolean(isPending);
    noteList.value.forEach((item) => {
      if (String(item?.id || '') === normalizedId) item.isPending = pending;
    });
    if (String(previewNoteSeed.value?.id || '') === normalizedId) previewNoteSeed.value!.isPending = pending;
    if (String(activeMobileNote.value?.id || '') === normalizedId) activeMobileNote.value!.isPending = pending;
    noteLibraryCache.updateNotePendingState(noteCacheScope.value, normalizedId, pending);
  }

  function syncPreviewNotePendingState(isPending: boolean) {
    // 详情请求可能早于用户点击切换、却晚于写请求返回。发生过本地切换后忽略旧详情回包，
    // 下次打开会因预取已失效而重新读取服务端权威状态。
    if (previewPendingLocallyChanged) return;
    syncNotePendingState(previewNoteId.value, isPending);
  }

  const togglingInboxIds = new Set<string>();
  async function toggleNoteInbox(note: any) {
    const noteId = String(note?.id || '').trim();
    if (!noteId || togglingInboxIds.has(noteId)) return;
    togglingInboxIds.add(noteId);
    const wasPending = Boolean(note.isPending);
    const resource = [{ resourceType: 'note' as const, resourceId: noteId }];
    try {
      const ok = wasPending
        ? await removeResourcesFromInbox(resource, '笔记库')
        : await addResourcesToInbox(resource, '笔记库');
      if (!ok) return;
      if (previewNoteId.value === noteId) previewPendingLocallyChanged = true;
      syncNotePendingState(noteId, !wasPending);
      // 预览可能已经把旧状态写进详情预取；切换后失效，进入编辑页时读取服务端权威状态。
      invalidateNoteDetailPrefetch(user, noteId);
    } finally {
      togglingInboxIds.delete(noteId);
    }
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
      { key: 'aiSummary', label: t('note.aiSummarize'), icon: icon.ai.summary },
      ...(noteTreeWriteEnabled.value
        ? [
            { key: 'createChild', label: t('note.newChildPage'), icon: icon.common.add },
            { key: 'attach', label: t('note.addExistingPages'), icon: icon.noteTree.move },
            { key: 'move', label: t('note.moveThisPage'), icon: icon.noteTree.move },
          ]
        : []),
      { key: 'share', label: t('noteShare.shareAction'), icon: icon.share },
      { key: 'note-actions-divider', divider: true },
      { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
    ];
  }

  const previewMenuOptions = computed(() => {
    const note = previewNoteSeed.value;
    if (!note) return [];
    return menuForNote(note).map((item: any) =>
      item.divider
        ? item
        : {
            ...item,
            function: () => handleNoteMenuSelect(item.key, note),
          },
    );
  });

  const togglingTopIds = new Set<string>();

  async function toggleNoteTop(note: any) {
    if (blockGuestWrite('pin-note')) return;
    const noteId = String(note?.id || '');
    if (!noteId || togglingTopIds.has(noteId)) return;
    togglingTopIds.add(noteId);
    try {
      const res = await apiBasePost('/api/note/toggleNoteTop', { id: noteId });
      if (res.status !== 200) return;
      note.isTop = Boolean(res.data?.isTop);
      // 卡片、列表和左侧页面树共享同一排序语义。先同步已缓存树避免视觉停留在旧顺序，
      // 再并行读取服务端权威列表与目录，覆盖搜索树和尚未加载的展开分支。
      noteWorkspace.updateNoteMetadata(noteId, { isTop: note.isTop });
      await Promise.all([reloadNotes(), refreshTree()]);
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

  function toggleTreeNoteTop(note: any) {
    return toggleNoteTop(note);
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
    detailTab.value = 'pages';
    closeDesktopPreview(false);
    void recordNoteTreeProductEvent('note_tree_branch_selected', {
      surface: noteTreeSurface(),
      ...noteTreeNodeMetrics(noteId),
      result: 'success',
    });
    return selectTreeDirectory(noteId);
  }

  function findNoteForWarmup(noteId: string) {
    return noteList.value.find((item) => String(item.id) === noteId) || findLoadedTreeNode(noteId);
  }

  function clearDesktopPreviewLocalState() {
    previewPendingLocallyChanged = false;
    previewOutline.value = [];
    previewActiveOutlineId.value = null;
    previewOutlineTarget.value = null;
    previewNoteSeed.value = null;
    previewSeedScope = '';
    pendingPreviewPathId = '';
  }

  function applyDesktopPreviewLocalState(noteId: string, source: Record<string, any>) {
    previewPendingLocallyChanged = false;
    previewOutline.value = [];
    previewActiveOutlineId.value = null;
    previewOutlineTarget.value = null;
    previewNoteSeed.value = { ...source, id: noteId };
    previewSeedScope = noteCacheScope.value;
    pendingPreviewPathId = '';
  }

  function setDesktopPreviewPage(noteId: string, source: Record<string, any>) {
    applyDesktopPreviewLocalState(noteId, source);
    noteWorkspace.setLibraryPreviewPage(noteId);
  }

  function handlePreviewBreadcrumbResolved(payload: PreviewBreadcrumbResolution) {
    const noteId = String(payload?.noteId || '').trim();
    if (!noteId || noteId !== previewNoteId.value) return;
    if (!payload.items.length && !noteTreeReadEnabled.value) {
      pendingPreviewPathId = noteTreeFeaturesReady.value ? '' : noteId;
      return;
    }
    pendingPreviewPathId = '';
    void noteWorkspace.revealNotePath(noteId, payload.items);
  }

  function handlePreviewDetailResolved(payload: PreviewDetailResolution) {
    const noteId = String(payload?.noteId || '').trim();
    if (!noteId || noteId !== previewNoteId.value) return;
    const previousPending = previewNoteSeed.value?.isPending;
    const nextSeed = { ...(previewNoteSeed.value || {}), ...(payload.detail || {}), id: noteId };
    if (previewPendingLocallyChanged && previousPending !== undefined) nextSeed.isPending = previousPending;
    previewNoteSeed.value = nextSeed;
    previewSeedScope = noteCacheScope.value;
    noteWorkspace.updateNoteMetadata(noteId, {
      title: String(payload.detail?.title || ''),
      type: String(payload.detail?.type || 'html'),
      hasContent: hasMeaningfulNoteContent(payload.detail?.content || '', payload.detail?.type),
    });
  }

  function handlePreviewUnavailable(noteId: string) {
    if (String(noteId || '').trim() !== previewNoteId.value) return;
    closeDesktopPreview(false);
  }

  function openCurrentDirectoryOutline(noteId: string) {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId || bookmark.isMobile || desktopPreviewOpen.value) return;
    const source = findNoteForWarmup(normalizedId) || { id: normalizedId };
    prefetchNoteDetail(user, normalizedId);
    captureDesktopPreviewScroll();
    setDesktopPreviewPage(normalizedId, source);
  }

  function openPreviewBreadcrumbPage(page: PreviewBreadcrumbTarget) {
    const noteId = String(page?.id || '').trim();
    if (!desktopPreviewOpen.value || !noteId || noteId === previewNoteId.value) return;
    const source = findNoteForWarmup(noteId) || page;
    prefetchNoteDetail(user, noteId);
    // 面包屑是在当前阅读链路中切换页面，不重新记录列表滚动位置；退出预览后仍回到最初打开处。
    setDesktopPreviewPage(noteId, source);
    void recordNoteTreeProductEvent('note_tree_page_opened', {
      surface: 'desktop',
      ...noteTreeNodeMetrics(noteId),
      result: 'success',
    });
  }

  async function openDirectoryPage(noteId: string) {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId || openingNoteId.value) return;
    void recordNoteTreeProductEvent('note_tree_page_opened', {
      surface: noteTreeSurface(),
      ...noteTreeNodeMetrics(normalizedId),
      result: 'success',
    });
    if (!bookmark.isMobile) return openTreeDirectoryPage(normalizedId);

    openingNoteId.value = normalizedId;
    prefetchNoteDetail(user, normalizedId);
    // 详情预取先启动，随后只做一次同步滚动读数；不监听 scroll，也不阻塞路由导航。
    captureMobileReturnScroll();
    // 直接提交路由，让详情页真实顶栏先接管画面；编辑器运行时使用正文区域自己的骨架。
    // 这里不能再盖一层 fixed 整页骨架，否则路由或接口稍慢时会把真实详情布局全部遮住。
    void prefetchResolvedRoute(router, { name: 'noteDetail', params: { id: normalizedId } }).catch(() => {
      // 正式导航会复用或重试路由加载，并由详情页呈现错误状态。
    });
    const source = findNoteForWarmup(normalizedId);
    void preloadNoteEditorRuntime(source?.type).catch(() => {
      // 编辑器异步组件挂载时仍会重试。
    });
    try {
      return await openTreeDirectoryPage(normalizedId);
    } finally {
      openingNoteId.value = '';
    }
  }

  async function openPageBody(noteId: string) {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId || openingPageBodyId.value) return;
    openingPageBodyId.value = normalizedId;
    const source = findNoteForWarmup(normalizedId) || { id: normalizedId };
    try {
      const response = await prefetchNoteDetail(user, normalizedId);
      if (response?.status !== 200 || !response.data) return openDirectoryPage(normalizedId);

      const hasContent = hasMeaningfulNoteContent(response.data.content, response.data.type || source.type);
      source.hasContent = hasContent;
      noteWorkspace.updateNoteMetadata(normalizedId, {
        title: String(response.data.title || source.title || ''),
        type: String(response.data.type || source.type || 'html'),
        hasContent,
      });
      if (!hasContent || bookmark.isMobile) return openDirectoryPage(normalizedId);

      captureDesktopPreviewScroll();
      setDesktopPreviewPage(normalizedId, {
        ...source,
        ...response.data,
        childCount: Math.max(0, Number(source.childCount || 0)),
        hasContent,
      });
      void recordNoteTreeProductEvent('note_tree_page_opened', {
        surface: 'desktop',
        ...noteTreeNodeMetrics(normalizedId),
        result: 'success',
      });
    } catch {
      return openDirectoryPage(normalizedId);
    } finally {
      openingPageBodyId.value = '';
    }
  }

  function openLibraryNote(noteOrId: any) {
    const noteId = String(typeof noteOrId === 'string' ? noteOrId : noteOrId?.id || '').trim();
    if (!noteId) return;
    const source = (typeof noteOrId === 'object' && noteOrId) ||
      noteList.value.find((item) => String(item.id) === noteId) ||
      findLoadedTreeNode(noteId) || { id: noteId };
    const parentOpenMode = getNoteParentOpenMode(user.preferences, bookmark.isMobile);
    if (shouldBrowseNoteChildrenOnOpen(source, parentOpenMode, noteTreeReadEnabled.value)) {
      return selectDirectory(noteId);
    }
    // 父页面的显式“预览当前页面”偏好优先于“点击笔记直接编辑”，且不再依赖正文是否为空。
    if (Math.max(0, Number(source.childCount) || 0) > 0 && parentOpenMode === 'preview') {
      prefetchNoteDetail(user, noteId);
      captureDesktopPreviewScroll();
      setDesktopPreviewPage(noteId, source);
      void recordNoteTreeProductEvent('note_tree_page_opened', {
        surface: 'desktop',
        ...noteTreeNodeMetrics(noteId),
        result: 'success',
      });
      return;
    }
    if (shouldOpenNoteDirectly(user.preferences, bookmark.isMobile)) {
      // 移动端的 openDirectoryPage 已经负责详情与当前编辑器预热；PC 直达编辑时在跳转前补齐同样的暖机。
      if (!bookmark.isMobile) {
        prefetchNoteDetail(user, noteId);
        void preloadNoteEditorRuntime(source?.type).catch(() => {
          // 编辑器异步组件挂载时仍会重试。
        });
      }
      return openDirectoryPage(noteId);
    }
    prefetchNoteDetail(user, noteId);
    captureDesktopPreviewScroll();
    setDesktopPreviewPage(noteId, source);
    void recordNoteTreeProductEvent('note_tree_page_opened', {
      surface: 'desktop',
      ...noteTreeNodeMetrics(noteId),
      result: 'success',
    });
  }

  function closeDesktopPreview(restoreScroll = true) {
    const snapshot = restoreScroll ? desktopPreviewScrollSnapshot : null;
    desktopPreviewScrollSnapshot = null;
    clearDesktopPreviewLocalState();
    noteWorkspace.setLibraryPreviewPage(null);
    if (snapshot) void restoreDesktopPreviewScroll(snapshot);
  }

  watch(
    [previewNoteId, () => bookmark.isMobile, noteCacheScope],
    ([noteId, isMobile, scope]) => {
      const normalizedId = String(noteId || '').trim();
      if (!normalizedId) {
        if (previewNoteSeed.value) clearDesktopPreviewLocalState();
        return;
      }
      if (isMobile) {
        if (String(previewNoteSeed.value?.id || '') !== normalizedId || previewSeedScope !== scope) {
          clearDesktopPreviewLocalState();
        }
        return;
      }
      if (String(previewNoteSeed.value?.id || '') === normalizedId && previewSeedScope === scope) return;
      desktopPreviewScrollSnapshot = null;
      const source = findNoteForWarmup(normalizedId) || { id: normalizedId };
      prefetchNoteDetail(user, normalizedId);
      applyDesktopPreviewLocalState(normalizedId, source);
      const cachedBreadcrumb = noteWorkspace.breadcrumbByNote[normalizedId];
      if (noteTreeReadEnabled.value && cachedBreadcrumb?.length) {
        void noteWorkspace.revealNotePath(normalizedId, cachedBreadcrumb);
      }
    },
    { immediate: true },
  );

  watch([noteTreeFeaturesReady, noteTreeReadEnabled, previewNoteId], ([featuresReady, treeEnabled, noteId]) => {
    if (!featuresReady || !treeEnabled || !noteId || noteId !== pendingPreviewPathId || bookmark.isMobile) return;
    pendingPreviewPathId = '';
    void noteWorkspace.revealNotePath(noteId);
  });

  async function toggleTreeNode(node: any) {
    const nodeId = String(node?.id || '');
    const wasExpanded = expandedIds.value.has(nodeId);
    const previousTimer = treeMotionCleanupTimers.get(nodeId);
    if (previousTimer) window.clearTimeout(previousTimer);
    treeMotionExpansionIds.value = new Set([...treeMotionExpansionIds.value, nodeId]);
    try {
      await toggleTreeNodeBase(node);
      if (!wasExpanded && expandedIds.value.has(nodeId)) {
        void recordNoteTreeProductEvent('note_tree_node_expanded', {
          surface: noteTreeSurface(),
          ...noteTreeNodeMetrics(nodeId),
          result: 'success',
        });
      }
    } finally {
      const timer = window.setTimeout(() => {
        const next = new Set(treeMotionExpansionIds.value);
        next.delete(nodeId);
        treeMotionExpansionIds.value = next;
        treeMotionCleanupTimers.delete(nodeId);
      }, 260);
      treeMotionCleanupTimers.set(nodeId, timer);
    }
  }

  let desktopTreeOpenedRecorded = false;
  watch(
    [noteTreeReadEnabled, showNoteSidebar],
    ([enabled, visible]) => {
      if (!enabled || !visible || desktopTreeOpenedRecorded) return;
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
              label: t('note.addExistingPages'),
              icon: icon.noteTree.move,
              function: () => openAttachPages(note),
            },
            {
              label: t('note.moveThisPage'),
              icon: icon.noteTree.move,
              function: () => openMoveNote(note),
            },
          ]
        : []),
      {
        label: t('noteShare.shareAction'),
        icon: icon.share,
        function: () => openNoteShare(note),
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
    activeRenameNote.value = {
      id,
      title: String(note?.title || ''),
      revision: Math.max(1, Number(note?.revision || 1)),
    };
    renameNoteVisible.value = true;
  }

  const shareNoteVisible = ref(false);
  const activeShareNote = ref<{ id: string; title?: string } | null>(null);
  function openNoteShare(note: any) {
    if (blockGuestWrite('share-note')) return;
    const id = String(note?.id || '').trim();
    if (!id) return;
    activeShareNote.value = { id, title: String(note?.title || '') };
    shareNoteVisible.value = true;
  }

  async function handleNoteRenamed(updated: { id: string; title: string; revision?: number }) {
    renameNoteVisible.value = false;
    recordOperation({ module: '笔记库', operation: `重命名笔记【${updated.title}】` });
    await Promise.all([refreshTree(), reloadNotes()]);
    activeRenameNote.value = null;
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
              if (previewNoteId.value === String(note.id)) closeDesktopPreview();
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
            preview.totalCount > 1 ? t('note.moveItemsToTrash', { count: preview.totalCount }) : t('note.moveToTrash'),
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
            if (previewNoteId.value === String(note.id)) closeDesktopPreview();
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

  async function handleNoteMoved(result: NoteTreeMoveResult | null) {
    const wasBatchMove = activeMoveNotes.value.length > 0;
    moveNoteVisible.value = false;
    if (wasBatchMove) exitBatch();
    noteLibraryCache.invalidateMovedNoteLists(noteCacheScope.value, result);
    await Promise.all([refreshTree(), reloadNotes()]);
    activeMoveNote.value = null;
    activeMoveNotes.value = [];
  }

  async function handlePagesAttached(result: NoteTreeMoveResult | null) {
    attachPagesVisible.value = false;
    noteLibraryCache.invalidateMovedNoteLists(noteCacheScope.value, result);
    await Promise.all([refreshTree(), reloadNotes()]);
    activeAttachTarget.value = null;
  }

  function handleNoteMenuSelect(action: string, note: any) {
    if (action === 'toggleTop') toggleNoteTop(note);
    else if (action === 'relateTags') openNoteTagConfig(note);
    else if (action === 'toggleInbox') toggleNoteInbox(note);
    else if (action === 'aiSummary') openNoteAi(note);
    else if (action === 'enterDirectory' && noteTreeReadEnabled.value) selectDirectory(String(note.id));
    else if (action === 'createChild') showNewChildPicker(note);
    else if (action === 'attach') openAttachPages(note);
    else if (action === 'move') openMoveNote(note);
    else if (action === 'share') openNoteShare(note);
    else if (action === 'delete') deleteSingleNote(note);
  }

  function handleNoteCardAction(
    action:
      | 'more'
      | 'toggleTop'
      | 'relateTags'
      | 'toggleInbox'
      | 'aiSummary'
      | 'enterDirectory'
      | 'createChild'
      | 'attach'
      | 'move'
      | 'share'
      | 'delete',
    note: any,
  ) {
    if (action === 'more') {
      activeMobileNote.value = note;
      mobileNoteActionsOpen.value = true;
      return;
    }
    handleNoteMenuSelect(action, note);
  }
  // 手机与桌面共用同一个 noteViewMode 偏好：设置里能配、笔记库顶部也能快切，与 PC 一致
  const currentViewMode = computed(() => user.preferences.noteViewMode || DEFAULT_NOTE_VIEW_MODE);
  const noteWorkspaceRef = ref<InstanceType<typeof NoteWorkspaceShell> | HTMLElement | null>(null);

  function noteWorkspaceElement() {
    const target = noteWorkspaceRef.value as any;
    return (target?.$el || target) as HTMLElement | null;
  }

  function noteListScrollElement() {
    return noteWorkspaceElement()?.querySelector<HTMLElement>('.note-main-panel [data-mobile-resource-scroll]') ?? null;
  }

  function captureMobileReturnScroll() {
    if (!bookmark.isMobile) return;
    const element = noteListScrollElement();
    if (!element) return;
    noteLibraryCache.writeReturnScroll(currentListCacheKey.value, {
      top: element.scrollTop,
      left: element.scrollLeft,
      viewMode: currentViewMode.value,
      routeFullPath: router.currentRoute.value.fullPath,
      loadedPage: Math.max(1, notePage.value),
    });
  }

  function matchingMobileReturnScroll() {
    if (!bookmark.isMobile) return null;
    const snapshot = noteLibraryCache.readReturnScroll(currentListCacheKey.value);
    if (!snapshot) return null;
    if (snapshot.routeFullPath !== router.currentRoute.value.fullPath) return null;
    if (snapshot.viewMode !== currentViewMode.value) return null;
    return snapshot;
  }

  function restoreMobileReturnScroll(snapshot: NoteLibraryReturnScrollSnapshot) {
    if (snapshot.routeFullPath !== router.currentRoute.value.fullPath) return false;
    if (snapshot.viewMode !== currentViewMode.value) return false;
    const element = noteListScrollElement();
    if (!element) return false;

    element.scrollLeft = snapshot.left;
    element.scrollTop = snapshot.top;

    // 列表尾页尚未恢复时，浏览器会把 scrollTop 截到当前最大值；等待缓存/软刷新落地后再试。
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (snapshot.top > 1 && maxTop + 1 < snapshot.top) return false;
    return Math.abs(element.scrollTop - snapshot.top) <= 2;
  }

  function cancelMobileReturnScrollRestore() {
    mobileReturnScrollRestoreRequestId += 1;
    mobileReturnScrollRestoreTimers.forEach((timer) => window.clearTimeout(timer));
    mobileReturnScrollRestoreTimers.clear();
  }

  function scheduleMobileReturnScrollRestore(snapshot: NoteLibraryReturnScrollSnapshot, consumeOnSuccess: boolean) {
    cancelMobileReturnScrollRestore();
    const requestId = mobileReturnScrollRestoreRequestId;
    const cacheKey = currentListCacheKey.value;

    const attempt = (retryIndex: number) => {
      if (requestId !== mobileReturnScrollRestoreRequestId) return;
      const current = matchingMobileReturnScroll();
      if (!current || current.updatedAt !== snapshot.updatedAt) return;
      const restored = restoreMobileReturnScroll(current);
      if (restored || retryIndex >= MOBILE_RETURN_SCROLL_RETRY_DELAYS.length) {
        if (consumeOnSuccess) noteLibraryCache.clearReturnScroll(cacheKey);
        return;
      }
      const timer = window.setTimeout(() => {
        mobileReturnScrollRestoreTimers.delete(timer);
        attempt(retryIndex + 1);
      }, MOBILE_RETURN_SCROLL_RETRY_DELAYS[retryIndex]);
      mobileReturnScrollRestoreTimers.add(timer);
    };

    nextTick(() => {
      window.requestAnimationFrame(() => attempt(0));
    });
  }

  function scheduleMobileListScrollReset() {
    nextTick(() => {
      window.requestAnimationFrame(resetCurrentResourceScroll);
    });
  }

  function captureDesktopPreviewScroll() {
    if (desktopPreviewOpen.value) return;
    const element = noteListScrollElement();
    desktopPreviewScrollSnapshot = element
      ? {
          top: element.scrollTop,
          left: element.scrollLeft,
          viewMode: currentViewMode.value,
        }
      : null;
  }

  async function restoreDesktopPreviewScroll(snapshot: DesktopPreviewScrollSnapshot) {
    await nextTick();
    window.requestAnimationFrame(() => {
      if (desktopPreviewOpen.value || snapshot.viewMode !== currentViewMode.value) return;
      const element = noteListScrollElement();
      if (!element) return;
      element.scrollTop = snapshot.top;
      element.scrollLeft = snapshot.left;
    });
  }

  /*
   * 下拉刷新。走 reloadNotes(true) 的软刷新路径:保留旧列表、不进骨架屏,
   * 并由 MobileAppShell 的跟手胶囊提示刷新状态，不清空已有数据。
   * 当前标签(URL query 驱动)、视图、搜索词、路由、排序都不受影响。
   *
   * 骨架屏容器和卡片列表是两个轮换出现的 DOM 节点(都带 data-mobile-resource-scroll),
   * 所以容器要动态取当前存在的那个,不能绑死一个 ref。
   */
  const pullRefresh = useAndroidPullRefresh({
    enabled: computed(() => !batchMode.value),
    externalBusy: computed(() => loading.value || refreshing.value || loadingMore.value || noteDragging.value),
    getScrollContainer: () =>
      noteWorkspaceElement()?.querySelector<HTMLElement>('[data-mobile-resource-scroll]') ?? null,
    onRefresh: () => Promise.all([reloadNotes(true), getAllTags(true), refreshTree()]),
  });
  /*
   * 从后台切回来时补一次数据。走的是同一条软刷新路径,区别只在触发方式:
   * 这里没有手势，因此保持完全静默，继续展示旧数据直到新数据替换。
   */
  useForegroundRefresh({
    refresh: () => Promise.all([reloadNotes(true), getAllTags(true), refreshTree()]),
    canRefresh: () =>
      !batchMode.value && !loading.value && !refreshing.value && !loadingMore.value && !noteDragging.value,
  });
  const allTags = ref<any[]>(initialTagSnapshot?.items || []);
  const mobileScopeLabel = computed(() => currentDirectoryTitle.value || t('note.knowledgeRoot'));

  async function init() {
    await Promise.all([reloadNotes(), getAllTags(true), refreshTree()]);
  }

  function getActiveNoteTagId() {
    const rawTag = router.currentRoute.value.query.tag;
    if (Array.isArray(rawTag)) return String(rawTag[0] || '') || undefined;
    if (rawTag === undefined || rawTag === null) return undefined;
    return String(rawTag);
  }

  const currentListCacheKey = computed(() =>
    buildNoteLibraryListCacheKey(noteCacheScope.value, {
      parentId: noteTreeReadEnabled.value ? currentParentId.value : null,
      tagId: getActiveNoteTagId(),
      keyword: debouncedSearch.value,
    }),
  );

  function restoreListSnapshot(snapshot: ReturnType<typeof noteLibraryCache.readList>) {
    if (!snapshot) return false;
    // 切换范围时若上一个请求还在途中，先让它失效，避免旧响应覆盖快照。
    noteRequestSeq += 1;
    noteList.value = snapshot.items;
    noteTotal.value = snapshot.total;
    notePage.value = snapshot.page;
    noteHasMore.value = snapshot.hasMore;
    loading.value = false;
    loadingMore.value = false;
    refreshing.value = false;
    return true;
  }

  async function queryNotePage(targetPage: number, append = false, soft = false) {
    const requestSeq = append ? noteRequestSeq : ++noteRequestSeq;
    const requestCacheKey = currentListCacheKey.value;
    const returnScrollSnapshot = !append && soft && targetPage === 1 ? matchingMobileReturnScroll() : null;
    const preservedItems = returnScrollSnapshot ? [...noteList.value] : [];
    const preservedPage = returnScrollSnapshot
      ? Math.max(notePage.value, returnScrollSnapshot.loadedPage)
      : notePage.value;
    const preservedHasMore = noteHasMore.value;
    if (append) loadingMore.value = true;
    else {
      // soft 时不动 loading:模板继续渲染旧列表,避免切标签整屏闪骨架屏
      if (soft) refreshing.value = true;
      else loading.value = true;
      loadingMore.value = false;
      if (!returnScrollSnapshot) {
        notePage.value = 0;
        noteHasMore.value = false;
      }
    }

    try {
      const res = await apiBasePost(
        '/api/note/queryNoteList',
        {
          page: targetPage,
          pageSize: RESOURCE_LIST_PAGE_SIZE,
          // v2 让服务端返回已生成的纯文本摘要/首图位置，并省略正文前缀。
          // 旧服务端会忽略该字段，客户端仍保留 content 解析兜底，支持滚动发布。
          previewVersion: 2,
          ...(noteTreeReadEnabled.value ? { parentId: currentParentId.value } : {}),
          keyword: debouncedSearch.value,
          tagId: getActiveNoteTagId(),
        },
        // 列表有本地骨架/软刷新状态，不再同时点亮全局顶部请求条。
        { feedback: false },
      );
      if (requestSeq !== noteRequestSeq) return false;
      if (res.status !== 200) {
        message.error(t('note.loadFailed'));
        return false;
      }

      const pageItems = Array.isArray(res.data?.items) ? res.data.items : [];
      noteTotal.value = Number(res.data?.total || 0);
      const preserveLoadedTail =
        Boolean(returnScrollSnapshot) && preservedPage > 1 && preservedItems.length > RESOURCE_LIST_PAGE_SIZE;
      if (append) {
        noteList.value = mergeResourcePage(noteList.value, pageItems);
        notePage.value = Number(res.data?.page || targetPage);
        noteHasMore.value = Boolean(res.data?.hasMore);
      } else if (preserveLoadedTail) {
        noteList.value = mergeResourceRefreshedHead(preservedItems, pageItems);
        notePage.value = Math.max(Number(res.data?.page || targetPage), preservedPage);
        noteHasMore.value = noteTotal.value > noteList.value.length || (noteTotal.value === 0 && preservedHasMore);
      } else {
        noteList.value = pageItems;
        notePage.value = Number(res.data?.page || targetPage);
        noteHasMore.value = Boolean(res.data?.hasMore);
      }
      noteLibraryCache.writeList(requestCacheKey, {
        items: noteList.value,
        total: noteTotal.value,
        page: notePage.value,
        hasMore: noteHasMore.value,
      });
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
        if (returnScrollSnapshot) scheduleMobileReturnScrollRestore(returnScrollSnapshot, true);
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

  async function getAllTags(force = false) {
    const requestScope = noteCacheScope.value;
    const cached = noteLibraryCache.readTags(requestScope);
    if (cached) {
      allTags.value = cached.items;
      if (!force && Date.now() - cached.updatedAt <= NOTE_LIBRARY_TAGS_FRESH_MS) return;
    }
    try {
      const res = await apiBasePost('/api/note/queryNoteTagList', { userId: user.id }, { feedback: false });
      if (requestScope !== noteCacheScope.value) return;
      if (res.status === 200) {
        // 兼容旧后端:老版本直接返回标签数组,新版本返回带汇总计数的对象
        const payload: any = res.data;
        const isLegacyArray = Array.isArray(payload);
        allTags.value = isLegacyArray ? payload : Array.isArray(payload?.items) ? payload.items : [];
        noteLibraryCache.writeTags(requestScope, {
          items: allTags.value,
          untaggedCount: isLegacyArray ? null : toFiniteCount(payload?.untaggedCount),
          totalCount: isLegacyArray ? null : toFiniteCount(payload?.totalCount),
        });
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
  }

  function toFiniteCount(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // 空态区分用：搜索词或标签筛选任一激活；目录范围本身不是筛选条件。
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
      !treeMovePending.value &&
      !debouncedSearch.value &&
      router.currentRoute.value.query.tag == null &&
      visibleDragNoteList.value.length > (noteTreeReadEnabled.value ? 0 : 1) &&
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
    [noteTreeReadEnabled, treeSearchValue],
    ([enabled, keyword]) => {
      if (treeSearchTimer.value) window.clearTimeout(treeSearchTimer.value);
      treeSearchTimer.value = window.setTimeout(() => {
        void searchTree(enabled ? keyword : '');
        treeSearchTimer.value = null;
      }, 180);
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
      const forceRefresh = Array.isArray(previous) && refreshToken !== previous[3];
      const cached = noteLibraryCache.readList(currentListCacheKey.value);
      const returnScrollSnapshot = matchingMobileReturnScroll();
      if (cached) {
        restoreListSnapshot(cached);
        if (!forceRefresh && Date.now() - cached.updatedAt <= NOTE_LIBRARY_LIST_FRESH_MS) {
          if (batchMode.value) exitBatch();
          if (returnScrollSnapshot) scheduleMobileReturnScrollRestore(returnScrollSnapshot, true);
          else if (bookmark.isMobile) scheduleMobileListScrollReset();
          return;
        }
      }
      // 只有"页面已有内容 + 本次仅标签变化"才软刷新;首屏、搜索和强制刷新仍用骨架屏
      const onlyTagChanged =
        Array.isArray(previous) &&
        search === previous[1] &&
        refreshToken === previous[3] &&
        parentId === previous[4] &&
        tag !== previous[2];
      const soft = Boolean(cached) || (onlyTagChanged && visibleDragNoteList.value.length > 0);
      if (batchMode.value) exitBatch();
      void reloadNotes(soft);
      if (bookmark.isMobile) {
        if (returnScrollSnapshot) scheduleMobileReturnScrollRestore(returnScrollSnapshot, false);
        else scheduleMobileListScrollReset();
      }
    },
    { immediate: true },
  );
  void getAllTags();
  watch(noteCacheScope, () => {
    void getAllTags();
  });

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

  function clearNoteLibraryRootViewState() {
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    if (treeSearchTimer.value) window.clearTimeout(treeSearchTimer.value);
    searchTimer.value = null;
    treeSearchTimer.value = null;
    searchValue.value = '';
    treeSearchValue.value = '';
    debouncedSearch.value = '';
    closeDesktopPreview(false);
    exitBatch();
    noteWorkspace.resetLibraryRootState();
  }

  async function resetNoteLibrary() {
    const alreadyReset =
      !debouncedSearch.value && router.currentRoute.value.query.tag == null && currentParentId.value === null;
    clearNoteLibraryRootViewState();
    await router.replace('/noteLibrary');
    if (alreadyReset) await reloadNotes();
    await getAllTags();
  }

  let handledLibraryRootEntryRequestToken: number | null = null;
  function applyPendingLibraryRootEntryRequest() {
    const requestToken = libraryRootEntryRequestToken.value;
    if (
      requestToken === null ||
      requestToken === handledLibraryRootEntryRequestToken ||
      router.currentRoute.value.path !== '/noteLibrary'
    ) {
      return;
    }
    handledLibraryRootEntryRequestToken = requestToken;
    clearNoteLibraryRootViewState();
  }

  watch([libraryRootEntryRequestToken, () => router.currentRoute.value.path], applyPendingLibraryRootEntryRequest, {
    immediate: true,
    flush: 'sync',
  });
  onActivated(applyPendingLibraryRootEntryRequest);

  async function handleNoteLibraryTitleClick() {
    if (desktopPreviewOpen.value) {
      closeDesktopPreview();
      return;
    }
    await resetNoteLibrary();
  }

  onBeforeUnmount(() => {
    cancelMobileReturnScrollRestore();
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    if (treeSearchTimer.value) window.clearTimeout(treeSearchTimer.value);
    treeMotionCleanupTimers.forEach((timer) => window.clearTimeout(timer));
    treeMotionCleanupTimers.clear();
    desktopPreviewScrollSnapshot = null;
    noteRequestSeq += 1;
    clearNoteDetailWarmup();
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

  let noteDetailRouteWarmupTimer: number | null = null;
  let noteDetailWarmupSignature = '';

  function clearNoteDetailWarmup() {
    if (noteDetailRouteWarmupTimer !== null) window.clearTimeout(noteDetailRouteWarmupTimer);
    noteDetailRouteWarmupTimer = null;
  }

  function scheduleNoteDetailWarmup(notes: any[]) {
    if (!bookmark.isMobile || !notes.length) return;
    const candidate = notes.find((item) => String(item?.type || '').toLowerCase() === 'html') || notes[0];
    const signature = `${String(candidate?.id || '')}:${String(candidate?.type || 'html')}`;
    if (!candidate?.id || signature === noteDetailWarmupSignature) return;
    noteDetailWarmupSignature = signature;
    clearNoteDetailWarmup();
    noteDetailRouteWarmupTimer = window.setTimeout(() => {
      noteDetailRouteWarmupTimer = null;
      void prefetchResolvedRoute(router, { name: 'noteDetail', params: { id: candidate.id } }).catch(() => {
        // 弱网预热失败不打扰当前列表，用户点击时按正常导航链路重试。
      });
    }, 320);
  }

  watch(
    () => [bookmark.isMobile, visibleDragNoteList.value] as const,
    ([mobile, notes]) => {
      if (!mobile) {
        clearNoteDetailWarmup();
        return;
      }
      scheduleNoteDetailWarmup(notes);
    },
    { immediate: true, flush: 'post' },
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
      key: 'templates',
      label: t('note.templateManager.title'),
      icon: icon.noteDetail.template,
    },
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
  const mobileNoteActions = computed<MobilePageActionItem[]>(() => {
    if (!activeMobileNote.value) return [];
    let dividerBefore = false;
    return menuForNote(activeMobileNote.value).flatMap((item: any) => {
      if (item.divider) {
        dividerBefore = true;
        return [];
      }
      const action: MobilePageActionItem = {
        key: item.key,
        label: item.label,
        icon: item.icon,
        danger: Boolean(item.danger),
        dividerBefore,
      };
      dividerBefore = false;
      return [action];
    });
  });
  const mobileBatchActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'analyze',
      label: t('note.aiSummarizeSelected'),
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
      disabled: selectedVisibleCount.value < 1 || batchExporting.value,
    },
    {
      key: 'delete',
      label: t('note.deleteSelected'),
      icon: icon.noteDetail.delete,
      danger: true,
      disabled: selectedVisibleCount.value < 1,
    },
  ]);
  const desktopBatchMoreOptions = computed(() => [
    {
      key: 'analyze',
      label: t('note.aiSummarizeSelected'),
      icon: icon.ai.materials,
      function: openSelectedNotesAi,
    },
    {
      key: 'addTags',
      label: t('note.batchAddTags'),
      icon: icon.manage_categoryBtn_tag,
      function: () => openBatchTags('add'),
    },
    {
      key: 'removeTags',
      label: t('note.batchRemoveTags'),
      icon: icon.manage_categoryBtn_tag,
      function: () => openBatchTags('remove'),
    },
    {
      key: 'export',
      label: t('note.batchExport'),
      icon: icon.cloudSpace.download,
      function: openBatchExportModal,
    },
  ]);

  const noteAiVisible = ref(false);
  const noteAiItems = ref<any[]>([]);

  function openNotesAi(notes: any[]) {
    const available = notes.filter((note) => String(note?.id || '').trim());
    if (!available.length) return;
    if (available.length > 20) message.info(t('ai.materialLimit', { count: 20 }));
    mobileNoteActionsOpen.value = false;
    mobileBatchActionsOpen.value = false;
    noteAiItems.value = available.slice(0, 20);
    noteAiVisible.value = true;
  }

  function openNoteAi(note: any) {
    openNotesAi([note]);
  }

  function openSelectedNotesAi() {
    const checked = viewNoteList.value.filter((data: any) => data.isCheck === true);
    openNotesAi(checked);
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
    if (action.key === 'templates') {
      void openTemplateManager();
    } else if (action.key === 'aiOrganize') {
      openGlobalAiOrganize();
    } else if (action.key === 'batch') {
      if (batchMode.value) exitBatch();
      else enterBatch();
    }
  }

  function handleMobileNoteAction(action: MobilePageActionItem) {
    const target = activeMobileNote.value;
    activeMobileNote.value = null;
    if (!target) return;
    handleNoteMenuSelect(action.key, target);
  }

  function openMobileDirectory() {
    if (!noteTreeMobileEnabled.value) return;
    mobileDirectoryMounted.value = true;
    mobileDirectoryOpen.value = true;
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

  let consumingDirectoryOpenRequest = false;
  watch(
    [() => router.currentRoute.value.query.openDirectory, noteTreeFeaturesReady, () => bookmark.isMobile],
    async ([request, featuresReady, isMobile]) => {
      if (request !== '1' || !featuresReady || !isMobile || consumingDirectoryOpenRequest) return;
      consumingDirectoryOpenRequest = true;
      try {
        // 先消费一次性参数，再打开会压入 history 占位的抽屉，避免 replace 与返回栈竞争。
        const query = { ...router.currentRoute.value.query };
        delete query.openDirectory;
        await router.replace({ path: '/noteLibrary', query });
        openMobileDirectory();
      } finally {
        consumingDirectoryOpenRequest = false;
      }
    },
    { immediate: true },
  );

  function handleTagFilterSelect() {
    closeDesktopPreview(false);
  }

  function handleMobileBatchAction(action: MobilePageActionItem) {
    if (action.key === 'analyze') openSelectedNotesAi();
    else if (action.key === 'smartOrganize') openSelectedAiOrganize();
    else if (action.key === 'addTags') openBatchTags('add');
    else if (action.key === 'removeTags') openBatchTags('remove');
    else if (action.key === 'move') openBatchMove();
    else if (action.key === 'export') openBatchExportModal();
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

  function openBatchExportModal() {
    if (!getSelectedNotes().length || batchExporting.value) return;
    batchExportModalVisible.value = true;
  }

  const batchExportSections = computed(() => [
    {
      key: 'format',
      title: '',
      actions: [
        {
          key: 'original',
          label: t('note.batchExportOriginal'),
          description: t('note.batchExportOriginalDesc'),
          tag: t('note.batchExportRecommended'),
          onClick: () => void exportSelectedNotes('original'),
        },
        {
          key: 'html',
          label: t('note.batchExportHtml'),
          description: t('note.batchExportHtmlDesc'),
          onClick: () => void exportSelectedNotes('html'),
        },
        {
          key: 'markdown',
          label: t('note.batchExportMarkdown'),
          description: t('note.batchExportMarkdownDesc'),
          onClick: () => void exportSelectedNotes('markdown'),
        },
        {
          key: 'pdf',
          label: t('note.batchExportPdf'),
          description: t('note.batchExportPdfDesc'),
          onClick: () => void exportSelectedNotes('pdf'),
        },
      ],
    },
  ]);

  async function deliverBatchExportArchive(blob: Blob, fileName: string, noteId: string) {
    if (isLightNoteAndroidApp()) {
      const outcome = await deliverExportViaAndroidBridge({
        noteId,
        content: blob,
        fileName,
        format: 'zip',
        mimeType: 'application/zip',
      });
      if (outcome.ok) {
        return true;
      }
      message.warning(
        outcome.reason === 'too_large'
          ? t('note.batchExportTooLargeInApp')
          : outcome.message || t('note.batchExportUnavailableInApp'),
      );
      return false;
    }

    const result = await deliverGeneratedFile({
      content: blob,
      fileName,
      mimeType: 'application/zip',
      preferShare: bookmark.isMobile || bookmark.isTablet,
    });
    if (result === 'cancelled') return false;
    if (result === 'unavailable') {
      message.warning(t('note.batchExportUnavailableInApp'));
      return false;
    }
    return true;
  }

  async function exportSelectedNotes(mode: NoteBatchExportMode) {
    const selected = getSelectedNotes();
    if (!selected.length || batchExporting.value) return;
    batchExportModalVisible.value = false;
    batchExporting.value = true;
    const selectedIds = selected.map((note) => String(note.id));
    const closePreparing = message.loading(t('note.batchExportPreparing', { count: selectedIds.length }), 0);
    let preparingClosed = false;
    const stopPreparing = () => {
      if (preparingClosed) return;
      preparingClosed = true;
      closePreparing();
    };

    try {
      const response = await apiBasePost('/api/note/getNotesForExport', { ids: selectedIds }, { silent: true });
      const notes = response.status === 200 && Array.isArray(response.data?.notes) ? response.data.notes : [];
      if (!notes.length) {
        message.error(response.msg || t('note.batchExportFailed'));
        return;
      }

      const { buildBatchNoteExportArchive } = await import('@/utils/noteBatchExport');
      const archive = await buildBatchNoteExportArchive(notes, mode, {
        fallbackTitle: t('noteDetail.unnamedDoc'),
        lang: locale.value,
      });
      if (!archive.blob || !archive.entries.length) {
        message.error(t('note.batchExportFailed'));
        return;
      }

      stopPreparing();
      const fileName = `lightnote-notes-${new Date().toISOString().slice(0, 10)}.zip`;
      const delivered = await deliverBatchExportArchive(archive.blob, fileName, String(notes[0].id));
      if (!delivered) return;
      recordOperation({
        module: '笔记库',
        operation: `批量导出笔记成功【${archive.entries.length}篇/${mode}】`,
      });
      if (archive.entries.length < selectedIds.length) {
        message.warning(t('note.batchExportPartial', { count: archive.entries.length, total: selectedIds.length }));
      } else {
        message.success(t('note.batchExportSuccess', { count: archive.entries.length }));
      }
    } catch (error) {
      console.error('批量导出笔记失败:', error);
      message.error(t('note.batchExportFailed'));
    } finally {
      stopPreparing();
      batchExporting.value = false;
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
    closeDesktopPreview(false);
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    if (tag === null) delete query.tag;
    else query.tag = String(tag.id);
    router.push({ path: '/noteLibrary', query });
  };

  function noteTreeScrollElement() {
    return noteWorkspaceElement()?.querySelector<HTMLElement>('.note-tree-scroll') ?? null;
  }

  function onDragMove(_event: any, originalEvent?: PointerEvent) {
    if (originalEvent && typeof originalEvent.clientX === 'number') {
      const target = resolveDropTargetAtPoint(originalEvent.clientX, originalEvent.clientY);
      scheduleDragDropTarget(target);
    }
    // 右侧卡片/列表只承担“移入或移出目录”，同级前后排序统一留给左侧页面树。
    return false;
  }

  function onStart(event?: { item?: HTMLElement; oldIndex?: number }) {
    const indexedNote = Number.isInteger(Number(event?.oldIndex))
      ? visibleDragNoteList.value[Number(event?.oldIndex)]
      : null;
    const sourceId = String(event?.item?.getAttribute('data-note-sort-id') || indexedNote?.id || '').trim();
    const sourceNote = noteList.value.find((item) => String(item.id) === sourceId) || indexedNote;
    beginPointerDrag({ id: sourceId, isTop: Boolean(sourceNote?.isTop) });
  }

  async function onEnd() {
    // 卡片中央已经是明确的“作为父页面”落点，不要求用户额外停留后才能生效。
    const pointerDrop = takePointerDropSnapshot();
    const nestedTarget = pointerDrop.target;
    const nestedSourceId = pointerDrop.sourceId;
    const nestedSourceIsTop = pointerDrop.sourceIsTop;
    try {
      if (!nestedTarget || !nestedSourceId) {
        visibleDragNoteList.value = [...viewNoteList.value];
        return;
      }
      if (blockGuestWrite('move-note')) {
        visibleDragNoteList.value = [...viewNoteList.value]; // 拖拽库已就地改了 DOM 顺序,游客态复位视觉
        return;
      }
      visibleDragNoteList.value = [...viewNoteList.value];
      await moveNoteIntoTarget(nestedSourceId, nestedSourceIsTop, nestedTarget);
    } catch (error) {
      visibleDragNoteList.value = [...viewNoteList.value];
      console.error('Error moving note:', error);
      message.error(t('note.moveFailed'));
    } finally {
      completePointerDrag();
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
      /* 桌面列表是稳定的「标题 + 摘要/标签」两行，骨架与真实项保持相同的紧凑高度。 */
      min-height: 70px;
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
    border: 1px solid var(--primary-color, #615ced);
    color: var(--primary-color, #615ced);
    background: color-mix(in srgb, var(--primary-color, #615ced) 8%, var(--menu-body-bg-color));
  }

  .note-ai-button:hover,
  .note-ai-button:active {
    color: var(--primary-color, #615ced);
    background: color-mix(in srgb, var(--primary-color, #615ced) 14%, var(--menu-body-bg-color));
  }

  .note-mobile-actions {
    width: 100%;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .note-mobile-actions :deep(.noteType-select) {
    width: 44px;
    min-width: 0;
    justify-content: center;
    padding-inline: 8px;
  }

  .note-mobile-directory {
    width: auto;
    max-width: 100%;
    min-width: 0;
    flex: 1 1 auto;
    height: 36px;
    padding: 0 9px;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--menu-body-bg-color);
    box-sizing: border-box;
    overflow: hidden;
  }

  .note-mobile-directory {
    justify-content: flex-start;

    span {
      flex: 1;
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

  .note-mobile-current-page-card {
    width: 100%;
    min-width: 0;
    min-height: 62px;
    flex: 0 0 auto;
    padding: 9px 12px;
    justify-content: flex-start;
    gap: 10px;
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    text-align: left;
  }

  .note-mobile-current-page-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: var(--resource-note-color, #00a884);
    background: var(--resource-note-soft-bg, #e9f8f4);
  }

  .note-mobile-current-page-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      overflow: hidden;
      color: var(--text-color);
      font-size: 14px;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-mobile-current-page-label,
  .note-mobile-current-page-action {
    color: var(--resource-note-color, #00a884);
    font-size: 11px;
  }

  .note-mobile-current-page-action {
    flex: 0 0 auto;
    font-weight: 650;
  }

  .note-create-button {
    background: var(--resource-note-color, #00a884);
  }

  .note-create-button:hover {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 88%, #ffffff);
  }

  .note-workspace {
    --note-card-min-width: 320px;
    --note-workspace-frame-color: color-mix(in srgb, var(--card-border-color) 72%, transparent);
    --note-workspace-divider-color: var(--note-workspace-frame-color);

    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--note-workspace-frame-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
    container-type: inline-size;

    @supports (width: 1cqi) {
      // 以工作区宽度自适应:1470 左右保持可读卡宽,2560 左右自然落到 6 列。
      --note-card-min-width: clamp(320px, 15cqi, 460px);
    }
  }

  .note-sidebar-panel {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    padding: 12px;
    border-right: 0;
  }

  .note-main-panel {
    width: 100%;
    height: 100%;
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
    position: relative;
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

    &.is-drop-candidate {
      border: 1px solid var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }

    &.is-drop-target {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 14%, var(--menu-body-bg-color)) !important;
    }

    &.is-drop-root-start::after {
      position: absolute;
      right: 3px;
      bottom: -2px;
      left: 3px;
      height: 2px;
      border-radius: 999px;
      background: var(--resource-note-color, #00a884);
      content: '';
      pointer-events: none;
    }
  }

  :deep(.note-drop-candidate .note-card),
  :deep(.note-drop-candidate .note-list-item) {
    border: 2px solid var(--resource-note-color, #00a884) !important;
  }

  :deep(.note-drop-target .note-card),
  :deep(.note-drop-target .note-list-item) {
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, var(--menu-body-bg-color));
  }

  .note-sort-item {
    cursor: grab;

    &:active {
      cursor: grabbing;
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

    .note-library-body-list .note-list-skeleton-item {
      /* 手机端为标题、摘要和 chip 三段式布局，保留与真实项一致的高度。 */
      min-height: 108px;
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

  .note-empty-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .note-attach-button {
    gap: 6px;
    color: var(--resource-note-color, #00a884);
    border-color: var(--resource-note-color, #00a884);
    background: var(--menu-body-bg-color);
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
      overflow-anchor: none;
    }

    /*
     * 移动端返回笔记库时不能继续使用卡片固有高度占位：弱网下异步路由和正文摘要较晚就绪，
     * 老 WebView 会先按 282px 占位再修正真实高度，并通过滚动锚点把首张卡片顶出视口。
     * 首批只有分页后的有限节点，移动端直接稳定绘制可避免返回后的随机错位。
     */
    .note-library-body > * {
      content-visibility: visible;
      contain-intrinsic-size: none;
    }

    .note-library-body-list .note-list,
    .note-library-body-list .note-list-skeleton-wrap {
      overflow-anchor: none;
    }

    .note-mobile-current-page-card {
      margin: 6px 0;
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
      color: var(--primary-color, #615ced);
      background: color-mix(in srgb, var(--primary-color, #615ced) 8%, var(--menu-body-bg-color));
      font-size: 14px;
    }

    .note-mobile-actions .note-ai-button:hover,
    .note-mobile-actions .note-ai-button:active {
      color: var(--primary-color, #615ced);
      background: color-mix(in srgb, var(--primary-color, #615ced) 14%, var(--menu-body-bg-color));
    }
  }

  @media (min-width: 520px) and (max-width: 767px) {
    .note-library-body {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
