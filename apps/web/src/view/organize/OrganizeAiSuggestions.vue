<template>
  <section class="organize-ai-suggestions">
    <header class="organize-ai-suggestions__heading">
      <div>
        <h2>{{ t('organize.aiSuggestions.title') }}</h2>
        <p>{{ t('organize.aiSuggestions.description') }}</p>
      </div>
      <BButton
        v-if="!historyOnly"
        ref="createTrigger"
        type="primary"
        :disabled="mutatingSuggestionIds.size > 0 || creating || estimating"
        @click="openGeneration"
      >
        <SvgIcon :src="icon.ai.organize" size="16" aria-hidden="true" />
        {{ t(activeBatch ? 'organize.aiSuggestions.regenerate' : 'organize.aiSuggestions.generate') }}
      </BButton>
    </header>

    <BCard as="section" variant="card" padding="0" class="organize-ai-review">
      <header v-if="activeBatch" class="organize-ai-review__heading">
        <div class="organize-ai-review__context">
          <h3 v-if="activeBatch" class="organize-ai-current-title">
            <SvgIcon :src="icon.ai.organize" size="19" aria-hidden="true" />
            {{ t('organize.aiSuggestions.runTitle', { count: runProgress.total }) }}
          </h3>
          <p v-if="activeBatch" class="organize-ai-batch-meta">
            <span :title="formatDate(activeBatch.createdAt, true)">{{ formatDate(activeBatch.createdAt) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{
              t('organize.aiSuggestions.analysisProgress', {
                processed: runProgress.processed,
                total: runProgress.total,
              })
            }}</span>
          </p>
        </div>
        <div v-if="activeBatch" class="organize-ai-review__summary">
          <BPopover v-model:open="batchPickerOpen" placement="bottom-left" @open-change="focusBatchPicker">
            <BButton
              ref="batchTrigger"
              class="organize-ai-text-action"
              :aria-expanded="batchPickerOpen"
              aria-haspopup="dialog"
            >
              <span>{{ t('organize.aiSuggestions.history') }}</span>
            </BButton>
            <template #content>
              <div
                ref="batchPicker"
                class="organize-ai-batches"
                role="dialog"
                :aria-label="t('organize.aiSuggestions.history')"
              >
                <div class="organize-ai-section-heading">
                  <strong>{{ t('organize.aiSuggestions.history') }}</strong>
                  <BButton
                    size="small"
                    class="organize-ai-text-action"
                    :loading="batchesLoading"
                    @click="loadBatches(true)"
                    >{{ t('organize.refresh') }}</BButton
                  >
                </div>
                <div v-if="batchesError" class="organize-ai-inline-error" role="alert">{{
                  t('organize.aiSuggestions.batchLoadFailed')
                }}</div>
                <BLoading v-if="batchesLoading && !batches.length" inline loading :title="t('organize.loading')" />
                <p v-else-if="!batches.length && !batchesError" class="organize-ai-muted">{{
                  t('organize.aiSuggestions.noBatches')
                }}</p>
                <div v-auto-scrollbar class="organize-ai-batch-list">
                  <BButton
                    v-for="batch in batches"
                    :key="batch.id"
                    class="organize-ai-batch-item"
                    :class="{ 'is-active': activeBatchId === batch.id }"
                    :aria-pressed="activeBatchId === batch.id"
                    :disabled="mutatingSuggestionIds.size > 0"
                    @click="chooseBatch(batch.id)"
                  >
                    <SvgIcon
                      :src="icon.resource[batch.resourceType]"
                      class="organize-ai-resource-icon"
                      :class="`is-${batch.resourceType}`"
                      size="18"
                      aria-hidden="true"
                    />
                    <span class="organize-ai-batch-item__copy">
                      <strong>{{ batchTitle(batch) }}</strong>
                      <small :title="formatDate(batch.createdAt, true)">{{ formatDate(batch.createdAt) }}</small>
                    </span>
                    <span class="organize-ai-batch-item__state">
                      <span :class="`is-${batch.status}`">{{
                        batch.status === 'ready'
                          ? t('organize.aiSuggestions.pendingCount', { count: batch.progress.ready })
                          : batchStatusLabel(batch.status)
                      }}</span>
                      <SvgIcon
                        v-if="activeBatchId === batch.id"
                        :src="icon.filterPanel.check"
                        size="14"
                        aria-hidden="true"
                      />
                    </span>
                  </BButton>
                </div>
                <BButton
                  v-if="batchesNextCursor"
                  class="organize-ai-load-more"
                  size="small"
                  :loading="batchesLoadingMore"
                  @click="loadBatches(false)"
                  >{{ t('organize.loadMore') }}</BButton
                >
              </div>
            </template>
          </BPopover>

          <BChip :tone="statusTone(runStatus)" size="small">{{ batchStatusLabel(runStatus) }}</BChip>
          <span>{{ t('organize.aiSuggestions.pendingCount', { count: runProgress.ready }) }}</span>
          <span v-if="runProgress.accepted" class="organize-ai-muted">{{
            t('organize.aiSuggestions.appliedCount', { count: runProgress.accepted })
          }}</span>
          <BButton
            class="organize-ai-text-action"
            :loading="detailLoading"
            :disabled="mutatingSuggestionIds.size > 0"
            @click="refreshWorkspace()"
            >{{ t('organize.refresh') }}</BButton
          >
        </div>
      </header>

      <div v-if="batchesError && !activeBatch" class="organize-ai-state is-error" role="alert">
        <SvgIcon :src="icon.message.error" size="22" aria-hidden="true" />
        <strong>{{ t('organize.aiSuggestions.batchLoadFailed') }}</strong>
        <BButton @click="loadBatches(true)">{{ t('common.retry') }}</BButton>
      </div>
      <div
        v-else-if="(batchesLoading && !activeBatch) || (detailLoading && !activeBatch?.suggestions)"
        class="organize-ai-loading"
        role="status"
      >
        <BLoading inline loading :title="t('organize.loading')" />
        <div v-for="row in 3" :key="row" class="organize-ai-skeleton" aria-hidden="true"
          ><span></span><span></span><span></span
        ></div>
      </div>
      <div v-else-if="!activeBatch" class="organize-ai-state">
        <SvgIcon :src="icon.ai.organize" size="30" aria-hidden="true" />
        <strong>{{ t('organize.aiSuggestions.noBatches') }}</strong>
        <p>{{ t('organize.aiSuggestions.emptyDescription') }}</p>
        <BButton v-if="!historyOnly" @click="openGeneration">{{ t('organize.aiSuggestions.generate') }}</BButton>
      </div>
      <template v-else>
        <div v-if="isRunRunning" class="organize-ai-progress" role="status">
          <BProgress
            :percent="runProgress.percent"
            :aria-label="
              t('organize.aiSuggestions.analysisProgress', {
                processed: runProgress.processed,
                total: runProgress.total,
              })
            "
            show-info
          />
          <span>{{ t('organize.aiSuggestions.canLeave') }}</span>
        </div>
        <div v-if="runSummaryError" class="organize-ai-inline-error" role="alert">
          <span>{{ t('organize.aiSuggestions.runLoadFailed') }}</span>
          <BButton size="small" @click="refreshWorkspace()">{{ t('common.retry') }}</BButton>
        </div>
        <nav class="organize-ai-resource-tabs" :aria-label="t('organize.aiSuggestions.resourceType')">
          <BButton
            v-for="batch in runBatches"
            :key="batch.id"
            :aria-pressed="activeBatchId === batch.id"
            :class="{ 'is-active': activeBatchId === batch.id }"
            :disabled="mutatingSuggestionIds.size > 0"
            @click="selectBatch(batch.id)"
          >
            <SvgIcon :src="icon.resource[batch.resourceType]" size="18" aria-hidden="true" />
            <span class="organize-ai-resource-tabs__copy"
              ><strong>{{ batchTitle(batch) }}</strong
              ><small>{{
                t('organize.aiSuggestions.analysisProgress', {
                  processed: batch.progress.processed,
                  total: batch.progress.total,
                })
              }}</small></span
            >
            <BChip :tone="statusTone(batch.status)" size="small">{{ batchStatusLabel(batch.status) }}</BChip>
          </BButton>
        </nav>
        <div v-if="detailError" class="organize-ai-inline-error" role="alert">
          <span>{{
            t(
              activeBatch.suggestions
                ? 'organize.aiSuggestions.staleDetail'
                : 'organize.aiSuggestions.detailLoadFailed',
            )
          }}</span>
          <BButton size="small" @click="refreshWorkspace()">{{ t('common.retry') }}</BButton>
        </div>
        <div v-if="visibleSuggestions.length" class="organize-ai-suggestion-list" role="list">
          <article
            v-for="suggestion in visibleSuggestions"
            :key="suggestion.id"
            class="organize-ai-suggestion"
            :class="[`is-${suggestion.status}`, { 'is-editing': editingSuggestionId === suggestion.id }]"
            role="listitem"
          >
            <div class="organize-ai-suggestion__resource">
              <SvgIcon
                :src="icon.resource[suggestion.resource.type]"
                class="organize-ai-resource-icon"
                :class="`is-${suggestion.resource.type}`"
                size="20"
                aria-hidden="true"
              />
              <strong>{{ suggestion.resource.title || t('inbox.untitled') }}</strong>
              <BChip :tone="statusTone(suggestion.status)" size="small">
                <SvgIcon
                  v-if="suggestion.status === 'accepted'"
                  :src="icon.filterPanel.check"
                  size="12"
                  aria-hidden="true"
                />
                {{ suggestionStatusLabel(suggestion.status) }}
              </BChip>
            </div>
            <div class="organize-ai-suggestion__body">
              <div class="organize-ai-suggestion__details">
                <div v-if="editingSuggestionId === suggestion.id" class="organize-ai-suggestion__editor">
                  <OrganizeSuggestionTagEditor
                    v-model:tags="editingTags"
                    :disabled="mutatingSuggestionIds.has(suggestion.id)"
                  />
                </div>
                <template v-else>
                  <div class="organize-ai-tag-change" :aria-label="t('organize.aiSuggestions.recommendedTags')">
                    <template v-if="suggestion.status !== 'accepted'">
                      <ResourceTagChip
                        v-for="tag in suggestion.currentTags"
                        :key="tag.id"
                        :tag="tag"
                        max-width="200px"
                      />
                      <span v-if="!suggestion.currentTags.length" class="organize-ai-muted">{{
                        t('organize.aiSuggestions.noCurrentTags')
                      }}</span>
                      <span aria-hidden="true" class="organize-ai-muted">→</span>
                    </template>
                    <span
                      v-for="tag in displayedTags(suggestion)"
                      :key="`${tag.id || 'new'}:${tag.name}`"
                      class="organize-ai-tag-candidate"
                    >
                      <ResourceTagChip :tag="{ name: tag.name }" max-width="240px" />
                      <small v-if="tag.source === 'new'" class="organize-ai-muted">{{
                        t('organize.aiSuggestions.newTag')
                      }}</small>
                    </span>
                    <span v-if="!displayedTags(suggestion).length" class="organize-ai-muted">{{
                      t(
                        ['queued', 'running'].includes(suggestion.status)
                          ? suggestion.status === 'queued'
                            ? 'organize.aiSuggestions.waitingAnalysis'
                            : 'organize.aiSuggestions.analyzing'
                          : suggestion.status === 'failed'
                            ? 'organize.aiSuggestions.analysisFailed'
                            : 'organize.aiSuggestions.noSuggestion',
                      )
                    }}</span>
                  </div>
                  <div
                    v-if="suggestion.reason && !['accepted', 'ignored'].includes(suggestion.status)"
                    class="organize-ai-reason"
                  >
                    <p :class="{ 'is-expanded': expandedReasonIds.has(suggestion.id) }">{{ suggestion.reason }}</p>
                    <BButton
                      v-if="suggestion.reason.length > 65"
                      size="small"
                      class="organize-ai-text-action"
                      :aria-expanded="expandedReasonIds.has(suggestion.id)"
                      @click="toggleReason(suggestion.id)"
                      >{{
                        t(
                          expandedReasonIds.has(suggestion.id)
                            ? 'organize.aiSuggestions.collapseReason'
                            : 'organize.aiSuggestions.expandReason',
                        )
                      }}</BButton
                    >
                  </div>
                </template>
                <div v-if="suggestion.status === 'conflict'" class="organize-ai-conflict" role="alert">
                  <SvgIcon :src="icon.message.warning" size="16" aria-hidden="true" />
                  <span>{{ t('organize.aiSuggestions.conflictHint') }}</span>
                </div>
              </div>
              <footer
                v-if="['pending', 'no_suggestion'].includes(suggestion.status)"
                class="organize-ai-suggestion__actions"
              >
                <template v-if="editingSuggestionId === suggestion.id">
                  <BButton size="small" :disabled="mutatingSuggestionIds.has(suggestion.id)" @click="cancelEditing">
                    {{ t('common.cancel') }}
                  </BButton>
                  <BButton
                    size="small"
                    class="organize-ai-apply-action"
                    :loading="mutatingSuggestionIds.has(suggestion.id)"
                    :disabled="!editingTagsValid"
                    @click="acceptSuggestion(suggestion, editingTags)"
                  >
                    {{ t('organize.aiSuggestions.acceptEdited') }}
                  </BButton>
                </template>
                <template v-else>
                  <BButton
                    size="small"
                    class="organize-ai-text-action"
                    :disabled="mutatingSuggestionIds.has(suggestion.id)"
                    @click="startEditing(suggestion)"
                    >{{
                      t(suggestion.status === 'no_suggestion' ? 'organize.aiSuggestions.addTags' : 'common.edit')
                    }}</BButton
                  >
                  <BButton
                    v-if="suggestion.status === 'pending'"
                    size="small"
                    :loading="mutatingSuggestionIds.has(suggestion.id)"
                    class="organize-ai-text-action"
                    @click="ignoreSuggestion(suggestion)"
                  >
                    {{ t('organize.ignore') }}
                  </BButton>
                  <BButton
                    v-if="suggestion.status === 'pending'"
                    size="small"
                    class="organize-ai-apply-action"
                    :loading="mutatingSuggestionIds.has(suggestion.id)"
                    :disabled="!suggestion.recommendedTags.length"
                    @click="acceptSuggestion(suggestion)"
                  >
                    {{ t('organize.aiSuggestions.accept') }}
                  </BButton>
                </template>
              </footer>
            </div>
          </article>
        </div>
        <div v-else-if="!isActiveBatchRunning && !detailError" class="organize-ai-state">
          <SvgIcon :src="icon.message.info" size="24" aria-hidden="true" />
          <span>{{ t('organize.aiSuggestions.noReviewableSuggestions') }}</span>
        </div>
        <BButton
          v-if="activeBatch.nextCursor"
          class="organize-ai-load-more"
          :loading="detailLoadingMore"
          @click="loadMoreSuggestions"
          >{{ t('organize.loadMore') }}</BButton
        >
      </template>
    </BCard>

    <BDrawer
      :open="createDrawerOpen"
      :title="t(activeBatch ? 'organize.aiSuggestions.regenerate' : 'organize.aiSuggestions.generate')"
      width="560px"
      @close="closeGeneration"
      @after-close="restoreCreateFocus"
    >
      <div class="organize-ai-create-card">
        <p class="organize-ai-create-description">{{ t('organize.aiSuggestions.createDescription') }}</p>
        <ol class="organize-ai-create-card__steps" :aria-label="t('organize.aiSuggestions.stepsLabel')">
          <li :class="{ 'is-active': !hasEstimateResult }" :aria-current="!hasEstimateResult ? 'step' : undefined"
            ><span>1</span>{{ t('organize.aiSuggestions.stepScope') }}</li
          >
          <li :class="{ 'is-active': hasEstimateResult }" :aria-current="hasEstimateResult ? 'step' : undefined"
            ><span>2</span>{{ t('organize.aiSuggestions.stepEstimate') }}</li
          >
        </ol>
        <div v-if="selectedSeedCount" class="organize-ai-seed" role="status">
          <SvgIcon :src="icon.message.info" size="16" aria-hidden="true" />
          <span>{{ t('organize.aiSuggestions.selectedSeed', { count: selectedSeedCount }) }}</span>
        </div>
        <div v-if="!hasEstimateResult" ref="drawerFields" class="organize-ai-create-card__fields">
          <div class="organize-ai-choice-group">
            <span>{{ t('organize.aiSuggestions.resourceType') }}</span>
            <div class="organize-ai-choice-grid is-resource-type">
              <BButton
                v-for="option in resourceTypeOptions"
                :key="option.value"
                class="organize-ai-choice"
                :class="{ 'is-selected': draftResourceTypes.includes(option.value) }"
                :aria-pressed="draftResourceTypes.includes(option.value)"
                :disabled="estimating || creating"
                @click="toggleResourceType(option.value)"
              >
                <span class="organize-ai-choice__icon" :class="`is-${option.value}`" aria-hidden="true">
                  <SvgIcon :src="icon.resource[option.value]" size="17" />
                </span>
                <span class="organize-ai-choice__copy">
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description }}</small>
                </span>
                <SvgIcon
                  v-if="draftResourceTypes.includes(option.value)"
                  class="organize-ai-choice__check"
                  :src="icon.filterPanel.check"
                  size="15"
                  aria-hidden="true"
                />
              </BButton>
            </div>
          </div>
          <div class="organize-ai-choice-group">
            <span>{{ t('organize.aiSuggestions.scope') }}</span>
            <div class="organize-ai-choice-grid is-scope-grid">
              <BButton
                v-for="option in scopeOptions"
                :key="option.value"
                class="organize-ai-choice is-scope"
                :class="{ 'is-selected': draftScope === option.value }"
                :aria-pressed="draftScope === option.value"
                :disabled="estimating || creating"
                @click="selectScope(option.value)"
              >
                <span class="organize-ai-choice__copy">
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description }}</small>
                </span>
                <SvgIcon
                  v-if="draftScope === option.value"
                  class="organize-ai-choice__check"
                  :src="icon.filterPanel.check"
                  size="15"
                  aria-hidden="true"
                />
              </BButton>
            </div>
          </div>
          <BButton
            type="primary"
            class="organize-ai-estimate-action"
            :loading="estimating"
            :disabled="creating || !canEstimate"
            @click="estimateDraft"
          >
            {{ t('organize.aiSuggestions.estimateAction') }}
          </BButton>
        </div>

        <BButton
          v-if="hasEstimateResult"
          class="organize-ai-text-action organize-ai-back"
          :disabled="estimating || creating"
          @click="lastDraftWasEstimated = false"
          >{{ t('organize.aiSuggestions.backToScope') }}</BButton
        >
        <div v-if="hasEstimateResult" class="organize-ai-estimate" :class="{ 'is-disabled': !canCreateDraft }">
          <header ref="estimateHeading" class="organize-ai-estimate__heading" tabindex="-1">
            <span class="organize-ai-estimate__icon" aria-hidden="true">
              <SvgIcon :src="icon.filterPanel.check" size="17" />
            </span>
            <div>
              <strong>{{ t('organize.aiSuggestions.estimateTitle') }}</strong>
              <small>{{ estimateScopeSummary }}</small>
            </div>
          </header>

          <div class="organize-ai-estimate__breakdown" :aria-label="t('organize.aiSuggestions.estimateBreakdown')">
            <div v-for="entry in estimateEntries" :key="entry.resourceType" class="organize-ai-estimate__type">
              <span class="organize-ai-choice__icon" :class="`is-${entry.resourceType}`" aria-hidden="true">
                <SvgIcon :src="icon.resource[entry.resourceType]" size="15" />
              </span>
              <span>
                <strong>{{ resourceTypeLabel(entry.resourceType) }}</strong>
                <small>
                  {{ t('organize.aiSuggestions.estimateTypeCount', { count: entry.estimate.scope.eligibleCount }) }}
                </small>
              </span>
              <small>{{ formatTokenRange(entry.estimate) }}</small>
            </div>
          </div>

          <div class="organize-ai-estimate__metrics">
            <div>
              <span>{{ t('organize.aiSuggestions.eligibleCount') }}</span>
              <strong>{{ aggregateEstimate.eligibleCount }}</strong>
              <small v-if="aggregateEstimate.skippedCount">
                {{ t('organize.aiSuggestions.skippedCount', { count: aggregateEstimate.skippedCount }) }}
              </small>
            </div>
            <div>
              <span>{{ t('organize.aiSuggestions.estimatedConsumption') }}</span>
              <strong>{{ formatAggregateTokenRange }}</strong>
              <small>{{ t('organize.aiSuggestions.estimateOnlyAtConfirmation') }}</small>
            </div>
          </div>

          <p class="organize-ai-estimate__guard">
            <SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />
            <span>{{ t('organize.aiSuggestions.reviewGuard') }}</span>
          </p>

          <BButton type="primary" :loading="creating" :disabled="!canCreateDraft" @click="createBatch">
            {{ t('organize.aiSuggestions.createAction', { count: aggregateEstimate.eligibleCount }) }}
          </BButton>
        </div>
        <div v-if="createError" class="organize-ai-state is-error" role="alert">
          <SvgIcon :src="icon.message.error" size="17" aria-hidden="true" />
          <span>{{ createError }}</span>
          <BButton v-if="lastDraftWasEstimated" size="small" @click="estimateDraft">{{ t('common.retry') }}</BButton>
        </div>
      </div>
    </BDrawer>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import OrganizeSuggestionTagEditor from './OrganizeSuggestionTagEditor.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { generateUUID } from '@/utils/common';
  import {
    acceptOrganizeAiSuggestion,
    createOrganizeAiSuggestionBatch,
    estimateOrganizeAiSuggestions,
    getOrganizeAiSuggestionBatch,
    getOrganizeAiSuggestionBatches,
    ignoreOrganizeAiSuggestion,
    getOrganizeIssueList,
    type OrganizeAiSuggestion,
    type OrganizeAiSuggestionTag,
    type OrganizeAiSuggestionBatch,
    type OrganizeAiSuggestionBatchList,
    type OrganizeAiSuggestionBatchStatus,
    type OrganizeAiSuggestionEstimate,
    type OrganizeAiSuggestionResourceType,
    type OrganizeAiSuggestionScopeMode,
    type OrganizeAiSuggestionStatus,
    type UntaggedResourceItem,
  } from '@/api/organizeApi';

  const props = defineProps<{ historyOnly?: boolean }>();
  const ORGANIZE_AI_SEED_KEY = 'light-note:organize-ai-suggestion-seed:v1';
  const ACTIVE_BATCH_STATUSES = new Set<OrganizeAiSuggestionBatchStatus>(['queued', 'running']);
  type DraftScope = OrganizeAiSuggestionScopeMode | 'recent';
  interface DraftPayload {
    resourceType: OrganizeAiSuggestionResourceType;
    scope: OrganizeAiSuggestionScopeMode;
    resourceIds?: string[];
  }
  interface DraftEstimateEntry {
    resourceType: OrganizeAiSuggestionResourceType;
    payload: DraftPayload;
    estimate: OrganizeAiSuggestionEstimate;
  }

  const emit = defineEmits<{ 'refresh-summary': [] }>();
  const { t, locale } = useI18n();

  function closeGeneration() {
    if (!creating.value && !estimating.value) createDrawerOpen.value = false;
  }

  function openGeneration() {
    if (creating.value || estimating.value || mutatingSuggestionIds.value.size) return;
    // 重新整理是新的范围决策，历史结果只用于审核，不能反向恢复旧资料。
    selectionSeed.value = null;
    draftResourceTypes.value = ['bookmark', 'note'];
    draftScope.value = 'untagged';
    resetEstimate();
    createDrawerOpen.value = true;
  }

  const seed = readSelectionSeed();
  const createDrawerOpen = ref(Boolean(seed));
  const batchPickerOpen = ref(false);
  const batchPicker = ref<HTMLElement | null>(null);
  const batchTrigger = ref<InstanceType<typeof BButton> | null>(null);
  const createTrigger = ref<InstanceType<typeof BButton> | null>(null);
  const expandedReasonIds = ref(new Set<string>());
  const estimateHeading = ref<HTMLElement | null>(null);
  const drawerFields = ref<HTMLElement | null>(null);

  async function focusBatchPicker(open: boolean) {
    if (!open) return;
    await nextTick();
    (
      batchPicker.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ||
      batchPicker.value?.querySelector<HTMLElement>('button')
    )?.focus();
  }

  function restoreCreateFocus() {
    createTrigger.value?.$el?.focus({ preventScroll: true });
  }

  function chooseBatch(id: string) {
    batchPickerOpen.value = false;
    batchTrigger.value?.$el?.focus({ preventScroll: true });
    void selectBatch(id);
  }

  function toggleReason(id: string) {
    const next = new Set(expandedReasonIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedReasonIds.value = next;
  }

  function statusTone(status: OrganizeAiSuggestionStatus | OrganizeAiSuggestionBatchStatus) {
    if (['accepted', 'completed'].includes(status)) return 'success' as const;
    if (['failed', 'conflict', 'partial'].includes(status)) return 'danger' as const;
    if (['ready', 'pending', 'queued', 'running'].includes(status)) return 'pending' as const;
    return 'neutral' as const;
  }

  const draftResourceTypes = ref<OrganizeAiSuggestionResourceType[]>(
    seed?.resourceType ? [seed.resourceType] : ['bookmark', 'note'],
  );
  const draftScope = ref<DraftScope>(seed?.resourceIds.length ? 'selected' : 'untagged');
  const selectionSeed = ref(seed);
  const estimateEntries = ref<DraftEstimateEntry[]>([]);
  const estimating = ref(false);
  const creating = ref(false);
  const draftRequestIds = ref<Partial<Record<OrganizeAiSuggestionResourceType, string>>>({});
  const draftGroupId = ref('');
  const createdDraftTypes = ref(new Set<OrganizeAiSuggestionResourceType>());
  const createError = ref('');
  const lastDraftWasEstimated = ref(false);
  const batches = ref<OrganizeAiSuggestionBatch[]>([]);
  const batchesNextCursor = ref<string | null>(null);
  const batchesLoading = ref(false);
  const batchesLoadingMore = ref(false);
  const batchesError = ref(false);
  const activeBatchId = ref('');
  const activeBatch = ref<OrganizeAiSuggestionBatch | null>(null);
  const detailLoading = ref(false);
  const detailLoadingMore = ref(false);
  const detailError = ref(false);
  const editingSuggestionId = ref('');
  const editingTags = ref<OrganizeAiSuggestionTag[]>([]);
  const mutatingSuggestionIds = ref(new Set<string>());
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let batchListSequence = 0;
  let batchDetailSequence = 0;

  const runSummaryError = ref(false);
  let runSequence = 0;
  const runBatches = computed(() => {
    const active = activeBatch.value;
    if (!active) return [];
    const members = active.groupId
      ? batches.value.filter((batch) => batch.groupId === active.groupId && batch.id !== active.id)
      : [];
    return [active, ...members].sort((a, b) => a.resourceType.localeCompare(b.resourceType));
  });
  const runProgress = computed(() => {
    const result = runBatches.value.reduce(
      (sum, batch) => ({
        total: sum.total + batch.progress.total,
        processed: sum.processed + batch.progress.processed,
        ready: sum.ready + batch.progress.ready,
        accepted: sum.accepted + batch.progress.accepted,
      }),
      { total: 0, processed: 0, ready: 0, accepted: 0 },
    );
    return {
      ...result,
      percent: result.total ? Math.min(100, Math.round((result.processed / result.total) * 100)) : 0,
    };
  });
  const isRunRunning = computed(() => runBatches.value.some((batch) => ACTIVE_BATCH_STATUSES.has(batch.status)));
  const runStatus = computed<OrganizeAiSuggestionBatchStatus>(() => {
    const statuses = runBatches.value.map((batch) => batch.status);
    if (statuses.includes('running')) return 'running';
    if (statuses.includes('queued')) return 'queued';
    if (statuses.every((status) => status === 'failed')) return 'failed';
    if (statuses.some((status) => ['partial', 'failed'].includes(status))) return 'partial';
    if (runProgress.value.ready) return 'ready';
    return activeBatch.value?.status || 'completed';
  });

  async function loadRunSummary() {
    const groupId = activeBatch.value?.groupId;
    if (!groupId) return;
    const sequence = ++runSequence;
    try {
      const response = await getOrganizeAiSuggestionBatches({ groupId, limit: 50 });
      if (sequence !== runSequence || activeBatch.value?.groupId !== groupId) return;
      if (response.status !== 200 || !response.data) throw responseError(response);
      const incoming = (response.data as OrganizeAiSuggestionBatchList).items.filter(
        (batch) => batch.groupId === groupId,
      );
      batches.value = mergeBatches(batches.value, incoming);
      runSummaryError.value = false;
    } catch {
      if (sequence === runSequence && activeBatch.value?.groupId === groupId) runSummaryError.value = true;
    }
  }

  async function refreshWorkspace(silent = false) {
    const id = activeBatchId.value;
    if (!id) return;
    await Promise.all([loadRunSummary(), loadBatchDetail(id, { silent })]);
    if (activeBatchId.value === id) schedulePolling();
  }

  const selectedSeedIds = computed(() =>
    selectionSeed.value && draftResourceTypes.value.includes(selectionSeed.value.resourceType)
      ? selectionSeed.value.resourceIds
      : [],
  );
  const selectedSeedCount = computed(() => selectedSeedIds.value.length);
  const canEstimate = computed(
    () => draftResourceTypes.value.length > 0 && (draftScope.value !== 'selected' || selectedSeedCount.value > 0),
  );
  const hasEstimateResult = computed(() => lastDraftWasEstimated.value);
  watch(hasEstimateResult, async (confirmed) => {
    await nextTick();
    if (!createDrawerOpen.value) return;
    if (confirmed) estimateHeading.value?.focus({ preventScroll: true });
    else drawerFields.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  });
  const aggregateEstimate = computed(() =>
    estimateEntries.value.reduce(
      (result, entry) => ({
        eligibleCount: result.eligibleCount + entry.estimate.scope.eligibleCount,
        skippedCount: result.skippedCount + entry.estimate.scope.skippedCount,
        estimatedTokensLower: result.estimatedTokensLower + entry.estimate.estimate.estimatedTokensLower,
        estimatedTokensUpper: result.estimatedTokensUpper + entry.estimate.estimate.estimatedTokensUpper,
      }),
      { eligibleCount: 0, skippedCount: 0, estimatedTokensLower: 0, estimatedTokensUpper: 0 },
    ),
  );
  const canCreateDraft = computed(
    () =>
      estimateEntries.value.some((entry) => entry.estimate.canCreate) &&
      estimateEntries.value.every((entry) => entry.estimate.featureEnabled),
  );
  const formatAggregateTokenRange = computed(() => {
    const formatter = new Intl.NumberFormat(locale.value);
    return `${formatter.format(aggregateEstimate.value.estimatedTokensLower)}–${formatter.format(
      aggregateEstimate.value.estimatedTokensUpper,
    )} tokens`;
  });
  const estimateScopeSummary = computed(() =>
    t('organize.aiSuggestions.estimateScopeSummary', {
      types: draftResourceTypes.value.map(resourceTypeLabel).join('、'),
      scope: t(`organize.aiSuggestions.scopeShort.${draftScope.value}`),
    }),
  );
  const scopeOptions = computed(() => [
    {
      value: 'untagged' as const,
      label: t('organize.aiSuggestions.scopeUntagged'),
      description: t('organize.aiSuggestions.scopeUntaggedDescription'),
    },
    {
      value: 'recent' as const,
      label: t('organize.aiSuggestions.scopeRecent'),
      description: t('organize.aiSuggestions.scopeRecentDescription'),
    },
    ...(selectedSeedCount.value
      ? [
          {
            value: 'selected' as const,
            label: t('organize.aiSuggestions.scopeSelected', { count: selectedSeedCount.value }),
            description: t('organize.aiSuggestions.scopeSelectedDescription'),
          },
        ]
      : []),
  ]);
  const resourceTypeOptions = computed<
    Array<{ value: OrganizeAiSuggestionResourceType; label: string; description: string }>
  >(() => [
    {
      value: 'bookmark',
      label: t('resourceCenter.types.bookmark'),
      description: t('organize.aiSuggestions.bookmarkDescription'),
    },
    {
      value: 'note',
      label: t('resourceCenter.types.note'),
      description: t('organize.aiSuggestions.noteDescription'),
    },
  ]);
  const editingTagsValid = computed(() => editingTags.value.length > 0 && editingTags.value.length <= 3);
  const isActiveBatchRunning = computed(() =>
    Boolean(activeBatch.value && ACTIVE_BATCH_STATUSES.has(activeBatch.value.status)),
  );
  const visibleSuggestions = computed(() => activeBatch.value?.suggestions || []);

  function readSelectionSeed(): { resourceType: OrganizeAiSuggestionResourceType; resourceIds: string[] } | null {
    if (props.historyOnly) return null;
    try {
      const raw = sessionStorage.getItem(ORGANIZE_AI_SEED_KEY);
      if (!raw) return null;
      // 外部选择只消费一次；取消或刷新不能再次带入旧资料。
      sessionStorage.removeItem(ORGANIZE_AI_SEED_KEY);
      const value = JSON.parse(raw);
      const resourceType = value?.resourceType;
      if (!['bookmark', 'note'].includes(resourceType) || !Array.isArray(value?.resourceIds)) return null;
      const resourceIds = [...new Set<string>(value.resourceIds.map((id: unknown) => String(id || '').trim()).filter(Boolean))];
      if (resourceIds.length > 20) return null;
      return resourceIds.length ? { resourceType, resourceIds } : null;
    } catch {
      return null;
    }
  }

  function resetEstimate() {
    if (draftScope.value === 'selected' && !selectedSeedCount.value) draftScope.value = 'untagged';
    draftRequestIds.value = {};
    draftGroupId.value = '';
    createdDraftTypes.value = new Set();
    estimateEntries.value = [];
    createError.value = '';
    lastDraftWasEstimated.value = false;
  }

  function toggleResourceType(value: OrganizeAiSuggestionResourceType) {
    const currentlySelected = draftResourceTypes.value.includes(value);
    if (currentlySelected && draftResourceTypes.value.length === 1) return;
    draftResourceTypes.value = currentlySelected
      ? draftResourceTypes.value.filter((item) => item !== value)
      : [...draftResourceTypes.value, value];
    if (draftScope.value === 'selected' && !selectedSeedCount.value) draftScope.value = 'untagged';
    resetEstimate();
  }

  function selectScope(value: DraftScope) {
    if (draftScope.value === value) return;
    draftScope.value = value;
    resetEstimate();
  }

  async function recentResourceIds(resourceType: OrganizeAiSuggestionResourceType) {
    const response = await getOrganizeIssueList('untagged', { resourceType, limit: 20 });
    if (response.status !== 200 || !response.data) throw new Error(response.msg || t('organize.actionFailed'));
    const items = Array.isArray(response.data.items) ? (response.data.items as UntaggedResourceItem[]) : [];
    return items
      .filter((item) => item.resourceType === resourceType)
      .map((item) => String(item.resourceId || '').trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  async function draftPayloads(): Promise<DraftPayload[]> {
    if (draftScope.value === 'selected') {
      if (!selectionSeed.value || !selectedSeedCount.value) return [];
      return [
        {
          resourceType: selectionSeed.value.resourceType,
          scope: 'selected',
          resourceIds: selectedSeedIds.value,
        },
      ];
    }
    if (draftScope.value === 'recent') {
      const values = await Promise.all(
        draftResourceTypes.value.map(async (resourceType) => ({
          resourceType,
          resourceIds: await recentResourceIds(resourceType),
        })),
      );
      return values
        .filter((value) => value.resourceIds.length > 0)
        .map((value) => ({ ...value, scope: 'selected' as const }));
    }
    return draftResourceTypes.value.map((resourceType) => ({ resourceType, scope: 'untagged' }));
  }

  async function estimateDraft() {
    if (!canEstimate.value || estimating.value) return;
    estimating.value = true;
    createError.value = '';
    estimateEntries.value = [];
    lastDraftWasEstimated.value = false;
    try {
      const payloads = await draftPayloads();
      if (!payloads.length) {
        lastDraftWasEstimated.value = true;
        createError.value = t('organize.aiSuggestions.noEligibleResources');
        return;
      }
      const responses = await Promise.all(
        payloads.map(async (payload) => {
          const response = await estimateOrganizeAiSuggestions(payload);
          if (response.status !== 200 || !response.data) throw new Error(response.msg || t('organize.actionFailed'));
          return {
            resourceType: payload.resourceType,
            payload,
            estimate: response.data as OrganizeAiSuggestionEstimate,
          } satisfies DraftEstimateEntry;
        }),
      );
      estimateEntries.value = responses;
      const nextRequestIds = { ...draftRequestIds.value };
      responses.forEach((entry) => {
        if (!nextRequestIds[entry.resourceType]) nextRequestIds[entry.resourceType] = generateUUID();
      });
      draftRequestIds.value = nextRequestIds;
      if (!draftGroupId.value) draftGroupId.value = nextRequestIds[responses[0].resourceType]!;
      lastDraftWasEstimated.value = true;
      if (responses.some((entry) => !entry.estimate.featureEnabled)) {
        createError.value = t('organize.aiSuggestions.featureDisabled');
      } else if (!responses.some((entry) => entry.estimate.canCreate)) {
        createError.value = t('organize.aiSuggestions.noEligibleResources');
      }
    } catch (error: any) {
      createError.value = errorMessage(error);
    } finally {
      estimating.value = false;
    }
  }

  async function createBatch() {
    const entries = estimateEntries.value.filter(
      (entry) =>
        entry.estimate.canCreate && entry.estimate.featureEnabled && !createdDraftTypes.value.has(entry.resourceType),
    );
    if (!entries.length || !canCreateDraft.value || creating.value) return;
    creating.value = true;
    createError.value = '';
    try {
      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const requestId = draftRequestIds.value[entry.resourceType] || generateUUID();
          draftRequestIds.value = { ...draftRequestIds.value, [entry.resourceType]: requestId };
          const response = await createOrganizeAiSuggestionBatch({
            requestId,
            groupId: draftGroupId.value,
            ...entry.payload,
          });
          if (response.status !== 200 || !response.data) throw new Error(response.msg || t('organize.actionFailed'));
          return response.data as OrganizeAiSuggestionBatch;
        }),
      );
      const created = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      created.forEach((batch) => {
        createdDraftTypes.value = new Set([...createdDraftTypes.value, batch.resourceType]);
        upsertBatch(batch, true);
      });
      if (created[0]) {
        cancelEditing();
        activeBatchId.value = created[0].id;
        activeBatch.value = created[0];
      }
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        createError.value = t('organize.aiSuggestions.partialCreateFailed', {
          succeeded: created.length,
          failed: failed.length,
        });
        schedulePolling();
        return;
      }
      try {
        sessionStorage.removeItem(ORGANIZE_AI_SEED_KEY);
      } catch {
        // 批次已经由服务端幂等创建；本地缓存清理失败不能把成功结果伪装成失败。
      }
      selectionSeed.value = null;
      draftResourceTypes.value = ['bookmark', 'note'];
      draftScope.value = 'untagged';
      resetEstimate();
      createDrawerOpen.value = false;
      message.success(t('organize.aiSuggestions.batchCreated', { count: created.length }));
      schedulePolling();
    } catch (error: any) {
      createError.value = errorMessage(error);
    } finally {
      creating.value = false;
    }
  }

  async function loadBatches(reset: boolean) {
    if ((reset && batchesLoading.value) || (!reset && batchesLoadingMore.value)) return;
    const sequence = ++batchListSequence;
    if (reset) batchesLoading.value = true;
    else batchesLoadingMore.value = true;
    batchesError.value = false;
    try {
      const response = await getOrganizeAiSuggestionBatches({
        cursor: reset ? null : batchesNextCursor.value,
        limit: 12,
      });
      if (sequence !== batchListSequence) return;
      if (response.status !== 200 || !response.data) throw new Error(response.msg || t('organize.actionFailed'));
      const result = response.data as OrganizeAiSuggestionBatchList;
      const incoming = Array.isArray(result.items) ? result.items : [];
      // 历史分页刷新不能移除仍在审核的整组成员，否则其他类型会从工作区消失。
      batches.value = mergeBatches(reset ? runBatches.value : batches.value, incoming);
      batchesNextCursor.value = result.nextCursor || null;
      if (!activeBatchId.value && batches.value[0]) await selectBatch(batches.value[0].id);
    } catch {
      if (sequence === batchListSequence) batchesError.value = true;
    } finally {
      if (sequence === batchListSequence) {
        batchesLoading.value = false;
        batchesLoadingMore.value = false;
      }
    }
  }

  async function selectBatch(batchId: string) {
    if (!batchId || mutatingSuggestionIds.value.size) return;
    expandedReasonIds.value = new Set();
    activeBatchId.value = batchId;
    activeBatch.value = batches.value.find((item) => item.id === batchId) || null;
    cancelEditing();
    runSequence += 1;
    runSummaryError.value = false;
    await refreshWorkspace();
  }

  async function loadBatchDetail(batchId: string, options: { append?: boolean; silent?: boolean } = {}) {
    if (!batchId) return;
    const sequence = ++batchDetailSequence;
    if (options.append) detailLoadingMore.value = true;
    else if (!options.silent) detailLoading.value = true;
    detailError.value = false;
    try {
      const response = await getOrganizeAiSuggestionBatch(batchId, {
        cursor: options.append ? activeBatch.value?.nextCursor : null,
        limit: 30,
      });
      if (sequence !== batchDetailSequence || activeBatchId.value !== batchId) return;
      if (response.status !== 200 || !response.data) throw new Error(response.msg || t('organize.actionFailed'));
      const incoming = response.data as OrganizeAiSuggestionBatch;
      if (options.append && activeBatch.value?.id === incoming.id) {
        incoming.suggestions = mergeSuggestions(activeBatch.value.suggestions || [], incoming.suggestions || []);
      }
      activeBatch.value = incoming;
      upsertBatch(incoming);
      schedulePolling();
    } catch {
      if (sequence === batchDetailSequence) detailError.value = true;
      schedulePolling(5000);
    } finally {
      if (sequence === batchDetailSequence) {
        detailLoading.value = false;
        detailLoadingMore.value = false;
      }
    }
  }

  function loadMoreSuggestions() {
    if (!activeBatch.value?.nextCursor || detailLoadingMore.value) return;
    void loadBatchDetail(activeBatch.value.id, { append: true });
  }

  function schedulePolling(delay = 2400) {
    stopPolling();
    if (!activeBatch.value || (!isRunRunning.value && !runSummaryError.value && !detailError.value) || document.hidden)
      return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      if (activeBatch.value) void refreshWorkspace(true);
    }, delay);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function handleVisibilityChange() {
    if (document.hidden) stopPolling();
    else schedulePolling(200);
  }

  function startEditing(suggestion: OrganizeAiSuggestion) {
    editingSuggestionId.value = suggestion.id;
    editingTags.value =
      suggestion.status === 'no_suggestion' ? [] : displayedTags(suggestion).map((tag) => ({ ...tag }));
  }

  function cancelEditing() {
    editingSuggestionId.value = '';
    editingTags.value = [];
  }

  async function acceptSuggestion(suggestion: OrganizeAiSuggestion, tags?: OrganizeAiSuggestionTag[]) {
    if (!activeBatch.value) return;
    await mutateSuggestion(suggestion, async () => {
      const response = await acceptOrganizeAiSuggestion(
        activeBatch.value!.id,
        suggestion.id,
        tags ? { tags } : undefined,
      );
      if (response.status !== 200 || !response.data) throw responseError(response);
      replaceSuggestion(response.data as OrganizeAiSuggestion);
      cancelEditing();
      message.success(t('organize.aiSuggestions.accepted'));
      emit('refresh-summary');
      await loadBatchDetail(activeBatch.value!.id, { silent: true });
    });
  }

  async function ignoreSuggestion(suggestion: OrganizeAiSuggestion) {
    if (!activeBatch.value) return;
    await mutateSuggestion(suggestion, async () => {
      const response = await ignoreOrganizeAiSuggestion(activeBatch.value!.id, suggestion.id);
      if (response.status !== 200 || !response.data) throw responseError(response);
      replaceSuggestion(response.data as OrganizeAiSuggestion);
      message.success(t('organize.aiSuggestions.ignored'));
      await loadBatchDetail(activeBatch.value!.id, { silent: true });
    });
  }

  async function mutateSuggestion(suggestion: OrganizeAiSuggestion, action: () => Promise<void>) {
    if (mutatingSuggestionIds.value.has(suggestion.id)) return;
    mutatingSuggestionIds.value = new Set([...mutatingSuggestionIds.value, suggestion.id]);
    try {
      await action();
    } catch (error: any) {
      message.error(errorMessage(error));
      if (Number(error?.status || error?.response?.status || 0) === 409 && activeBatch.value) {
        await loadBatchDetail(activeBatch.value.id);
      }
    } finally {
      const next = new Set(mutatingSuggestionIds.value);
      next.delete(suggestion.id);
      mutatingSuggestionIds.value = next;
    }
  }

  function replaceSuggestion(nextSuggestion: OrganizeAiSuggestion) {
    if (!activeBatch.value) return;
    const suggestions = (activeBatch.value.suggestions || []).map((item) =>
      item.id === nextSuggestion.id ? nextSuggestion : item,
    );
    activeBatch.value = { ...activeBatch.value, suggestions };
  }

  function upsertBatch(batch: OrganizeAiSuggestionBatch, first = false) {
    const next = batches.value.filter((item) => item.id !== batch.id);
    batches.value = first ? [batch, ...next] : mergeBatches([batch], next);
  }

  function mergeBatches(current: OrganizeAiSuggestionBatch[], incoming: OrganizeAiSuggestionBatch[]) {
    const values = new Map(current.map((item) => [item.id, item]));
    incoming.forEach((item) => values.set(item.id, item));
    return [...values.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  function mergeSuggestions(current: OrganizeAiSuggestion[], incoming: OrganizeAiSuggestion[]) {
    const values = new Map(current.map((item) => [item.id, item]));
    incoming.forEach((item) => values.set(item.id, item));
    return [...values.values()];
  }

  function displayedTags(suggestion: OrganizeAiSuggestion) {
    return suggestion.status === 'accepted' && suggestion.acceptedTags?.length
      ? suggestion.acceptedTags.map((tag) => ({ ...tag, source: 'existing' as const }))
      : suggestion.recommendedTags;
  }

  function formatTokenRange(value: OrganizeAiSuggestionEstimate) {
    const formatter = new Intl.NumberFormat(locale.value);
    return `${formatter.format(value.estimate.estimatedTokensLower)}–${formatter.format(value.estimate.estimatedTokensUpper)} tokens`;
  }

  function formatDate(value?: string | null, full = false) {
    if (!value) return t('organize.unknownTime');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('organize.unknownTime');
    return new Intl.DateTimeFormat(locale.value, {
      ...(full
        ? { dateStyle: 'medium' as const, timeStyle: 'short' as const }
        : { month: 'short' as const, day: 'numeric' as const, hour: '2-digit' as const, minute: '2-digit' as const }),
    }).format(date);
  }

  function batchTitle(batch: OrganizeAiSuggestionBatch) {
    return t('organize.aiSuggestions.batchTitle', {
      type: resourceTypeLabel(batch.resourceType),
      count: batch.progress.total,
    });
  }

  function batchProgressLabel(batch: OrganizeAiSuggestionBatch) {
    return t('organize.aiSuggestions.batchProgress', {
      processed: batch.progress.processed,
      total: batch.progress.total,
      ready: batch.progress.ready,
    });
  }

  function batchStatusLabel(status: OrganizeAiSuggestionBatchStatus) {
    return t(`organize.aiSuggestions.batchStatus.${status}`);
  }

  function suggestionStatusLabel(status: OrganizeAiSuggestionStatus) {
    return t(`organize.aiSuggestions.suggestionStatus.${status}`);
  }

  function resourceTypeLabel(type: OrganizeAiSuggestionResourceType) {
    return t(`resourceCenter.types.${type}`);
  }

  function errorMessage(error: any) {
    return String(error?.response?.data?.msg || error?.message || t('organize.actionFailed'));
  }

  function responseError(response: { status?: number; msg?: string; data?: { code?: string } }) {
    return Object.assign(new Error(response.msg || t('organize.actionFailed')), {
      status: Number(response.status || 500),
      code: String(response.data?.code || ''),
    });
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void loadBatches(true);
  });

  onBeforeUnmount(() => {
    stopPolling();
    batchListSequence += 1;
    batchDetailSequence += 1;
    runSequence += 1;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<style scoped lang="less">
  .organize-ai-resource-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .organize-ai-resource-tabs > .b_btn {
    display: flex;
    flex: 1 1 220px;
    max-width: 420px;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    height: auto;
    min-height: 66px;
    line-height: 1.45;
    padding: 12px 16px;
    border: 1px solid var(--surface-border-color);
    border-left: 3px solid transparent;
    background: transparent;
    color: var(--text-color);
    text-align: left;
  }
  .organize-ai-resource-tabs > .b_btn.is-active {
    border-left-color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }
  .organize-ai-resource-tabs > .b_btn:hover,
  .organize-ai-resource-tabs > .b_btn:focus-visible {
    border-color: var(--focus-ring-color);
  }
  .organize-ai-resource-tabs__copy {
    display: grid;
    gap: 4px;
    margin-right: auto;
  }
  .organize-ai-resource-tabs small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .organize-ai-suggestions {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 24px;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .organize-ai-suggestions__heading,
  .organize-ai-review__heading,
  .organize-ai-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }

  .organize-ai-suggestions__heading {
    flex: 0 0 auto;
    h2 {
      margin: 0 0 8px;
      font-size: 22px;
      line-height: 1.35;
      color: var(--text-color);
    }
    p {
      margin: 0;
      color: var(--desc-color);
      font-size: 13px;
      line-height: 1.6;
    }
    > .b_btn {
      gap: 7px;
      height: 36px;
    }
  }

  .organize-ai-current-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 17px;
    color: var(--text-color);
  }

  .organize-ai-review {
    flex: 0 0 auto;
    min-width: 0;
    overflow: visible;
    box-shadow: none;
  }

  .organize-ai-review__heading {
    padding: 20px 24px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .organize-ai-review__context {
    min-width: 0;
  }
  .organize-ai-review__summary {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-color);
  }

  .organize-ai-batch-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 6px 0 0 29px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .organize-ai-batches {
    width: 340px;
    max-width: 78vw;
    padding: 8px;
    box-sizing: border-box;
  }
  .organize-ai-section-heading {
    padding: 4px 8px 10px;
    font-size: 13px;
    color: var(--text-color);
  }
  .organize-ai-batch-list {
    max-height: 360px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .organize-ai-batch-item.b_btn {
    width: 100%;
    height: auto;
    min-height: 64px;
    padding: 11px 12px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid transparent;
    border-left: 3px solid transparent;
    border-radius: 7px;
    background: transparent;
    text-align: left;
    line-height: 1.45;
    &.is-active {
      border-left-color: var(--primary-color);
      background: var(--workspace-panel-bg-color);
    }
  }
  .organize-ai-batch-item__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .organize-ai-batch-item__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    color: var(--text-color);
  }
  .organize-ai-batch-item__copy small {
    font-size: 11px;
    color: var(--desc-color);
  }
  .organize-ai-batch-item__state {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .organize-ai-resource-icon {
    color: var(--resource-bookmark-color);
    flex-shrink: 0;
  }
  .organize-ai-resource-icon.is-note {
    color: var(--resource-note-color);
  }
  .organize-ai-suggestions .b_btn:focus-visible,
  .organize-ai-batches .b_btn:focus-visible,
  .organize-ai-create-card .b_btn:focus-visible {
    outline-color: var(--focus-ring-color);
  }
  .organize-ai-muted {
    color: var(--desc-color);
  }

  .organize-ai-suggestion-list {
    display: flex;
    flex-direction: column;
    padding: 0 24px;
  }
  .organize-ai-suggestion {
    padding: 20px 0;
    display: grid;
    gap: 10px;
    min-width: 0;
    + .organize-ai-suggestion {
      border-top: 1px solid var(--surface-divider-color);
    }
    &.is-editing {
      border-left: 2px solid var(--primary-color);
      padding-left: 14px;
    }
  }
  .organize-ai-suggestion__resource {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    > strong {
      color: var(--text-color);
      font-size: 14px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
  }
  .organize-ai-suggestion__body {
    padding-left: 30px;
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 12px 24px;
    min-width: 0;
  }
  .organize-ai-suggestion__details {
    flex: 1 1 360px;
    min-width: 0;
    display: grid;
    gap: 8px;
  }
  .organize-ai-tag-change {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    line-height: 1.5;
  }
  .organize-ai-tag-candidate {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
  }
  .organize-ai-reason {
    display: flex;
    align-items: start;
    gap: 8px;
    p {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--desc-color);
      overflow-wrap: anywhere;
    }
    p:not(.is-expanded) {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .b_btn {
      flex-shrink: 0;
    }
  }
  .organize-ai-suggestion__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
  }
  .organize-ai-text-action.b_btn {
    background: transparent;
    color: var(--desc-color);
  }
  .organize-ai-apply-action.b_btn {
    background: transparent;
    border: 1px solid var(--focus-ring-color);
    color: var(--text-color);
    height: 30px;
    line-height: 28px;
    padding: 0 12px;
  }
  .organize-ai-suggestion__editor {
    display: grid;
    gap: 8px;
    max-width: 560px;
    font-size: 12px;
    color: var(--text-color);
  }
  .organize-ai-suggestion__editor small {
    color: var(--desc-color);
  }
  .organize-ai-suggestion__editor small.is-error,
  .organize-ai-conflict,
  .organize-ai-batch-item__state .is-failed,
  .organize-ai-batch-item__state .is-partial {
    color: var(--danger-color);
  }
  .organize-ai-batch-item__state .is-completed {
    color: var(--success-color);
  }
  .organize-ai-batch-item__state .is-cancelled {
    color: var(--desc-color);
  }
  .organize-ai-conflict {
    display: flex;
    align-items: start;
    gap: 6px;
    font-size: 12px;
    line-height: 1.6;
  }
  .organize-ai-progress {
    display: grid;
    gap: 8px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--surface-divider-color);
    font-size: 12px;
    color: var(--desc-color);
  }
  .organize-ai-inline-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    margin: 12px;
    border: 1px solid var(--danger-color);
    border-radius: 8px;
    color: var(--danger-color);
    font-size: 12px;
  }
  .organize-ai-loading {
    padding: 20px 24px;
  }
  .organize-ai-skeleton {
    display: grid;
    gap: 12px;
    padding: 24px 30px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .organize-ai-skeleton span {
    height: 12px;
    width: 35%;
    border-radius: 4px;
    background: var(--workspace-panel-bg-color);
  }
  .organize-ai-skeleton span:nth-child(2) {
    width: 20%;
  }
  .organize-ai-skeleton span:nth-child(3) {
    width: 65%;
  }
  .organize-ai-state {
    min-height: 200px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
  }
  .organize-ai-state strong {
    color: var(--text-color);
    font-size: 15px;
  }
  .organize-ai-state p {
    margin: 0;
  }
  .organize-ai-state.is-error {
    color: var(--danger-color);
  }
  .organize-ai-load-more.b_btn {
    margin: 14px auto;
  }

  .organize-ai-create-card {
    display: grid;
    gap: 24px;
    color: var(--text-color);
  }
  .organize-ai-create-description {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }
  .organize-ai-create-card__steps {
    margin: 0;
    padding: 0 0 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    list-style: none;
    border-bottom: 1px solid var(--surface-divider-color);
    font-size: 13px;
    color: var(--desc-color);
    li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 1px solid var(--surface-border-color);
      border-radius: 50%;
      font-size: 12px;
    }
    .is-active {
      color: var(--text-color);
      font-weight: 600;
    }
    .is-active span {
      border-color: var(--primary-color);
      background: var(--primary-color);
      color: white;
    }
  }
  .organize-ai-create-card__fields {
    display: grid;
    gap: 24px;
  }
  .organize-ai-choice-group {
    display: grid;
    gap: 10px;
    font-size: 13px;
  }
  .organize-ai-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .organize-ai-choice-grid.is-scope-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .organize-ai-choice.b_btn {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 90px;
    padding: 14px 30px 14px 14px;
    display: flex;
    gap: 10px;
    align-items: start;
    justify-content: start;
    white-space: normal;
    text-align: left;
    line-height: 1.5;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    &.is-selected {
      border-color: var(--primary-color);
    }
  }
  .organize-ai-choice.is-scope.b_btn {
    min-height: 74px;
  }
  .organize-ai-choice__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--resource-bookmark-color);
  }
  .organize-ai-choice__icon.is-note {
    color: var(--resource-note-color);
  }
  .organize-ai-choice__copy {
    display: grid;
    gap: 5px;
  }
  .organize-ai-choice__copy strong {
    font-size: 13px;
    color: var(--text-color);
  }
  .organize-ai-choice__copy small {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .organize-ai-choice__check {
    position: absolute;
    right: 10px;
    top: 14px;
    color: var(--primary-color);
  }
  .organize-ai-estimate-action.b_btn {
    width: 100%;
    height: 40px;
  }
  .organize-ai-seed {
    display: flex;
    align-items: start;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    font-size: 12px;
  }
  .organize-ai-estimate {
    display: grid;
    gap: 20px;
  }
  .organize-ai-estimate__heading {
    display: flex;
    align-items: start;
    gap: 10px;
  }
  .organize-ai-estimate__heading > div {
    display: grid;
    gap: 6px;
  }
  .organize-ai-estimate__heading small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .organize-ai-estimate__icon {
    color: var(--primary-color);
  }
  .organize-ai-estimate__breakdown {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }
  .organize-ai-estimate__type {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .organize-ai-estimate__type > span:nth-child(2) {
    display: grid;
    gap: 4px;
  }
  .organize-ai-estimate__type small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .organize-ai-estimate__metrics {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 16px;
  }
  .organize-ai-estimate__metrics > div {
    display: grid;
    align-content: start;
    gap: 8px;
  }
  .organize-ai-estimate__metrics strong {
    font-size: 22px;
    overflow-wrap: anywhere;
  }
  .organize-ai-estimate__metrics span,
  .organize-ai-estimate__metrics small {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .organize-ai-estimate__guard {
    display: flex;
    align-items: start;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
    margin: 0;
  }
  .organize-ai-estimate > .b_btn {
    width: 100%;
    height: 40px;
  }
  .organize-ai-back.b_btn {
    padding-left: 0;
  }
  .organize-ai-create-card .organize-ai-state {
    min-height: 0;
    padding: 12px;
    border: 1px solid var(--danger-color);
    border-radius: 8px;
  }
  @media (hover: hover) and (pointer: fine) {
    .organize-ai-text-action.b_btn:hover,
    .organize-ai-batch-trigger.b_btn:hover {
      background: var(--workspace-panel-bg-color);
      color: var(--text-color);
    }
    .organize-ai-apply-action.b_btn:hover {
      background: var(--primary-color);
      color: white;
    }
    .organize-ai-batch-item.b_btn:hover {
      background: var(--workspace-panel-bg-color);
    }
    .organize-ai-choice.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--card-background);
    }
  }
</style>
