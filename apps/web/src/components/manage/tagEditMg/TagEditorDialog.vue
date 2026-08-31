<template>
  <BModal
    :visible="visible"
    :title="pageTitle"
    width="min(1180px, calc(100vw - 48px))"
    height="min(820px, calc(100vh - 48px))"
    modal-class="tag-editor-dialog"
    content-class="tag-editor-dialog__content"
    :show-footer="false"
    :mask-closable="false"
    :close-disabled="saving || deleting"
    initial-focus=".tag-editor-base .b-input"
    fullscreen-mobile
    @update:visible="handleModalVisibleUpdate"
    @close="requestCancel"
  >
    <BLoading :loading="loading" class="tag-editor-dialog__loading">
      <TagEditorForm
        v-model:tag="tag"
        v-model:active-resource-type="activeResourceType"
        :search-map="searchMap"
        :resource-sections="resourceSections"
        :active-resource-section="activeResourceSection"
        :total-selected-count="totalSelectedCount"
        :saving="saving"
        :can-delete="handleType === 'edit'"
        :deleting="deleting"
        @toggle-resource="toggleResource"
        @submit="submit"
        @cancel="requestCancel"
        @delete="requestDelete"
      />
    </BLoading>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { useTagEditor } from '@/composables/useTagEditor';
  import TagEditorForm from './TagEditorForm.vue';

  const props = defineProps<{ tagId: string }>();
  const emit = defineEmits<{
    saved: [id: string];
    deleted: [];
  }>();
  const visible = defineModel<boolean>('visible', { required: true });

  function closeDialog() {
    visible.value = false;
  }

  function handleModalVisibleUpdate(nextVisible: boolean) {
    // BModal 在没有识别到 close 监听器时会直接发出 update:visible；这里拦住该更新，
    // 统一交给编辑器的脏数据确认，避免标题栏关闭与 Escape 绕过“放弃修改”。
    if (!nextVisible && visible.value) requestCancel();
  }

  const {
    tag,
    loading,
    saving,
    activeResourceType,
    searchMap,
    handleType,
    pageTitle,
    totalSelectedCount,
    resourceSections,
    activeResourceSection,
    toggleResource,
    submit,
    requestCancel,
    deleting,
    requestDelete,
  } = useTagEditor({
    tagId: computed(() => props.tagId),
    onSaved(id) {
      closeDialog();
      emit('saved', id);
    },
    onDeleted() {
      closeDialog();
      emit('deleted');
    },
    onClose: closeDialog,
  });
</script>

<style lang="less">
  .tag-editor-dialog {
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .tag-editor-dialog__content {
    min-height: 0;
    padding: 14px 18px 18px;
    overflow: hidden;
  }

  .tag-editor-dialog__loading,
  .tag-editor-dialog__loading > div {
    height: 100%;
    min-height: 0;
  }

  .tag-editor-dialog .tag-editor-form {
    max-width: none;
  }

  @media (max-width: 767px) {
    .tag-editor-dialog__content {
      padding: 10px 12px 0;
      overflow: auto;
    }

    .tag-editor-dialog__loading,
    .tag-editor-dialog__loading > div {
      height: auto;
      min-height: 100%;
    }
  }
</style>
