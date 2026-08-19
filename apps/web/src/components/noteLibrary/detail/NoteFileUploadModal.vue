<template>
  <BModal
    v-model:visible="visible"
    :title="t('noteDetail.editor.fileUpload.title')"
    width="min(480px, calc(100vw - 24px))"
    :show-footer="false"
    :mask-closable="!uploading"
    :esc-closable="!uploading"
    initial-focus="#note-file-upload-name"
    @close="requestClose"
  >
    <div v-if="file" class="note-file-upload">
      <div class="note-file-upload__summary">
        <span class="note-file-upload__icon" aria-hidden="true">
          <SvgIcon :src="icon.file_upload" size="24" />
        </span>
        <div>
          <strong :title="file.name">{{ file.name }}</strong>
          <span>{{ formatFileSize(file.size) }}</span>
        </div>
      </div>

      <template v-if="!savedFile">
        <label for="note-file-upload-name">{{ t('noteDetail.editor.fileUpload.name') }}</label>
        <div class="note-file-upload__name-row" :class="{ 'has-extension': Boolean(extension) }">
          <BInput
            id="note-file-upload-name"
            v-model:value="baseName"
            :maxlength="maxBaseNameLength"
            :disabled="uploading"
            :placeholder="t('noteDetail.editor.fileUpload.namePlaceholder')"
            submit-on-enter
            @enter="startUpload"
          />
          <span v-if="extension" class="note-file-upload__extension">{{ extension }}</span>
        </div>
        <p v-if="nameError" class="note-file-upload__error" role="alert">{{ nameError }}</p>

        <label id="note-file-upload-folder-label">{{ t('noteDetail.editor.fileUpload.folder') }}</label>
        <BSelect
          v-model:value="folderValue"
          :options="folderOptions"
          :loading="foldersLoading"
          :disabled="uploading"
          :aria-labelledby="'note-file-upload-folder-label'"
        />
        <p class="note-file-upload__hint">{{ t('noteDetail.editor.fileUpload.renameHint') }}</p>

        <div v-if="uploading" class="note-file-upload__progress">
          <BProgress
            :percent="progress"
            show-info
            :aria-label="t('noteDetail.editor.fileUpload.progress', { progress })"
          />
          <span>{{ t('noteDetail.editor.fileUpload.uploading') }}</span>
        </div>

        <div class="note-file-upload__actions">
          <BButton :disabled="uploading" @click="requestClose">{{ t('common.cancel') }}</BButton>
          <BButton v-if="uploading" type="danger" @click="cancelUpload">
            {{ t('noteDetail.editor.fileUpload.stop') }}
          </BButton>
          <BButton v-else type="primary" :disabled="Boolean(nameError)" @click="startUpload">
            {{ t('noteDetail.editor.fileUpload.uploadAndInsert') }}
          </BButton>
        </div>
      </template>

      <template v-else>
        <div class="note-file-upload__saved" role="status">
          <strong>{{ t('noteDetail.editor.fileUpload.savedTitle') }}</strong>
          <p>{{ t('noteDetail.editor.fileUpload.savedHint', { name: savedFile.filename }) }}</p>
        </div>
        <div class="note-file-upload__actions">
          <BButton @click="requestClose">{{ t('noteDetail.editor.fileUpload.done') }}</BButton>
          <BButton type="primary" @click="emit('retry-insert')">
            {{ t('noteDetail.editor.fileUpload.insertAtCurrent') }}
          </BButton>
        </div>
      </template>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import axios from 'axios';
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    fetchCloudFolders,
    uploadManagedCloudFile,
    type CloudUploadResult,
  } from '@/api/cloudFileUploadApi';

  const props = defineProps<{
    file: File | null;
    savedFile: CloudUploadResult | null;
  }>();
  const emit = defineEmits<{
    close: [];
    uploaded: [file: CloudUploadResult];
    'retry-insert': [];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const baseName = ref('');
  const extension = ref('');
  const folderValue = ref('__root__');
  const folders = ref<Array<{ id: string; name: string }>>([]);
  const foldersLoading = ref(false);
  const uploading = ref(false);
  const progress = ref(0);
  let uploadController: AbortController | null = null;
  let folderLoadVersion = 0;

  const maxBaseNameLength = computed(() => Math.max(1, 255 - extension.value.length));
  const finalName = computed(() => `${String(baseName.value || '').trim()}${extension.value}`);
  const nameError = computed(() => {
    const value = String(baseName.value || '').trim();
    if (!value) return t('noteDetail.editor.fileUpload.nameRequired');
    if (/[\\/<>\u0000-\u001f\u007f]/u.test(value) || value === '.' || value === '..') {
      return t('noteDetail.editor.fileUpload.nameInvalid');
    }
    if (finalName.value.length > 255) return t('noteDetail.editor.fileUpload.nameTooLong');
    return '';
  });
  const folderOptions = computed(() => [
    { value: '__root__', label: t('noteDetail.editor.fileUpload.rootFolder') },
    ...folders.value.map((folder) => ({ value: folder.id, label: folder.name })),
  ]);

  function splitFileName(fileName: string) {
    const normalized = String(fileName || '').normalize('NFC').trim();
    const dot = normalized.lastIndexOf('.');
    if (dot <= 0 || dot === normalized.length - 1) return { base: normalized, extension: '' };
    return { base: normalized.slice(0, dot), extension: normalized.slice(dot) };
  }

  function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  async function loadFolders() {
    const requestVersion = ++folderLoadVersion;
    foldersLoading.value = true;
    try {
      const items = await fetchCloudFolders();
      if (requestVersion === folderLoadVersion && visible.value) folders.value = items;
    } catch {
      if (requestVersion === folderLoadVersion && visible.value) folders.value = [];
    } finally {
      if (requestVersion === folderLoadVersion) foldersLoading.value = false;
    }
  }

  async function startUpload() {
    if (!props.file || uploading.value || nameError.value) return;
    uploading.value = true;
    progress.value = 0;
    uploadController = new AbortController();
    try {
      const result = await uploadManagedCloudFile(props.file, {
        fileName: finalName.value,
        folderId: folderValue.value === '__root__' ? null : folderValue.value,
        signal: uploadController.signal,
        onProgress: (value) => (progress.value = value),
      });
      emit('uploaded', result);
    } catch (error) {
      if (!axios.isCancel(error) && !(error instanceof DOMException && error.name === 'AbortError')) {
        const errorMessage = error instanceof Error ? error.message.replace(/^[A-Z0-9_]+:\s*/u, '') : '';
        // 弹框内保留所选名称和目录，用户可以直接重试。
        window.setTimeout(() => message.error(errorMessage || t('noteDetail.editor.fileUpload.failed')), 0);
      }
    } finally {
      uploading.value = false;
      uploadController = null;
    }
  }

  function cancelUpload() {
    uploadController?.abort();
  }

  function requestClose() {
    if (uploading.value) return;
    folderLoadVersion += 1;
    foldersLoading.value = false;
    visible.value = false;
    emit('close');
  }

  watch(
    () => [visible.value, props.file] as const,
    ([isVisible, file]) => {
      if (!isVisible || !file) return;
      const parts = splitFileName(file.name);
      baseName.value = parts.base || t('noteDetail.editor.fileUpload.defaultName');
      extension.value = parts.extension;
      folderValue.value = '__root__';
      progress.value = 0;
      void loadFolders();
    },
  );

  watch(visible, (isVisible) => {
    if (!isVisible && uploading.value) uploadController?.abort();
  });

  onBeforeUnmount(() => uploadController?.abort());
</script>

<style scoped lang="less">
  .note-file-upload {
    display: grid;
    gap: 12px;
    width: min(420px, 100%);
  }

  .note-file-upload > label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .note-file-upload__summary {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--primary-btn-bg-color);

    > div:last-child {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span:not(.note-file-upload__icon) {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .note-file-upload__icon {
    display: grid;
    flex: none;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 1px solid var(--resource-file-color, #ff8a00);
    border-radius: 10px;
    color: var(--resource-file-color, #ff8a00);
    background: var(--background-color);
  }

  .note-file-upload__name-row {
    display: flex;
    align-items: stretch;

    :deep(.input-container) {
      flex: 1;
      min-width: 0;
    }
  }

  .note-file-upload__extension {
    display: flex;
    align-items: center;
    flex: none;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-left: 0;
    border-radius: 0 6px 6px 0;
    color: var(--desc-color);
    background: var(--primary-btn-bg-color);
  }

  .note-file-upload__name-row.has-extension :deep(.b-input) {
    border-radius: 6px 0 0 6px;
  }

  .note-file-upload__hint,
  .note-file-upload__error,
  .note-file-upload__saved p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .note-file-upload__error {
    color: var(--error-color, #dc2626);
  }

  .note-file-upload__progress,
  .note-file-upload__saved {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--primary-btn-bg-color);
  }

  .note-file-upload__progress > span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-file-upload__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }

  @media (max-width: 600px) {
    .note-file-upload__actions > :deep(.b_btn) {
      flex: 1;
    }
  }
</style>
