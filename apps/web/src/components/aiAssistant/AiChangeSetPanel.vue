<template>
  <section class="ai-change-set" :aria-label="t('ai.changeSet.title')">
    <aside class="ai-change-set__rail">
      <BCard variant="panel" padding="10px" radius="10px" class="ai-change-set__composer">
        <div class="ai-change-set__composer-heading">
          <span>
            <strong>{{ t('ai.changeSet.proposal.title') }}</strong>
            <small>{{ t('ai.changeSet.proposal.materials', { count: proposalContexts.length }) }}</small>
          </span>
          <SvgIcon :src="icon.ai.organize" size="16" aria-hidden="true" />
        </div>
        <BInput
          v-model:value="instruction"
          type="textarea"
          :rows="3"
          :maxlength="2000"
          :placeholder="t('ai.changeSet.proposal.placeholder')"
        />
        <small v-if="!proposalContexts.length" class="ai-change-set__composer-hint">
          {{ t('ai.changeSet.proposal.noMaterials') }}
        </small>
        <small v-else class="ai-change-set__composer-hint">
          {{ t('ai.changeSet.proposal.safety') }}
        </small>
        <BButton
          type="primary"
          :disabled="!canPropose"
          :loading="proposing"
          class="ai-change-set__propose"
          @click="propose"
        >
          {{ t('ai.changeSet.proposal.generate') }}
        </BButton>
      </BCard>

      <div class="ai-change-set__rail-heading">
        <div>
          <strong>{{ t('ai.changeSet.title') }}</strong>
          <small>{{ t('ai.changeSet.subtitle') }}</small>
        </div>
        <BButton :aria-label="t('common.refresh')" :loading="loadingList" @click="loadList">
          <SvgIcon :src="icon.ai.messageRetry" size="14" aria-hidden="true" />
        </BButton>
      </div>
      <BTabs v-model:active-tab="filter" variant="pill" :options="filterOptions" />
      <div v-if="loadingList" class="ai-change-set__empty"><BLoading inline loading /></div>
      <div v-else-if="!changeSets.length" class="ai-change-set__empty">
        <SvgIcon :src="icon.ai.organize" size="25" aria-hidden="true" />
        <span>{{ t('ai.changeSet.empty') }}</span>
      </div>
      <div v-else class="ai-change-set__list">
        <BButton
          v-for="item in changeSets"
          :key="item.id"
          :class="['ai-change-set__list-item', { 'is-active': item.id === active?.id }]"
          @click="open(item.id)"
        >
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ t(`ai.changeSet.status.${item.status}`) }} · {{ formatDate(item.updatedAt) }}</small>
          </span>
          <em :class="`is-${item.riskLevel}`">{{ t(`ai.changeSet.risk.${item.riskLevel}`) }}</em>
        </BButton>
      </div>
    </aside>

    <main class="ai-change-set__main">
      <div v-if="loadingSet" class="ai-change-set__main-state"><BLoading inline loading /></div>
      <div v-else-if="!active" class="ai-change-set__main-state">
        <SvgIcon :src="icon.ai.organize" size="32" aria-hidden="true" />
        <strong>{{ t('ai.changeSet.select') }}</strong>
        <small>{{ t('ai.changeSet.selectHint') }}</small>
      </div>
      <template v-else>
        <header class="ai-change-set__header">
          <div>
            <span class="ai-change-set__risk" :class="`is-${active.riskLevel}`">
              {{ t('ai.changeSet.riskLabel', { level: t(`ai.changeSet.risk.${active.riskLevel}`) }) }}
            </span>
            <h2>{{ active.title }}</h2>
            <p>{{ active.summary || t('ai.changeSet.noSummary') }}</p>
          </div>
          <div class="ai-change-set__header-actions">
            <BButton
              v-if="active.status === 'draft' && !active.retry"
              type="primary"
              :disabled="!selectedIds.length"
              :loading="mutating"
              @click="confirmApply"
            >
              {{ t('ai.changeSet.applySelected', { count: selectedIds.length }) }}
            </BButton>
            <BButton
              v-else-if="active.status === 'draft' && active.retry?.state === 'failed'"
              type="primary"
              :loading="mutating"
              @click="revalidateRetry"
            >
              {{ t('ai.changeSet.retry.revalidate') }}
            </BButton>
            <BButton
              v-else-if="active.status === 'draft' && active.retry?.state === 'ready'"
              type="primary"
              :loading="mutating"
              @click="confirmRetry"
            >
              {{ t('ai.changeSet.retry.confirm', { count: active.retry.selectedCount }) }}
            </BButton>
            <BButton v-if="active.status === 'applied'" :loading="mutating" @click="confirmUndo">
              {{ t('ai.changeSet.undo') }}
            </BButton>
          </div>
        </header>

        <BCard variant="panel" padding="10px" radius="10px" class="ai-change-set__notice">
          <SvgIcon :src="noticeIcon" size="15" aria-hidden="true" />
          <span>
            <strong>{{ statusNotice.title }}</strong>
            <small>{{ statusNotice.description }}</small>
          </span>
        </BCard>

        <BCard
          v-if="showBatchProgress"
          variant="panel"
          padding="10px"
          radius="10px"
          class="ai-change-set__batch"
          role="status"
          aria-live="polite"
        >
          <BLoading v-if="batchIsRunning" inline loading />
          <SvgIcon v-else :src="batchProgressIcon" size="15" aria-hidden="true" />
          <span>
            <strong>{{ batchProgressTitle }}</strong>
            <small>{{ batchProgressDescription }}</small>
          </span>
          <em>{{ t('ai.changeSet.batch.committed', { count: batchCommittedCount, total: batchTotal }) }}</em>
        </BCard>

        <div v-if="active.status === 'draft'" class="ai-change-set__selection-toolbar">
          <BCheckbox
            v-if="!active.retry"
            :checked="allSelected"
            :indeterminate="selectedIds.length > 0 && !allSelected"
            @change="toggleAll"
          >
            {{ t('ai.changeSet.selectAll') }}
          </BCheckbox>
          <span v-if="active.retry">
            {{ t('ai.changeSet.retry.frozenScope', { count: active.retry.selectedCount }) }}
          </span>
          <span v-else>
            {{ t('ai.changeSet.selectionSummary', { selected: selectedIds.length, total: active.items.length }) }}
          </span>
        </div>

        <div class="ai-change-set__items">
          <BCard
            v-for="(item, index) in active.items"
            :key="item.id"
            as="article"
            variant="card"
            padding="12px"
            radius="11px"
            :class="['ai-change-set__item', `is-${item.status}`]"
          >
            <div class="ai-change-set__item-heading">
              <BCheckbox
                v-if="active.status === 'draft' && !active.retry"
                :checked="selectedIds.includes(item.id)"
                @change="(checked) => toggleItem(item.id, checked)"
              />
              <span class="ai-change-set__item-number">{{ index + 1 }}</span>
              <span>
                <strong>{{ t(`ai.changeSet.operations.${item.operation}`) }}</strong>
                <small>{{ resourceLabel(item) }}</small>
              </span>
              <span class="ai-change-set__item-status" :class="`is-${item.status}`">
                {{ t(`ai.changeSet.itemStatus.${item.status}`) }}
              </span>
              <span v-if="active.retry?.selectedItemIds.includes(item.id)" class="ai-change-set__retry-scope">
                {{ t('ai.changeSet.retry.inScope') }}
              </span>
              <BButton
                v-if="active.status === 'draft' && item.operation !== 'update_note_content'"
                class="ai-change-set__edit"
                :aria-label="t('common.edit')"
                @click="toggleEdit(item)"
              >
                <SvgIcon :src="icon.ai.messageEdit" size="14" aria-hidden="true" />
              </BButton>
            </div>

            <p v-if="item.reason" class="ai-change-set__reason">{{ item.reason }}</p>

            <div v-if="editingId !== item.id" class="ai-change-set__diff">
              <div>
                <span>{{ t('ai.changeSet.before') }}</span>
                <code>{{ summarizeValue(item.operation, item.before) }}</code>
              </div>
              <SvgIcon :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
              <div>
                <span>{{ t('ai.changeSet.after') }}</span>
                <code>{{ summarizeValue(item.operation, item.after) }}</code>
              </div>
            </div>

            <div v-else class="ai-change-set__editor">
              <template v-if="item.operation === 'set_tags'">
                <label>{{ t('ai.changeSet.fields.tagIds') }}</label>
                <BInput v-model:value="editDraft.tagIds" :placeholder="t('ai.changeSet.fields.tagIdsPlaceholder')" />
              </template>
              <template v-else-if="item.operation === 'move_file'">
                <label>{{ t('ai.changeSet.fields.folderId') }}</label>
                <BInput
                  v-model:value="editDraft.folderId"
                  :maxlength="16"
                  :placeholder="t('ai.changeSet.fields.folderIdPlaceholder')"
                />
                <small class="ai-change-set__field-hint">{{ t('ai.changeSet.fields.folderIdHint') }}</small>
              </template>
              <template v-else-if="item.operation === 'update_note_metadata'">
                <label>{{ t('ai.changeSet.fields.title') }}</label>
                <BInput v-model:value="editDraft.title" :maxlength="255" />
              </template>
              <template v-else-if="item.operation === 'update_bookmark_metadata'">
                <label>{{ t('ai.changeSet.fields.name') }}</label>
                <BInput v-model:value="editDraft.name" :maxlength="255" />
                <label>{{ t('ai.changeSet.fields.description') }}</label>
                <BInput v-model:value="editDraft.description" type="textarea" :rows="2" :maxlength="255" />
              </template>
              <template v-else>
                <label>{{ t('ai.changeSet.fields.title') }}</label>
                <BInput v-model:value="editDraft.title" :maxlength="200" />
                <label>{{ t('ai.changeSet.fields.description') }}</label>
                <BInput v-model:value="editDraft.description" type="textarea" :rows="2" :maxlength="2000" />
              </template>
              <label>{{ t('ai.changeSet.reason') }}</label>
              <BInput v-model:value="editDraft.reason" type="textarea" :rows="2" :maxlength="500" />
              <div class="ai-change-set__editor-actions">
                <BButton @click="cancelEdit">{{ t('common.cancel') }}</BButton>
                <BButton type="primary" :loading="mutating" @click="saveItem(item)">{{ t('common.save') }}</BButton>
              </div>
            </div>

            <div v-if="item.receipt" class="ai-change-set__receipt">
              <SvgIcon :src="icon.filterPanel.check" size="14" aria-hidden="true" />
              <span>
                <strong>{{ t('ai.changeSet.receipt') }}</strong>
                <small>{{ receiptSummary(item) }}</small>
              </span>
            </div>
            <p v-if="item.error" class="ai-change-set__error" role="alert">
              {{ t('ai.changeSet.itemFailed', { code: item.error.code || 'AI_CHANGE_ITEM_FAILED' }) }}
            </p>
          </BCard>
        </div>
      </template>
    </main>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import { recordAiProductEvent } from '@/api/aiTelemetry';
  import {
    applyAiChangeSet,
    getAiChangeSet,
    listAiChangeSets,
    proposeAiChangeSet,
    revalidateAiChangeSetRetry,
    retryAiChangeSet,
    undoAiChangeSet,
    updateAiChangeSet,
    type AiChangeItem,
    type AiChangeSet,
  } from '@/api/aiWorkspaceApi';
  import { parseMoveFileFolderId, resolveAiChangeSetListTarget } from './aiUiContracts';

  const props = withDefaults(
    defineProps<{
      initialId?: string;
      conversationId?: string;
      contexts?: Array<{ type: string; id: string; title?: string }>;
      initialInstruction?: string;
    }>(),
    { contexts: () => [] },
  );
  const emit = defineEmits<{ applied: [changeSet: AiChangeSet]; undone: [changeSet: AiChangeSet] }>();
  const { t, locale } = useI18n();
  const changeSets = ref<AiChangeSet[]>([]);
  const active = ref<AiChangeSet | null>(null);
  const filter = ref<AiChangeSet['status']>('draft');
  const loadingList = ref(false);
  const loadingSet = ref(false);
  const mutating = ref(false);
  const selectedIds = ref<string[]>([]);
  const editingId = ref('');
  const editDraft = reactive<Record<string, string>>({});
  const instruction = ref(props.initialInstruction || '');
  const proposing = ref(false);
  type BatchPhase = 'idle' | 'validating' | 'applying' | 'revalidating' | 'ready' | 'completed' | 'failed';
  const batchPhase = ref<BatchPhase>('idle');
  const batchSelectedCount = ref(0);
  const batchErrorCode = ref('');

  const proposalContexts = computed(() =>
    props.contexts
      .filter((item) => ['note', 'bookmark', 'file'].includes(item.type) && String(item.id || '').trim())
      .slice(0, 20)
      .map((item) => ({ type: item.type as 'note' | 'bookmark' | 'file', id: String(item.id) })),
  );
  const canPropose = computed(() => Boolean(instruction.value.trim() && proposalContexts.value.length));

  const filterOptions = computed(() => [
    { key: 'draft', label: t('ai.changeSet.filters.pending') },
    { key: 'applied', label: t('ai.changeSet.filters.applied') },
    { key: 'undone', label: t('ai.changeSet.filters.undone') },
  ]);
  const allSelected = computed(
    () => Boolean(active.value?.items.length) && selectedIds.value.length === active.value?.items.length,
  );
  const noticeIcon = computed(() => (active.value?.status === 'draft' ? icon.message.warning : icon.message.info));
  const statusNotice = computed(() => {
    const status = active.value?.status || 'draft';
    if (status === 'draft' && active.value?.retry) {
      const retryState = active.value.retry.state;
      return {
        title: t(`ai.changeSet.retry.notice.${retryState}.title`),
        description: t(`ai.changeSet.retry.notice.${retryState}.description`),
      };
    }
    return {
      title: t(`ai.changeSet.notice.${status}.title`),
      description: t(`ai.changeSet.notice.${status}.description`),
    };
  });
  const effectiveBatchPhase = computed<BatchPhase>(() => {
    if (batchPhase.value !== 'idle') return batchPhase.value;
    if (active.value?.retry?.state === 'failed') return 'failed';
    if (active.value?.retry?.state === 'ready') return 'ready';
    return 'idle';
  });
  const showBatchProgress = computed(() => effectiveBatchPhase.value !== 'idle');
  const batchIsRunning = computed(() => ['validating', 'applying', 'revalidating'].includes(effectiveBatchPhase.value));
  const batchTotal = computed(
    () => active.value?.retry?.selectedCount || batchSelectedCount.value || selectedIds.value.length,
  );
  const batchCommittedCount = computed(() => (effectiveBatchPhase.value === 'completed' ? batchTotal.value : 0));
  const batchProgressIcon = computed(() =>
    effectiveBatchPhase.value === 'failed' ? icon.message.warning : icon.message.info,
  );
  const batchProgressTitle = computed(() => t(`ai.changeSet.batch.phase.${effectiveBatchPhase.value}.title`));
  const batchProgressDescription = computed(() => {
    const retry = active.value?.retry;
    if (effectiveBatchPhase.value === 'failed') {
      return t('ai.changeSet.batch.phase.failed.description', {
        code: retry?.errorCode || batchErrorCode.value || 'AI_CHANGE_APPLY_FAILED',
        processed: retry?.processedCount || 0,
        count: retry?.selectedCount || batchTotal.value,
      });
    }
    if (effectiveBatchPhase.value === 'ready') {
      return t('ai.changeSet.batch.phase.ready.description', { count: retry?.selectedCount || batchTotal.value });
    }
    return t(`ai.changeSet.batch.phase.${effectiveBatchPhase.value}.description`, { count: batchTotal.value });
  });

  async function loadList() {
    loadingList.value = true;
    try {
      const result = await listAiChangeSets({ status: filter.value, limit: 30 });
      changeSets.value = result.items;
      const target = resolveAiChangeSetListTarget(changeSets.value, props.initialId, active.value?.id);
      if (active.value && !changeSets.value.some((item) => item.id === active.value?.id)) active.value = null;
      if (target && (!active.value || active.value.id !== target)) await open(target);
      if (!changeSets.value.length) active.value = null;
    } catch {
      message.warning(t('ai.changeSet.loadFailed'));
    } finally {
      loadingList.value = false;
    }
  }

  async function propose() {
    if (!canPropose.value || proposing.value) return;
    proposing.value = true;
    try {
      const proposed = await proposeAiChangeSet({
        instruction: instruction.value.trim(),
        contexts: proposalContexts.value,
        conversationId: props.conversationId || undefined,
        requestId: globalThis.crypto?.randomUUID?.(),
      });
      filter.value = 'draft';
      active.value = proposed;
      selectedIds.value = proposed.items.map((item) => item.id);
      batchPhase.value = 'idle';
      batchSelectedCount.value = 0;
      batchErrorCode.value = '';
      changeSets.value = [proposed, ...changeSets.value.filter((item) => item.id !== proposed.id)];
      void recordAiProductEvent('ai_change_previewed', {
        surface: 'workspace',
        mode: 'organize',
        changeSetId: proposed.id,
        itemCount: proposed.items.length,
        materialCount: proposalContexts.value.length,
        outcome: 'success',
      });
      message.success(t('ai.changeSet.proposal.generated'));
    } catch {
      message.warning(t('ai.changeSet.proposal.failed'));
    } finally {
      proposing.value = false;
    }
  }

  async function open(id: string) {
    loadingSet.value = true;
    try {
      active.value = await getAiChangeSet(id);
      selectedIds.value =
        active.value.status === 'draft'
          ? active.value.retry?.selectedItemIds || active.value.items.map((item) => item.id)
          : active.value.selection || [];
      batchPhase.value = 'idle';
      batchSelectedCount.value = 0;
      batchErrorCode.value = '';
      cancelEdit();
      if (active.value.status === 'draft') {
        void recordAiProductEvent('ai_change_previewed', {
          surface: 'workspace',
          mode: 'organize',
          changeSetId: active.value.id,
          itemCount: active.value.items.length,
        });
      }
    } catch {
      message.warning(t('ai.changeSet.loadFailed'));
    } finally {
      loadingSet.value = false;
    }
  }

  function toggleAll(checked: boolean) {
    selectedIds.value = checked ? active.value?.items.map((item) => item.id) || [] : [];
  }

  function toggleItem(id: string, checked: boolean) {
    selectedIds.value = checked
      ? [...new Set([...selectedIds.value, id])]
      : selectedIds.value.filter((itemId) => itemId !== id);
  }

  function toggleEdit(item: AiChangeItem) {
    if (editingId.value === item.id) {
      cancelEdit();
      void recordAiProductEvent('ai_change_edited', {
        surface: 'workspace',
        mode: 'organize',
        changeSetId: active.value.id,
        itemCount: 1,
      });
      return;
    }
    editingId.value = item.id;
    Object.keys(editDraft).forEach((key) => delete editDraft[key]);
    const after = item.after || {};
    editDraft.reason = item.reason || '';
    editDraft.tagIds = Array.isArray(after.tagIds) ? after.tagIds.join(', ') : '';
    editDraft.folderId = after.folderId == null ? '' : String(after.folderId);
    editDraft.title = String(after.title || '');
    editDraft.name = String(after.name || '');
    editDraft.description = String(after.description || '');
  }

  function cancelEdit() {
    editingId.value = '';
    Object.keys(editDraft).forEach((key) => delete editDraft[key]);
  }

  function editedAfter(item: AiChangeItem) {
    if (item.operation === 'set_tags') {
      return {
        tagIds: [
          ...new Set(
            String(editDraft.tagIds || '')
              .split(/[,，\s]+/u)
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ],
      };
    }
    if (item.operation === 'move_file') return { folderId: parseMoveFileFolderId(editDraft.folderId) ?? null };
    if (item.operation === 'update_note_metadata') return { title: String(editDraft.title || '').trim() };
    if (item.operation === 'update_bookmark_metadata') {
      return { name: String(editDraft.name || '').trim(), description: String(editDraft.description || '').trim() };
    }
    return {
      ...item.after,
      title: String(editDraft.title || '').trim(),
      description: String(editDraft.description || '').trim(),
    };
  }

  async function saveItem(item: AiChangeItem) {
    if (!active.value) return;
    if (item.operation === 'move_file' && parseMoveFileFolderId(editDraft.folderId) === undefined) {
      message.warning(t('ai.changeSet.fields.folderIdInvalid'));
      return;
    }
    mutating.value = true;
    try {
      active.value = await updateAiChangeSet(active.value.id, {
        items: [{ id: item.id, after: editedAfter(item), reason: String(editDraft.reason || '').trim() }],
      });
      selectedIds.value = selectedIds.value.filter((id) =>
        active.value?.items.some((candidate) => candidate.id === id),
      );
      batchPhase.value = 'idle';
      batchSelectedCount.value = 0;
      batchErrorCode.value = '';
      cancelEdit();
      message.success(t('ai.changeSet.updated'));
    } catch {
      message.warning(t('ai.changeSet.updateFailed'));
    } finally {
      mutating.value = false;
    }
  }

  function confirmApply() {
    if (!active.value || !selectedIds.value.length) return;
    Alert.alert({
      title: t('ai.changeSet.confirmTitle'),
      content: t('ai.changeSet.confirmContent', { count: selectedIds.value.length, title: active.value.title }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('ai.changeSet.confirmApply'),
          type: 'primary',
          function: () => {
            Alert.destroy();
            if (active.value) {
              void recordAiProductEvent('ai_change_confirmed', {
                surface: 'workspace',
                mode: 'organize',
                actionType: 'confirm',
                changeSetId: active.value.id,
                selectedCount: selectedIds.value.length,
              });
            }
            void applySelected();
          },
        },
      ],
    });
  }

  async function applySelected() {
    if (!active.value) return;
    mutating.value = true;
    batchSelectedCount.value = selectedIds.value.length;
    batchErrorCode.value = '';
    batchPhase.value = 'validating';
    try {
      await nextTick();
      batchPhase.value = 'applying';
      active.value = await applyAiChangeSet(active.value.id, selectedIds.value);
      batchPhase.value = 'completed';
      syncActive();
      emit('applied', active.value);
      void recordAiProductEvent('ai_change_succeeded', {
        surface: 'workspace',
        mode: 'organize',
        actionType: 'apply',
        changeSetId: active.value.id,
        selectedCount: selectedIds.value.length,
        outcome: 'success',
      });
      message.success(t('ai.changeSet.appliedSuccess'));
    } catch (error) {
      await showApplyFailure(error);
    } finally {
      mutating.value = false;
    }
  }

  function confirmRetry() {
    if (!active.value?.retry || active.value.retry.state !== 'ready') return;
    Alert.alert({
      title: t('ai.changeSet.retry.confirmTitle'),
      content: t('ai.changeSet.retry.confirmContent', {
        count: active.value.retry.selectedCount,
        title: active.value.title,
      }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('ai.changeSet.retry.confirmApply'),
          type: 'primary',
          function: () => {
            Alert.destroy();
            void retryFailedBatch();
          },
        },
      ],
    });
  }

  async function revalidateRetry() {
    if (!active.value?.retry || mutating.value) return;
    mutating.value = true;
    batchSelectedCount.value = active.value.retry.selectedCount;
    batchErrorCode.value = active.value.retry.errorCode || '';
    batchPhase.value = 'revalidating';
    try {
      active.value = await revalidateAiChangeSetRetry(active.value.id);
      selectedIds.value = active.value.retry?.selectedItemIds || [];
      batchPhase.value = 'ready';
      message.success(t('ai.changeSet.retry.revalidated'));
    } catch (error) {
      batchPhase.value = 'failed';
      batchErrorCode.value = changeErrorCode(error);
      message.warning(t('ai.changeSet.retry.revalidateFailed', { code: batchErrorCode.value }));
    } finally {
      mutating.value = false;
    }
  }

  async function retryFailedBatch() {
    if (!active.value?.retry || active.value.retry.state !== 'ready' || mutating.value) return;
    mutating.value = true;
    batchSelectedCount.value = active.value.retry.selectedCount;
    batchErrorCode.value = '';
    batchPhase.value = 'validating';
    try {
      await nextTick();
      batchPhase.value = 'applying';
      active.value = await retryAiChangeSet(active.value.id, active.value.previewRevision);
      selectedIds.value = active.value.selection || [];
      batchPhase.value = 'completed';
      syncActive();
      emit('applied', active.value);
      void recordAiProductEvent('ai_change_succeeded', {
        surface: 'workspace',
        mode: 'organize',
        actionType: 'retry',
        changeSetId: active.value.id,
        selectedCount: batchSelectedCount.value,
        outcome: 'success',
      });
      message.success(t('ai.changeSet.retry.succeeded'));
    } catch (error) {
      await showApplyFailure(error);
    } finally {
      mutating.value = false;
    }
  }

  function changeErrorCode(error: unknown) {
    const code = String((error as { code?: string })?.code || 'AI_CHANGE_APPLY_FAILED');
    return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : 'AI_CHANGE_APPLY_FAILED';
  }

  async function showApplyFailure(error: unknown) {
    batchErrorCode.value = changeErrorCode(error);
    batchPhase.value = 'failed';
    if (active.value) {
      try {
        active.value = await getAiChangeSet(active.value.id);
        selectedIds.value = active.value.retry?.selectedItemIds || selectedIds.value;
        batchSelectedCount.value = active.value.retry?.selectedCount || batchSelectedCount.value;
        batchErrorCode.value = active.value.retry?.errorCode || batchErrorCode.value;
      } catch {
        // Keep the local stable error code when the diagnostic snapshot cannot be reloaded.
      }
    }
    message.warning(t('ai.changeSet.applyFailedWithCode', { code: batchErrorCode.value }));
  }

  function confirmUndo() {
    if (!active.value) return;
    Alert.alert({
      title: t('ai.changeSet.undoTitle'),
      content: t('ai.changeSet.undoContent', { title: active.value.title }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('ai.changeSet.undo'),
          type: 'primary',
          function: () => {
            Alert.destroy();
            void undo();
          },
        },
      ],
    });
  }

  async function undo() {
    if (!active.value) return;
    mutating.value = true;
    try {
      active.value = await undoAiChangeSet(active.value.id);
      syncActive();
      emit('undone', active.value);
      void recordAiProductEvent('ai_change_undone', {
        surface: 'workspace',
        mode: 'organize',
        actionType: 'undo',
        changeSetId: active.value.id,
        outcome: 'success',
      });
      message.success(t('ai.changeSet.undoneSuccess'));
    } catch {
      message.warning(t('ai.changeSet.undoFailed'));
    } finally {
      mutating.value = false;
    }
  }

  function syncActive() {
    if (!active.value) return;
    changeSets.value = changeSets.value.filter((item) => item.id !== active.value?.id);
  }

  function resourceLabel(item: AiChangeItem) {
    return `${t(`ai.sourceTypes.${item.resourceType}`)} · ${item.resourceId}`;
  }

  function summarizeValue(operation: AiChangeItem['operation'], value: Record<string, unknown> | null) {
    if (!value) return t('ai.changeSet.none');
    if (operation === 'set_tags') return ((value.tagIds as unknown[]) || []).join(', ') || t('ai.changeSet.noTags');
    if (operation === 'move_file')
      return value.folderId == null ? t('ai.changeSet.rootFolder') : String(value.folderId);
    if (operation === 'update_note_metadata') return String(value.title || '—');
    if (operation === 'update_note_content') {
      return t('ai.changeSet.contentChars', { count: String(value.content || '').length });
    }
    if (operation === 'update_bookmark_metadata')
      return [value.name, value.description].filter(Boolean).join(' · ') || '—';
    return [value.title, value.description].filter(Boolean).join(' · ') || '—';
  }

  function receiptSummary(item: AiChangeItem) {
    const created = item.receipt?.createdResourceId;
    if (item.receipt?.noop) return t('ai.changeSet.noopReceipt');
    return created ? t('ai.changeSet.createdResource', { id: created }) : t('ai.changeSet.executedWithVersionCheck');
  }

  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale.value, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
  }

  watch(filter, () => void loadList());
  watch(
    () => props.initialInstruction,
    (value) => {
      if (value && !instruction.value.trim()) instruction.value = value;
    },
  );
  onMounted(() => void loadList());
