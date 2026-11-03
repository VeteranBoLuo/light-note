<template>
  <BDrawer
    :open="open"
    :title="t('cloudSpace.uploadFile')"
    placement="bottom"
    height="auto"
    body-padding="var(--ui-space-12, 12px) var(--ui-space-16, 16px) max(var(--ui-space-18, 18px), env(safe-area-inset-bottom))"
    @close="emit('update:open', false)"
  >
    <div class="mobile-cloud-upload">
      <div class="mobile-cloud-upload__intro">
        <span class="mobile-cloud-upload__icon" aria-hidden="true">
          <SvgIcon :src="icon.file_upload" size="22" />
        </span>
        <span>
          <strong>{{ t('mobileNavigation.createHub.file') }}</strong>
          <small>{{ t('cloudSpace.uploadMobileSelectionHint', { count: CLOUD_UPLOAD_MOBILE_SELECTION_LIMIT }) }}</small>
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
      <BButton block type="primary" class="mobile-cloud-upload__button" :loading="checking" @click="chooseFiles">
        <SvgIcon :src="icon.file_upload" size="17" aria-hidden="true" />
        {{ t('cloudSpace.chooseFiles') }}
      </BButton>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { flattenCloudFolderTree } from '@/utils/cloudFolderTree';
  import { CLOUD_UPLOAD_MOBILE_SELECTION_LIMIT } from '@/utils/cloudUploadQueue';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      folders?: CloudFolderNode[];
      defaultFolderId?: string | null;
      folderLoading?: boolean;
      checking?: boolean;
    }>(),
    {
      folders: () => [],
      defaultFolderId: null,
      folderLoading: false,
      checking: false,
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    choose: [folderId: string | null];
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

  function chooseFiles() {
    if (props.checking) return;
    emit('choose', selectedFolderValue.value === ROOT_FOLDER_VALUE ? null : selectedFolderValue.value);
    emit('update:open', false);
  }
</script>

<style scoped lang="less">
  .mobile-cloud-upload {
    display: grid;
    gap: var(--ui-space-14, 14px);
  }

  .mobile-cloud-upload__intro {
    min-height: var(--ui-layout-64, 64px);
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-divider-color);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    background: var(--surface-raised-background);
  }

  .mobile-cloud-upload__icon {
    width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: 10px;
    display: inline-flex;
    flex: 0 0 var(--ui-layout-38, 38px);
    align-items: center;
    justify-content: center;
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-cloud-upload__intro > span:last-child {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .mobile-cloud-upload__intro strong {
    font-size: var(--ui-font-14, 14px);
  }

  .mobile-cloud-upload__intro small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.45;
  }

  .mobile-cloud-upload__button {
    min-height: var(--ui-control-48, 48px);
    gap: var(--ui-space-7, 7px);
  }

  .mobile-cloud-upload__folder {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-7, 7px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }

  .mobile-cloud-upload__folder small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    line-height: 1.45;
  }

  .mobile-cloud-upload__folder :deep(.select-trigger) {
    min-height: var(--ui-control-44, 44px);
    border-radius: 10px;
  }

  :global(html.light-note-mobile-rendering .mobile-cloud-upload__intro) {
    border-color: var(--surface-divider-color);
    box-shadow: none;
  }
</style>
