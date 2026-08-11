<template>
  <AdminDataPage
    eyebrow="Admin / Audit"
    :title="t('adminAudit.title')"
    :subtitle="t('adminAudit.subtitle')"
    :toolbar-hint="t('adminAudit.toolbarHint')"
    :summary-count="total"
    layout="scroll"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminAudit.metrics.total7d') }}</span>
        <strong class="admin-stat-value">{{ number(summary.total) }}</strong>
        <span class="admin-stat-hint">{{ t('adminAudit.metrics.totalHint') }}</span>
      </li>
      <li class="admin-stat-card is-success">
        <span class="admin-stat-label">{{ t('adminAudit.metrics.succeeded') }}</span>
        <strong class="admin-stat-value">{{ number(summary.succeeded) }}</strong>
        <span class="admin-stat-hint">{{ t('adminAudit.metrics.succeededHint') }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-danger': numberValue(summary.failed) > 0 }">
        <span class="admin-stat-label">{{ t('adminAudit.metrics.failed') }}</span>
        <strong class="admin-stat-value">{{ number(summary.failed) }}</strong>
        <span class="admin-stat-hint">{{ t('adminAudit.metrics.failedHint') }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-warning': numberValue(summary.denied) > 0 }">
        <span class="admin-stat-label">{{ t('adminAudit.metrics.denied') }}</span>
        <strong class="admin-stat-value">{{ number(summary.denied) }}</strong>
        <span class="admin-stat-hint">{{
          t('adminAudit.metrics.actionHint', {
            jobs: number(summary.jobRetries),
            feedback: number(summary.feedbackTriages),
          })
        }}</span>
      </li>
    </template>

    <template #toolbar>
      <BSelect v-model:value="filters.action" class="admin-audit__select" :options="actionOptions" />
      <BSelect v-model:value="filters.outcome" class="admin-audit__select" :options="outcomeOptions" />
      <BInput
        v-model:value="filters.keyword"
        class="admin-audit__search"
        clearable
        :placeholder="t('adminAudit.filters.keyword')"
        @enter="applyFilters"
      />
      <DateRangePicker
        class="admin-audit__range"
        initial-preset="all"
        :start="filters.startDate"
        :end="filters.endDate"
        @change="onDateRangeChange"
      />
      <BButton type="primary" :loading="loading" @click="applyFilters">{{ t('adminAudit.filters.search') }}</BButton>
      <BButton :disabled="loading" @click="resetFilters">{{ t('adminAudit.filters.reset') }}</BButton>
    </template>

    <div v-if="bookmark.isMobile" class="admin-audit__cards">
      <BCard v-for="item in items" :key="item.id" as="article" padding="14px" class="admin-audit__card">
        <header>
          <div>
            <strong>{{ actionLabel(item.action) }}</strong>
            <small>{{ formatTime(item.createTime) }}</small>
          </div>
          <BChip :tone="outcomeTone(item.outcome)">{{ outcomeLabel(item.outcome) }}</BChip>
        </header>
        <dl>
          <div
            ><dt>{{ t('adminAudit.columns.actor') }}</dt
            ><dd>{{ actorLabel(item) }}</dd></div
          >
          <div
            ><dt>{{ t('adminAudit.columns.target') }}</dt
            ><dd>{{ targetLabel(item) }}</dd></div
          >
          <div
            ><dt>{{ t('adminAudit.columns.reason') }}</dt
            ><dd>{{ item.reason || '-' }}</dd></div
          >
        </dl>
        <BButton size="small" @click="openDetail(item)">{{ t('common.detail') }}</BButton>
      </BCard>
      <div v-if="!items.length && !loading" class="admin-audit__empty">{{ t('adminAudit.empty') }}</div>
      <BPagination
        :current="currentPage"
        :page-size="pageSize"
        :total="total"
        @page-change="changePage"
        @size-change="changeSize"
      />
    </div>

    <BTable
      v-else
      fill
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      :row-clickable="true"
      @row-click="openDetail"
      @page-change="changePage"
      @size-change="changeSize"
    >
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'action'" class="admin-audit__action-cell">
          <strong>{{ actionLabel(asItem(record).action) }}</strong>
          <small>{{ asItem(record).targetType || '-' }}</small>
        </div>
        <BChip v-else-if="column.key === 'outcome'" :tone="outcomeTone(asItem(record).outcome)">{{
          outcomeLabel(asItem(record).outcome)
        }}</BChip>
        <span v-else-if="column.key === 'actor'">{{ actorLabel(asItem(record)) }}</span>
        <span v-else-if="column.key === 'target'" class="admin-audit__target">{{ targetLabel(asItem(record)) }}</span>
        <span v-else-if="column.key === 'reason'" class="admin-audit__reason">{{ asItem(record).reason || '-' }}</span>
        <span v-else-if="column.key === 'createTime'">{{ formatTime(asItem(record).createTime) }}</span>
      </template>
    </BTable>

    <BModal
      v-model:visible="detailVisible"
      :title="t('adminAudit.detail.title')"
      width="min(680px, 94vw)"
      :show-footer="false"
      fullscreen-mobile
    >
      <dl v-if="detail" class="admin-audit__detail">
        <div
          ><dt>{{ t('adminAudit.columns.action') }}</dt
          ><dd>{{ actionLabel(detail.action) }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.columns.outcome') }}</dt
          ><dd>{{ outcomeLabel(detail.outcome) }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.columns.actor') }}</dt
          ><dd>{{ actorLabel(detail) }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.columns.target') }}</dt
          ><dd>{{ targetLabel(detail) }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.columns.reason') }}</dt
          ><dd>{{ detail.reason || '-' }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.detail.requestId') }}</dt
          ><dd
            ><code>{{ detail.requestId || '-' }}</code></dd
          ></div
        >
        <div
          ><dt>{{ t('adminAudit.detail.ip') }}</dt
          ><dd>{{ detail.ipMasked || '-' }}</dd></div
        >
        <div
          ><dt>{{ t('adminAudit.detail.time') }}</dt
          ><dd>{{ formatTime(detail.createTime) }}</dd></div
        >
        <div class="is-wide">
          <dt>{{ t('adminAudit.detail.metadata') }}</dt>
          <dd>
            <pre>{{ metadataText(detail.metadata) }}</pre>
          </dd>
        </div>
      </dl>
    </BModal>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import DateRangePicker from '@/view/admin/components/conversion/DateRangePicker.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { getAdminOperationAudits } from '@/api/commonApi';
  import { bookmarkStore } from '@/store';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';

  interface AuditItem {
    id: string;
    actorUserId: string;
    actorAlias?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    outcome: string;
    reason?: string;
    requestId?: string | null;
    ipMasked?: string | null;
    metadata?: Record<string, unknown>;
    createTime: string;
  }

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const items = ref<AuditItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const summary = ref<Record<string, number>>({});
  const filters = ref({ action: 'all', outcome: 'all', keyword: '', startDate: '', endDate: '' });
  const detailVisible = ref(false);
  const detail = ref<AuditItem | null>(null);

  const actionOptions = computed(() => [
    { value: 'all', label: t('adminAudit.actions.all') },
    { value: 'async_job.retry', label: t('adminAudit.actions.jobRetry') },
    { value: 'ai_feedback.triage', label: t('adminAudit.actions.feedbackTriage') },
  ]);
  const outcomeOptions = computed(() => [
    { value: 'all', label: t('adminAudit.outcomes.all') },
    { value: 'succeeded', label: t('adminAudit.outcomes.succeeded') },
    { value: 'failed', label: t('adminAudit.outcomes.failed') },
    { value: 'denied', label: t('adminAudit.outcomes.denied') },
    { value: 'intent', label: t('adminAudit.outcomes.intent') },
  ]);
  const columns = computed<Column[]>(() => [
    { key: 'action', title: t('adminAudit.columns.action'), width: 'minmax(150px, 1fr)' },
    { key: 'outcome', title: t('adminAudit.columns.outcome'), width: '100px' },
    { key: 'actor', title: t('adminAudit.columns.actor'), width: '150px' },
    { key: 'target', title: t('adminAudit.columns.target'), width: 'minmax(150px, 1fr)' },
    { key: 'reason', title: t('adminAudit.columns.reason'), width: 'minmax(180px, 1.3fr)' },
    { key: 'createTime', title: t('adminAudit.columns.time'), width: '170px' },
  ]);

  function numberValue(value: unknown) {
    return Number(value || 0);
  }
  function number(value: unknown) {
    return numberValue(value).toLocaleString(locale.value);
  }
  function asItem(value: unknown) {
    return value as AuditItem;
  }
  function actionLabel(action: string) {
    const key =
      action === 'async_job.retry' ? 'jobRetry' : action === 'ai_feedback.triage' ? 'feedbackTriage' : 'unknown';
    return t(`adminAudit.actions.${key}`);
  }
  function outcomeLabel(outcome: string) {
    const key = ['intent', 'succeeded', 'failed', 'denied'].includes(outcome) ? outcome : 'unknown';
    return t(`adminAudit.outcomes.${key}`);
  }
  function outcomeTone(outcome: string): 'success' | 'danger' | 'pending' | 'neutral' {
    if (outcome === 'succeeded') return 'success';
    if (outcome === 'failed') return 'danger';
    if (outcome === 'denied') return 'pending';
    return 'neutral';
  }
  function actorLabel(item: AuditItem) {
    return item.actorAlias || item.actorUserId || '-';
  }
  function targetLabel(item: AuditItem) {
    return [item.targetType, item.targetId].filter(Boolean).join(' / ') || '-';
  }
  function formatTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : String(value);
  }
  function metadataText(value?: Record<string, unknown>) {
    return JSON.stringify(value || {}, null, 2);
  }
  function openDetail(item: AuditItem) {
    detail.value = item;
    detailVisible.value = true;
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const response: any = await getAdminOperationAudits({
        ...filters.value,
        currentPage: currentPage.value,
        pageSize: pageSize.value,
      });
      if (response?.status !== 200) throw new Error(response?.msg || t('adminAudit.loadFailed'));
      items.value = Array.isArray(response.data?.items) ? response.data.items : [];
      total.value = Number(response.data?.total || 0);
      summary.value = response.data?.summary7d || {};
    } catch (error: any) {
      message.error(error?.message || t('adminAudit.loadFailed'));
    } finally {
      loading.value = false;
    }
  }
  function applyFilters() {
    currentPage.value = 1;
    load();
  }
  function onDateRangeChange(start?: string, end?: string) {
    filters.value.startDate = start || '';
    filters.value.endDate = end || '';
  }
  function resetFilters() {
    filters.value = { action: 'all', outcome: 'all', keyword: '', startDate: '', endDate: '' };
    currentPage.value = 1;
    load();
  }
  function changePage(page: number) {
    currentPage.value = page;
    load();
  }
  function changeSize(size: number) {
    pageSize.value = size;
    currentPage.value = 1;
    load();
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .admin-audit__select {
    width: 150px;
  }
  .admin-audit__search {
    width: min(260px, 25vw);
  }
  .admin-audit__range {
    width: 210px;
  }
  .admin-audit__range :deep(.drp-trigger.b_btn) {
    width: 100%;
    justify-content: space-between;
  }
  .admin-stat-card.is-success {
    border-color: #2f9e68 !important;
  }
  .admin-stat-card.has-danger {
    border-color: var(--danger-color, #e5484d) !important;
  }
  .admin-stat-card.has-warning {
    border-color: #d97706 !important;
  }
  .admin-audit__action-cell {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .admin-audit__action-cell small {
    color: var(--sub-text-color);
  }
  .admin-audit__target,
  .admin-audit__reason {
    overflow-wrap: anywhere;
  }
  .admin-audit__cards {
    display: grid;
    gap: 10px;
  }
  .admin-audit__card {
    box-shadow: none;
  }
  .admin-audit__card header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .admin-audit__card header > div {
    display: grid;
    gap: 3px;
  }
  .admin-audit__card small,
  .admin-audit__card dt {
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .admin-audit__card dl {
    display: grid;
    gap: 7px;
  }
  .admin-audit__card dl > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px;
  }
  .admin-audit__card dd,
  .admin-audit__card dt {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .admin-audit__empty {
    min-height: 160px;
    display: grid;
    place-content: center;
    color: var(--sub-text-color);
  }
  .admin-audit__detail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .admin-audit__detail > div {
    min-width: 0;
    display: grid;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .admin-audit__detail .is-wide {
    grid-column: 1 / -1;
  }
  .admin-audit__detail dt,
  .admin-audit__detail dd {
    margin: 0;
  }
  .admin-audit__detail dt {
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .admin-audit__detail dd {
    overflow-wrap: anywhere;
  }
  .admin-audit__detail pre {
    max-height: 260px;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    font-size: 12px;
  }

  @media (max-width: 767px) {
    .admin-audit__select,
    .admin-audit__search,
    .admin-audit__range {
      width: 100%;
    }
    .admin-audit__card :deep(.b-button) {
      min-height: 44px;
    }
    .admin-audit__detail {
      grid-template-columns: 1fr;
    }
    .admin-audit__detail .is-wide {
      grid-column: auto;
    }
  }
</style>
