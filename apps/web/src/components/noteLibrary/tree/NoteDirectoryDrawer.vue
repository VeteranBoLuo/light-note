<template>
  <BDrawer
    :open="open"
    :title="t('note.chooseBrowseScope')"
    placement="bottom"
    height="min(88dvh, 760px)"
    body-padding="10px 12px max(10px, env(safe-area-inset-bottom))"
    :mask-closable="false"
    :history-closable="false"
    @close="requestClose"
  >
    <div class="note-directory-drawer">
      <BTabs v-model:active-tab="activeTab" :options="tabs" variant="segment" />

      <template v-if="activeTab === 'directory'">
        <nav class="note-drawer-breadcrumb" :aria-label="t('note.currentDirectory')">
          <BButton
            :class="{
              'is-current': browseParentId === null,
              'is-selected': props.currentParentId === null,
            }"
            :aria-current="browseParentId === null ? 'page' : undefined"
            @click="selectBreadcrumb(null)"
          >
            {{ t('note.knowledgeRoot') }}
          </BButton>
          <template v-for="item in breadcrumb" :key="item.id">
            <span aria-hidden="true">/</span>
            <BButton
              :class="{
                'is-current': item.id === browseParentId,
                'is-selected': item.id === props.currentParentId,
              }"
              :aria-current="item.id === browseParentId ? 'page' : undefined"
              @click="selectBreadcrumb(item.id)"
            >
              {{ item.title || t('note.untitled') }}
            </BButton>
          </template>
        </nav>

        <BButton
          class="note-drawer-current"
          :class="{ 'is-selected': isBrowsingSelectedDirectory }"
          :aria-pressed="isBrowsingSelectedDirectory"
          @click="selectDirectory(browseParentId)"
        >
          <SvgIcon :src="browseParentId ? icon.resource.note : icon.noteTree.root" size="17" aria-hidden="true" />
          <span>{{ browseTitle }}</span>
          <span class="note-drawer-current-action">
            {{ isBrowsingSelectedDirectory ? t('note.selectedDirectory') : t('note.selectThisDirectory') }}
          </span>
          <SvgIcon
            v-if="isBrowsingSelectedDirectory"
            class="note-drawer-current-check"
            :src="icon.filterPanel.check"
            size="15"
            aria-hidden="true"
          />
        </BButton>

        <BLoading v-if="loading" inline loading :title="t('common.loading')" />
        <div v-else v-auto-scrollbar class="note-drawer-directory-list">
          <div
            v-for="item in items"
            :key="item.id"
            class="note-drawer-directory-row"
            :class="{ 'has-children': item.hasChildren }"
            @click="selectDirectory(item.id)"
          >
            <BButton class="note-drawer-select" @click.stop="selectDirectory(item.id)">
              <SvgIcon
                :src="getNoteTreePageIcon(item.type)"
                size="18"
                class="note-drawer-page-icon"
                :class="{ 'is-markdown': isMarkdownNoteTreePage(item.type) }"
                aria-hidden="true"
              />
              <span class="note-drawer-row-title">{{ item.title || t('note.untitled') }}</span>
              <span v-if="item.isTop" class="note-drawer-row-pin" :aria-label="t('common.pinned')">
                <SvgIcon :src="icon.contextMenu.pin" size="13" aria-hidden="true" />
              </span>
              <span v-if="item.childCount" class="note-drawer-row-count">{{ item.childCount }}</span>
            </BButton>
            <BButton
              v-if="item.hasChildren"
              class="note-drawer-enter"
              :aria-label="t('note.browseChildPages')"
              @click.stop="browseTo(item.id)"
            >
              <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
            </BButton>
            <BDropdown :trigger="'click'" :align="'right'" :menu-options="directoryActions(item)" @click.stop>
              <BButton class="note-drawer-more" :aria-label="t('common.more')">
                <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
              </BButton>
            </BDropdown>
          </div>
          <p v-if="!items.length && !error" class="note-drawer-empty">{{ t('note.noSubpages') }}</p>
          <p v-if="error" class="note-drawer-error">{{ error }}</p>
        </div>
      </template>

      <NoteTagSidebar
        v-else
        class="note-drawer-tags"
        :all-tags="allTags"
        :total-count="totalCount"
        :untagged-count="untaggedCount"
        :loading="tagLoading"
        defer-navigation
        @select="selectTag"
      />
    </div>
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteTagSidebar from '@/components/noteLibrary/library/NoteTagSidebar.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import type { NoteBreadcrumbItem, NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';
  import { getNoteTreePageIcon, isMarkdownNoteTreePage } from '@/utils/noteTreePresentation';
  import {
    closeCurrentMobileOverlayThen,
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';

  const props = withDefaults(
    defineProps<{
      currentParentId: string | null;
      initialTab?: 'directory' | 'tags';
      allTags?: any[];
      totalCount?: number;
      untaggedCount?: number | null;
      tagLoading?: boolean;
      directoryEnabled?: boolean;
      writeEnabled?: boolean;
      loadDirectoryLevel?: (parentId: string | null) => Promise<{
        items: NoteTreeItem[];
        breadcrumb: NoteBreadcrumbItem[];
      }>;
    }>(),
    {
      initialTab: 'directory',
      allTags: () => [],
      totalCount: 0,
      untaggedCount: null,
      tagLoading: false,
      directoryEnabled: true,
      writeEnabled: true,
    },
  );
  const open = defineModel<boolean>('open', { default: false });
  const emit = defineEmits<{
    select: [parentId: string | null];
    selectTag: [key: string];
    openPage: [node: NoteTreeItem];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
  }>();
  const { t } = useI18n();
  const activeTab = ref<'directory' | 'tags'>('directory');
  const browseParentId = ref<string | null>(null);
  const breadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const items = ref<NoteTreeItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  let requestSeq = 0;
  let loadScheduleSeq = 0;
  let historyHandle: MobileOverlayHistoryHandle | null = null;
  let forceClosing = false;

  const tabs = computed(() => [
    ...(props.directoryEnabled ? [{ key: 'directory', label: t('note.pagesTab') }] : []),
    { key: 'tags', label: t('note.tagsTab') },
  ]);
  const browseTitle = computed(() => breadcrumb.value[breadcrumb.value.length - 1]?.title || t('note.knowledgeRoot'));
  const isBrowsingSelectedDirectory = computed(() => browseParentId.value === props.currentParentId);

  function registerHistory() {
    if (!open.value || historyHandle) return;
    historyHandle = registerMobileOverlayHistory(handleHistoryBack);
  }

  function handleHistoryBack() {
    historyHandle = null;
    if (forceClosing) {
      forceClosing = false;
      open.value = false;
      return;
    }
    if (activeTab.value === 'directory' && browseParentId.value) {
      const path = breadcrumb.value;
      browseParentId.value = path.length > 1 ? path[path.length - 2].id : null;
      registerHistory();
      void loadLevel();
      return;
    }
    open.value = false;
  }

  function requestClose() {
    forceClosing = true;
    if (requestMobileOverlayHistoryClose(historyHandle)) return;
    forceClosing = false;
    open.value = false;
  }

  async function closeThen(next: () => void | Promise<void>) {
    await closeCurrentMobileOverlayThen(() => {
      open.value = false;
    }, next);
  }

  async function selectDirectory(parentId: string | null) {
    await closeThen(() => emit('select', parentId));
  }

  async function selectBreadcrumb(parentId: string | null) {
    // 面包屑只切换抽屉内的层级并同步浏览范围，不应像完成选择一样关闭抽屉。
    browseParentId.value = parentId;
    emit('select', parentId);
    await loadLevel();
  }

  async function selectTag(key: string) {
    await closeThen(() => emit('selectTag', key));
  }

  async function closeAndEmit(
    kind: 'openPage' | 'create' | 'attach' | 'toggleTop' | 'move' | 'delete',
    node: NoteTreeItem,
  ) {
    await closeThen(() => {
      if (kind === 'openPage') emit('openPage', node);
      else if (kind === 'create') emit('create', node);
      else if (kind === 'attach') emit('attach', node);
      else if (kind === 'toggleTop') emit('toggleTop', node);
      else if (kind === 'move') emit('move', node);
      else emit('delete', node);
    });
  }

  function directoryActions(node: NoteTreeItem) {
    return [
      {
        label: t('note.openPageBody'),
        icon: icon.noteTree.openPage,
        function: () => closeAndEmit('openPage', node),
      },
      ...(props.writeEnabled
        ? [
            {
              label: node.isTop ? t('common.unpin') : t('common.pin'),
              icon: node.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
              function: () => closeAndEmit('toggleTop', node),
            },
            {
              label: t('note.newChildPage'),
              icon: icon.common.add,
              function: () => closeAndEmit('create', node),
            },
            {
              label: t('note.addExistingPages'),
              icon: icon.noteTree.move,
              function: () => closeAndEmit('attach', node),
            },
            {
              label: t('note.moveThisPage'),
              icon: icon.noteTree.move,
              function: () => closeAndEmit('move', node),
            },
          ]
        : []),
      ...(props.writeEnabled
        ? [
            {
              label: t('note.moveToTrash'),
              icon: icon.table_delete,
              danger: true,
              function: () => closeAndEmit('delete', node),
            },
          ]
        : []),
    ];
  }

  async function browseTo(parentId: string | null) {
    browseParentId.value = parentId;
    await loadLevel();
  }

  async function loadLevel() {
    const seq = ++requestSeq;
    loading.value = true;
    error.value = '';
    const parentId = browseParentId.value;
    try {
      if (props.loadDirectoryLevel) {
        const level = await props.loadDirectoryLevel(parentId);
        if (seq !== requestSeq || !open.value) return;
        items.value = Array.isArray(level.items) ? level.items : [];
        breadcrumb.value = Array.isArray(level.breadcrumb) ? level.breadcrumb : [];
        return;
      }
      const [treeResponse, breadcrumbResponse] = await Promise.all([
        apiBasePost('/api/note/queryNoteTree', { parentId, depth: 1 }, { silent: true }),
        parentId
          ? apiBasePost('/api/note/queryNoteBreadcrumb', { noteId: parentId }, { silent: true })
          : Promise.resolve({ status: 200, data: { items: [] } }),
      ]);
      if (seq !== requestSeq || !open.value) return;
      if (treeResponse.status !== 200 || breadcrumbResponse.status !== 200) {
        items.value = [];
        breadcrumb.value = [];
        error.value = treeResponse.msg || breadcrumbResponse.msg || t('note.treeLoadFailed');
        return;
      }
      const treeData = (treeResponse.data || {}) as NoteTreeQueryResult;
      items.value = Array.isArray(treeData.items) ? treeData.items : [];
      breadcrumb.value = Array.isArray(breadcrumbResponse.data?.items) ? breadcrumbResponse.data.items : [];
    } catch {
      if (seq === requestSeq) {
        items.value = [];
        breadcrumb.value = [];
        error.value = t('note.treeLoadFailed');
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function scheduleDirectoryLevelLoad() {
    const scheduleSeq = ++loadScheduleSeq;
    void nextTick(() => {
      if (scheduleSeq !== loadScheduleSeq || !open.value || activeTab.value !== 'directory') return;
      void loadLevel();
    });
  }

  watch(
    open,
    (isOpen) => {
      if (isOpen) {
        activeTab.value = props.directoryEnabled ? props.initialTab : 'tags';
        browseParentId.value = props.currentParentId;
        forceClosing = false;
        registerHistory();
        scheduleDirectoryLevelLoad();
        return;
      }
      loadScheduleSeq += 1;
      requestSeq += 1;
      if (historyHandle) releaseMobileOverlayHistory(historyHandle);
      historyHandle = null;
    },
    { immediate: true },
  );

  watch(activeTab, (tab) => {
    if (!open.value) return;
    void nextTick(registerHistory);
    if (tab === 'directory') scheduleDirectoryLevelLoad();
  });

  onBeforeUnmount(() => {
    loadScheduleSeq += 1;
    requestSeq += 1;
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
  });
</script>

<style lang="less" scoped>
  .note-directory-drawer {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .note-drawer-breadcrumb {
    min-width: 0;
    height: 30px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    color: var(--muted-text-color, var(--desc-color));
    scrollbar-width: none;

    > button {
      flex: 0 0 auto;
      height: 28px;
      padding: 0 4px;
      color: var(--desc-color);
      background: transparent;
      font-size: 12px;

      &.is-current {
        color: var(--text-color);
        font-weight: 650;
      }

      &.is-selected {
        color: var(--resource-note-color, #00a884);
      }
    }
  }

  .note-drawer-current {
    width: 100%;
    min-height: 42px;
    flex: 0 0 auto;
    padding: 6px 10px;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    font-weight: 500;
    transition:
      border-color 0.16s ease,
      color 0.16s ease,
      background-color 0.16s ease;

    .note-drawer-current-action {
      margin-left: auto;
      color: var(--resource-note-color, #00a884);
      font-size: 11px;
      font-weight: 650;
    }

    &:hover,
    &:focus-visible {
      border-color: var(--resource-note-color, #00a884);
    }

    &.is-selected {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--menu-body-bg-color));
      font-weight: 650;

      .note-drawer-current-action {
        color: inherit;
        font-weight: 500;
      }
    }
  }

  .note-drawer-directory-list,
  .note-drawer-tags {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .note-drawer-directory-row {
    min-width: 0;
    min-height: 56px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px;
    align-items: center;
    border-bottom: 1px solid var(--surface-border-color);
    cursor: pointer;

    &.has-children {
      grid-template-columns: minmax(0, 1fr) 48px 48px;
    }
  }

  .note-drawer-select,
  .note-drawer-enter,
  .note-drawer-more {
    min-width: 0;
    min-height: 52px;
    border: 0;
    color: var(--desc-color);
    background: transparent;
  }

  .note-drawer-select {
    width: 100%;
    height: 100%;
    padding: 7px 8px;
    justify-content: flex-start;
    gap: 8px;
  }

  .note-drawer-page-icon {
    flex: 0 0 auto;
    color: var(--resource-note-color, #00a884);

    &.is-markdown {
      color: var(--primary-color, #615ced);
    }
  }

  .note-drawer-row-title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-drawer-row-count {
    margin-left: auto;
    font-size: 11px;
  }

  .note-drawer-row-pin {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    color: var(--primary-color);
  }

  .note-drawer-enter,
  .note-drawer-more {
    width: 48px;
    padding: 0;
  }

  .note-drawer-empty,
  .note-drawer-error {
    margin: 18px 8px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .note-drawer-error {
    color: var(--danger-color, #dc2626);
  }
</style>
