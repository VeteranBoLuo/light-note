<template>
  <section class="email-panel">
    <div class="email-stats">
      <div class="email-stat">
        <b>{{ stats.total }}</b>
        <span>{{ t('notificationAdmin.email.stats.total') }}</span>
      </div>
      <div class="email-stat is-accepted">
        <b>{{ stats.accepted }}</b>
        <span>{{ t('notificationAdmin.email.stats.accepted') }}</span>
      </div>
      <div class="email-stat is-failed">
        <b>{{ stats.failed }}</b>
        <span>{{ t('notificationAdmin.email.stats.failed') }}</span>
      </div>
      <div class="email-stat is-unknown">
        <b>{{ stats.unknown }}</b>
        <span>{{ t('notificationAdmin.email.stats.unknown') }}</span>
      </div>
    </div>

    <div class="email-toolbar">
      <BSelect v-model:value="filters.emailType" :options="typeOptions" mode="single" class="email-select" />
      <BSelect v-model:value="filters.status" :options="statusOptions" mode="single" class="email-select" />
      <BInput
        v-model:value="filters.keyword"
        :placeholder="t('notificationAdmin.email.filters.keyword')"
        class="email-keyword"
        clearable
        @enter="applyFilters"
      />
      <BInput v-model:value="filters.startDate" type="date" class="email-date" />
      <span class="email-date-separator">{{ t('notificationAdmin.email.filters.to') }}</span>
      <BInput v-model:value="filters.endDate" type="date" class="email-date" />
      <BButton type="primary" :loading="loading" @click="applyFilters">
        {{ t('notificationAdmin.email.filters.search') }}
      </BButton>
      <BButton :disabled="loading" @click="resetFilters">
        {{ t('notificationAdmin.email.filters.reset') }}
      </BButton>
    </div>

    <p class="email-scope-hint">{{ t('notificationAdmin.email.scopeHint') }}</p>

    <div class="email-table-card">
      <BTable
        :data="items"
        :columns="columns"
        :pagination="true"
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        :row-clickable="true"
        @row-click="openDetail"
        @page-change="onPageChange"
        @size-change="onSizeChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'subject'">
            <div class="email-subject">{{ asItem(record).subject }}</div>
            <div v-if="asItem(record).alias" class="email-secondary">{{ asItem(record).alias }}</div>
          </template>
          <template v-else-if="column.key === 'emailType'">
            <span class="email-type">{{ typeLabel(asItem(record).emailType) }}</span>
          </template>
          <template v-else-if="column.key === 'recipientEmail'">
            <span class="email-recipient">{{ asItem(record).recipientEmail }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <span class="email-status" :class="`is-${asItem(record).status}`">
              {{ statusLabel(asItem(record).status) }}
            </span>
          </template>
          <template v-else-if="column.key === 'attemptNo'">
            <span>{{ asItem(record).attemptNo }}</span>
          </template>
          <template v-else-if="column.key === 'createTime'">
            <span class="email-time">{{ formatTime(asItem(record).createTime) }}</span>
          </template>
        </template>
      </BTable>
    </div>

    <BModal
      v-model:visible="detailVisible"
      :title="t('notificationAdmin.email.detail.title')"
      width="min(680px, 94vw)"
      :show-footer="false"
    >
      <div v-if="detailLoading" class="email-detail-state">
        <BLoading inline loading :title="t('notificationAdmin.email.detail.loading')" />
      </div>
      <div v-else-if="detail" class="email-detail">
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.columns.status') }}</span>
          <b class="email-status" :class="`is-${detail.status}`">{{ statusLabel(detail.status) }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.columns.type') }}</span>
          <b>{{ typeLabel(detail.emailType) }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.columns.recipient') }}</span>
          <b>{{ detail.recipientEmail }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.columns.subject') }}</span>
          <b>{{ detail.subject }}</b>
        </div>
        <div v-if="detail.alias" class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.user') }}</span>
          <b>{{ detail.alias }}</b>
        </div>
        <div v-if="detail.todoTitle" class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.todo') }}</span>
          <b>{{ detail.todoTitle }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.provider') }}</span>
          <b>{{ detail.provider || '--' }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.columns.attempt') }}</span>
          <b>{{ detail.attemptNo }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.createdAt') }}</span>
          <b>{{ formatTime(detail.createTime) }}</b>
        </div>
        <div class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.acceptedAt') }}</span>
          <b>{{ formatTime(detail.acceptedAt) || '--' }}</b>
        </div>
        <div v-if="detail.providerMessageId" class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.messageId') }}</span>
          <code>{{ detail.providerMessageId }}</code>
        </div>
        <div v-if="detail.errorCode" class="email-detail-row">
          <span>{{ t('notificationAdmin.email.detail.errorCode') }}</span>
          <code>{{ detail.errorCode }}</code>
        </div>
        <div v-if="detail.errorMessage" class="email-detail-row is-multiline">
          <span>{{ t('notificationAdmin.email.detail.errorMessage') }}</span>
          <code>{{ detail.errorMessage }}</code>
        </div>
        <p class="email-detail-note">{{ t('notificationAdmin.email.detail.acceptedHint') }}</p>
      </div>
    </BModal>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import notificationApi from '@/api/notificationApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  interface EmailItem {
    id: string;
    emailType: string;
    userId: string | null;
    recipientEmail: string;
    subject: string;
    businessType: string | null;
    businessId: string | null;
    status: string;
    attemptNo: number;
    acceptedAt: string | null;
    createTime: string;
    updateTime: string;
    alias: string | null;
  }

  interface EmailDetail extends EmailItem {
    provider: string | null;
    providerMessageId: string | null;
    providerResponse: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    todoTitle: string | null;
  }

  const { t, locale } = useI18n();
  const loading = ref(false);
  const stats = ref({ total: 0, accepted: 0, failed: 0, unknown: 0 });
  const items = ref<EmailItem[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const filters = ref({
    emailType: 'all',
    status: 'all',
    keyword: '',
    startDate: '',
    endDate: '',
  });

  const typeOptions = computed(() => [
    { value: 'all', label: t('notificationAdmin.email.types.all') },
    { value: 'verification', label: t('notificationAdmin.email.types.verification') },
    { value: 'todo_reminder', label: t('notificationAdmin.email.types.todoReminder') },
    { value: 'system', label: t('notificationAdmin.email.types.system') },
  ]);
  const statusOptions = computed(() => [
    { value: 'all', label: t('notificationAdmin.email.statuses.all') },
    { value: 'sending', label: t('notificationAdmin.email.statuses.sending') },
    { value: 'accepted', label: t('notificationAdmin.email.statuses.accepted') },
    { value: 'failed', label: t('notificationAdmin.email.statuses.failed') },
    { value: 'unknown', label: t('notificationAdmin.email.statuses.unknown') },
  ]);
  const columns = computed(() => [
    { title: t('notificationAdmin.email.columns.subject'), key: 'subject', width: '1fr' },
    { title: t('notificationAdmin.email.columns.type'), key: 'emailType', width: '110px' },
    { title: t('notificationAdmin.email.columns.recipient'), key: 'recipientEmail', width: '180px' },
    { title: t('notificationAdmin.email.columns.status'), key: 'status', width: '110px' },
    { title: t('notificationAdmin.email.columns.attempt'), key: 'attemptNo', width: '72px' },
    { title: t('notificationAdmin.email.columns.time'), key: 'createTime', width: '170px' },
  ]);

  const detailVisible = ref(false);
  const detailLoading = ref(false);
  const detail = ref<EmailDetail | null>(null);

  function asItem(record: unknown): EmailItem {
    return record as EmailItem;
  }

  function typeLabel(value: string) {
    const key = value === 'verification' ? 'verification' : value === 'todo_reminder' ? 'todoReminder' : 'system';
    return t(`notificationAdmin.email.types.${key}`);
  }

  function statusLabel(value: string) {
    const key = ['sending', 'accepted', 'failed', 'unknown'].includes(value) ? value : 'unknown';
    return t(`notificationAdmin.email.statuses.${key}`);
  }

  function formatTime(value?: string | null) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toLocaleString(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { hour12: false });
  }

  async function loadStats() {
    const res = await notificationApi.getAdminEmailStats();
    if (res?.status === 200 && res.data) {
      stats.value = {
        total: Number(res.data.total || 0),
        accepted: Number(res.data.accepted || 0),
        failed: Number(res.data.failed || 0),
        unknown: Number(res.data.unknown || 0),
      };
    }
  }

  async function loadList() {
    loading.value = true;
    try {
      const res = await notificationApi.getAdminEmailList({
        currentPage: currentPage.value,
        pageSize: pageSize.value,
        emailType: filters.value.emailType,
        status: filters.value.status,
        keyword: filters.value.keyword.trim(),
        startDate: filters.value.startDate || undefined,
        endDate: filters.value.endDate || undefined,
      });
      if (res?.status === 200 && res.data) {
        items.value = res.data.items || [];
        total.value = Number(res.data.total || 0);
      }
    } catch {
      message.warning(t('notificationAdmin.email.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    await Promise.all([loadStats(), loadList()]);
  }

  function applyFilters() {
    currentPage.value = 1;
    refresh();
  }

  function resetFilters() {
    filters.value = { emailType: 'all', status: 'all', keyword: '', startDate: '', endDate: '' };
    currentPage.value = 1;
    refresh();
  }

  function onPageChange(page: number) {
    currentPage.value = page;
    loadList();
  }

  function onSizeChange(size: number) {
    pageSize.value = size;
    currentPage.value = 1;
    loadList();
  }

  async function openDetail(record: unknown) {
    const item = asItem(record);
    detailVisible.value = true;
    detailLoading.value = true;
    detail.value = null;
    try {
      const res = await notificationApi.getAdminEmailDetail(item.id);
      if (res?.status === 200 && res.data) detail.value = res.data;
    } catch {
      message.warning(t('notificationAdmin.email.detail.loadFailed'));
    } finally {
      detailLoading.value = false;
    }
  }

  defineExpose({ refresh });
  onMounted(refresh);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .email-panel {
    min-width: 0;
  }
  .email-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .email-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .email-stat b {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  .email-stat span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .email-stat.is-accepted b {
    color: var(--success-color);
  }
  .email-stat.is-failed b {
    color: var(--danger-color);
  }
  .email-stat.is-unknown b {
    color: var(--warning-color);
  }
  .email-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .email-select {
    width: 150px;
  }
  .email-keyword {
    width: min(280px, 100%);
  }
  .email-date {
    width: 148px;
  }
  .email-date-separator {
    color: var(--desc-color);
    font-size: 12px;
  }
  .email-scope-hint {
    margin: 10px 2px 14px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .email-table-card {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .email-subject {
    color: var(--text-color);
    font-weight: 600;
  }
  .email-secondary,
  .email-time {
    color: var(--desc-color);
    font-size: 12px;
  }
  .email-recipient {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  .email-type,
  .email-status {
    display: inline-flex;
    align-items: center;
    width: max-content;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--hover-background);
    font-size: 12px;
  }
  .email-status.is-accepted {
    color: var(--success-color, #16845b);
    background: color-mix(in srgb, var(--success-color) 12%, transparent);
  }
  .email-status.is-failed {
    color: var(--danger-color, #d43c45);
    background: color-mix(in srgb, var(--danger-color) 12%, transparent);
  }
  .email-status.is-sending {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }
  .email-status.is-unknown {
    color: var(--warning-color, #b45309);
    background: color-mix(in srgb, var(--warning-color) 13%, transparent);
  }
  .email-detail-state {
    padding: 32px 0;
    color: var(--desc-color);
    text-align: center;
  }
  .email-detail {
    display: grid;
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--surface-border-color);
  }
  .email-detail-row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    padding: 11px 14px;
    background: var(--card-background);
  }
  .email-detail-row > span:first-child {
    color: var(--desc-color);
    font-size: 12px;
  }
  .email-detail-row b,
  .email-detail-row code {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-size: 13px;
  }
  .email-detail-row.is-multiline {
    align-items: flex-start;
  }
  .email-detail-note {
    margin: 0;
    padding: 12px 14px;
    background: var(--card-background);
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  @media (max-width: @admin-bp-mobile) {
    .email-select,
    .email-keyword,
    .email-date {
      width: 100%;
    }
    .email-date-separator {
      display: none;
    }
    .email-detail-row {
      grid-template-columns: 1fr;
      gap: 5px;
    }
  }
</style>
