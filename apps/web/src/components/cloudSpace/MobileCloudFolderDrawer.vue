<template>
  <BDrawer
    :open="open"
    :title="t('cloudSpace.folderTree')"
    placement="bottom"
    height="min(76dvh, 640px)"
    body-padding="10px 12px max(16px, env(safe-area-inset-bottom))"
    show-handle
    @close="emit('update:open', false)"
  >
    <div
      v-auto-scrollbar
      class="mobile-cloud-folder-drawer"
      :class="{ 'is-tree-mode': folderTreeMode }"
      role="tree"
      :aria-label="t('cloudSpace.folderTree')"
    >
      <BButton
        class="mobile-cloud-folder-drawer__all"
        :class="{ 'is-current': currentFolderId === 'all' }"
        role="treeitem"
        :aria-selected="currentFolderId === 'all'"
        @click="selectAll"
      >
        <span v-if="folderTreeMode" class="mobile-cloud-folder-drawer__toggle-spacer" aria-hidden="true"></span>
        <SvgIcon class="mobile-cloud-folder-drawer__folder" :src="icon.common.folder" size="18" aria-hidden="true" />
        <span class="mobile-cloud-folder-drawer__name">{{ t('cloudSpace.allFile') }}</span>
        <span class="mobile-cloud-folder-drawer__count">{{ allFileCount }}</span>
      </BButton>

      <BLoading v-if="loading && !folders.length" inline loading :title="t('common.loading')" />
      <template v-else>
        <div
          v-for="folder in visibleFolders"
          :key="folder.id"
          class="mobile-cloud-folder-drawer__row"
          :class="{ 'is-current': currentFolderId === folder.id }"
          :style="{ '--mobile-cloud-folder-depth': String(Math.min(folder.depth, 4)) }"
          role="treeitem"
          :aria-level="folder.depth"
          :aria-selected="currentFolderId === folder.id"
          :aria-expanded="folder.hasChildren ? expandedSet.has(folder.id) : undefined"
          tabindex="0"
          @click="selectFolder(folder)"
          @keydown.enter.self.prevent="selectFolder(folder)"
          @keydown.space.self.prevent="selectFolder(folder)"
        >
          <BButton
            v-if="folderTreeMode && folder.hasChildren"
            class="mobile-cloud-folder-drawer__toggle"
            :class="{ 'is-expanded': expandedSet.has(folder.id) }"
            :aria-label="
              t(expandedSet.has(folder.id) ? 'cloudSpace.collapseFolder' : 'cloudSpace.expandFolder', {
                name: folder.name,
              })
            "
            @click.stop="emit('toggle', folder.id)"
          >
            <SvgIcon
              class="mobile-cloud-folder-drawer__toggle-icon"
              :src="icon.noteTree.chevron"
              size="13"
              aria-hidden="true"
            />
          </BButton>
          <span v-else-if="folderTreeMode" class="mobile-cloud-folder-drawer__toggle-spacer" aria-hidden="true"></span>
          <BButton
            class="mobile-cloud-folder-drawer__select"
            :title="folder.fullPath"
            tabindex="-1"
            @click.stop="selectFolder(folder)"
          >
            <SvgIcon
              class="mobile-cloud-folder-drawer__folder"
              :src="icon.common.folder"
              size="18"
              aria-hidden="true"
            />
            <span class="mobile-cloud-folder-drawer__name">{{ folder.name }}</span>
            <span class="mobile-cloud-folder-drawer__count">{{ folder.directFileCount || '—' }}</span>
          </BButton>
        </div>
        <p v-if="!visibleFolders.length" class="mobile-cloud-folder-drawer__empty">
          {{ t('cloudSpace.noFoldersToManage') }}
        </p>
      </template>
    </div>
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { flattenCloudFolderTree } from '@/utils/cloudFolderTree';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      folders: CloudFolderNode[];
      currentFolderId: string;
      allFileCount?: number;
      expandedIds?: string[];
      loading?: boolean;
    }>(),
    { allFileCount: 0, expandedIds: () => [], loading: false },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    select: [folder: CloudFolderNode | null];
    toggle: [folderId: string];
  }>();
  const { t } = useI18n();
  const expandedSet = computed(() => new Set(props.expandedIds.map(String)));
  const folderTreeMode = computed(() => props.folders.some((folder) => folder.parentId !== null));
  const visibleFolders = computed(() => flattenCloudFolderTree(props.folders, expandedSet.value));

  function selectAll() {
    emit('select', null);
  }

  function selectFolder(folder: CloudFolderNode) {
    emit('select', folder);
  }
