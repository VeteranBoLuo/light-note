<template>
  <aside class="ai-conv-sidebar" :aria-label="t('ai.conversations.title')">
    <div class="ai-conv-sidebar__head">
      <BButton class="ai-conv-sidebar__new" type="primary" @click="emit('new')">
        <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
        {{ t('ai.newConversation') }}
      </BButton>
      <BInput
        v-model:value="keyword"
        class="ai-conv-sidebar__search"
        clearable
        :placeholder="t('ai.conversations.searchPlaceholder')"
        @input="scheduleLoad"
        @enter="load"
      />
      <BSelect
        v-model:value="status"
        :options="statusOptions"
        :aria-label="t('ai.conversations.statusFilter')"
        @change="load"
      />
    </div>

    <BCard
      v-if="recentlyDeleted"
      class="ai-conv-sidebar__undo"
      variant="panel"
      padding="7px"
      role="status"
    >
      <span>{{ t('ai.conversations.deleteUndoTitle') }}</span>
      <BButton size="small" type="primary" :loading="undoing" @click="undoDelete">
        {{ t('ai.conversations.undoDelete') }}
      </BButton>
    </BCard>

    <div class="ai-conv-sidebar__list" role="list">
      <BLoading v-if="loading && !items.length" inline loading :title="t('common.loading')" />
      <p v-else-if="!items.length" class="ai-conv-sidebar__empty">
        {{ keyword.trim() ? t('ai.conversations.noMatch') : t('ai.conversations.empty') }}
      </p>
      <section v-for="group in groupedItems" :key="group.key" class="ai-conv-sidebar__group">
        <h3>{{ group.label }}</h3>
        <div v-for="conv in group.items" :key="conv.id" role="listitem" class="ai-conv-sidebar__item-wrap">
          <BButton
            class="ai-conv-sidebar__item"
            :class="{ 'is-active': conv.id === currentId }"
            :aria-current="conv.id === currentId ? 'true' : undefined"
            :title="conv.title || t('ai.conversations.untitled')"
            @click="emit('open', conv.id)"
          >
            <span class="ai-conv-sidebar__item-content">
              <span
                v-if="conv.isPinned"
                class="ai-conv-sidebar__pin-indicator"
                :title="t('ai.conversations.pinned')"
              >
                <SvgIcon :src="icon.contextMenu.pin" size="15" aria-hidden="true" />
              </span>
              <span class="ai-conv-sidebar__item-copy">
                <span class="ai-conv-sidebar__item-title">
                  {{ conv.title || t('ai.conversations.untitled') }}
                </span>
                <time class="ai-conv-sidebar__item-time" :datetime="conv.lastMessageAt">
                  {{ relativeTime(conv.lastMessageAt) }}
                </time>
              </span>
            </span>
          </BButton>

          <BPopover
            :open="menuOpenId === conv.id"
            trigger="click"
            placement="bottom-right"
            overlay-class-name="ai-conv-sidebar-menu"
            @update:open="(value) => (menuOpenId = value ? conv.id : '')"
          >
            <BButton
              class="ai-conv-sidebar__more"
              :aria-label="t('ai.conversations.moreActions')"
              :title="t('ai.conversations.moreActions')"
            >
              <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
            </BButton>
            <template #content>
              <div class="ai-conv-sidebar-menu__content">
                <BButton :loading="isMutating(conv.id, 'pin')" @click="togglePinned(conv)">
                  <SvgIcon
                    :src="conv.isPinned ? icon.contextMenu.unpin : icon.contextMenu.pin"
                    size="14"
                    aria-hidden="true"
                  />
                  {{ t(conv.isPinned ? 'ai.conversations.unpin' : 'ai.conversations.pin') }}
                </BButton>
                <BButton @click="startRename(conv)">
                  <SvgIcon :src="icon.ai.messageEdit" size="14" aria-hidden="true" />
                  {{ t('ai.conversations.rename') }}
                </BButton>
                <BButton :loading="isMutating(conv.id, 'archive')" @click="toggleArchived(conv)">
                  <SvgIcon :src="icon.contextMenu.archive" size="14" aria-hidden="true" />
                  {{ t(conv.status === 'archived' ? 'ai.conversations.restore' : 'ai.conversations.archive') }}
                </BButton>
                <BButton
                  class="ai-conv-sidebar-menu__delete"
                  :loading="isMutating(conv.id, 'delete')"
                  @click="confirmDelete(conv)"
                >
                  <SvgIcon :src="icon.noteDetail.delete" size="14" aria-hidden="true" />
                  {{ t('common.delete') }}
                </BButton>
              </div>
            </template>
          </BPopover>
        </div>
      </section>
      <BButton v-if="nextCursor" class="ai-conv-sidebar__load-more" :loading="loadingMore" @click="loadMore">
        {{ t('common.loadMore') }}
      </BButton>
    </div>
  </aside>

  <BModal
    v-model:visible="renameVisible"
    :title="t('ai.conversations.rename')"
    width="min(420px, 92vw)"
    :show-footer="false"
    @close="cancelRename"
  >
    <div class="ai-conv-rename">
      <BInput
        v-model:value="renameTitle"
        :maxlength="120"
        :placeholder="t('ai.conversations.untitled')"
        @enter="saveRename"
      />
      <div class="ai-conv-rename__actions">
        <BButton @click="cancelRename">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="isMutating(renameConversation?.id || '', 'rename')" @click="saveRename">
          {{ t('common.save') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon.ts';
  import {
    deleteAiConversation,
    listAiConversations,
    restoreDeletedAiConversation,
    updateAiConversation,
    type AiConversationStatus,
    type AiConversationSummary,
  } from '@/api/aiWorkspaceApi';

  const props = defineProps<{ currentId: string; refreshToken?: number }>();
  const emit = defineEmits<{ open: [id: string]; new: []; deleted: [id: string]; restored: [id: string] }>();
  const { t, locale } = useI18n();
  const items = ref<AiConversationSummary[]>([]);
  const status = ref<AiConversationStatus>('active');
  const keyword = ref('');
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  type ConversationAction = 'pin' | 'rename' | 'archive' | 'delete';
  const mutating = ref<{ id: string; action: ConversationAction } | null>(null);
  const menuOpenId = ref('');
  const recentlyDeleted = ref<{ conversation: AiConversationSummary; undoExpiresAt: string } | null>(null);
  const undoing = ref(false);
  const renameVisible = ref(false);
  const renameConversation = ref<AiConversationSummary | null>(null);
  const renameTitle = ref('');
  let loadSeq = 0;
  let searchTimer = 0;
  let deleteUndoTimer: number | null = null;

  const statusOptions = computed(() => [
    { value: 'active', label: t('ai.conversations.active') },
    { value: 'archived', label: t('ai.conversations.archived') },
  ]);
  const groupedItems = computed(() => {
    const groups: Array<{ key: string; label: string; items: AiConversationSummary[] }> = [];
    const pinned = items.value.filter((item) => item.isPinned);
    if (pinned.length) groups.push({ key: 'pinned', label: t('ai.conversations.pinned'), items: pinned });
    const regular = items.value.filter((item) => !item.isPinned);
    if (regular.length) {
      groups.push({
        key: 'recent',
        label: t(status.value === 'archived' ? 'ai.conversations.archived' : 'ai.conversations.active'),
        items: regular,
      });
    }
    return groups;
  });

  async function load(reset = true) {
    const seq = ++loadSeq;
    if (reset) loading.value = true;
    else loadingMore.value = true;
    try {
      const result = await listAiConversations({
        status: status.value,
        keyword: keyword.value.trim() || undefined,
        cursor: reset ? undefined : nextCursor.value || undefined,
        limit: 40,
      });
      if (seq !== loadSeq) return;
      items.value = reset ? result.items : [...items.value, ...result.items];
      nextCursor.value = result.nextCursor;
    } catch {
      if (seq === loadSeq && reset) items.value = [];
      message.warning(t('ai.conversations.loadFailed'));
    } finally {
      if (seq === loadSeq) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  function scheduleLoad() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 220);
  }

  function loadMore() {
    if (nextCursor.value && !loadingMore.value) void load(false);
  }

  function isMutating(id: string, action: ConversationAction) {
    return mutating.value?.id === id && mutating.value.action === action;
  }

  async function updateConversation(
    conv: AiConversationSummary,
    patch: Record<string, unknown>,
    action: Exclude<ConversationAction, 'delete'>,
  ) {
    if (mutating.value) return;
    mutating.value = { id: conv.id, action };
    try {
      const updated = await updateAiConversation(conv.id, patch);
      if (patch.status && patch.status !== status.value) {
        items.value = items.value.filter((item) => item.id !== conv.id);
      } else {
        Object.assign(conv, updated);
      }
      menuOpenId.value = '';
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutating.value = null;
    }
  }

  function togglePinned(conv: AiConversationSummary) {
    void updateConversation(conv, { isPinned: !conv.isPinned }, 'pin');
  }

  function startRename(conv: AiConversationSummary) {
    menuOpenId.value = '';
    renameConversation.value = conv;
    renameTitle.value = conv.title || '';
    renameVisible.value = true;
  }

  function cancelRename() {
    if (mutating.value?.action === 'rename') return;
    renameVisible.value = false;
    renameConversation.value = null;
    renameTitle.value = '';
  }

  async function saveRename() {
    const conv = renameConversation.value;
    const title = renameTitle.value.trim();
    if (!conv || mutating.value) return;
    if (!title || title === conv.title) {
      cancelRename();
      return;
    }
    mutating.value = { id: conv.id, action: 'rename' };
    try {
      const updated = await updateAiConversation(conv.id, { title });
      Object.assign(conv, updated);
      renameVisible.value = false;
      renameConversation.value = null;
      renameTitle.value = '';
      message.success(t('ai.conversations.renamed'));
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutating.value = null;
    }
  }

  function toggleArchived(conv: AiConversationSummary) {
    void updateConversation(conv, { status: conv.status === 'archived' ? 'active' : 'archived' }, 'archive');
  }

  function confirmDelete(conv: AiConversationSummary) {
    if (mutating.value) return;
    menuOpenId.value = '';
    Alert.alert({
      title: t('ai.conversations.deleteTitle'),
      content: t('ai.conversations.deleteConfirm', { title: conv.title || t('ai.conversations.untitled') }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('common.delete'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            mutating.value = { id: conv.id, action: 'delete' };
            try {
              const result = await deleteAiConversation(conv.id);
              items.value = items.value.filter((item) => item.id !== conv.id);
              emit('deleted', conv.id);
              if (result.deleted && result.undoExpiresAt) {
                recentlyDeleted.value = {
                  conversation: { ...conv },
                  undoExpiresAt: result.undoExpiresAt,
                };
                if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
                deleteUndoTimer = window.setTimeout(() => {
                  recentlyDeleted.value = null;
                  deleteUndoTimer = null;
                }, Math.max(0, new Date(result.undoExpiresAt).getTime() - Date.now()));
              }
              message.success(t('ai.conversations.deletedWithUndo'));
            } catch {
              message.warning(t('ai.conversations.deleteFailed'));
            } finally {
              mutating.value = null;
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
      if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
      deleteUndoTimer = null;
      message.warning(t('ai.conversations.deleteUndoFailed'));
    } finally {
      undoing.value = false;
    }
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

  watch(
    () => props.refreshToken,
    () => void load(),
  );
  onMounted(() => void load());
  onBeforeUnmount(() => {
    window.clearTimeout(searchTimer);
    if (deleteUndoTimer !== null) window.clearTimeout(deleteUndoTimer);
  });
</script>

<style scoped lang="less">
  .ai-conv-sidebar {
    display: flex;
    flex-direction: column;
    width: 268px;
    flex-shrink: 0;
    height: 100%;
    box-sizing: border-box;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color, var(--background-color));
  }
  .ai-conv-sidebar__head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 10px 8px;
    flex-shrink: 0;
  }
  .ai-conv-sidebar__new {
    width: 100%;
    justify-content: center;
    gap: 6px;
  }
  .ai-conv-sidebar__search :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background);
    box-shadow: none !important;
  }
  .ai-conv-sidebar__search :deep(.b-input:hover),
  .ai-conv-sidebar__search :deep(.b-input:focus-visible) {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color)) !important;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
  }
  .ai-conv-sidebar__undo {
    display: flex;
    margin: 0 10px 8px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .ai-conv-sidebar__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 7px 12px;
  }
  .ai-conv-sidebar__empty {
    padding: 20px 8px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }
  .ai-conv-sidebar__group h3 {
    margin: 8px 8px 4px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 650;
  }
  .ai-conv-sidebar__item-wrap {
    position: relative;
    display: flex;
    min-width: 0;
    align-items: center;
    border-radius: 9px;
  }
  .ai-conv-sidebar__item-wrap + .ai-conv-sidebar__item-wrap {
    margin-top: 6px;
  }
  .ai-conv-sidebar__item.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 52px;
    padding: 6px 36px 6px 10px;
    align-items: flex-start;
    justify-content: center;
    border-radius: 9px;
    background: transparent;
    line-height: 1.25;
    text-align: left;
  }
  .ai-conv-sidebar__item:hover,
  .ai-conv-sidebar__item.is-active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .ai-conv-sidebar__item.is-active {
    color: var(--primary-color);
  }
  .ai-conv-sidebar__item-content {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 7px;
  }
  .ai-conv-sidebar__pin-indicator {
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    border-radius: 7px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  }
  .ai-conv-sidebar__item-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }
  .ai-conv-sidebar__item-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .ai-conv-sidebar__item-time {
    color: var(--desc-color);
    font-size: 11px;
  }
  .ai-conv-sidebar__more.b_btn {
    position: absolute;
    right: 4px;
    top: 8px;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    opacity: 0;
  }
  .ai-conv-sidebar__item-wrap:hover .ai-conv-sidebar__more,
  .ai-conv-sidebar__more:focus-visible {
    opacity: 1;
  }
  .ai-conv-sidebar__load-more {
    width: calc(100% - 12px);
    margin: 8px 6px 0;
  }
