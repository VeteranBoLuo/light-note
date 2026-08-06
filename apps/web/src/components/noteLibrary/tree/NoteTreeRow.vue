<template>
  <li class="note-tree-node">
    <div
      class="note-tree-row"
      :class="{ 'is-active': active, 'is-search-match': node.matched, 'has-invalid-parent': node.invalidParent }"
      :style="rowStyle"
    >
      <BButton
        class="note-tree-toggle"
        :class="{ 'is-expanded': expanded, 'is-loading': loading }"
        :disabled="!node.hasChildren || loading || searchMode"
        :aria-label="expanded ? t('note.treeCollapse') : t('note.treeExpand')"
        :aria-expanded="node.hasChildren ? expanded : undefined"
        @click.stop="emit('toggle', node)"
      >
        <SvgIcon v-if="node.hasChildren" :src="icon.noteTree.chevron" size="12" aria-hidden="true" />
        <span v-else class="note-tree-toggle-placeholder" aria-hidden="true"></span>
      </BButton>

      <BButton class="note-tree-title" @click="emit('select', node.id)">
        <SvgIcon :src="icon.resource.note" size="15" class="note-tree-page-icon" aria-hidden="true" />
        <span class="note-tree-title-text">{{ node.title || t('note.untitled') }}</span>
        <span v-if="node.childCount" class="note-tree-count">{{ node.childCount }}</span>
      </BButton>

      <div class="note-tree-actions">
        <BTooltip :title="t('note.openPageBody')">
          <BButton class="note-tree-action" :aria-label="t('note.openPageBody')" @click.stop="emit('open', node.id)">
            <SvgIcon :src="icon.noteTree.openPage" size="14" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip v-if="writeEnabled" :title="t('note.newChildPage')">
          <BButton class="note-tree-action" :aria-label="t('note.newChildPage')" @click.stop="emit('create', node)">
            <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BDropdown :trigger="'click'" :align="'right'" :menu-options="actionMenuOptions">
          <BButton class="note-tree-action" :aria-label="t('common.more')" @click.stop>
            <SvgIcon :src="icon.common.more" size="14" aria-hidden="true" />
          </BButton>
        </BDropdown>
      </div>
    </div>

    <ul v-if="expanded && children.length" class="note-tree-children">
      <NoteTreeRow
        v-for="child in children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :current-parent-id="currentParentId"
        :children-by-parent="childrenByParent"
        :expanded-ids="expandedIds"
        :loading-keys="loadingKeys"
        :write-enabled="writeEnabled"
        :search-mode="searchMode"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
        @open="emit('open', $event)"
        @create="emit('create', $event)"
        @move="emit('move', $event)"
        @rename="emit('rename', $event)"
        @copy-link="emit('copyLink', $event)"
        @delete="emit('delete', $event)"
      />
    </ul>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import type { NoteTreeItem } from '@/types/noteTree';

  const props = withDefaults(
    defineProps<{
      node: NoteTreeItem;
      depth: number;
      currentParentId: string | null;
      childrenByParent: Record<string, NoteTreeItem[]>;
      expandedIds: Set<string>;
      loadingKeys: Set<string>;
      writeEnabled?: boolean;
      searchMode?: boolean;
    }>(),
    { writeEnabled: true, searchMode: false },
  );

  const emit = defineEmits<{
    toggle: [node: NoteTreeItem];
    select: [id: string];
    open: [id: string];
    create: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    copyLink: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
  }>();
  const { t } = useI18n();
  const active = computed(() => props.currentParentId === props.node.id);
  const expanded = computed(() => props.expandedIds.has(props.node.id));
  const loading = computed(() => props.loadingKeys.has(props.node.id));
  const children = computed(() => props.childrenByParent[props.node.id || NOTE_TREE_ROOT_KEY] || []);
  const rowStyle = computed(() => ({ '--note-tree-depth': String(props.depth) }));
  const actionMenuOptions = computed(() => [
    {
      label: t('note.openPageBody'),
      icon: icon.noteTree.openPage,
      function: () => emit('open', props.node.id),
    },
    ...(props.writeEnabled
      ? [
          {
            label: t('note.newChildPage'),
            icon: icon.common.add,
            function: () => emit('create', props.node),
          },
        ]
      : []),
    {
      label: t('note.renamePage'),
      icon: icon.cloudSpace.rename,
      function: () => emit('rename', props.node),
    },
    ...(props.writeEnabled
      ? [
          {
            label: t('note.movePage'),
            icon: icon.noteTree.move,
            function: () => emit('move', props.node),
          },
        ]
      : []),
    {
      label: t('common.copyLink'),
      icon: icon.cloudSpace.preview.copy,
      function: () => emit('copyLink', props.node),
    },
    {
      key: 'note-tree-actions-divider',
      divider: true,
    },
    {
      label: t('note.moveToTrash'),
      icon: icon.table_delete,
      danger: true,
      function: () => emit('delete', props.node),
    },
  ]);
</script>

<style lang="less" scoped>
  .note-tree-node,
  .note-tree-children {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .note-tree-row {
    position: relative;
    min-width: 0;
    height: 34px;
    margin-block: 2px;
    padding-left: calc(var(--note-tree-depth) * 14px);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--desc-color);
    box-sizing: border-box;
    transition:
      color 160ms ease,
      border-color 160ms ease,
      background 160ms ease;

    &:hover {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, transparent);
    }

    &.is-active {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--workspace-panel-bg-color));
      font-weight: 650;
    }

    &.is-search-match:not(.is-active) {
      border-inline-start-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      font-weight: 700;
    }

    &.has-invalid-parent {
      border-style: dashed;
    }
  }

  .note-tree-toggle,
  .note-tree-title,
  .note-tree-action {
    min-width: 0;
    height: 30px;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent !important;
  }

  .note-tree-toggle {
    width: 22px;
    transition: transform 160ms ease;

    :deep(.icon-base64) {
      transform: rotate(-90deg);
      transition: transform 160ms ease;
    }

    &.is-expanded :deep(.icon-base64) {
      transform: rotate(0deg);
    }

    &.is-loading :deep(.icon-base64) {
      animation: note-tree-pulse 700ms ease-in-out infinite alternate;
    }
  }

  .note-tree-toggle-placeholder {
    width: 12px;
    height: 12px;
  }

  .note-tree-title {
    width: 100%;
    justify-content: flex-start;
    gap: 6px;
    padding-right: 72px;
    overflow: hidden;
    text-align: left;
  }

  .note-tree-page-icon {
    flex: 0 0 auto;
    color: var(--resource-note-color, #00a884);
  }

  .note-tree-title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-tree-count {
    margin-left: auto;
    color: var(--muted-text-color, var(--desc-color));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .note-tree-actions {
    position: absolute;
    right: 2px;
    top: 1px;
    height: 30px;
    display: flex;
    align-items: center;
    opacity: 0;
  }

  .note-tree-action {
    width: 23px;
  }

  .note-tree-row:hover .note-tree-actions,
  .note-tree-row:focus-within .note-tree-actions,
  .note-tree-row.is-active .note-tree-actions {
    opacity: 1;
  }

  @keyframes note-tree-pulse {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }
</style>