</script>

<style lang="less" scoped>
  .mobile-cloud-folder-drawer {
    min-height: 160px;
    max-height: calc(76vh - 92px);
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .mobile-cloud-folder-drawer__all,
  .mobile-cloud-folder-drawer__row {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    height: 44px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--text-color);
    background: var(--card-background);
  }

  .mobile-cloud-folder-drawer__all {
    justify-content: flex-start;
    gap: 7px;
    padding: 0 9px;
    font-size: 13px;
  }

  .mobile-cloud-folder-drawer__all.is-current,
  .mobile-cloud-folder-drawer__row.is-current {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 7%, var(--card-background));
    font-weight: 600;
  }

  .mobile-cloud-folder-drawer__name {
    min-width: 0;
    overflow: hidden;
    flex: 1 1 auto;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-cloud-folder-drawer__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    margin-left: calc((var(--mobile-cloud-folder-depth, 1) - 1) * 18px);
    width: calc(100% - (var(--mobile-cloud-folder-depth, 1) - 1) * 18px);
    padding: 0 9px;
  }

  .mobile-cloud-folder-drawer.is-tree-mode .mobile-cloud-folder-drawer__row {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .mobile-cloud-folder-drawer__select {
    width: 100%;
    min-width: 0;
    height: 42px;
    justify-content: flex-start;
    gap: 7px;
    padding: 0;
    border: 0 !important;
    color: inherit;
    background: transparent !important;
    font-size: 13px;
  }

  .mobile-cloud-folder-drawer__toggle,
  .mobile-cloud-folder-drawer__toggle-spacer {
    width: 22px;
    min-width: 22px;
    height: 42px;
    padding: 0;
  }

  .mobile-cloud-folder-drawer__toggle {
    border: 0 !important;
    color: var(--desc-color);
    background: transparent !important;
  }

  .mobile-cloud-folder-drawer__toggle-icon {
    display: inline-flex;
    transform: rotate(-90deg);
    transition: transform 0.18s ease;
  }

  .mobile-cloud-folder-drawer__toggle.is-expanded .mobile-cloud-folder-drawer__toggle-icon {
    transform: rotate(0deg);
  }

  @media (hover: hover) and (pointer: fine) {
    .mobile-cloud-folder-drawer__all:not(.is-current):hover,
    .mobile-cloud-folder-drawer__row:not(.is-current):hover {
      background: var(--category-item-ba-color);
    }

    .mobile-cloud-folder-drawer__toggle:hover {
      color: var(--resource-file-color, #ff8a00);
      background: transparent !important;
    }
  }

  .mobile-cloud-folder-drawer__all:focus-visible,
  .mobile-cloud-folder-drawer__row:focus-within {
    outline: 2px solid var(--focus-ring-color, var(--primary-color));
    outline-offset: 1px;
  }

  .mobile-cloud-folder-drawer__row.is-current .mobile-cloud-folder-drawer__select,
  .mobile-cloud-folder-drawer__row.is-current .mobile-cloud-folder-drawer__toggle,
  .mobile-cloud-folder-drawer__row.is-current .mobile-cloud-folder-drawer__count,
  .mobile-cloud-folder-drawer__all.is-current .mobile-cloud-folder-drawer__count {
    color: currentColor;
  }

  .mobile-cloud-folder-drawer__folder {
    flex: 0 0 auto;
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-cloud-folder-drawer__count {
    min-width: 18px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .mobile-cloud-folder-drawer__empty {
    margin: 0;
    padding: 28px 12px;
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }

  html.light-note-mobile-rendering .mobile-cloud-folder-drawer__all.is-current,
  html.light-note-mobile-rendering .mobile-cloud-folder-drawer__row.is-current {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
  }
</style>
