<template>
  <div class="file-card-identity">
    <BTooltip class="file-card-name" :title="fileName" :aria-label="fileName">
      <CloudFileName :file-name="fileName" />
    </BTooltip>
    <div class="file-card-folder-hint" :aria-hidden="!folder || undefined">
      <div v-if="folder" class="file-card-folder" @click.stop @dragstart.stop.prevent>
        <SvgIcon class="file-card-folder__icon" :src="icon.common.folderOutline" size="13" aria-hidden="true" />
        <CloudFolderBreadcrumb
          :folders="folderPath?.length ? folderPath : [folder]"
          :disabled="disabled"
          @open-folder="emit('openFolder', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import CloudFileName from './CloudFileName.vue';
  import CloudFolderBreadcrumb from './CloudFolderBreadcrumb.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';

  type FolderLocation = Pick<CloudFolderNode, 'id' | 'name' | 'fullPath'>;
  defineProps<{
    fileName: string;
    folder?: FolderLocation | null;
    folderPath?: FolderLocation[];
    disabled?: boolean;
  }>();
  const emit = defineEmits<{ openFolder: [folder: FolderLocation] }>();
</script>

<style scoped>
  .file-card-identity {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
  }

  .file-card-name {
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    line-height: 1.4;
  }

  .file-card-folder-hint {
    min-height: var(--ui-control-24, 24px);
    min-width: 0;
  }

  .file-card-folder {
    display: flex;
    align-items: baseline;
    min-width: 0;
    width: 100%;
    gap: var(--ui-space-6, 6px);
    justify-content: flex-start;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    line-height: 1.4;
  }

  .file-card-folder__icon {
    flex: 0 0 auto;
  }

  html.light-note-mobile-rendering .file-card-folder-hint {
    min-height: var(--ui-control-32, 32px);
  }
</style>
