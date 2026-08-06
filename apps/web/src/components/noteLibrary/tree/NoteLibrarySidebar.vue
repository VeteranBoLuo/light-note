<template>
  <nav class="note-library-sidebar" :aria-label="t('note.libraryNavigation')">
    <BTabs v-model:active-tab="activeTab" :options="tabs" variant="segment" />

    <div v-if="activeTab === 'directory'" class="note-directory-panel">
      <BInput v-model:value="directorySearch" class="note-tree-search" :placeholder="t('note.searchPage')" clearable>
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="14" aria-hidden="true" />
        </template>
      </BInput>
      <BButton class="note-tree-root" :class="{ 'is-active': currentParentId === null }" @click="emit('select', null)">
        <SvgIcon :src="icon.noteTree.root" size="17" aria-hidden="true" />
        <span>{{ t('note.knowledgeRoot') }}</span>
        <span class="note-tree-root-count">{{ rootItems.length }}</span>
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
          @toggle="emit('toggle', $event)"
          @select="emit('select', $event)"
          @open="emit('open', $event)"
          @create="emit('create', $event)"
          @move="emit('move', $event)"
        />
      </ul>
      <p v-if="treeError" class="note-tree-error">{{ t('note.treeLoadFailed') }}</p>
    </div>

    <NoteTagSidebar
      v-else
      class="note-sidebar-tags"
      :all-tags="allTags"
      :total-count="totalCount"
      :untagged-count="untaggedCount"
      :loading="tagLoading"
    />
  </nav>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
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
    }>(),
    {
      treeError: '',
      allTags: () => [],
      totalCount: 0,
      untaggedCount: null,
      tagLoading: false,
      searchValue: '',
    },
  );

  const emit = defineEmits<{
    toggle: [node: NoteTreeItem];
    select: [id: string | null];
    open: [id: string];
    create: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    search: [value: string];
  }>();
  const { t } = useI18n();
  const activeTab = ref<'directory' | 'tags'>('directory');
  const tabs = computed(() => [
    { key: 'directory', label: t('note.directoryTab') },
    { key: 'tags', label: t('note.tagsTab') },
  ]);
  const rootItems = computed(() => props.childrenByParent[NOTE_TREE_ROOT_KEY] || []);
  const directorySearch = computed({
    get: () => props.searchValue,
    set: (value: string) => emit('search', value),
  });
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
</style>
