<template>
  <MobileFormalNoteCreateModal v-if="action === 'note'" :visible="true" @update:visible="closeAction" />
  <MobileCloudUploadDrawer
    v-if="action === 'file'"
    :open="true"
    :folders="cloud.folderList"
    :folder-loading="cloud.folderLoading"
    :checking="upload.checking"
    :default-folder-id="defaultUploadFolderId"
    @update:open="closeAction"
    @choose="chooseFiles"
  />
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import useCloudUpload from '@/store/cloudUpload';
  import MobileCloudUploadDrawer from '@/components/cloudSpace/MobileCloudUploadDrawer.vue';
  import MobileFormalNoteCreateModal from '@/components/mobile/MobileFormalNoteCreateModal.vue';
  import type { MobileFormalCreateActionKey } from '@/config/mobileNavigation';
  import { cloudSpaceStore } from '@/store';
  import { resolveMobileUploadDefaultFolderId } from '@/utils/mobileUploadDestination';

  const action = defineModel<MobileFormalCreateActionKey | null>('action', { default: null });
  const upload = useCloudUpload();
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

  function chooseFiles(folderId: string | null) {
    upload.openPicker(folderId);
  }
</script>
