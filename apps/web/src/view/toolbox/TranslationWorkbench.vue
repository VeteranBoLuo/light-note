<template>
  <main class="translation-workbench" data-mobile-resource-scroll>
    <aside class="translation-history-desktop"
      ><TranslationHistory
        :selected="activeJobId"
        :disabled="locked || recordLoading"
        :revision="historyRevision"
        @select="openRecord"
        @deleted="onRecordsDeleted"
    /></aside>
    <section class="translation-workspace" :class="{ 'requirements-open': requirementsOpen }">
      <BButton class="translation-back" type="text" @click="returnToToolbox"
        ><SvgIcon :src="icon.toolbox.back" size="14" />{{ t('translation.back') }}</BButton
      >
      <h1>{{ t('translation.title') }}</h1>
      <BButton class="translation-history-trigger" @click="historyOpen = true">{{ t('translation.history') }}</BButton>
      <div v-if="recordLoading" class="translation-record-loading" role="status" :aria-label="t('common.loading')" />
      <BTabs
        :active-tab="mode"
        @update:active-tab="!locked && (mode = $event)"
        :options="[
          { key: 'text', label: t('translation.text') },
          { key: 'resource', label: t('translation.resource') },
        ]"
      />
      <div class="translation-body" :class="{ 'has-result': showResult }">
        <section class="translation-language">
          <h2>{{ t('translation.languageLabel') }}</h2>
          <div class="translation-toolbar">
            <BSelect
              v-model:value="sourceLanguage"
              :aria-label="t('translation.source')"
              :options="sourceOptions"
              :disabled="locked"
            />
            <SvgIcon :src="icon.toolbox.arrow" size="16" />
            <BSelect
              v-model:value="targetLanguage"
              :aria-label="t('translation.target')"
              :options="languages"
              :disabled="locked"
            />
            <BButton
              class="translation-requirements-toggle"
              type="text"
              :aria-expanded="requirementsOpen"
              @click="requirementsOpen = !requirementsOpen"
              >{{ t('translation.requirementsShort')
              }}<SvgIcon
                :src="icon.noteTree.chevron"
                size="14"
                aria-hidden="true"
                :class="{ 'is-expanded': requirementsOpen }"
            /></BButton>
          </div>
        </section>
        <BInput
          v-if="requirementsOpen"
          v-model:value="requirements"
          type="textarea"
          :rows="3"
          :maxlength="1000"
          :disabled="locked"
          :placeholder="t('translation.requirementsHint')"
        />
        <div
          class="translation-editor"
          :class="{
            'has-output': true,
            'is-active': showResult,
          }"
        >
          <section class="translation-source" :class="{ 'source-collapsed': showResult && !sourceOpen }">
            <BButton
              v-if="showResult"
              class="translation-source-toggle"
              :aria-expanded="sourceOpen"
              @click="sourceOpen = !sourceOpen"
            >
              <span class="translation-source-label"
                ><strong>{{ t('translation.original') }}</strong>
                <small>{{ (mode === 'text' ? text.length : originalText.length).toLocaleString() }}</small>
              </span>
              <SvgIcon :src="icon.noteTree.chevron" size="14" :class="{ 'is-expanded': sourceOpen }" />
            </BButton>
            <div class="translation-source-content">
              <strong class="translation-pane-title">{{ t('translation.original') }}</strong>
              <section v-if="mode === 'resource'" class="translation-material">
                <h2>{{ t('translation.materialLabel') }}</h2>
                <div v-if="resources[0]" class="translation-selected">
                  <SvgIcon :src="selectedIcon" size="26" />
                  <div class="translation-selected-copy"
                    ><strong>{{ resources[0].title }}</strong
                    ><span>{{ t(`ai.sourceTypes.${resources[0].type}`) }}</span></div
                  >
                  <BButton type="text" :disabled="locked" @click="openPicker">{{
                    t('translation.changeMaterial')
                  }}</BButton>
                </div>
                <BButton v-else class="translation-choose" :disabled="locked" @click="openPicker"
                  ><SvgIcon :src="icon.resource.note" size="24" /><span
                    ><strong>{{ t('translation.chooseMaterial') }}</strong
                    ><small>{{ t('translation.materialKinds') }}</small></span
                  ><SvgIcon :src="icon.toolbox.arrow" size="16"
                /></BButton>
              </section>
              <template v-if="mode === 'text'">
                <BInput
                  v-model:value="text"
                  type="textarea"
                  :rows="8"
                  :readonly="locked"
                  :placeholder="t('translation.placeholder')"
                />
                <span class="translation-count" :class="{ 'is-error': text.length > 30000 }"
                  >{{ text.length.toLocaleString() }} / 30,000</span
                >
                <p v-if="text.length > 30000" class="is-error" role="alert">{{ t('translation.tooLong') }}</p>
              </template>
              <article
                v-else-if="originalText"
                class="translation-prose"
                v-html="renderStreamingMarkdown(originalText)"
              ></article>
              <p v-if="mode === 'resource'" class="translation-source-hint">{{ t('translation.availableText') }}</p>
            </div>
          </section>
          <section class="translation-output" :class="{ 'is-empty': !showResult }" :aria-busy="busy">
            <div class="translation-output-heading"
              ><strong>{{ t('translation.translated') }}</strong
              ><span v-if="busy">{{ t('translation.translating') }}</span></div
            >
            <div ref="outputScroll" class="translation-output-scroll" @scroll="trackOutputScroll">
              <article
                v-if="showResult"
                class="translation-prose"
                v-html="renderStreamingMarkdown(artifact?.content ?? streamedText)"
              ></article>
              <div v-else class="translation-empty"
                ><SvgIcon :src="icon.resource.note" size="36" /><strong>{{ t('translation.emptyTitle') }}</strong
                ><p>{{ t('translation.emptyHint') }}</p></div
              >
            </div>
          </section>
        </div>
        <p v-if="error" class="is-error" role="alert">{{ error }}</p>
      </div>
      <footer class="translation-footer">
        <span class="translation-footer-spacer"></span>
        <BButton v-if="busy" :disabled="!activeJobId || stopping" :loading="stopping" @click="stop">{{
          t('translation.stop')
        }}</BButton>
        <template v-else-if="artifact">
          <BButton :disabled="!valid || recordLoading" @click="retranslate">{{ t('translation.translate') }}</BButton>
          <BButton :disabled="recordLoading" @click="copyResult">{{ t('translation.copy') }}</BButton>
          <BButton type="primary" :disabled="recordLoading" @click="saveResult">{{ t('translation.save') }}</BButton>
        </template>
        <BButton v-else type="primary" :disabled="!valid || recordLoading" @click="start">{{
          t(uncertain ? 'translation.reconnect' : 'translation.translate')
        }}</BButton>
      </footer>
    </section>
    <BModal
      v-model:visible="historyOpen"
      :title="t('translation.history')"
      :show-footer="false"
      fullscreen-mobile
      width="var(--ui-layout-320, 320px)"
    >
      <div class="translation-history-mobile"
        ><TranslationHistory
          v-if="historyOpen"
          :selected="activeJobId"
          :disabled="locked || recordLoading"
          :revision="historyRevision"
          @select="openRecord"
          @deleted="onRecordsDeleted"
      /></div>
    </BModal>
    <BModal
      v-model:visible="pickerOpen"
      :title="t('translation.chooseMaterial')"
      width="var(--ui-layout-680, 680px)"
      fullscreen-mobile
      :show-footer="false"
    >
      <template #mobileHeader="{ close }"
        ><div class="translation-picker-header"
          ><BButton type="text" icon-only :aria-label="t('translation.backToTranslation')" @click="close"
            ><SvgIcon :src="icon.toolbox.back" size="20" /></BButton
          ><strong>{{ t('translation.chooseMaterial') }}</strong></div
        ></template
      >
      <div class="translation-picker">
        <BInput
          v-model:value="pickerKeyword"
          :placeholder="t('toolbox.workbench.resourceSearchPlaceholder')"
          clearable
        />
        <BTabs v-model:active-tab="pickerType" :options="pickerTabs" />
        <ResourcePickerPanel
          v-if="pickerOpen"
          :allowed-types="pickerTypes"
          :keyword="pickerKeyword"
          :show-search="false"
          :auto-focus="false"
          :include-note-scopes="false"
          :page-scroll="false"
          exhaustive
          fill
          @select="chooseMaterial"
          ><template #resource-icon="{ item }"
            ><SvgIcon :src="materialIcon(item.type)" size="24" class="translation-picker-icon" /></template
        ></ResourcePickerPanel>
        <p>{{ t('translation.pickAndReturn') }}</p>
      </div>
    </BModal>
  </main>
