<template>
  <!-- 快速添加只承担低成本捕获；待办的完整字段转交独立抽屉。 -->
  <component :is="shellComponent" v-bind="shellProps" @close="close" @update:visible="syncVisible">
    <div class="capture-modal" @paste="handlePaste">
      <MobileNoticeStrip
        v-if="bookmark.isMobile"
        class="capture-intro-strip"
        :title="t('inbox.quickCaptureEyebrow')"
        :description="captureHint"
      />
      <div v-else class="capture-intro">
        <span class="capture-intro__eyebrow">{{ t('inbox.quickCaptureEyebrow') }}</span>
        <div class="capture-intro__description">
          <p>{{ captureHint }}</p>
          <!--
            入口跟随当前 Tab：待办是行动对象、不进待整理队列，显示「前往待整理 N」
            会把用户送到一个根本不含刚创建待办的列表。待办入口也不带数字 ——
            那个数字已由顶栏待办角标承担，弹框里再重复一次只会分散注意力。
          -->
          <BButton
            v-if="!bookmark.isMobile"
            size="small"
            class="capture-intro__inbox-link"
            v-click-log="captureTargetLog"
            @click="goCaptureTarget"
          >
            <span>{{ captureTargetLabel }}</span>
            <span v-if="!isTodoCapture && inbox.pendingTotal > 0" class="capture-intro__pending-count">
              {{ displayPendingTotal }}
            </span>
          </BButton>
        </div>
      </div>
      <BTabs
        v-model:active-tab="captureType"
        class="capture-tabs"
        :options="typeOptions"
        variant="segment"
        @change="handleTypeChange"
      />

      <template v-if="!successText">
        <section class="capture-workspace" :class="`is-${captureType}`">
          <QuickTodoForm
            v-if="captureType === 'todo'"
            :saving="submitting"
            :reset-key="todoFormKey"
            :mobile="bookmark.isMobile"
            :reminder-presets-enabled="quickReminderPresetsEnabled"
            @submit="submitTodo"
            @details="openTodoDetails"
          />
          <template v-else>
            <div class="capture-panel-intro">
              <strong>{{ capturePanelTitle }}</strong>
              <span>{{ capturePanelHint }}</span>
            </div>

            <template v-if="captureType !== 'file'">
              <BInput
                v-model:value="content"
                type="textarea"
                :rows="captureType === 'bookmark' ? 3 : 7"
                :maxlength="60000"
                :placeholder="capturePlaceholder"
                @input="detectType"
              />
              <div v-if="captureType === 'bookmark' && content" class="detected-type">
                {{ validUrl ? t('inbox.detectedBookmark') : t('inbox.invalidUrl') }}
              </div>
            </template>

            <div v-else class="file-capture" @dragover.prevent @drop.prevent="handleDrop">
              <div class="file-capture__dropzone">
                <!-- 来源显式传 'picker',与 handleDrop/handlePaste 一致;别简写成 @change="addFiles",
                     那样 BUpload 以后多 emit 一个参数就会顶掉 source -->
                <BUpload
                  :multiple="true"
                  :raw-file="true"
                  :max-total-size="MAX_FILE_TOTAL_SIZE"
                  @change="(selected) => addFiles(selected, 'picker')"
                >
                  <BButton>{{ t('inbox.chooseFiles') }}</BButton>
                </BUpload>
                <span>{{ t('inbox.dropOrPasteFiles') }}</span>
                <kbd>{{ t('inbox.pasteShortcut') }}</kbd>
              </div>
              <div v-if="files.length" class="file-selection">
                <div class="file-selection__header">
                  <div>
                    <strong>{{ t('inbox.selectedFiles', { count: files.length }) }}</strong>
                    <span>{{ formatFileSize(totalFileSize) }}</span>
                  </div>
                  <BButton size="small" @click="clearFiles">{{ t('inbox.clearSelectedFiles') }}</BButton>
                </div>
                <div class="file-list">
                  <div v-for="(file, index) in files" :key="selectedFileKey(file)" class="file-list__item">
                    <span class="file-list__icon">
                      <SvgIcon :src="icon.resource.file" size="18" aria-hidden="true" />
                    </span>
                    <span class="file-list__content">
                      <span class="file-list__name" :title="file.name">{{ file.name }}</span>
                      <span class="file-list__meta">
                        {{ formatFileSize(file.size) }}
                        <span v-if="isPastedFile(file)" class="file-list__source">{{ t('inbox.fromClipboard') }}</span>
                      </span>
                    </span>
                    <BButton
                      size="small"
                      class="file-list__remove"
                      :aria-label="t('inbox.removeSelectedFile', { name: file.name })"
                      @click="removeFile(index)"
                    >
                      <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
                    </BButton>
                  </div>
                </div>
              </div>
            </div>

            <div class="capture-actions" :class="{ 'is-sticky': bookmark.isMobile }">
              <BButton @click="close">{{ t('common.cancel') }}</BButton>
              <BButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
                {{ t('inbox.collect') }}
              </BButton>
            </div>
          </template>
        </section>
      </template>

      <div v-else class="capture-success">
        <span>{{ successText }}</span>
        <div class="capture-success__actions">
          <BButton size="small" @click="continueCapture">{{ t('inbox.continueCapture') }}</BButton>
          <BButton size="small" @click="openCapturedResource">{{ t('inbox.openCaptured') }}</BButton>
          <BButton size="small" @click="goInbox">{{ successTargetLabel }}</BButton>
        </div>
      </div>
    </div>
  </component>

  <TodoEditorModal
    v-if="!bookmark.isMobile"
    v-model:visible="todoDetailsVisible"
    :initial-values="todoDraft"
    @saved="afterDetailedTodoSaved"
    @closed="closeAfterTodoDetails"
  />
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
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import QuickTodoForm from '@/components/todo/QuickTodoForm.vue';
  import TodoEditorModal from '@/components/todo/TodoEditorModal.vue';
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
  import {
    createTodoPlanV2,
    getTodoPlanV2Config,
    previewTodoPlanV2,
    type TodoCreateInitialValues,
  } from '@/api/todoApi';
  import { normalizeQuickTodoInitial } from '@/components/todo/todoDraftNormalizer';
  import { generateUUID } from '@/utils/common';
  import type { ActionCaptureType } from '@/store/inbox';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import MobileNoticeStrip from '@/components/mobile/MobileNoticeStrip.vue';

  const MAX_FILE_TOTAL_SIZE = 200 * 1024 * 1024;

  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ captured: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const todo = todoStore();
  const captureType = ref<ActionCaptureType>(inbox.quickCaptureType);

  const shellTitle = computed(() => t('inbox.quickCapture'));
  /*
   * 详情抽屉打开期间隐藏快速添加外壳。这里必须是独立状态，不能由 todoDetailsVisible
   * 反推：移动端要先关外壳、等它的 history 占位真正出栈，再打开详情抽屉，
   * 两个动作得能分别控制（详见 openTodoDetails）。
   */
  const quickShellSuppressed = ref(false);
  const quickShellVisible = computed(() => visible.value === true && !quickShellSuppressed.value);
  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: quickShellVisible.value,
          title: shellTitle.value,
          placement: 'bottom' as const,
          // 仅待办轻量表单需要多一档高度；资源捕获继续保持更轻的 83vh 抽屉。
          height: captureType.value === 'todo' ? '88vh' : '83vh',
          mobileFullScreen: false,
          mobileCenteredHeader: true,
          bodyPadding: '14px 14px 0',
          maskClosable: !submitting.value,
        }
      : {
          visible: quickShellVisible.value,
          title: shellTitle.value,
          showFooter: false,
          width: 'min(680px, 92vw)',
          maskClosable: !submitting.value,
        },
  );

  function syncVisible(next: boolean) {
    visible.value = next;
  }

  const content = ref('');
  const files = ref<File[]>([]);
  const pastedFileKeys = new Set<string>();
  const submitting = ref(false);
  const successText = ref('');
  const manualType = ref(false);
  const todoFormKey = ref(0);
  const todoDetailsVisible = ref(false);
  const quickReminderPresetsEnabled = ref(true);
  const todoDraft = ref<TodoCreateInitialValues | undefined>();
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
  const capturePanelTitle = computed(() => t(`inbox.quickCapturePanels.${captureType.value}.title`));
  const capturePanelHint = computed(() => t(`inbox.quickCapturePanels.${captureType.value}.hint`));
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
  const totalFileSize = computed(() => files.value.reduce((sum, file) => sum + file.size, 0));
  const displayPendingTotal = computed(() => (inbox.pendingTotal > 99 ? '99+' : String(inbox.pendingTotal)));
  const isTodoCapture = computed(() => captureType.value === 'todo');
  // 顶部入口与成功区都跟随当前 Tab：待办跳待办列表，资源类跳待整理
  const captureTargetLabel = computed(() => (isTodoCapture.value ? t('inbox.goToTodo') : t('inbox.goToInbox')));
  const successTargetLabel = computed(() => (isTodoCapture.value ? t('inbox.goToTodo') : t('inbox.viewInbox')));
  // 埋点跟着实际跳转目标走，否则两个入口的使用率会被混在一条记录里
  const captureTargetLog = computed(() =>
    isTodoCapture.value ? OPERATION_LOG_MAP.inbox.openTodoFromCapture : OPERATION_LOG_MAP.inbox.openInboxFromCapture,
  );

  watch(visible, (value) => {
    if (value) {
      void loadTodoPlanConfig();
      captureType.value = normalizeQuickCaptureType(inbox.quickCaptureType, bookmark.isMobile);
      manualType.value = false;
      if (captureType.value === 'todo') todoFormKey.value += 1;
    } else {
      reset();
    }
  });

  async function loadTodoPlanConfig() {
    try {
      const response = await getTodoPlanV2Config();
      if (response.status === 200 && response.data?.quickReminderPresetsEnabled !== undefined) {
        quickReminderPresetsEnabled.value = Boolean(response.data.quickReminderPresetsEnabled);
      }
    } catch {
      // 配置失败不阻断快速添加；保留随前端版本发布的默认值。
    }
  }

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

  function selectedFileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function addFiles(value: File[], source: 'picker' | 'drop' | 'clipboard' = 'picker') {
    if (!value.length) return;
    const seenKeys = new Set(files.value.map(selectedFileKey));
    const additions = value.filter((file) => {
      const key = selectedFileKey(file);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    if (!additions.length) return;
    const nextTotalSize = totalFileSize.value + additions.reduce((sum, file) => sum + file.size, 0);
    if (nextTotalSize > MAX_FILE_TOTAL_SIZE) {
      message.warning(t('common.maxTotalSize', { n: MAX_FILE_TOTAL_SIZE / (1024 * 1024) }));
      return;
    }
    if (source === 'clipboard') additions.forEach((file) => pastedFileKeys.add(selectedFileKey(file)));
    files.value = [...files.value, ...additions];
    captureType.value = 'file';
    manualType.value = true;
    successText.value = '';
    capturedResource.value = null;
  }

  function handleDrop(event: DragEvent) {
    addFiles(Array.from(event.dataTransfer?.files || []), 'drop');
  }

  function handlePaste(event: ClipboardEvent) {
    const pastedFiles = Array.from(event.clipboardData?.files || []);
    if (!pastedFiles.length) return;
    event.preventDefault();
    addFiles(pastedFiles, 'clipboard');
  }

  function isPastedFile(file: File) {
    return pastedFileKeys.has(selectedFileKey(file));
  }

  function removeFile(index: number) {
    const target = files.value[index];
    if (target) pastedFileKeys.delete(selectedFileKey(target));
    files.value = files.value.filter((_, fileIndex) => fileIndex !== index);
  }

  function clearFiles() {
    files.value = [];
    pastedFileKeys.clear();
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
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
      pastedFileKeys.clear();
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

  async function submitTodo(payload: TodoCreateInitialValues & { title: string }) {
    if (submitting.value || blockGuestWrite('todo-create', t('inbox.guestPrompt'))) return;
    submitting.value = true;
    try {
      const draft = normalizeQuickTodoInitial(payload);
      const preview = await previewTodoPlanV2(draft);
      if (preview.status !== 200 || !preview.data?.previewHash) {
        throw new Error(preview.msg || t('inbox.todoPlanPreviewFailed'));
      }
      const res = await createTodoPlanV2({
        ...draft,
        previewHash: preview.data.previewHash,
        idempotencyKey: generateUUID(),
      });
      if (res.status !== 200) throw new Error(res.msg || t('inbox.todoSaveFailed'));
      capturedResource.value = {
        type: 'todo',
        id: String(res.data?.todoId || res.data?.id || ''),
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

  async function openTodoDetails(payload: TodoCreateInitialValues & { title: string }) {
    todoDraft.value = {
      title: payload.title,
      priority: payload.priority,
      dueAt: payload.dueAt,
      quickReminderPreset: payload.quickReminderPreset,
    };
    // 移动端的完整新建统一进入轻量路由页，不再从快速添加抽屉
    // 叠加一个全屏待办抽屉。历史状态只传递当前草稿，不产生任何写入。
    if (bookmark.isMobile) {
      await closeCurrentMobileOverlayThen(
        () => {
          visible.value = false;
        },
        () => {
          void router.push({ name: 'todoCreate', state: { todoInitialValues: todoDraft.value } });
        },
      );
      return;
    }

    await closeCurrentMobileOverlayThen(
      () => {
        quickShellSuppressed.value = true;
      },
      () => {
        todoDetailsVisible.value = true;
      },
    );
  }

  async function afterDetailedTodoSaved(result: { id: string; title: string }) {
    capturedResource.value = { type: 'todo', id: result.id, title: result.title };
    recordOperation(OPERATION_LOG_MAP.inbox.captureTodo);
    if (router.currentRoute.value.path.startsWith('/inbox')) {
      await Promise.all([inbox.refreshList(), todo.refreshList()]);
    } else {
      await Promise.all([inbox.refreshCount(), todo.refreshCount()]);
    }
    emit('captured');
    todoDetailsVisible.value = false;
    quickShellSuppressed.value = false;
    visible.value = false;
  }

  function closeAfterTodoDetails() {
    todoDetailsVisible.value = false;
    quickShellSuppressed.value = false;
    visible.value = false;
  }

  async function goInbox() {
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push(getQuickCaptureInboxTarget(captureType.value, bookmark.isMobile)),
    );
  }

  /** 复用与成功区同一份目标解析，避免顶部入口和成功区各写一套跳转规则。 */
  function goCaptureTarget() {
    visible.value = false;
    void router.push(getQuickCaptureInboxTarget(captureType.value, bookmark.isMobile));
  }

  function continueCapture() {
    successText.value = '';
    capturedResource.value = null;
    if (captureType.value === 'todo') todoFormKey.value += 1;
  }

  async function openCapturedResource() {
    const resource = capturedResource.value;
    if (!resource) return;
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => {
        if (resource.type === 'todo') {
          return router.push({ path: '/inbox', query: { tab: 'todo', todoId: resource.id } });
        }
        if (resource.type === 'bookmark' && resource.id) return router.push(`/manage/editBookmark/${resource.id}`);
        if (resource.type === 'note' && resource.id) return router.push(`/noteLibrary/${resource.id}`);
        return router.push({ path: '/cloudSpace', query: resource.title ? { fileName: resource.title } : {} });
      },
    );
  }

  function reset() {
    content.value = '';
    files.value = [];
    pastedFileKeys.clear();
    submitting.value = false;
    successText.value = '';
    capturedResource.value = null;
    manualType.value = false;
    todoDetailsVisible.value = false;
    // 外壳抑制状态必须一起清掉，否则下次打开快速添加会拿到一个隐形的外壳
    quickShellSuppressed.value = false;
    todoDraft.value = undefined;
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
    gap: 16px;
    min-width: 0;
  }

  .capture-intro {
    display: grid;
    gap: 5px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--surface-border-color));
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
  }

  .capture-intro__eyebrow {
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .capture-intro p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .capture-intro__description {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .capture-intro__description p {
    min-width: 0;
  }

  .capture-intro__inbox-link {
    flex: 0 0 auto;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, transparent) !important;
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    color: var(--primary-color);
    font-weight: 600;
  }

  .capture-intro__inbox-link:hover {
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }

  .capture-intro__pending-count {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--primary-color);
    color: var(--primary-contrast-color, #fff);
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }

  .capture-tabs :deep(.tab-container) {
    width: 100%;
  }

  /* 待办表单比另外三个捕获面板更高。移动端抽屉高度受限时，纵向 flex 默认会压缩子项；
     BTabs 根节点又有 overflow:hidden，最终表现为只在切到待办后整条 Tab 被裁成一条细线。 */
  .capture-tabs {
    flex: 0 0 auto;
  }

  .capture-tabs :deep(.tab) {
    flex: 1 1 0;
    justify-content: center;
  }

  .capture-workspace {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .capture-panel-intro {
    display: grid;
    gap: 4px;
  }

  .capture-panel-intro strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .capture-panel-intro span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .detected-type {
    color: var(--desc-color);
    font-size: 12px;
  }
  .file-capture {
    display: grid;
    gap: 12px;
  }
  .file-capture__dropzone {
    min-height: 112px;
    border: 1px dashed color-mix(in srgb, var(--primary-color) 28%, var(--card-border-color));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
    padding: 18px;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--primary-color) 2.5%, var(--card-background));
  }
  .file-capture__dropzone > span {
    font-size: 12px;
  }
  .file-capture__dropzone kbd {
    padding: 3px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    background: var(--workspace-panel-bg-color);
    color: var(--text-color);
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    box-shadow: 0 1px 0 color-mix(in srgb, var(--text-color) 10%, transparent);
  }
  .file-selection {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .file-selection__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .file-selection__header > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .file-selection__header strong {
    color: var(--text-color);
    font-size: 12px;
  }
  .file-selection__header span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .file-list {
    display: grid;
    gap: 6px;
    max-height: 186px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .file-list__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 8px 9px;
    border-radius: 9px;
    background: var(--card-background);
  }
  .file-list__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--file-color, #ff8a00) 10%, var(--card-background));
    color: var(--file-color, #ff8a00);
  }
  .file-list__content {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .file-list__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
    font-size: 12px;
    font-weight: 600;
  }
  .file-list__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .file-list__source {
    padding: 1px 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    color: var(--primary-color);
  }
  .file-list__remove {
    color: var(--desc-color);
  }
  .file-list__remove:hover {
    color: var(--danger-color, #e5484d);
  }
  .capture-success {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--message-success-color) 28%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--message-success-color) 10%, var(--card-background));
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
    border-color: var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background) !important;
  }
  @media (max-width: 767px) {
    .capture-modal {
      height: 100%;
      gap: 14px;
      overflow-x: hidden;
      overflow-y: auto;
      padding-bottom: calc(82px + env(safe-area-inset-bottom));
      box-sizing: border-box;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
    }
    .capture-intro-strip {
      /* 待办表单更高时，纵向 flex 不能拿提示条的高度补空间；
         四个 Tab 统一从 64px 起步，窄屏文案需要换行时允许自然增高。 */
      flex: 0 0 auto;
      min-height: 64px;
      padding: 9px 13px;
      border: 0;
      border-radius: 13px;
    }
    .capture-workspace {
      gap: 14px;
      padding: 16px;
      border-radius: 17px;
      box-shadow: none;
    }
    .capture-tabs :deep(.tab-container) {
      gap: 4px;
      padding: 4px;
      border: 0;
      border-radius: 13px;
      background: var(--workspace-panel-bg-color);
    }
    .capture-tabs :deep(.tab) {
      min-height: 36px;
      padding: 0 8px;
      border: 0;
      border-radius: 10px;
      font-size: 13px;
    }
    .capture-tabs :deep(.tab.is-active) {
      color: var(--primary-color);
      background: var(--card-background);
      box-shadow: 0 4px 12px rgba(42, 45, 80, 0.08);
      font-weight: 700;
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
    .capture-actions.is-sticky {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 2;
      margin: 0;
      padding: 12px 14px calc(20px + env(safe-area-inset-bottom));
    }
    .capture-actions.is-sticky :deep(.b_btn) {
      height: 48px;
      min-height: 48px;
    }
  }
</style>
