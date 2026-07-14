<template>
  <BModal
    v-model:visible="visible"
    :title="t('inbox.quickCapture')"
    :show-footer="false"
    width="min(560px, 92vw)"
    :mask-closable="!submitting"
    @close="close"
  >
    <div class="capture-modal">
      <p class="capture-hint">{{ t('inbox.captureHint') }}</p>
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
        <BButton size="small" @click="goInbox">{{ t('inbox.viewInbox') }}</BButton>
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

  type CaptureType = 'bookmark' | 'note' | 'file';

  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ captured: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();
  const captureType = ref<CaptureType>('note');
  const content = ref('');
  const files = ref<File[]>([]);
  const submitting = ref(false);
  const successText = ref('');
  const manualType = ref(false);

  const typeOptions = computed(() => [
    { key: 'bookmark', label: t('inbox.bookmark') },
    { key: 'note', label: t('inbox.note') },
    { key: 'file', label: t('inbox.file') },
  ]);
  const parsedUrl = computed(() => {
    let value = content.value.trim();
    if (value && !/^[a-z][a-z\d+.-]*:\/\//i.test(value) && /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) {
      value = `https://${value}`;
    }
    try {
      const url = new URL(value);
      return url;
    } catch {
      return null;
    }
  });
  const validUrl = computed(() => Boolean(parsedUrl.value && /^https?:$/.test(parsedUrl.value.protocol)));
  const canSubmit = computed(() =>
    captureType.value === 'file' ? files.value.length > 0 : Boolean(content.value.trim()) && (captureType.value !== 'bookmark' || validUrl.value),
  );

  watch(visible, (value) => {
    if (!value) reset();
  });

  function detectType() {
    successText.value = '';
    if (manualType.value || captureType.value === 'file') return;
    captureType.value = validUrl.value ? 'bookmark' : 'note';
  }

  function selectFiles(value: File[]) {
    files.value = value;
    captureType.value = 'file';
    manualType.value = true;
    successText.value = '';
  }

  function handleDrop(event: DragEvent) {
    selectFiles(Array.from(event.dataTransfer?.files || []));
  }

  function noteTitle(value: string) {
    const firstLine = value.split(/\r?\n/).find((line) => line.trim()) || t('inbox.untitledNote');
    return firstLine.replace(/^#{1,6}\s*/, '').replace(/[*_`~\[\]()>]/g, '').trim().slice(0, 100) || t('inbox.untitledNote');
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
    return res.data?.duplicate ? t('inbox.duplicateRequeued') : t('inbox.captureSuccess');
  }

  async function collectNote() {
    const value = content.value;
    const res = await apiBasePost('/api/note/addNote', {
      title: noteTitle(value),
      content: value,
      type: 'markdown',
      addToInbox: true,
      inboxSource: 'quick_capture',
    });
    if (res.status !== 200) throw new Error(res.msg || t('inbox.captureFailed'));
    return t('inbox.captureSuccess');
  }

  async function collectFiles() {
    const fileMeta = files.value.map((file) => ({ fileName: file.name, fileType: file.type, fileSize: file.size }));
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
    return t('inbox.captureSuccessCount', { count: files.value.length });
  }

  async function submit() {
    if (!canSubmit.value || submitting.value) return;
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    submitting.value = true;
    try {
      successText.value = captureType.value === 'bookmark'
        ? await collectBookmark()
        : captureType.value === 'note'
          ? await collectNote()
          : await collectFiles();
      content.value = '';
      files.value = [];
      manualType.value = false;
      captureType.value = 'note';
      await inbox.refreshCount();
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

  function reset() {
    content.value = '';
    files.value = [];
    submitting.value = false;
    successText.value = '';
    manualType.value = false;
    captureType.value = 'note';
  }

  function close() {
    if (submitting.value) return;
    visible.value = false;
  }
</script>

<style scoped lang="less">
  .capture-modal { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .capture-hint { margin: 0; color: var(--desc-color); font-size: 13px; }
  .detected-type { color: var(--desc-color); font-size: 12px; }
  .file-capture {
    min-height: 150px; border: 1px dashed var(--card-border-color); border-radius: 10px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    color: var(--desc-color); padding: 18px; box-sizing: border-box;
  }
  .file-list { width: 100%; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-color); }
  .file-list span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .capture-success {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 8px; background: rgba(46, 204, 113, 0.1); color: var(--text-color);
  }
  .capture-actions { display: flex; justify-content: flex-end; gap: 8px; }
  :deep(.b-textarea) { resize: vertical; min-height: 82px; }
  @media (max-width: 767px) { .capture-actions :deep(.b_btn) { flex: 1; width: auto; } }
</style>
