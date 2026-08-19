<template>
  <nav class="note-library-sidebar" :aria-label="t('note.libraryNavigation')">
    <BTabs v-if="tabs.length > 1" v-model:active-tab="activeTab" :options="tabs" variant="segment" />

    <div v-if="activeTab === 'directory'" class="note-directory-panel">
      <BInput
        v-model:value="directorySearch"
        class="note-tree-search"
        :placeholder="t('note.searchAllPages')"
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
          'is-browse-scope': surface === 'library' && browseParentId === null,
          'is-drop-candidate': dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start',
          'is-drop-target':
            dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start' && dropTargetActive,
          'is-drop-root-start': dropTargetKey === NOTE_TREE_ROOT_KEY && dropTargetPosition === 'root-start',
        }"
        :data-note-drop-parent="NOTE_TREE_ROOT_KEY"
        :data-note-drop-title="t('note.knowledgeRoot')"
        @click="surface === 'detail' ? emit('goLibrary') : emit('select', null)"
      >
        <SvgIcon :src="icon.noteTree.root" size="17" aria-hidden="true" />
        <span>{{ t('note.knowledgeRoot') }}</span>
        <span class="note-tree-root-count">{{ searchActive ? searchMatchCount : rootItems.length }}</span>
      </BButton>

      <div
        v-if="loadingKeys.has(NOTE_TREE_ROOT_KEY) && !rootItems.length"
        class="note-tree-loading"
        role="status"
        :aria-label="t('common.loading')"
      >
        <div v-for="n in 8" :key="`tree-skeleton-${n}`" class="note-tree-skeleton-row">
          <span class="note-tree-skeleton-icon" aria-hidden="true"></span>
          <span class="note-tree-skeleton-line" aria-hidden="true"></span>
        </div>
      </div>
      <ul v-else ref="treeScrollRef" v-auto-scrollbar class="note-tree-scroll">
        <NoteTreeRow
          v-for="node in rootItems"
          :key="node.id"
          :node="node"
          :depth="0"
          :active-page-id="activePageId"
          :browse-parent-id="browseParentId"
          :children-by-parent="childrenByParent"
          :expanded-ids="expandedIds"
          :loading-keys="loadingKeys"
          :motion-expansion-ids="motionExpansionIds"
          :write-enabled="writeEnabled"
          :drag-enabled="dragEnabled"
          :search-mode="searchActive"
          :drop-target-key="dropTargetKey"
          :drop-target-active="dropTargetActive"
          :drop-target-position="dropTargetPosition"
          :menu-disabled="menuDisabled"
          @toggle="emit('toggle', $event)"
          @open="emit('open', $event)"
          @browse-children="emit('browseChildren', $event)"
          @create="emit('create', $event)"
          @attach="emit('attach', $event)"
          @toggle-top="emit('toggleTop', $event)"
          @move="emit('move', $event)"
          @rename="emit('rename', $event)"
          @share="emit('share', $event)"
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

    <div v-else class="note-sidebar-outline">
      <slot name="outline" />
    </div>
  </nav>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteTreeRow from '@/components/noteLibrary/tree/NoteTreeRow.vue';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import icon from '@/config/icon';
  import type { NoteTreeItem } from '@/types/noteTree';
  import type { NoteTreeDropPosition } from '@/utils/noteTreeDrop';

  const props = withDefaults(
    defineProps<{
      currentParentId?: string | null;
      activePageId?: string | null;
      treeScrollTop?: number;
      browseParentId?: string | null;
      surface?: 'library' | 'detail';
      childrenByParent?: Record<string, NoteTreeItem[]>;
      expandedIds?: Set<string>;
      loadingKeys?: Set<string>;
      motionExpansionIds?: Set<string>;
      treeError?: string;
      searchValue?: string;
      directoryEnabled?: boolean;
      outlineEnabled?: boolean;
      writeEnabled?: boolean;
      dragEnabled?: boolean;
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
      childrenByParent: () => ({}),
      expandedIds: () => new Set<string>(),
      loadingKeys: () => new Set<string>(),
      searchValue: '',
      directoryEnabled: true,
      outlineEnabled: false,
      writeEnabled: true,
      dragEnabled: true,
      searchActive: false,
      searchLoading: false,
      searchMatchCount: 0,
      dropTargetKey: '',
      dropTargetActive: false,
      dropTargetPosition: '',
      menuDisabled: false,
      currentParentId: null,
      activePageId: null,
      treeScrollTop: 0,
      browseParentId: null,
      surface: 'library',
    },
  );

  const emit = defineEmits<{
    toggle: [node: NoteTreeItem];
    select: [id: string | null];
    open: [id: string];
    browseChildren: [id: string];
    goLibrary: [];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    share: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
    search: [value: string];
    dragStart: [node: NoteTreeItem, event: DragEvent];
    dragEnd: [];
  }>();
  const { t } = useI18n();
  const activeTab = defineModel<'directory' | 'outline'>('mode', { default: 'directory' });
  const tabs = computed(() => [
    ...(props.directoryEnabled ? [{ key: 'directory', label: t('note.pagesTab') }] : []),
    ...(props.outlineEnabled || props.surface === 'detail' ? [{ key: 'outline', label: t('note.outlineTab') }] : []),
  ]);
  const rootItems = computed(() => props.childrenByParent[NOTE_TREE_ROOT_KEY] || []);
  const treeScrollRef = ref<HTMLElement | null>(null);
  const directorySearch = computed({
    get: () => props.searchValue,
    set: (value: string) => emit('search', value),
  });
  watch(
    tabs,
    (options) => {
      if (options.some((option) => option.key === activeTab.value)) return;
      const first = options[0]?.key;
      if (first === 'directory' || first === 'outline') activeTab.value = first;
    },
    { immediate: true },
  );
  watch(
    treeScrollRef,
    async (element) => {
      if (!element || props.surface !== 'detail') return;
      await nextTick();
      element.scrollTop = Math.max(0, Number(props.treeScrollTop || 0));
    },
    { flush: 'post' },
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
  .note-sidebar-outline {
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

    &.is-browse-scope {
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
    min-height: 0;
    flex: 1;
    padding: 5px 6px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }

  .note-tree-skeleton-row {
    position: relative;
    height: 32px;
    flex: 0 0 auto;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 9px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--card-background);

    &::after {
      position: absolute;
      top: 0;
      left: -60%;
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
      animation: note-tree-skeleton-shine 2s infinite;
      content: '';
    }
  }

  .note-tree-skeleton-icon {
    width: 14px;
    height: 16px;
    flex: 0 0 auto;
    border-radius: 4px;
    background: var(--surface-border-color);
  }

  .note-tree-skeleton-line {
    width: 62%;
    height: 10px;
    border-radius: 999px;
    background: var(--surface-border-color);
  }

  .note-tree-skeleton-row:nth-child(3n + 2) {
    padding-left: 25px;

    .note-tree-skeleton-line {
      width: 54%;
    }
  }

  .note-tree-skeleton-row:nth-child(3n) .note-tree-skeleton-line {
    width: 72%;
  }

  @keyframes note-tree-skeleton-shine {
    0% {
      left: -60%;
    }

    100% {
      left: 120%;
    }
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

  @media (prefers-reduced-motion: reduce) {
    .note-tree-skeleton-row::after {
      animation: none;
    }
  }
</style>
