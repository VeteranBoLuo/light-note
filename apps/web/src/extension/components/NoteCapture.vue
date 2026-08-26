<template>
  <section class="ln-extension-view ln-extension-form-view">
    <div class="ln-extension-view-heading">
      <span class="is-note"><SvgIcon :src="icon.resource.note" size="22" aria-hidden="true" /></span>
      <div>
        <h1>{{ t('browserExtension.note.heading') }}</h1>
        <p>{{ t('browserExtension.note.description') }}</p>
      </div>
    </div>

    <div class="ln-extension-format-switch" role="group" :aria-label="t('browserExtension.note.format')">
      <BButton
        :class="{ 'is-active': draft.type === 'markdown' }"
        block
        :disabled="saving || importingPageText"
        @click="requestType('markdown')"
      >
        <SvgIcon :src="icon.resource.noteMarkdown" size="17" aria-hidden="true" />
        Markdown
      </BButton>
      <BButton
        :class="{ 'is-active': draft.type === 'html' }"
        block
        :disabled="saving || importingPageText"
        @click="requestType('html')"
      >
        <SvgIcon :src="icon.resource.noteHtml" size="17" aria-hidden="true" />
        {{ t('browserExtension.note.richText') }}
      </BButton>
    </div>

    <div class="ln-extension-field ln-extension-note-title-field">
      <label for="extension-note-title">{{ t('browserExtension.note.noteTitle') }}</label>
      <BInput
        id="extension-note-title"
        v-model:value="draft.title"
        height="44px"
        :placeholder="t('browserExtension.note.titlePlaceholder')"
      />
    </div>

    <section class="ln-extension-page-import" aria-labelledby="extension-note-page-import-title">
      <div>
        <strong id="extension-note-page-import-title">{{ t('browserExtension.note.pageImportTitle') }}</strong>
        <small>{{ t('browserExtension.note.pageImportDescription') }}</small>
      </div>
      <BButton
        :loading="importingPageText"
        :disabled="saving || importingPageText"
        @pointerenter="refreshPageCaptureTarget"
        @focus="refreshPageCaptureTarget"
        @click="importCurrentPageText"
      >
        {{ t('browserExtension.note.pageImportAction') }}
      </BButton>
    </section>
    <p v-if="pageImportError" class="ln-extension-inline-error ln-extension-page-import-error" role="alert">
      {{ pageImportError }}
    </p>
    <p v-else-if="pageImportStatus" class="ln-extension-import-status" role="status">{{ pageImportStatus }}</p>

    <BTabs
      v-if="draft.type === 'markdown'"
      v-model:active-tab="editorMode"
      class="ln-extension-editor-tabs"
      variant="segment"
      :options="editorTabs"
    />

    <div v-if="draft.type === 'html' || editorMode === 'edit'" class="ln-extension-note-editor">
      <BInput
        v-if="draft.type === 'markdown'"
        v-model:value="draft.content"
        type="textarea"
        :rows="14"
        :placeholder="t('browserExtension.note.markdownPlaceholder')"
      />
      <ExtensionRichTextEditor
        v-else
        v-model="draft.content"
        :aria-label="t('browserExtension.note.richTextPlaceholder')"
      />
    </div>
    <article v-else class="ln-extension-note-preview" :class="{ 'is-empty': !hasBody }" v-html="safePreview"></article>

    <div class="ln-extension-switch-row">
      <div>
        <strong>{{ t('browserExtension.note.addToInbox') }}</strong>
        <small>{{ t('browserExtension.note.addToInboxHint') }}</small>
      </div>
      <BSwitch v-model:checked="draft.addToInbox" :aria-label="t('browserExtension.note.addToInbox')" />
    </div>

    <p v-if="errorMessage" class="ln-extension-inline-error" role="alert">{{ errorMessage }}</p>
    <BButton type="primary" block :loading="saving" :disabled="importingPageText" @click="saveNote">
      {{ t('browserExtension.note.save') }}
    </BButton>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import ExtensionRichTextEditor from './ExtensionRichTextEditor.vue';
  import { extensionPost, isExtensionAuthError } from '../api';
  import { captureCurrentPageText, prepareCurrentPageTextCapture } from '../capture';
  import { appendPageTextToHtml, appendPageTextToMarkdown } from '../pageTextImport';
  import { clearNoteDraft, getNoteDraft, saveNoteDraft } from '../storage';
  import { createExtensionDraftPersistence } from '../draftPersistence';
  import { resolveExtensionOperationReceipt } from '../operationIdempotency';
  import type { ExtensionSuccess, NoteDraft, PreparedPageTextCapture } from '../types';

  const props = defineProps<{ authenticated: boolean }>();
  const emit = defineEmits<{ 'auth-required': []; success: [result: ExtensionSuccess] }>();
  const { t } = useI18n();
  const draft = reactive<NoteDraft>({ title: '', content: '', type: 'markdown', addToInbox: true });
  const editorMode = ref<'edit' | 'preview'>('edit');
  const saving = ref(false);
  const importingPageText = ref(false);
  const pageImportStatus = ref('');
  const pageImportError = ref('');
  const errorMessage = ref('');
  const pageCaptureTarget = ref<PreparedPageTextCapture | null>(null);
  let pageCaptureTargetRequest = 0;
  const draftPersistence = createExtensionDraftPersistence(saveNoteDraft, clearNoteDraft);

  function isUntouchedDraft() {
    return !draft.title && !draft.content && draft.type === 'markdown' && draft.addToInbox;
  }

  function noteDraftSnapshot(): NoteDraft {
    return {
      title: draft.title,
      content: draft.content,
      type: draft.type,
      addToInbox: draft.addToInbox,
      ...(draft.operation ? { operation: { ...draft.operation } } : {}),
    };
  }

  const editorTabs = computed(() => [
    { key: 'edit', label: t('browserExtension.note.edit') },
    { key: 'preview', label: t('browserExtension.note.preview') },
  ]);
  const hasBody = computed(() => {
    if (draft.type === 'markdown') return Boolean(draft.content.trim());
    const container = document.createElement('div');
    container.innerHTML = DOMPurify.sanitize(draft.content);
    return Boolean(container.textContent?.trim() || container.querySelector('img,table,hr'));
  });
  const safePreview = computed(() => {
    if (!hasBody.value) return `<p>${t('browserExtension.note.previewEmpty')}</p>`;
    return DOMPurify.sanitize(String(marked.parse(draft.content, { async: false })));
  });

  function requestType(type: 'markdown' | 'html') {
    if (saving.value || importingPageText.value) return;
    if (draft.type === type) return;
    const apply = () => {
      draft.content = '';
      draft.type = type;
      editorMode.value = 'edit';
      pageImportStatus.value = '';
      pageImportError.value = '';
      errorMessage.value = '';
    };
    if (!hasBody.value) return apply();
    Alert.alert({
      title: t('browserExtension.note.switchConfirmTitle'),
      content: t('browserExtension.note.switchConfirmDescription'),
      okText: t('browserExtension.note.clearAndSwitch'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: apply,
    });
  }

  function appendImportedText(value: string) {
    if (draft.type === 'markdown') {
      draft.content = appendPageTextToMarkdown(draft.content, value);
      editorMode.value = 'edit';
      return;
    }
    draft.content = appendPageTextToHtml(draft.content, value, hasBody.value);
  }

  async function refreshPageCaptureTarget() {
    const requestId = ++pageCaptureTargetRequest;
    try {
      const target = await prepareCurrentPageTextCapture();
      if (requestId === pageCaptureTargetRequest) pageCaptureTarget.value = target;
    } catch {
      if (requestId === pageCaptureTargetRequest) pageCaptureTarget.value = null;
    }
  }

  function pageImportErrorMessage(error: unknown): string {
    const name = error instanceof Error ? error.name : '';
    if (name === 'CAPTURE_PERMISSION_DENIED') return t('browserExtension.note.pageImportPermissionDenied');
    if (name === 'CAPTURE_PAGE_CHANGED') return t('browserExtension.note.pageImportPageChanged');
    if (name === 'CAPTURE_RESTRICTED_PAGE') return t('browserExtension.note.pageImportRestricted');
    return t('browserExtension.note.pageImportFailed');
  }

  function importCurrentPageText() {
    if (saving.value || importingPageText.value) return;
    const target = pageCaptureTarget.value;
    if (!target) {
      pageImportStatus.value = '';
      pageImportError.value = t('browserExtension.note.pageImportPrepareFailed');
      void refreshPageCaptureTarget();
      return;
    }
    importingPageText.value = true;
    pageImportStatus.value = '';
    pageImportError.value = '';
    errorMessage.value = '';
    let capturePromise: ReturnType<typeof captureCurrentPageText>;
    try {
      // 保持在按钮点击的同步调用栈内发起当前域名权限请求。
      capturePromise = captureCurrentPageText(target);
    } catch (error: unknown) {
      importingPageText.value = false;
      pageImportError.value = pageImportErrorMessage(error);
      void refreshPageCaptureTarget();
      return;
    }
    void capturePromise
      .then((page) => {
        if (!page.text) {
          pageImportError.value = t('browserExtension.note.pageImportEmpty');
          return;
        }
        if (!draft.title.trim() && page.title) draft.title = page.title.slice(0, 255);
        appendImportedText(page.text);
        pageImportStatus.value = t(
          page.truncated ? 'browserExtension.note.pageImportTruncated' : 'browserExtension.note.pageImportSuccess',
        );
      })
      .catch((error: unknown) => {
        pageImportError.value = pageImportErrorMessage(error);
        void refreshPageCaptureTarget();
      })
      .finally(() => {
        importingPageText.value = false;
      });
  }

  async function saveNote() {
    if (!props.authenticated) return emit('auth-required');
    if (!draft.title.trim() && !hasBody.value) {
      errorMessage.value = t('browserExtension.note.emptyError');
      return;
    }
    saving.value = true;
    errorMessage.value = '';
    const payload = {
      title: draft.title.trim(),
      content: draft.content,
      type: draft.type,
      addToInbox: draft.addToInbox,
      inboxSource: 'browser_extension',
    };
    try {
      const operation = await resolveExtensionOperationReceipt({
        current: draft.operation,
        scope: 'note',
        payload,
      });
      draft.operation = operation;
      // 请求响应丢失或侧栏被关闭时，重新打开仍能用同一载荷和同一幂等键恢复。
      await draftPersistence.save(noteDraftSnapshot());
      const result = await extensionPost<any>('/api/note/addNote', {
        ...payload,
        idempotencyKey: operation.key,
      });
      const title = draft.title.trim() || t('browserExtension.note.untitled');
      await draftPersistence.discard();
      emit('success', { type: 'note', resourceId: String(result.id || ''), title });
    } catch (error: any) {
      if (isExtensionAuthError(error)) emit('auth-required');
      else errorMessage.value = error?.message || t('browserExtension.note.saveFailed');
    } finally {
      saving.value = false;
    }
  }

  watch(draft, () => void draftPersistence.save(noteDraftSnapshot()), { deep: true });

  onMounted(async () => {
    void refreshPageCaptureTarget();
    const stored = await getNoteDraft();
    if (stored && isUntouchedDraft()) Object.assign(draft, stored);
  });
</script>
