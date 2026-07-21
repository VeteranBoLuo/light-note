<template>
  <div class="ai-result-actions" :aria-label="t('ai.resultActions.title')">
    <BTooltip :title="t('ai.resultActions.helpful')">
      <BButton
        class="ai-result-actions__button"
        :class="{ 'is-active': feedback?.rating === 'helpful' }"
        :aria-label="t('ai.resultActions.helpful')"
        :aria-pressed="feedback?.rating === 'helpful'"
        :disabled="busy || !messageId"
        @click="rateHelpful"
      >
        <SvgIcon :src="icon.ai.feedbackUp" size="15" aria-hidden="true" />
      </BButton>
    </BTooltip>
    <BTooltip :title="t('ai.resultActions.unhelpful')">
      <BButton
        class="ai-result-actions__button"
        :class="{ 'is-active': feedback?.rating === 'unhelpful' }"
        :aria-label="t('ai.resultActions.unhelpful')"
        :aria-pressed="feedback?.rating === 'unhelpful'"
        :disabled="busy || !messageId"
        @click="feedbackVisible = true"
      >
        <SvgIcon :src="icon.ai.feedbackDown" size="15" aria-hidden="true" />
      </BButton>
    </BTooltip>
    <BButton class="ai-result-actions__text" :disabled="busy || !messageId" @click="openReuse('create')">
      <SvgIcon :src="icon.noteDetail.saveLine" size="14" aria-hidden="true" />
      {{ t('ai.resultActions.saveNewNote') }}
    </BButton>
    <BButton class="ai-result-actions__text" :disabled="busy || !messageId" @click="openReuse('append')">
      <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
      {{ t('ai.resultActions.appendNote') }}
    </BButton>
    <BButton class="ai-result-actions__text" :disabled="busy || !messageId" @click="openReuse('merge')">
      <SvgIcon :src="icon.ai.summary" size="14" aria-hidden="true" />
      {{ t('ai.resultActions.mergeNote') }}
    </BButton>

    <BModal
      v-model:visible="feedbackVisible"
      :title="t('ai.resultActions.feedbackTitle')"
      width="min(480px, 92vw)"
      :show-footer="false"
    >
      <div class="ai-feedback-form">
        <label>{{ t('ai.resultActions.feedbackReason') }}</label>
        <BSelect
          v-model:value="feedbackReason"
          :options="reasonOptions"
          :aria-label="t('ai.resultActions.feedbackReason')"
        />
        <label>{{ t('ai.resultActions.feedbackComment') }}</label>
        <BInput
          v-model:value="feedbackComment"
          type="textarea"
          :rows="3"
          :maxlength="500"
          :placeholder="t('ai.resultActions.feedbackPlaceholder')"
        />
        <div class="ai-feedback-form__actions">
          <BButton @click="feedbackVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="submitting" @click="submitNegativeFeedback">
            {{ t('common.confirm') }}
          </BButton>
        </div>
      </div>
    </BModal>

    <BModal
      v-model:visible="reuseVisible"
      :title="reuseTitle"
      width="min(620px, 94vw)"
      :show-footer="false"
      :mask-closable="!reuseBusy"
    >
      <div class="ai-result-reuse">
        <BCard variant="panel" padding="12px" class="ai-result-reuse__mode">
          <SvgIcon :src="reuseIcon" size="18" aria-hidden="true" />
          <span>
            <strong>{{ t(`ai.resultActions.reuse.mode.${reuseMode}.title`) }}</strong>
            <small>{{ t(`ai.resultActions.reuse.mode.${reuseMode}.description`) }}</small>
          </span>
        </BCard>

        <template v-if="!reuseResult">
          <template v-if="reuseMode === 'create'">
            <label>{{ t('ai.resultActions.reuse.noteTitle') }}</label>
            <BInput
              v-model:value="noteTitle"
              :maxlength="255"
              :placeholder="t('ai.resultActions.reuse.noteTitlePlaceholder')"
            />
            <BCard variant="card" padding="12px" class="ai-result-reuse__preview">
              <strong>{{ t('ai.resultActions.reuse.previewTitle') }}</strong>
              <p>
                {{
                  t('ai.resultActions.reuse.createSummary', {
                    chars: contentLength || 0,
                    sources: sourceCount || 0,
                    evidence: evidenceCount || 0,
                  })
                }}
              </p>
              <small>{{ t('ai.resultActions.reuse.createUndoHint') }}</small>
            </BCard>
          </template>

          <template v-else>
            <BCard v-if="reuseMode === 'selection'" variant="card" padding="12px" class="ai-result-reuse__selection">
              <div class="ai-result-reuse__selection-heading">
                <span>
                  <strong>{{ t('ai.resultActions.reuse.selectionTitle') }}</strong>
                  <small>
                    {{
                      t('ai.resultActions.reuse.selectionAnswerSummary', {
                        chars: content?.length || contentLength || 0,
                      })
                    }}
                  </small>
                </span>
                <span class="ai-result-reuse__selection-tools">
                  <BButton :disabled="blocksLoading || !reusableBlocks.length" @click="selectAllBlocks">
                    {{ t('ai.resultActions.reuse.selectAllBlocks') }}
                  </BButton>
                  <BButton :disabled="blocksLoading || !selectedBlockIds.length" @click="clearSelectedBlocks">
                    {{ t('ai.resultActions.reuse.clearSelectedBlocks') }}
                  </BButton>
                </span>
              </div>
              <p class="ai-result-reuse__selection-hint">{{ t('ai.resultActions.reuse.selectionHint') }}</p>
              <BLoading v-if="blocksLoading" inline loading :title="t('common.loading')" />
              <div
                v-else-if="reusableBlocks.length"
                class="ai-result-reuse__blocks"
                role="group"
                :aria-label="t('ai.resultActions.reuse.selectionTitle')"
              >
                <BCheckbox
                  v-for="block in reusableBlocks"
                  :key="block.id"
                  class="ai-result-reuse__block"
                  :class="{ 'is-selected': selectedBlockIds.includes(block.id) }"
                  :model-value="selectedBlockIds.includes(block.id)"
                  @update:model-value="(checked) => toggleReusableBlock(block.id, checked)"
                >
                  <span class="ai-result-reuse__block-copy">
                    <strong>{{ block.title || t('ai.resultActions.reuse.untitledBlock') }}</strong>
                    <span>{{ block.preview }}</span>
                    <small>
                      {{
                        t('ai.resultActions.reuse.blockMeta', {
                          chars: block.charCount,
                          citations: block.citationKeys.length,
                        })
                      }}
                    </small>
                  </span>
                </BCheckbox>
              </div>
              <p v-else class="ai-result-reuse__empty">{{ t('ai.resultActions.reuse.noReusableBlocks') }}</p>
              <p class="ai-result-reuse__selection-count" aria-live="polite">
                {{
                  t('ai.resultActions.reuse.selectionCount', {
                    selected: selectedBlockIds.length,
                    total: reusableBlocks.length,
                  })
                }}
              </p>
            </BCard>

            <label>{{ t('ai.resultActions.reuse.searchTarget') }}</label>
            <BInput
              v-model:value="targetKeyword"
              clearable
              :placeholder="t('ai.resultActions.reuse.searchTargetPlaceholder')"
              @input="scheduleTargetSearch"
            />
            <label>{{ t('ai.resultActions.reuse.targetNote') }}</label>
            <BLoading v-if="targetLoading" inline loading :title="t('common.loading')" />
            <BSelect
              v-else
              v-model:value="targetNoteId"
              :options="targetOptions"
              :placeholder="t('ai.resultActions.reuse.selectTarget')"
              :aria-label="t('ai.resultActions.reuse.targetNote')"
            />
            <p v-if="!targetLoading && !targetOptions.length" class="ai-result-reuse__empty">
              {{ t('ai.resultActions.reuse.noTargets') }}
            </p>

            <BCard v-if="prepared" variant="card" padding="12px" class="ai-result-reuse__preview">
              <strong>{{ t('ai.resultActions.reuse.previewTitle') }}</strong>
              <dl>
                <div>
                  <dt>{{ t('ai.resultActions.reuse.targetNote') }}</dt>
                  <dd>{{ prepared.preview.target.title }}</dd>
                </div>
                <div>
                  <dt>{{ t('ai.resultActions.reuse.contentSize') }}</dt>
                  <dd>
                    {{
                      t('ai.resultActions.reuse.sizeChange', {
                        before: prepared.preview.beforeLength,
                        after: prepared.preview.afterLength,
                        added: prepared.preview.addedLength,
                      })
                    }}
                  </dd>
                </div>
                <div v-if="reuseMode === 'merge'">
                  <dt>{{ t('ai.resultActions.reuse.deduplication') }}</dt>
                  <dd>
                    {{
                      t('ai.resultActions.reuse.mergeBlocks', {
                        added: prepared.preview.uniqueBlockCount || 0,
                        skipped: prepared.preview.duplicateBlockCount || 0,
                      })
                    }}
                  </dd>
                </div>
                <div v-if="reuseMode === 'selection'">
                  <dt>{{ t('ai.resultActions.reuse.selectedBlocks') }}</dt>
                  <dd>
                    {{
                      t('ai.resultActions.reuse.selectionPreview', {
                        selected: prepared.preview.selectedBlockCount || 0,
                        total: prepared.preview.totalBlockCount || 0,
                        citations: prepared.preview.selectedCitationCount || 0,
                      })
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('ai.resultActions.reuse.sources') }}</dt>
                  <dd>
                    {{
                      t('ai.resultActions.reuse.sourceSummary', {
                        sources: prepared.preview.sourceCount,
                        evidence: prepared.preview.evidenceCount,
                      })
                    }}
                  </dd>
                </div>
              </dl>
              <small>{{ t('ai.resultActions.reuse.versionUndoHint') }}</small>
            </BCard>
          </template>

          <div class="ai-result-reuse__actions">
            <BButton :disabled="reuseBusy" @click="reuseVisible = false">{{ t('common.cancel') }}</BButton>
            <BButton
              v-if="reuseMode !== 'create' && !prepared"
              type="primary"
              :loading="preparing"
              :disabled="!canPrepare || targetLoading"
              @click="prepareReuse"
            >
              {{ t('ai.resultActions.reuse.generatePreview') }}
            </BButton>
            <BButton
              v-else
              type="primary"
              :loading="saving || applying"
              :disabled="reuseMode !== 'create' && !prepared"
              @click="confirmReuse"
            >
              {{ t('ai.resultActions.reuse.confirmAction') }}
            </BButton>
          </div>
        </template>

        <template v-else>
          <BCard variant="raised" padding="14px" class="ai-result-reuse__receipt" role="status">
            <SvgIcon :src="icon.filterPanel.check" size="20" aria-hidden="true" />
            <span>
              <strong>{{ reuseResultTitle }}</strong>
              <small>{{ reuseResultSummary }}</small>
            </span>
          </BCard>
          <p v-if="reuseResult.kind === 'create'" class="ai-result-reuse__undo-hint">
            {{ t('ai.resultActions.reuse.createUndoHint') }}
          </p>
          <p v-else class="ai-result-reuse__undo-hint">
            {{
              reuseResult.status === 'undone'
                ? t('ai.resultActions.reuse.undoCompleted')
                : t('ai.resultActions.reuse.undoAvailable')
            }}
          </p>
          <div class="ai-result-reuse__actions">
            <BButton
              v-if="reuseResult.kind === 'change' && reuseResult.status === 'applied'"
              :loading="undoing"
              @click="confirmUndo"
            >
              <SvgIcon :src="icon.noteDetail.history" size="14" aria-hidden="true" />
              {{ t('ai.resultActions.reuse.undo') }}
            </BButton>
            <BButton v-if="reuseResult.noteId" @click="openResultNote">
              <SvgIcon :src="icon.ai.sourceExternal" size="14" aria-hidden="true" />
              {{ t('ai.resultActions.reuse.openNote') }}
            </BButton>
            <BButton type="primary" @click="reuseVisible = false">{{ t('ai.resultActions.reuse.done') }}</BButton>
          </div>
        </template>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import {
    applyAiChangeSet,
    branchAiConversation,
    listAiResultReusableBlocks,
    listAiResultNoteTargets,
    prepareAiResultNoteReuse,
    saveAiMessageAsNote,
    submitAiFeedback,
    undoAiChangeSet,
    type AiCreateNoteReceipt,
    type AiResultReusableBlock,
    type AiResultNoteReusePreview,
    type AiResultNoteTarget,
  } from '@/api/aiWorkspaceApi';

  type FeedbackReason =
    'incorrect' | 'unsupported' | 'outdated' | 'irrelevant' | 'unsafe_action' | 'hard_to_use' | 'other';
  type ReuseMode = 'create' | 'append' | 'merge' | 'selection';
  type PreparedReuse = { changeSetId: string; preview: AiResultNoteReusePreview };
  type ReuseResult =
    | { kind: 'create'; noteId: string; title: string; receipt: AiCreateNoteReceipt }
    | { kind: 'change'; noteId: string; title: string; changeSetId: string; status: 'applied' | 'undone' };

  const props = defineProps<{
    conversationId: string;
    messageId?: string;
    feedback?: { rating: 'helpful' | 'unhelpful'; reason?: string; resolved?: boolean | null };
    busy?: boolean;
    contentLength?: number;
    content?: string;
    sourceCount?: number;
    evidenceCount?: number;
  }>();
  const emit = defineEmits<{
    feedback: [value: { rating: 'helpful' | 'unhelpful'; reason?: string; resolved?: boolean }];
    saved: [note: { id: string; title: string }];
    reused: [value: { mode: ReuseMode; noteId: string; changeSetId?: string; status: 'applied' | 'undone' }];
    branched: [conversationId: string];
  }>();
  const { t } = useI18n();
  const router = useRouter();
  const saving = ref(false);
  const branching = ref(false);
  const submitting = ref(false);
  const feedbackVisible = ref(false);
  const feedbackReason = ref<FeedbackReason>('incorrect');
  const feedbackComment = ref('');
  const reuseVisible = ref(false);
  const reuseMode = ref<ReuseMode>('create');
  const noteTitle = ref('');
  const targetKeyword = ref('');
  const targetNoteId = ref('');
  const targets = ref<AiResultNoteTarget[]>([]);
  const selectedTargetCache = ref<AiResultNoteTarget | null>(null);
  const targetLoading = ref(false);
  const blocksLoading = ref(false);
  const reusableBlocks = ref<AiResultReusableBlock[]>([]);
  const selectedBlockIds = ref<string[]>([]);
  const preparing = ref(false);
  const applying = ref(false);
  const undoing = ref(false);
  const prepared = ref<PreparedReuse | null>(null);
  const reuseResult = ref<ReuseResult | null>(null);
  let targetSearchTimer: number | undefined;

  const reasonOptions = computed(() =>
    (['incorrect', 'unsupported', 'outdated', 'irrelevant', 'unsafe_action', 'hard_to_use', 'other'] as const).map(
      (value) => ({
        value,
        label: t(`ai.resultActions.reasons.${value}`),
      }),
    ),
  );
  const selectedTarget = computed(
    () =>
      targets.value.find((item) => item.id === targetNoteId.value) ||
      (selectedTargetCache.value?.id === targetNoteId.value ? selectedTargetCache.value : null),
  );
  const targetOptions = computed(() =>
    targets.value.map((item) => ({
      value: item.id,
      label: t('ai.resultActions.reuse.targetOption', { title: item.title, chars: item.contentLength }),
    })),
  );
  const reuseBusy = computed(
    () =>
      saving.value || preparing.value || applying.value || undoing.value || targetLoading.value || blocksLoading.value,
  );
  const canPrepare = computed(
    () =>
      Boolean(selectedTarget.value) &&
      (reuseMode.value !== 'selection' || (!blocksLoading.value && selectedBlockIds.value.length > 0)),
  );
  const reuseTitle = computed(() => t(`ai.resultActions.reuse.mode.${reuseMode.value}.title`));
  const reuseIcon = computed(() => {
    if (reuseMode.value === 'append') return icon.common.add;
    if (reuseMode.value === 'merge') return icon.ai.summary;
    if (reuseMode.value === 'selection') return icon.filterPanel.check;
    return icon.noteDetail.saveLine;
  });
  const reuseResultTitle = computed(() => {
    if (!reuseResult.value) return '';
    if (reuseResult.value.kind === 'create') return t('ai.resultActions.reuse.created');
    return reuseResult.value.status === 'undone'
      ? t('ai.resultActions.reuse.undone')
      : t(`ai.resultActions.reuse.${reuseMode.value}Applied`);
  });
  const reuseResultSummary = computed(() => {
    if (!reuseResult.value) return '';
    if (reuseResult.value.kind === 'create') {
      return t('ai.resultActions.reuse.createReceipt', {
        title: reuseResult.value.title,
        sources: reuseResult.value.receipt.sourceCount,
        evidence: reuseResult.value.receipt.evidenceCount,
      });
    }
    return t('ai.resultActions.reuse.changeReceipt', { title: reuseResult.value.title });
  });

  async function sendFeedback(input: {
    rating: 'helpful' | 'unhelpful';
    reason?: FeedbackReason;
    resolved?: boolean;
    comment?: string;
  }) {
    if (!props.conversationId || !props.messageId) return;
    await submitAiFeedback({ conversationId: props.conversationId, messageId: props.messageId, ...input });
    emit('feedback', input);
  }

  async function rateHelpful() {
    try {
      await sendFeedback({ rating: 'helpful', resolved: props.feedback?.resolved ?? undefined });
      message.success(t('ai.resultActions.feedbackSaved'));
    } catch {
      message.warning(t('ai.resultActions.feedbackFailed'));
    }
  }

  async function markResolved() {
    try {
      await sendFeedback({ rating: props.feedback?.rating || 'helpful', resolved: true });
      message.success(t('ai.resultActions.resolvedSaved'));
    } catch {
      message.warning(t('ai.resultActions.feedbackFailed'));
    }
  }

  async function submitNegativeFeedback() {
    submitting.value = true;
    try {
      await sendFeedback({
        rating: 'unhelpful',
        reason: feedbackReason.value,
        resolved: false,
        comment: feedbackComment.value.trim() || undefined,
      });
      feedbackVisible.value = false;
      feedbackComment.value = '';
      message.success(t('ai.resultActions.feedbackSaved'));
    } catch {
      message.warning(t('ai.resultActions.feedbackFailed'));
    } finally {
      submitting.value = false;
    }
  }

  function resetReuseState(mode: ReuseMode) {
    reuseMode.value = mode;
    noteTitle.value = '';
    targetKeyword.value = '';
    targetNoteId.value = '';
    targets.value = [];
    reusableBlocks.value = [];
    selectedBlockIds.value = [];
    selectedTargetCache.value = null;
    prepared.value = null;
    reuseResult.value = null;
  }

  function openReuse(mode: ReuseMode) {
    resetReuseState(mode);
    reuseVisible.value = true;
    if (mode !== 'create') void loadTargets('');
    if (mode === 'selection') void loadReusableBlocks();
  }

  async function loadReusableBlocks() {
    if (!props.messageId) return;
    blocksLoading.value = true;
    try {
      const result = await listAiResultReusableBlocks({
        conversationId: props.conversationId,
        messageId: props.messageId,
      });
      reusableBlocks.value = result.items;
      selectedBlockIds.value = selectedBlockIds.value.filter((id) => result.items.some((item) => item.id === id));
    } catch {
      reusableBlocks.value = [];
      selectedBlockIds.value = [];
      message.warning(t('ai.resultActions.reuse.blocksFailed'));
    } finally {
      blocksLoading.value = false;
    }
  }

  function toggleReusableBlock(blockId: string, checked: boolean) {
    const current = new Set(selectedBlockIds.value);
    if (checked) current.add(blockId);
    else current.delete(blockId);
    selectedBlockIds.value = reusableBlocks.value.filter((item) => current.has(item.id)).map((item) => item.id);
  }

  function selectAllBlocks() {
    selectedBlockIds.value = reusableBlocks.value.map((item) => item.id);
  }

  function clearSelectedBlocks() {
    selectedBlockIds.value = [];
  }

  async function loadTargets(keyword = targetKeyword.value) {
    targetLoading.value = true;
    try {
      const result = await listAiResultNoteTargets({ keyword: String(keyword || '').trim(), limit: 40 });
      targets.value = result.items;
    } catch {
      message.warning(t('ai.resultActions.reuse.targetsFailed'));
    } finally {
      targetLoading.value = false;
    }
  }

  function scheduleTargetSearch() {
    if (targetSearchTimer !== undefined) window.clearTimeout(targetSearchTimer);
    targetSearchTimer = window.setTimeout(() => void loadTargets(), 250);
  }

  async function prepareReuse() {
    if (!props.messageId || !selectedTarget.value || reuseMode.value === 'create') return;
    preparing.value = true;
    try {
      selectedTargetCache.value = selectedTarget.value;
      prepared.value = await prepareAiResultNoteReuse({
        conversationId: props.conversationId,
        messageId: props.messageId,
        mode: reuseMode.value,
        ...(reuseMode.value === 'selection' ? { selectedBlockIds: selectedBlockIds.value } : {}),
        targetNoteId: selectedTarget.value.id,
        targetVersion: selectedTarget.value.resourceVersion,
      });
    } catch (error: any) {
      if (['TARGET_VERSION_CONFLICT', 'CHANGE_CONFLICT'].includes(error?.code)) {
        message.warning(t('ai.resultActions.reuse.versionConflict'));
        prepared.value = null;
        await loadTargets();
      } else if (error?.code === 'NO_NEW_CONTENT') {
        message.info(t('ai.resultActions.reuse.noNewContent'));
      } else if (['RESULT_BLOCK_SELECTION_STALE', 'RESULT_BLOCK_SELECTION_INVALID'].includes(error?.code)) {
        prepared.value = null;
        message.warning(t('ai.resultActions.reuse.selectionStale'));
        await loadReusableBlocks();
      } else {
        message.warning(t('ai.resultActions.reuse.previewFailed'));
      }
    } finally {
      preparing.value = false;
    }
  }

  function confirmReuse() {
    const targetTitle =
      reuseMode.value === 'create'
        ? noteTitle.value.trim() || t('ai.resultActions.reuse.defaultTitle')
        : prepared.value?.preview.target.title;
    Alert.alert({
      title: t('ai.resultActions.reuse.confirmTitle'),
      content: t(`ai.resultActions.reuse.confirm.${reuseMode.value}`, { title: targetTitle }),
      okText: t('ai.resultActions.reuse.confirmAction'),
      cancelText: t('common.cancel'),
      onOk: () => void applyReuse(),
    });
  }

  async function applyReuse() {
    if (!props.messageId) return;
    if (reuseMode.value === 'create') {
      saving.value = true;
      try {
        const result = await saveAiMessageAsNote(
          props.conversationId,
          props.messageId,
          noteTitle.value.trim() || undefined,
        );
        reuseResult.value = {
          kind: 'create',
          noteId: result.note.id,
          title: result.note.title,
          receipt: result.receipt,
        };
        emit('saved', result.note);
        emit('reused', { mode: 'create', noteId: result.note.id, status: 'applied' });
        void recordOperation({ module: 'AI助手', operation: '保存 AI 回答为新笔记' });
        message.success(t('ai.resultActions.noteSaved'));
      } catch {
        message.warning(t('ai.resultActions.noteSaveFailed'));
      } finally {
        saving.value = false;
      }
      return;
    }

    if (!prepared.value) return;
    applying.value = true;
    try {
      const applied = await applyAiChangeSet(prepared.value.changeSetId, null);
      const target = prepared.value.preview.target;
      reuseResult.value = {
        kind: 'change',
        noteId: target.id,
        title: target.title,
        changeSetId: applied.id,
        status: 'applied',
      };
      emit('reused', { mode: reuseMode.value, noteId: target.id, changeSetId: applied.id, status: 'applied' });
      void recordOperation({
        module: 'AI助手',
        operation:
          reuseMode.value === 'append'
            ? '追加 AI 回答到笔记'
            : reuseMode.value === 'selection'
              ? '应用 AI 回答选段到笔记'
              : '合并 AI 回答到笔记',
      });
      message.success(t(`ai.resultActions.reuse.${reuseMode.value}Success`));
    } catch (error: any) {
      if (['CHANGE_CONFLICT', 'NOTE_VERSION_CONFLICT'].includes(error?.code)) {
        prepared.value = null;
        message.warning(t('ai.resultActions.reuse.versionConflict'));
        await loadTargets();
      } else {
        message.warning(t('ai.resultActions.reuse.applyFailed'));
      }
    } finally {
      applying.value = false;
    }
  }

  function confirmUndo() {
    if (reuseResult.value?.kind !== 'change') return;
    Alert.alert({
      title: t('ai.resultActions.reuse.undoTitle'),
      content: t('ai.resultActions.reuse.undoConfirm', { title: reuseResult.value.title }),
      okText: t('ai.resultActions.reuse.undo'),
      cancelText: t('common.cancel'),
      onOk: () => void undoReuse(),
    });
  }

  async function undoReuse() {
    if (reuseResult.value?.kind !== 'change') return;
    undoing.value = true;
    try {
      await undoAiChangeSet(reuseResult.value.changeSetId);
      reuseResult.value = { ...reuseResult.value, status: 'undone' };
      emit('reused', {
        mode: reuseMode.value,
        noteId: reuseResult.value.noteId,
        changeSetId: reuseResult.value.changeSetId,
        status: 'undone',
      });
      void recordOperation({ module: 'AI助手', operation: '撤销 AI 回答写入笔记' });
      message.success(t('ai.resultActions.reuse.undoSuccess'));
    } catch {
      message.warning(t('ai.resultActions.reuse.undoFailed'));
    } finally {
      undoing.value = false;
    }
  }

  function openResultNote() {
    if (!reuseResult.value?.noteId) return;
    reuseVisible.value = false;
    void router.push(`/noteLibrary/${encodeURIComponent(reuseResult.value.noteId)}`);
  }

  async function createBranch() {
    if (!props.conversationId) return;
    branching.value = true;
    try {
      const branched = await branchAiConversation(props.conversationId, props.messageId);
      emit('branched', branched.id);
      message.success(t('ai.resultActions.branchCreated'));
    } catch {
      message.warning(t('ai.resultActions.branchFailed'));
    } finally {
      branching.value = false;
    }
  }

  watch(targetNoteId, () => {
    if (prepared.value?.preview.target.id !== targetNoteId.value) prepared.value = null;
    const next = targets.value.find((item) => item.id === targetNoteId.value);
    if (next) selectedTargetCache.value = next;
  });

  watch(selectedBlockIds, () => {
    if (reuseMode.value === 'selection') prepared.value = null;
  });

  onBeforeUnmount(() => {
    if (targetSearchTimer !== undefined) window.clearTimeout(targetSearchTimer);
  });
