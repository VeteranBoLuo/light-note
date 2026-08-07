<template>
  <li
    class="note-tree-node"
    :class="{ 'is-drop-before': showDropBefore, 'is-drop-after': showDropAfter }"
    :style="rowStyle"
    :data-note-drop-parent="showEdgeDrop ? node.id : undefined"
    :data-note-drop-title="showEdgeDrop ? node.title || t('note.untitled') : undefined"
    :data-note-tree-node-id="showEdgeDrop ? node.id : undefined"
    :data-note-tree-parent-id="showEdgeDrop ? node.parentId || NOTE_TREE_ROOT_KEY : undefined"
    :data-note-tree-pinned="showEdgeDrop ? (node.isTop ? '1' : '0') : undefined"
    :data-note-tree-drop-position="showDropBefore ? 'before' : showDropAfter ? 'after' : undefined"
  >
    <BActionMenu
      class="note-tree-action-menu"
      :items="actionMenuItems"
      :triggers="actionMenuTriggers"
      placement="right-start"
      :disabled="menuDisabled"
      :aria-label="t('common.more')"
      @select="handleActionMenuSelect"
    >
      <div
        class="note-tree-row"
        :class="{
          'is-active': active,
          'is-browse-scope': browsing,
          'is-search-match': node.matched,
          'has-invalid-parent': node.invalidParent,
          'is-drop-candidate': dropTargetKey === node.id && dropTargetPosition === 'inside',
          'is-drop-target': dropTargetKey === node.id && dropTargetPosition === 'inside' && dropTargetActive,
          'is-drop-before': dropTargetKey === node.id && dropTargetPosition === 'before',
          'is-drop-after': dropTargetKey === node.id && dropTargetPosition === 'after',
        }"
        :style="rowStyle"
        :draggable="writeEnabled && dragEnabled && !searchMode"
        :title="writeEnabled && dragEnabled && !searchMode ? t('note.dragPageHint') : undefined"
        :data-note-drop-parent="node.id"
        :data-note-drop-title="node.title || t('note.untitled')"
        :data-note-tree-node-id="node.id"
        :data-note-tree-parent-id="node.parentId || NOTE_TREE_ROOT_KEY"
        :data-note-tree-pinned="node.isTop ? '1' : '0'"
        @dragstart.stop="emit('dragStart', node, $event)"
        @dragend.stop="emit('dragEnd')"
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

        <BButton class="note-tree-title" @click="emit('open', node.id)">
          <SvgIcon :src="icon.resource.note" size="15" class="note-tree-page-icon" aria-hidden="true" />
          <span class="note-tree-title-text">{{ node.title || t('note.untitled') }}</span>
          <span v-if="node.isTop" class="note-tree-pin" :aria-label="t('common.pinned')">
            <SvgIcon :src="icon.contextMenu.pin" size="12" aria-hidden="true" />
          </span>
          <span v-if="node.childCount" class="note-tree-count">{{ node.childCount }}</span>
        </BButton>

        <div class="note-tree-actions">
          <BTooltip v-if="writeEnabled" :title="t('note.newChildPage')">
            <BButton class="note-tree-action" :aria-label="t('note.newChildPage')" @click.stop="emit('create', node)">
              <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>
      </div>
    </BActionMenu>

    <ul v-if="expanded && children.length" class="note-tree-children">
      <NoteTreeRow
        v-for="child in children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :active-page-id="activePageId"
        :browse-parent-id="browseParentId"
        :children-by-parent="childrenByParent"
        :expanded-ids="expandedIds"
        :loading-keys="loadingKeys"
        :write-enabled="writeEnabled"
        :drag-enabled="dragEnabled"
        :search-mode="searchMode"
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
        @copy-link="emit('copyLink', $event)"
        @delete="emit('delete', $event)"
        @drag-start="(childNode, event) => emit('dragStart', childNode, event)"
        @drag-end="emit('dragEnd')"
      />
    </ul>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import type { BActionMenuItem, BActionMenuTrigger } from '@/components/base/BasicComponents/actionMenu';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import type { NoteTreeItem } from '@/types/noteTree';
  import type { NoteTreeDropPosition } from '@/utils/noteTreeDrop';

  const props = withDefaults(
    defineProps<{
      node: NoteTreeItem;
      depth: number;
      activePageId?: string | null;
      browseParentId?: string | null;
      childrenByParent: Record<string, NoteTreeItem[]>;
      expandedIds: Set<string>;
      loadingKeys: Set<string>;
      writeEnabled?: boolean;
      dragEnabled?: boolean;
      searchMode?: boolean;
      dropTargetKey?: string;
      dropTargetActive?: boolean;
      dropTargetPosition?: NoteTreeDropPosition | '';
      menuDisabled?: boolean;
    }>(),
    {
      writeEnabled: true,
      dragEnabled: true,
      searchMode: false,
      dropTargetKey: '',
      dropTargetActive: false,
      dropTargetPosition: '',
      menuDisabled: false,
      activePageId: null,
      browseParentId: null,
    },
  );

  const emit = defineEmits<{
    toggle: [node: NoteTreeItem];
    open: [id: string];
    browseChildren: [id: string];
    create: [node: NoteTreeItem];
    attach: [node: NoteTreeItem];
    toggleTop: [node: NoteTreeItem];
    move: [node: NoteTreeItem];
    rename: [node: NoteTreeItem];
    copyLink: [node: NoteTreeItem];
    delete: [node: NoteTreeItem];
    dragStart: [node: NoteTreeItem, event: DragEvent];
    dragEnd: [];
  }>();
  const { t } = useI18n();
  const active = computed(() => props.activePageId === props.node.id);
  const browsing = computed(() => props.browseParentId === props.node.id && !active.value);
  const expanded = computed(() => props.expandedIds.has(props.node.id));
  const loading = computed(() => props.loadingKeys.has(props.node.id));
  const children = computed(() => props.childrenByParent[props.node.id || NOTE_TREE_ROOT_KEY] || []);
  const rowStyle = computed(() => ({ '--note-tree-depth': String(props.depth) }));
  const showDropBefore = computed(() => props.dropTargetKey === props.node.id && props.dropTargetPosition === 'before');
  const showDropAfter = computed(() => props.dropTargetKey === props.node.id && props.dropTargetPosition === 'after');
  const showEdgeDrop = computed(() => showDropBefore.value || showDropAfter.value);
  const actionMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu'];
  const actionMenuItems = computed<BActionMenuItem[]>(() => [
    ...(props.node.hasChildren
      ? [
          {
            key: 'browse-children',
            label: t('note.browseChildPages'),
            icon: icon.noteTree.chevron,
          },
        ]
      : []),
    ...(props.writeEnabled
      ? [
          {
            key: 'toggle-top',
            label: props.node.isTop ? t('common.unpin') : t('common.pin'),
            icon: props.node.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
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
        ]
      : []),
    ...(props.writeEnabled
      ? [
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
      key: 'copy-link',
      label: t('common.copyLink'),
      icon: icon.cloudSpace.preview.copy,
    },
    ...(props.writeEnabled
      ? [
          {
            key: 'note-tree-actions-divider',
            divider: true,
          },
          {
            key: 'delete',
            label: t('note.moveToTrash'),
            icon: icon.table_delete,
            danger: true,
          },
        ]
      : []),
  ]);

  function handleActionMenuSelect(action: string) {
    const actions: Record<string, () => void> = {
      'browse-children': () => emit('browseChildren', props.node.id),
      create: () => emit('create', props.node),
      attach: () => emit('attach', props.node),
      'toggle-top': () => emit('toggleTop', props.node),
      rename: () => emit('rename', props.node),
      move: () => emit('move', props.node),
      'copy-link': () => emit('copyLink', props.node),
      delete: () => emit('delete', props.node),
    };
    actions[action]?.();
  }
</script>

<style lang="less" scoped>
  .note-tree-node,
  .note-tree-children {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .note-tree-node {
    position: relative;
    transition: padding 180ms cubic-bezier(0.22, 0.61, 0.36, 1);

    &.is-drop-before {
      padding-top: 14px;
    }

    &.is-drop-after {
      padding-bottom: 14px;
    }

    &.is-drop-before::before,
    &.is-drop-after::after {
      position: absolute;
      z-index: 2;
      right: 5px;
      left: calc(var(--note-tree-depth) * 14px + 7px);
      height: 4px;
      border-radius: 999px;
      background: var(--resource-note-color, #00a884);
      content: '';
      pointer-events: none;
    }

    &.is-drop-before::before {
      top: 5px;
    }

    &.is-drop-after::after {
      bottom: 5px;
    }
  }

  .note-tree-action-menu {
    display: block;
    width: 100%;
    min-width: 0;
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

    &[draggable='true'] {
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }

    &:hover {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, transparent);
    }

    &.is-active {
      color: var(--resource-note-color, #00a884);
      border-color: transparent;
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 11%, var(--workspace-panel-bg-color));
      font-weight: 650;

      &::before {
        position: absolute;
        top: 7px;
        bottom: 7px;
        left: 2px;
        width: 3px;
        border-radius: 999px;
        background: var(--resource-note-color, #00a884);
        content: '';
      }
    }

    &.is-browse-scope {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      background: var(--workspace-panel-bg-color);
      font-weight: 600;
    }

    &.is-search-match:not(.is-active) {
      border-inline-start-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
      font-weight: 700;
    }

    &.has-invalid-parent {
      border-style: dashed;
    }

    &.is-drop-candidate {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }

    &.is-drop-target {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 14%, var(--workspace-panel-bg-color));
    }

    &.is-drop-before,
    &.is-drop-after {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
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
    padding-right: 28px;
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

  .note-tree-pin {
    flex: 0 0 auto;
    height: 18px;
    display: inline-flex;
    align-items: center;
    color: var(--primary-color);
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
