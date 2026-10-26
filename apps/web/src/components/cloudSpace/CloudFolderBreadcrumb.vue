<template>
  <span class="cloud-folder-breadcrumb" @click.stop @dragstart.stop.prevent>
    <span v-for="(folder, index) in folders" :key="folder.id" class="cloud-folder-breadcrumb__part">
      <span v-if="index" class="cloud-folder-breadcrumb__separator" aria-hidden="true">/</span>
      <BButton
        class="cloud-folder-breadcrumb__link"
        type="text"
        :disabled="disabled"
        :title="folder.fullPath"
        :aria-label="t('cloudSpace.filterByFolder', { path: folder.fullPath })"
        @click.stop="emit('openFolder', folder)"
        @keydown.enter.stop
        @keydown.space.stop
      >
        <span>{{ folder.name }}</span>
      </BButton>
    </span>
  </span>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { CloudFolderNode } from '@/types/cloudFolder';

  type FolderLocation = Pick<CloudFolderNode, 'id' | 'name' | 'fullPath'>;
  defineProps<{ folders: FolderLocation[]; disabled?: boolean }>();
  const emit = defineEmits<{ openFolder: [folder: FolderLocation] }>();
  const { t } = useI18n();
</script>

<style scoped>
  .cloud-folder-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--ui-space-4, 4px);
    min-width: 0;
    color: var(--desc-color);
  }
  .cloud-folder-breadcrumb__part {
    display: inline-flex;
    align-items: baseline;
    min-width: 0;
    max-width: 100%;
    gap: var(--ui-space-4, 4px);
  }
  .cloud-folder-breadcrumb__separator {
    flex: 0 0 auto;
  }
  .cloud-folder-breadcrumb__link.b_btn {
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: var(--ui-control-24, 24px);
    padding: 0;
    color: var(--desc-color);
    font: inherit;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .cloud-folder-breadcrumb__link:not(:disabled):hover {
    color: var(--workspace-file-text);
  }
  .cloud-folder-breadcrumb__link:not(:disabled):hover > span {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  html.light-note-mobile-rendering .cloud-folder-breadcrumb__link.b_btn {
    min-height: var(--ui-control-32, 32px);
  }
</style>
