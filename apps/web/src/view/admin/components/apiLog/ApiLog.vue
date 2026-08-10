<template>
  <AdminDataPage
    eyebrow="Admin / API"
    :title="t('adminApiLog.title')"
    :subtitle="t('adminApiLog.subtitle')"
    :toolbar-hint="t('adminApiLog.toolbarHint')"
    :summary-count="total"
  >
    <template #actions>
      <BButton type="danger" @click="clearApiLogs">{{ t('adminApiLog.clear') }}</BButton>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="filters.keyword"
        class="log-filter log-filter--search"
        clearable
        :placeholder="t('adminApiLog.filters.keyword')"
        @input="scheduleSearch"
        @enter="reloadLogs"
      />
      <BInput
        v-model:value="filters.requestId"
        class="log-filter log-filter--request"
        clearable
        :placeholder="t('adminApiLog.filters.requestId')"
        @input="scheduleSearch"
        @enter="reloadLogs"
      />
      <BSelect v-model:value="filters.method" class="log-filter" :options="methodOptions" @change="reloadLogs" />
      <BSelect v-model:value="filters.status" class="log-filter" :options="statusOptions" @change="reloadLogs" />
      <BInput
        v-model:value="filters.minDurationMs"
        type="number"
        class="log-filter log-filter--duration"
        :placeholder="t('adminApiLog.filters.minDuration')"
        @enter="reloadLogs"
      />
      <BInput v-model:value="filters.startDate" type="date" class="log-filter log-filter--date" @change="reloadLogs" />
      <span class="log-filter-separator">{{ t('adminApiLog.filters.to') }}</span>
      <BInput v-model:value="filters.endDate" type="date" class="log-filter log-filter--date" @change="reloadLogs" />
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="filters.hideInternal" @change="reloadLogs" />
        {{ t('adminApiLog.filters.hideInternal') }}
      </span>
      <BButton @click="resetFilters">{{ t('adminApiLog.filters.reset') }}</BButton>
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      row-key="id"
      :data="logList"
      :columns="logColumns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      :row-height="48"
      @load-more="loadMore"
      @row-click="openDetail"
    >
      <template #bodyCell="{ text, record, column }">
        <BChip v-if="column.key === 'statusCode'" :tone="statusTone(record.statusCode)">
          {{ record.statusCode || '-' }}
        </BChip>
        <span v-else-if="column.key === 'durationMs'" :class="{ 'is-slow': Number(record.durationMs) >= 1000 }">
          {{ formatDuration(record.durationMs) }}
        </span>
        <span v-else-if="column.key === 'system'" :style="{ color: getApiLogOsColor(text?.os), fontSize: '12px' }">
          {{ text?.os || t('apiLog.unknown') }}
        </span>
        <span
          v-else-if="column.key === 'runtime'"
          :style="{ color: getApiLogRuntimeColor(record.system?.runtime), fontSize: '12px' }"
        >
          {{ t(getApiLogRuntimeLabelKey(record.system?.runtime))
          }}{{ getApiLogAppVersionSuffix(record.system?.runtime, record.system?.appVersion) }}
        </span>
        <code v-else-if="column.key === 'requestId'" class="api-log__request-id">{{ shortId(record.requestId) }}</code>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal
    v-model:visible="detailVisible"
    :title="t('adminApiLog.detail.title')"
    width="min(720px, 94vw)"
    :show-footer="false"
    :mask-closable="true"
    fullscreen-mobile
  >
    <dl v-if="selectedRecord" class="api-log-detail">
      <div
        ><dt>{{ t('adminApiLog.detail.time') }}</dt
        ><dd>{{ formatTime(selectedRecord.requestTime) }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.method') }}</dt
        ><dd>{{ selectedRecord.method || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.status') }}</dt
        ><dd>{{ selectedRecord.statusCode || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.duration') }}</dt
        ><dd>{{ formatDuration(selectedRecord.durationMs) }}</dd></div
      >
      <div class="is-wide"
        ><dt>{{ t('adminApiLog.detail.url') }}</dt
        ><dd>{{ selectedRecord.url || '-' }}</dd></div
      >
      <div class="is-wide"
        ><dt>{{ t('adminApiLog.detail.requestId') }}</dt
        ><dd
          ><code>{{ selectedRecord.requestId || '-' }}</code></dd
        ></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.user') }}</dt
        ><dd>{{ selectedRecord.alias || selectedRecord.email || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.ip') }}</dt
        ><dd>{{ selectedRecord.ip || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.location') }}</dt
        ><dd>{{ locationLabel(selectedRecord) }}</dd></div
      >
      <div
        ><dt>{{ t('adminApiLog.detail.browser') }}</dt
        ><dd>{{ selectedRecord.system?.browser || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('apiLog.operatingSystem') }}</dt
        ><dd>{{ selectedRecord.system?.os || t('apiLog.unknown') }}</dd></div
      >
      <div
        ><dt>{{ t('apiLog.runtime') }}</dt
        ><dd>{{ runtimeLabel(selectedRecord) }}</dd></div
      >
      <div class="is-wide">
        <dt>{{ t('adminApiLog.detail.payload') }}</dt>
        <dd>
          <pre>{{ payloadText(selectedRecord.req) }}</pre>
        </dd>
      </div>
    </dl>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore } from '@/store';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import {
    getApiLogAppVersionSuffix,
    getApiLogOsColor,
    getApiLogRuntimeColor,
    getApiLogRuntimeLabelKey,
  } from '@/utils/apiLogPresentation.ts';

  const { t, locale } = useI18n();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const filters = reactive({
    keyword: '',
    requestId: String(route.query.requestId || '').slice(0, 64),
    method: '',
    status: '',
    minDurationMs: '',
    startDate: '',
    endDate: '',
    hideInternal: true,
  });
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const hasLoaded = ref(false);
  let timer: number | null = null;

  const methodOptions = computed(() => [
    { value: '', label: t('adminApiLog.filters.allMethods') },
    ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value })),
  ]);
  const statusOptions = computed(() => [
    { value: '', label: t('adminApiLog.filters.allStatuses') },
    { value: 'success', label: t('adminApiLog.filters.success') },
    { value: '4xx', label: t('adminApiLog.filters.clientErrors') },
    { value: '5xx', label: t('adminApiLog.filters.serverErrors') },
    { value: 'errors', label: t('adminApiLog.filters.allErrors') },
  ]);
  const logColumns = computed(() =>
    bookmark.isMobile
      ? [
          { title: t('adminApiLog.columns.time'), key: 'requestTime', width: '150px' },
          { title: t('adminApiLog.columns.method'), key: 'method', width: '72px' },
          { title: t('adminApiLog.columns.status'), key: 'statusCode', width: '74px', ellipsis: false },
          { title: t('adminApiLog.columns.url'), key: 'url', width: 'minmax(180px, 1.6fr)' },
        ]
      : [
          { title: t('adminApiLog.columns.user'), key: 'alias', width: '130px' },
          { title: t('adminApiLog.columns.time'), key: 'requestTime', width: '160px' },
          { title: t('adminApiLog.columns.method'), key: 'method', width: '72px' },
          { title: t('adminApiLog.columns.status'), key: 'statusCode', width: '74px', ellipsis: false },
          { title: t('adminApiLog.columns.duration'), key: 'durationMs', width: '88px' },
          { title: t('adminApiLog.columns.url'), key: 'url', width: 'minmax(200px, 1.6fr)' },
          { title: t('adminApiLog.columns.requestId'), key: 'requestId', width: '118px' },
          { title: t('apiLog.operatingSystem'), key: 'system', width: '105px' },
          { title: t('apiLog.runtime'), key: 'runtime', width: '100px' },
        ],
  );

  const {
    items: logList,
    total,
    loading,
    hasMore,
    loadMore,
    reload,
    cancel,
  } = useAdminCursorList<any>({
    request: (cursor, limit) =>
      apiQueryPost('/api/common/getApiLogs', {
        cursor,
        limit,
        filters: {
          key: filters.keyword,
          requestId: filters.requestId,
          method: filters.method,
          status: filters.status,
          minDurationMs: filters.minDurationMs,
          startDate: filters.startDate,
          endDate: filters.endDate,
          hideInternal: filters.hideInternal,
        },
      }),
    onError: (_error, silent) => {
      if (!silent) message.error(t('common.requestFailedDescription'));
    },
  });

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }
  function scheduleSearch() {
    clearTimer();
    timer = window.setTimeout(() => reloadLogs({ silent: true }), 350);
  }
  async function reloadLogs(options: { silent?: boolean } = {}) {
    clearTimer();
    tableRef.value?.scrollToTop();
    const loaded = await reload(options);
    if (loaded) hasLoaded.value = true;
  }
  function resetFilters() {
    Object.assign(filters, {
      keyword: '',
      requestId: '',
      method: '',
      status: '',
      minDurationMs: '',
      startDate: '',
      endDate: '',
      hideInternal: true,
    });
    void reloadLogs();
  }
  function openDetail(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }
  function clearApiLogs() {
    Alert.alert({
      title: t('adminApiLog.clearTitle'),
      content: t('adminApiLog.clearConfirm'),
      onOk() {
        apiBaseGet('/api/common/clearApiLogs', {}).then((response: any) => {
          if (response?.status === 200) {
            message.success(t('adminApiLog.clearSuccess'));
            void reloadLogs();
          }
        });
      },
    });
  }
  function statusTone(value: unknown): 'success' | 'pending' | 'danger' | 'neutral' {
    const code = Number(value);
    if (code >= 500) return 'danger';
    if (code >= 400) return 'pending';
    if (code >= 200 && code < 400) return 'success';
    return 'neutral';
  }
  function formatDuration(value: unknown) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '-';
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
  }
  function formatTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : String(value);
  }
  function shortId(value: unknown) {
    const text = String(value || '');
    return text.length > 14 ? `${text.slice(0, 12)}…` : text || '-';
  }
  function payloadText(value: unknown) {
    if (value == null || value === '') return '-';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  function locationLabel(record: any) {
    return [record?.location?.province, record?.location?.city].filter(Boolean).join(' / ') || '-';
  }
  function runtimeLabel(record: any) {
    return `${t(getApiLogRuntimeLabelKey(record?.system?.runtime))}${getApiLogAppVersionSuffix(
      record?.system?.runtime,
      record?.system?.appVersion,
    )}`;
  }
  const handleVisibilityChange = () => {
    if (!document.hidden && hasLoaded.value) void reloadLogs({ silent: true });
  };

  onMounted(() => {
    void reloadLogs();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });
  onUnmounted(() => {
    clearTimer();
    cancel();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';

  .log-filter {
    width: 126px;
  }
  .log-filter--search {
    width: min(240px, 24vw);
  }
  .log-filter--request {
    width: min(210px, 21vw);
  }
  .log-filter--duration {
    width: 118px;
  }
  .log-filter--date {
    width: 138px;
  }
  .log-filter-separator {
    color: var(--sub-text-color);
    font-size: 12px;
  }
  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 12px;
    white-space: nowrap;
  }
  .is-slow {
    color: var(--error-color);
    font-weight: 600;
  }
  .api-log__request-id {
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .api-log-detail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 18px;
    margin: 0;
  }
  .api-log-detail > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .api-log-detail > div.is-wide {
    grid-column: 1 / -1;
  }
  .api-log-detail dt {
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .api-log-detail dd {
    min-width: 0;
    margin: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
  }
  .api-log-detail pre {
    max-height: 240px;
    margin: 0;
    padding: 10px;
    overflow: auto;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    font:
      12px/1.55 ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: @admin-bp-mobile) {
    .log-filter,
    .log-filter--search,
    .log-filter--request,
    .log-filter--duration,
    .log-filter--date {
      width: 100%;
    }
    .log-filter-separator {
      display: none;
    }
    .api-log-detail {
      grid-template-columns: 1fr;
    }
    .api-log-detail > div.is-wide {
      grid-column: auto;
    }
  }
</style>