</template>
<script setup lang="ts">
  import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter, useRoute } from 'vue-router';
  import { useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import {
    fetchTranslationRecord,
    fetchToolboxArtifact,
    createToolboxQuote,
    cancelToolboxJob,
    type ToolboxInput,
    type ToolboxQuote,
    type ToolboxArtifact,
  } from '@/api/toolbox';
  import { toolboxErrorMessageKey } from '@/utils/toolboxErrorPresentation';
  import { takeTranslation } from '@/utils/translationHandoff';
  import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
  import { streamTranslation } from '@/api/translationStream';
  import { saveToolboxNote } from '@/utils/saveToolboxNote';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import type { TranslationPair } from '@/utils/translationResult';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import TranslationHistory from './components/TranslationHistory.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import type { ResourcePickerItem, ResourcePickerType } from '@/composables/useResourcePickerSearch';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { returnFromToolboxPage } from '@/utils/toolboxNavigation';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  const artifact = ref<ToolboxArtifact | null>(null);
  const streamedText = ref(''),
    originalText = ref(''),
    activeJobId = ref(''),
    sourceOpen = ref(false),
    stopping = ref(false);
  const showResult = computed(() => busy.value || !!artifact.value || !!streamedText.value || uncertain.value);
  const outputScroll = ref<HTMLElement | null>(null);
  let followOutput = true;
  function trackOutputScroll() {
    const pane = outputScroll.value;
    if (pane) followOutput = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 32;
  }
  watch(streamedText, async () => {
    if (!followOutput) return;
    await nextTick();
    const pane = outputScroll.value;
    if (pane) pane.scrollTop = pane.scrollHeight;
  });
  let streamController: AbortController | null = null;
  function retranslate() {
    if (!valid.value || locked.value || !current()) return;
    quote.value = null;
    quoteRequestId = crypto.randomUUID();
    jobRequestId = crypto.randomUUID();
    void start();
  }
  async function copyResult() {
    if (!artifact.value) return;
    if (!(await copyTextToClipboard(artifact.value.content))) error.value = t('translation.copyFailed');
  }
  async function saveResult() {
    if (!artifact.value) return;
    const result = await saveToolboxNote({
      artifactId: artifact.value.id,
      version: artifact.value.version,
      title: artifact.value.title,
      saveFormat: 'translationOnly',
      description: t('translation.saveForm', { format: t('translation.translationOnly') }),
      isCurrent: current,
    });
    if (current() && result?.openAfterSave) {
      await router.push({
        path: `/noteLibrary/${encodeURIComponent(result.noteId)}`,
        query: {
          from: activeJobId.value
            ? `/toolbox/translation?record=${encodeURIComponent(activeJobId.value)}`
            : '/toolbox/translation',
        },
      });
    }
  }
  async function stop() {
    if (!activeJobId.value || stopping.value) return;
    stopping.value = true;
    try {
      const result = await cancelToolboxJob(activeJobId.value);
      if (current() && result.status === 'cancelled') {
        streamController?.abort();
        uncertain.value = false;
        quote.value = null;
        quoteRequestId = crypto.randomUUID();
        jobRequestId = crypto.randomUUID();
        error.value = t('translation.stopped');
      }
    } catch {
      if (current()) error.value = t('translation.stopFailed');
    } finally {
      stopping.value = false;
    }
  }
  const historyOpen = ref(false),
    historyRevision = ref(0),
    recordLoading = ref(false);
  let recordGeneration = 0;
  function onRecordsDeleted(ids: string[]) {
    if (ids.includes(activeJobId.value)) {
      activeJobId.value = '';
      artifact.value = null;
      streamedText.value = '';
      originalText.value = '';
      text.value = '';
      resources.value = [];
      mode.value = 'text';
      error.value = '';
      quote.value = null;
      preparedInput = null;
      quoteRequestId = crypto.randomUUID();
      jobRequestId = crypto.randomUUID();
      void router.replace({ path: '/toolbox/translation' });
    }
    historyRevision.value++;
  }
  function rememberRecord(id: string) {
    void router.replace({ path: '/toolbox/translation', query: { record: id } });
  }
  async function openRecord(id: string) {
    if (busy.value || uncertain.value || !current()) return;
    const generation = ++recordGeneration;
    recordLoading.value = true;
    error.value = '';
    try {
      const saved = await fetchTranslationRecord(id);
      const result = saved.job.artifact?.id ? await fetchToolboxArtifact(saved.job.artifact.id) : null;
      if (generation !== recordGeneration || !current()) return;
      mode.value = 'text';
      resources.value = [];
      sourceLanguage.value = saved.options.sourceLanguage;
      targetLanguage.value = saved.options.targetLanguage;
      requirements.value = saved.options.question;
      originalText.value =
        saved.original ||
        (result?.meta?.translation?.segments || []).map((pair: TranslationPair) => pair.original).join('');
      text.value = originalText.value;
      artifact.value = result;
      streamedText.value = result?.content || '';
      activeJobId.value = id;
      sourceOpen.value = false;
      followOutput = true;
      quote.value = null;
      preparedInput = null;
      quoteRequestId = crypto.randomUUID();
      jobRequestId = crypto.randomUUID();
      await nextTick();
      historyOpen.value = false;
      rememberRecord(id);
      if (['queued', 'processing'].includes(saved.job.status)) {
        quote.value = { id: saved.quoteId } as ToolboxQuote;
        jobRequestId = saved.clientRequestId;
        recordLoading.value = false;
        await start();
      } else if (!result) {
        error.value = t(
          saved.job.artifactState === 'expired' ? 'translation.historyExpired' : 'translation.historyNoResult',
        );
      }
    } catch {
      if (current() && generation === recordGeneration) error.value = t('translation.historyFailed');
    } finally {
      if (generation === recordGeneration) recordLoading.value = false;
    }
  }
  onMounted(() => {
    const id = typeof route.query?.record === 'string' ? route.query.record : '';
    if (id) void openRecord(id);
  });
  const requirementsOpen = ref(false);
  const pickerOpen = ref(false);
  const pickerType = ref('all');
  const pickerKeyword = ref('');
  const pickerTypes = computed<ResourcePickerType[]>(() =>
    pickerType.value === 'all' ? ['note', 'bookmark', 'file'] : [pickerType.value as ResourcePickerType],
  );
  const pickerTabs = computed(() => [
    { key: 'all', label: t('translation.allMaterials') },
    ...['note', 'bookmark', 'file'].map((key) => ({ key, label: t(`ai.sourceTypes.${key}`) })),
  ]);
  function chooseMaterial(item: ResourcePickerItem) {
    if (locked.value || !current()) return;
    resources.value = [item];
    pickerOpen.value = false;
  }
  function openPicker() {
    if (locked.value) return;
    pickerKeyword.value = '';
    pickerType.value = 'all';
    pickerOpen.value = true;
  }
  function materialIcon(type: string) {
    return type === 'bookmark' ? icon.resource.bookmark : type === 'file' ? icon.resource.file : icon.resource.note;
  }
  const selectedIcon = computed(() =>
    resources.value[0]?.type === 'bookmark'
      ? icon.resource.bookmark
      : resources.value[0]?.type === 'file'
        ? icon.resource.file
        : icon.resource.note,
  );

  const { t, locale } = useI18n(),
    router = useRouter(),
    route = useRoute(),
    user = useUserStore();
  useMobileTopBar(['toolboxTranslation'], {
    title: () => t('translation.title'),
    onBack: returnToToolbox,
    searchMode: 'icon',
    showNotification: false,
  });
  function returnToToolbox() {
    returnFromToolboxPage(router, 'workbench');
  }
  const owner = buildNoteDetailRequestScope(user),
    handoff = takeTranslation();
  const mode = ref('text'),
    text = ref(handoff?.text || ''),
    resources = ref<ToolboxSelectedResource[]>([]);
  const sourceLanguage = ref('auto'),
    targetLanguage = ref(locale.value.startsWith('zh') ? 'zh-CN' : 'en'),
    requirements = ref('');
  const languages = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'pt', label: 'Português' },
    { value: 'ru', label: 'Русский' },
  ];
  const sourceOptions = computed(() => [{ value: 'auto', label: t('translation.auto') }, ...languages]);
  const quote = ref<ToolboxQuote | null>(null),
    busy = ref(false),
    uncertain = ref(false),
    error = ref('');
  let quoteRequestId = crypto.randomUUID(),
    jobRequestId = crypto.randomUUID(),
    disposed = false;
  let preparedInput: ToolboxInput | null = null;
  const current = () => !disposed && owner === buildNoteDetailRequestScope(user);
  const locked = computed(() => busy.value || uncertain.value || recordLoading.value);
  const valid = computed(() =>
    mode.value === 'text' ? !!text.value.trim() && text.value.length <= 30000 : resources.value.length === 1,
  );
  watch(
    [mode, text, resources, sourceLanguage, targetLanguage, requirements],
    () => {
      if (!locked.value) {
        // Editing a draft invalidates its quote, not the last completed result.
        quote.value = null;
        quoteRequestId = crypto.randomUUID();
        jobRequestId = crypto.randomUUID();
        preparedInput = null;
        error.value = '';
      }
    },
    { deep: true },
  );
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      streamController?.abort();
      artifact.value = null;
      streamedText.value = '';
      originalText.value = '';
      pickerOpen.value = false;
      text.value = '';
      resources.value = [];
      quote.value = null;
      preparedInput = null;
      void router.replace('/toolbox');
    },
  );
  onBeforeUnmount(() => {
    disposed = true;
    ++recordGeneration;
    streamController?.abort();
  });
  async function start() {
    if (!valid.value || busy.value || recordLoading.value || !current()) return;
    busy.value = true;
    streamController = null;
    error.value = '';
    let submissionStarted = false;
    try {
      if (!quote.value) {
        followOutput = true;
        sourceOpen.value = false;
        artifact.value = null;
        streamedText.value = '';
        originalText.value = mode.value === 'text' ? text.value : '';
        activeJobId.value = '';
        preparedInput = {
          ...(mode.value === 'text'
            ? { text: text.value }
            : { resourceRefs: resources.value.map(({ type, id }) => ({ type, id })) }),
          options: {
            sourceLanguage: sourceLanguage.value,
            targetLanguage: targetLanguage.value,
            question: requirements.value,
            acceptPartial: true,
            ...(handoff?.title && mode.value === 'text' ? { title: handoff.title.slice(0, 200) } : {}),
          },
        };
        const result = await createToolboxQuote({
          toolId: 'translation',
          input: preparedInput,
          billingMedium: 'ai_quota',
          clientRequestId: quoteRequestId,
        });
        if (!current()) return;
        quote.value = result;
      }
      if (!current()) return;
      uncertain.value = true;
      streamController = new AbortController();
      if (!originalText.value) originalText.value = mode.value === 'text' ? text.value : '';
      submissionStarted = true;
      const result = await streamTranslation(
        { quoteId: quote.value.id, clientRequestId: jobRequestId },
        {
          signal: streamController.signal,
          onStart: (id) => {
            if (current()) {
              activeJobId.value = id;
              rememberRecord(id);
              historyRevision.value++;
            }
          },
          onSnapshot: (update) => {
            if (current()) {
              streamedText.value = update.content;
              if (typeof update.original === 'string') originalText.value = update.original;
            }
          },
        },
      );
      if (current()) {
        artifact.value = result;
        if (!originalText.value)
          originalText.value = (result.meta?.translation?.segments || [])
            .map((pair: TranslationPair) => pair.original)
            .join('');
        streamedText.value = result.content;
        uncertain.value = false;
      }
    } catch (failure: any) {
      const cause = failure?.response?.data?.data?.code
        ? { ...failure.response.data.data, status: failure.response.status }
        : failure;
      if (current()) {
        if (streamController?.signal.aborted) return;
        if (!submissionStarted) uncertain.value = false;
        error.value = t(
          toolboxErrorMessageKey(
            cause,
            !submissionStarted
              ? 'translation.preparationFailed'
              : uncertain.value && !cause.definitive
                ? 'translation.connectionLost'
                : 'translation.interrupted',
          ),
        );
        if (
          cause.definitive ||
          (!submissionStarted &&
            Number(cause?.status) >= 400 &&
            Number(cause?.status) < 500 &&
            (![408, 409].includes(Number(cause?.status)) || cause?.code === 'TOOLBOX_QUOTE_EXPIRED'))
        ) {
          uncertain.value = false;
          quote.value = null;
          quoteRequestId = crypto.randomUUID();
          jobRequestId = crypto.randomUUID();
        }
      }
    } finally {
      busy.value = false;
      if (current()) historyRevision.value++;
    }
  }
