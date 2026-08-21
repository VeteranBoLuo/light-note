<template>
  <div v-auto-scrollbar class="cloud-folder-picker" role="listbox" :aria-label="ariaLabel">
    <BButton
      v-if="showTopLevel"
      class="cloud-folder-picker__row is-top-level"
      :class="{ 'is-selected': selectedId === null }"
      role="option"
      :aria-selected="selectedId === null"
      @click="select(null)"
    >
      <SvgIcon :src="icon.common.folder" size="17" aria-hidden="true" />
      <span class="cloud-folder-picker__name">{{ topLevelLabel }}</span>
    </BButton>

    <BButton
      v-for="folder in flatFolders"
      :key="folder.id"
      class="cloud-folder-picker__row"
      :class="{
        'is-selected': selectedId === folder.id,
        'is-disabled-target': disabledSet.has(folder.id),
      }"
      :style="{ '--cloud-folder-picker-depth': String(Math.min(folder.depth, 5)) }"
      :disabled="disabledSet.has(folder.id)"
      role="option"
      :aria-selected="selectedId === folder.id"
      :title="folder.fullPath"
      @click="select(folder.id)"
    >
      <SvgIcon :src="icon.common.folder" size="17" aria-hidden="true" />
      <span class="cloud-folder-picker__name">{{ folder.name }}</span>
      <span v-if="disabledSet.has(folder.id)" class="cloud-folder-picker__disabled">{{ disabledLabel }}</span>
    </BButton>

    <p v-if="!flatFolders.length" class="cloud-folder-picker__empty">{{ emptyLabel }}</p>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { flattenCloudFolderTree } from '@/utils/cloudFolderTree';

  const props = withDefaults(
    defineProps<{
      folders: CloudFolderNode[];
      selectedId?: string | null;
      disabledIds?: string[];
      showTopLevel?: boolean;
      topLevelLabel: string;
      disabledLabel: string;
      emptyLabel: string;
      ariaLabel: string;
    }>(),
    {
      selectedId: null,
      disabledIds: () => [],
      showTopLevel: true,
    },
  );
  const emit = defineEmits<{ 'update:selectedId': [id: string | null] }>();
  const flatFolders = computed(() => flattenCloudFolderTree(props.folders));
  const disabledSet = computed(() => new Set(props.disabledIds.map(String)));

  function select(id: string | null) {
    if (id && disabledSet.value.has(id)) return;
    emit('update:selectedId', id);
  }
</script>

<style lang="less" scoped>
  .cloud-folder-picker {
    max-height: min(56vh, 440px);
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 5px;
    padding: 2px;
  }

  .cloud-folder-picker__row {
    width: 100%;
    min-height: 42px;
    height: auto;
    justify-content: flex-start;
    gap: 9px;
    padding: 6px 10px 6px calc(10px + (var(--cloud-folder-picker-depth, 1) - 1) * 18px);
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
  }

  .cloud-folder-picker__row:hover,
  .cloud-folder-picker__row:focus-visible {
    background: var(--primary-btn-h-bg-color);
  }

  .cloud-folder-picker__row.is-selected {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 8%, var(--menu-body-bg-color));
    font-weight: 600;
  }

  .cloud-folder-picker__row.is-disabled-target {
    opacity: 0.5;
  }

  .cloud-folder-picker__name {
    min-width: 0;
    overflow: hidden;
    flex: 1 1 auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cloud-folder-picker__disabled {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 11px;
  }

  .cloud-folder-picker__empty {
    margin: 0;
    padding: 28px 12px;
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }

  html.light-note-mobile-rendering .cloud-folder-picker__row.is-selected {
    border-color: var(--resource-file-color, #ff8a00);
    color: var(--resource-file-color, #ff8a00);
  }
</style>
