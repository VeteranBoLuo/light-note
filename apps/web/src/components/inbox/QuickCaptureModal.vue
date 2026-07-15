<template>
  <BModal
    v-model:visible="visible"
    :title="t('inbox.quickCapture')"
    :show-footer="false"
    width="min(560px, 92vw)"
    :mask-closable="!submitting"
    @close="close"
  >
    <div class="capture-modal" @paste="handlePaste">
      <p class="capture-hint">{{ t('inbox.captureHint') }}</p>
      <div v-if="!successText && inbox.pendingTotal > 0" class="capture-pending">
        <span>{{ t('inbox.pendingSummary', { count: inbox.pendingTotal }) }}</span>
        <BButton size="small" @click="goInbox">{{ t('inbox.organizeNow') }}</BButton>
      </div>
      <BTabs v-model:active-tab="captureType" :options="typeOptions" @change="manualType = true" />

      <template v-if="captureType !== 'file'">
        <BInput
          v-model:value="content"
          type="textarea"
          :rows="captureType === 'bookmark' ? 3 : 8"
          :maxlength="60000"
          :placeholder="captureType === 'bookmark' ? t('inbox.urlPlaceholder') : t('inbox.textPlaceholder')"
          @input="detectType"
        />
        <div v-if="captureType === 'bookmark' && content" class="detected-type">
          {{ validUrl ? t('inbox.detectedBookmark') : t('inbox.invalidUrl') }}
        </div>
      </template>

      <div v-else class="file-capture" @dragover.prevent @drop.prevent="handleDrop">
        <BUpload :multiple="true" :raw-file="true" :max-total-size="200 * 1024 * 1024" @change="selectFiles">
          <BButton>{{ t('inbox.chooseFiles') }}</BButton>
        </BUpload>
        <span>{{ t('inbox.dropFiles') }}</span>
        <div v-if="files.length" class="file-list">
          <span v-for="file in files" :key="`${file.name}:${file.size}`">{{ file.name }}</span>
        </div>
      </div>

      <div v-if="successText" class="capture-success">
        <span>{{ successText }}</span>
        <div class="capture-success__actions">
          <BButton size="small" @click="continueCapture">{{ t('inbox.continueCapture') }}</BButton>
          <BButton size="small" @click="openCapturedResource">{{ t('inbox.openCaptured') }}</BButton>
          <BButton size="small" @click="goInbox">{{ t('inbox.viewInbox') }}</BButton>
        </div>
      </div>

      <div class="capture-actions">
        <BButton @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
          {{ t('inbox.collect') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { inboxStore } from '@/store';
  import {
    buildCaptureFileMeta,
    buildMarkdownNotePayload,
    detectInboxCaptureType,
    normalizeCaptureUrl,
    type InboxCaptureType,
  } from '@/utils/inboxCapture';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';

  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ captured: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();
  const captureType = ref<InboxCaptureType>(inbox.quickCaptureType);
  const content = ref('');
  const files = ref<File[]>([]);
  const submitting = ref(false);
  const successText = ref('');
  const manualType = ref(false);
  const capturedResource = ref<{ type: InboxCaptureType; id?: string; title?: string } | null>(null);

  const typeOptions = computed(() => [
    { key: 'bookmark', label: t('inbox.bookmark') },
    { key: 'note', label: t('inbox.note') },
    { key: 'file', label: t('inbox.file') },
  ]);
  const parsedUrl = computed(() => normalizeCaptureUrl(content.value));
  const validUrl = computed(() => Boolean(parsedUrl.value));
  const canSubmit = computed(() =>
    captureType.value === 'file'
      ? files.value.length > 0
      : Boolean(content.value.trim()) && (captureType.value !== 'bookmark' || validUrl.value),
  );

  watch(visible, (value) => {
    if (value) {
      captureType.value = inbox.quickCaptureType;
      manualType.value = false;
    } else {
      reset();
    }
  });

  function detectType() {
    successText.value = '';
    capturedResource.value = null;
    if (manualType.value || captureType.value === 'file') return;
    captureType.value = detectInboxCaptureType(content.value);
  }

  function selectFiles(value: File[]) {
    files.value = value;
    captureType.value = 'file';
    manualType.value = true;
    successText.value = '';
    capturedResource.value = null;
  }

  function handleDrop(event: DragEvent) {
    selectFiles(Array.from(event.dataTransfer?.files || []));
  }

  function handlePaste(event: ClipboardEvent) {
    const pastedFiles = Array.from(event.clipboardData?.files || []);
    if (!pastedFiles.length) return;
    event.preventDefault();
    selectFiles(pastedFiles);
  }

  async function collectBookmark() {
    const url = parsedUrl.value as URL;
    const res = await apiBasePost('/api/bookmark/addBookmark', {
      name: url.hostname.replace(/^www\./, '') || url.href,
      url: url.href,
      description: '',
      saveSnapshot: true,
      addToInbox: true,
      inboxSource: 'quick_capture',
    });
    if (res.status !== 200) throw new Error(res.msg || t('inbox.captureFailed'));
    capturedResource.value = { type: 'bookmark', id: String(res.data?.id || ''), title: url.hostname };
    return res.data?.duplicate ? t('inbox.duplicateRequeued') : t('inbox.captureSuccess');
  }

  async function collectNote() {
    const payload = buildMarkdownNotePayload(content.value, t('inbox.untitledNote'));
    const res = await apiBasePost('/api/note/addNote', {
      ...payload,
      addToInbox: true,
      inboxSource: 'quick_capture',
    });
    if (res.status !== 200) throw new Error(res.msg || t('inbox.captureFailed'));
    capturedResource.value = { type: 'note', id: String(res.data?.id || ''), title: payload.title };
    return t('inbox.captureSuccess');
  }

  async function collectFiles() {
    const fileMeta = buildCaptureFileMeta(files.value);
    const uploadRes = await apiBasePost('/api/file/uploadFiles', { files: fileMeta });
    if (uploadRes.status !== 200) throw new Error(uploadRes.msg || t('inbox.captureFailed'));
    const signed = Array.isArray(uploadRes.data) ? uploadRes.data : [];
    if (signed.length !== files.value.length) throw new Error(t('inbox.captureFailed'));
    await Promise.all(
      signed.map(async (info, index) => {
        const response = await fetch(info.uploadUrl, {
          method: 'PUT',
          headers: info.headers || { 'Content-Type': files.value[index].type || 'application/octet-stream' },
          body: files.value[index],
        });
        if (!response.ok) throw new Error(`${files.value[index].name}: ${t('inbox.uploadFailed')}`);
      }),
    );
    const confirmRes = await apiBasePost('/api/file/confirmUpload', {
      files: fileMeta,
      folderId: null,
      addToInbox: true,
      inboxSource: 'quick_capture',
    });
    if (confirmRes.status !== 200) throw new Error(confirmRes.msg || t('inbox.captureFailed'));
    capturedResource.value = { type: 'file', title: files.value[0]?.name || '' };
    return t('inbox.captureSuccessCount', { count: files.value.length });
  }

  async function submit() {
    if (!canSubmit.value || submitting.value) return;
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    submitting.value = true;
    try {
      successText.value =
        captureType.value === 'bookmark'
          ? await collectBookmark()
          : captureType.value === 'note'
            ? await collectNote()
            : await collectFiles();
      const operation =
        captureType.value === 'bookmark'
          ? OPERATION_LOG_MAP.inbox.captureBookmark
          : captureType.value === 'note'
            ? OPERATION_LOG_MAP.inbox.captureNote
            : OPERATION_LOG_MAP.inbox.captureFile;
      recordOperation(operation);
      content.value = '';
      files.value = [];
      manualType.value = false;
      if (router.currentRoute.value.path.startsWith('/inbox')) await inbox.refreshList();
      else await inbox.refreshCount();
      emit('captured');
      message.success(successText.value);
    } catch (error: any) {
      message.error(error?.message || t('inbox.captureFailed'));
    } finally {
      submitting.value = false;
    }
  }

  function goInbox() {
    visible.value = false;
    router.push('/inbox');
  }

  function continueCapture() {
    successText.value = '';
    capturedResource.value = null;
  }

  function openCapturedResource() {
    const resource = capturedResource.value;
    if (!resource) return;
    visible.value = false;
    if (resource.type === 'bookmark' && resource.id) router.push(`/manage/editBookmark/${resource.id}`);
    else if (resource.type === 'note' && resource.id) router.push(`/noteLibrary/${resource.id}`);
    else router.push({ path: '/cloudSpace', query: resource.title ? { fileName: resource.title } : {} });
  }

  function reset() {
    content.value = '';
    files.value = [];
    submitting.value = false;
    successText.value = '';
    capturedResource.value = null;
    manualType.value = false;
    captureType.value = inbox.quickCaptureType;
  }

  function close() {
    if (submitting.value) return;
    visible.value = false;
  }
</script>

<style scoped lang="less">
  .capture-modal {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .capture-hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .capture-pending {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 11px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    color: var(--text-color);
    font-size: 13px;
  }
  .capture-pending span {
    min-width: 0;
  }
  .capture-pending :deep(.b_btn) {
    flex: 0 0 auto;
  }
  .detected-type {
    color: var(--desc-color);
    font-size: 12px;
  }
  .file-capture {
    min-height: 150px;
    border: 1px dashed var(--card-border-color);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    padding: 18px;
    box-sizing: border-box;
  }
  .file-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-color);
  }
  .file-list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .capture-success {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(46, 204, 113, 0.1);
    color: var(--text-color);
  }
  .capture-success__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }
  .capture-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  :deep(.b-textarea) {
    resize: vertical;
    min-height: 82px;
  }
  @media (max-width: 767px) {
    .capture-pending {
      align-items: flex-start;
    }
    .capture-success {
      align-items: flex-start;
      flex-direction: column;
    }
    .capture-success__actions {
      width: 100%;
      justify-content: flex-start;
    }
    .capture-actions :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
  }
</style>
