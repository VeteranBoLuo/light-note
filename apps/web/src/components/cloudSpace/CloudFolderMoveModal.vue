<template>
  <component :is="shellComponent" v-bind="shellProps" v-on="shellListeners">
    <div class="cloud-folder-move">
      <p class="cloud-folder-move__hint">
        {{ t('cloudSpace.moveFolderHint', { name: folder?.name || '' }) }}
      </p>
      <CloudFolderPicker
        v-model:selected-id="selectedParentId"
        :folders="cloud.folderList"
        :disabled-ids="disabledIds"
        :top-level-label="t('cloudSpace.moveToTopLevel')"
        :disabled-label="t('cloudSpace.moveFolderTargetDisabled')"
        :empty-label="t('cloudSpace.noFoldersToManage')"
        :ariaLabel="t('cloudSpace.moveFolderTarget')"
      />
      <div v-if="bookmark.isMobile" class="cloud-folder-move__footer">
        <BButton type="primary" :loading="saving" @click="moveFolder">{{ t('common.confirm') }}</BButton>
        <BButton :disabled="saving" @click="close">{{ t('common.cancel') }}</BButton>
      </div>
    </div>
  </component>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import CloudFolderPicker from '@/components/cloudSpace/CloudFolderPicker.vue';
  import { apiBasePost } from '@/http/request';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import type { CloudFolderNode } from '@/types/cloudFolder';
  import { collectCloudFolderDescendantIds, cloudFolderSubtreeRelativeDepth } from '@/utils/cloudFolderTree';
  import { recordOperation } from '@/api/commonApi';

  const props = defineProps<{ folder: CloudFolderNode | null }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ moved: [] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const selectedParentId = ref<string | null>(null);
  const saving = ref(false);

  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value,
          title: t('cloudSpace.moveFolder'),
          placement: 'bottom' as const,
          height: 'min(82dvh, 680px)',
          bodyPadding: '12px 12px 0',
          maskClosable: false,
        }
      : {
          visible: visible.value,
          title: t('cloudSpace.moveFolder'),
          width: 'min(520px, 88vw)',
          height: 'min(620px, 78vh)',
          maskClosable: false,
        },
  );
  const shellListeners = computed(() =>
    bookmark.isMobile
      ? { close }
      : { ok: moveFolder, close, 'update:visible': (next: boolean) => (visible.value = next) },
  );

  const disabledIds = computed(() => {
    if (!props.folder) return [];
    const result = collectCloudFolderDescendantIds(cloud.folderList, props.folder.id);
    result.add(props.folder.id);
    const relativeDepth = cloudFolderSubtreeRelativeDepth(cloud.folderList, props.folder.id);
    for (const candidate of cloud.folderList) {
      if (candidate.depth + 1 + relativeDepth > cloud.folderMaxDepth) result.add(candidate.id);
    }
    return [...result];
  });

  function close() {
    if (!saving.value) visible.value = false;
  }

  async function moveFolder() {
    if (!props.folder || saving.value || disabledIds.value.includes(String(selectedParentId.value || ''))) return;
    const currentParentId = props.folder.parentId || null;
    if (currentParentId === selectedParentId.value) {
      visible.value = false;
      return;
    }
    saving.value = true;
    try {
      const response = await apiBasePost(
        '/api/file/moveFolder',
        { id: props.folder.id, parentId: selectedParentId.value },
        { silent: true },
      );
      if (response?.status !== 200) {
        message.error(response?.msg || t('cloudSpace.moveFolderFailed'));
        return;
      }
      recordOperation({ module: '云空间', operation: `移动文件夹成功【${props.folder.name}】` });
      message.success(t('cloudSpace.moveFolderSuccess', { name: props.folder.name }));
      visible.value = false;
      await cloud.queryFolder();
      emit('moved');
    } catch {
      message.error(t('cloudSpace.moveFolderFailed'));
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => visible.value,
    (open) => {
      if (open) selectedParentId.value = props.folder?.parentId || null;
    },
  );
</script>

<style lang="less" scoped>
  .cloud-folder-move {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cloud-folder-move__hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .cloud-folder-move__footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 8px 0 max(16px, env(safe-area-inset-bottom));
  }

  .cloud-folder-move__footer :deep(.b_btn) {
    width: 100%;
    min-height: 44px;
  }
</style>
