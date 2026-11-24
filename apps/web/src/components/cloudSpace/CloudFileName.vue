<template>
  <span class="cloud-file-name"
    ><span class="cloud-file-name__stem">{{ nameParts.stem }}</span
    ><span v-if="nameParts.extension" class="cloud-file-name__extension">{{ nameParts.extension }}</span></span
  >
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { getFilePreviewExtension } from '@lightnote/shared';

  const props = defineProps<{ fileName: string }>();
  const nameParts = computed(() => {
    const fileName = props.fileName ?? '';
    const extension = getFilePreviewExtension(fileName);
    const separator = extension.includes('.')
      ? fileName.trimEnd().length - extension.length - 1
      : fileName.lastIndexOf('.');
    if (!extension || separator <= 0) return { stem: fileName, extension: '' };
    return { stem: fileName.slice(0, separator), extension: fileName.slice(separator) };
  });
</script>

<style scoped>
  .cloud-file-name {
    display: flex;
    align-items: baseline;
    min-width: 0;
  }

  .cloud-file-name__stem,
  .cloud-file-name__extension {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cloud-file-name__extension {
    flex: none;
    max-width: calc(100% - 2ch);
  }
</style>
