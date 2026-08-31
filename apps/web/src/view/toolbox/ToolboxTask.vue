<template>
  <main ref="pageRef" class="toolbox-task" data-mobile-resource-scroll>
    <div class="toolbox-task__inner">
      <BButton class="toolbox-task__back" @click="returnToToolboxParent">
        <SvgIcon :src="icon.toolbox.back" size="16" />{{ t('toolbox.task.backHome') }}
      </BButton>

      <div v-if="loading && !job" class="toolbox-task__state"
        ><BLoading inline loading :title="t('toolbox.task.loading')"
      /></div>
      <div v-else-if="loadFailed || !job" class="toolbox-task__state is-error" role="alert">
        <span>{{ t('toolbox.task.loadFailed') }}</span>
        <BButton size="small" @click="loadJob(false)">{{ t('toolbox.task.retry') }}</BButton>
      </div>

      <template v-else>
        <header class="toolbox-task__header">
          <span class="toolbox-task__tool-icon"><SvgIcon :src="presentation.icon" size="24" /></span>
          <div class="toolbox-task__title">
            <span>{{ t(`toolbox.tool.${job.toolId}.name`) }}</span>
            <h1>{{ artifact?.title || t('toolbox.task.title') }}</h1>
          </div>
          <span class="toolbox-task__status" :class="`is-${job.status}`">
            <SvgIcon
              :class="{ 'is-spinning': job.status === 'processing' || isRetrying }"
              :src="statusIcon"
              size="19"
            />
            <span>
              <strong>{{ isRetrying ? t('toolbox.task.retryingTitle') : t(`toolbox.task.${job.status}`) }}</strong>
              <small>{{ formatDate(job.updatedAt) }}</small>
            </span>
          </span>
        </header>

        <div v-if="refreshFailed" class="toolbox-task__refresh-warning" role="status">
          <SvgIcon :src="icon.message.warning" size="18" />
          <span>{{ t('toolbox.task.refreshFailed') }}</span>
          <BButton size="small" @click="loadJob(true)">{{ t('common.retry') }}</BButton>
        </div>

        <section v-if="showProgress" class="toolbox-task__progress" :class="`is-${job.status}`">
          <div class="toolbox-task__progress-head">
            <div
              ><span>{{ t('toolbox.task.stageCurrent') }}</span
              ><strong>{{ currentStageLabel }}</strong
              ><small>{{ currentStageDescription }}</small></div
            >
            <span>{{ formatDate(job.updatedAt) }}</span>
          </div>

          <ol class="toolbox-stage-list">
            <li v-for="stage in stageSteps" :key="stage.key" :class="`is-${stage.state}`">
              <span class="toolbox-stage-list__marker">
                <SvgIcon v-if="stage.state === 'done'" :src="icon.message.success" size="18" />
                <SvgIcon
                  v-else-if="stage.state === 'active'"
                  class="is-spinning"
                  :src="icon.message.loading"
                  size="18"
                />
                <span v-else>{{ stage.index }}</span>
              </span>
              <span class="toolbox-stage-list__copy">
                <strong>{{ stage.label }}</strong>
                <small>{{ stage.description }}</small>
              </span>
            </li>
          </ol>

          <div class="toolbox-task__progress-foot">
            <span>{{
              t(isPromptCreation ? 'toolbox.task.progressPromptHint' : 'toolbox.task.progressTruthfulHint')
            }}</span>
            <BButton v-if="job.canCancel" size="small" :loading="cancelling" @click="confirmCancel">{{
              t('toolbox.task.cancel')
            }}</BButton>
          </div>
        </section>

        <section
          v-if="job.error"
          class="toolbox-task__error"
          :class="{ 'is-retrying': isRetrying }"
          :role="isRetrying ? 'status' : 'alert'"
        >
          <SvgIcon
            :class="{ 'is-spinning': isRetrying }"
            :src="
              isRetrying ? icon.message.loading : job.status === 'failed' ? icon.message.error : icon.message.warning
            "
            size="19"
          /><div
            ><strong>{{ isRetrying ? t('toolbox.task.retryingTitle') : t(`toolbox.task.${job.status}`) }}</strong
            ><span>{{ visibleErrorMessage }}</span></div
          >
        </section>

        <template v-if="artifact">
          <section v-if="showDraftBanner" class="toolbox-task__draft-banner">
            <SvgIcon :src="icon.message.warning" size="20" />
            <div
              ><strong>{{ t('toolbox.task.draftBanner') }}</strong
              ><span>{{ t('toolbox.task.draftDescription') }}</span></div
            >
          </section>

          <section class="toolbox-result">
            <BTabs v-model:active-tab="activeTab" variant="line" :options="tabOptions" />

            <div v-if="activeTab === 'output'" class="toolbox-result__output">
              <div class="toolbox-result__document">
                <div class="toolbox-result__document-head">
                  <span>{{ t('toolbox.task.resultEyebrow') }}</span>
                  <h2>{{ artifact.title }}</h2>
                  <p>{{ resultMaterialSummary }}</p>
                </div>
                <article class="toolbox-result__markdown" v-html="renderedContent"></article>
              </div>
              <aside class="toolbox-result__rail">
                <section v-if="!isPromptCreation" class="toolbox-result__evidence-note">
                  <span><SvgIcon :src="icon.toolbox.locate" size="19" /></span>
                  <div>
                    <strong>{{ t('toolbox.task.evidenceTitle') }}</strong>
                    <p>{{ t('toolbox.task.citationPolicy') }}</p>
                  </div>
                  <BButton size="small" @click="activeTab = 'sources'">{{ t('toolbox.task.viewMaterials') }}</BButton>
                </section>
                <section class="toolbox-result__actions">
                  <div class="toolbox-result__save-copy">
                    <strong>
                      {{
                        savedTargetUnavailable
                          ? t('toolbox.task.savedTargetUnavailableTitle')
                          : t('toolbox.task.continueResultTitle')
                      }}
                    </strong>
                    <span>
                      {{
                        t(
                          savedTargetUnavailable
                            ? 'toolbox.task.savedTargetUnavailableHint'
                            : 'toolbox.task.continueResultHint',
                        )
                      }}
                    </span>
                  </div>
                  <BButton
                    v-if="savedTargetUnavailable"
                    type="primary"
                    :loading="saving"
                    @click="saveArtifact('recreate_missing_target')"
                  >
                    {{ saving ? t('toolbox.task.saving') : t('toolbox.task.saveAsNewNote') }}
                  </BButton>
                  <BButton v-else-if="!artifactSaved" type="primary" :loading="saving" @click="saveArtifact('save')">
                    {{ saving ? t('toolbox.task.saving') : t('toolbox.task.saveToNote') }}
                  </BButton>
                  <BButton v-else type="primary" :loading="openingSavedNote" @click="openSavedNote">
                    {{ t('toolbox.task.openNote') }}<SvgIcon :src="icon.toolbox.arrow" size="14" />
                  </BButton>
                </section>
              </aside>
            </div>

            <div v-else-if="activeTab === 'sources'" class="toolbox-result__sources">
              <div v-if="sourcePresentations.length" class="toolbox-source-summary">
                <span><SvgIcon :src="icon.toolbox.locate" size="21" /></span>
                <div>
                  <strong>{{ sourceSummaryLabel }}</strong>
                  <small>{{ t('toolbox.task.sourceSummaryDescription') }}</small>
                </div>
              </div>
              <div v-if="coverageWarnings.length" class="toolbox-result__warnings">
                <strong>{{ t('toolbox.task.unknowns') }}</strong>
                <ul
                  ><li v-for="(warning, index) in coverageWarnings" :key="index">{{ warning }}</li></ul
                >
              </div>
              <div v-if="sourcePresentations.length" class="toolbox-source-list">
                <article v-for="source in sourcePresentations" :key="source.key">
                  <span class="toolbox-source-list__icon" :class="`is-${source.type}`">
                    <SvgIcon :src="source.icon" size="18" />
                  </span>
                  <span class="toolbox-source-list__copy">
                    <strong>{{ source.title }}</strong>
                    <span class="toolbox-source-list__meta">
                      <small v-for="meta in source.meta" :key="meta">{{ meta }}</small>
                    </span>
                    <p v-if="source.excerpt">{{ source.excerpt }}</p>
                    <ul v-if="source.issues.length" class="toolbox-source-list__issues">
                      <li v-for="issue in source.issues" :key="issue">{{ issue }}</li>
                    </ul>
                  </span>
                  <span class="toolbox-source-list__state" :class="`is-${source.state}`">
                    <SvgIcon :src="source.stateIcon" size="16" />
                    {{ t(`toolbox.task.sourceStates.${source.state}`) }}
                  </span>
                </article>
              </div>
              <div v-else class="toolbox-result__empty">{{ t('toolbox.task.noSources') }}</div>
            </div>

            <div v-else-if="!usesAiQuota" class="toolbox-result__billing">
              <div
                ><span>{{ t('toolbox.task.quoted') }}</span
                ><strong>{{ job.billing.quotedPoints }}</strong></div
              >
              <div
                ><span>{{ t('toolbox.task.actual') }}</span
                ><strong>{{ job.billing.actualPoints }}</strong></div
              >
              <div
                ><span>{{ t('toolbox.task.refunded') }}</span
                ><strong>{{ job.billing.refundedPoints }}</strong></div
              >
              <p
                ><SvgIcon :src="icon.toolbox.coin" size="16" />{{
                  t(isPromptCreation ? 'toolbox.promptPointsRule' : 'toolbox.pointsRule')
                }}</p
              >
            </div>
            <div v-else class="toolbox-result__quota-billing">
              <span class="toolbox-result__quota-icon"><SvgIcon :src="icon.settings.ai" size="22" /></span>
              <span class="toolbox-result__quota-copy">
                <strong>{{ t('toolbox.task.aiQuotaBillingTitle') }}</strong>
                <small>{{ t('toolbox.task.aiQuotaBillingDescription') }}</small>
              </span>
              <BButton size="small" @click="openAiUsage">{{ t('toolbox.task.viewAiUsage') }}</BButton>
            </div>
          </section>
        </template>

        <div
          v-else-if="isTerminal"
          class="toolbox-task__state"
          :class="{ 'is-error': artifactLoadFailed }"
          :role="artifactLoadFailed ? 'alert' : 'status'"
        >
          <BLoading v-if="artifactLoading" inline loading :title="t('toolbox.task.artifactLoading')" />
          <template v-else>
            <span>{{
              artifactLoadFailed
                ? t('toolbox.task.artifactLoadFailed')
                : job.artifactState === 'expired'
                  ? t('toolbox.task.artifactExpired')
                  : t('toolbox.task.noArtifact')
            }}</span>
            <BButton
              v-if="artifactLoadFailed && job.artifact?.id"
              size="small"
              :loading="artifactLoading"
              @click="retryArtifact"
            >
              {{ t('toolbox.task.retry') }}
            </BButton>
          </template>
        </div>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    cancelToolboxJob,
    createToolboxArtifactSaveRequestId,
    fetchToolboxArtifact,
    fetchToolboxJob,
    saveToolboxArtifact,
    type ToolboxArtifact,
    type ToolboxJob,
  } from '@/api/toolbox';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import { TOOLBOX_PRESENTATION } from '@/config/toolbox';
  import { useNoteWorkspaceStore, useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { stripAiAnalysisCitations } from '@/utils/aiAnalysisContent';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import { toolboxErrorMessageKey } from '@/utils/toolboxErrorPresentation';
  import {
    restoreToolboxScrollSnapshot,
    returnFromToolboxPage,
    saveToolboxScrollSnapshot,
  } from '@/utils/toolboxNavigation';
  import { recordToolboxRecentUse, toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import {
    toolboxArtifactSourceRecords,
    toolboxCoverageIssueKinds,
    toolboxSourceExcerpt,
    toolboxSourceFileType,
    toolboxSourceIncludedChars,
    toolboxSourceLocator,
    toolboxSourceState,
    toolboxSourceType,
    toolboxSourceWarningKinds,
  } from '@/utils/toolboxArtifactPresentation';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const noteWorkspace = useNoteWorkspaceStore();
  const { load: loadGrowth } = useGrowth();
  const job = ref<ToolboxJob | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  const artifact = ref<ToolboxArtifact | null>(null);
  const loading = ref(true);
  const loadFailed = ref(false);
  const refreshFailed = ref(false);
  const artifactLoadFailed = ref(false);
  const artifactLoading = ref(false);
  const cancelling = ref(false);
  const saving = ref(false);
  const openingSavedNote = ref(false);
  const savedNoteId = ref('');
  const activeTab = ref('output');
  let pollTimer = 0;
  let pollFailureCount = 0;
  let requestVersion = 0;
  const POLL_DELAY_MS = 1800;
  const MAX_POLL_RETRY_DELAY_MS = 15_000;
  const jobId = computed(() => String(route.params.jobId || ''));
  const presentation = computed(
    () => TOOLBOX_PRESENTATION[job.value?.toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note,
  );
  const isTerminal = computed(() =>
    Boolean(
      job.value && ['succeeded', 'partial_succeeded', 'failed', 'cancelled', 'expired'].includes(job.value.status),
    ),
  );
  const isRetrying = computed(() => job.value?.status === 'queued' && job.value?.stage === 'retrying');
  const usesAiQuota = computed(() => job.value?.billing.medium === 'ai_quota');
  const visibleErrorMessage = computed(() => {
    const key = toolboxErrorMessageKey(job.value?.error, 'toolbox.task.processingFailed');
    if (key !== 'toolbox.task.processingFailed') return t(key);
    return job.value?.status === 'failed' ? t('toolbox.task.finalFailureMessage') : t('toolbox.task.processingFailed');
  });
  const showProgress = computed(() => ['queued', 'processing'].includes(job.value?.status || ''));
  const isPromptCreation = computed(() => job.value?.toolId === 'idea_to_draft');
  const statusIcon = computed(() => {
    if (isRetrying.value) return icon.message.loading;
    if (job.value?.status === 'succeeded') return icon.message.success;
    if (job.value?.status === 'partial_succeeded') return icon.message.warning;
    if (['failed', 'expired'].includes(job.value?.status || '')) return icon.message.error;
    if (job.value?.status === 'processing') return icon.message.loading;
    return icon.toolbox.task;
  });
  const currentStageKey = computed<'prepare' | 'sources' | 'produce' | 'deliver'>(() => {
    const stage = String(job.value?.stage || '').toLowerCase();
    if (['waiting_document', 'reading_sources', 'sources_ready', 'preparing_prompt', 'prompt_ready'].includes(stage)) {
      return 'sources';
    }
    if (['recognizing', 'generating', 'preparing_result', 'composing'].includes(stage)) return 'produce';
    if (['saving_result', 'completed'].includes(stage)) return 'deliver';
    return 'prepare';
  });
  function stageText(key: 'prepare' | 'sources' | 'produce' | 'deliver', field: 'label' | 'description') {
    const base = isPromptCreation.value ? 'toolbox.task.stagePrompt' : 'toolbox.task.stage';
    return t(`${base}.${key}.${field}`);
  }
  const currentStageLabel = computed(() => stageText(currentStageKey.value, 'label'));
  const currentStageDescription = computed(() => stageText(currentStageKey.value, 'description'));
  const stageSteps = computed(() => {
    const keys = ['prepare', 'sources', 'produce', 'deliver'] as const;
    const activeIndex = keys.indexOf(currentStageKey.value);
    return keys.map((key, index) => ({
      key,
      index: index + 1,
      label: stageText(key, 'label'),
      description: stageText(key, 'description'),
      state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
    }));
  });
  const showDraftBanner = computed(
    () => artifact.value?.meta?.draftState === 'needs_verification' || job.value?.status === 'partial_succeeded',
  );
  const savedTargetAvailability = computed(() => {
    const save = artifact.value?.save;
    return save?.targetAvailability || (save?.targetId ? 'available' : 'none');
  });
  const savedTargetUnavailable = computed(
    () => artifact.value?.save.status === 'saved' && ['trashed', 'missing'].includes(savedTargetAvailability.value),
  );
  const artifactSaved = computed(() => Boolean(savedNoteId.value) && savedTargetAvailability.value === 'available');
  const coverageWarnings = computed<string[]>(() =>
    toolboxCoverageIssueKinds(artifact.value?.coverage?.warnings).map((kind) =>
      t(`toolbox.task.coverageIssues.${kind}`),
    ),
  );
  const sourceRecords = computed(() => toolboxArtifactSourceRecords(artifact.value?.sources, artifact.value?.coverage));
  const sourcePresentations = computed(() =>
    sourceRecords.value.map((source, index) => {
      const type = toolboxSourceType(source);
      const locator = toolboxSourceLocator(source);
      const includedChars = toolboxSourceIncludedChars(source);
      const fileType = toolboxSourceFileType(source);
      const state = toolboxSourceState(source);
      return {
        key: sourceKey(source, index),
        type,
        icon: resourceIcon(type),
        title: sourceTitle(source, index),
        excerpt: toolboxSourceExcerpt(source),
        issues: toolboxSourceWarningKinds(source).map((kind) => t(`toolbox.task.coverageIssues.${kind}`)),
        state,
        stateIcon:
          state === 'complete' ? icon.message.success : state === 'partial' ? icon.message.warning : icon.message.error,
        meta: [
          t(`toolbox.task.sourceTypes.${type}`),
          fileType,
          formatSourceLocator(locator),
          includedChars ? t('toolbox.task.sourceIncludedChars', { count: includedChars.toLocaleString() }) : '',
        ].filter(Boolean),
      };
    }),
  );
  const requestedSourceCount = computed(() => {
    const value = Number(artifact.value?.coverage?.requestedResources);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : sourcePresentations.value.length;
  });
  const resultMaterialSummary = computed(() =>
    isPromptCreation.value
      ? t('toolbox.task.resultPromptSummary')
      : t('toolbox.task.resultMaterialCount', {
          represented: sourcePresentations.value.filter((source) => source.state !== 'unavailable').length,
          requested: requestedSourceCount.value,
        }),
  );
  const sourceReviewCount = computed(
    () => sourcePresentations.value.filter((source) => source.state !== 'complete').length,
  );
  const sourceSummaryLabel = computed(() =>
    sourceReviewCount.value
      ? t('toolbox.task.sourceSummaryReview', {
          count: sourcePresentations.value.length,
          review: sourceReviewCount.value,
        })
      : t('toolbox.task.sourceSummary', { count: sourcePresentations.value.length }),
  );
  const renderedContent = computed(() => {
    const content = stripAiAnalysisCitations(artifact.value?.content).replace(
      /^>\s*草稿已生成\s*·\s*待核验\s*\n+/u,
      '',
    );
    return renderStreamingMarkdown(content);
  });
  const tabOptions = computed(() => [
    { key: 'output', label: t('toolbox.task.outputTab') },
    ...(!isPromptCreation.value
      ? [{ key: 'sources', label: t('toolbox.task.sourcesTab'), badge: sourcePresentations.value.length }]
      : []),
    { key: 'billing', label: t('toolbox.task.billingTab') },
  ]);

  function returnToToolboxParent() {
    returnFromToolboxPage(router, 'task');
  }

  function openAiUsage() {
    void router.push('/ai-usage');
  }

  function rememberTaskScroll() {
    saveToolboxScrollSnapshot({
      routeFullPath: route.fullPath,
      identityKey: toolboxRecentUseIdentityKey(user),
      element: pageRef.value,
    });
  }

  useMobileTopBar(['toolboxTask'], {
    title: () => artifact.value?.title || t('toolbox.task.title'),
    onBack: returnToToolboxParent,
    searchMode: 'icon',
    showNotification: false,
  });

  function clearPoll() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = 0;
  }
  function schedulePoll(delay = POLL_DELAY_MS) {
    clearPoll();
    pollTimer = window.setTimeout(() => void loadJob(true), delay);
  }
  async function loadJob(silent = false) {
    const version = ++requestVersion;
    if (!silent) loading.value = true;
    if (!silent || !job.value) loadFailed.value = false;
    try {
      const value = await fetchToolboxJob(jobId.value);
      if (version !== requestVersion) return;
      job.value = value;
      recordToolboxRecentUse(user, value.toolId);
      loadFailed.value = false;
      refreshFailed.value = false;
      pollFailureCount = 0;
      if (!['succeeded', 'partial_succeeded', 'failed', 'cancelled', 'expired'].includes(value.status)) {
        schedulePoll();
      } else {
        clearPoll();
        try {
          await loadGrowth(true);
        } catch {
          // 账户积分摘要刷新失败不影响任务与成果这一事实源。
        }
        if (value.artifact?.id) await loadArtifact(value.artifact.id, version);
      }
    } catch {
      if (version !== requestVersion) return;
      if (silent && job.value) {
        refreshFailed.value = true;
        pollFailureCount += 1;
        if (!isTerminal.value) {
          schedulePoll(Math.min(MAX_POLL_RETRY_DELAY_MS, POLL_DELAY_MS * 2 ** Math.min(pollFailureCount, 3)));
        }
      } else {
        loadFailed.value = true;
      }
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }
  async function loadArtifact(artifactId: string, version = requestVersion) {
    if (version === requestVersion) {
      artifactLoadFailed.value = false;
      artifactLoading.value = true;
    }
    try {
      const value = await fetchToolboxArtifact(artifactId);
      if (version !== requestVersion) return;
      artifact.value = value;
      artifactLoadFailed.value = false;
      savedNoteId.value =
        (value.save.targetAvailability || (value.save.targetId ? 'available' : 'none')) === 'available'
          ? String(value.save.targetId || '')
          : '';
    } catch {
      if (version === requestVersion) {
        artifactLoadFailed.value = true;
      }
    } finally {
      if (version === requestVersion) artifactLoading.value = false;
    }
  }
  function retryArtifact() {
    const artifactId = job.value?.artifact?.id;
    if (!artifactId || artifactLoading.value) return;
    void loadArtifact(artifactId);
  }
  function confirmCancel() {
    Alert.alert({
      title: t('toolbox.task.cancel'),
      content: t('toolbox.task.cancelHint'),
      okText: t('toolbox.task.cancel'),
      cancelText: t('common.cancel'),
      onOk: () => void runCancel(),
    });
  }
  async function runCancel() {
    if (!job.value || cancelling.value) return;
    cancelling.value = true;
    try {
      job.value = await cancelToolboxJob(job.value.id);
      await loadGrowth(true);
    } catch (error: any) {
      message.error(t(toolboxErrorMessageKey(error, 'toolbox.task.loadFailed')));
    } finally {
      cancelling.value = false;
    }
  }
  async function saveArtifact(action: 'save' | 'recreate_missing_target' = 'save') {
    if (!artifact.value) return '';
    if (saving.value) return savedNoteId.value;
    if (action === 'save' && savedNoteId.value) return savedNoteId.value;
    saving.value = true;
    try {
      const result = await saveToolboxArtifact(
        artifact.value.id,
        createToolboxArtifactSaveRequestId(artifact.value.id, artifact.value.version),
        action,
      );
      savedNoteId.value = result.targetId;
      artifact.value.save = {
        status: 'saved',
        targetType: 'note',
        targetId: result.targetId,
        targetAvailability: 'available',
      };
      registerSavedNoteInWorkspace(result.targetId);
      message.success(t('toolbox.task.saved'));
      return result.targetId;
    } catch (error: any) {
      message.error(t(toolboxErrorMessageKey(error, 'toolbox.task.saveFailed')));
      return '';
    } finally {
      saving.value = false;
    }
  }
  function registerSavedNoteInWorkspace(noteId: string) {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId || !artifact.value) return;
    noteWorkspace.ensureOwner(buildNoteDetailRequestScope(user));
    noteWorkspace.insertCreatedNote({
      id: normalizedId,
      parentId: null,
      title: artifact.value.title,
      type: 'markdown',
    });
    noteWorkspace.seedBreadcrumb(normalizedId, [{ id: normalizedId, title: artifact.value.title }]);
  }
  async function openSavedNote() {
    if (!savedNoteId.value || !artifact.value || openingSavedNote.value) return;
    openingSavedNote.value = true;
    try {
      const latest = await fetchToolboxArtifact(artifact.value.id);
      artifact.value = latest;
      const availability = latest.save.targetAvailability || (latest.save.targetId ? 'available' : 'none');
      savedNoteId.value = availability === 'available' ? String(latest.save.targetId || '') : '';
      if (!savedNoteId.value) {
        message.warning(t('toolbox.task.savedTargetUnavailableHint'));
        return;
      }
      registerSavedNoteInWorkspace(savedNoteId.value);
      rememberTaskScroll();
      await router.push(`/noteLibrary/${encodeURIComponent(savedNoteId.value)}`);
    } catch {
      message.error(t('toolbox.task.openNoteCheckFailed'));
    } finally {
      openingSavedNote.value = false;
    }
  }
  function sourceKey(source: Record<string, unknown>, index: number) {
    return String(source.id || source.resourceId || source.citationKey || index);
  }
  function sourceTitle(source: Record<string, unknown>, index: number) {
    const value = [source.title, source.name, source.fileName, source.label].find(
      (candidate) => typeof candidate === 'string' || typeof candidate === 'number',
    );
    return value == null ? `${t('toolbox.task.sourcesTab')} ${index + 1}` : String(value);
  }
  function resourceIcon(type: 'bookmark' | 'note' | 'file' | 'todo' | 'unknown') {
    if (type === 'bookmark') return icon.resource.bookmark;
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.toolbox.task;
  }
  function formatSourceLocator(locator: { type: string; value: string } | null) {
    if (!locator) return '';
    const chunkMatch = locator.value.match(/^chunk:(\d+)$/iu);
    if (chunkMatch) return t('toolbox.task.sourceLocatorChunk', { count: Number(chunkMatch[1]) });
    if (['正文', '网页快照', '书签信息', '解析正文', '待办详情'].includes(locator.value)) {
      const knownType = ['document', 'snapshot', 'metadata', 'file', 'todo'].includes(locator.type)
        ? locator.type
        : 'paragraph';
      return t(`toolbox.task.sourceLocatorTypes.${knownType}`);
    }
    const value = locator.value.trim();
    const looksInternal =
      value.length > 90 ||
      /^https?:\/\//iu.test(value) ||
      /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(value) ||
      /^[a-z_]+:[a-z_-]+:[^\s]+$/iu.test(value);
    if (value && !looksInternal && /[\p{L}\p{N}]/u.test(value)) {
      return t('toolbox.task.sourceLocatorSection', { value });
    }
    if (['document', 'snapshot', 'metadata', 'file', 'todo', 'paragraph'].includes(locator.type))
      return t(`toolbox.task.sourceLocatorTypes.${locator.type}`);
    return '';
  }
  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      clearPoll();
      return;
    }
    if (job.value && !isTerminal.value) void loadJob(true);
  }

  async function resetPageScroll() {
    await nextTick();
    window.requestAnimationFrame(() => pageRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  watch(jobId, (current, previous) => {
    if (current === previous) return;
    requestVersion += 1;
    clearPoll();
    job.value = null;
    artifact.value = null;
    artifactLoadFailed.value = false;
    artifactLoading.value = false;
    savedNoteId.value = '';
    activeTab.value = 'output';
    loadFailed.value = false;
    refreshFailed.value = false;
    pollFailureCount = 0;
    void resetPageScroll();
    void loadJob();
  });

  async function initializeTask() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    await loadJob();
    await nextTick();
    window.requestAnimationFrame(() => {
      const restored = restoreToolboxScrollSnapshot({
        routeFullPath: route.fullPath,
        identityKey: toolboxRecentUseIdentityKey(user),
        element: pageRef.value,
      });
      if (!restored) pageRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }
  onMounted(() => {
    void initializeTask();
  });
  onBeforeUnmount(() => {
    requestVersion += 1;
    clearPoll();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<style scoped lang="less">
  @import './toolboxPageScroll.less';

  .toolbox-task {
    .toolbox-page-scroll();
    padding: 24px clamp(20px, 4vw, 52px) 52px;
    color: var(--text-color);
  }
  .toolbox-task__inner {
    width: min(1040px, 100%);
    margin: 0 auto;
  }
  .toolbox-task__back {
    position: sticky;
    z-index: 8;
    top: 8px;
    height: 32px;
    margin-bottom: 14px;
    padding: 0 8px;
    gap: 6px;
    color: var(--desc-color);
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--card-background);
    box-shadow: 0 6px 18px rgba(20, 24, 40, 0.08);
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-task__back:hover {
      border-color: var(--primary-color);
      color: var(--primary-color);
      background: var(--hover-background);
    }
  }
  .toolbox-task__state {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
  }
  .toolbox-task__state.is-error {
    min-height: 210px;
    margin-top: 12px;
    padding: 28px;
    flex-direction: column;
    box-sizing: border-box;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 16px;
    color: var(--danger-color, #dc3e4d);
    text-align: center;
    background: var(--card-background);
  }
  .toolbox-task__state.is-error > span {
    max-width: 420px;
    color: var(--text-color);
    line-height: 1.6;
  }
  .toolbox-task__header {
    min-width: 0;
    padding: 20px 22px;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 19px;
    background: var(--card-background);
  }
  .toolbox-task__tool-icon {
    width: 50px;
    height: 50px;
    flex: 0 0 50px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 15px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }
  .toolbox-task__title {
    min-width: 0;
    margin-right: auto;
  }
  .toolbox-task__title > span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .toolbox-task__title h1 {
    margin: 3px 0 0;
    overflow: hidden;
    font-size: 21px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-task__progress {
    margin-top: 12px;
    padding: 15px 17px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }
  .toolbox-task__refresh-warning {
    margin-top: 12px;
    min-height: 42px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--chip-pending-border, #e0bd72);
    border-radius: 12px;
    color: var(--chip-pending-fg, #8b570d);
    background: var(--card-background);
    font-size: 12px;
  }
  .toolbox-task__refresh-warning > span {
    min-width: 0;
    flex: 1;
  }
  .toolbox-task__refresh-warning :deep(.b_btn) {
    flex: 0 0 auto;
  }
  .toolbox-task__progress-head,
  .toolbox-task__progress-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .toolbox-task__progress-head {
    margin-bottom: 10px;
  }
  .toolbox-task__progress-head > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .toolbox-task__progress-head span,
  .toolbox-task__progress-foot {
    color: var(--desc-color);
    font-size: 11px;
  }
  .toolbox-task__progress-foot {
    margin-top: 9px;
  }
  .toolbox-task__progress-foot :deep(.b_btn) {
    height: 26px;
  }
  .toolbox-task__error,
  .toolbox-task__draft-banner {
    margin-top: 12px;
    padding: 13px 15px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-radius: 13px;
  }
  .toolbox-task__error {
    border: 1px solid var(--danger-fill-bg, #d93b3b);
    color: var(--danger-fill-bg, #d93b3b);
    background: var(--card-background);
  }
  .toolbox-task__error.is-retrying {
    border-color: var(--chip-pending-border, #e0bd72);
    color: var(--chip-pending-fg, #8b570d);
    background: var(--card-background);
  }
  .toolbox-task__draft-banner {
    border: 1px solid var(--chip-pending-border, #e0bd72);
    color: var(--chip-pending-fg, #8b570d);
    background: var(--chip-pending-bg, color-mix(in srgb, #ad6b0d 7%, var(--card-background)));
  }
  .toolbox-task__error div,
  .toolbox-task__draft-banner div {
    display: grid;
    gap: 3px;
  }
  .toolbox-task__error span,
  .toolbox-task__draft-banner span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .toolbox-result {
    margin-top: 12px;
    padding: 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }
  .toolbox-result__output {
    display: grid;
    gap: 18px;
  }
  .toolbox-result__markdown {
    min-height: 220px;
    padding: 6px 10px 20px;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.75;
  }
  .toolbox-result__markdown :deep(h1),
  .toolbox-result__markdown :deep(h2),
  .toolbox-result__markdown :deep(h3) {
    margin: 1.4em 0 0.65em;
    line-height: 1.35;
  }
  .toolbox-result__markdown :deep(h1) {
    font-size: 24px;
  }
  .toolbox-result__markdown :deep(h2) {
    font-size: 19px;
  }
  .toolbox-result__markdown :deep(p) {
    margin: 0.7em 0;
  }
  .toolbox-result__markdown :deep(blockquote) {
    margin: 1em 0;
    padding: 7px 13px;
    border-left: 3px solid var(--primary-color);
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-result__markdown :deep(pre) {
    padding: 13px;
    overflow: auto;
    border-radius: 10px;
    background: var(--hover-background);
  }
  .toolbox-result__markdown :deep(table) {
    width: 100%;
    border-collapse: collapse;
  }
  .toolbox-result__markdown :deep(th),
  .toolbox-result__markdown :deep(td) {
    padding: 8px;
    border: 1px solid var(--surface-border-color);
    text-align: left;
  }
  .toolbox-result__actions {
    padding: 14px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-result__actions > :deep(.b_btn) {
    gap: 6px;
  }
  .toolbox-result__save-copy {
    min-width: 0;
    margin-right: auto;
    flex: 1 1 390px;
    display: grid;
    gap: 3px;
  }
  .toolbox-result__save-copy span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .toolbox-result__sources {
    display: grid;
    gap: 12px;
  }
  .toolbox-result__warnings {
    padding: 12px 14px;
    border: 1px solid #ad6b0d;
    border-radius: 12px;
    background: var(--card-background);
  }
  .toolbox-result__warnings ul {
    margin: 7px 0 0;
    padding-left: 19px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .toolbox-source-list {
    display: grid;
    gap: 7px;
  }
  .toolbox-source-list article {
    min-width: 0;
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
  }
  .toolbox-source-list__index {
    width: 25px;
    height: 25px;
    flex: 0 0 25px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    font-size: 11px;
  }
  .toolbox-source-list__copy {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 2px;
  }
  .toolbox-source-list__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-source-list__copy small {
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-result__empty {
    min-height: 160px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  .toolbox-result__billing {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .toolbox-result__billing > div {
    padding: 16px;
    display: grid;
    gap: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
  }
  .toolbox-result__billing span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .toolbox-result__billing strong {
    font-size: 22px;
  }
  .toolbox-result__billing p {
    grid-column: 1 / -1;
    margin: 3px 0 0;
    display: flex;
    align-items: flex-start;
    gap: 7px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .toolbox-result__quota-billing {
    min-height: 88px;
    padding: 15px 16px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .toolbox-result__quota-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  .toolbox-result__quota-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .toolbox-result__quota-copy strong {
    font-size: 14px;
  }
  .toolbox-result__quota-copy small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  @media (max-width: 767px) {
    .toolbox-task {
      padding: 10px 12px calc(24px + env(safe-area-inset-bottom));
    }
    .toolbox-task__back {
      display: none;
    }
    .toolbox-task__header {
      padding: 14px;
      border-radius: 16px;
    }
    .toolbox-task__tool-icon {
      width: 42px;
      height: 42px;
      flex-basis: 42px;
    }
    .toolbox-task__title h1 {
      font-size: 17px;
    }
    .toolbox-task__progress {
      padding: 13px;
    }
    .toolbox-result {
      padding: 12px;
      border-radius: 15px;
    }
    .toolbox-result__markdown {
      padding: 2px 3px 14px;
      font-size: 13px;
    }
    .toolbox-result__actions {
      align-items: stretch;
      flex-direction: column;
    }
    .toolbox-result__save-copy {
      margin: 0 0 5px;
      flex-basis: auto;
    }
    .toolbox-result__actions > :deep(.b_btn) {
      width: 100%;
    }
    .toolbox-result__billing {
      grid-template-columns: 1fr;
    }
    .toolbox-result__billing p {
      grid-column: auto;
    }
    .toolbox-result__quota-billing {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .toolbox-result__quota-billing > :deep(.b_btn) {
      grid-column: 1 / -1;
      width: 100%;
    }
  }
  html.light-note-mobile-rendering .toolbox-task__tool-icon,
  html.light-note-mobile-rendering .toolbox-task__draft-banner,
  html.light-note-mobile-rendering .toolbox-source-list__index {
    background: var(--card-background);
  }

  .toolbox-task__inner {
    width: min(1120px, 100%);
  }
  .toolbox-task__header {
    padding: 21px 23px;
    border-radius: 20px;
    background: linear-gradient(
      120deg,
      color-mix(in srgb, var(--primary-color) 5%, var(--card-background)),
      var(--card-background) 58%
    );
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-task__status {
    min-width: 142px;
    padding: 9px 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-task__status > span {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .toolbox-task__status strong {
    font-size: 11px;
  }
  .toolbox-task__status small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 8.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-task__status.is-succeeded {
    border-color: var(--chip-success-border, #8dd9bd);
    color: var(--success-color, #07835f);
  }
  .toolbox-task__status.is-partial_succeeded {
    border-color: var(--chip-pending-border, #e0bd72);
    color: var(--warning-color, #ad6b0d);
  }
  .toolbox-task__status.is-failed,
  .toolbox-task__status.is-expired {
    border-color: var(--chip-danger-border, #e69b9b);
    color: var(--danger-color, #d93b3b);
  }
  .is-spinning {
    animation: toolbox-task-spin 1s linear infinite;
  }
  .toolbox-task__progress {
    margin-top: 14px;
    padding: 18px;
    border-radius: 18px;
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-task__progress-head {
    margin-bottom: 15px;
    align-items: flex-start;
  }
  .toolbox-task__progress-head > div {
    display: grid;
    gap: 2px;
  }
  .toolbox-task__progress-head > div > span,
  .toolbox-task__progress-head > span {
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-task__progress-head > div strong {
    font-size: 15px;
  }
  .toolbox-task__progress-head > div small {
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .toolbox-stage-list {
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    list-style: none;
  }
  .toolbox-stage-list li {
    position: relative;
    min-width: 0;
    min-height: 74px;
    padding: 11px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-stage-list li.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .toolbox-stage-list li.is-done {
    color: var(--success-color, #07835f);
    background: var(--card-background);
  }
  .toolbox-stage-list__marker {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    display: grid;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 700;
  }
  .toolbox-stage-list__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .toolbox-stage-list__copy strong {
    color: var(--text-color);
    font-size: 10.5px;
  }
  .toolbox-stage-list__copy small {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.4;
  }
  .toolbox-task__progress-foot {
    margin-top: 12px;
    align-items: center;
  }
  .toolbox-task__progress-foot > span {
    max-width: 720px;
    line-height: 1.5;
  }
  .toolbox-result {
    padding: 20px;
    border-radius: 20px;
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-result__output {
    grid-template-columns: minmax(0, 1fr) 272px;
    align-items: start;
    gap: 14px;
  }
  .toolbox-result__document {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }
  .toolbox-result__document-head {
    padding: 18px 20px 15px;
    display: grid;
    gap: 3px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .toolbox-result__document-head > span {
    color: var(--primary-color);
    font-size: 9.5px;
    font-weight: 720;
    letter-spacing: 0.08em;
  }
  .toolbox-result__document-head h2 {
    margin: 0;
    font-size: 21px;
    letter-spacing: -0.02em;
  }
  .toolbox-result__document-head p {
    margin: 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.5;
  }
  .toolbox-result__markdown {
    padding: 8px 20px 26px;
  }
  .toolbox-result__rail {
    position: sticky;
    top: 12px;
    display: grid;
    gap: 10px;
  }
  .toolbox-result__evidence-note {
    padding: 14px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color));
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
  }
  .toolbox-result__evidence-note > span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-result__evidence-note > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .toolbox-result__evidence-note strong {
    font-size: 11px;
  }
  .toolbox-result__evidence-note p {
    margin: 0;
    color: var(--desc-color);
    font-size: 9.5px;
    line-height: 1.55;
  }
  .toolbox-result__evidence-note > :deep(.b_btn) {
    width: 100%;
    grid-column: 1 / -1;
  }
  .toolbox-result__actions {
    padding: 14px;
    align-items: stretch;
    flex-direction: column;
    background: var(--card-background);
  }
  .toolbox-result__actions > :deep(.b_btn) {
    width: 100%;
  }
  .toolbox-result__save-copy {
    margin: 0 0 5px;
    flex-basis: auto;
  }
  .toolbox-source-summary {
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 11px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
  }
  .toolbox-source-summary > span {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-source-summary > div {
    display: grid;
    gap: 2px;
  }
  .toolbox-source-summary strong {
    font-size: 12px;
  }
  .toolbox-source-summary small {
    color: var(--desc-color);
    font-size: 9.5px;
    line-height: 1.45;
  }
  .toolbox-source-list {
    gap: 9px;
  }
  .toolbox-source-list article {
    padding: 12px;
    align-items: flex-start;
    border-radius: 13px;
    background: var(--card-background);
  }
  .toolbox-source-list__icon {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: grid;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-source-list__icon.is-bookmark {
    color: var(--resource-bookmark-color, #f1883f);
  }
  .toolbox-source-list__icon.is-file {
    color: var(--resource-file-color, #0b9f75);
  }
  .toolbox-source-list__copy {
    gap: 5px;
  }
  .toolbox-source-list__copy > strong {
    font-size: 12px;
  }
  .toolbox-source-list__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
  }
  .toolbox-source-list__meta small {
    position: relative;
    overflow: visible;
    font-size: 9.5px;
    white-space: normal;
  }
  .toolbox-source-list__meta small + small::before {
    position: absolute;
    top: 50%;
    left: -6px;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: var(--desc-color);
    content: '';
  }
  .toolbox-source-list__copy p {
    max-width: 760px;
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .toolbox-source-list__issues {
    margin: 1px 0 0;
    padding-left: 16px;
    color: var(--warning-color, #ad6b0d);
    font-size: 9.5px;
    line-height: 1.5;
  }
  .toolbox-source-list__state {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--success-color, #07835f);
    font-size: 9.5px;
    font-weight: 650;
  }
  .toolbox-source-list__state.is-partial {
    color: var(--warning-color, #ad6b0d);
  }
  .toolbox-source-list__state.is-unavailable {
    color: var(--danger-color, #d93b3b);
  }
  @keyframes toolbox-task-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 767px) {
    .toolbox-task__header {
      align-items: flex-start;
    }
    .toolbox-task__status {
      min-width: 0;
      padding: 7px;
    }
    .toolbox-task__status > span {
      display: none;
    }
    .toolbox-stage-list {
      grid-template-columns: 1fr;
    }
    .toolbox-stage-list li {
      min-height: 0;
    }
    .toolbox-task__progress-head > span {
      display: none;
    }
    .toolbox-task__progress-foot {
      align-items: stretch;
      flex-direction: column;
    }
    .toolbox-task__progress-foot :deep(.b_btn) {
      width: 100%;
    }
    .toolbox-result__document-head {
      padding: 12px 3px;
    }
    .toolbox-result__output {
      grid-template-columns: 1fr;
    }
    .toolbox-result__document {
      border: 0;
      border-radius: 0;
    }
    .toolbox-result__markdown {
      padding: 2px 3px 14px;
    }
    .toolbox-result__rail {
      position: static;
    }
    .toolbox-source-list article {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr);
    }
    .toolbox-source-list__state {
      grid-column: 2;
    }
  }
  html.light-note-mobile-rendering .toolbox-task__header,
  html.light-note-mobile-rendering .toolbox-stage-list li.is-active,
  html.light-note-mobile-rendering .toolbox-source-summary,
  html.light-note-mobile-rendering .toolbox-result__evidence-note {
    background: var(--card-background);
  }
  html.light-note-mobile-rendering .toolbox-stage-list li.is-active {
    border-width: 2px;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .is-spinning {
      animation: none;
    }
  }
</style>
