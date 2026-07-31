<template>
  <!-- 移动端用底部抽屉：切到「待办」时内容会变长，固定 92dvh 并让操作区吸底；
       书签/笔记/文件内容不多，高度交给 auto 自适应。桌面端保持原有弹框。 -->
  <component :is="shellComponent" v-bind="shellProps" @close="close" @update:visible="syncVisible">
    <div class="capture-modal" @paste="handlePaste">
      <p class="capture-hint">{{ captureHint }}</p>
      <div v-if="!successText && pendingCount > 0" class="capture-pending">
        <span>{{ t('inbox.pendingSummary', { count: pendingCount }) }}</span>
        <BButton size="small" @click="goInbox">{{ t('inbox.organizeNow') }}</BButton>
      </div>
      <BTabs v-model:active-tab="captureType" :options="typeOptions" @change="handleTypeChange" />

      <template v-if="!successText">
        <TodoEditorForm
          v-if="captureType === 'todo'"
          :saving="submitting"
          :sticky-actions="bookmark.isMobile"
          :reset-key="todoFormKey"
          @submit="submitTodo"
          @cancel="close"
        />

        <template v-else-if="captureType !== 'file'">
          <BInput
            v-model:value="content"
            type="textarea"
            :rows="captureType === 'bookmark' ? 3 : 8"
            :maxlength="60000"
            :placeholder="capturePlaceholder"
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

        <div v-if="captureType !== 'todo'" class="capture-actions" :class="{ 'is-sticky': bookmark.isMobile }">
          <BButton @click="close">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
            {{ t('inbox.collect') }}
          </BButton>
        </div>
      </template>

      <div v-else class="capture-success">
        <span>{{ successText }}</span>
        <div class="capture-success__actions">
          <BButton size="small" @click="continueCapture">{{ t('inbox.continueCapture') }}</BButton>
          <BButton size="small" @click="openCapturedResource">{{ t('inbox.openCaptured') }}</BButton>
          <BButton size="small" @click="goInbox">{{ t('inbox.viewInbox') }}</BButton>
        </div>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import TodoEditorForm from '@/components/todo/TodoEditorForm.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { bookmarkStore, inboxStore, todoStore } from '@/store';
  import {
    buildCaptureFileMeta,
    buildMarkdownNotePayload,
    detectInboxCaptureType,
    getAvailableQuickCaptureTypes,
    getQuickCaptureInboxTarget,
    hasCaptureBookmarkCandidate,
    normalizeQuickCaptureType,
  } from '@/utils/inboxCapture';
  import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { createTodo, type TodoPayload } from '@/api/todoApi';
  import type { ActionCaptureType } from '@/store/inbox';

  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ captured: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const todo = todoStore();
  const captureType = ref<ActionCaptureType>(inbox.quickCaptureType);

  const shellTitle = computed(() =>
    captureType.value === 'todo' ? t('inbox.createTodo') : t('inbox.quickCapture'),
  );
  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value === true,
          title: shellTitle.value,
          placement: 'bottom' as const,
          // 待办表单很长，固定高度并吸底；其余类型内容不多，交给 auto 自适应
          height: captureType.value === 'todo' ? '92dvh' : 'auto',
          bodyPadding: '14px',
          maskClosable: captureType.value !== 'todo' && !submitting.value,
        }
      : {
          visible: visible.value,
          title: shellTitle.value,
          showFooter: false,
          width: captureType.value === 'todo' ? 'min(680px, 94vw)' : 'min(560px, 92vw)',
          maskClosable: captureType.value !== 'todo' && !submitting.value,
        },
  );

  function syncVisible(next: boolean) {
    visible.value = next;
  }

  /**
   * 「还有 N 项待处理」只统计待整理资源。
   *
   * actionTotal 是「待整理 + 待办」的合计：PC 端两者同在待处理页，合并计数说得通；
   * 移动端已经拆成「资料 → 待整理」和底部「待办」两个入口，这里的「前往整理」也只
   * 通向待整理，把待办算进来会让数字对不上眼前的列表。
   */
  const pendingCount = computed(() => (bookmark.isMobile ? inbox.pendingTotal : inbox.actionTotal));
  const content = ref('');
  const files = ref<File[]>([]);
  const submitting = ref(false);
  const successText = ref('');
  const manualType = ref(false);
  const todoFormKey = ref(0);
  const capturedResource = ref<{ type: ActionCaptureType; id?: string; title?: string } | null>(null);

  const typeOptions = computed(() =>
    getAvailableQuickCaptureTypes(bookmark.isMobile).map((key) => ({
      key,
      label: t(`inbox.${key}`),
    })),
  );
  const captureHint = computed(() =>
    captureType.value === 'todo' ? t('inbox.todoCaptureHint') : t('inbox.captureHint'),
  );
  const capturePlaceholder = computed(() =>
    captureType.value === 'bookmark' ? t('inbox.urlPlaceholder') : t('inbox.textPlaceholder'),
  );
  const validUrl = computed(() => hasCaptureBookmarkCandidate(content.value));
  const canSubmit = computed(() =>
    captureType.value === 'file'
      ? files.value.length > 0
      : captureType.value !== 'todo' &&
        Boolean(content.value.trim()) &&
        (captureType.value !== 'bookmark' || validUrl.value),
  );

  watch(visible, (value) => {
    if (value) {
      captureType.value = normalizeQuickCaptureType(inbox.quickCaptureType, bookmark.isMobile);
      manualType.value = false;
      if (captureType.value === 'todo') todoFormKey.value += 1;
    } else {
      reset();
    }
  });

  watch(
    () => bookmark.isMobile,
    (isMobile) => {
      if (visible.value) {
        captureType.value = normalizeQuickCaptureType(captureType.value, isMobile);
      }
    },
  );

  function handleTypeChange() {
    manualType.value = true;
    successText.value = '';
    capturedResource.value = null;
    if (captureType.value === 'todo') todoFormKey.value += 1;
  }

  function detectType() {
    successText.value = '';
    capturedResource.value = null;
    if (manualType.value || captureType.value === 'file' || captureType.value === 'todo') return;
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
    const urlResult = await preflightBookmarkUrl(content.value, { checkLiveness: true });
    if (!urlResult.ok || !urlResult.url) {
      const error = new Error(urlResult.message || t('bookmarkUrl.invalid')) as Error & { code?: string };
      if (urlResult.cancelled) error.code = 'BOOKMARK_URL_CANCELLED';
      throw error;
    }
    const url = new URL(urlResult.url);
    content.value = urlResult.url;
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
      if (router.currentRoute.value.path.startsWith('/inbox')) {
        await Promise.all([inbox.refreshList(), todo.refreshList()]);
      } else {
        await Promise.all([inbox.refreshCount(), todo.refreshCount()]);
      }
      emit('captured');
      message.success(successText.value);
    } catch (error: any) {
      if (error?.code !== 'BOOKMARK_URL_CANCELLED') message.error(error?.message || t('inbox.captureFailed'));
    } finally {
      submitting.value = false;
    }
  }

  async function submitTodo(payload: TodoPayload) {
    if (submitting.value || blockGuestWrite('todo-create', t('inbox.guestPrompt'))) return;
    submitting.value = true;
    try {
      const res = await createTodo(payload);
      if (res.status !== 200) throw new Error(res.msg || t('inbox.todoSaveFailed'));
      capturedResource.value = {
        type: 'todo',
        id: String(res.data?.id || ''),
        title: payload.title,
      };
      successText.value = t('inbox.todoSaved');
      recordOperation(OPERATION_LOG_MAP.inbox.captureTodo);
      if (router.currentRoute.value.path.startsWith('/inbox')) {
        await Promise.all([inbox.refreshList(), todo.refreshList()]);
      } else {
        await Promise.all([inbox.refreshCount(), todo.refreshCount()]);
      }
      emit('captured');
      message.success(successText.value);
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSaveFailed'));
    } finally {
      submitting.value = false;
    }
  }

  function goInbox() {
    visible.value = false;
    router.push(getQuickCaptureInboxTarget(captureType.value, bookmark.isMobile));
  }

  function continueCapture() {
    successText.value = '';
    capturedResource.value = null;
    if (captureType.value === 'todo') todoFormKey.value += 1;
  }

  function openCapturedResource() {
    const resource = capturedResource.value;
    if (!resource) return;
    visible.value = false;
    if (resource.type === 'todo') router.push({ path: '/inbox', query: { tab: 'todo', todoId: resource.id } });
    else if (resource.type === 'bookmark' && resource.id) router.push(`/manage/editBookmark/${resource.id}`);
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
    captureType.value = normalizeQuickCaptureType(inbox.quickCaptureType, bookmark.isMobile);
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

  /* 负 margin 抵消抽屉 body 内边距，让底栏通栏压住滚动内容 */
  .capture-actions.is-sticky {
    position: sticky;
    bottom: -14px;
    z-index: 1;
    margin: 4px -14px -14px;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
    background: var(--card-background);
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