</script>

<style scoped lang="less">
  .ai-change-set {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    grid-template-columns: minmax(230px, 28%) minmax(0, 1fr);
    overflow: hidden;
    background: var(--background-color);
  }

  .ai-change-set__rail {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    overflow: hidden;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }

  .ai-change-set__rail-heading,
  .ai-change-set__composer-heading,
  .ai-change-set__header,
  .ai-change-set__item-heading,
  .ai-change-set__selection-toolbar,
  .ai-change-set__editor-actions,
  .ai-change-set__receipt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ai-change-set__rail-heading > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-change-set__composer {
    display: grid;
    flex: 0 0 auto;
    gap: 8px;
  }

  .ai-change-set__composer-heading {
    color: var(--primary-color);
  }

  .ai-change-set__composer-heading > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-change-set__composer-heading strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-change-set__composer-heading small,
  .ai-change-set__composer-hint {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.45;
  }

  .ai-change-set__composer-hint {
    min-height: 26px;
  }

  .ai-change-set__propose {
    width: 100%;
    min-height: 36px;
  }

  .ai-change-set__rail-heading strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-change-set__rail-heading small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .ai-change-set__rail-heading button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
  }

  .ai-change-set__list {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 5px;
    overflow-y: auto;
  }

  .ai-change-set__list-item {
    width: 100%;
    height: auto;
    justify-content: space-between;
    gap: 7px;
    padding: 9px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    text-align: left;
  }

  .ai-change-set__list-item.is-active {
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }

  .ai-change-set__list-item > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .ai-change-set__list-item strong,
  .ai-change-set__list-item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-change-set__list-item strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-change-set__list-item small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .ai-change-set__list-item em,
  .ai-change-set__risk,
  .ai-change-set__item-status {
    display: inline-flex;
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    color: var(--primary-color);
    font-size: 8px;
    font-style: normal;
    font-weight: 700;
  }

  .ai-change-set__list-item em.is-medium,
  .ai-change-set__risk.is-medium {
    background: color-mix(in srgb, var(--warning-color, #c47f17) 9%, var(--card-background));
    color: var(--warning-color, #c47f17);
  }

  .ai-change-set__main {
    display: grid;
    min-width: 0;
    min-height: 0;
    align-content: start;
    gap: 12px;
    padding: clamp(12px, 2vw, 24px);
    overflow-y: auto;
  }

  .ai-change-set__main > * {
    width: min(100%, 980px);
    margin-inline: auto;
  }

  .ai-change-set__main-state,
  .ai-change-set__empty {
    display: grid;
    min-height: 180px;
    place-items: center;
    align-content: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 10px;
    text-align: center;
  }

  .ai-change-set__main-state strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .ai-change-set__header {
    align-items: flex-start;
  }

  .ai-change-set__header h2 {
    margin: 7px 0 3px;
    color: var(--text-color);
    font-size: 20px;
  }

  .ai-change-set__header p {
    max-width: 72ch;
    margin: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .ai-change-set__header-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
  }

  .ai-change-set__notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--primary-color);
  }

  .ai-change-set__batch {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    color: var(--primary-color);
  }

  .ai-change-set__batch > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-change-set__batch strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-change-set__batch small {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.5;
  }

  .ai-change-set__batch em {
    padding: 3px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    color: var(--primary-color);
    font-size: 9px;
    font-style: normal;
    font-weight: 700;
    white-space: nowrap;
  }

  .ai-change-set__notice > span,
  .ai-change-set__receipt > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-change-set__notice strong,
  .ai-change-set__receipt strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-change-set__notice small,
  .ai-change-set__receipt small {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.5;
  }

  .ai-change-set__selection-toolbar {
    justify-content: flex-start;
    color: var(--desc-color);
    font-size: 10px;
  }

  .ai-change-set__items {
    display: grid;
    gap: 8px;
  }

  .ai-change-set__item {
    display: grid;
    gap: 9px;
  }

  .ai-change-set__item.is-failed {
    --b-card-border-color: color-mix(in srgb, var(--danger-color, #d14343) 30%, var(--surface-border-color));
  }

  .ai-change-set__item-heading {
    justify-content: flex-start;
  }

  .ai-change-set__item-heading > span:not(.ai-change-set__item-number):not(.ai-change-set__item-status) {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-change-set__item-heading strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-change-set__item-heading small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .ai-change-set__item-number {
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
    color: var(--primary-color);
    font-size: 9px;
    font-weight: 700;
  }

  .ai-change-set__item-status {
    margin-left: auto;
  }

  .ai-change-set__retry-scope {
    display: inline-flex;
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning-color, #c47f17) 10%, var(--card-background));
    color: var(--warning-color, #c47f17);
    font-size: 8px;
    font-weight: 700;
  }

  .ai-change-set__edit {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--desc-color);
  }

  .ai-change-set__reason {
    margin: 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .ai-change-set__diff {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
  }

  .ai-change-set__diff > div {
    display: grid;
    gap: 4px;
  }

  .ai-change-set__diff span {
    font-size: 9px;
    font-weight: 650;
  }

  .ai-change-set__diff code {
    min-height: 34px;
    padding: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
    color: var(--text-color);
    font-family: inherit;
    font-size: 10px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .ai-change-set__editor {
    display: grid;
    gap: 6px;
    padding: 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--surface-border-color));
    border-radius: 9px;
    background: color-mix(in srgb, var(--primary-color) 3%, var(--workspace-panel-bg-color));
  }

  .ai-change-set__editor label {
    color: var(--text-color);
    font-size: 10px;
    font-weight: 650;
  }

  .ai-change-set__field-hint {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }

  .ai-change-set__editor-actions {
    justify-content: flex-end;
  }

  .ai-change-set__receipt {
    justify-content: flex-start;
    color: var(--success-color, #2e8b57);
  }

  .ai-change-set__error {
    margin: 0;
    color: var(--danger-color, #d14343);
    font-size: 10px;
  }

  @media (max-width: 760px) {
    .ai-change-set {
      display: flex;
      overflow-y: auto;
      flex-direction: column;
    }

    .ai-change-set__rail {
      min-height: 150px;
      max-height: 440px;
      border-right: 0;
      border-bottom: 1px solid var(--surface-border-color);
    }

    .ai-change-set__propose {
      min-height: 44px;
    }

    .ai-change-set__rail-heading button,
    .ai-change-set__edit {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }

    .ai-change-set__main {
      overflow: visible;
    }

    .ai-change-set__header {
      display: grid;
    }

    .ai-change-set__header-actions,
    .ai-change-set__header-actions > button {
      width: 100%;
    }

    .ai-change-set__header-actions > button {
      min-height: 44px;
    }

    .ai-change-set__batch {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .ai-change-set__batch em {
      grid-column: 2;
      justify-self: start;
    }

    .ai-change-set__diff {
      grid-template-columns: 1fr;
    }

    .ai-change-set__diff > svg {
      transform: rotate(90deg);
    }
  }
</style>
