<template>
  <AdminDataPage
    eyebrow="Admin / Operation"
    :title="t('adminOperationLog.title')"
    :subtitle="t('adminOperationLog.subtitle')"
    :toolbar-hint="t('adminOperationLog.toolbarHint')"
    :summary-count="total"
    :back-to="returnTo || undefined"
  >
    <template #actions>
      <BButton v-if="returnTo && !bookmark.isMobile" @click="goBackToUserManagement">
        {{ t('adminOperationLog.backToUserManagement') }}
      </BButton>
      <BButton type="danger" @click="clearOperationLogs">{{ t('adminOperationLog.clear') }}</BButton>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="filters.keyword"
        class="operation-filter operation-filter--search"
        clearable
        :placeholder="t('adminOperationLog.filters.keyword')"
        @input="scheduleSearch"
        @enter="reloadLogs"
      />
      <BInput
        v-model:value="filters.module"
        class="operation-filter"
        clearable
        :placeholder="t('adminOperationLog.filters.module')"
        @input="scheduleSearch"
        @enter="reloadLogs"
      />
      <BInput
        v-model:value="filters.userId"
        class="operation-filter operation-filter--user"
        clearable
        :placeholder="t('adminOperationLog.filters.userId')"
        @input="scheduleSearch"
        @enter="reloadLogs"
      />
      <DateRangePicker
        class="operation-filter--range"
        initial-preset="all"
        :start="filters.startDate"
        :end="filters.endDate"
        @change="onDateRangeChange"
      />
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="filters.hideInternal" @change="reloadLogs" />
        {{ t('adminOperationLog.filters.hideInternal') }}
      </span>
      <BButton @click="resetFilters">{{ t('adminOperationLog.filters.reset') }}</BButton>
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      row-key="id"
      :data="logList"
      :columns="columns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      :row-height="48"
      @load-more="loadMore"
      @row-click="openDetail"
    >
      <template #bodyCell="{ text, record, column }">
        <span v-if="column.key === 'user'" class="admin-log-mobile-user">{{
          record.alias || record.email || '-'
        }}</span>
        <span v-else-if="column.key === 'mobileTime'" class="admin-log-mobile-time">{{
          formatTimeOnly(record.createTime)
        }}</span>
        <span
          v-else-if="column.key === 'mobileOperation'"
          class="admin-log-mobile-operation"
          :title="record.operation || ''"
          >{{ record.operation || '-' }}</span
        >
        <span v-else-if="column.key === 'system'" :style="{ color: getApiLogOsColor(text?.os), fontSize: '12px' }">
          {{ text?.os || t('apiLog.unknown') }}
        </span>
        <span
          v-else-if="column.key === 'runtime'"
          :style="{ color: getApiLogRuntimeColor(record.system?.runtime), fontSize: '12px' }"
        >
          {{ runtimeLabel(record) }}
        </span>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal
    v-model:visible="detailVisible"
    :title="t('adminOperationLog.detail.title')"
    width="min(620px, 94vw)"
    :show-footer="false"
    :mask-closable="true"
    content-class="admin-log-detail-content"
    fullscreen-mobile
  >
    <dl v-if="selectedRecord" class="operation-detail">
      <div
        ><dt>{{ t('adminOperationLog.detail.user') }}</dt
        ><dd>{{ selectedRecord.alias || selectedRecord.email || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminOperationLog.detail.userId') }}</dt
        ><dd
          ><code>{{ selectedRecord.createBy || '-' }}</code></dd
        ></div
      >
      <div
        ><dt>{{ t('adminOperationLog.detail.module') }}</dt
        ><dd>{{ selectedRecord.module || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminOperationLog.detail.operation') }}</dt
        ><dd>{{ selectedRecord.operation || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminOperationLog.detail.ip') }}</dt
        ><dd>{{ selectedRecord.ip || '-' }}</dd></div
      >
      <div
        ><dt>{{ t('adminOperationLog.detail.time') }}</dt
        ><dd>{{ formatTime(selectedRecord.createTime) }}</dd></div
      >
      <div
        ><dt>{{ t('apiLog.operatingSystem') }}</dt
        ><dd>{{ selectedRecord.system?.os || t('apiLog.unknown') }}</dd></div
      >
      <div
        ><dt>{{ t('apiLog.runtime') }}</dt
        ><dd>{{ runtimeLabel(selectedRecord) }}</dd></div
      >
    </dl>
  </BModal>

  <AdminRiskActionModal
    v-model:visible="clearVisible"
    :title="t('adminOperationLog.clearTitle')"
    :impact="t('adminOperationLog.clearConfirm')"
    confirm-phrase="确认清理日志"
    :loading="clearing"
    @confirm="confirmClearOperationLogs"
  />
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import DateRangePicker from '@/view/admin/components/conversion/DateRangePicker.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore } from '@/store';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import {
    getApiLogAppVersionSuffix,
    getApiLogOsColor,
    getApiLogRuntimeColor,
    getApiLogRuntimeLabelKey,
  } from '@/utils/apiLogPresentation.ts';

  // 移动端路由外壳会向页面组件透传布局 style；本页包含多个根节点，
  // 该属性无法安全落到唯一根节点，显式丢弃可避免无意义的 Vue 警告。
  defineOptions({ inheritAttrs: false });

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const filters = reactive({
    keyword: '',
    module: '',
    userId: String(route.query.userId || '').slice(0, 255),
    startDate: '',
    endDate: '',
    hideInternal: true,
  });
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const clearVisible = ref(false);
  const clearing = ref(false);
  let timer: number | null = null;

  const returnTo = computed(() => {
    const value = String(route.query.returnTo || '');
    return value === '/admin/userMg' || value === '/userMg' ? value : '';
  });

  const columns = computed(() =>
    bookmark.isMobile
      ? [
          { title: t('adminOperationLog.columns.user'), key: 'user', width: '86px' },
          { title: t('adminOperationLog.columns.time'), key: 'mobileTime', width: '74px' },
          { title: t('adminOperationLog.columns.operation'), key: 'mobileOperation', width: 'minmax(0, 1fr)' },
        ]
      : [
          { title: t('adminOperationLog.columns.user'), key: 'alias', width: '130px' },
          { title: t('adminOperationLog.columns.module'), key: 'module', width: '140px' },
          { title: t('adminOperationLog.columns.operation'), key: 'operation', width: 'minmax(220px, 1.6fr)' },
          { title: t('adminOperationLog.columns.ip'), key: 'ip', width: '130px' },
          { title: t('apiLog.operatingSystem'), key: 'system', width: '105px' },
          { title: t('apiLog.runtime'), key: 'runtime', width: '100px' },
          { title: t('adminOperationLog.columns.time'), key: 'createTime', width: '160px' },
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
      apiQueryPost('/api/common/getOperationLogs', {
        cursor,
        limit,
        filters: {
          key: filters.keyword,
          module: filters.module,
          userId: filters.userId,
          startDate: filters.startDate,
          endDate: filters.endDate,
          hideInternal: filters.hideInternal,
        },
      }),
    onError: () => message.error(t('common.requestFailedDescription')),
  });

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }
  function scheduleSearch() {
    clearTimer();
    timer = window.setTimeout(() => reloadLogs(), 400);
  }
  function reloadLogs() {
    clearTimer();
    tableRef.value?.scrollToTop();
    void reload();
  }
  function onDateRangeChange(start?: string, end?: string) {
    filters.startDate = start || '';
    filters.endDate = end || '';
    reloadLogs();
  }
  function resetFilters() {
    Object.assign(filters, { keyword: '', module: '', userId: '', startDate: '', endDate: '', hideInternal: true });
    reloadLogs();
  }
  function openDetail(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }
  function clearOperationLogs() {
    clearVisible.value = true;
  }
  function goBackToUserManagement() {
    if (returnTo.value) void router.push(returnTo.value);
  }
  async function confirmClearOperationLogs(payload: { reason: string; confirmed: true; confirmText: string }) {
    clearing.value = true;
    try {
      const response = await apiBasePost('/api/common/clearOperationLogs', payload);
      if (response?.status === 200) {
        clearVisible.value = false;
        message.success(
          `${t('adminOperationLog.clearSuccess')} · 审计 ${String(response.data?.auditId || '').slice(0, 8)}`,
        );
        reloadLogs();
      }
    } finally {
      clearing.value = false;
    }
  }
  function runtimeLabel(record: any) {
    return `${t(getApiLogRuntimeLabelKey(record?.system?.runtime))}${getApiLogAppVersionSuffix(
      record?.system?.runtime,
      record?.system?.appVersion,
    )}`;
  }
  function formatTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : String(value);
  }
  function formatTimeOnly(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime())
      ? date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      : String(value);
  }

  onMounted(reloadLogs);
  onUnmounted(() => {
    clearTimer();
    cancel();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';

  .operation-filter {
    width: 150px;
  }
  .operation-filter--search {
    width: min(270px, 28vw);
  }
  .operation-filter--user {
    width: min(190px, 20vw);
  }
  .operation-filter--range {
    width: 210px;
  }
  .operation-filter--range :deep(.drp-trigger.b_btn) {
    width: 100%;
    justify-content: space-between;
  }
  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 12px;
    white-space: nowrap;
  }
  .admin-log-mobile-user,
  .admin-log-mobile-time,
  .admin-log-mobile-operation {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .operation-detail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
    margin: 0;
  }
  .operation-detail > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .operation-detail dt {
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .operation-detail dd {
    margin: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
  }

  @media (max-width: @admin-bp-mobile) {
    .operation-filter,
    .operation-filter--search,
    .operation-filter--user,
    .operation-filter--range {
      width: 100%;
    }
    .operation-detail {
      grid-template-columns: 1fr;
    }
    :global(.admin-log-detail-content) {
      padding: 16px !important;
      overflow-y: auto;
      background: var(--surface-page-bg, var(--background-color));
    }
    .operation-detail > div {
      padding: 11px 12px;
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      background: var(--card-background);
    }
  }
</style>
