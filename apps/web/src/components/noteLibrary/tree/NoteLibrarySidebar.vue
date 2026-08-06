<template>
  <nav class="note-library-sidebar" :aria-label="t('note.libraryNavigation')">
    <BTabs v-model:active-tab="activeTab" :options="tabs" variant="segment" />

    <div v-if="activeTab === 'directory'" class="note-directory-panel">
      <BInput
        v-model:value="directorySearch"
        class="note-tree-search"
        :placeholder="t('note.searchPage')"
        :maxlength="120"
        clearable
      >
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="14" aria-hidden="true" />
        </template>
      </BInput>
      <BButton
        class="note-tree-root"
        :class="{
          'is-active': currentParentId === null,
          'is-drop-candidate': dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start',
          'is-drop-target':
            dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start' && dropTargetActive,
          'is-drop-root-start': dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start',
        }"
        :data-note-drop-parent="NOTE_TREE_ROOT_KEY"
        :data-note-drop-title="t('note.knowledgeRoot')"
        @click="emit('select', null)"
      >
        <SvgIcon :src="icon.noteTree.root" size="17" aria-hidden="true" />
        <span>{{ t('note.knowledgeRoot') }}</span>
        <span class="note-tree-root-count">{{ searchActive ? searchMatchCount : rootItems.length }}</span>
      </BButton>

      <div v-if="loadingKeys.has(NOTE_TREE_ROOT_KEY) && !rootItems.length" class="note-tree-loading">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <ul v-else v-auto-scrollbar class="note-tree-scroll">
        <NoteTreeRow
          v-for="node in rootItems"
          :key="node.id"
          :node="node"
          :depth="0"
          :current-parent-id="currentParentId"
          :children-by-parent="childrenByParent"
          :expanded-ids="expandedIds"
          :loading-keys="loadingKeys"
          :write-enabled="writeEnabled"
          :search-mode="searchActive"
          :drop-target-key="dropTargetKey"
          :drop-target-active="dropTargetActive"
          :drop-target-position="dropTargetPosition"
          :menu-disabled="menuDisabled"
          @toggle="emit('toggle', $event)"
          @select="emit('select', $event)"
          @open="emit('open', $event)"
          @create="emit('create', $event)"
          @attach="emit('attach', $event)"
          @toggle-top="emit('toggleTop', $event)"
          @move="emit('move', $event)"
          @rename="emit('rename', $event)"
          @copy-link="emit('copyLink', $event)"
          @delete="emit('delete', $event)"
          @drag-start="(node, event) => emit('dragStart', node, event)"
          @drag-end="emit('dragEnd')"
        />
      </ul>
      <p v-if="searchActive && !searchLoading && searchMatchCount === 0 && !treeError" class="note-tree-empty">
        {{ t('note.treeSearchEmpty') }}
      </p>
      <p v-if="treeError" class="note-tree-error">{{ t('note.treeLoadFailed') }}</p>
    </div>

    <NoteTagSidebar
      v-else
      class="note-sidebar-tags"
      :all-tags="allTags"
      :total-count="totalCount"
      :untagged-count="untaggedCount"
      :loading="tagLoading"
      defer-navigation
      @select="emit('selectTag', $event)"
    />
  </nav>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteTagSidebar from '@/components/noteLibrary/library/NoteTagSidebar.vue';
  import NoteTreeRow from '@/components/noteLibrary/tree/NoteTreeRow.vue';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import icon from '@/config/icon';
  import type { NoteTreeItem } from '@/types/noteTree';
  import type { NoteTreeDropPosition } from '@/utils/noteTreeDrop';

  const props = withDefaults(
    defineProps<{
      currentParentId: string | null;
      childrenByParent: Record<string, NoteTreeItem[]>;
      expandedIds: Set<string>;
      loadingKeys: Set<string>;
      treeError?: string;
      allTags?: any[];
      totalCount?: number;
      untaggedCount?: number | null;
      tagLoading?: boolean;
      searchValue?: string;
      directoryEnabled?: boolean;
      writeEnabled?: boolean;
      searchActive?: boolean;
      searchLoading?: boolean;
      searchMatchCount?: number;
      dropTargetKey?: string;
      dropTargetActive?: boolean;
      dropTargetPosition?: NoteTreeDropPosition | '';
      menuDisabled?: boolean;
    }>(),
    {
      treeError: '',
      allTags: () => [],
      totalCount: 0,
      untaggedCount: null,
      tagLoading: false,
      searchValue: '',
      directoryEnabled: true,
      writeEnabled: true,
      searchActive: false,
      searchLoading: false,
      searchMatchCount: 0,
      dropTargetKey: '',
      dropTargetActive: false,
      dropTargetPosition: '',
      menuDisabled: false,
    },
  );

  const emit = defineEmits<{
    toggle: [node: NoteTreeItem];
    select: [id: string | null];
    selectTag: [key: string];
    open: [id: string];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    copyLink: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
    search: [value: string];
    dragStart: [node: NoteTreeItem, event: DragEvent];
    dragEnd: [];
  }>();
  const { t } = useI18n();
  const activeTab = defineModel<'directory' | 'tags'>('mode', { default: 'directory' });
  const tabs = computed(() => [
    ...(props.directoryEnabled ? [{ key: 'directory', label: t('note.directoryTab') }] : []),
    { key: 'tags', label: t('note.tagsTab') },
  ]);
  const rootItems = computed(() => props.childrenByParent[NOTE_TREE_ROOT_KEY] || []);
  const directorySearch = computed({
    get: () => props.searchValue,
    set: (value: string) => emit('search', value),
  });
  watch(
    () => props.directoryEnabled,
    (enabled) => {
      if (!enabled && activeTab.value === 'directory') activeTab.value = 'tags';
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-library-sidebar {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :deep(.tab-container.is-segment) {
    flex: 0 0 auto;
    width: 100%;
  }

  :deep(.is-segment .tab) {
    flex: 1;
    justify-content: center;
  }

  .note-directory-panel,
  .note-sidebar-tags {
    flex: 1;
    min-height: 0;
  }

  .note-directory-panel {
    display: flex;
    flex-direction: column;
  }

  .note-tree-search {
    flex: 0 0 auto;
    margin-bottom: 5px;
  }

  .note-tree-search :deep(.b-input) {
    height: 34px;
    border-radius: 9px;
  }

  .note-tree-root {
    position: relative;
    width: 100%;
    height: 36px;
    flex: 0 0 auto;
    justify-content: flex-start;
    gap: 8px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--desc-color);
    background: transparent;

    &.is-active {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--workspace-panel-bg-color));
      font-weight: 650;
    }

    &.is-drop-candidate {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }

    &.is-drop-target {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 14%, var(--workspace-panel-bg-color));
    }

    &.is-drop-root-start {
      margin-bottom: 12px;
      transform: translateY(-2px);
      transition:
        margin 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
        transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    &.is-drop-root-start::after {
      position: absolute;
      right: 7px;
      bottom: -9px;
      left: 7px;
      height: 4px;
      border-radius: 999px;
      background: var(--resource-note-color, #00a884);
      content: '';
      pointer-events: none;
    }
  }

  .note-tree-root-count {
    margin-left: auto;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .note-tree-scroll {
    flex: 1;
    min-height: 0;
    margin: 4px 0 0;
    padding: 0 3px 0 0;
    overflow-y: auto;
    list-style: none;
  }

  .note-tree-loading {
    padding: 20px 8px;
  }

  .note-tree-error {
    margin: 6px 4px 0;
    color: var(--danger-color, #dc2626);
    font-size: 12px;
  }

  .note-tree-empty {
    margin: 12px 6px 0;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }
</style>
