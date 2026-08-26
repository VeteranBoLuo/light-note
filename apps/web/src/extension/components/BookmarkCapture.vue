<template>
  <section class="ln-extension-view ln-extension-form-view ln-extension-bookmark-view">
    <div class="ln-extension-view-heading">
      <span class="is-bookmark"><SvgIcon :src="icon.resource.bookmark" size="22" aria-hidden="true" /></span>
      <div>
        <h1>{{ t('browserExtension.bookmark.heading') }}</h1>
        <p>{{ t('browserExtension.bookmark.description') }}</p>
      </div>
    </div>

    <div class="ln-extension-bookmark-mode" role="group" :aria-label="t('browserExtension.bookmark.modeLabel')">
      <BButton
        block
        :class="{ 'is-active': draft.mode === 'inbox' }"
        :aria-pressed="draft.mode === 'inbox'"
        :disabled="saving || aiLoading || capturing || refillingPage"
        @click="selectMode('inbox')"
      >
        <strong>{{ t('browserExtension.bookmark.modeInbox') }}</strong>
        <small>{{ t('browserExtension.bookmark.modeInboxShort') }}</small>
      </BButton>
      <BButton
        block
        :class="{ 'is-active': draft.mode === 'formal' }"
        :aria-pressed="draft.mode === 'formal'"
        :disabled="saving || aiLoading || capturing || refillingPage"
        @click="selectMode('formal')"
      >
        <strong>{{ t('browserExtension.bookmark.modeFormal') }}</strong>
        <small>{{ t('browserExtension.bookmark.modeFormalShort') }}</small>
      </BButton>
    </div>
    <div v-if="capturing" class="ln-extension-inline-state">
      <BLoading :loading="true" inline :title="t('browserExtension.bookmark.readingPage')" />
    </div>
    <p v-else-if="captureWarning" class="ln-extension-notice is-warning" role="status">{{ captureWarning }}</p>

    <BButton
      block
      class="ln-extension-current-page-fill"
      :loading="refillingPage"
      :disabled="capturing || refillingPage || saving || aiLoading"
      :title="t('browserExtension.bookmark.fillCurrentPageHint')"
      :aria-label="t('browserExtension.bookmark.fillCurrentPageHint')"
      @click="fillCurrentPage"
    >
      <span class="ln-extension-current-page-fill__copy">
        <strong>{{ t('browserExtension.bookmark.fillCurrentPageTitle') }}</strong>
        <small>{{ t('browserExtension.bookmark.fillCurrentPageDescription') }}</small>
      </span>
      <span class="ln-extension-current-page-fill__action">{{ t('browserExtension.bookmark.fillCurrentPage') }}</span>
    </BButton>

    <div class="ln-extension-field">
      <label for="extension-bookmark-url">{{ t('browserExtension.bookmark.url') }}</label>
      <BInput
        id="extension-bookmark-url"
        v-model:value="draft.url"
        :placeholder="t('browserExtension.bookmark.urlPlaceholder')"
      />
    </div>
    <div class="ln-extension-field">
      <label for="extension-bookmark-name">{{ t('browserExtension.bookmark.name') }}</label>
      <BInput
        id="extension-bookmark-name"
        v-model:value="draft.name"
        :placeholder="t('browserExtension.bookmark.namePlaceholder')"
      />
    </div>
    <div class="ln-extension-field">
      <label for="extension-bookmark-description">{{ t('browserExtension.bookmark.descriptionLabel') }}</label>
      <BInput
        id="extension-bookmark-description"
        v-model:value="draft.description"
        type="textarea"
        :rows="3"
        :placeholder="t('browserExtension.bookmark.descriptionPlaceholder')"
      />
    </div>

    <section
      v-if="draft.mode === 'formal'"
      class="ln-extension-ai-assist"
      aria-labelledby="extension-bookmark-ai-title"
    >
      <span class="ln-extension-ai-assist__icon" aria-hidden="true">
        <SvgIcon :src="icon.common.magicWand" size="19" />
      </span>
      <div>
        <strong id="extension-bookmark-ai-title">{{ t('browserExtension.bookmark.aiTitle') }}</strong>
        <small>{{ t('browserExtension.bookmark.aiDescription') }}</small>
      </div>
      <BButton block :loading="aiLoading" :disabled="saving || capturing || refillingPage" @click="generateWithAi">
        {{ t(aiGenerated ? 'browserExtension.bookmark.aiRegenerate' : 'browserExtension.bookmark.aiGenerate') }}
      </BButton>
    </section>

    <div v-if="draft.mode === 'formal'" class="ln-extension-field">
      <div class="ln-extension-field__label-row">
        <label id="extension-bookmark-tags">{{ t('browserExtension.bookmark.tags') }}</label>
        <small>{{ t('browserExtension.bookmark.tagLimit') }}</small>
      </div>
      <BSelect
        :value="draft.selectedTagIds"
        @update:value="updateSelectedTagIds"
        mode="multiple"
        chip-tone="tag"
        :max-tag-count="4"
        :options="tagOptions"
        :loading="tagsLoading"
        :show-search="true"
        :aria-labelledby="'extension-bookmark-tags'"
        :placeholder="
          authenticated ? t('browserExtension.bookmark.tagsPlaceholder') : t('browserExtension.bookmark.tagsAfterLogin')
        "
        :disabled="!authenticated"
      />
      <div v-if="suggestedNewTags.length" class="ln-extension-suggested-tags">
        <span>{{ t('browserExtension.bookmark.newTags') }}</span>
        <BCheckbox
          v-for="tag in suggestedNewTags"
          :key="tag"
          :checked="draft.selectedNewTags.includes(tag)"
          @change="toggleNewTag(tag, $event)"
        >
          {{ tag }}
        </BCheckbox>
      </div>
    </div>

    <p v-if="errorMessage" class="ln-extension-inline-error" role="alert">{{ errorMessage }}</p>

    <BButton
      type="primary"
      block
      :loading="savingMode === draft.mode"
      :disabled="aiLoading || saving || capturing || refillingPage"
      @click="saveSelectedMode"
    >
      {{ t(draft.mode === 'formal' ? 'browserExtension.bookmark.saveFormal' : 'browserExtension.bookmark.saveInbox') }}
    </BButton>
    <p class="ln-extension-form-hint">
      {{ t(draft.mode === 'formal' ? 'browserExtension.bookmark.formalHint' : 'browserExtension.bookmark.inboxHint') }}
    </p>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { captureCurrentTabAddress, captureTriggeredPage } from '../capture';
  import { ExtensionApiError, extensionPost, isExtensionAuthError } from '../api';
  import { clearBookmarkDraft, getBookmarkDraft, saveBookmarkDraft } from '../storage';
  import { belongsToExtensionDraftSession, createExtensionDraftPersistence } from '../draftPersistence';
  import { resolveExtensionOperationReceipt } from '../operationIdempotency';
  import type { BookmarkDraft, ExtensionOperationReceipt, ExtensionSuccess } from '../types';

  const props = defineProps<{ authenticated: boolean; draftSessionId: string }>();
  const emit = defineEmits<{ 'auth-required': []; success: [result: ExtensionSuccess] }>();
  const { t } = useI18n();
  const draft = reactive<BookmarkDraft>({
    mode: 'formal',
    url: '',
    name: '',
    description: '',
    selectedTagIds: [],
    selectedNewTags: [],
  });
  const capturing = ref(true);
  const refillingPage = ref(false);
  const captureWarning = ref('');
  const errorMessage = ref('');
  const tagsLoading = ref(false);
  const aiLoading = ref(false);
  const aiGenerated = ref(false);
  const savingMode = ref<'formal' | 'inbox' | ''>('');
  const tagOptions = ref<Array<{ label: string; value: string }>>([]);
  const suggestedNewTags = ref<string[]>([]);
  const draftPersistence = createExtensionDraftPersistence(saveBookmarkDraft, clearBookmarkDraft);
  const saving = computed(() => Boolean(savingMode.value));

  function isUntouchedDraft() {
    return (
      draft.mode === 'formal' &&
      !draft.url &&
      !draft.name &&
      !draft.description &&
      draft.selectedTagIds.length === 0 &&
      draft.selectedNewTags.length === 0
    );
  }

  function bookmarkDraftSnapshot(): BookmarkDraft {
    const operations: Partial<Record<'formal' | 'inbox', ExtensionOperationReceipt>> = {};
    if (draft.operations?.formal) operations.formal = { ...draft.operations.formal };
    if (draft.operations?.inbox) operations.inbox = { ...draft.operations.inbox };
    return {
      sessionId: props.draftSessionId,
      mode: draft.mode,
      url: draft.url,
      name: draft.name,
      description: draft.description,
      selectedTagIds: [...draft.selectedTagIds],
      selectedNewTags: [...draft.selectedNewTags],
      ...(Object.keys(operations).length ? { operations } : {}),
    };
  }

  function selectMode(mode: 'formal' | 'inbox') {
    if (draft.mode === mode) return;
    draft.mode = mode;
    errorMessage.value = '';
    if (mode === 'formal' && props.authenticated) void loadTags();
  }

  function normalizeUrl(value: string): string | null {
    try {
      const withProtocol = /^[a-z][a-z\d+.-]*:/iu.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
      const url = new URL(withProtocol);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  async function fillCurrentPage() {
    if (capturing.value || refillingPage.value || saving.value || aiLoading.value) return;
    refillingPage.value = true;
    captureWarning.value = '';
    errorMessage.value = '';
    try {
      const page = await captureCurrentTabAddress();
      draft.url = page.url;
      draft.name = page.title.slice(0, 255);
    } catch {
      captureWarning.value = t('browserExtension.bookmark.captureFailed');
    } finally {
      refillingPage.value = false;
    }
  }

  async function loadTags() {
    if (!props.authenticated || tagsLoading.value) return;
    tagsLoading.value = true;
    try {
      const data = await extensionPost<any>('/api/bookmark/queryTagList', { filters: {} });
      tagOptions.value = (Array.isArray(data) ? data : []).map((tag: any) => ({
        label: String(tag.name || ''),
        value: String(tag.id || ''),
      }));
    } catch (error) {
      if (isExtensionAuthError(error)) emit('auth-required');
    } finally {
      tagsLoading.value = false;
    }
  }

  function toggleNewTag(tag: string, checked: boolean) {
    if (checked) {
      if (draft.selectedTagIds.length + draft.selectedNewTags.length >= 4) {
        errorMessage.value = t('browserExtension.bookmark.tooManyTags');
        return;
      }
      if (!draft.selectedNewTags.includes(tag)) draft.selectedNewTags.push(tag);
    } else {
      draft.selectedNewTags = draft.selectedNewTags.filter((item) => item !== tag);
    }
  }

  function updateSelectedTagIds(value: unknown) {
    const tagIds = [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];
    if (tagIds.length + draft.selectedNewTags.length > 4) {
      errorMessage.value = t('browserExtension.bookmark.tooManyTags');
      return;
    }
    draft.selectedTagIds = tagIds;
  }

  async function generateWithAi() {
    if (!props.authenticated) return emit('auth-required');
    const url = normalizeUrl(draft.url);
    if (!url) {
      errorMessage.value = t('browserExtension.bookmark.invalidUrl');
      return;
    }
    draft.url = url;
    aiLoading.value = true;
    errorMessage.value = '';
    try {
      await loadTags();
      const data = await extensionPost<any>('/api/ai/skills/execute', {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        skillId: 'bookmark.parse_url',
        skillVersion: 1,
        threadId: null,
        input: { url },
        scope: { resourceRefs: [] },
        client: {
          locale: navigator.language || 'zh-CN',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Singapore',
          surface: 'browser_extension.bookmark',
        },
      });
      const fields = data?.result?.fields || {};
      if (fields.name) draft.name = String(fields.name);
      if (fields.description) draft.description = String(fields.description);
      const validIds = new Set(tagOptions.value.map((option) => option.value));
      draft.selectedTagIds = [
        ...new Set((fields.matchedTagIds || []).map(String).filter((id: string) => validIds.has(id))),
      ].slice(0, 4);
      suggestedNewTags.value = [
        ...new Set((fields.newTags || []).map((tag: unknown) => String(tag || '').trim()).filter(Boolean)),
      ].slice(0, 4);
      draft.selectedNewTags = draft.selectedNewTags.filter((tag) => suggestedNewTags.value.includes(tag));
      aiGenerated.value = true;
    } catch (error: any) {
      if (isExtensionAuthError(error)) emit('auth-required');
      else errorMessage.value = error?.message || t('browserExtension.bookmark.aiFailed');
    } finally {
      aiLoading.value = false;
    }
  }

  async function save(mode: 'formal' | 'inbox') {
    if (!props.authenticated) return emit('auth-required');
    if (mode === 'formal' && draft.selectedTagIds.length + draft.selectedNewTags.length > 4) {
      errorMessage.value = t('browserExtension.bookmark.tooManyTags');
      return;
    }
    const url = normalizeUrl(draft.url);
    if (!url) {
      errorMessage.value = t('browserExtension.bookmark.invalidUrl');
      return;
    }
    const name =
      draft.name.trim() ||
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
    savingMode.value = mode;
    errorMessage.value = '';
    const payload = {
      url,
      name,
      description: draft.description.trim(),
      relatedTags: mode === 'formal' ? [...draft.selectedTagIds] : [],
      relatedTagNames: mode === 'formal' ? [...draft.selectedNewTags] : [],
      tagSource: 'browser_extension',
      addToInbox: mode === 'inbox',
      inboxSource: 'browser_extension',
      saveSnapshot: mode === 'formal',
    };
    try {
      const operation = await resolveExtensionOperationReceipt({
        current: draft.operations?.[mode],
        scope: `bookmark:${mode}`,
        payload,
      });
      draft.operations = { ...(draft.operations || {}), [mode]: operation };
      // 在发出可能已经提交但丢失响应的请求前，先持久化“载荷指纹 + 幂等键”。
      await draftPersistence.save(bookmarkDraftSnapshot());
      const result = await extensionPost<any>('/api/bookmark/addBookmark', {
        ...payload,
        idempotencyKey: operation.key,
      });
      await draftPersistence.discard();
      emit('success', {
        type: 'bookmark',
        resourceId: String(result.id || ''),
        title: String(result.name || name),
        duplicate: Boolean(result.duplicate),
      });
    } catch (error: any) {
      if (isExtensionAuthError(error)) emit('auth-required');
      else if (error instanceof ExtensionApiError && error.code === 'DUPLICATE_URL' && error.data?.duplicate) {
        await draftPersistence.discard();
        emit('success', {
          type: 'bookmark',
          resourceId: String(error.data.duplicate.id || ''),
          title: String(error.data.duplicate.name || name),
          duplicate: true,
        });
      } else errorMessage.value = error?.message || t('browserExtension.bookmark.saveFailed');
    } finally {
      savingMode.value = '';
    }
  }

  function saveFormal() {
    return save('formal');
  }
  function saveToInbox() {
    return save('inbox');
  }
  function saveSelectedMode() {
    return draft.mode === 'inbox' ? saveToInbox() : saveFormal();
  }

  watch(draft, () => void draftPersistence.save(bookmarkDraftSnapshot()), { deep: true });
  watch(
    () => draft.url,
    () => {
      aiGenerated.value = false;
    },
  );
  watch(
    () => props.authenticated,
    (value) => {
      if (value && draft.mode === 'formal') void loadTags();
    },
  );

  onMounted(async () => {
    const stored = await getBookmarkDraft();
    if (stored && belongsToExtensionDraftSession(stored.sessionId, props.draftSessionId) && isUntouchedDraft()) {
      Object.assign(draft, stored);
    } else if (stored) {
      await clearBookmarkDraft();
    }
    try {
      const page = await captureTriggeredPage();
      if (!draft.url) draft.url = page.url;
      if (!draft.name) draft.name = page.title;
      if (!draft.description && page.selection) draft.description = page.selection;
    } catch {
      captureWarning.value = t('browserExtension.bookmark.captureFailed');
    } finally {
      capturing.value = false;
    }
    if (props.authenticated && draft.mode === 'formal') void loadTags();
  });
</script>
