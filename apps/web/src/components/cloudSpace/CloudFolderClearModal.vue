<template>
  <BModal
    v-model:visible="visible"
    :title="t('cloudSpace.clearFolderFilesTitle')"
    :mask-closable="!submitting"
    :esc-closable="!submitting"
    :history-closable="!submitting"
    :close-disabled="submitting"
    width="min(480px, calc(100vw - 32px))"
  >
    <div class="cloud-folder-clear">
      <div class="cloud-folder-clear__intro">
        <span class="cloud-folder-clear__danger-icon" aria-hidden="true">
          <SvgIcon :src="icon.table_delete" size="20" />
        </span>
        <div>
          <strong>{{ t('cloudSpace.clearFolderFilesHeading') }}</strong>
          <p>{{ t('cloudSpace.clearFolderFilesDescription') }}</p>
        </div>
      </div>

      <div class="cloud-folder-clear__scope">
        <span>{{ t('cloudSpace.clearFolderFilesScope') }}</span>
        <strong :title="folder?.fullPath || folder?.name">{{ folder?.fullPath || folder?.name || '—' }}</strong>
        <div class="cloud-folder-clear__summary" aria-live="polite">
          <span>{{ t('cloudSpace.clearFolderFilesCount', { count: fileCount }) }}</span>
          <span>{{ t('cloudSpace.clearFolderSubfoldersCount', { count: subfolderCount }) }}</span>
        </div>
      </div>

      <div class="cloud-folder-clear__option" :class="{ 'is-checked': deleteFolders }">
        <BCheckbox v-model="deleteFolders" :disabled="submitting">
          {{ t('cloudSpace.clearFolderDeleteFoldersOption') }}
        </BCheckbox>
        <p>
          {{ t(deleteFolders ? 'cloudSpace.clearFolderDeleteFoldersHint' : 'cloudSpace.clearFolderKeepFoldersHint') }}
        </p>
      </div>

      <p v-if="errorMessage" class="cloud-folder-clear__error" role="alert">{{ errorMessage }}</p>
    </div>

    <template #footer>
      <div class="cloud-folder-clear__footer">
        <BButton :disabled="submitting" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="danger" :loading="submitting" :disabled="!folder" @click="submit">
          {{ t(deleteFolders ? 'cloudSpace.clearFolderFilesAndFoldersConfirm' : 'cloudSpace.clearFolderFilesConfirm') }}
        </BButton>
      </div>
    </template>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import icon from '@/config/icon.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { cloudSpaceStore } from '@/store';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { collectCloudFolderDescendantIds } from '@/utils/cloudFolderTree';

  const props = withDefaults(
    defineProps<{
      folder?: CloudFolderNode | null;
      folders?: CloudFolderNode[];
    }>(),
    {
      folder: null,
      folders: () => [],
    },
  );
  const emit = defineEmits<{
    cleared: [result: { deletedFileCount: number; deletedFolderCount: number; deleteFolders: boolean }];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const cloud = cloudSpaceStore();
  const deleteFolders = ref(false);
  const submitting = ref(false);
  const errorMessage = ref('');

  const affectedFolderIds = computed(() => {
    if (!props.folder) return new Set<string>();
    const ids = collectCloudFolderDescendantIds(props.folders, props.folder.id);
    ids.add(props.folder.id);
    return ids;
  });
  const subfolderCount = computed(() => Math.max(0, affectedFolderIds.value.size - (props.folder ? 1 : 0)));
  const fileCount = computed(() =>
    props.folders.reduce(
      (count, folder) =>
        affectedFolderIds.value.has(String(folder.id)) ? count + Number(folder.directFileCount || 0) : count,
      0,
    ),
  );

  async function submit() {
    if (!props.folder || submitting.value) return;
    submitting.value = true;
    errorMessage.value = '';
    const shouldDeleteFolders = deleteFolders.value;
    try {
      const response = await apiBasePost(
        '/api/file/clearFolderFiles',
        { id: props.folder.id, deleteFolders: shouldDeleteFolders },
        { silent: true },
      );
      if (response?.status !== 200) {
        errorMessage.value = response?.msg || t('cloudSpace.clearFolderFilesFailed');
        return;
      }

      const result = {
        deletedFileCount: Number(response.data?.deletedFileCount || 0),
        deletedFolderCount: Number(response.data?.deletedFolderCount || 0),
        deleteFolders: response.data?.deleteFolders === true,
      };
      if (result.deleteFolders && affectedFolderIds.value.has(String(cloud.folder.id))) {
        cloud.folder = { id: 'all', name: t('cloudSpace.allFile') };
      }
      if (result.deleteFolders) {
        await cloud.queryFolder();
        if (
          cloud.folder.id !== 'all' &&
          !cloud.folderList.some((folder) => String(folder.id) === String(cloud.folder.id))
        ) {
          cloud.folder = { id: 'all', name: t('cloudSpace.allFile') };
        }
        await cloud.queryFieldList();
      } else {
        await cloud.refreshAfterFileMutation();
      }
      recordOperation({
        module: '云空间',
        operation: result.deleteFolders
          ? `清空目录并删除文件夹【${props.folder.fullPath}】`
          : `清空目录文件【${props.folder.fullPath}】`,
      });
      message.success(
        t(
          result.deleteFolders ? 'cloudSpace.clearFolderFilesAndFoldersSuccess' : 'cloudSpace.clearFolderFilesSuccess',
          { count: result.deletedFileCount, folderCount: result.deletedFolderCount },
        ),
      );
      visible.value = false;
      emit('cleared', result);
    } catch {
      errorMessage.value = t('cloudSpace.clearFolderFilesFailed');
    } finally {
      submitting.value = false;
    }
  }

  watch(visible, (open) => {
    if (open) {
      deleteFolders.value = false;
      errorMessage.value = '';
    }
  });
</script>

<style lang="less" scoped>
  .cloud-folder-clear {
    display: grid;
    gap: 16px;
    color: var(--text-color);
  }

  .cloud-folder-clear__intro {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .cloud-folder-clear__danger-icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--danger-color, #e5484d);
    border-radius: 10px;
    color: var(--danger-color, #e5484d);
  }

  .cloud-folder-clear__intro strong {
    display: block;
    margin: 1px 0 4px;
    font-size: 15px;
    line-height: 1.45;
  }

  .cloud-folder-clear__intro p,
  .cloud-folder-clear__option p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }

  .cloud-folder-clear__scope,
  .cloud-folder-clear__option {
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color, var(--card-background));
  }

  .cloud-folder-clear__scope > span {
    display: block;
    margin-bottom: 6px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .cloud-folder-clear__scope > strong {
    display: block;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.5;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cloud-folder-clear__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .cloud-folder-clear__summary span {
    padding: 3px 8px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.4;
  }

  .cloud-folder-clear__option {
    transition: border-color 0.16s ease;
  }

  .cloud-folder-clear__option.is-checked {
    border-color: var(--danger-color, #e5484d);
  }

  .cloud-folder-clear__option p {
    padding: 4px 4px 0 26px;
  }

  .cloud-folder-clear__error {
    margin: -4px 0 0;
    color: var(--danger-color, #e5484d);
    font-size: 13px;
    line-height: 1.5;
  }

  .cloud-folder-clear__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 0 20px 20px;
  }

  html.light-note-mobile-rendering .cloud-folder-clear__footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  html.light-note-mobile-rendering .cloud-folder-clear__footer :deep(.b_btn) {
    width: 100%;
  }
</style>
