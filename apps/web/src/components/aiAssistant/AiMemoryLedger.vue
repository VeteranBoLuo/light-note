<template>
  <section class="ai-memory-ledger" :aria-label="t('ai.memory.title')">
    <BCard variant="panel" padding="12px" radius="11px" class="ai-memory-ledger__privacy">
      <div>
        <SvgIcon :src="icon.ai.memory" size="17" aria-hidden="true" />
        <span>
          <strong>{{ t('ai.memory.temporarySession') }}</strong>
          <small>{{ t('ai.memory.temporarySessionHint') }}</small>
        </span>
      </div>
      <BSwitch :checked="temporarySession" @change="toggleTemporarySession" />
    </BCard>

    <div class="ai-memory-ledger__heading">
      <div>
        <strong>{{ t('ai.memory.ledger') }}</strong>
        <small>{{ t('ai.memory.description') }}</small>
      </div>
      <div class="ai-memory-ledger__heading-actions">
        <BButton class="is-danger" :loading="mutatingId === '__all__'" @click="confirmClearAll">
          <SvgIcon :src="icon.noteDetail.delete" size="13" aria-hidden="true" />
          {{ t('ai.memory.clearAll') }}
        </BButton>
        <BButton :aria-label="t('common.refresh')" :loading="loading" @click="load">
          <SvgIcon :src="icon.ai.messageRetry" size="14" aria-hidden="true" />
        </BButton>
      </div>
    </div>

    <BTabs v-model:active-tab="status" variant="pill" :options="statusOptions" />

    <div v-if="loading" class="ai-memory-ledger__state"><BLoading inline loading /></div>
    <div v-else-if="!memories.length" class="ai-memory-ledger__state">
      <SvgIcon :src="icon.ai.memory" size="28" aria-hidden="true" />
      <strong>{{ t('ai.memory.empty') }}</strong>
      <small>{{ t('ai.memory.emptyHint') }}</small>
    </div>
    <div v-else class="ai-memory-ledger__list">
      <BCard
        v-for="memory in memories"
        :key="memory.id"
        as="article"
        variant="card"
        padding="12px"
        radius="11px"
        :class="['ai-memory-ledger__item', `is-${memory.status}`]"
      >
        <div class="ai-memory-ledger__item-heading">
          <span class="ai-memory-ledger__type">
            <SvgIcon :src="memoryIcon(memory.memoryType)" size="14" aria-hidden="true" />
            {{ t(`ai.memory.types.${memory.memoryType}`) }}
          </span>
          <span class="ai-memory-ledger__status" :class="`is-${memory.status}`">
            {{ t(`ai.memory.status.${memory.status}`) }}
          </span>
        </div>

        <template v-if="editingId === memory.id">
          <BInput v-model:value="editingContent" type="textarea" :rows="3" :maxlength="2000" />
          <div class="ai-memory-ledger__edit-actions">
            <BButton @click="cancelEdit">{{ t('common.cancel') }}</BButton>
            <BButton type="primary" :loading="mutatingId === memory.id" @click="saveEdit(memory)">
              {{ t('common.save') }}
            </BButton>
          </div>
        </template>
        <p v-else class="ai-memory-ledger__content">{{ memory.content }}</p>

        <dl>
          <div>
            <dt>{{ t('ai.memory.scope') }}</dt>
            <dd>{{ scopeLabel(memory) }}</dd>
          </div>
          <div>
            <dt>{{ t('ai.memory.source') }}</dt>
            <dd>{{ sourceLabel(memory) }}</dd>
          </div>
          <div>
            <dt>{{ t('ai.memory.createdAt') }}</dt>
            <dd>{{ formatDate(memory.createdAt) }}</dd>
          </div>
          <div>
            <dt>{{ t('ai.memory.expiresAt') }}</dt>
            <dd>{{ memory.expireAt ? formatDate(memory.expireAt) : t('ai.memory.noExpiry') }}</dd>
          </div>
        </dl>

        <div v-if="reviewPeers(memory).length" class="ai-memory-ledger__review-peers" role="note">
          <div>
            <SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />
            <span>
              <strong>{{ t('ai.memory.reviewTogetherTitle', { count: reviewPeers(memory).length }) }}</strong>
              <small>{{ t('ai.memory.reviewTogetherHint') }}</small>
            </span>
          </div>
          <ul>
            <li v-for="peer in reviewPeers(memory)" :key="peer.id">
              <span>{{ peer.content }}</span>
              <small>{{ t(`ai.memory.status.${peer.status}`) }}</small>
            </li>
          </ul>
        </div>

        <div class="ai-memory-ledger__actions">
          <BButton
            v-if="memory.status === 'candidate'"
            type="primary"
            :loading="mutatingId === memory.id"
            @click="accept(memory)"
          >
            {{ t('ai.memory.accept') }}
          </BButton>
          <BButton
            v-if="['active', 'paused'].includes(memory.status)"
            :loading="mutatingId === memory.id"
            @click="togglePause(memory)"
          >
            {{ memory.status === 'paused' ? t('ai.memory.resume') : t('ai.memory.pause') }}
          </BButton>
          <BButton v-if="!['expired'].includes(memory.status)" @click="startEdit(memory)">
            <SvgIcon :src="icon.ai.messageEdit" size="13" aria-hidden="true" />
            {{ t('common.edit') }}
          </BButton>
          <BButton class="is-danger" @click="confirmDelete(memory)">
            <SvgIcon :src="icon.noteDetail.delete" size="13" aria-hidden="true" />
            {{ t('common.delete') }}
          </BButton>
        </div>
      </BCard>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import { recordAiProductEvent } from '@/api/aiTelemetry';
  import {
    confirmAiMemory,
    clearAiMemories,
    deleteAiMemory,
    listAiMemories,
    updateAiMemory,
    type AiMemory,
    type AiMemoryStatus,
  } from '@/api/aiWorkspaceApi';
  import { telemetryMemoryType } from './aiUiContracts';
  import { memoryReviewPeers } from './aiMemoryConflicts';

  const props = defineProps<{ temporarySession?: boolean }>();
  const emit = defineEmits<{ 'update:temporarySession': [value: boolean] }>();
  const { t, locale } = useI18n();
  const status = ref<AiMemoryStatus | 'all'>('candidate');
  const memories = ref<AiMemory[]>([]);
  const reviewPool = ref<AiMemory[]>([]);
  const loading = ref(false);
  const mutatingId = ref('');
  const editingId = ref('');
  const editingContent = ref('');

  const statusOptions = computed(() => [
    { key: 'candidate', label: t('ai.memory.filters.candidate') },
    { key: 'active', label: t('ai.memory.filters.active') },
    { key: 'paused', label: t('ai.memory.filters.paused') },
    { key: 'expired', label: t('ai.memory.filters.expired') },
  ]);

  function toggleTemporarySession(value: boolean) {
    emit('update:temporarySession', value);
    void recordAiProductEvent('ai_memory_state_changed', {
      surface: 'memory',
      mode: 'ask',
      actionType: value ? 'pause' : 'resume',
      scopeType: 'temporary',
      temporarySession: value,
      outcome: 'success',
    });
  }

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    loading.value = true;
    try {
      const [result, related] = await Promise.all([
        listAiMemories({
          status: status.value,
          includeExpired: status.value === 'expired',
          limit: 50,
        }),
        listAiMemories({ includeExpired: false, limit: 100 }),
      ]);
      // 快速切换 status 标签时,先发起的慢响应不得覆盖后发起的结果。
      if (seq !== loadSeq) return;
      memories.value = result.items;
      reviewPool.value = related.items;
    } catch {
      if (seq === loadSeq) message.warning(t('ai.memory.loadFailed'));
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  async function accept(memory: AiMemory) {
    mutatingId.value = memory.id;
    try {
      replaceMemory(await confirmAiMemory(memory.id));
      void recordAiProductEvent('ai_memory_candidate_reviewed', {
        surface: 'memory',
        mode: 'ask',
        actionType: 'accept',
        memoryId: memory.id,
        memoryType: telemetryMemoryType(memory.memoryType),
        memoryState: 'active',
        scopeType: memory.scopeType,
        outcome: 'success',
      });
      message.success(t('ai.memory.accepted'));
    } catch {
      message.warning(t('ai.memory.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  async function togglePause(memory: AiMemory) {
    mutatingId.value = memory.id;
    try {
      replaceMemory(await updateAiMemory(memory.id, { status: memory.status === 'paused' ? 'active' : 'paused' }));
      void recordAiProductEvent('ai_memory_state_changed', {
        surface: 'memory',
        mode: 'ask',
        actionType: memory.status === 'paused' ? 'resume' : 'pause',
        memoryId: memory.id,
        memoryType: telemetryMemoryType(memory.memoryType),
        memoryState: memory.status === 'paused' ? 'active' : 'paused',
        scopeType: memory.scopeType,
        outcome: 'success',
      });
      message.success(memory.status === 'paused' ? t('ai.memory.resumed') : t('ai.memory.paused'));
    } catch {
      message.warning(t('ai.memory.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  function startEdit(memory: AiMemory) {
    editingId.value = memory.id;
    editingContent.value = memory.content;
  }

  function cancelEdit() {
    editingId.value = '';
    editingContent.value = '';
  }

  async function saveEdit(memory: AiMemory) {
    const content = editingContent.value.trim();
    if (!content) return;
    mutatingId.value = memory.id;
    try {
      replaceMemory(await updateAiMemory(memory.id, { content }));
      void recordAiProductEvent('ai_memory_state_changed', {
        surface: 'memory',
        mode: 'ask',
        actionType: 'edit',
        memoryId: memory.id,
        memoryType: telemetryMemoryType(memory.memoryType),
        memoryState: 'candidate',
        scopeType: memory.scopeType,
        outcome: 'success',
      });
      cancelEdit();
      message.success(t('ai.memory.updated'));
    } catch {
      message.warning(t('ai.memory.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  function confirmDelete(memory: AiMemory) {
    Alert.alert({
      title: t('ai.memory.deleteTitle'),
      content: t('ai.memory.deleteConfirm'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('common.delete'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            mutatingId.value = memory.id;
            try {
              await deleteAiMemory(memory.id);
              void recordAiProductEvent('ai_memory_state_changed', {
                surface: 'memory',
                mode: 'ask',
                actionType: 'delete',
                memoryId: memory.id,
                memoryType: telemetryMemoryType(memory.memoryType),
                memoryState: 'deleted',
                scopeType: memory.scopeType,
                outcome: 'success',
              });
              memories.value = memories.value.filter((item) => item.id !== memory.id);
              reviewPool.value = reviewPool.value.filter((item) => item.id !== memory.id);
              message.success(t('ai.memory.deleted'));
            } catch {
              message.warning(t('ai.memory.deleteFailed'));
            } finally {
              mutatingId.value = '';
            }
          },
        },
      ],
    });
  }

  function confirmClearAll() {
    Alert.alert({
      title: t('ai.memory.clearTitle'),
      content: t('ai.memory.clearConfirm'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('ai.memory.clearAll'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            mutatingId.value = '__all__';
            try {
              const result = await clearAiMemories();
              memories.value = [];
              reviewPool.value = [];
              void recordAiProductEvent('ai_memory_state_changed', {
                surface: 'memory',
                mode: 'ask',
                actionType: 'delete',
                itemCount: result.cleared,
                outcome: 'success',
              });
              message.success(t('ai.memory.cleared', { count: result.cleared }));
            } catch {
              message.warning(t('ai.memory.clearFailed'));
            } finally {
              mutatingId.value = '';
            }
          },
        },
      ],
    });
  }

  function replaceMemory(memory: AiMemory) {
    const reviewIndex = reviewPool.value.findIndex((item) => item.id === memory.id);
    if (['candidate', 'active', 'paused'].includes(memory.status)) {
      if (reviewIndex >= 0) reviewPool.value[reviewIndex] = memory;
      else reviewPool.value = [memory, ...reviewPool.value].slice(0, 100);
    } else if (reviewIndex >= 0) {
      reviewPool.value = reviewPool.value.filter((item) => item.id !== memory.id);
    }
    if (memory.status !== status.value) {
      memories.value = memories.value.filter((item) => item.id !== memory.id);
      return;
    }
    const index = memories.value.findIndex((item) => item.id === memory.id);
    if (index >= 0) memories.value[index] = memory;
  }

  function memoryIcon(type: AiMemory['memoryType']) {
    if (type === 'preference') return icon.filterPanel.check;
    if (type === 'workflow') return icon.ai.organize;
    if (type === 'temporary_state') return icon.ai.pending;
    return icon.noteTemplate.knowledge;
  }

  function reviewPeers(memory: AiMemory) {
    return memoryReviewPeers(memory, reviewPool.value);
  }

  function scopeLabel(memory: AiMemory) {
    const scopeName = t(`ai.memory.scopes.${memory.scopeType}`);
    const resourceId = String(memory.scope?.resourceId || memory.scope?.conversationId || '').trim();
    return resourceId ? `${scopeName} · ${resourceId}` : scopeName;
  }

  function sourceLabel(memory: AiMemory) {
    if (memory.sourceConversationId) return t('ai.memory.sourceConversation', { id: memory.sourceConversationId });
    return t('ai.memory.sourceManual');
  }

  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  watch(status, () => void load());
  onMounted(() => void load());
</script>

<style scoped lang="less">
  .ai-memory-ledger {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 11px;
  }

  .ai-memory-ledger__privacy,
  .ai-memory-ledger__privacy > div,
  .ai-memory-ledger__heading,
  .ai-memory-ledger__item-heading,
  .ai-memory-ledger__actions,
  .ai-memory-ledger__edit-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
  }

  .ai-memory-ledger__review-peers {
    display: grid;
    gap: 7px;
    padding: 9px;
    border: 1px solid color-mix(in srgb, var(--warning-color, #c47f17) 28%, var(--surface-border-color));
    border-radius: 9px;
    background: color-mix(in srgb, var(--warning-color, #c47f17) 6%, var(--card-background));
  }

  .ai-memory-ledger__review-peers > div {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .ai-memory-ledger__review-peers > div span {
    display: grid;
    gap: 2px;
  }

  .ai-memory-ledger__review-peers ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding-left: 20px;
  }

  .ai-memory-ledger__review-peers li {
    line-height: 1.45;
  }

  .ai-memory-ledger__review-peers li small {
    margin-left: 6px;
    color: var(--desc-color);
  }

  .ai-memory-ledger__heading-actions {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .ai-memory-ledger__heading-actions .is-danger {
    color: var(--danger-color, #d14343);
  }

  .ai-memory-ledger__privacy > div {
    justify-content: flex-start;
    color: var(--primary-color);
  }

  .ai-memory-ledger__privacy span,
  .ai-memory-ledger__heading > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-memory-ledger__privacy strong,
  .ai-memory-ledger__heading strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-memory-ledger__privacy small,
  .ai-memory-ledger__heading small {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }

  .ai-memory-ledger__heading-actions > button:last-child {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
  }

  .ai-memory-ledger__list {
    display: grid;
    min-height: 0;
    gap: 8px;
    overflow-y: auto;
  }

  .ai-memory-ledger__item {
    display: grid;
    gap: 9px;
  }

  .ai-memory-ledger__item.is-candidate {
    --b-card-border-color: color-mix(in srgb, var(--warning-color, #c47f17) 24%, var(--surface-border-color));
  }

  .ai-memory-ledger__type,
  .ai-memory-ledger__status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--primary-color);
    font-size: 9px;
    font-weight: 700;
  }

  .ai-memory-ledger__status {
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }

  .ai-memory-ledger__content {
    margin: 0;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .ai-memory-ledger dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    margin: 0;
  }

  .ai-memory-ledger dl > div {
    display: grid;
    gap: 2px;
    padding: 7px;
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
  }

  .ai-memory-ledger dt {
    color: var(--desc-color);
    font-size: 8px;
  }

  .ai-memory-ledger dd {
    margin: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-memory-ledger__actions,
  .ai-memory-ledger__edit-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .ai-memory-ledger__actions button {
    gap: 4px;
  }

  .ai-memory-ledger__actions .is-danger {
    color: var(--danger-color, #d14343);
  }

  .ai-memory-ledger__state {
    display: grid;
    min-height: 180px;
    place-items: center;
    align-content: center;
    gap: 7px;
    color: var(--desc-color);
    text-align: center;
  }

  .ai-memory-ledger__state strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-memory-ledger__state small {
    font-size: 10px;
  }

  @media (max-width: 520px) {
    .ai-memory-ledger__privacy {
      align-items: flex-start;
    }

    .ai-memory-ledger dl {
      grid-template-columns: 1fr;
    }

    .ai-memory-ledger__actions button {
      min-height: 44px;
    }

    .ai-memory-ledger__heading-actions > button:last-child {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }
</style>
