<template>
  <BModal
    :title="t('cloudSpace.moveFileTitle')"
    :mask-closable="false"
    :close-disabled="moving"
    width="min(var(--ui-layout-520, 520px), 88vw)"
    height="min(var(--ui-layout-620, 620px), 78vh)"
    @ok="moveFile"
    v-model:visible="visible"
  >
    <div class="move-file-targets">
      <BInput v-model:value="folderQuery" :placeholder="t('cloudSpace.searchMoveFolders')" clearable>
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" aria-hidden="true" />
        </template>
      </BInput>
      <CloudFolderPicker
        v-model:selected-id="checkValue"
        :folders="cloud.folderList"
        :matching-ids="matchingFolderIds"
        :top-level-label="t('cloudSpace.unfiledFiles')"
        :disabled-label="t('cloudSpace.moveFolderTargetDisabled')"
        :empty-label="t('cloudSpace.noFoldersToManage')"
        :ariaLabel="t('cloudSpace.moveFileTarget')"
      />
    </div>
    <template #footer>
      <div class="move-file-footer">
        <BSpace>
          <BButton :disabled="moving" @click="visible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="moving" :disabled="targetHidden" @click="moveFile">
            {{ t('common.confirm') }}
          </BButton>
        </BSpace>
      </div>
    </template>
  </BModal>
</template>

<script lang="ts" setup>
  import { useResourceSelectionStore, type SelectionOperation } from '@/store/resourceSelection';
  import type { PropType } from 'vue';
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import CloudFolderPicker from '@/components/cloudSpace/CloudFolderPicker.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const cloud = cloudSpaceStore();
  const selection = useResourceSelectionStore();
  const moving = ref(false);
  const checkValue = ref<string | null>(null);
  const folderQuery = ref('');
  const matchingFolderIds = computed(() => {
    const keyword = folderQuery.value.trim().normalize('NFC').toLowerCase();
    if (!keyword) return undefined;
    return new Set(
      cloud.folderList
        .filter((folder) => folder.name.normalize('NFC').toLowerCase().includes(keyword))
        .map((folder) => folder.id),
    );
  });
  const targetHidden = computed(
    () => checkValue.value !== null && matchingFolderIds.value?.has(checkValue.value) === false,
  );
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
    if (moving.value || targetHidden.value || blockGuestWrite('move-file')) return;
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
      if (operation) {
        selection.removeConfirmed(
          operation,
          fileIds.map((id) => ({ id: String(id), type: 'file' as const })),
        );
        selection.finish(operation);
      }
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
      folderQuery.value = '';
      if (!open && props.selectionOperation) selection.finish(props.selectionOperation);
      if (!open || props.files.length === 0) return;
      const firstFolderId = (props.files[0] as any)?.folderId;
      checkValue.value = firstFolderId == null || String(firstFolderId).trim() === '' ? null : String(firstFolderId);
    },
  );
</script>

<style scoped>
  .move-file-targets {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    max-height: 100%;
  }

  .move-file-footer {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    padding: 0 var(--ui-space-20, 20px) var(--ui-space-16, 16px);
  }
</style>
