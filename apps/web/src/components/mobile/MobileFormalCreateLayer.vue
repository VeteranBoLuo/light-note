<template>
  <MobileFormalNoteCreateModal v-if="action === 'note'" :visible="true" @update:visible="closeAction" />
  <MobileCloudUploadDrawer
    v-if="action === 'file'"
    :open="true"
    :folders="cloud.folderList"
    :folder-loading="cloud.folderLoading"
    :default-folder-id="defaultUploadFolderId"
    @update:open="closeAction"
    @files="uploadFiles"
  />

  <!--
    上传进度与取消操作由既有上传器的 Teleport 承担。创建层首次打开后会在
    MobileAppShell 内持续挂载，因此用户关闭选文件抽屉或切换一级页面时上传不会中断。
  -->
  <HandleBtnGroup ref="uploadRunner" class="mobile-formal-create__upload-runner" :show-controls="false" />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
  import MobileCloudUploadDrawer from '@/components/cloudSpace/MobileCloudUploadDrawer.vue';
  import MobileFormalNoteCreateModal from '@/components/mobile/MobileFormalNoteCreateModal.vue';
  import type { MobileFormalCreateActionKey } from '@/config/mobileNavigation';
  import { cloudSpaceStore } from '@/store';
  import { resolveMobileUploadDefaultFolderId } from '@/utils/mobileUploadDestination';

  interface UploadRunnerExposed {
    uploadSelectedFiles: (files: File[], folderId?: string | null) => Promise<void>;
  }

  const action = defineModel<MobileFormalCreateActionKey | null>('action', { default: null });
  const uploadRunner = ref<UploadRunnerExposed | null>(null);
  const route = useRoute();
  const cloud = cloudSpaceStore();
  const defaultUploadFolderId = computed(() =>
    resolveMobileUploadDefaultFolderId(route.name, cloud.folder.id, cloud.folderList),
  );

  watch(
    action,
    (value) => {
      if (value === 'file') void cloud.queryFolder();
    },
    { immediate: true },
  );

  function closeAction(open = false) {
    if (!open) action.value = null;
  }

  function uploadFiles(files: File[], folderId: string | null) {
    void uploadRunner.value?.uploadSelectedFiles(files, folderId);
  }
</script>

<style scoped lang="less">
  .mobile-formal-create__upload-runner {
    display: none;
  }
</style>
