<template>
  <section
    ref="scrollRoot"
    @scroll.passive="updatePinnedGroup"
    class="organize-suggestion-workspace"
    :class="{ 'has-icon-batch': resourceType === 'tag' && iconReview.selecting.value }"
  >
    <header :inert="batch.busy.value || iconReview.batchBusy.value || undefined" class="workspace-header"
      ><div
        ><h2>{{ t('organizeWorkspace.title') }}</h2
        ><p>{{ t('organizeWorkspace.description') }}</p></div
      ><div class="workspace-tools"
        ><BButton type="primary" @click="resetDraft">{{ t('organize.aiSuggestions.regenerate') }}</BButton></div
      ></header
    >
    <div v-if="error" class="workspace-notice" role="alert"
      ><span>{{ error }}</span
      ><BButton @click="loadLatest">{{ t('common.retry') }}</BButton></div
    >
    <div v-if="loading && !run" class="workspace-empty"
      ><BLoading :loading="true" inline :title="t('organizeWorkspace.loading')"
    /></div>
    <div v-else-if="!run && !error" class="workspace-empty"
      ><h3>{{ t('organizeWorkspace.empty') }}</h3
      ><p>{{ t('organizeWorkspace.emptyHint') }}</p
      ><BButton @click="resetDraft">{{ t('organizeWorkspace.start') }}</BButton></div
    >
    <section v-if="run" class="workspace-results" :aria-busy="loading">
      <BCard class="workspace-overview" padding="0" radius="16px">
        <header class="workspace-run-header">
          <div class="workspace-run-identity">
            <h3>{{ t('organizeWorkspace.runTitle', { count: run.summary.total }) }}</h3>
            <small>{{ date(run.createdAt) }}</small>
            <BChip
              :tone="
                run.status === 'paused' || activeAi
                  ? 'pending'
                  : overviewWarning || aiFailed || countStatuses(['failed', 'conflict'])
                    ? 'danger'
                    : run.status === 'ended'
                      ? 'neutral'
                      : 'success'
              "
              ><span class="workspace-run-status"
                ><SvgIcon
                  :src="statusIcon"
                  size="14"
                  :class="{ 'status-spinning': statusWorking }"
                  aria-hidden="true"
                />{{ runStatusLabel }}</span
              ></BChip
            >
          </div>
          <div class="workspace-tools" :inert="batch.busy.value || iconReview.batchBusy.value || undefined">
            <BButton
              v-if="run.review?.retryFiles && ['completed', 'ended', 'failed', 'cancelled'].includes(run.status)"
              class="workspace-retry-files"
              :disabled="loading || draftBusy"
              @click="retryFiles"
              >{{ t('organizeFile.retry') }}</BButton
            >
            <BButton
              v-if="run.canPause"
              :loading="controlAction === 'pause'"
              :disabled="loading || controlling"
              @click="controlRun('pause')"
              >{{ t(run.runVersion === 3 ? 'organizeProgress.pauseAi' : 'organizeProgress.pauseProcessing') }}</BButton
            >
            <BButton
              v-if="run.canResume"
              :loading="controlAction === 'resume'"
              :disabled="loading || controlling"
              @click="controlRun('resume')"
              >{{ t(run.runVersion === 3 ? 'organizeProgress.resumeAi' : 'organizeLifecycle.resume') }}</BButton
            >
            <BButton
              v-if="run.canEnd || ((run.runVersion || 1) < 2 && queuedCount > 0)"
              :disabled="loading || controlling"
              :loading="controlAction === 'end'"
              @click="cancelRemaining"
              >{{ t('organizeLifecycle.end') }}</BButton
            >
          </div>
        </header>
        <OrganizeRunProgress
          v-if="run.runVersion === 3 ? run.overview : run.progress"
          :run="run"
          :mobile="bookmark.isMobile"
        />
        <div v-else-if="loading" class="workspace-empty" :style="{ minHeight: bookmark.isMobile ? '360px' : '180px' }"
          ><BLoading :loading="true" inline
        /></div>
        <p v-if="run.ruleRetrying" class="workspace-ai-warning" role="status">{{
          t('organizeLifecycle.ruleRetrying')
        }}</p>
        <p v-if="run.skipped" class="workspace-background">{{
          t('organizeLifecycle.skippedCount', { count: run.skipped })
        }}</p>
        <p v-if="run.status === 'paused'" class="workspace-background">{{
          t(
            run.runVersion === 3
              ? run.inFlight
                ? 'organizeProgress.pausing'
                : `organizeProgress.pauseReasons.${run.pauseReason || 'user'}`
              : run.inFlight
                ? 'organizeLifecycle.pausing'
                : `organizeLifecycle.reasons.${run.pauseReason || 'user'}`,
          )
        }}</p>
        <BButton v-if="run.status === 'paused' && run.pauseReason === 'quota'" @click="acquireQuotaVisible = true">{{
          t('entitlementJourney.acquire')
        }}</BButton>
        <EntitlementAcquireModal
          v-if="acquireQuotaVisible"
          v-model:visible="acquireQuotaVisible"
          asset="ai"
          source="organize"
          :return-path="acquireReturnPath"
        />
      </BCard>
      <nav
        :inert="batch.busy.value || iconReview.batchBusy.value || undefined"
        class="workspace-filters"
        :aria-label="t('organizeWorkspace.filter')"
      >
        <BTabs v-model:active-tab="resourceType" :options="resourceTabs" variant="pill" class="workspace-tabs">
          <template #label="{ tab }"
            ><span class="resource-tab-label" :class="tab.key"
              ><SvgIcon :src="resourceIcons[tab.key as ResourceType]" size="16" />{{ tab.label }}</span
            ></template
          >
        </BTabs>
        <BSelect v-model:value="kind" :options="kindOptions" :aria-label="t('organizeWorkspace.checkFilter')" />
      </nav>
      <p class="workspace-count-hint">{{ t('organizeProgress.tabHint') }}</p>
      <p
        v-if="resourceType === 'tag' && iconReview.selecting.value && iconReview.outcome.value"
        class="batch-outcome"
        role="status"
        >{{ t('organizeIcons.batchResult', iconReview.outcome.value) }}</p
      >
      <p v-if="batch.outcome.value" class="batch-outcome" role="status">{{
        t('organizeWorkspace.batch.result', batch.outcome.value)
      }}</p>
      <div class="workspace-list-heading">
        <span>{{ t('organizeWorkspace.resultsLabel') }}</span>
        <small>{{ t('organizeWorkspace.resultsHint') }}</small>
      </div>
      <p v-if="pageError" class="workspace-notice" role="alert"
        >{{ pageError }} <BButton @click="refresh">{{ t('common.retry') }}</BButton></p
      >
      <div ref="listShell" class="workspace-list-shell" :style="{ minHeight: `${listFloor}px` }" :aria-busy="loading">
        <div v-if="switching && !pageError" class="workspace-switch-feedback" role="status">
          <BLoading v-if="loading" :loading="true" inline />
          <span>{{ pageError || t('organizeWorkspace.loading') }}</span>
        </div>
        <div
          :class="{ 'is-switching': switching }"
          :inert="switching || undefined"
          :aria-hidden="switching || undefined"
        >
          <div v-if="!items.length" class="workspace-empty">{{
            t(loading ? 'organizeWorkspace.loading' : 'organizeWorkspace.noMatching')
          }}</div>
          <section
            v-for="group in resultGroups"
            :key="group.key"
            class="result-group"
            :data-group="group.key"
            :class="`group-${group.key}`"
          >
            <div
              class="group-heading"
              :class="{
                'is-pinned': pinnedGroup === group.key,
                'has-batch-action':
                  (group.key === 'priority' && batch.applicable.value.length && !batch.selecting.value) ||
                  group.key === iconBatchGroup,
              }"
            >
              <BButton
                class="group-toggle"
                :aria-expanded="openGroups.has(group.key)"
                :aria-controls="`group-${group.key}`"
                @click="toggleGroup(group.key)"
              >
                <span class="group-symbol"><SvgIcon :src="group.icon" size="22" /></span>
                <span class="group-copy"
                  ><strong
                    >{{
                      t(
                        group.key === 'analysis' && ['completed', 'ended', 'cancelled', 'failed'].includes(run.status)
                          ? 'organizeProgress.outcomes.unfinished'
                          : resourceType === 'tag' && group.key === 'manual'
                            ? 'organizeIcons.manualGroup'
                            : `organizeWorkspace.groups.${group.key}`,
                      )
                    }}
                    <span class="group-count">{{
                      resourceType === 'tag' ? (run.groupTotals?.[group.key] ?? group.items.length) : group.items.length
                    }}</span></strong
                  ><small>{{
                    t(
                      resourceType === 'tag' && group.key === 'manual'
                        ? 'organizeIcons.manualHint'
                        : `organizeWorkspace.groupHints.${group.key}`,
                    )
                  }}</small></span
                >
                <SvgIcon
                  :src="icon.noteTree.chevron"
                  size="18"
                  class="expand-chevron"
                  :class="{ 'is-open': openGroups.has(group.key) }"
                />
              </BButton>
              <BButton
                v-if="group.key === iconBatchGroup"
                class="batch-entry"
                size="small"
                :disabled="iconReview.batchBusy.value || loading"
                @click="iconReview.selecting.value ? iconReview.exitBatch() : iconReview.startBatch()"
                >{{ t(iconReview.selecting.value ? 'common.exitBatch' : 'organizeWorkspace.batch.start') }}</BButton
              >
              <BButton
                v-if="group.key === 'priority' && batch.applicable.value.length && !batch.selecting.value"
                class="batch-entry"
                size="small"
                @click="batch.start"
                >{{ t('organizeWorkspace.batch.start') }}</BButton
              >
            </div>
            <div v-if="group.key === 'priority' && batch.selecting.value" class="resource-batch-toolbar">
              <div class="batch-selection-info">
                <BCheckbox
                  controlled
                  :model-value="
                    batch.selectedCount.value === batch.applicable.value.length && batch.selectedCount.value > 0
                  "
                  :indeterminate="
                    batch.selectedCount.value > 0 && batch.selectedCount.value < batch.applicable.value.length
                  "
                  :disabled="batch.busy.value"
                  @update:model-value="batch.selectAll"
                  >{{ t('organizeWorkspace.batch.all') }}</BCheckbox
                >
                <span>{{ t('organizeWorkspace.batch.scope') }}</span>
              </div>
              <div class="batch-selection-actions">
                <BButton
                  type="primary"
                  :loading="batch.busy.value"
                  :disabled="!batch.selectedCount.value || loading"
                  @click="batch.apply"
                  >{{ t('organizeWorkspace.batch.apply', { count: batch.selectedCount.value }) }}</BButton
                >
                <BButton :disabled="batch.busy.value" @click="batch.reset">{{ t('common.cancel') }}</BButton>
                <span v-if="batch.busy.value" role="status">{{
                  t('organizeWorkspace.batch.progress', { done: batch.progress.value, total: batch.total.value })
                }}</span>
              </div>
            </div>
            <div v-if="openGroups.has(group.key)" :id="`group-${group.key}`" class="group-content">
              <BCard
                v-for="item in group.items"
                :key="item.id"
                as="article"
                padding="0"
                :class="{ 'is-quiet': !primarySuggestions(item).length, 'is-expanded': expanded.has(item.id) }"
                class="workspace-resource"
                ><header
                  :class="{
                    'is-expandable': item.suggestions.length,
                    'has-selection':
                      batch.selecting.value &&
                      item.suggestions.some((s) => batch.applicable.value.some((a) => a.id === s.id)),
                  }"
                  @click="item.suggestions.length && toggleDetails(item.id)"
                  ><BCheckbox
                    v-if="
                      batch.selecting.value &&
                      item.suggestions.some((s) => batch.applicable.value.some((a) => a.id === s.id))
                    "
                    controlled
                    :model-value="resourceSelected(item)"
                    :indeterminate="resourceMixed(item)"
                    :disabled="batch.busy.value"
                    :aria-label="t('organizeWorkspace.batch.select', { title: item.resource.title })"
                    @click.stop
                    @update:model-value="selectResource(item, $event)"
                  />
                  <BButton
                    class="resource-symbol"
                    :class="item.resource.type"
                    :loading="openingFile === item.id"
                    :aria-label="
                      resourceOpenLabel(item) + '：' + (item.resource.title || t('organizeWorkspace.unnamed'))
                    "
                    @click.stop="openOriginal(item)"
                    ><SvgIcon
                      v-if="openingFile !== item.id"
                      :src="item.resource.iconUrl || resourceIcons[item.resource.type]"
                      size="21" /></BButton
                  ><div class="resource-identity"
                    ><h4
                      ><BButton class="resource-title-link" @click.stop="openOriginal(item)">{{
                        item.resource.title || t('organizeWorkspace.unnamed')
                      }}</BButton></h4
                    ><small
                      >{{
                        item.resource.type === 'tag'
                          ? t('organizeIcons.matching')
                          : item.resource.source.folder || t('organizeWorkspace.root')
                      }}<template v-if="item.resource.type === 'file'">
                        ·
                        {{
                          t(
                            `organizeFile.${item.resource.reading?.state || (['waiting_content', 'preparing_content'].includes(item.aiStatus) ? 'waiting' : 'legacy')}`,
                          )
                        }}</template
                      ></small
                    ></div
                  >
                  <div class="resource-conclusion-tools">
                    <BChip
                      v-if="item.resource.type === 'tag' && item.outcome"
                      :tone="
                        item.outcome === 'unfinished' ? 'danger' : item.outcome === 'manual' ? 'pending' : 'neutral'
                      "
                      class="resource-outcome"
                    >
                      {{
                        t(
                          item.outcome === 'manual'
                            ? 'organizeIcons.manualGroup'
                            : `organizeProgress.outcomes.${item.outcome}`,
                        )
                      }}
                    </BChip>
                    <span
                      v-if="primarySuggestions(item).length"
                      class="resource-issue-label"
                      :class="`issue-${group.key}`"
                      >{{ issueLabel(item) }}</span
                    >
                    <span
                      v-if="!primarySuggestions(item).length"
                      class="resource-conclusion"
                      :class="{ 'is-clear': groupFor(item) === 'clear' }"
                      >{{ resourceConclusion(item) }}</span
                    >
                    <BButton
                      v-if="item.suggestions.length"
                      class="resource-detail-toggle"
                      :aria-expanded="expanded.has(item.id)"
                      :aria-controls="`checks-${item.id}`"
                      :aria-label="
                        t(expanded.has(item.id) ? 'organizeWorkspace.hideChecks' : 'organizeWorkspace.showChecks') +
                        '：' +
                        (item.resource.title || t('organizeWorkspace.unnamed'))
                      "
                      @click.stop="toggleDetails(item.id)"
                    >
                      <SvgIcon
                        :src="icon.noteTree.chevron"
                        size="16"
                        class="expand-chevron"
                        :class="{ 'is-open': expanded.has(item.id) }"
                      />
                    </BButton>
                  </div> </header
                ><div v-if="expanded.has(item.id)" :id="`checks-${item.id}`" class="resource-expanded"
                  ><p v-if="Object.values(item.resource.guards || {}).some(Boolean)" class="resource-guards">{{
                    t('organizeWorkspace.usage', {
                      children: item.resource.guards.children || 0,
                      pinned: item.resource.guards.pinned || 0,
                      references: item.resource.guards.references || 0,
                      todos: item.resource.guards.todos || 0,
                      shares: item.resource.guards.shares || 0,
                    })
                  }}</p
                  ><OrganizeTagIconSuggestion
                    v-for="suggestion in primarySuggestions(item).filter((s) => s.kind === 'tag_icon')"
                    :key="suggestion.id"
                    :suggestion="suggestion"
                    :title="item.resource.title"
                    :review="iconReview"
                    :unfinished="item.outcome === 'unfinished'"
                  />
                  <p v-if="fileReadingDetails(item).length" class="file-reading-details">
                    <span v-for="detail in fileReadingDetails(item)" :key="detail">{{ detail }}</span>
                  </p>
                  <OrganizeWorkspaceSuggestion
                    v-for="suggestion in primarySuggestions(item).filter((s) => s.kind !== 'tag_icon')"
                    :key="suggestion.id"
                    :run-id="run.id"
                    :resource-title="item.resource.title"
                    :resource-id="item.resource.id"
                    :suggestion="suggestion"
                    :batch-busy="batch.busy.value"
                    :batch-selecting="batch.selecting.value"
                    :batch-selected="batch.selected.has(suggestion.id)"
                    :batch-error="batch.errors.get(suggestion.id)"
                    @batch-select="
                      (checked) => (checked ? batch.selected.add(suggestion.id) : batch.selected.delete(suggestion.id))
                    "
                    :analyzing="['queued', 'running', 'waiting_content', 'preparing_content'].includes(item.aiStatus)"
                    @changed="changed"
                    @preview-archive="openArchive"
                  />
                  <div v-if="expanded.has(item.id) && secondarySuggestions(item).length" class="resource-check-summary">
                    <div class="resource-check-details">
                      <div v-for="suggestion in secondarySuggestions(item)" :key="suggestion.id">
                        <span>{{ t(`organizeWorkspace.checks.${suggestion.kind}`) }}</span>
                        <p>{{ suggestion.reason }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </BCard>
            </div>
          </section>
          <BButton
            v-if="resourceType === 'tag' && tagPageIndex > 0"
            :disabled="loading || iconReview.batchBusy.value"
            @click="
              tagPageIndex--;
              loadPage();
            "
            >{{ t('organizeIcons.previousPage') }}</BButton
          >
          <BButton v-if="nextCursor" class="workspace-more" :loading="loading" @click="loadPage(true)">{{
            t(resourceType === 'tag' ? 'organizeIcons.nextPage' : 'organize.loadMore')
          }}</BButton>
        </div>
      </div>
    </section>
    <ResourceBatchActionBar
      :open="resourceType === 'tag' && iconReview.selecting.value"
      :mobile="bookmark.isMobile"
      :above-navigation="false"
      :summary="t('organize.selectedCount', { count: iconReview.selectedCount.value })"
      :detail="t('organizeIcons.sharedImpact')"
      :aria-label="t('common.batchActions')"
      :clear-label="t('organizeIcons.clearSelection')"
      :primary-label="t('organizeIcons.applySelected', { count: iconReview.selectedCount.value })"
      :more-label="t('common.more')"
      :primary-icon="icon.organize.check"
      :show-clear="false"
      :show-more="false"
      :primary-disabled="!iconReview.selectedCount.value || loading"
      :primary-loading="iconReview.batchBusy.value"
      @primary="iconReview.applySelected"
    >
      <template #leading>
        <BCheckbox
          controlled
          :model-value="
            iconReview.selectedCount.value > 0 && iconReview.selectedCount.value === iconReview.applicable.value.length
          "
          :indeterminate="
            iconReview.selectedCount.value > 0 && iconReview.selectedCount.value < iconReview.applicable.value.length
          "
          :disabled="iconReview.batchBusy.value || loading || !iconReview.applicable.value.length"
          :aria-label="t('organizeIcons.selectAvailable')"
          @update:model-value="iconReview.selectAll"
        />
      </template>
    </ResourceBatchActionBar>
    <FilePreview
      v-if="previewFile && filePreviewVisible"
      v-model:visible="filePreviewVisible"
      :file-info="previewFile"
      @close="filePreviewVisible = false"
    />
    <BDrawer
      :open="drawer"
      :title="t('organize.aiSuggestions.regenerate')"
      width="660px"
      body-padding="0"
      @close="closeDrawer"
    >
      <template #header-actions><div ref="wizardHeader" /></template>
      <div v-if="retryConfirmation" class="file-retry-confirmation">
        <p>{{ t('organizeFile.retryHint') }}</p>
        <p>{{ t('organizeFile.automatic') }}</p>
        <p v-if="draftError" role="alert">{{ draftError }}</p>
        <p v-if="preview">{{ t('organizeFile.confirmCount', { count: preview.summary.total }) }}</p>
        <BButton v-if="preview" type="primary" :loading="draftBusy" @click="start">{{
          t('organizeWorkspace.start')
        }}</BButton>
        <BLoading v-else-if="draftBusy" :loading="true" inline />
      </div>
      <OrganizeRunWizard
        :header-target="wizardHeader"
        :initial-step="initialStep"
        v-if="drawer && !retryConfirmation"
        v-model="draft"
        v-model:preview="preview"
        :busy="draftBusy"
        :error="draftError"
        @clear-error="draftError = ''"
        @preview="preflight"
        @start="start"
      />
    </BDrawer>
    <BookmarkSnapshotModal
      v-if="archiveVisible"
      v-model:visible="archiveVisible"
      :bookmark-id="archiveResourceId"
      :draft-context="archiveDraftContext"
    />
  </section>
</template>
<script setup lang="ts">
  import OrganizeRunProgress from './OrganizeRunProgress.vue';
  import { organizeOverviewStatus, organizeOutcomeGroup } from '@lightnote/shared/organize-progress';
  import EntitlementAcquireModal from '@/components/support/EntitlementAcquireModal.vue';
  const acquireQuotaVisible = ref(false);
  import OrganizeTagIconSuggestion from './OrganizeTagIconSuggestion.vue';
  import ResourceBatchActionBar from '@/components/resourceActions/ResourceBatchActionBar.vue';
  import useBookmarkStore from '@/store/bookmark';
  import { useOrganizeIconReview } from '@/composables/useOrganizeIconReview';
  import { supportsOrganizeCheck } from '@lightnote/shared/organize-capabilities';
  import { useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { consumeOrganizeHandoff } from '@/utils/organizeHandoff';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import {
    defineAsyncComponent,
    computed,
    onActivated,
    onBeforeUnmount,
    nextTick,
    onDeactivated,
    onMounted,
    ref,
    watch,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request';
  const FilePreview = defineAsyncComponent(() =>
    import('@/components/FilePreview.vue').then((module) => module.default),
  );
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { resolveBookmarkUrlInput } from '@lightnote/shared';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useOrganizeBatchApply } from '@/composables/useOrganizeBatchApply';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { fileReadingReasonKey } from '@/utils/organizeFileReading';
  import OrganizeRunWizard from './OrganizeRunWizard.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import OrganizeWorkspaceSuggestion from './OrganizeWorkspaceSuggestion.vue';
  import { generateUUID } from '@/utils/common';
  import {
    previewRun,
    previewFileRetry,
    startRun,
    getRun,
    listRuns,
    cancelRun,
    pauseRun,
    resumeRun,
    type ResourceType,
    type CheckKind,
    type RunOptions,
    type SuggestionRun,
    type WorkspaceItem,
  } from '@/api/organizeSuggestionApi';
  const { t, locale } = useI18n(),
    emit = defineEmits<{ 'refresh-summary': []; 'run-status': [status: string] }>();
  const archiveVisible = ref(false);
  const archiveResourceId = ref('');
  const archiveDraftContext = ref<{ runId: string; suggestionId: string }>();
  function openArchive(resourceId: string, suggestionId?: string) {
    archiveDraftContext.value = suggestionId && run.value ? { runId: run.value.id, suggestionId } : undefined;
    archiveResourceId.value = resourceId;
    archiveVisible.value = true;
  }
  const wizardHeader = ref<HTMLElement | null>(null);
  const checks: CheckKind[] = ['tags', 'title', 'empty', 'duplicate', 'archive', 'tag_icon'];
  const resourceIcons = {
    tag: icon.resource.tag,
    bookmark: icon.resource.bookmark,
    note: icon.resource.note,
    file: icon.organize.file,
  };
  const defaults = (): RunOptions => ({
    resourceTypes: [],
    checks: [],
    scope: 'recent',
    items: [],
  });
  const run = ref<SuggestionRun | null>(null),
    items = ref<WorkspaceItem[]>([]),
    nextCursor = ref<string | null>(null);
  const bookmark = useBookmarkStore();
  const iconReview = useOrganizeIconReview(run, items, changed);
  const tagPageStarts = ref(['']);
  const tagPageIndex = ref(0);
  const loading = ref(false),
    error = ref(''),
    pageError = ref(''),
    resourceType = ref<ResourceType>('bookmark'),
    kind = ref('all');
  const scrollRoot = ref<HTMLElement | null>(null),
    listShell = ref<HTMLElement | null>(null),
    listFloor = ref(240);
  const switching = ref(false),
    displayedKind = ref('all');
  const controlling = ref(false);
  const controlAction = ref<'pause' | 'resume' | 'end' | null>(null);
  const initialStep = ref(0);
  const starting = ref(false);
  const user = useUserStore();
  let draftSequence = 0;
  const drawer = ref(false),
    draft = ref(defaults()),
    preview = ref<SuggestionRun | null>(null),
    draftBusy = ref(false),
    draftError = ref('');
  let committingView = false;
  let viewLifetime = 0;
  let sequence = 0,
    disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    previewRequest = '',
    previewKey = '';
  const expanded = ref(new Set<string>());
  const openGroups = ref(new Set(['priority', 'manual']));
  let viewState: {
    id?: string;
    type?: string;
    kind?: string;
    views?: Record<string, { expanded: string[]; groups: string[] }>;
  } = {};
  const detailChoices = new Map<string, boolean>();
  const detailKey = (id: string) => `${run.value?.id}:${resourceType.value}:${kind.value}:${id}`;
  function storedView() {
    return viewState;
  }
  function saveView() {
    if (!run.value) return;
    const views = viewState.id === run.value.id ? viewState.views || {} : {};
    views[`${resourceType.value}:${kind.value}`] = {
      expanded: [...expanded.value],
      groups: [...openGroups.value],
    };
    viewState = { id: run.value.id, type: resourceType.value, kind: kind.value, views };
  }
  const pinnedGroup = ref('');
  function updatePinnedGroup() {
    const root = scrollRoot.value;
    if (!root) return;
    const top = root.getBoundingClientRect().top;
    pinnedGroup.value =
      Array.from(root.querySelectorAll<HTMLElement>('.result-group')).find((group) => {
        const rect = group.getBoundingClientRect();
        return rect.top < top && rect.bottom > top + 48;
      })?.dataset.group || '';
  }
  function toggleGroup(key: string) {
    const root = scrollRoot.value;
    const group = root?.querySelector<HTMLElement>(`.group-${key}`);
    if (
      openGroups.value.has(key) &&
      root &&
      group &&
      group.getBoundingClientRect().top < root.getBoundingClientRect().top
    ) {
      root.scrollTop += group.getBoundingClientRect().top - root.getBoundingClientRect().top;
    }
    const next = new Set(openGroups.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    openGroups.value = next;
    saveView();
    nextTick(updatePinnedGroup);
  }
  const archiveWithoutResult = (s: WorkspaceItem['suggestions'][number]) =>
    s.kind === 'archive' && ['pending', 'info'].includes(s.status) && !s.archivePreview;
  function fileReadingDetails(item: WorkspaceItem) {
    const reading = item.resource.reading;
    if (!reading) return [];
    const details: string[] = [];
    if (reading.totalPages)
      details.push(t('organizeFile.pages', { read: reading.readPages || 0, total: reading.totalPages }));
    if (reading.missingPages?.length)
      details.push(t('organizeFile.missing', { pages: reading.missingPages.join(', ') }));
    if (reading.reasonCode) {
      const reason = t(fileReadingReasonKey(reading.reasonCode));
      const shownInSuggestion = primarySuggestions(item).some(
        (s) =>
          (s.reading && !s.reading.complete && t(fileReadingReasonKey(s.reading.reasonCode)) === reason) ||
          s.reason === reason,
      );
      if (!shownInSuggestion) details.push(reason);
    }
    for (const range of (reading.failedRanges || []).filter((r) => r.unit !== 'pages'))
      details.push(
        t('organizeFile.range', {
          type: t(`organizeFile.rangeTypes.${range.unit}`),
          start: range.start,
          end: range.end,
        }),
      );
    return [...new Set(details)];
  }
  function groupFor(item: WorkspaceItem) {
    if (item.outcome) return organizeOutcomeGroup(item.outcome);
    if (item.ruleStatus === 'removed') return 'reviewed';
    const suggestions = visibleSuggestions(item);
    const hasPriority = suggestions.some(
      (s) =>
        !archiveWithoutResult(s) &&
        (s.status === 'pending' ||
          (s.status === 'info' && ['trash', 'duplicate_bookmarks'].includes(String(s.action)))),
    );
    if (suggestions.some((s) => s.status === 'expired') && !hasPriority) return 'expired';
    if (hasPriority) return 'priority';
    if (
      suggestions.some(archiveWithoutResult) ||
      suggestions.some((s) => ['queued', 'running', 'failed', 'conflict', 'cancelled'].includes(s.status)) ||
      ['queued', 'running', 'waiting_content', 'preparing_content', 'failed', 'conflict', 'cancelled'].includes(
        item.aiStatus,
      ) ||
      (item.ruleStatus !== undefined && item.ruleStatus !== 'completed')
    )
      return 'analysis';
    if (
      suggestions.some(
        (s) => ['insufficient', 'no_suggestion'].includes(s.status) && ['tags', 'title', 'tag_icon'].includes(s.kind),
      ) ||
      suggestions.some((s) => s.status === 'info') ||
      item.resource.unsupported
    )
      return 'manual';
    if (suggestions.some((s) => ['applied', 'ignored', 'closed', 'expired'].includes(s.status))) return 'reviewed';
    return 'clear';
  }
  const resultGroups = computed(() =>
    [
      { key: 'priority', icon: icon.common.batchSelect },
      { key: 'manual', icon: icon.organize.manual },
      { key: 'analysis', icon: icon.organize.clock },
      { key: 'clear', icon: icon.organize.check },
      { key: 'expired', icon: icon.organize.clock },
      { key: 'reviewed', icon: icon.organize.check },
    ]
      .map((group) => ({ ...group, items: items.value.filter((item) => groupFor(item) === group.key) }))
      .filter((group) => group.items.length),
  );
  const iconBatchGroup = computed(() => {
    if (resourceType.value !== 'tag' || user.adminContext || user.role === 'visitor') return null;
    if (!iconReview.selecting.value && !iconReview.applicable.value.length) return null;
    const groups = resultGroups.value;
    return groups.find((group) => group.key === 'priority')?.key || groups[0]?.key || null;
  });
  function issueLabel(item: WorkspaceItem) {
    return [...new Set(primarySuggestions(item).map((s) => t(`organizeWorkspace.checks.${s.kind}`)))].join(' · ');
  }
  const resourceTabs = computed(() =>
    (run.value?.options.resourceTypes || []).map((type) => ({
      key: type,
      label: t(`organizeWorkspace.resources.${type}`),
      badge: run.value?.summary.types[type] || 0,
    })),
  );
  const router = useRouter();
  const acquireReturnPath = computed(() => router.currentRoute.value.fullPath);
  const resourceOpenLabel = (item: WorkspaceItem) => t(`organizeWorkspace.openOriginal.${item.resource.type}`);
  const filePreviewVisible = ref(false);
  const previewFile = ref<{
    id: string;
    fileName: string;
    fileType: string;
    fileUrl?: string;
    category?: string;
  } | null>(null);
  const openingFile = ref('');
  async function openOriginal(item: WorkspaceItem) {
    if (item.resource.type === 'tag') {
      void router.push(`/tag/${encodeURIComponent(item.resource.id)}`);
      return;
    }
    if (item.resource.type === 'file') {
      if (openingFile.value) return;
      openingFile.value = item.id;
      const previewIdentity = buildNoteDetailRequestScope(user);
      const lifetime = viewLifetime;
      const stillCurrent = () =>
        !disposed && active && lifetime === viewLifetime && previewIdentity === buildNoteDetailRequestScope(user);
      try {
        const response = await apiBasePost(
          '/api/file/getFileInfo',
          { id: item.resource.id },
          { silent: true, feedback: false },
        );
        if (!stillCurrent()) return;
        if (response.status !== 200 || !response.data) {
          message.warning(t('cloudSpace.fileUnavailable'));
          return;
        }
        const file = response.data;
        previewFile.value = {
          ...file,
          id: String(file.id),
          fileName: file.fileName || file.file_name || '',
          fileType: file.fileType || file.file_type || '',
          fileUrl: file.fileUrl || file.file_url || '',
        };
        filePreviewVisible.value = true;
      } catch {
        if (stillCurrent()) message.warning(t('cloudSpace.fileUnavailable'));
      } finally {
        openingFile.value = '';
      }
      return;
    }
    let href = '';
    if (item.resource.type === 'bookmark') {
      href = resolveBookmarkUrlInput(item.resource.url || item.resource.source.url || '', {
        allowTextExtraction: false,
      }).canonicalUrl;
      if (!href) {
        message.warning(t('bookmarkUrl.invalid'));
        return;
      }
    } else {
      const target = resolveResourceRoute(item.resource, { noteReturnPath: '/organize?issue=ai_suggestions' });
      if (!target) return;
      href = router.resolve(target).href;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  function toggleDetails(id: string) {
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
    detailChoices.set(detailKey(id), next.has(id));
    saveView();
  }
  const countStatuses = (statuses: string[]) =>
    (run.value?.counts || [])
      .filter((row) => statuses.includes(row.status))
      .reduce((n, row) => n + Number(row.total), 0);
  const kindOptions = computed(() => [
    { value: 'all', label: t('organizeWorkspace.allChecks') },
    ...checks
      .filter((k) => supportsOrganizeCheck(resourceType.value, k))
      .map((k) => ({ value: k, label: t(`organizeWorkspace.checks.${k}`) })),
  ]);
  const activeAi = computed(
    () =>
      (run.value?.overview &&
        (run.value.status === 'running' ||
          (run.value.status === 'paused' &&
            (organizeOverviewStatus(run.value.overview, run.value.status) === 'aiPausedWorking' ||
              run.value.overview.ai.running > 0)))) ||
      run.value?.status === 'preparing' ||
      (run.value?.status === 'paused' && run.value?.rulePhase !== 'completed') ||
      (run.value?.progress || []).some(
        (p) =>
          (p.aiStatus === 'running' ||
            (['queued', 'waiting_content', 'preparing_content'].includes(p.aiStatus) &&
              run.value?.status === 'running')) &&
          Number(p.total) > 0,
      ),
  );
  const statusWorking = computed(
    () => activeAi.value && !['completed', 'ended', 'failed'].includes(run.value?.status || ''),
  );
  const overviewWarning = computed(() => {
    const o = run.value?.overview;
    return (
      ((o?.review || run.value?.review)?.outcomes?.unfinished || 0) > 0 ||
      (o ? o.direct.failed + o.direct.partial + o.ai.failed + o.ai.partial > 0 : false)
    );
  });
  const statusIcon = computed(() =>
    statusWorking.value
      ? icon.message.loading
      : run.value?.status === 'paused' || run.value?.status === 'ended'
        ? icon.organize.clock
        : run.value?.status === 'failed' ||
            overviewWarning.value ||
            aiFailed.value ||
            countStatuses(['failed', 'conflict'])
          ? icon.message.warning
          : icon.organize.check,
  );
  const queuedCount = computed(() =>
    (run.value?.progress || [])
      .filter((p) => ['queued', 'waiting_content', 'preparing_content'].includes(p.aiStatus))
      .reduce((n, p) => n + Number(p.total), 0),
  );
  const aiFailed = computed(() =>
    (run.value?.progress || [])
      .filter((p) => ['failed', 'conflict'].includes(p.aiStatus))
      .reduce((n, p) => n + Number(p.total), 0),
  );
  const runStatusLabel = computed(() => {
    const unfinished = (run.value?.overview?.review || run.value?.review)?.outcomes?.unfinished;
    if (run.value?.status === 'completed' && unfinished)
      return t('organizeProgress.endedUnfinished', { count: unfinished });
    if (run.value?.overview)
      return t(`organizeProgress.states.${organizeOverviewStatus(run.value.overview, run.value.status)}`);
    if (run.value?.status === 'preparing') return t('organizeProgress.states.running');
    if (['paused', 'ended'].includes(run.value?.status || '')) return t(`organizeProgress.states.${run.value?.status}`);
    if (activeAi.value) return t('organizeProgress.states.running');
    if (run.value?.status === 'completed' && run.value.summary.aiTotal === 0 && countStatuses(['failed', 'conflict']))
      return t('organizeProgress.states.partialFailure');
    if (run.value?.status === 'completed')
      return t(
        aiFailed.value || countStatuses(['failed', 'conflict'])
          ? 'organizeProgress.states.partialFailure'
          : 'organizeProgress.states.completed',
      );
    return t(`organizeWorkspace.status.${run.value?.status}`);
  });
  const visibleSuggestions = (item: WorkspaceItem) =>
    item.suggestions.filter((s) => displayedKind.value === 'all' || s.kind === displayedKind.value);
  const isSecondary = (s: WorkspaceItem['suggestions'][number]) =>
    s.kind !== 'tag_icon' &&
    ((['not_applicable', 'applied', 'ignored', 'closed'].includes(s.status) &&
      !(s.kind === 'archive' && s.status === 'applied')) ||
      (s.status === 'no_suggestion' && !['tags', 'title', 'tag_icon', 'archive'].includes(s.kind)));
  const primarySuggestions = (item: WorkspaceItem) => visibleSuggestions(item).filter((s) => !isSecondary(s));
  const secondarySuggestions = (item: WorkspaceItem) => visibleSuggestions(item).filter(isSecondary);
  function resourceConclusion(item: WorkspaceItem) {
    if (item.ruleStatus === 'removed') return t('organizeWorkspace.reviewed');
    if (item.ruleStatus === 'skipped') return t('organizeLifecycle.resourceSkipped');
    if (
      ['ended', 'cancelled'].includes(run.value?.status || '') &&
      ['pending', 'checked'].includes(item.ruleStatus || '')
    )
      return t('organizeLifecycle.resourceEnded');
    if (item.ruleStatus === 'cancelled') return t('organizeLifecycle.resourceEnded');
    if (item.ruleStatus && item.ruleStatus !== 'completed')
      return t(
        item.ruleStatus === 'checked' ? 'organizeProgress.queuedResource' : 'organizeLifecycle.resourceChecking',
      );
    if (item.resource.unsupported) return t('organizeWorkspace.checkLimited');
    if (visibleSuggestions(item).some((s) => ['applied', 'ignored', 'closed', 'expired'].includes(s.status)))
      return t('organizeWorkspace.reviewed');
    return t(displayedKind.value === 'all' ? 'organizeWorkspace.checkClear' : 'organizeWorkspace.filteredClear');
  }
  function date(value?: string) {
    return value
      ? new Date(value).toLocaleString(locale.value, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  }
  function readResponse(response: { status: number; msg?: string; data?: any }) {
    if (response.status !== 200) throw new Error(response.msg || t('organize.actionFailed'));
    return response.data;
  }
  const failure = (e: unknown) =>
    e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
      ? e.message
      : t('organize.actionFailed');
  const keyOf = (i: { type: string; id: string | number }) => `${i.type}:${i.id}`;
  const retryConfirmation = ref(false);
  async function retryFiles() {
    if (!run.value || draftBusy.value) return;
    const runId = run.value.id;
    resetDraft();
    retryConfirmation.value = true;
    draftBusy.value = true;
    const ticket = ++draftSequence;
    const identity = buildNoteDetailRequestScope(user);
    try {
      const result = readResponse(await previewFileRetry(runId, generateUUID()));
      if (!disposed && drawer.value && ticket === draftSequence && identity === buildNoteDetailRequestScope(user))
        preview.value = result;
    } catch (error) {
      if (ticket === draftSequence) draftError.value = failure(error);
    } finally {
      if (ticket === draftSequence) draftBusy.value = false;
    }
  }
  function resetDraft() {
    retryConfirmation.value = false;
    draftSequence++;
    initialStep.value = 0;
    draftBusy.value = false;
    draft.value = defaults();
    preview.value = null;
    previewRequest = '';
    previewKey = '';
    draftError.value = '';
    drawer.value = true;
  }
  watch(
    drawer,
    (open) => {
      if (!open) {
        draftSequence++;
        draftBusy.value = false;
        preview.value = null;
      }
    },
    { flush: 'sync' },
  );
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      starting.value = false;
      drawer.value = false;
      draft.value = defaults();
    },
    { flush: 'sync' },
  );
  function closeDrawer() {
    if (starting.value) return;
    drawer.value = false;
  }
  async function preflight(options: RunOptions) {
    if (draftBusy.value || !options.resourceTypes.length || !options.checks.length) return;
    const ticket = ++draftSequence;
    const identity = buildNoteDetailRequestScope(user);
    draftBusy.value = true;
    draftError.value = '';
    const key = JSON.stringify(options);
    const current = () =>
      !disposed && drawer.value && ticket === draftSequence && identity === buildNoteDetailRequestScope(user);
    if (previewKey !== key) {
      previewKey = key;
      previewRequest = generateUUID();
    }
    try {
      const result = readResponse(await previewRun(options, previewRequest));
      if (current()) preview.value = result;
    } catch (e) {
      if (current()) draftError.value = failure(e);
    } finally {
      if (current()) draftBusy.value = false;
    }
  }
  function start() {
    if (!preview.value || draftBusy.value) return;
    const previewId = preview.value.id;
    const startCurrent = (replaceRunId?: string) => {
      if (drawer.value && preview.value?.id === previewId) void startConfirmed(replaceRunId);
    };
    if (run.value?.canEnd) {
      const oldId = run.value.id;
      Alert.alert({
        title: t('organizeLifecycle.replaceTitle'),
        content: t('organizeLifecycle.replaceHint'),
        okText: t('organizeLifecycle.replaceStart'),
        cancelText: t('common.cancel'),
        onOk: () => startCurrent(oldId),
      });
    } else startCurrent();
  }
  async function startConfirmed(replaceRunId?: string) {
    if (!preview.value || draftBusy.value) return;
    const ticket = ++draftSequence;
    const identity = buildNoteDetailRequestScope(user);
    const current = () => !disposed && ticket === draftSequence && identity === buildNoteDetailRequestScope(user);
    starting.value = true;
    draftBusy.value = true;
    draftError.value = '';
    try {
      const created = readResponse(await startRun(preview.value.id, replaceRunId)) as SuggestionRun;
      if (!current()) return;
      starting.value = false;
      drawer.value = false;
      committingView = true;
      run.value = created;
      resourceType.value = created.options.resourceTypes[0];
      kind.value = 'all';
      committingView = false;
      items.value = [];
      await loadPage();
      emit('refresh-summary');
    } catch (e) {
      if (current()) draftError.value = failure(e);
    } finally {
      if (current()) {
        starting.value = false;
        draftBusy.value = false;
      }
    }
  }
  async function loadLatest() {
    const request = ++sequence;
    loading.value = true;
    error.value = '';
    try {
      const result = readResponse(await listRuns()) as SuggestionRun[];
      if (disposed || request !== sequence) return;
      const latest = result[0];
      if (!latest) {
        run.value = null;
        items.value = [];
        nextCursor.value = null;
        return;
      }
      const saved = storedView();
      const type =
        saved.id === latest.id && latest.options.resourceTypes.includes(saved.type as ResourceType)
          ? (saved.type as ResourceType)
          : latest.options.resourceTypes[0];
      const filter =
        saved.id === latest.id && ['all', ...checks].includes(saved.kind || '') ? saved.kind || 'all' : 'all';
      // 简略任务仅用于定位；完整摘要、筛选和结果在同一请求世代内一起提交。
      await loadPage(false, false, { id: latest.id, type, kind: filter, request });
    } catch (e) {
      if (!disposed && request === sequence) error.value = failure(e);
    } finally {
      if (!disposed && request === sequence) loading.value = false;
    }
  }
  async function loadPage(
    append = false,
    background = false,
    target?: { id: string; type: ResourceType; kind: string; request: number },
  ) {
    if (!run.value && !target) return;
    if (resourceType.value === 'tag' && append && nextCursor.value) {
      tagPageStarts.value[++tagPageIndex.value] = nextCursor.value;
    }
    const request = target?.request ?? ++sequence,
      id = target?.id ?? run.value!.id,
      requestedKind = target?.kind ?? kind.value,
      requestedType = target?.type ?? resourceType.value;
    if (!background) loading.value = true;
    pageError.value = '';
    try {
      const result = readResponse(
        await getRun(id, {
          resourceType: requestedType,
          kind: requestedKind === 'all' ? '' : requestedKind,
          after:
            requestedType === 'tag'
              ? target &&
                (target.id !== run.value?.id || requestedType !== resourceType.value || requestedKind !== kind.value)
                ? ''
                : tagPageStarts.value[tagPageIndex.value] || ''
              : append
                ? nextCursor.value || ''
                : '',
        }),
      ) as SuggestionRun;
      const collected = [...(result.items || [])];
      let cursor = result.nextCursor;
      const seenCursors = new Set<string>();
      while (cursor && requestedType !== 'tag') {
        if (disposed || request !== sequence) return;
        if (seenCursors.has(cursor)) throw new Error(t('organize.actionFailed'));
        seenCursors.add(cursor);
        const page = readResponse(
          await getRun(id, {
            resourceType: requestedType,
            kind: requestedKind === 'all' ? '' : requestedKind,
            after: cursor,
          }),
        ) as SuggestionRun;
        collected.push(...(page.items || []));
        cursor = page.nextCursor;
      }
      result.items = [...new Map(collected.map((item) => [item.id, item])).values()];
      result.nextCursor = requestedType === 'tag' ? cursor : null;
      if (disposed || request !== sequence) return;
      committingView = true;
      run.value = result;
      resourceType.value = requestedType;
      kind.value = requestedKind;
      committingView = false;
      displayedKind.value = requestedKind;
      const saved = storedView();
      const view = saved.id === id ? saved.views?.[`${requestedType}:${requestedKind}`] : null;
      if (switching.value || !items.value.length) {
        expanded.value = new Set(view?.expanded || []);
        openGroups.value = new Set(view?.groups || ['priority', 'manual']);
      }
      for (const item of result.items || []) {
        const choice = detailChoices.get(detailKey(item.id));
        if (choice ?? ['priority', 'manual'].includes(groupFor(item))) expanded.value.add(item.id);
        else if (choice === false) expanded.value.delete(item.id);
      }
      switching.value = false;
      items.value =
        append && requestedType !== 'tag'
          ? [...items.value, ...(result.items || []).filter((i) => !items.value.some((v) => v.id === i.id))]
          : result.items || [];
      nextCursor.value = result.nextCursor || null;
      saveView();
    } catch (e) {
      if (!disposed && request === sequence) {
        if (!run.value) error.value = failure(e);
        else pageError.value = failure(e);
      }
    } finally {
      if (!disposed && request === sequence) {
        if (!background) loading.value = false;
        schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && active && activeAi.value && !document.hidden)
      timer = setTimeout(() => {
        void refresh(true);
      }, 2400);
  }
  // 已展开多页时刷新每页，避免轮询把后续资料移出界面。
  async function refresh(background = false) {
    if (!active || !run.value) return;
    if (batch.busy.value || iconReview.batchBusy.value || (background && (loading.value || controlling.value))) {
      schedule();
      return;
    }
    const count = items.value.length;
    await loadPage(false, background);
    while (!disposed && !pageError.value && nextCursor.value && items.value.length < count)
      await loadPage(true, background);
  }
  function cancelRemaining() {
    Alert.alert({
      title: t('organizeLifecycle.end'),
      content: t('organizeLifecycle.endHint'),
      okText: t('organizeLifecycle.end'),
      cancelText: t('common.cancel'),
      onOk: () => controlRun('end'),
    });
  }
  async function controlRun(action: 'pause' | 'resume' | 'end') {
    if (!run.value || controlling.value) return;
    const lifetime = viewLifetime;
    const id = run.value.id;
    const current = () => !disposed && lifetime === viewLifetime && run.value?.id === id;
    controlling.value = true;
    controlAction.value = action;
    try {
      readResponse(await { pause: pauseRun, resume: resumeRun, end: cancelRun }[action](id));
      if (current()) await refresh();
    } catch (e) {
      if (current()) pageError.value = failure(e);
    } finally {
      if (current()) {
        controlling.value = false;
        controlAction.value = null;
      }
    }
  }
  const batchRows = computed(() => items.value.map((item) => ({ ...item, suggestions: visibleSuggestions(item) })));
  const batch = useOrganizeBatchApply(
    computed(() => [run.value?.id, resourceType.value, kind.value, buildNoteDetailRequestScope(user)].join(':')),
    computed(() => run.value?.id || ''),
    batchRows,
    computed(() => !user.adminContext && user.role !== 'visitor' && resourceType.value !== 'tag'),
    changed,
  );
  function selectResource(item: WorkspaceItem, checked: boolean) {
    for (const s of item.suggestions.filter((s) => batch.applicable.value.some((a) => a.id === s.id)))
      if (checked) batch.selected.add(s.id);
      else batch.selected.delete(s.id);
  }
  function resourceSelected(item: WorkspaceItem) {
    const entries = item.suggestions.filter((s) => batch.applicable.value.some((a) => a.id === s.id));
    return entries.length > 0 && entries.every((s) => batch.selected.has(s.id));
  }
  function resourceMixed(item: WorkspaceItem) {
    return !resourceSelected(item) && item.suggestions.some((s) => batch.selected.has(s.id));
  }
  function changed() {
    void refresh();
    bookmark.refreshTag();
    emit('refresh-summary');
  }
  function visibility() {
    if (document.hidden) clearTimeout(timer);
    else if (active && run.value) void refresh(true);
  }
  watch(
    () => run.value?.id,
    () => {
      tagPageStarts.value = [''];
      tagPageIndex.value = 0;
    },
    { flush: 'sync' },
  );
  watch(
    [resourceType, kind],
    () => {
      if (committingView) return;
      tagPageStarts.value = [''];
      tagPageIndex.value = 0;
      // 保留旧列表几何；空结果也至少填满当前可见区域，避免浏览器压缩 scrollTop。
      if (scrollRoot.value && listShell.value) {
        const offset = listShell.value.getBoundingClientRect().top - scrollRoot.value.getBoundingClientRect().top;
        listFloor.value = Math.max(240, scrollRoot.value.clientHeight - offset);
      }
      switching.value = true;
      void loadPage();
    },
    { flush: 'sync' },
  );
  watch(
    () => run.value?.status,
    (status) => emit('run-status', status || ''),
  );
  let active = false;
  let lastHandoffToken: string | undefined;
  function receiveHandoff() {
    if (!active) return;
    const token = router.currentRoute.value.query.organizeSelection;
    if (typeof token !== 'string' || token === lastHandoffToken) return;
    lastHandoffToken = token;
    const options = consumeOrganizeHandoff(token, buildNoteDetailRequestScope(user));
    const route = router.currentRoute.value;
    const query = { ...route.query };
    delete query.organizeSelection;
    void router.replace({ path: route.path, query, hash: route.hash }).catch(() => {});
    if (!options) {
      message.warning(t('organizeWizard.handoffExpired'));
    } else {
      resetDraft();
      initialStep.value = 3;
      draft.value = options;
      void preflight(options);
    }
  }
  watch(() => router.currentRoute.value.query.organizeSelection, receiveHandoff);
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      sequence++;
      viewLifetime++;
      controlling.value = false;
      controlAction.value = null;
      filePreviewVisible.value = false;
      previewFile.value = null;
      archiveVisible.value = false;
      acquireQuotaVisible.value = false;
      draftSequence++;
      iconReview.reset();
      run.value = null;
      items.value = [];
      nextCursor.value = null;
      viewState = {};
      detailChoices.clear();
      expanded.value = new Set();
      openGroups.value = new Set(['priority', 'manual']);
      switching.value = false;
      loading.value = false;
      error.value = '';
      pageError.value = '';
      drawer.value = false;
      clearTimeout(timer);
      if (active) void loadLatest();
    },
    { flush: 'sync' },
  );
  onMounted(() => {
    active = true;
    void loadLatest();
    document.addEventListener('visibilitychange', visibility);
    receiveHandoff();
  });
  onActivated(() => {
    const returning = !active;
    active = true;
    if (returning) void loadLatest();
    receiveHandoff();
  });
  onDeactivated(() => {
    iconReview.reset();
    active = false;
    viewLifetime++;
    controlling.value = false;
    controlAction.value = null;
    filePreviewVisible.value = false;
    previewFile.value = null;
    archiveVisible.value = false;
    acquireQuotaVisible.value = false;
    sequence++;
    const saved = storedView();
    if (saved.id === run.value?.id && saved.type) {
      committingView = true;
      resourceType.value = saved.type as ResourceType;
      kind.value = displayedKind.value;
      committingView = false;
    }
    loading.value = false;
    switching.value = false;
    draftSequence++;
    drawer.value = false;
    draftBusy.value = false;
    starting.value = false;
    clearTimeout(timer);
  });
  onBeforeUnmount(() => {
    disposed = true;
    sequence++;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibility);
  });
</script>
<style scoped lang="less">
  .organize-suggestion-workspace {
    --ow-border: #e7e8f5;
    --ow-surface: #fff;
    --ow-inset: #f7f8fd;
    --ow-muted: #787e95;
    --ow-purple: #6254f4;
    --ow-purple-soft: #efedff;
    --ow-red: #f54870;
    --ow-red-soft: #fff0f4;
    --ow-amber: #f39b12;
    --ow-amber-soft: #fff3df;
    --ow-green: #08b776;
    --ow-green-soft: #e5faed;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden auto;
    scrollbar-gutter: stable;
    overflow-anchor: none;
    box-sizing: border-box;
    --group-sticky-top: -24px;
    padding: 24px 28px;
    color: var(--text-color);
  }
  :global(html[data-theme='night'] .organize-suggestion-workspace) {
    --ow-border: #343d4b;
    --ow-surface: #222830;
    --ow-inset: #272e39;
    --ow-muted: #a1aabd;
    --ow-purple: #a49bff;
    --ow-purple-soft: #363252;
    --ow-red: #ff6c8b;
    --ow-red-soft: #482d3c;
    --ow-amber: #ffbb4d;
    --ow-amber-soft: #463923;
    --ow-green: #45dca0;
    --ow-green-soft: #233f37;
  }
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }
  h2 {
    font-size: 23px;
    letter-spacing: -0.5px;
  }
  h3 {
    font-size: 15px;
  }
  h4 {
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .workspace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }
  .workspace-header p {
    margin-top: 7px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ow-muted);
  }
  .workspace-tools {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .workspace-tools .b_btn {
    font-size: 12px;
  }
  .workspace-tools .workspace-retry-files {
    background: transparent;
    color: var(--ow-purple);
    padding-inline: 8px;
    box-shadow: none;
  }
  .workspace-tools .workspace-retry-files:disabled {
    color: var(--ow-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .workspace-tools .workspace-retry-files:not(:disabled):hover {
      background: var(--ow-purple-soft);
    }
  }
  .workspace-results {
    min-width: 0;
  }
  .workspace-overview {
    --b-card-shadow: none;
    --b-card-background: var(--ow-surface);
    border: 1px solid var(--ow-border);
    border-radius: 12px !important;
    background: var(--ow-surface);
    margin-bottom: 18px;
  }
  .workspace-run-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 18px 6px;
  }
  .workspace-run-identity {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .workspace-run-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .status-spinning {
    animation: organize-status-spin 1s linear infinite;
  }
  @keyframes organize-status-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .status-spinning {
      animation: none;
    }
    .workspace-overview :deep(.b-progress__bar) {
      transition: none;
    }
  }
  :global(.disable-animations .status-spinning) {
    animation: none !important;
  }
  .workspace-run-identity small {
    font-size: 11px;
    color: var(--ow-muted);
  }
  .workspace-count-hint {
    margin: -8px 0 12px;
    color: var(--workspace-muted);
    font-size: 12px;
  }
  .workspace-background {
    padding: 0 20px 12px;
    font-size: 12px;
    color: var(--ow-muted);
  }
  .workspace-filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .workspace-filters > .b-select {
    width: 180px;
  }
  .workspace-tabs {
    gap: 6px !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .workspace-tabs :deep(.tab) {
    min-height: 36px;
    padding: 7px 14px !important;
    border: 1px solid transparent !important;
    border-radius: 8px;
    background: var(--ow-inset);
    font-size: 12px;
    font-weight: 600 !important;
    box-sizing: border-box;
    transition:
      background-color 0.15s,
      color 0.15s !important;
  }
  .workspace-tabs :deep(.tab.is-active) {
    outline: 1px solid var(--ow-purple) !important;
    outline-offset: -1px;
    border-color: var(--ow-purple) !important;
    background: var(--ow-surface) !important;
    color: var(--text-color) !important;
    box-shadow: 0 2px 6px #6254f418 !important;
  }
  .resource-tab-label {
    display: flex;
    gap: 7px;
    align-items: center;
  }
  .resource-tab-label {
    color: var(--ow-purple);
  }
  .resource-tab-label.file {
    color: var(--ow-amber);
  }
  .resource-tab-label.note {
    color: var(--ow-green);
  }
  .workspace-tabs :deep(.tab-badge) {
    font-size: 10px;
    background: var(--ow-purple-soft) !important;
    color: var(--ow-purple) !important;
  }
  .workspace-list-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--ow-muted);
    font-size: 11px;
    margin: 0 0 10px;
  }
  .workspace-list-heading > span {
    font-weight: 600;
    color: var(--text-color);
  }
  .workspace-list-shell {
    position: relative;
    min-height: 240px;
  }
  .is-switching {
    visibility: hidden;
    pointer-events: none;
  }
  .workspace-switch-feedback {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 10px;
    padding-top: 50px;
    color: var(--ow-muted);
  }
  .organize-suggestion-workspace.has-icon-batch {
    padding-bottom: calc(180px + env(safe-area-inset-bottom, 0px));
  }
  .group-heading {
    position: sticky;
    top: var(--group-sticky-top);
    z-index: 3;
    background: var(--workspace-canvas);
  }
  .group-heading.is-pinned {
    border-bottom: 1px solid var(--workspace-border);
  }
  .group-heading.is-pinned .group-copy small {
    display: none;
  }
  .group-heading.is-pinned .group-toggle {
    min-height: 48px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .group-heading.has-batch-action .group-copy {
    padding-right: 110px;
  }
  .batch-entry.b_btn {
    position: absolute;
    right: 34px;
    top: 50%;
    transform: translateY(-50%);
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--ow-purple);
    background: var(--ow-purple-soft);
    border: 1px solid transparent;
  }
  .batch-entry.b_btn:hover {
    border-color: var(--ow-purple);
  }
  .resource-batch-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 12px;
    border-radius: 8px;
    background: var(--workspace-content);
  }
  .batch-selection-info,
  .batch-selection-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .batch-selection-actions {
    margin-left: auto;
  }
  .batch-selection-actions .b_btn {
    height: 32px;
    font-size: 12px;
  }
  .batch-selection-info > span,
  .batch-selection-actions > span,
  .batch-outcome {
    color: var(--ow-muted);
    font-size: 12px;
  }
  .result-group {
    margin-bottom: 20px;
    padding: 12px 16px 16px;
    border-radius: 16px;
    background: var(--workspace-canvas);
  }
  .group-toggle.b_btn {
    width: 100%;
    height: auto;
    min-height: 60px;
    padding: 10px 2px 14px;
    display: flex;
    gap: 10px;
    align-items: center;
    text-align: left;
    white-space: normal;
    background: transparent;
    border: 0;
    color: var(--text-color);
  }
  .group-toggle.b_btn:hover .group-copy strong {
    color: var(--ow-purple);
  }
  .group-symbol {
    display: grid;
    place-items: center;
    width: 29px;
    height: 29px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #9297aa;
    color: #fff;
  }
  .group-priority .group-symbol {
    background: var(--ow-purple-soft);
    color: var(--ow-purple);
  }
  .group-manual .group-symbol {
    background: #ffb019;
  }
  .group-clear .group-symbol,
  .group-reviewed .group-symbol {
    background: #08b877;
  }
  .group-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .group-copy strong {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 14px;
    line-height: 20px;
  }
  .group-copy small {
    font-size: 11px;
    font-weight: 400;
    color: var(--ow-muted);
    line-height: 1.5;
  }
  .group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    box-sizing: border-box;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--ow-inset);
    color: var(--ow-muted);
    font-size: 11px;
    line-height: 20px;
  }
  .group-priority .group-count {
    background: var(--ow-purple-soft);
    color: var(--ow-purple);
  }
  .group-manual .group-count {
    background: var(--ow-amber-soft);
    color: var(--ow-amber);
  }
  .group-clear .group-count,
  .group-reviewed .group-count {
    background: var(--ow-green-soft);
    color: var(--ow-green);
  }
  .group-content {
    display: grid;
    gap: 12px;
  }
  .group-content .workspace-resource {
    margin: 0;
    --b-card-border-color: var(--workspace-border);
    --b-card-background: var(--workspace-content);
    --b-card-shadow: none;
  }
  .workspace-resource > header {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 16px 18px;
    border-radius: 13px;
    transition: background-color 0.15s;
  }
  .workspace-resource.is-expanded > header {
    border-radius: 13px 13px 0 0;
  }
  .workspace-resource > header.is-expandable {
    cursor: pointer;
  }
  .resource-title-link.b_btn {
    height: auto;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .resource-title-link.b_btn:hover {
    color: var(--primary-color);
    text-decoration: underline;
  }
  .resource-title-link.b_btn:focus-visible,
  .resource-symbol.b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }
  .file-retry-confirmation {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 24px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-color);
  }
  .file-reading-details {
    margin: 0;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--desc-color);
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .resource-symbol.b_btn :deep(.btn-spinner) {
    margin: 0;
  }
  .resource-symbol.b_btn {
    padding: 0;
    border: 0;
  }

  .resource-symbol {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 36px;
    height: 38px;
    border-radius: 9px;
    background: var(--ow-purple-soft);
    color: var(--ow-purple);
  }
  .resource-symbol.note {
    background: var(--ow-green-soft);
    color: var(--ow-green);
  }
  .resource-symbol.file {
    background: #ffa818;
    color: #fff;
  }
  .resource-identity {
    flex: 1;
    min-width: 0;
  }
  .resource-identity small {
    font-size: 11px;
    line-height: 1.5;
    color: var(--ow-muted);
  }
  .resource-conclusion-tools {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .resource-issue-label {
    font-size: 11px;
    border-radius: 6px;
    padding: 3px 8px;
    color: var(--ow-amber);
    background: var(--ow-amber-soft);
  }
  .issue-priority {
    color: var(--ow-purple);
    background: var(--ow-purple-soft);
  }
  .resource-detail-toggle.b_btn {
    display: flex;
    gap: 5px;
    align-items: center;
    font-size: 11px;
    color: var(--ow-muted);
    background: transparent;
    padding: 4px;
    min-height: 28px;
  }
  .resource-conclusion {
    font-size: 11px;
    color: var(--ow-green);
  }
  .expand-chevron {
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .expand-chevron.is-open {
    transform: rotate(180deg);
  }
  .resource-expanded {
    margin: 0 18px 16px 65px;
  }
  .resource-guards {
    padding: 10px 0;
    color: var(--ow-muted);
    font-size: 11px;
  }
  .resource-check-summary {
    padding: 12px 0 0;
    color: var(--ow-muted);
  }
  .resource-check-details {
    display: flex;
    gap: 10px 24px;
    flex-wrap: wrap;
  }
  .resource-check-details > div {
    display: flex;
    gap: 10px;
    font-size: 11px;
    line-height: 1.5;
  }
  .resource-check-details > div > span {
    font-weight: 400;
  }
  .resource-check-details p {
    color: var(--ow-muted);
  }
  .workspace-empty {
    padding: 52px 20px;
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 14px;
    color: var(--ow-muted);
  }
  .workspace-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
    color: var(--danger-color);
    font-size: 13px;
  }
  .workspace-more {
    margin: 12px 0;
  }
  @media (max-width: 760px) {
    .organize-suggestion-workspace {
      --group-sticky-top: -16px;
      padding: 16px 0;
    }
    .workspace-header {
      align-items: flex-start;
      gap: 10px;
    }
    .workspace-header h2 {
      font-size: 21px;
    }
    .workspace-header p {
      font-size: 12px;
    }
    .workspace-header > .workspace-tools {
      flex-shrink: 0;
    }
    .workspace-run-header {
      padding: 12px;
      flex-wrap: wrap;
    }
    .workspace-run-identity {
      gap: 7px;
    }
    .workspace-run-header .workspace-tools {
      margin-left: auto;
    }
    .workspace-filters {
      flex-wrap: wrap;
      gap: 8px;
    }
    .workspace-tabs {
      width: 100%;
      justify-content: space-between;
    }
    .workspace-tabs :deep(.tab) {
      padding: 7px 10px !important;
    }
    .workspace-filters > .b-select {
      width: 100%;
    }
    .workspace-list-heading small {
      display: none;
    }
    .result-group {
      padding: 8px 12px 12px;
    }
    .group-toggle.b_btn {
      padding: 8px 0 12px;
      gap: 10px;
    }
    .group-heading.has-batch-action .group-copy {
      padding-right: 88px;
    }
    .batch-entry.b_btn {
      right: 26px;
      padding: 0 9px;
      font-size: 11px;
    }
    .batch-selection-info > span {
      flex-basis: 100%;
    }
    .group-copy small {
      font-size: 10px;
    }
    .workspace-resource > header {
      flex-wrap: wrap;
      padding: 12px 11px;
      gap: 8px;
    }
    .resource-expanded {
      margin: 0 12px 14px;
    }
    .resource-identity {
      flex-basis: calc(100% - 44px);
    }
    .workspace-resource > header.has-selection {
      display: grid;
      grid-template-columns: 20px 36px minmax(0, 1fr);
    }
    .workspace-resource > header.has-selection .resource-conclusion-tools {
      grid-column: 2 / -1;
      padding-left: 44px;
    }
    .resource-conclusion-tools {
      width: 100%;
      justify-content: space-between;
      padding-left: 44px;
      box-sizing: border-box;
      gap: 8px;
    }
    .resource-issue-label {
      font-size: 10px;
    }
    .file-reading-details {
      padding: 12px 0;
    }
    .resource-check-details {
      display: grid;
    }
    .resource-check-details > div {
      font-size: 11px;
    }
  }
</style>
