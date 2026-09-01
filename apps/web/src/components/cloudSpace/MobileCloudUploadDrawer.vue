<template>
  <BDrawer
    :open="open"
    :title="t('cloudSpace.uploadFile')"
    placement="bottom"
    height="auto"
    body-padding="12px 16px max(18px, env(safe-area-inset-bottom))"
    @close="emit('update:open', false)"
  >
    <div class="mobile-cloud-upload">
      <div class="mobile-cloud-upload__intro">
        <span class="mobile-cloud-upload__icon" aria-hidden="true">
          <SvgIcon :src="icon.file_upload" size="22" />
        </span>
        <span>
          <strong>{{ t('mobileNavigation.createHub.file') }}</strong>
          <small>{{ t('mobileNavigation.createHub.fileDescription') }}</small>
        </span>
      </div>
      <label class="mobile-cloud-upload__folder">
        <span>{{ t('cloudSpace.uploadDestination') }}</span>
        <BSelect
          v-model:value="selectedFolderValue"
          :options="folderOptions"
          :loading="folderLoading"
          :aria-label="t('cloudSpace.uploadDestination')"
          @change="folderSelectionTouched = true"
        />
        <small>{{ t('cloudSpace.uploadDestinationHint') }}</small>
      </label>
      <BUpload block multiple raw-file :max-total-size="null" @change="handleFiles">
        <BButton block type="primary" class="mobile-cloud-upload__button">
          <SvgIcon :src="icon.file_upload" size="17" aria-hidden="true" />
          {{ t('cloudSpace.chooseFiles') }}
        </BButton>
      </BUpload>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { flattenCloudFolderTree } from '@/utils/cloudFolderTree';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      folders?: CloudFolderNode[];
      defaultFolderId?: string | null;
      folderLoading?: boolean;
    }>(),
    {
      folders: () => [],
      defaultFolderId: null,
      folderLoading: false,
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    files: [files: File[], folderId: string | null];
  }>();
  const { t } = useI18n();
  const ROOT_FOLDER_VALUE = '__root__';
  const selectedFolderValue = ref(ROOT_FOLDER_VALUE);
  const folderSelectionTouched = ref(false);
  const folderOptionSignature = computed(() => props.folders.map((folder) => folder.id).join('|'));
  const folderOptions = computed(() => [
    { value: ROOT_FOLDER_VALUE, label: t('cloudSpace.allFile') },
    ...flattenCloudFolderTree(props.folders).map((folder) => ({
      value: folder.id,
      label: folder.fullPath || folder.name,
    })),
  ]);

  function hasFolder(folderId: string) {
    return props.folders.some((folder) => folder.id === folderId);
  }

  function applyDefaultFolder() {
    const folderId = String(props.defaultFolderId || '').trim();
    selectedFolderValue.value = folderId && hasFolder(folderId) ? folderId : ROOT_FOLDER_VALUE;
  }

  watch(
    () => props.open,
    (open) => {
      if (!open) return;
      folderSelectionTouched.value = false;
      applyDefaultFolder();
    },
    { immediate: true },
  );
  watch(
    () => [props.defaultFolderId, folderOptionSignature.value],
    () => {
      if (!props.open) return;
      if (selectedFolderValue.value !== ROOT_FOLDER_VALUE && !hasFolder(selectedFolderValue.value)) {
        selectedFolderValue.value = ROOT_FOLDER_VALUE;
      }
      if (!folderSelectionTouched.value) applyDefaultFolder();
    },
  );

  function handleFiles(files: File[]) {
    if (!files.length) return;
    emit('files', files, selectedFolderValue.value === ROOT_FOLDER_VALUE ? null : selectedFolderValue.value);
    emit('update:open', false);
  }
</script>

<style scoped lang="less">
  .mobile-cloud-upload {
    display: grid;
    gap: 14px;
  }

  .mobile-cloud-upload__intro {
    min-height: 64px;
    padding: 12px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface-raised-background);
  }

  .mobile-cloud-upload__icon {
    width: 38px;
    height: 38px;
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: 10px;
    display: inline-flex;
    flex: 0 0 38px;
    align-items: center;
    justify-content: center;
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-cloud-upload__intro > span:last-child {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .mobile-cloud-upload__intro strong {
    font-size: 14px;
  }

  .mobile-cloud-upload__intro small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .mobile-cloud-upload__button {
    min-height: 48px;
    gap: 7px;
  }

  .mobile-cloud-upload__folder {
    min-width: 0;
    display: grid;
    gap: 7px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .mobile-cloud-upload__folder small {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
  }

  .mobile-cloud-upload__folder :deep(.select-trigger) {
    min-height: 44px;
    border-radius: 10px;
  }

  :global(html.light-note-mobile-rendering .mobile-cloud-upload__intro) {
    border-color: var(--surface-divider-color);
    box-shadow: none;
  }
</style>
