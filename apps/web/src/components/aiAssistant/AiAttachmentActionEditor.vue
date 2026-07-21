<template>
  <section class="attachment-action-editor">
    <header class="attachment-action-editor__header">
      <div>
        <strong>{{ actionTitle }}</strong>
        <small>{{ draft.fileName || attachment.fileName }}</small>
      </div>
      <BButton
        size="small"
        :disabled="submitting"
        role="button"
        :tabindex="submitting ? -1 : 0"
        :aria-disabled="submitting"
        @click="$emit('close')"
        @keydown.enter.prevent="$emit('close')"
        @keydown.space.prevent="$emit('close')"
      >
        {{ t('common.cancel') }}
      </BButton>
    </header>

    <div v-if="draft.toolName === 'save_attachment_to_cloud'" class="attachment-action-editor__fields">
      <label class="attachment-action-field">
        <span>{{ t('ai.attachmentAction.fileName') }}</span>
        <BInput v-model:value="draft.fileName" :maxlength="255" />
        <small>{{ t('ai.attachmentAction.extensionHint') }}</small>
      </label>
      <label class="attachment-action-field">
        <span>{{ t('ai.attachmentAction.targetFolder') }}</span>
        <BSelect
          v-model:value="draft.folderId"
          :options="folderOptions"
          :placeholder="t('ai.attachmentAction.rootFolder')"
          :aria-label="t('ai.attachmentAction.targetFolder')"
          show-search
          @change="handleFolderSelect"
        />
        <small v-if="folderLoading">{{ t('ai.attachmentAction.loadingFolders') }}</small>
        <small v-else-if="folderLoadError" class="is-error">{{ folderLoadError }}</small>
      </label>
      <label class="attachment-action-field is-wide">
        <span>{{ t('ai.attachmentAction.customFolder') }}</span>
        <BInput
          v-model:value="draft.folderName"
          :maxlength="255"
          :placeholder="t('ai.attachmentAction.customFolderPlaceholder')"
          @input="handleFolderNameInput"
        />
        <small>{{ t('ai.attachmentAction.customFolderHint') }}</small>
      </label>
    </div>

    <div v-else class="attachment-action-editor__fields">
      <label class="attachment-action-field">
        <span>{{ t('ai.attachmentAction.noteTitle') }}</span>
        <BInput v-model:value="draft.title" :maxlength="255" />
      </label>
      <label class="attachment-action-field">
        <span>{{ t('ai.attachmentAction.imageDescription') }}</span>
        <BInput
          v-model:value="draft.description"
          type="textarea"
          :rows="2"
          :maxlength="5000"
          :placeholder="t('ai.attachmentAction.imageDescriptionPlaceholder')"
        />
      </label>
    </div>

    <p v-if="formError" class="attachment-action-editor__error" aria-live="polite">{{ formError }}</p>
    <footer class="attachment-action-editor__footer">
      <span>{{ t('ai.attachmentAction.confirmHint') }}</span>
      <BButton
        type="primary"
        size="small"
        :loading="submitting"
        role="button"
        :tabindex="submitting ? -1 : 0"
        :aria-disabled="submitting"
        @click="submit"
        @keydown.enter.prevent="submit"
        @keydown.space.prevent="submit"
      >
        {{ t('ai.attachmentAction.reviewAction') }}
      </BButton>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import { fetchAiCloudFolders, type AiAttachment } from '@/api/aiAttachmentApi';
  import {
    buildAttachmentActionRequest,
    preservesAttachmentExtension,
    type AiAttachmentActionDraft,
    type AiAttachmentActionRequest,
  } from './attachmentActions';

  const props = defineProps<{
    attachment: AiAttachment;
    initialDraft: AiAttachmentActionDraft;
    submitFn: (request: AiAttachmentActionRequest) => Promise<void>;
  }>();
  defineEmits<{ close: [] }>();

  const { t } = useI18n();
  const draft = ref<AiAttachmentActionDraft>({ ...props.initialDraft });
  const folders = ref<Array<{ id: string; name: string }>>([]);
  const folderLoading = ref(false);
  const folderLoadError = ref('');
  const formError = ref('');
  const submitting = ref(false);

  const actionTitle = computed(() =>
    draft.value.toolName === 'save_attachment_to_cloud'
      ? t('ai.saveAttachmentToCloud')
      : t('ai.createImageNoteFromAttachment'),
  );
  const folderOptions = computed(() => {
    const nameCounts = new Map<string, number>();
    folders.value.forEach((folder) => nameCounts.set(folder.name, (nameCounts.get(folder.name) || 0) + 1));
    return [
      { label: t('ai.attachmentAction.rootFolder'), value: '' },
      ...folders.value.map((folder) => ({
        label:
          (nameCounts.get(folder.name) || 0) > 1
            ? t('ai.attachmentAction.duplicateFolderOption', { name: folder.name, id: folder.id })
            : folder.name,
        value: folder.id,
      })),
    ];
  });

  function requestErrorMessage(error: any) {
    return error?.response?.data?.msg || error?.message || t('ai.attachmentAction.prepareFailed');
  }

  function validate() {
    formError.value = '';
    if (draft.value.toolName === 'save_attachment_to_cloud') {
      const fileName = draft.value.fileName.trim();
      if (!fileName) formError.value = t('ai.attachmentAction.fileNameRequired');
      else if (fileName.length > 255 || /[\\/<>]/.test(fileName))
        formError.value = t('ai.attachmentAction.fileNameInvalid');
      else if (!preservesAttachmentExtension(fileName, props.attachment.fileName))
        formError.value = t('ai.attachmentAction.fileExtensionMismatch');
      else if (draft.value.folderName.trim().length > 255) formError.value = t('ai.attachmentAction.folderNameInvalid');
    } else {
      const title = draft.value.title.trim();
      if (!title) formError.value = t('ai.attachmentAction.noteTitleRequired');
      else if (title.length > 255) formError.value = t('ai.attachmentAction.noteTitleInvalid');
      else if (draft.value.description.length > 5000) formError.value = t('ai.attachmentAction.descriptionTooLong');
    }
    return !formError.value;
  }

  function handleFolderSelect(value: string) {
    draft.value.folderId = String(value || '');
    draft.value.folderName = '';
    draft.value.folderStrategy = draft.value.folderId ? 'existing' : 'root';
  }

  function handleFolderNameInput(value: string) {
    draft.value.folderName = String(value || '');
    if (draft.value.folderName.trim()) {
      draft.value.folderId = '';
      // 用户重新输入名称时先按已有文件夹精确查找；不存在时由通用选择卡询问是否创建。
      draft.value.folderStrategy = 'existing';
    } else {
      draft.value.folderStrategy = 'root';
    }
  }

  async function loadFolders() {
    if (draft.value.toolName !== 'save_attachment_to_cloud') return;
    folderLoading.value = true;
    folderLoadError.value = '';
    try {
      folders.value = await fetchAiCloudFolders();
      if (draft.value.folderId && !folders.value.some((folder) => folder.id === draft.value.folderId)) {
        draft.value.folderId = '';
        folderLoadError.value = t('ai.attachmentAction.folderUnavailable');
      }
    } catch (error: any) {
      folderLoadError.value = requestErrorMessage(error);
    } finally {
      folderLoading.value = false;
    }
  }

  async function submit() {
    if (submitting.value || !validate()) return;
    submitting.value = true;
    formError.value = '';
    try {
      await props.submitFn(buildAttachmentActionRequest(draft.value));
    } catch (error: any) {
      formError.value = requestErrorMessage(error);
    } finally {
      submitting.value = false;
    }
  }

  onMounted(loadFolders);
