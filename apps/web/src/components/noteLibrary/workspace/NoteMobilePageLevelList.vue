<template>
  <section class="note-mobile-page-level-list">
    <BInput
      v-model:value="searchValue"
      class="note-mobile-page-level-list__search"
      :placeholder="t('note.searchAllPages')"
      clearable
    >
      <template #prefix>
        <SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" />
      </template>
    </BInput>

    <nav v-if="!searchActive" class="note-mobile-page-level-list__breadcrumb" :aria-label="t('note.currentPath')">
      <BButton class="note-mobile-page-level-list__crumb" @click="browseRoot">
        {{ t('note.knowledgeRoot') }}
      </BButton>
      <template v-for="item in levelBreadcrumb" :key="item.id">
        <span aria-hidden="true">/</span>
        <BButton class="note-mobile-page-level-list__crumb" @click="browseLevel(item.id)">
          {{ item.title || t('note.untitled') }}
        </BButton>
      </template>
    </nav>

    <div v-if="loading" class="note-mobile-page-level-list__loading">
      <BLoading inline loading :title="t('common.loading')" />
    </div>
    <div v-else v-auto-scrollbar class="note-mobile-page-level-list__rows">
      <BButton v-if="!searchActive && levelParentId" class="note-mobile-page-level-list__up" @click="browseParent">
        <SvgIcon :src="icon.noteDetail.back" size="16" aria-hidden="true" />
        {{ t('note.parentLevel') }}
      </BButton>

      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="note-mobile-page-level-list__row"
        :class="{ 'is-current': item.id === currentPageId, 'is-selected': item.id === selectedPageId }"
      >
        <BButton class="note-mobile-page-level-list__title" @click="selectItem(item)">
          <SvgIcon
            :src="getNoteTreePageIcon(item.type)"
            size="18"
            class="note-mobile-page-level-list__format-icon"
            :class="{ 'is-markdown': isMarkdownNoteTreePage(item.type) }"
            aria-hidden="true"
          />
          <span>{{ item.title || t('note.untitled') }}</span>
          <span v-if="item.isTop" class="note-mobile-page-level-list__pin">
            <SvgIcon :src="icon.contextMenu.pin" size="12" :aria-label="t('common.pinned')" />
          </span>
          <span v-if="item.id === currentPageId" class="note-mobile-page-level-list__current">
            {{ t('note.currentPageShort') }}
          </span>
          <SvgIcon
            v-if="mode === 'scope' && item.id === selectedPageId"
            :src="icon.filterPanel.check"
            size="16"
            class="note-mobile-page-level-list__check"
            aria-hidden="true"
          />
        </BButton>
        <BButton
          v-if="item.hasChildren"
          class="note-mobile-page-level-list__enter"
          :aria-label="t('note.browseChildPages')"
          @click.stop="browseLevel(item.id)"
        >
          <SvgIcon :src="icon.arrow_right" size="17" aria-hidden="true" />
        </BButton>
        <BButton class="note-mobile-page-level-list__more" :aria-label="t('common.more')" @click="openPageActions(item)">
          <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
        </BButton>
      </div>

      <p v-if="!visibleItems.length" class="note-mobile-page-level-list__empty">
        {{ searchActive ? t('note.treeSearchEmpty') : t('note.noPagesAtLevel') }}
      </p>
    </div>
  </section>
  <MobilePageActionsDrawer
    v-model:open="pageActionDrawerOpen"
    :object-title="pageActionItem?.title || t('note.untitled')"
    :actions="pageActionOptions"
    @action="handlePageAction"
  />
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, {
    type MobilePageActionItem,
  } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import icon from '@/config/icon';
  import useNoteWorkspaceStore, { NOTE_TREE_ROOT_KEY } from '@/store/noteWorkspace';
  import type { NoteBreadcrumbItem, NoteTreeItem } from '@/types/noteTree';
  import { getNoteTreePageIcon, isMarkdownNoteTreePage } from '@/utils/noteTreePresentation';

  const props = withDefaults(
    defineProps<{
      open?: boolean;
      mode?: 'navigation' | 'scope';
      currentPageId?: string | null;
      selectedPageId?: string | null;
      initialParentId?: string | null;
      writeEnabled?: boolean;
    }>(),
    {
      open: false,
      mode: 'navigation',
      currentPageId: null,
      selectedPageId: null,
      initialParentId: null,
      writeEnabled: false,
    },
  );

  const emit = defineEmits<{
    openPage: [id: string];
    selectScope: [id: string | null];
    browse: [id: string | null];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    copyLink: [node: NoteTreeItem];
    share: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
  }>();
  const { t } = useI18n();
  const workspace = useNoteWorkspaceStore();
  const { childrenByParent, loadingKeys, treeSearchChildrenByParent, treeSearchKeyword, treeSearchLoading } =
    storeToRefs(workspace);
  const levelParentId = ref<string | null>(null);
  const levelBreadcrumb = ref<NoteBreadcrumbItem[]>([]);
  const searchValue = ref('');
  const pageActionDrawerOpen = ref(false);
  const pageActionItem = ref<NoteTreeItem | null>(null);
  let searchTimer = 0;

  const searchActive = computed(() => Boolean(treeSearchKeyword.value.trim()));
  const levelKey = computed(() => levelParentId.value || NOTE_TREE_ROOT_KEY);
  const loading = computed(
    () =>
      (searchActive.value && treeSearchLoading.value) || (!searchActive.value && loadingKeys.value.has(levelKey.value)),
  );

  function flattenSearchMatches() {
    const result: NoteTreeItem[] = [];
    const visited = new Set<string>();
    const visit = (items: NoteTreeItem[]) => {
      items.forEach((item) => {
        if (!item.id || visited.has(item.id)) return;
        visited.add(item.id);
        if (item.matched) result.push(item);
        visit(treeSearchChildrenByParent.value[item.id] || item.children || []);
      });
    };
    visit(treeSearchChildrenByParent.value[NOTE_TREE_ROOT_KEY] || []);
    return result;
  }

  const visibleItems = computed(() =>
    searchActive.value
      ? flattenSearchMatches()
      : childrenByParent.value[levelParentId.value || NOTE_TREE_ROOT_KEY] || [],
  );

  async function browseLevel(id: string | null) {
    levelParentId.value = id;
    if (!id) {
      levelBreadcrumb.value = [];
      await workspace.loadChildren(null);
    } else {
      levelBreadcrumb.value = await workspace.loadBreadcrumb(id);
      await workspace.loadChildren(id);
    }
    emit('browse', id);
  }

  function browseRoot() {
    void browseLevel(null);
  }

  function browseParent() {
    const parent = levelBreadcrumb.value.at(-2)?.id || null;
    void browseLevel(parent);
  }

  function selectItem(item: NoteTreeItem) {
    if (props.mode === 'scope') emit('selectScope', item.id);
    else if (item.id !== props.currentPageId) emit('openPage', item.id);
  }

  const pageActionOptions = computed<MobilePageActionItem[]>(() => {
    const item = pageActionItem.value;
    if (!item) return [];
    return [
      ...(item.hasChildren
        ? [
            {
              key: 'browse',
              label: t('note.browseChildPages'),
              icon: icon.noteTree.sidebarOpen,
            },
          ]
        : []),
      ...(props.writeEnabled
        ? [
            {
              key: 'toggleTop',
              label: item.isTop ? t('common.unpin') : t('common.pin'),
              icon: item.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
            },
            {
              key: 'create',
              label: t('note.newChildPage'),
              icon: icon.common.add,
            },
            {
              key: 'attach',
              label: t('note.addExistingPages'),
              icon: icon.noteTree.move,
            },
            {
              key: 'rename',
              label: t('note.renamePage'),
              icon: icon.cloudSpace.rename,
            },
            {
              key: 'move',
              label: t('note.moveThisPage'),
              icon: icon.noteTree.move,
            },
          ]
        : []),
      {
        key: 'copyLink',
        label: t('common.copyLink'),
        icon: icon.cloudSpace.preview.copy,
      },
      ...(props.writeEnabled
        ? [
            {
              key: 'share',
              label: t('noteShare.shareAction'),
              icon: icon.share,
            },
          ]
        : []),
      ...(props.writeEnabled
        ? [
            {
              key: 'delete',
              label: t('note.moveToTrash'),
              icon: icon.table_delete,
              danger: true,
              dividerBefore: true,
            },
          ]
        : []),
    ];
  });

  function openPageActions(item: NoteTreeItem) {
    pageActionItem.value = item;
    pageActionDrawerOpen.value = true;
  }

  function handlePageAction(action: MobilePageActionItem) {
    const item = pageActionItem.value;
    if (!item) return;
    if (action.key === 'browse') void browseLevel(item.id);
    else if (action.key === 'toggleTop') emit('toggleTop', item);
    else if (action.key === 'create') emit('create', item);
    else if (action.key === 'attach') emit('attach', item);
    else if (action.key === 'rename') emit('rename', item);
    else if (action.key === 'move') emit('move', item);
    else if (action.key === 'copyLink') emit('copyLink', item);
    else if (action.key === 'share') emit('share', item);
    else if (action.key === 'delete') emit('delete', item);
  }

  watch(
    () => props.open,
    (open) => {
      if (!open) return;
      searchValue.value = '';
      workspace.clearTreeSearch();
      void browseLevel(props.initialParentId || null);
    },
    { immediate: true },
  );

  watch(searchValue, (keyword) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void workspace.searchTree(keyword), 180);
  });

  onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<style scoped lang="less">
  .note-mobile-page-level-list {
    height: 100%;
    min-height: 0;
    padding: 0 16px 12px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .note-mobile-page-level-list__search :deep(.b-input) {
    height: 40px;
    border-radius: 10px;
  }

  .note-mobile-page-level-list__breadcrumb {
    height: 38px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow-x: auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-mobile-page-level-list__crumb,
  .note-mobile-page-level-list__up {
    height: 30px;
    padding: 0 4px;
    flex: 0 0 auto;
    border: 0;
    color: var(--desc-color);
    background: transparent;
  }

  .note-mobile-page-level-list__rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .note-mobile-page-level-list__loading {
    padding: 36px 0;
  }

  .note-mobile-page-level-list__row {
    min-height: 54px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 42px 42px;
    align-items: center;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--text-color);

    &.is-current {
      color: var(--resource-note-color, #00a884);
      font-weight: 680;
    }

    &.is-selected {
      border: 1px solid var(--resource-note-color, #00a884);
      border-radius: 10px;
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 9%, var(--menu-body-bg-color));
    }
  }

  .note-mobile-page-level-list__title {
    min-width: 0;
    min-height: 52px;
    padding: 0 8px;
    justify-content: flex-start;
    gap: 9px;
    color: inherit;
    border: 0;
    background: transparent;

    span:not(.note-mobile-page-level-list__current) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-mobile-page-level-list__format-icon {
    flex: 0 0 auto;
    color: var(--resource-note-color, #00a884);

    &.is-markdown {
      color: var(--primary-color, #615ced);
    }
  }

  .note-mobile-page-level-list__enter,
  .note-mobile-page-level-list__more {
    width: 38px;
    height: 38px;
    padding: 0;
    color: var(--desc-color);
    border: 0;
    background: transparent;
  }

  .note-mobile-page-level-list__current {
    margin-left: auto;
    flex: 0 0 auto;
    color: var(--resource-note-color, #00a884);
    font-size: 11px;
  }

  .note-mobile-page-level-list__pin,
  .note-mobile-page-level-list__check {
    flex: 0 0 auto;
    color: var(--primary-color, #615ced);
  }

  .note-mobile-page-level-list__empty {
    margin: 28px 0;
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }
</style>
