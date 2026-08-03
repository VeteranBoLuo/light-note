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
            <SvgIcon :src="icon.ai.organize" size="16" />
            {{ $t('ai.entry.organizeSelected') }}
          </BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="openBatchTags('add')">{{
            $t('note.batchAddTags')
          }}</BButton>
          <BButton class="note-action-button" :disabled="!selectedVisibleCount" @click="openBatchTags('remove')">{{
            $t('note.batchRemoveTags')
          }}</BButton>
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
          <TagFilterSelector :all-tags="visibleNoteTags" />
          <BButton
            class="note-action-button note-ai-button"
            @click="aiOrgVisible = true"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.aiOrganize"
          >
            <SvgIcon :src="icon.ai.organize" size="17" />
            {{ $t('bookmarkMg.aiOrganizeBtn') }}
          </BButton>
        </div>
        <template v-else>
          <TagFilterSelector :all-tags="visibleNoteTags" />
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
            @click="aiOrgVisible = true"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.aiOrganize"
          >
            <SvgIcon :src="icon.ai.organize" size="17" />
            {{ $t('bookmarkMg.aiOrganizeBtn') }}
          </BButton>
          <BButton
            type="primary"
            class="note-action-button note-create-button"
            @click="showNewNotePicker"
            v-click-log="OPERATION_LOG_MAP.noteLibrary.addNote"
          >
            <SvgIcon :src="icon.common.add" size="16" />
            {{ $t('note.newNote') }}
          </BButton>
        </template>
      </template>
    </template>

    <div class="note-workspace" @scroll.capture.passive="onNoteScroll">
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
            @nodeTypeChange="handleNodeTypeChange"
            @action="handleNoteCardAction($event, note)"
          />
        </RightMenu>
      </VueDraggable>
      <div v-if="currentViewMode === 'list' && (loading || visibleDragNoteList.length)" class="note-library-body-list">
        <div v-if="loading" class="note-list note-list-skeleton-wrap" data-mobile-resource-scroll>
          <div v-for="n in 10" :key="`list-skeleton-${n}`" class="note-list-skeleton-item">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
          </div>
        </div>
        <VueDraggable
          v-else
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
            <note-list-item :note="note" @nodeTypeChange="handleNodeTypeChange" />
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
    <AiOrganizeModal v-model:visible="aiOrgVisible" init-type="note" @applied="init" />
    <NoteTagConfig
      v-if="tagConfigVisible && activeTagNote"
      v-model:visible="tagConfigVisible"
      :note="activeTagNote"
      @saveTag="handleNoteTagsSaved"
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
  import TagFilterSelector from '@/components/noteLibrary/library/TagFilterSelector.vue';
  import AiOrganizeModal from '@/components/manage/bookmarkMg/AiOrganizeModal.vue';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import NoteListItem from '@/components/noteLibrary/library/NoteListItem.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import ViewModeToggle from '@/components/base/ViewModeToggle.vue';
  import { recordOperation } from '@/api/commonApi.ts';
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
  import { waitForCurrentMobileOverlayHistoryRelease } from '@/utils/mobileOverlayHistory';
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
  };

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { resetCurrentResourceScroll } = useMobileNavigationState();
  const { addResourcesToInbox } = useInboxEnqueue();
  const noteList = ref<any[]>([]);
  const visibleDragNoteList = ref<any[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const noteTotal = ref(0);
  const notePage = ref(0);
  const noteHasMore = ref(false);
  const noteDragging = ref(false);
  const searchValue = ref('');
  const debouncedSearch = ref('');
  const searchTimer = ref<number | null>(null);
  let noteRequestSeq = 0;
  const showTypePicker = ref(false);
  const aiOrgVisible = ref(false); // AI 智能整理(笔记)弹框
  const tagConfigVisible = ref(false);
  const activeTagNote = ref<any | null>(null);
  const batchMode = ref(false);
  const mobilePageActionsOpen = ref(false);
  const mobileBatchActionsOpen = ref(false);
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
    // 移动端 BModal 会用一层 history 占位支持系统返回手势。必须先监听这层
    // 占位释放，再关闭弹框并跳转；否则 history.back 与 router.push 竞争，
    // 新打开的 /noteLibrary/add 会被立即弹回笔记库。
    const overlayReleased = bookmark.isMobile
      ? waitForCurrentMobileOverlayHistoryRelease()
      : Promise.resolve();
    showTypePicker.value = false;
    const usageKey = query.builtin ? `builtin:${query.builtin}` : query.templateId ? `mine:${query.templateId}` : '';
    if (usageKey) {
      templateUsage.value = { ...templateUsage.value, [usageKey]: Date.now() };
      localStorage.setItem('note-template-recent-usage', JSON.stringify(templateUsage.value));
    }
    await overlayReleased;
    await router.push({ path: '/noteLibrary/add', query });
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

  async function addNoteToInbox(note: any) {
    // 接口成功即本地打标,避免为一个徽标重新拉取列表
    const ok = await addResourcesToInbox([{ resourceType: 'note', resourceId: String(note.id) }], '笔记库');
    if (ok) note.isPending = true;
  }
  function menuForNote(note: any) {
    return [
      {
        key: 'toggleTop',
        label: note.isTop ? t('common.unpin') : t('common.pin'),
        icon: note.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
      },
      { key: 'relateTags', label: t('note.relateTags'), icon: icon.manage_categoryBtn_tag },
      { key: 'addInbox', label: t('inbox.addExisting'), icon: icon.contextMenu.inbox },
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

  function deleteSingleNote(note: any) {
    if (blockGuestWrite('delete-note')) return;
    Alert.alert({
      title: t('note.deleteOneTitle'),
      content: t('note.deleteOneConfirm', { title: note.title || t('note.untitled') }),
      footer: [
        { label: t('common.cancel'), function: () => undefined },
        {
          label: t('note.moveToTrash'),
          type: 'danger',
          async function() {
            const res = await apiBasePost('/api/note/delNote', { ids: [note.id] });
            if (res.status !== 200) return;
            message.success(t('common.deleteSuccess'));
            recordOperation({ module: '笔记库', operation: `删除笔记成功【${note.title}】` });
            await init();
          },
        },
      ],
    });
  }

  function handleNoteMenuSelect(action: string, note: any) {
    if (action === 'toggleTop') toggleNoteTop(note);
    else if (action === 'relateTags') openNoteTagConfig(note);
    else if (action === 'addInbox') addNoteToInbox(note);
    else if (action === 'delete') deleteSingleNote(note);
  }

  function handleNoteCardAction(action: 'toggleTop' | 'relateTags' | 'addInbox' | 'delete', note: any) {
    handleNoteMenuSelect(action, note);
  }
  const currentViewMode = computed(() => (bookmark.isMobile ? 'card' : user.preferences.noteViewMode));
  const allTags = ref<any[]>([]);

  async function init() {
    await Promise.all([reloadNotes(), getAllTags()]);
  }

  function getActiveNoteTagId() {
    const rawTag = router.currentRoute.value.query.tag;
    if (Array.isArray(rawTag)) return String(rawTag[0] || '') || undefined;
    if (rawTag === undefined || rawTag === null) return undefined;
    return String(rawTag);
  }

  async function queryNotePage(targetPage: number, append = false) {
    const requestSeq = append ? noteRequestSeq : ++noteRequestSeq;
    if (append) loadingMore.value = true;
    else {
      loading.value = true;
      loadingMore.value = false;
      notePage.value = 0;
      noteHasMore.value = false;
    }

    try {
      const res = await apiBasePost('/api/note/queryNoteList', {
        page: targetPage,
        pageSize: RESOURCE_LIST_PAGE_SIZE,
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
      if (!debouncedSearch.value && getActiveNoteTagId() === undefined) {
        user.noteTotal = noteTotal.value;
      }
      return true;
    } catch (error) {
      console.error('加载笔记列表失败:', error);
      message.error(t('note.loadFailed'));
      return false;
    } finally {
      if (requestSeq === noteRequestSeq) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  function reloadNotes() {
    return queryNotePage(1, false);
  }

  function loadMoreNotes() {
    if (noteDragging.value || loading.value || loadingMore.value || !noteHasMore.value) return Promise.resolve(false);
    return queryNotePage(notePage.value + 1, true);
  }

  function onNoteScroll(event: Event) {
    const target = event.target;
    if (target instanceof HTMLElement && isNearResourceScrollEnd(target)) {
      void loadMoreNotes();
    }
  }

  async function getAllTags() {
    try {
      const res = await apiBasePost('/api/note/queryNoteTagList', { userId: user.id });
      if (res.status === 200) {
        allTags.value = res.data;
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
  }

  // 空态区分用:搜索词或标签筛选(?tag=,含 'null'=无标签筛选)任一激活
  const hasActiveFilter = computed(
    () => Boolean(debouncedSearch.value.trim()) || router.currentRoute.value.query.tag != null,
  );
  function clearFilters() {
    searchValue.value = '';
    debouncedSearch.value = '';
    if (router.currentRoute.value.query.tag != null) router.replace({ query: {} });
  }
  const canDragNote = computed(
    () =>
      !bookmark.isMobile &&
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
    [debouncedSearch, () => router.currentRoute.value.query.tag, () => router.currentRoute.value.query._rt],
    () => {
      if (batchMode.value) exitBatch();
      void reloadNotes();
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
    addLabel: () => t('note.newNote'),
  });

  async function resetNoteLibrary() {
    const alreadyReset = !debouncedSearch.value && router.currentRoute.value.query.tag == null;
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
  const mobilePageActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'batch',
      label: t(batchMode.value ? 'note.exitBatch' : 'inbox.mobileBatchSelect'),
      icon: icon.filterPanel.check,
    },
  ]);
  const mobileBatchActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'ai',
      label: t('ai.entry.organizeSelected'),
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
    if (checked.length > 5) message.info(t('ai.materialLimit', { count: 5 }));
    const selected = checked.slice(0, 5);
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
    batchMode.value = false;
    mobileBatchActionsOpen.value = false;
    noteList.value.forEach((data) => {
      data.isCheck = false;
    });
  }

  function enterBatch() {
    noteList.value.forEach((data) => {
      data.isCheck = false;
    });
    batchMode.value = true;
  }

  function handleMobilePageAction(action: MobilePageActionItem) {
    if (action.key !== 'batch') return;
    if (batchMode.value) exitBatch();
    else enterBatch();
  }

  function handleMobileBatchAction(action: MobilePageActionItem) {
    if (action.key === 'ai') openSelectedNotesAi('organize');
    else if (action.key === 'addTags') openBatchTags('add');
    else if (action.key === 'removeTags') openBatchTags('remove');
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
      formatVersion: 1,
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

  function batchDeleteNote() {
    if (blockGuestWrite('delete-note')) return;
    const delIds = viewNoteList.value.filter((data) => data.isCheck).map((item) => item.id) || [];
    if (!delIds.length) return;
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.deleteSelectedConfirm'),
      async onOk() {
        const res = await apiBasePost('/api/note/delNote', { ids: delIds });
        if (res.status === 200) {
          recordOperation({ module: '笔记库', operation: `批量删除笔记成功【${delIds.length}篇】` });
          message.success(t('common.deleteSuccess'));
          exitBatch();
          await init();
        }
      },
    });
  }

  const handleNodeTypeChange = (tag) => {
    if (tag === null) {
      router.push('/noteLibrary');
    } else {
      router.push(`/noteLibrary?tag=${tag.id}`);
    }
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

      const res = await apiBasePost('/api/note/updateNoteSort', { move });
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
  .note-list-skeleton-item,
  .tag-tree-skeleton {
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

  .skeleton-chip {
    width: 52px;
    height: 16px;
    border-radius: 8px;
    background: rgba(120, 120, 120, 0.18);
  }

  .note-card-skeleton::after,
  .note-list-skeleton-item::after,
  .tag-tree-skeleton::after {
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
    .tag-sidebar {
      width: 220px;
      background: var(--background-color);
      border: 1px solid var(--card-border-color);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      overflow-y: auto;
      .tag-item {
        padding: 12px 16px;
        cursor: pointer;
        border-radius: 6px;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        color: var(--text-color);
        justify-content: space-between;
        &:hover {
          background-color: var(--hover-bg-color, #f0f0f0);
          color: #161824;
        }
        &.active {
          background-color: #605ce5;
          color: white;
          font-weight: 600;
        }
      }

      .tag-toggle-item {
        min-height: 30px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--desc-color);
        font-size: 12px;
        cursor: pointer;
        user-select: none;
      }
    }
    .note-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 10px;
    }

    .tag-tree-skeleton {
      border-radius: 8px;
      padding: 12px;
      box-sizing: border-box;
      height: 100%;
    }

    .note-list-skeleton-wrap {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      padding: 0 10px;
      flex: 1;
    }

    .note-list-skeleton-item {
      min-height: 88px;
      border: 1px solid var(--card-border-color);
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .note-mobile-actions :deep(.noteType-select) {
    width: 100%;
    min-width: 0;
    justify-content: center;
  }

  .note-create-button {
    background: var(--resource-note-color, #00a884);
  }

  .note-create-button:hover {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 88%, #ffffff);
  }

  .note-workspace {
    --note-card-min-width: 320px;

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

    @supports (width: 1cqi) {
      // 以工作区宽度自适应:1470 左右保持可读卡宽,2560 左右自然落到 6 列。
      --note-card-min-width: clamp(320px, 15cqi, 460px);
    }
  }

  .note-library-body {
    height: 100%;
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
    height: 100%;
    padding: 12px;
    gap: 0;
  }

  .note-library-body-list .note-list,
  .note-library-body-list .note-list-skeleton-wrap {
    width: 100%;
    padding: 0 4px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  .note-empty-state {
    min-height: 100%;
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