</script>

<style scoped lang="less">
  .attachment-action-editor {
    display: grid;
    width: 100%;
    gap: 10px;
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--resource-file-color) 34%, var(--card-border-color));
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-file-color) 5%, var(--card-background));
    box-sizing: border-box;
  }
  .attachment-action-editor__header,
  .attachment-action-editor__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .attachment-action-editor__header > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .attachment-action-editor__header strong {
    font-size: 13px;
  }
  .attachment-action-editor__header small,
  .attachment-action-field small,
  .attachment-action-editor__footer span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .attachment-action-editor__header small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachment-action-editor__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .attachment-action-field {
    display: grid;
    min-width: 0;
    gap: 5px;
    color: var(--text-color);
    font-size: 12px;
  }
  .attachment-action-field.is-wide {
    grid-column: 1 / -1;
  }
  .attachment-action-field :deep(.b-select) {
    width: 100%;
  }
  .attachment-action-field :deep(.select-trigger) {
    width: 100%;
    box-sizing: border-box;
  }
  .attachment-action-editor__error,
  .attachment-action-field .is-error {
    margin: 0;
    color: var(--message-error-color);
    font-size: 12px;
  }
  .attachment-action-editor :deep(.b_btn) {
    min-height: 38px;
  }
  @media (max-width: 600px) {
    .attachment-action-editor__fields {
      grid-template-columns: 1fr;
    }
    .attachment-action-editor__footer {
      align-items: flex-end;
    }
    .attachment-action-editor :deep(.b_btn) {
      min-height: 44px;
    }
  }
</style>
