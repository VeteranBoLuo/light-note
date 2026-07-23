<template>
  <AdminDataPage
    eyebrow="Admin / AI"
    :title="t('aiFeedback.title')"
    :subtitle="t('aiFeedback.subtitle')"
    :toolbar-hint="t('aiFeedback.toolbarHint')"
    :summary-count="total"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiFeedback.metrics.total') }}</span>
        <strong class="admin-stat-value">{{ summary.total }}</strong>
        <span class="admin-stat-hint">{{ t('aiFeedback.metrics.totalHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiFeedback.metrics.helpful') }}</span>
        <strong class="admin-stat-value is-helpful">{{ summary.helpful }}</strong>
        <span class="admin-stat-hint">{{ t('aiFeedback.metrics.helpfulHint', { rate: helpfulRate }) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiFeedback.metrics.unhelpful') }}</span>
        <strong class="admin-stat-value is-unhelpful">{{ summary.unhelpful }}</strong>
        <span class="admin-stat-hint">{{ t('aiFeedback.metrics.unhelpfulHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiFeedback.metrics.pending') }}</span>
        <strong class="admin-stat-value">{{ summary.pending }}</strong>
        <span class="admin-stat-hint">{{ reasonSummary }}</span>
      </li>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="keyword"
        class="ai-feedback__search"
        :placeholder="t('aiFeedback.searchPlaceholder')"
        @input="scheduleFetch"
      />
      <BSelect v-model:value="rating" class="ai-feedback__filter" :options="ratingOptions" @change="resetAndFetch" />
      <BSelect
        v-model:value="resolved"
        class="ai-feedback__filter"
        :options="resolvedOptions"
        @change="resetAndFetch"
      />
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="hideInternal" @change="resetAndFetch" />
        {{ t('aiFeedback.hideInternal') }}
      </span>
    </template>

    <BTable
      fill
      row-key="id"
      :data="items"
      :columns="columns"
      :row-clickable="true"
      :pagination="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @row-click="openDetail"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'rating'" class="ai-feedback__rating" :class="`is-${record.rating}`">
          {{ ratingLabel(record.rating) }}
        </span>
        <span v-else-if="column.key === 'reason'">{{ reasonLabel(record.reason) }}</span>
        <span
          v-else-if="column.key === 'resolved'"
          class="ai-feedback__status"
          :class="{ 'is-pending': isPending(record) }"
        >
          {{ isPending(record) ? t('aiFeedback.status.pending') : t('aiFeedback.status.resolved') }}
        </span>
        <span v-else-if="column.key === 'createdAt'">{{ formatTime(record.createdAt) }}</span>
        <span v-else class="ai-feedback__cell">{{ record[column.key] || '-' }}</span>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal
    v-model:visible="detailVisible"
    :title="t('aiFeedback.detailTitle')"
    width="min(820px, 94vw)"
    :show-footer="false"
  >
    <div v-if="selected" class="ai-feedback-detail">
      <div class="ai-feedback-detail__meta">
        <span class="ai-feedback__rating" :class="`is-${selected.rating}`">{{ ratingLabel(selected.rating) }}</span>
        <span>{{ t('aiFeedback.detail.user', { user: selected.userAlias || t('aiFeedback.unknownUser') }) }}</span>
        <span>{{ formatTime(selected.createdAt) }}</span>
        <span>{{ t('aiFeedback.detail.request', { id: selected.requestId || '-' }) }}</span>
      </div>
      <div class="ai-feedback-detail__block">
        <label>{{ t('aiFeedback.detail.reason') }}</label>
        <p>{{ reasonLabel(selected.reason) }}</p>
      </div>
      <div v-if="selected.comment" class="ai-feedback-detail__block">
        <label>{{ t('aiFeedback.detail.comment') }}</label>
        <p>{{ selected.comment }}</p>
      </div>
      <div class="ai-feedback-detail__block">
        <label>{{ t('aiFeedback.detail.question') }}</label>
        <pre>{{ selected.question || selected.conversationTitle || t('aiFeedback.questionUnavailable') }}</pre>
      </div>
      <div class="ai-feedback-detail__block">
        <label>{{ t('aiFeedback.detail.answer') }}</label>
        <pre>{{ selected.answer }}</pre>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  type Rating = 'helpful' | 'unhelpful';
  type FeedbackItem = {
    id: string;
    conversationId: string;
    messageId: string;
    requestId: string | null;
    rating: Rating;
    reason: string | null;
    resolved: boolean | null;
    comment: string;
    userAlias: string;
    conversationTitle: string;
    question: string;
    answer: string;
    createdAt: string;
    updatedAt: string;
  };

  const { t } = useI18n();
  const items = ref<FeedbackItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const keyword = ref('');
  const rating = ref('');
  const resolved = ref('');
  const hideInternal = ref(true);
  const detailVisible = ref(false);
  const selected = ref<FeedbackItem | null>(null);
  const summary = ref({ total: 0, helpful: 0, unhelpful: 0, pending: 0 });
  const reasons = ref<{ reason: string; count: number }[]>([]);
  let searchTimer: number | null = null;

  const ratingOptions = computed(() => [
    { value: '', label: t('aiFeedback.filters.allRatings') },
    { value: 'helpful', label: t('aiFeedback.rating.helpful') },
    { value: 'unhelpful', label: t('aiFeedback.rating.unhelpful') },
  ]);
  const resolvedOptions = computed(() => [
    { value: '', label: t('aiFeedback.filters.allStatus') },
    { value: 'pending', label: t('aiFeedback.status.pending') },
    { value: 'resolved', label: t('aiFeedback.status.resolved') },
  ]);
  const columns = computed(() => [
    { title: t('aiFeedback.columns.rating'), key: 'rating', width: '90px', ellipsis: false },
    { title: t('aiFeedback.columns.question'), key: 'question', width: '1.4fr', ellipsis: true },
    { title: t('aiFeedback.columns.answer'), key: 'answer', width: '1.8fr', ellipsis: true },
    { title: t('aiFeedback.columns.reason'), key: 'reason', width: '112px', ellipsis: true },
    { title: t('aiFeedback.columns.user'), key: 'userAlias', width: '110px', ellipsis: true },
    { title: t('aiFeedback.columns.status'), key: 'resolved', width: '88px', ellipsis: false },
    { title: t('aiFeedback.columns.time'), key: 'createdAt', width: '150px', ellipsis: false },
  ]);
  const helpfulRate = computed(() =>
    summary.value.total ? ((summary.value.helpful / summary.value.total) * 100).toFixed(1) : '0.0',
  );
  const reasonSummary = computed(() => {
    const top = reasons.value[0];
    return top
      ? t('aiFeedback.topReason', { reason: reasonLabel(top.reason), count: top.count })
      : t('aiFeedback.noUnhelpful');
  });

  function isPending(item: FeedbackItem) {
    return item.rating === 'unhelpful' && item.resolved !== true;
  }

  function ratingLabel(value: Rating) {
    return t(`aiFeedback.rating.${value}`);
  }

  function reasonLabel(value: string | null) {
    if (!value) return t('aiFeedback.noReason');
    return t(`aiFeedback.reasons.${value}`);
  }

  function formatTime(value: string) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async function fetchFeedback() {
    const res = await apiBasePost('/api/common/getAiFeedback', {
      keyword: keyword.value || undefined,
      rating: rating.value || undefined,
      resolved: resolved.value || undefined,
      hideInternal: hideInternal.value,
      currentPage: currentPage.value,
      pageSize: pageSize.value,
    });
    if (res.status !== 200) return;
    items.value = Array.isArray(res.data?.items) ? res.data.items : [];
    total.value = Number(res.data?.total || 0);
    summary.value = { ...summary.value, ...(res.data?.summary || {}) };
    reasons.value = Array.isArray(res.data?.reasons) ? res.data.reasons : [];
  }

  function resetAndFetch() {
    currentPage.value = 1;
    void fetchFeedback();
  }

  function scheduleFetch() {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(resetAndFetch, 400);
  }

  function onPageChange(page: number) {
    currentPage.value = page;
    void fetchFeedback();
  }

  function onSizeChange(_: number, size: number) {
    pageSize.value = size;
    currentPage.value = 1;
    void fetchFeedback();
  }

  function openDetail(item: FeedbackItem) {
    selected.value = item;
    detailVisible.value = true;
  }

  onMounted(() => void fetchFeedback());
  onBeforeUnmount(() => {
    if (searchTimer) window.clearTimeout(searchTimer);
  });
</script>

<style scoped lang="less">
  .ai-feedback__search {
    width: min(320px, 34vw);
  }

  .ai-feedback__filter {
    width: 132px;
  }

  .admin-stat-value.is-helpful,
  .ai-feedback__rating.is-helpful {
    color: var(--resource-note-color);
  }

  .admin-stat-value.is-unhelpful,
  .ai-feedback__rating.is-unhelpful {
    color: var(--error-color, #e5484d);
  }

  .ai-feedback__rating,
  .ai-feedback__status {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 7px;
    box-sizing: border-box;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 9%, transparent);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }

  .ai-feedback__cell {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-feedback__status {
    color: var(--resource-note-color);

    &.is-pending {
      color: var(--error-color, #e5484d);
    }
  }

  .ai-feedback-detail {
    display: grid;
    gap: 14px;
  }

  .ai-feedback-detail__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .ai-feedback-detail__block {
    display: grid;
    gap: 5px;

    label {
      color: var(--sub-text-color);
      font-size: 12px;
      font-weight: 600;
    }

    p,
    pre {
      margin: 0;
      color: var(--text-color);
      font: inherit;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    pre {
      max-height: 260px;
      padding: 10px 12px;
      overflow: auto;
      border-radius: 8px;
    }
  }

  @media (max-width: 767px) {
    .ai-feedback__search,
    .ai-feedback__filter {
      width: 100%;
    }
  }
</style>
