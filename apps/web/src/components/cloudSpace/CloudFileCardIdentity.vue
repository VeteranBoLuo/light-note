<template>
  <div class="file-card-identity">
    <BTooltip class="file-card-name" :title="fileName" :aria-label="fileName">
      <span class="file-card-name__stem">{{ nameParts.stem }}</span
      ><span v-if="nameParts.extension" class="file-card-name__extension">{{ nameParts.extension }}</span>
    </BTooltip>
    <div v-if="folder" class="file-card-folder-hint">
      <BButton
        class="file-card-folder"
        type="text"
        :disabled="disabled"
        :aria-label="t('cloudSpace.filterByFolder', { path: folder.fullPath })"
        @click.stop="emit('openFolder', folder)"
        @keydown.enter.stop
        @keydown.space.stop
      >
        <SvgIcon class="file-card-folder__icon" :src="icon.common.folderOutline" size="13" aria-hidden="true" />
        <span class="file-card-folder__path">{{ folder.fullPath }}</span>
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';

  type FolderLocation = Pick<CloudFolderNode, 'id' | 'name' | 'fullPath'>;
  const props = defineProps<{ fileName: string; folder?: FolderLocation | null; disabled?: boolean }>();
  const emit = defineEmits<{ openFolder: [folder: FolderLocation] }>();
  const { t } = useI18n();
  const nameParts = computed(() => {
    const index = props.fileName.lastIndexOf('.');
    return index > 0 && index < props.fileName.length - 1
      ? { stem: props.fileName.slice(0, index), extension: props.fileName.slice(index) }
      : { stem: props.fileName, extension: '' };
  });
</script>

<style scoped>
  .file-card-identity {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
  }

  .file-card-name {
    display: flex;
    align-items: baseline;
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    line-height: 1.4;
  }

  .file-card-name__stem {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card-name__extension {
    flex: 0 0 auto;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card-folder-hint {
    min-width: 0;
  }

  .file-card-folder.b_btn {
    min-width: 0;
    width: 100%;
    height: var(--ui-control-24, 24px);
    padding: 0;
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

  .file-card-folder__path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card-folder:not(:disabled):hover {
    color: var(--workspace-file-text);
  }

  .file-card-folder:not(:disabled):hover .file-card-folder__path {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  html.light-note-mobile-rendering .file-card-folder.b_btn {
    height: var(--ui-control-32, 32px);
  }
</style>