</script>

<style scoped lang="less">
  .ai-result-actions {
    display: flex;
    width: min(760px, calc(100% - 44px));
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    margin: -8px 0 14px 44px;
  }

  .ai-result-actions__button,
  .ai-result-actions__text {
    min-width: 36px;
    min-height: 36px;
    gap: 5px;
    padding: 0 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
  }

  .ai-result-actions__button.is-active,
  .ai-result-actions__button:hover,
  .ai-result-actions__text:hover {
    border-color: color-mix(in srgb, var(--primary-color) 18%, transparent);
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    color: var(--primary-color);
  }

  .ai-feedback-form,
  .ai-result-reuse {
    display: grid;
    width: 100%;
    gap: 10px;
  }

  .ai-feedback-form label,
  .ai-result-reuse label {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 600;
  }

  .ai-feedback-form__actions,
  .ai-result-reuse__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }

  .ai-result-reuse__mode,
  .ai-result-reuse__receipt {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .ai-result-reuse__mode > span,
  .ai-result-reuse__receipt > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .ai-result-reuse__mode strong,
  .ai-result-reuse__preview strong,
  .ai-result-reuse__receipt strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .ai-result-reuse__mode small,
  .ai-result-reuse__preview small,
  .ai-result-reuse__receipt small,
  .ai-result-reuse__undo-hint,
  .ai-result-reuse__empty {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }

  .ai-result-reuse__preview {
    display: grid;
    gap: 8px;
  }

  .ai-result-reuse__selection {
    display: grid;
    gap: 9px;
  }

  .ai-result-reuse__selection-heading {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .ai-result-reuse__selection-heading > span:first-child {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .ai-result-reuse__selection-heading strong,
  .ai-result-reuse__block-copy strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-result-reuse__selection-heading small,
  .ai-result-reuse__block-copy small,
  .ai-result-reuse__selection-hint,
  .ai-result-reuse__selection-count {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .ai-result-reuse__selection-tools {
    display: flex;
    flex: none;
    gap: 6px;
  }

  .ai-result-reuse__selection-hint,
  .ai-result-reuse__selection-count {
    margin: 0;
  }

  .ai-result-reuse__blocks {
    display: grid;
    max-height: min(360px, 42vh);
    gap: 7px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .ai-result-reuse__block {
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    align-items: flex-start;
    padding: 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--card-background);
  }

  /* BCheckbox 的 __label 默认没有 min-width:0 / flex —— 作为 flex 子项不肯收缩到内容宽度以下,
     长的片段预览会把 label 撑宽,内容溢出卡片边框。让 label 填满剩余宽度并允许收缩,
     配合 __block-copy 的 min-width:0 + 预览行夹取,文字就规规矩矩留在卡片内。 */
  .ai-result-reuse__block :deep(.b-checkbox__label) {
    min-width: 0;
    flex: 1;
  }

  .ai-result-reuse__block.is-selected {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--card-border-color));
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }

  .ai-result-reuse__block-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .ai-result-reuse__block-copy > span {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-color);
    font-size: 11px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .ai-result-reuse__preview p,
  .ai-result-reuse__undo-hint,
  .ai-result-reuse__empty {
    margin: 0;
  }

  .ai-result-reuse__preview dl {
    display: grid;
    gap: 7px;
    margin: 0;
  }

  .ai-result-reuse__preview dl > div {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 10px;
  }

  .ai-result-reuse__preview dt {
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-result-reuse__preview dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-result-reuse__receipt {
    color: var(--resource-note-color);
  }

  @container ai-chat (max-width: 520px) {
    .ai-result-actions {
      width: 100%;
      margin: 0 0 12px;
    }

    .ai-result-actions__button,
    .ai-result-actions__text {
      min-height: 44px;
    }

    .ai-result-reuse__preview dl > div {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }

  @media (max-width: 600px), (pointer: coarse) {
    .ai-result-reuse__actions :deep(.b_btn),
    .ai-result-reuse__selection-tools :deep(.b_btn),
    .ai-result-reuse__block {
      min-height: 44px;
    }

    .ai-result-reuse__selection-heading {
      flex-direction: column;
    }

    .ai-result-reuse__selection-tools {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>
