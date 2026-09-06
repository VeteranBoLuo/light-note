<template>
  <BModal
    :title="t('cloudSpace.moveFileTitle')"
    :mask-closable="false"
    :close-disabled="moving"
    width="min(520px, 88vw)"
    height="min(620px, 78vh)"
    @ok="moveFile"
    v-model:visible="visible"
  >
    <CloudFolderPicker
      v-model:selected-id="checkValue"
      :folders="cloud.folderList"
      :top-level-label="t('cloudSpace.unfiledFiles')"
      :disabled-label="t('cloudSpace.moveFolderTargetDisabled')"
      :empty-label="t('cloudSpace.noFoldersToManage')"
      :ariaLabel="t('cloudSpace.moveFileTarget')"
    />
    <template #footer>
      <BButton :disabled="moving" @click="visible = false">{{ t('common.cancel') }}</BButton>
      <BButton type="primary" :loading="moving" @click="moveFile">{{ t('common.confirm') }}</BButton>
    </template>
  </BModal>
</template>

<script lang="ts" setup>
  import { useResourceSelectionStore, type SelectionOperation } from '@/store/resourceSelection';
  import type { PropType } from 'vue';
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import CloudFolderPicker from '@/components/cloudSpace/CloudFolderPicker.vue';
  import { cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const cloud = cloudSpaceStore();
  const selection = useResourceSelectionStore();
  const moving = ref(false);
  const checkValue = ref<string | null>(null);
  const { t } = useI18n();
  const props = defineProps({
    selectionOperation: { type: Object as PropType<SelectionOperation | null>, default: null },
    files: {
      type: Array,
      default: () => [],
    },
  });
  const emit = defineEmits(['moved']);
  const visible = defineModel('visible');

  async function moveFile() {
    if (moving.value || blockGuestWrite('move-file')) return;
    const operation = props.selectionOperation;
    if (operation && !selection.isCurrent(operation)) return;
    const fileIds = props.files?.map((file: any) => file.id).filter(Boolean) || [];
    if (!fileIds.length) return;
    moving.value = true;
    try {
      const response = await apiBasePost('/api/file/associateFile', {
        folderId: checkValue.value,
        fileIds,
      });
      if (operation && !selection.isCurrent(operation)) return;
      if (response.status !== 200) {
        message.error(response.msg || t('cloudSpace.moveFailed'));
        return;
      }
      recordOperation({ module: '云空间', operation: `移动文件成功【${fileIds.length}个】` });
      const successMessage =
        fileIds.length === 1
          ? t('cloudSpace.moveSuccess')
          : `${t('cloudSpace.batchMoveSuccess')} ${fileIds.length} ${t('cloudSpace.files')}`;
      message.success(successMessage);
      if (operation) selection.finish(operation);
      emit('moved');
      visible.value = false;
      await cloud.refreshAfterFileMutation();
    } catch {
      if (!operation || selection.isCurrent(operation)) message.error(t('cloudSpace.moveFailed'));
    } finally {
      moving.value = false;
    }
  }

  watch(
    () => visible.value,
    (open) => {
      if (!open && props.selectionOperation) selection.finish(props.selectionOperation);
      if (!open || props.files.length === 0) return;
      const firstFolderId = (props.files[0] as any)?.folderId;
      checkValue.value = firstFolderId == null || String(firstFolderId).trim() === '' ? null : String(firstFolderId);
    },
  );
</script>