</script>
<style scoped lang="less">
  .translation-workbench {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--ui-space-24, 24px);
    background: var(--surface-panel-bg);
    display: flex;
    color: var(--text-color);
  }
  .translation-history-desktop {
    width: var(--ui-layout-240, 240px);
    flex-shrink: 0;
    border: 1px solid var(--surface-border-color);
    border-right: 0;
    border-radius: 12px 0 0 12px;
    background: var(--surface-panel-bg);
  }
  .translation-history-trigger.b_btn {
    display: none;
  }
  .translation-history-mobile :deep(h2) {
    display: none;
  }
  .translation-history-mobile {
    height: calc(100vh - var(--ui-layout-160, 160px));
    height: calc(100dvh - var(--ui-layout-160, 160px));
  }
  .translation-footer-spacer {
    flex: 1;
  }
  .translation-record-loading {
    position: absolute;
    inset-inline: var(--ui-space-12, 12px);
    top: 0;
    /* ui-density-fixed: 非占位进度描边 */
    height: 2px;
    overflow: hidden;
    pointer-events: none;
    &::after {
      content: '';
      display: block;
      height: 100%;
      width: 25%;
      background: var(--primary-color);
      animation: translation-record-progress 1.2s ease-in-out infinite alternate;
    }
  }
  @keyframes translation-record-progress {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(300%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .translation-record-loading::after {
      animation: none;
      width: 100%;
    }
  }
  .translation-workspace {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: var(--ui-layout-540, 540px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    margin: 0;
    flex: 1;
    min-width: 0;
    background: var(--background-color);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    padding: var(--ui-space-24, 24px) var(--ui-space-24, 24px) 0;
  }
  .translation-workspace.requirements-open {
    min-height: var(--ui-layout-680, 680px);
  }
  .translation-back {
    align-self: flex-start;
    flex-shrink: 0;
    padding: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  h1 {
    font-size: var(--ui-font-24, 24px);
    margin: var(--ui-space-12, 12px) 0 var(--ui-space-16, 16px);
  }
  h2 {
    display: none;
    margin: 0 0 var(--ui-space-12, 12px);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .translation-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) 0;
  }
  .translation-selected,
  .translation-choose.b_btn {
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    padding: var(--ui-space-16, 16px);
  }
  .translation-selected > :first-child,
  .translation-choose > :first-child {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .translation-selected-copy,
  .translation-choose > span {
    display: grid;
    gap: var(--ui-space-4, 4px);
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .translation-selected strong {
    font-size: var(--ui-font-14, 14px);
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .translation-selected span,
  .translation-choose small {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .translation-choose.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-control-72, 72px);
    background: transparent;
    line-height: 1.6;
  }
  .translation-toolbar {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
  }
  .translation-toolbar > :deep(.b-select) {
    width: var(--ui-layout-160, 160px);
  }
  .translation-toolbar > .translation-requirements-toggle {
    margin-left: 0;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color);
  }
  .translation-toolbar > .translation-requirements-toggle:hover {
    text-decoration: none;
  }
  .is-expanded {
    transform: rotate(180deg);
  }
  p {
    margin: 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.6;
  }
  .translation-count {
    display: block;
    text-align: right;
    padding-top: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .translation-footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) 0;
    border-top: 1px solid var(--surface-border-color);
    background: var(--background-color);
    position: sticky;
    bottom: 0;
    z-index: 2;
  }
  .translation-footer p {
    margin-right: auto;
  }
  .translation-footer > span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .translation-footer .b_btn {
    min-width: var(--ui-layout-120, 120px);
  }
  .is-error {
    color: var(--danger-color);
  }
  .translation-picker-icon {
    color: var(--primary-color);
    flex-shrink: 0;
    margin-right: var(--ui-space-8, 8px);
  }
  .translation-picker {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: var(--ui-space-12, 12px);
    height: min(65vh, var(--ui-layout-540, 540px));
    min-height: 0;
  }
  .translation-picker > p {
    text-align: center;
  }
  .translation-picker-header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    width: 100%;
  }
  .translation-picker :deep(.resource-picker-panel__item) {
    border-radius: 4px;
  }
  .translation-editor {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .translation-editor.has-output {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
  }
  .translation-source,
  .translation-output {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .has-output .translation-source-content,
  .translation-output {
    padding: var(--ui-space-16, 16px);
  }
  .translation-output {
    border-left: 1px solid var(--surface-border-color);
  }
  .translation-pane-title,
  .translation-output-heading {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--ui-space-16, 16px);
    font-size: var(--ui-font-14, 14px);
  }
  .translation-output-heading span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .has-output .translation-source-content :deep(textarea) {
    border: 1px solid var(--bl-input-border-color);
    background: var(--bl-input-bg-color);
    padding: var(--ui-space-12, 12px);
    line-height: 1.8;
    font-size: var(--ui-font-14, 14px);
  }
  .translation-source-toggle.b_btn {
    display: none;
  }
  .translation-prose {
    min-height: var(--ui-layout-160, 160px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .translation-prose :deep(pre),
  .translation-prose :deep(table) {
    max-width: 100%;
    overflow: auto;
  }
  .translation-prose :deep(table) {
    display: block;
  }
  .translation-source-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
  }
  .translation-source-content > .input-container {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .translation-editor :deep(textarea) {
    flex: 1;
    height: auto;
    align-self: stretch;
    min-height: 0;
    resize: none;
    padding-inline: var(--ui-space-12, 12px) !important;
  }
  .translation-output-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-wrap: anywhere;
  }
  .translation-empty {
    height: 100%;
    min-height: var(--ui-layout-160, 160px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
    text-align: center;
  }
  .translation-empty strong {
    font-weight: 400;
    font-size: var(--ui-font-14, 14px);
  }
  .translation-source-content > .translation-prose {
    min-height: 0;
    overflow-y: auto;
    flex: 1;
  }
  .translation-pane-title,
  .translation-material,
  .translation-count,
  .translation-source-hint {
    flex-shrink: 0;
  }
  .translation-source-hint {
    margin-top: var(--ui-space-12, 12px);
  }
  .translation-material {
    margin-bottom: var(--ui-space-16, 16px);
  }
  .translation-workspace > :deep(.tab-container),
  .translation-language {
    flex-shrink: 0;
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .translation-workbench {
      padding: var(--ui-space-16, 16px);
    }
    .translation-workspace {
      padding-inline: var(--ui-space-16, 16px);
    }
    .translation-toolbar {
      flex-wrap: wrap;
    }
  }

  .translation-prose :deep(h1) {
    font-size: var(--ui-font-18, 18px);
    line-height: 1.4;
  }
  .translation-prose :deep(h2),
  .translation-prose :deep(h3) {
    font-size: var(--ui-font-16, 16px);
    line-height: 1.5;
  }
  .translation-prose :deep(th),
  .translation-prose :deep(td) {
    border: 1px solid var(--surface-border-color);
    padding: var(--ui-space-8, 8px);
  }
  .translation-prose :deep(table) {
    border-collapse: collapse;
  }
  @media (max-width: 767px) {
    .translation-history-mobile {
      height: 100%;
    }
    .translation-history-desktop {
      display: none;
    }
    .translation-history-trigger.b_btn {
      display: flex;
      align-self: flex-end;
      margin-top: var(--ui-space-8, 8px);
    }
    .translation-footer-spacer {
      display: none;
    }
    .translation-editor.has-output {
      display: flex;
      flex-direction: column;
      border: 0;
      min-height: var(--ui-layout-240, 240px);
    }
    .translation-output.is-empty {
      display: none;
    }
    .translation-editor:not(.is-active) .translation-source {
      flex: 1;
    }
    .translation-output {
      flex: 1;
      min-height: var(--ui-layout-240, 240px);
    }
    .translation-output-scroll {
      overflow-y: auto;
      max-height: max(var(--ui-layout-240, 240px), calc(100vh - var(--ui-layout-320, 320px)));
      max-height: max(var(--ui-layout-240, 240px), calc(100dvh - var(--ui-layout-320, 320px)));
    }
    .translation-editor:not(.is-active) .translation-source-content {
      padding: 0;
    }
    .translation-editor:not(.is-active) .translation-pane-title {
      display: block;
    }
    .translation-workspace.requirements-open {
      min-height: 100%;
    }

    .translation-source-content {
      overflow: visible;
    }
    .translation-editor.is-active {
      flex: none;
    }
    .translation-source-content > .input-container {
      min-height: var(--ui-layout-240, 240px);
    }

    .translation-source-toggle.b_btn {
      display: flex;
      justify-content: space-between;
      width: 100%;
      min-height: var(--ui-control-44, 44px);
      height: auto;
      padding: 0;
      margin-bottom: var(--ui-space-8, 8px);
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--text-color);
      box-shadow: none;
      text-decoration: none;
      font-size: var(--ui-font-14, 14px);
      line-height: 1.5;
    }
    .translation-source-toggle.b_btn:hover,
    .translation-source-toggle.b_btn:active {
      background: transparent;
      text-decoration: none;
    }
    .translation-source-label {
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
    }
    .translation-source-label small {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
    }
    .translation-editor.is-active .translation-source {
      border-bottom: 1px solid var(--surface-border-color);
      padding-bottom: var(--ui-space-8, 8px);
      margin-bottom: var(--ui-space-8, 8px);
    }
    .translation-output-heading {
      align-items: center;
      min-height: var(--ui-control-44, 44px);
      line-height: 1.5;
      margin-bottom: var(--ui-space-8, 8px);
    }
    .source-collapsed .translation-source-content {
      display: none;
    }
    .translation-pane-title {
      display: none;
    }
    .has-output .translation-source-content,
    .translation-output {
      padding: 0;
    }
    .translation-output {
      border-left: 0;
    }
    .translation-workbench {
      padding: 0;
      background: var(--background-color);
    }
    .translation-workspace {
      border: 0;
      border-radius: 0;
      height: auto;
      min-height: 100%;
      box-sizing: border-box;
      padding: 0 var(--ui-space-16, 16px);
      display: flex;
      flex-direction: column;
    }
    h1,
    .translation-back {
      display: none;
    }
    h2 {
      display: none;
    }
    .translation-workspace > :deep(.tab-container) {
      flex-shrink: 0;
    }
    .translation-body {
      gap: var(--ui-space-16, 16px);
      flex: 1;
      align-content: start;
      padding-top: var(--ui-space-16, 16px);
    }
    .translation-selected {
      border: 0;
      border-bottom: 1px solid var(--surface-border-color);
      border-radius: 0;
      padding: 0 0 var(--ui-space-20, 20px);
    }
    .translation-toolbar {
      flex-wrap: wrap;
    }
    .translation-toolbar > :deep(.b-select) {
      flex: 1;
      min-width: 0;
    }
    .translation-toolbar > .translation-requirements-toggle {
      flex-basis: 100%;
      justify-content: flex-start;
      padding-inline: 0;
      height: var(--ui-control-32, 32px);
      margin: 0;
    }
    .translation-footer {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ui-space-8, 8px);
      padding-bottom: calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom, 0px));
    }
    .translation-footer .b_btn {
      width: 100%;
      height: var(--ui-control-44, 44px);
      flex: 1;
      min-width: 0;
    }
    .translation-footer p {
      width: 100%;
    }
    .translation-footer > span {
      text-align: center;
    }
    .translation-picker {
      padding: var(--ui-space-16, 16px);
      height: calc(100vh - var(--ui-layout-100, 100px));
      height: calc(100dvh - var(--ui-layout-100, 100px));
      box-sizing: border-box;
    }
  }
</style>