</style>

<style lang="less">
  .ai-conv-rename {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 14px;
  }
  .ai-conv-rename__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .ai-conv-sidebar-menu {
    width: 220px;
    padding: 7px;
    border: 1px solid var(--ai-conversation-menu-border-color, var(--surface-border-color));
    background: var(--ai-conversation-menu-background, var(--menu-body-bg-color));
    box-shadow: var(--ai-conversation-menu-shadow, 0 14px 32px rgba(0, 0, 0, 0.18));
  }
  .ai-conv-sidebar-menu__content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-conv-sidebar-menu__content > .b_btn {
    width: 100%;
    min-height: 38px;
    padding: 7px 10px;
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid transparent;
    background: var(--ai-conversation-menu-item-background, var(--menu-item-bg-color));
  }
  .ai-conv-sidebar-menu__content > .b_btn:hover,
  .ai-conv-sidebar-menu__content > .b_btn:focus-visible {
    border-color: var(--ai-conversation-menu-item-border-color, transparent);
    background: var(--ai-conversation-menu-item-hover-background, var(--menu-item-h-bg-color));
  }
  .ai-conv-sidebar-menu__delete.b_btn {
    margin-top: 2px;
    padding-top: 4px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--danger-color, #d14343);
    background: var(--ai-conversation-menu-item-background, var(--menu-item-bg-color));
  }
  .ai-conv-sidebar-menu__delete.b_btn:hover,
  .ai-conv-sidebar-menu__delete.b_btn:focus-visible {
    background: color-mix(in srgb, var(--danger-color, #d14343) 10%, transparent);
  }
  @media (hover: none) {
    .ai-conv-sidebar__more.b_btn {
      opacity: 1;
    }
  }
</style>
