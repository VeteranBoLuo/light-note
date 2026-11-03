<template>
  <BSpace :size="15">
    <CloudStorageBar v-if="showControls && !bookmark.isMobile" />
    <BButton
      v-if="showControls"
      type="primary"
      class="upload-action"
      :class="{ 'upload-action--mobile': bookmark.isMobile }"
      :loading="upload.checking"
      :aria-label="t('cloudSpace.uploadFile')"
      @click="openFileDialog(cloud.folder.id === 'all' ? null : cloud.folder.id)"
    >
      <SvgIcon :src="icon.file_upload" size="17" />
      {{ bookmark.isDesktop ? t('cloudSpace.uploadFile') : '' }}
    </BButton>
  </BSpace>
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import useCloudUpload from '@/store/cloudUpload';
  import CloudStorageBar from './CloudStorageBar.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const { showControls = true } = defineProps<{ showControls?: boolean }>();
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const upload = useCloudUpload();
  const { t } = useI18n();
  const uploadSelectedFiles = (files: File[], folderId: string | null = null) => upload.enqueue(files, folderId);
  const openFileDialog = (folderId: string | null = null) => upload.openPicker(folderId);
  defineExpose({ uploadFiles: uploadSelectedFiles, uploadSelectedFiles, openFileDialog });
</script>

<style lang="less" scoped>
  .upload-action {
    height: var(--ui-layout-36, 36px);
    padding: 0 var(--ui-space-14, 14px);
    gap: var(--ui-space-7, 7px);
    border-radius: 10px;
    background: var(--resource-file-color);
  }
  .upload-action--mobile {
    width: var(--ui-layout-34, 34px);
    min-width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    padding: 0;
  }
</style>
