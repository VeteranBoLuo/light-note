<template>
  <BModal
    v-model:visible="visible"
    :title="t('changelog.editorTitle')"
    width="1180px"
    height="calc(100% - 32px)"
    modal-class="update-log-editor-modal"
    :show-footer="false"
    :mask-closable="false"
    :esc-closable="false"
    @close="requestClose"
  >
    <div v-if="loading" class="editor-loading">
      <BLoading :loading="true" inline :title="t('common.loading')" />
    </div>

    <div v-else class="update-log-editor">
      <div class="editor-meta-grid">
        <label class="editor-field editor-field--title">
          <span>{{ t('changelog.fields.title') }}</span>
          <BInput v-model:value="title" :maxlength="200" :placeholder="t('changelog.placeholders.title')" />
        </label>

        <label class="editor-field">
          <span>{{ t('changelog.fields.publishDate') }}</span>
          <BInput v-model:value="publishDate" type="date" />
        </label>

        <label class="editor-field">
          <span>{{ t('changelog.fields.status') }}</span>
          <BSelect v-model:value="status" :options="statusOptions" :aria-label="t('changelog.fields.status')" />
        </label>

        <label class="editor-field editor-field--summary">
          <span>{{ t('changelog.fields.summary') }}</span>
          <BInput v-model:value="summary" :maxlength="500" :placeholder="t('changelog.placeholders.summary')" />
        </label>

        <label class="editor-field">
          <span>{{ t('changelog.fields.tags') }}</span>
          <BInput v-model:value="tagsText" :placeholder="t('changelog.placeholders.tags')" />
        </label>
      </div>

      <div class="editor-content-head">
        <BTabs v-model:active-tab="activeTab" variant="segment" :options="editorTabs" />
        <span class="editor-count">{{ t('changelog.markdownCount', { count: contentMarkdown.length }) }}</span>
      </div>

      <div v-show="activeTab === 'edit'" class="markdown-editor-pane">
        <div class="markdown-toolbar" :aria-label="t('changelog.markdownToolbar')">
          <BButton
            size="small"
            :title="t('changelog.tools.heading')"
            @click="insertMarkdown('## ', '', t('changelog.snippets.heading'))"
          >
            H2
          </BButton>
          <BButton
            size="small"
            :title="t('changelog.tools.bold')"
            @click="insertMarkdown('**', '**', t('changelog.snippets.bold'))"
          >
            <strong>B</strong>
          </BButton>
          <BButton
            size="small"
            :title="t('changelog.tools.list')"
            @click="insertMarkdown('- ', '', t('changelog.snippets.listItem'))"
          >
            ≡
          </BButton>
          <BButton
            size="small"
            :title="t('changelog.tools.link')"
            @click="insertMarkdown('[', '](https://)', t('changelog.snippets.linkText'))"
          >
            {{ t('changelog.tools.link') }}
          </BButton>
          <BButton
            size="small"
            :title="t('changelog.tools.code')"
            @click="insertMarkdown('`', '`', t('changelog.snippets.code'))"
          >
            &lt;/&gt;
          </BButton>
          <BUpload
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            :multiple="false"
            :raw-file="true"
            :max-total-size="5 * 1024 * 1024"
            :disabled="uploading || !logId"
            :aria-label="t('changelog.uploadImage')"
            @change="uploadImage"
          >
            <BButton size="small" :loading="uploading" :disabled="!logId">
              {{ uploading ? t('changelog.uploading', { percent: uploadProgress }) : t('changelog.uploadImage') }}
            </BButton>
          </BUpload>
          <BSelect
            v-model:value="imageDisplaySize"
            class="image-size-select"
            :options="imageSizeOptions"
            :aria-label="t('changelog.imageSize')"
            @change="changeImageSize"
          />
        </div>

        <BInput
          ref="markdownInputRef"
          v-model:value="contentMarkdown"
          class="markdown-input"
          type="textarea"
          :rows="18"
          :maxlength="200000"
          :placeholder="t('changelog.placeholders.markdown')"
          @click="syncImageSizeFromCursor"
          @keyup="syncImageSizeFromCursor"
        />
      </div>

      <div v-show="activeTab === 'preview'" class="markdown-preview-pane">
        <div v-if="renderedPreview" class="markdown-body" v-html="renderedPreview" v-mermaid></div>
        <div v-else class="preview-empty">{{ t('changelog.previewEmpty') }}</div>
      </div>

      <div class="editor-footer">
        <BButton type="danger" :disabled="saving || deleting" :loading="deleting" @click="confirmDelete">
          {{ t('common.delete') }}
        </BButton>
        <div class="editor-footer-main">
          <span class="save-hint">
            {{ status === 'published' ? t('changelog.publishHint') : t('changelog.draftHint') }}
          </span>
          <BButton :disabled="saving || deleting" @click="requestClose">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="saving" :disabled="deleting" @click="save">
            {{ status === 'published' ? t('changelog.saveAndPublish') : t('changelog.saveDraft') }}
          </BButton>
        </div>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { noteContentToHtml } from '@/utils/common';
  import {
    createUpdateLogImageHtml,
    detectUpdateLogImageSizeAtCursor,
    resizeUpdateLogImageAtCursor,
    type UpdateLogImageSize,
  } from '@/utils/updateLogImageSize';
  import { recordOperation } from '@/api/commonApi';
  import {
    cleanupUpdateLogImages,
    deleteUpdateLog,
    listManagedUpdateLogs,
    saveUpdateLog,
    updateLogMarkdownSummaryItems,
    uploadUpdateLogImage,
    type UpdateLogItem,
    type UpdateLogStatus,
  } from '@/api/updateLogApi';

  const props = withDefaults(
    defineProps<{
      logId: string;
      discardOnClose?: boolean;
    }>(),
    {
      logId: '',
      discardOnClose: false,
    },
  );
  const emit = defineEmits<{
    saved: [item: UpdateLogItem];
    deleted: [id: string];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();

  const loading = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const imageDisplaySize = ref<UpdateLogImageSize>('medium');
  const activeTab = ref('edit');
  const title = ref('');
  const publishDate = ref('');
  const summary = ref('');
  const tagsText = ref('');
  const contentMarkdown = ref('');
  const status = ref<UpdateLogStatus>('draft');
  const imageKeys = ref<string[]>([]);
  const pendingImageKeys = ref<string[]>([]);
  const initialSnapshot = ref('');
  const savedOnce = ref(false);
  const markdownInputRef = ref<InstanceType<typeof BInput> | null>(null);
  const renderedPreview = ref('');
  let previewSequence = 0;

  const logId = computed(() => props.logId);
  const statusOptions = computed(() => [
    { label: t('changelog.status.draft'), value: 'draft' },
    { label: t('changelog.status.published'), value: 'published' },
  ]);
  const editorTabs = computed(() => [
    { label: t('changelog.tabs.edit'), key: 'edit' },
    { label: t('changelog.tabs.preview'), key: 'preview' },
  ]);
  const imageSizeOptions = computed(() => [
    { label: t('changelog.imageSizes.original'), value: 'original' },
    { label: t('changelog.imageSizes.small'), value: 'small' },
    { label: t('changelog.imageSizes.medium'), value: 'medium' },
    { label: t('changelog.imageSizes.large'), value: 'large' },
    { label: t('changelog.imageSizes.full'), value: 'full' },
  ]);

  function splitTags(value: string) {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function snapshot() {
    return JSON.stringify({
      title: title.value,
      publishDate: publishDate.value,
      summary: summary.value,
      tagsText: tagsText.value,
      contentMarkdown: contentMarkdown.value,
      status: status.value,
    });
  }

  const dirty = computed(() => snapshot() !== initialSnapshot.value || pendingImageKeys.value.length > 0);

  function applyItem(item: UpdateLogItem) {
    title.value = item.title || '';
    publishDate.value = item.publishDate || '';
    summary.value = item.summary || '';
    tagsText.value = (item.tags || []).join('，');
    contentMarkdown.value =
      item.contentMarkdown ||
      (item.highlights || [])
        .map((highlight, index) => `${index + 1}. ${highlight}`)
        .join('\n\n');
    status.value = item.status || 'draft';
    imageKeys.value = [...(item.imageKeys || [])];
    pendingImageKeys.value = [];
    initialSnapshot.value = snapshot();
    activeTab.value = 'edit';
  }

  async function loadEntry() {
    if (!logId.value) return;
    loading.value = true;
    try {
      const res = await listManagedUpdateLogs();
      if (res.status !== 200) {
        message.error(res.msg || t('changelog.errorInfo'));
        visible.value = false;
        return;
      }
      const item = (res.data?.items || []).find((entry: UpdateLogItem) => entry.id === logId.value);
      if (!item) {
        message.error(t('changelog.entryNotFound'));
        visible.value = false;
        return;
      }
      applyItem(item);
      savedOnce.value = false;
    } catch {
      message.error(t('changelog.errorInfo'));
      visible.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function updatePreview() {
    const sequence = ++previewSequence;
    const html = await noteContentToHtml(contentMarkdown.value, 'markdown');
    if (sequence === previewSequence) renderedPreview.value = html;
  }

  watch(
    [contentMarkdown, activeTab],
    () => {
      if (activeTab.value === 'preview') void updatePreview();
    },
    { immediate: true },
  );

  watch(
    () => [visible.value, logId.value] as const,
    ([open]) => {
      if (open) void loadEntry();
    },
    { immediate: true },
  );

  function insertMarkdown(before: string, after: string, placeholder: string) {
    const textarea = markdownInputRef.value?.inputEl as HTMLTextAreaElement | null | undefined;
    const start = textarea?.selectionStart ?? contentMarkdown.value.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = contentMarkdown.value.slice(start, end) || placeholder;
    contentMarkdown.value =
      contentMarkdown.value.slice(0, start) + before + selected + after + contentMarkdown.value.slice(end);
    const selectionStart = start + before.length;
    const selectionEnd = selectionStart + selected.length;
    void nextTick(() => {
      const nextTextarea = markdownInputRef.value?.inputEl as HTMLTextAreaElement | null | undefined;
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function syncImageSizeFromCursor() {
    const textarea = markdownInputRef.value?.inputEl as HTMLTextAreaElement | null | undefined;
    if (!textarea) return;
    const detected = detectUpdateLogImageSizeAtCursor(contentMarkdown.value, textarea.selectionStart);
    if (detected) imageDisplaySize.value = detected;
  }

  function changeImageSize(value: UpdateLogImageSize) {
    const textarea = markdownInputRef.value?.inputEl as HTMLTextAreaElement | null | undefined;
    if (!textarea) return;
    const result = resizeUpdateLogImageAtCursor(contentMarkdown.value, textarea.selectionStart, value);
    if (!result.changed) return;
    contentMarkdown.value = result.markdown;
    void nextTick(() => {
      const nextTextarea = markdownInputRef.value?.inputEl as HTMLTextAreaElement | null | undefined;
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(result.selectionStart, result.selectionStart);
    });
  }

  async function uploadImage(files: File[]) {
    const file = files[0];
    if (!file || uploading.value || !logId.value) return;
    uploading.value = true;
    uploadProgress.value = 0;
    try {
      const res = await uploadUpdateLogImage(logId.value, file, (percent) => {
        uploadProgress.value = percent;
      });
      if (res.status !== 200 || !res.data?.url || !res.data?.objectKey) {
        message.error(res.msg || t('changelog.imageUploadFailed'));
        return;
      }
      const objectKey = String(res.data.objectKey);
      imageKeys.value.push(objectKey);
      pendingImageKeys.value.push(objectKey);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '') || t('changelog.imageAlt');
      const prefix = contentMarkdown.value && !contentMarkdown.value.endsWith('\n') ? '\n\n' : '';
      contentMarkdown.value += `${prefix}${createUpdateLogImageHtml(
        res.data.url,
        alt,
        imageDisplaySize.value,
      )}\n`;
      message.success(t('changelog.imageUploadSuccess'));
    } catch {
      message.error(t('changelog.imageUploadFailed'));
    } finally {
      uploading.value = false;
      uploadProgress.value = 0;
    }
  }

  async function save() {
    if (saving.value || !logId.value) return;
    saving.value = true;
    try {
      const res = await saveUpdateLog({
        id: logId.value,
        title: title.value,
        publishDate: publishDate.value,
        summary: summary.value,
        highlights: updateLogMarkdownSummaryItems(contentMarkdown.value),
        tags: splitTags(tagsText.value),
        contentMarkdown: contentMarkdown.value,
        status: status.value,
      });
      if (res.status !== 200 || !res.data?.item) {
        message.error(res.msg || t('changelog.saveFailed'));
        return;
      }
      const item = res.data.item as UpdateLogItem;
      applyItem(item);
      savedOnce.value = true;
      message.success(status.value === 'published' ? t('changelog.publishSuccess') : t('changelog.draftSaved'));
      recordOperation({
        module: '更新日志',
        operation: status.value === 'published' ? `发布更新日志「${item.title}」` : `保存更新日志草稿「${item.title}」`,
      });
      emit('saved', item);
      visible.value = false;
    } catch {
      message.error(t('changelog.saveFailed'));
    } finally {
      saving.value = false;
    }
  }

  async function discardPendingImages() {
    if (!logId.value || !pendingImageKeys.value.length) return;
    const keys = [...pendingImageKeys.value];
    pendingImageKeys.value = [];
    await cleanupUpdateLogImages(logId.value, keys).catch(() => {});
  }

  async function closeAfterDiscard() {
    await discardPendingImages();
    if (props.discardOnClose && !savedOnce.value && logId.value) {
      await deleteUpdateLog(logId.value).catch(() => {});
    }
    visible.value = false;
  }

  function requestClose() {
    if (!dirty.value) {
      void closeAfterDiscard();
      return;
    }
    Alert.alert({
      title: t('changelog.discardTitle'),
      content: t('changelog.discardContent'),
      okText: t('changelog.discardAction'),
      async onOk() {
        await closeAfterDiscard();
      },
    });
  }

  function confirmDelete() {
    if (!logId.value || deleting.value) return;
    Alert.alert({
      title: t('changelog.deleteTitle'),
      content: t('changelog.deleteContent', { title: title.value }),
      okText: t('common.delete'),
      async onOk() {
        deleting.value = true;
        try {
          const res = await deleteUpdateLog(logId.value);
          if (res.status !== 200) {
            message.error(res.msg || t('changelog.deleteFailed'));
            return;
          }
          message.success(t('changelog.deleteSuccess'));
          recordOperation({ module: '更新日志', operation: `删除更新日志「${title.value}」` });
          emit('deleted', logId.value);
          savedOnce.value = true;
          visible.value = false;
        } catch {
          message.error(t('changelog.deleteFailed'));
        } finally {
          deleting.value = false;
        }
      },
    });
  }
</script>

<style scoped lang="less">
  .editor-loading {
    min-height: 360px;
    display: grid;
    place-items: center;
  }

  .update-log-editor {
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .editor-meta-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(170px, 0.55fr) minmax(170px, 0.55fr);
    gap: 10px 12px;
  }

  .editor-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .editor-field--summary {
    grid-column: 1 / 3;
  }

  .editor-field small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }

  .editor-content-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .editor-count,
  .save-hint {
    color: var(--desc-color);
    font-size: 12px;
  }

  .markdown-editor-pane,
  .markdown-preview-pane {
    min-height: 0;
    flex: 1;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 10px;
    background: var(--card-background, var(--background-color));
    overflow: auto;
  }

  .markdown-editor-pane {
    display: flex;
    flex-direction: column;
  }

  .markdown-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));
    background: var(--workspace-panel-bg-color);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .image-size-select {
    width: 116px;
    flex: 0 0 116px;
  }

  .image-size-select :deep(.select-trigger) {
    min-height: 32px;
  }

  .markdown-input {
    min-height: 0;
    flex: 1;
  }

  .markdown-input :deep(.input-container) {
    height: 100%;
  }

  .markdown-input :deep(.b-textarea) {
    height: 100%;
    min-height: 300px;
    resize: none;
    border: 0;
    border-radius: 0;
    padding: 14px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    font-size: 13px;
    line-height: 1.65;
  }

  .markdown-preview-pane {
    padding: 18px 22px;
  }

  .markdown-body {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }

  .markdown-body :deep(h1),
  .markdown-body :deep(h2),
  .markdown-body :deep(h3) {
    margin: 1.1em 0 0.55em;
    color: var(--text-color);
    line-height: 1.35;
  }

  .markdown-body :deep(p),
  .markdown-body :deep(ul),
  .markdown-body :deep(ol),
  .markdown-body :deep(blockquote) {
    margin: 0.7em 0;
  }

  .markdown-body :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 14px auto;
    border-radius: 10px;
    box-shadow: var(--surface-card-shadow);
  }

  .markdown-body :deep(img[data-ln-size='small']) {
    width: min(100%, 360px);
  }

  .markdown-body :deep(img[data-ln-size='medium']) {
    width: min(100%, 640px);
  }

  .markdown-body :deep(img[data-ln-size='large']) {
    width: min(100%, 900px);
  }

  .markdown-body :deep(img[data-ln-size='full']) {
    width: 100%;
  }

  .markdown-body :deep(img[data-ln-size='original']) {
    width: auto;
  }

  .markdown-body :deep(pre) {
    overflow-x: auto;
    padding: 12px;
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
  }

  .markdown-body :deep(code) {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  }

  .preview-empty {
    min-height: 260px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: 13px;
  }

  .editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .editor-footer-main {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 767px) {
    :global(.update-log-editor-modal) {
      width: calc(100% - 16px) !important;
      max-width: calc(100% - 16px) !important;
      height: calc(100% - 16px) !important;
    }

    .editor-meta-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    .editor-field--summary {
      grid-column: auto;
    }

    .editor-content-head {
      align-items: flex-end;
    }

    .editor-count {
      display: none;
    }

    .markdown-preview-pane {
      padding: 14px;
    }

    .editor-footer {
      align-items: stretch;
    }

    .editor-footer-main {
      flex: 1;
    }

    .save-hint {
      display: none;
    }
  }
</style>
