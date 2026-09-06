<template>
  <BModal
    v-model:visible="visible"
    :title="t('cloudSpace.folderTagsAction')"
    width="min(460px, calc(100vw - 28px))"
    :mask-closable="!loading"
    :close-disabled="loading"
    :esc-closable="!loading"
    :history-closable="!loading"
  >
    <div class="folder-tags">
      <div class="folder-tags__scope">
        <SvgIcon :src="icon.common.folder" size="24" />
        <strong>{{ folder?.fullPath || folder?.name }}</strong>
      </div>
      <p>{{ t('cloudSpace.folderTagsDescription') }}</p>
      <BCheckbox v-model="includeDescendants" :disabled="loading || !folder?.hasChildren">
        {{ t('cloudSpace.folderTagsRecursive') }}
      </BCheckbox>
      <p class="folder-tags__hint">{{
        t(includeDescendants ? 'cloudSpace.folderTagsRecursiveHint' : 'cloudSpace.folderTagsDirectHint')
      }}</p>
      <div class="folder-tags__count" role="status">{{ t('cloudSpace.folderTagsCount', { count: fileCount }) }}</div>
      <p v-if="error" class="folder-tags__error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="folder-tags__footer">
        <BButton :disabled="loading" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="loading" :disabled="!folder" @click="prepare">
          {{ t('resourceCenter.batch.selectTags') }}
        </BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import type { SelectedResource } from '@/store/resourceSelection';
  import { collectCloudFolderDescendantIds } from '@/utils/cloudFolderTree';

  const props = defineProps<{ folder: CloudFolderNode | null; folders: CloudFolderNode[] }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ prepared: [items: SelectedResource[]] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const includeDescendants = ref(false);
  const loading = ref(false);
  const error = ref('');
  let generation = 0;
  onBeforeUnmount(() => {
    generation++;
  });
  const fileCount = computed(() => {
    if (!props.folder) return 0;
    const ids = includeDescendants.value
      ? collectCloudFolderDescendantIds(props.folders, props.folder.id)
      : new Set<string>();
    ids.add(props.folder.id);
    return props.folders.reduce((count, folder) => count + (ids.has(folder.id) ? folder.directFileCount : 0), 0);
  });
  watch([visible, () => props.folder?.id, () => buildNoteDetailRequestScope(user)], () => {
    generation++;
    includeDescendants.value = false;
    loading.value = false;
    error.value = '';
  });
  watch(includeDescendants, () => {
    error.value = '';
  });

  async function prepare() {
    if (!props.folder || loading.value) return;
    const current = ++generation;
    const identity = buildNoteDetailRequestScope(user);
    loading.value = true;
    error.value = '';
    try {
      const response = await apiBasePost(
        '/api/search/batchSelectionPreview',
        {
          folderScope: { folderId: props.folder.id, includeDescendants: includeDescendants.value },
        },
        { silent: true },
      );
      if (current !== generation || !visible.value || identity !== buildNoteDetailRequestScope(user)) return;
      if (response.status !== 200 || !Array.isArray(response.data?.resolvedItems)) {
        error.value =
          response.data?.code === 'FOLDER_TAG_SELECTION_LIMIT'
            ? t('cloudSpace.folderTagsLimit', { count: MAX_EXPLICIT_RESOURCE_SELECTION })
            : t('cloudSpace.folderTagsLoadFailed');
        return;
      }
      if (!response.data.resolvedItems.length) {
        error.value = t('cloudSpace.folderTagsEmpty');
        return;
      }
      loading.value = false;
      emit('prepared', response.data.resolvedItems);
    } catch {
      if (current === generation) error.value = t('cloudSpace.folderTagsLoadFailed');
    } finally {
      if (current === generation) loading.value = false;
    }
  }
</script>

<style scoped lang="less">
  .folder-tags {
    display: grid;
    gap: 14px;
    color: var(--text-color);
  }
  .folder-tags p {
    margin: 0;
    line-height: 1.6;
  }
  .folder-tags__scope {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .folder-tags__scope :deep(.svg-icon) {
    flex-shrink: 0;
    color: var(--resource-file-color);
  }
  .folder-tags__scope strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .folder-tags__hint {
    font-size: 13px;
    color: var(--desc-color);
  }
  .folder-tags__count {
    border-top: 1px solid var(--surface-border-color);
    padding-top: 14px;
    font-weight: 600;
  }
  .folder-tags__error {
    color: var(--error-color);
  }
  .folder-tags__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--surface-border-color);
  }
  .folder-tags :deep(.b-checkbox),
  .folder-tags__footer :deep(.b_btn) {
    min-height: 44px;
  }
</style>
