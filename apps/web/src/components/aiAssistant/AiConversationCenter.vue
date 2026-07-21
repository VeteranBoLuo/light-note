<template>
  <section class="ai-conversation-center" :aria-label="t('ai.conversations.title')">
    <div class="ai-conversation-center__toolbar">
      <BInput v-model:value="keyword" clearable :placeholder="t('ai.conversations.searchPlaceholder')">
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="14" aria-hidden="true" />
        </template>
      </BInput>
      <BButton type="primary" class="ai-conversation-center__new" @click="emit('new')">
        <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
        {{ t('ai.newConversation') }}
      </BButton>
    </div>

    <BTabs v-model:active-tab="status" variant="pill" :options="statusOptions" />

    <BCard v-if="recentlyDeleted" class="ai-conversation-center__undo" variant="panel" padding="9px" role="status">
      <span>
        <strong>{{ t('ai.conversations.deleteUndoTitle') }}</strong>
        <small>{{ t('ai.conversations.deleteUndoHint', { title: recentlyDeleted.conversation.title }) }}</small>
      </span>
      <BButton type="primary" :loading="undoing" @click="undoDelete">
        <SvgIcon :src="icon.noteDetail.history" size="14" aria-hidden="true" />
        {{ t('ai.conversations.undoDelete') }}
      </BButton>
    </BCard>

    <div class="ai-conversation-center__data-controls">
      <span>{{ t('ai.conversations.dataControlHint') }}</span>
      <div>
        <BButton :loading="exporting" @click="exportData">
          <SvgIcon :src="icon.noteDetail.export" size="14" aria-hidden="true" />
          {{ t('ai.conversations.export') }}
        </BButton>
        <BButton class="is-danger" :loading="clearing" @click="confirmClearAll">
          <SvgIcon :src="icon.noteDetail.delete" size="14" aria-hidden="true" />
          {{ t('ai.conversations.clearAll') }}
        </BButton>
      </div>
    </div>

    <div v-if="loading" class="ai-conversation-center__state" role="status">
      <BLoading inline loading :title="t('common.loading')" />
    </div>
    <div v-else-if="!items.length" class="ai-conversation-center__state">
      <SvgIcon :src="icon.ai.conversations" size="24" aria-hidden="true" />
      <strong>{{ keyword ? t('ai.conversations.noMatch') : t('ai.conversations.empty') }}</strong>
      <small>{{ t('ai.conversations.emptyHint') }}</small>
    </div>
    <div v-else class="ai-conversation-center__list">
      <BCard
        v-for="conversation in items"
        :key="conversation.id"
        as="article"
        variant="panel"
        padding="10px"
        radius="11px"
        :class="['ai-conversation-center__item', { 'is-current': conversation.id === currentId }]"
      >
        <template v-if="editingId === conversation.id">
          <BInput v-model:value="editingTitle" :maxlength="120" @enter="saveRename(conversation)" />
          <div class="ai-conversation-center__edit-actions">
            <BButton @click="cancelRename">{{ t('common.cancel') }}</BButton>
            <BButton type="primary" :loading="mutatingId === conversation.id" @click="saveRename(conversation)">
              {{ t('common.save') }}
            </BButton>
          </div>
        </template>
        <template v-else>
          <BButton class="ai-conversation-center__open" @click="emit('open', conversation.id)">
            <span>
              <strong>{{ conversation.title || t('ai.conversations.untitled') }}</strong>
              <small v-if="conversation.summary">{{ conversation.summary }}</small>
              <small class="ai-conversation-center__retention-summary">
                {{ retentionSummary(conversation) }}
              </small>
            </span>
            <time :datetime="conversation.lastMessageAt">{{ relativeTime(conversation.lastMessageAt) }}</time>
          </BButton>
          <div class="ai-conversation-center__actions">
            <BTooltip :title="t('ai.conversations.rename')" always :z-index="200001">
              <BButton :aria-label="t('ai.conversations.rename')" @click="startRename(conversation)">
                <SvgIcon :src="icon.ai.messageEdit" size="14" aria-hidden="true" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('ai.conversations.retentionSettings')" always :z-index="200001">
              <BButton
                :aria-label="t('ai.conversations.retentionSettings')"
                :aria-expanded="retentionEditingId === conversation.id"
                @click="toggleRetentionEditor(conversation)"
              >
                <SvgIcon :src="icon.noteDetail.history" size="14" aria-hidden="true" />
              </BButton>
            </BTooltip>
            <BTooltip
              always
              :z-index="200001"
              :title="
                conversation.status === 'archived' ? t('ai.conversations.restore') : t('ai.conversations.archive')
              "
            >
              <BButton
                :aria-label="
                  conversation.status === 'archived' ? t('ai.conversations.restore') : t('ai.conversations.archive')
                "
                :loading="mutatingId === conversation.id"
                @click="toggleArchive(conversation)"
              >
                <SvgIcon :src="icon.common.folder" size="14" aria-hidden="true" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('common.delete')" always :z-index="200001">
              <BButton :aria-label="t('common.delete')" class="is-danger" @click="confirmDelete(conversation)">
                <SvgIcon :src="icon.noteDetail.delete" size="14" aria-hidden="true" />
              </BButton>
            </BTooltip>
          </div>
          <div
            v-if="retentionEditingId === conversation.id"
            class="ai-conversation-center__retention-editor"
            role="group"
            :aria-label="t('ai.conversations.retentionSettings')"
          >
            <label :id="`retention-mode-${conversation.id}`">{{ t('ai.conversations.retentionMode') }}</label>
            <BSelect
              v-model:value="retentionModeDraft"
              :options="retentionModeOptions"
              :aria-labelledby="`retention-mode-${conversation.id}`"
            />
            <template v-if="retentionModeDraft === 'temporary'">
              <label :id="`retention-days-${conversation.id}`">{{ t('ai.conversations.temporaryDuration') }}</label>
              <BSelect
                v-model:value="retentionDaysDraft"
                :options="retentionDayOptions"
                :aria-labelledby="`retention-days-${conversation.id}`"
              />
            </template>
            <small>{{ retentionModeHint }}</small>
            <div class="ai-conversation-center__retention-actions">
              <BButton @click="closeRetentionEditor">{{ t('common.cancel') }}</BButton>
              <BButton type="primary" :loading="mutatingId === conversation.id" @click="saveRetention(conversation)">
                {{ t('common.save') }}
              </BButton>
            </div>
          </div>
        </template>
      </BCard>
    </div>

    <BButton v-if="nextCursor" class="ai-conversation-center__more" :loading="loadingMore" @click="loadMore">
      {{ t('common.loadMore') }}
    </BButton>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import {
    deleteAiConversation,
    clearAllAiData,
    exportAiCloudConversations,
    listAiConversations,
    restoreDeletedAiConversation,
    updateAiConversation,
    type AiConversationStatus,
    type AiConversationSummary,
    type AiRetentionMode,
  } from '@/api/aiWorkspaceApi';
  import { buildAiConversationRetentionPatch, closestAiTemporaryRetentionDays } from './aiUiContracts';

  const props = defineProps<{ currentId?: string }>();
  const emit = defineEmits<{
    open: [conversationId: string];
    new: [];
    deleted: [conversationId: string];
    restored: [conversationId: string];
    cleared: [deleted: number];
  }>();
  const { t, locale } = useI18n();
  const items = ref<AiConversationSummary[]>([]);
  const status = ref<AiConversationStatus>('active');
  const keyword = ref('');
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const mutatingId = ref('');
  const editingId = ref('');
  const editingTitle = ref('');
  const retentionEditingId = ref('');
  const retentionModeDraft = ref<AiRetentionMode>('standard');
  const retentionDaysDraft = ref(1);
  const exporting = ref(false);
  const clearing = ref(false);
  const undoing = ref(false);
  const recentlyDeleted = ref<{ conversation: AiConversationSummary; undoExpiresAt: string } | null>(null);
  let searchTimer: number | null = null;
  let deleteUndoTimer: number | null = null;

  const statusOptions = computed(() => [
    { key: 'active', label: t('ai.conversations.active') },
    { key: 'archived', label: t('ai.conversations.archived') },
  ]);
  const retentionModeOptions = computed(() => [
    { value: 'standard', label: t('ai.conversations.retentionStandard') },
    { value: 'temporary', label: t('ai.conversations.retentionTemporary') },
    { value: 'indefinite', label: t('ai.conversations.retentionIndefinite') },
  ]);
  const retentionDayOptions = computed(() => [
    { value: 1, label: t('ai.conversations.retentionDays', { count: 1 }) },
    { value: 7, label: t('ai.conversations.retentionDays', { count: 7 }) },
    { value: 30, label: t('ai.conversations.retentionDays', { count: 30 }) },
  ]);
  const retentionModeHint = computed(() => t(`ai.conversations.retentionHint.${retentionModeDraft.value}`));

  async function load(reset = true) {
    if (reset) loading.value = true;
    else loadingMore.value = true;
    try {
      const result = await listAiConversations({
        status: status.value,
        keyword: keyword.value.trim() || undefined,
        cursor: reset ? undefined : nextCursor.value || undefined,
        limit: 30,
      });
      items.value = reset ? result.items : [...items.value, ...result.items];
      nextCursor.value = result.nextCursor;
    } catch {
      message.warning(t('ai.conversations.loadFailed'));
    } finally {
      loading.value = false;
      loadingMore.value = false;
    }
  }

  function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    void load(false);
  }

  function startRename(conversation: AiConversationSummary) {
    editingId.value = conversation.id;
    editingTitle.value = conversation.title;
  }

  function cancelRename() {
    editingId.value = '';
    editingTitle.value = '';
  }

  function toggleRetentionEditor(conversation: AiConversationSummary) {
    if (retentionEditingId.value === conversation.id) {
      closeRetentionEditor();
      return;
    }
    retentionEditingId.value = conversation.id;
    retentionModeDraft.value = conversation.retentionMode;
    retentionDaysDraft.value = closestAiTemporaryRetentionDays(conversation.expireAt);
  }

  function closeRetentionEditor() {
    retentionEditingId.value = '';
    retentionModeDraft.value = 'standard';
    retentionDaysDraft.value = 1;
  }

  async function saveRetention(conversation: AiConversationSummary) {
    mutatingId.value = conversation.id;
    try {
      const patch = buildAiConversationRetentionPatch(retentionModeDraft.value, retentionDaysDraft.value);
      const updated = await updateAiConversation(conversation.id, patch);
      Object.assign(conversation, updated);
      closeRetentionEditor();
      message.success(t('ai.conversations.retentionSaved'));
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  function retentionSummary(conversation: AiConversationSummary) {
    if (conversation.retentionMode === 'temporary') {
      const value = conversation.expireAt ? new Date(conversation.expireAt) : null;
      if (value && Number.isFinite(value.getTime())) {
        return t('ai.conversations.retentionTemporaryUntil', {
          date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(value),
        });
      }
      return t('ai.conversations.retentionTemporary');
    }
    return t(`ai.conversations.retentionSummary.${conversation.retentionMode}`);
  }

  async function saveRename(conversation: AiConversationSummary) {
    const title = editingTitle.value.trim();
    if (!title || title === conversation.title) {
      cancelRename();
      return;
    }
    mutatingId.value = conversation.id;
    try {
      const updated = await updateAiConversation(conversation.id, { title });
      Object.assign(conversation, updated);
      cancelRename();
      message.success(t('ai.conversations.renamed'));
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  async function toggleArchive(conversation: AiConversationSummary) {
    mutatingId.value = conversation.id;
    try {
      await updateAiConversation(conversation.id, {
        status: conversation.status === 'archived' ? 'active' : 'archived',
      });
      items.value = items.value.filter((item) => item.id !== conversation.id);
      message.success(
        conversation.status === 'archived' ? t('ai.conversations.restored') : t('ai.conversations.archivedSuccess'),
      );
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  function confirmDelete(conversation: AiConversationSummary) {
    Alert.alert({
      title: t('ai.conversations.deleteTitle'),
      content: t('ai.conversations.deleteConfirm', { title: conversation.title || t('ai.conversations.untitled') }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('common.delete'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            mutatingId.value = conversation.id;
            try {
              const result = await deleteAiConversation(conversation.id);
              items.value = items.value.filter((item) => item.id !== conversation.id);
              emit('deleted', conversation.id);
              if (result.deleted && result.undoExpiresAt) {
                recentlyDeleted.value = {
                  conversation: { ...conversation },
                  undoExpiresAt: result.undoExpiresAt,
                };
                if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
                deleteUndoTimer = window.setTimeout(
                  () => {
                    recentlyDeleted.value = null;
                    deleteUndoTimer = null;
                  },
                  Math.max(0, new Date(result.undoExpiresAt).getTime() - Date.now()),
                );
              }
              message.success(t('ai.conversations.deletedWithUndo'));
            } catch {
              message.warning(t('ai.conversations.deleteFailed'));
            } finally {
              mutatingId.value = '';
            }
          },
        },
      ],
    });
  }

  async function undoDelete() {
    const pending = recentlyDeleted.value;
    if (!pending || undoing.value) return;
    undoing.value = true;
    try {
      await restoreDeletedAiConversation(pending.conversation.id);
      if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
      deleteUndoTimer = null;
      recentlyDeleted.value = null;
      await load();
      emit('restored', pending.conversation.id);
      message.success(t('ai.conversations.deleteRestored'));
    } catch {
      recentlyDeleted.value = null;
      message.warning(t('ai.conversations.deleteUndoFailed'));
    } finally {
      undoing.value = false;
    }
  }

  async function exportData() {
    if (exporting.value) return;
    exporting.value = true;
    try {
      const data = await exportAiCloudConversations();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      // 文件名用本地日期,不用 toISOString(避免北京凌晨跨日偏差)
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      anchor.download = `light-note-ai-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(
        t('ai.conversations.exported', { conversations: data.conversationCount, messages: data.messageCount }),
      );
    } catch {
      message.warning(t('ai.conversations.exportFailed'));
    } finally {
      exporting.value = false;
    }
  }

  function confirmClearAll() {
    Alert.alert({
      title: t('ai.conversations.clearTitle'),
      content: t('ai.conversations.clearConfirm'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('ai.conversations.clearAll'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            clearing.value = true;
            try {
              const result = await clearAllAiData();
              items.value = [];
              nextCursor.value = null;
              emit('cleared', result.byType.conversations || 0);
              message.success(t('ai.conversations.cleared', { count: result.deleted }));
            } catch {
              message.warning(t('ai.conversations.clearFailed'));
            } finally {
              clearing.value = false;
            }
          },
        },
      ],
    });
  }

  function relativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const delta = timestamp - Date.now();
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
    const minutes = Math.round(delta / 60_000);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    const hours = Math.round(delta / 3_600_000);
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    return formatter.format(Math.round(delta / 86_400_000), 'day');
  }

  watch(status, () => void load());
  watch(keyword, () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 260);
  });
  onMounted(() => void load());
  onBeforeUnmount(() => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
  });
</script>

<style scoped lang="less">
  .ai-conversation-center {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
  }

  .ai-conversation-center__toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .ai-conversation-center__new {
    min-height: 36px;
    gap: 5px;
  }

  .ai-conversation-center__list {
    display: grid;
    min-height: 0;
    gap: 7px;
    overflow-y: auto;
  }

  .ai-conversation-center__data-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--desc-color);
    font-size: 9px;
  }

  .ai-conversation-center__undo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-color: color-mix(in srgb, var(--primary-color) 38%, var(--border-color));
  }

  .ai-conversation-center__undo > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .ai-conversation-center__undo small {
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-conversation-center__data-controls > div {
    display: flex;
    flex: 0 0 auto;
    gap: 5px;
  }

  .ai-conversation-center__data-controls button {
    gap: 4px;
  }

  .ai-conversation-center__data-controls .is-danger {
    color: var(--danger-color, #d14343);
  }

  .ai-conversation-center__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
  }

  .ai-conversation-center__item.is-current {
    --b-card-border-color: color-mix(in srgb, var(--primary-color) 38%, var(--surface-border-color));
    --b-card-background: color-mix(in srgb, var(--primary-color) 6%, var(--workspace-panel-bg-color));
  }

  .ai-conversation-center__open {
    min-width: 0;
    height: auto;
    justify-content: space-between;
    gap: 8px;
    /* 内边距别太小:hover 背景块会紧贴标题/时间等文字,显得拥挤;留出呼吸再配圆角 */
    padding: 7px 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    text-align: left;
  }

  .ai-conversation-center__open > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .ai-conversation-center__open strong,
  .ai-conversation-center__open small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-conversation-center__retention-summary {
    color: color-mix(in srgb, var(--primary-color) 72%, var(--desc-color));
  }

  .ai-conversation-center__open strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-conversation-center__open small,
  .ai-conversation-center__open time {
    color: var(--desc-color);
    font-size: 10px;
  }

  .ai-conversation-center__open time {
    flex: 0 0 auto;
  }

  .ai-conversation-center__actions,
  .ai-conversation-center__edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 3px;
  }

  .ai-conversation-center__retention-editor {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
    align-items: center;
    gap: 7px 10px;
    padding: 9px;
    border: 1px solid var(--surface-border-color, var(--border-color));
    border-radius: 9px;
    background: var(--workspace-panel-bg-color, var(--component-background));
  }

  .ai-conversation-center__retention-editor > label {
    color: var(--text-color);
    font-size: 11px;
  }

  .ai-conversation-center__retention-editor > small {
    grid-column: 1 / -1;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .ai-conversation-center__retention-actions {
    display: flex;
    grid-column: 1 / -1;
    justify-content: flex-end;
    gap: 5px;
  }

  .ai-conversation-center__actions button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--desc-color);
  }

  .ai-conversation-center__actions .is-danger:hover {
    color: var(--danger-color, #d14343);
  }

  .ai-conversation-center__edit-actions {
    grid-column: 1 / -1;
  }

  .ai-conversation-center__state {
    display: grid;
    min-height: 180px;
    place-items: center;
    align-content: center;
    gap: 6px;
    color: var(--desc-color);
    text-align: center;
  }

  .ai-conversation-center__state strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-conversation-center__state small {
    font-size: 10px;
  }

  .ai-conversation-center__more {
    width: max-content;
    align-self: center;
  }

  @media (max-width: 560px) {
    .ai-conversation-center__toolbar {
      grid-template-columns: 1fr;
    }

    .ai-conversation-center__new {
      min-height: 44px;
    }

    .ai-conversation-center__item {
      grid-template-columns: 1fr;
    }

    .ai-conversation-center__data-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .ai-conversation-center__data-controls button {
      min-height: 44px;
      flex: 1;
    }

    .ai-conversation-center__actions {
      justify-content: flex-start;
    }

    .ai-conversation-center__retention-editor {
      grid-template-columns: 1fr;
    }

    .ai-conversation-center__retention-editor > small,
    .ai-conversation-center__retention-actions {
      grid-column: 1;
    }

    .ai-conversation-center__retention-actions button {
      min-height: 44px;
      flex: 1;
    }

    .ai-conversation-center__actions button {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }
</style>
