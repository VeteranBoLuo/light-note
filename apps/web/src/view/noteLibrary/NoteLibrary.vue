<template>
  <ResourcePageShell
    :title="$t('note.title')"
    :subtitle="$t('note.subtitle')"
    accent="note"
    layout="workspace"
    :show-back="bookmark.isMobile"
    :title-actionable="!bookmark.isMobile"
    @back="backRouterPage"
    @title-click="resetNoteLibrary"
  >
    <template #meta>
      <span class="note-count-chip">{{
        $t('note.visibleCount', { visible: visibleDragNoteList.length, total: noteList.length })
      }}</span>
    </template>

    <template #actions>
      <template v-if="hasCheck">
        <span class="note-batch-summary">{{ $t('note.selectedCount', { count: selectedVisibleCount }) }}</span>
        <BButton class="note-action-button" @click="toggleSelectAllVisible">
          {{ allVisibleChecked ? $t('note.unselectAllCurrent') : $t('note.selectAllCurrent') }}
        </BButton>
        <BButton class="note-action-button" @click="openSelectedNotesAi('organize')">
          <SvgIcon :src="icon.ai.organize" size="16" />
          {{ $t('ai.entry.organizeSelected') }}
        </BButton>
        <BButton type="danger" class="note-action-button" @click="batchDeleteNote">
          <SvgIcon :src="icon.noteDetail.delete" size="16" />
          {{ $t('note.deleteSelected') }}
        </BButton>
        <BButton class="note-action-button" @click="exitBatch">{{ $t('note.exitBatch') }}</BButton>
      </template>
      <template v-else>
        <TagFilterSelector :all-tags="visibleNoteTags" />
        <ViewModeToggle v-if="!bookmark.isMobile" />
        <div v-if="!bookmark.isMobile" class="note-search" v-click-log="OPERATION_LOG_MAP.noteLibrary.searchNote">
          <BInput v-model:value="searchValue" :placeholder="$t('note.searchNote')" clearable>
            <template #prefix>
              <SvgIcon :src="icon.navigation.search" size="16" />
            </template>
          </BInput>
        </div>
        <BButton
          v-if="!bookmark.isMobile"
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

    <div class="note-workspace">
      <div v-if="loading && currentViewMode === 'card'" class="note-library-body note-card-skeleton-wrap">
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
            :batch-mode="hasCheck"
            @nodeTypeChange="handleNodeTypeChange"
            @action="handleNoteCardAction($event, note)"
          />
        </RightMenu>
      </VueDraggable>
      <div v-if="currentViewMode === 'list' && (loading || visibleDragNoteList.length)" class="note-library-body-list">
        <div v-if="loading" class="note-list note-list-skeleton-wrap">
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
      <div v-if="!loading && !visibleDragNoteList.length" class="note-empty-state">
        <span class="note-empty-icon"><SvgIcon :src="icon.resource.note" size="28" /></span>
        <strong>{{ $t('note.empty') }}</strong>
        <p>{{ $t('note.emptyHint') }}</p>
        <BButton type="primary" class="note-create-button" @click="showNewNotePicker">
          {{ $t('note.newNote') }}
        </BButton>
      </div>
    </div>

    <!-- 新建笔记类型选择 -->
    <ActionCardModal
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
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import { apiBasePost } from '@/http/request.ts';
  import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
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
  import { backRouterPage } from '@/utils/common';
  import ViewModeToggle from '@/components/base/ViewModeToggle.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import ActionCardModal from '@/components/base/ActionCardModal.vue';
  import { BUILTIN_NOTE_TEMPLATES, pickTemplateLocale } from '@/config/noteTemplates.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import RightMenu from '@/components/base/RightMenu.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import { openAiAssistant, type AiAssistantIntent } from '@/utils/aiEntry';
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
  const { addResourcesToInbox } = useInboxEnqueue();
  const noteList = ref([]);
  const visibleDragNoteList = ref<any[]>([]);
  const loading = ref(false);
  const showTypePicker = ref(false);
  const aiOrgVisible = ref(false); // AI 智能整理(笔记)弹框
  const tagConfigVisible = ref(false);
  const activeTagNote = ref<any | null>(null);
  // 用户自存模板(元信息,不含正文);打开 picker 时异步刷新,不阻塞弹窗展示
  const myTemplates = ref<Array<{ id: string; name: string; description?: string; type: string }>>([]);
  const myTemplatesState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
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
  function gotoNewNote(query: Record<string, string>) {
    showTypePicker.value = false;
    if (blockGuestWrite('add-note')) return;
    router.push({ path: '/noteLibrary/add', query });
  }
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
        actions: myTemplates.value.map((tpl) => ({
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
        actions: BUILTIN_NOTE_TEMPLATES.map((tpl) => ({
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
  function addNoteToInbox(note: any) {
    addResourcesToInbox([{ resourceType: 'note', resourceId: String(note.id) }], '笔记库');
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
      noteList.value = sortPinnedFirst(noteList.value);
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
    getAllTags();
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
  const user = useUserStore();
  const currentViewMode = computed(() => (bookmark.isMobile ? 'card' : user.preferences.noteViewMode));
  init();
  async function init() {
    loading.value = true;
    const res = await apiBasePost('/api/note/queryNoteList');
    if (res.status === 200) {
      noteList.value = buildSearchIndex(res.data ?? []);
      user.noteTotal = noteList.value.length;
      await getAllTags();
      loading.value = false;
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
  const searchValue = ref('');
  const debouncedSearch = ref('');
  const searchTimer = ref<number | null>(null);
  const canDragNote = computed(
    () =>
      !bookmark.isMobile &&
      !debouncedSearch.value &&
      visibleDragNoteList.value.length > 1 &&
      !noteList.value.some((note) => note.isCheck === true),
  );

  const toPlainText = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const buildSearchIndex = (list: any[]) =>
    list.map((note: any) => ({
      ...note,
      __searchTitle: (note.title || '').toLowerCase(),
      __searchContent:
        note.type === 'markdown' ? (note.content || '').toLowerCase() : toPlainText(note.content || '').toLowerCase(),
    }));

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

  async function resetNoteLibrary() {
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
    searchTimer.value = null;
    searchValue.value = '';
    debouncedSearch.value = '';
    exitBatch();
    await router.replace('/noteLibrary');
    await init();
  }

  onBeforeUnmount(() => {
    if (searchTimer.value) window.clearTimeout(searchTimer.value);
  });

  const viewNoteList = computed(() => {
    const keyword = debouncedSearch.value;

    const filteredNotes = noteList.value.filter((note) => {
      if (!keyword) return true;
      return note.__searchTitle.includes(keyword) || note.__searchContent.includes(keyword);
    });

    let tagFilter = router.currentRoute.value.query.tag;

    if (tagFilter === undefined || tagFilter === null) {
      return filteredNotes;
    }

    if (tagFilter === 'null') {
      return filteredNotes.filter((note) => !note.tags || note.tags.length === 0);
    }

    return filteredNotes.filter((note) => {
      if (!note.tags) return false;
      const parsed = note.tags;
      return Array.isArray(parsed) && parsed.some((t) => t.id === tagFilter);
    });
  });

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

  const allTags = ref<any[]>([]);
  const visibleNoteTags = computed(() => {
    return allTags.value.filter((tag) => Number(tag.noteCount || 0) > 0);
  });

  const selectedVisibleCount = computed(() => viewNoteList.value.filter((data) => data.isCheck === true).length);

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
  const hasCheck = computed(() => selectedVisibleCount.value > 0);
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
    noteList.value.forEach((data) => {
      data.isCheck = false;
    });
  }

  function batchDeleteNote() {
    if (blockGuestWrite('delete-note')) return;
    const delIds = viewNoteList.value.filter((data) => data.isCheck).map((item) => item.id) || [];
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('note.deleteSelectedConfirm'),
      onOk() {
        apiBasePost('/api/note/delNote', {
          ids: delIds,
        }).then((res) => {
          if (res.status === 200) {
            recordOperation({ module: '笔记库', operation: `批量删除笔记成功【${delIds.length}篇】` });
            message.success(t('common.deleteSuccess'));
            init();
          }
        });
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
    if (blockGuestWrite('reorder-note')) {
      visibleDragNoteList.value = [...viewNoteList.value]; // 拖拽库已就地改了 DOM 顺序,游客态复位视觉
      return;
    }
    const sourceNotes = [...noteList.value];
    try {
      const mergedNotes = moveVisibleNoteInAllNotes(sourceNotes, visibleDragNoteList.value, event);
      if (mergedNotes === sourceNotes) {
        visibleDragNoteList.value = [...viewNoteList.value];
        return;
      }
      // 置顶组始终位于普通组之前；组内仍保留用户刚完成的拖拽顺序。
      const groupedNotes = sortPinnedFirst(mergedNotes);
      const sortedTags =
        groupedNotes.map((note: any, index: number) => ({
          sort: index,
          id: note.id,
        })) || [];

      const res = await apiBasePost('/api/note/updateNoteSort', { notes: sortedTags });
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
    background: var(--background-color);
  }

  .note-card-skeleton,
  .note-list-skeleton-item {
    border-radius: 12px;
    padding: 14px;
    box-sizing: border-box;
  }

  .note-card-skeleton {
    height: 282px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, var(--desc-color) 18%);
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
  }
</style>
