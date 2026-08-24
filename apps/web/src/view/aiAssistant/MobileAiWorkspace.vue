<template>
  <main class="legacy-ai-archive">
    <header class="legacy-ai-archive__header">
      <span class="legacy-ai-archive__heading-icon" aria-hidden="true">
        <SvgIcon :src="icon.ai.conversations" size="20" />
      </span>
      <span>
        <strong>{{ t('ai.legacyArchive.title') }}</strong>
        <small>{{ t('ai.legacyArchive.description') }}</small>
      </span>
      <BButton :loading="exporting" @click="exportData">
        <SvgIcon :src="icon.noteDetail.export" size="15" aria-hidden="true" />
        {{ t('ai.conversations.export') }}
      </BButton>
    </header>

    <section class="legacy-ai-archive__layout" :class="{ 'has-detail': Boolean(selectedConversation) }">
      <aside class="legacy-ai-archive__sidebar" :class="{ 'is-hidden-mobile': Boolean(selectedConversation) }">
        <BInput v-model:value="keyword" clearable :placeholder="t('ai.conversations.searchPlaceholder')">
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="14" aria-hidden="true" />
          </template>
        </BInput>
        <BTabs v-model:active-tab="status" variant="pill" :options="statusOptions" />

        <div v-if="loading" class="legacy-ai-archive__state" role="status">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <div v-else-if="!items.length" class="legacy-ai-archive__state">
          <SvgIcon :src="icon.ai.conversations" size="28" aria-hidden="true" />
          <strong>{{ keyword ? t('ai.conversations.noMatch') : t('ai.legacyArchive.empty') }}</strong>
          <small>{{ t('ai.legacyArchive.emptyHint') }}</small>
        </div>
        <div v-else class="legacy-ai-archive__list">
          <BCard
            v-for="conversation in items"
            :key="conversation.id"
            as="article"
            variant="panel"
            interactive
            padding="11px"
            radius="12px"
            :class="['legacy-ai-archive__item', { 'is-current': conversation.id === selectedId }]"
            role="button"
            tabindex="0"
            @click="openConversation(conversation.id)"
            @keydown.enter.self="openConversation(conversation.id)"
            @keydown.space.prevent.self="openConversation(conversation.id)"
          >
            <span>
              <strong>{{ conversation.title || t('ai.conversations.untitled') }}</strong>
              <small v-if="conversation.summary">{{ conversation.summary }}</small>
            </span>
            <time :datetime="conversation.lastMessageAt">{{ formatDate(conversation.lastMessageAt) }}</time>
          </BCard>
          <BButton v-if="nextCursor" :loading="loadingMore" @click="loadMore">
            {{ t('common.loadMore') }}
          </BButton>
        </div>
      </aside>

      <article class="legacy-ai-archive__detail" :class="{ 'is-hidden-mobile': !selectedConversation }">
        <div v-if="detailLoading" class="legacy-ai-archive__state" role="status">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <template v-else-if="selectedConversation">
          <header class="legacy-ai-archive__detail-header">
            <BButton class="legacy-ai-archive__back" :aria-label="t('common.back')" @click="closeDetail">
              <SvgIcon :src="icon.noteDetail.back" size="17" aria-hidden="true" />
            </BButton>
            <span>
              <strong>{{ selectedConversation.title || t('ai.conversations.untitled') }}</strong>
              <small>{{ t('ai.legacyArchive.readonlyHint') }}</small>
            </span>
            <BButton class="is-danger" :loading="deleting" @click="confirmDelete">
              <SvgIcon :src="icon.noteDetail.delete" size="15" aria-hidden="true" />
              {{ t('common.delete') }}
            </BButton>
          </header>

          <div class="legacy-ai-archive__messages">
            <section
              v-for="messageItem in visibleMessages"
              :key="messageItem.id"
              :class="['legacy-ai-archive__message', `is-${messageItem.role}`]"
            >
              <small>{{ messageRole(messageItem.role) }} · {{ formatDate(messageItem.createdAt) }}</small>
              <div
                v-if="messageItem.role === 'assistant'"
                class="legacy-ai-archive__markdown"
                v-html="renderMessage(messageItem.content)"
              ></div>
              <p v-else>{{ messageItem.content }}</p>
              <div v-if="messageItem.sources.length" class="legacy-ai-archive__sources">
                <span>{{ t('ai.legacyArchive.sources', { count: messageItem.sources.length }) }}</span>
                <span v-for="source in messageItem.sources" :key="source.sourceId">{{ source.title }}</span>
              </div>
            </section>
            <div v-if="!visibleMessages.length" class="legacy-ai-archive__state">
              <strong>{{ t('ai.legacyArchive.noMessages') }}</strong>
            </div>
          </div>
        </template>
        <div v-else class="legacy-ai-archive__state is-placeholder">
          <SvgIcon :src="icon.ai.conversations" size="32" aria-hidden="true" />
          <strong>{{ t('ai.legacyArchive.selectTitle') }}</strong>
          <small>{{ t('ai.legacyArchive.selectHint') }}</small>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    deleteAiConversation,
    exportAiCloudConversations,
    getAiConversation,
    listAiConversations,
    type AiCloudMessage,
    type AiConversation,
    type AiConversationStatus,
    type AiConversationSummary,
  } from '@/api/aiWorkspaceApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';

  const { t, locale } = useI18n();
  const items = ref<AiConversationSummary[]>([]);
  const selectedConversation = ref<AiConversation | null>(null);
  const selectedId = ref('');
  const status = ref<AiConversationStatus>('active');
  const keyword = ref('');
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const detailLoading = ref(false);
  const exporting = ref(false);
  const deleting = ref(false);
  let searchTimer: number | null = null;
  let detailSequence = 0;

  const statusOptions = computed(() => [
    { key: 'active', label: t('ai.conversations.active') },
    { key: 'archived', label: t('ai.conversations.archived') },
  ]);
  const visibleMessages = computed(() =>
    (selectedConversation.value?.messages || []).filter((item) => item.role !== 'system'),
  );

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
      if (selectedId.value && !items.value.some((item) => item.id === selectedId.value)) closeDetail();
    } catch {
      message.warning(t('ai.conversations.loadFailed'));
    } finally {
      loading.value = false;
      loadingMore.value = false;
    }
  }

  async function openConversation(conversationId: string) {
    const sequence = ++detailSequence;
    selectedId.value = conversationId;
    detailLoading.value = true;
    try {
      const result = await getAiConversation(conversationId, 300);
      if (sequence === detailSequence) selectedConversation.value = result;
    } catch {
      if (sequence === detailSequence) {
        closeDetail();
        message.warning(t('ai.conversations.loadFailed'));
      }
    } finally {
      if (sequence === detailSequence) detailLoading.value = false;
    }
  }

  function closeDetail() {
    detailSequence += 1;
    selectedId.value = '';
    selectedConversation.value = null;
    detailLoading.value = false;
  }

  function loadMore() {
    if (nextCursor.value && !loadingMore.value) void load(false);
  }

  function confirmDelete() {
    const conversation = selectedConversation.value;
    if (!conversation) return;
    Alert.alert({
      title: t('ai.conversations.deleteTitle'),
      content: t('ai.legacyArchive.deleteConfirm', {
        title: conversation.title || t('ai.conversations.untitled'),
      }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('common.delete'),
          type: 'danger',
          function: async () => {
            Alert.destroy();
            deleting.value = true;
            try {
              await deleteAiConversation(conversation.id);
              items.value = items.value.filter((item) => item.id !== conversation.id);
              closeDetail();
              message.success(t('ai.conversations.deleted'));
            } catch {
              message.warning(t('ai.conversations.deleteFailed'));
            } finally {
              deleting.value = false;
            }
          },
        },
      ],
    });
  }

  async function exportData() {
    if (exporting.value) return;
    exporting.value = true;
    try {
      const data = await exportAiCloudConversations();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date();
      const pad = (value: number) => String(value).padStart(2, '0');
      anchor.href = url;
      anchor.download = `light-note-ai-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
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

  function renderMessage(content: string) {
    return renderStreamingMarkdown(String(content || ''));
  }

  function messageRole(role: AiCloudMessage['role']) {
    return role === 'assistant' ? t('ai.legacyArchive.assistant') : t('ai.legacyArchive.user');
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  watch(status, () => {
    closeDetail();
    void load();
  });
  watch(keyword, () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 260);
  });
  onMounted(() => void load());
  onBeforeUnmount(() => {
    detailSequence += 1;
    if (searchTimer !== null) window.clearTimeout(searchTimer);
  });
</script>

<style scoped lang="less">
  .legacy-ai-archive {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    background: var(--background-color);
    color: var(--text-color);
  }

  .legacy-ai-archive__header {
    display: grid;
    min-height: 72px;
    padding: 14px 18px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .legacy-ai-archive__header > span:not(.legacy-ai-archive__heading-icon),
  .legacy-ai-archive__detail-header > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .legacy-ai-archive__header strong {
    font-size: 16px;
  }

  .legacy-ai-archive__header small,
  .legacy-ai-archive__detail-header small {
    color: var(--desc-color);
    line-height: 1.4;
  }

  .legacy-ai-archive__heading-icon {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 11px;
    color: var(--primary-color);
  }

  .legacy-ai-archive__header :deep(.b_btn),
  .legacy-ai-archive__detail-header :deep(.b_btn) {
    gap: 5px;
  }

  .legacy-ai-archive__layout {
    display: grid;
    min-height: 0;
    flex: 1 1 auto;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr);
  }

  .legacy-ai-archive__sidebar {
    display: flex;
    min-height: 0;
    padding: 14px;
    flex-direction: column;
    gap: 10px;
    border-right: 1px solid var(--surface-divider-color);
  }

  .legacy-ai-archive__list {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 8px;
    overflow: auto;
  }

  .legacy-ai-archive__item {
    display: grid;
    gap: 7px;
    cursor: pointer;
  }

  .legacy-ai-archive__item > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .legacy-ai-archive__item strong,
  .legacy-ai-archive__item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legacy-ai-archive__item small,
  .legacy-ai-archive__item time {
    color: var(--desc-color);
    font-size: 11px;
  }

  .legacy-ai-archive__item.is-current {
    outline: 1px solid var(--primary-color);
  }

  .legacy-ai-archive__item:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }

  .legacy-ai-archive__detail {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    background: var(--workspace-panel-bg-color, var(--background-color));
  }

  .legacy-ai-archive__detail-header {
    display: grid;
    min-height: 62px;
    padding: 12px 16px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .legacy-ai-archive__back {
    display: none;
  }

  .legacy-ai-archive__detail-header .is-danger {
    color: var(--danger-color, #d14343);
  }

  .legacy-ai-archive__messages {
    display: grid;
    min-height: 0;
    padding: 18px clamp(16px, 5vw, 72px) 40px;
    align-content: start;
    gap: 16px;
    overflow: auto;
  }

  .legacy-ai-archive__message {
    display: grid;
    max-width: min(760px, 92%);
    padding: 12px 14px;
    gap: 7px;
    border: 1px solid var(--surface-border-color, var(--border-color));
    border-radius: 14px;
    background: var(--background-color);
    line-height: 1.65;
  }

  .legacy-ai-archive__message.is-user {
    margin-left: auto;
    border-color: var(--primary-color);
  }

  .legacy-ai-archive__message > small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .legacy-ai-archive__message p {
    margin: 0;
    white-space: pre-wrap;
  }

  .legacy-ai-archive__markdown :deep(:first-child) {
    margin-top: 0;
  }

  .legacy-ai-archive__markdown :deep(:last-child) {
    margin-bottom: 0;
  }

  .legacy-ai-archive__sources {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .legacy-ai-archive__sources span:not(:first-child) {
    padding: 2px 7px;
    border: 1px solid var(--surface-border-color, var(--border-color));
    border-radius: 999px;
  }

  .legacy-ai-archive__state {
    display: grid;
    min-height: 140px;
    place-content: center;
    justify-items: center;
    gap: 6px;
    color: var(--desc-color);
    text-align: center;
  }

  .legacy-ai-archive__state.is-placeholder {
    min-height: 100%;
  }

  .legacy-ai-archive__state strong {
    color: var(--text-color);
  }

  @media (max-width: 700px) {
    .legacy-ai-archive__header {
      min-height: 64px;
      padding: 10px 12px;
    }

    .legacy-ai-archive__header small,
    .legacy-ai-archive__heading-icon {
      display: none;
    }

    .legacy-ai-archive__layout {
      display: block;
      overflow: hidden;
    }

    .legacy-ai-archive__sidebar,
    .legacy-ai-archive__detail {
      height: 100%;
      border: 0;
    }

    .legacy-ai-archive__sidebar.is-hidden-mobile,
    .legacy-ai-archive__detail.is-hidden-mobile {
      display: none;
    }

    .legacy-ai-archive__detail-header {
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 8px 10px;
    }

    .legacy-ai-archive__back {
      display: inline-flex;
      width: 36px;
      min-width: 36px;
      padding: 0;
    }

    .legacy-ai-archive__messages {
      padding: 14px 12px 32px;
    }

    .legacy-ai-archive__message {
      max-width: 94%;
    }
  }
</style>
