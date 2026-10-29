<template>
  <AdminDataPage
    appearance="workspace"
    class="operation-page"
    :eyebrow="`ADMIN / ${t('adminOperationLog.title')}`"
    :title="t('adminOperationLog.title')"
    :subtitle="t('adminWorkspace.logsSubtitle')"
    :summary-count="total"
    :back-to="returnTo || undefined"
  >
    <template #actions>
      <BButton v-if="returnTo && !bookmark.isMobile" @click="goBackToUserManagement">
        {{ t('adminOperationLog.backToUserManagement') }}
      </BButton>
      <BDropdown
        trigger="click"
        align="right"
        :menu-options="[
          {
            key: 'clear',
            label: t('adminOperationLog.clear'),
            icon: icon.table_delete,
            danger: true,
            function: clearOperationLogs,
          },
        ]"
        ><BButton :icon-only="bookmark.isMobile" :aria-label="t('adminWorkspace.moreActions')"
          ><span v-if="!bookmark.isMobile">{{ t('adminWorkspace.moreActions') }}</span
          ><SvgIcon :src="icon.common.more" size="16" /></BButton
      ></BDropdown>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="filters.keyword"
        class="operation-filter operation-filter--search"
        clearable
        :placeholder="t('adminOperationLog.filters.keyword')"
        @input="scheduleSearch"
        @enter="reloadLogs"
        ><template #prefix><SvgIcon :src="icon.navigation.search" size="16" /></template
      ></BInput>
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
      <BButton
        :aria-expanded="advancedFiltersOpen"
        aria-controls="operation-advanced-filters"
        @click="advancedFiltersOpen = !advancedFiltersOpen"
        >{{ t(advancedFiltersOpen ? 'adminWorkspace.lessFilters' : 'adminWorkspace.moreFilters')
        }}<span v-if="advancedFilterCount">({{ advancedFilterCount }})</span></BButton
      >
      <BButton type="text" @click="resetFilters">{{ t('adminOperationLog.filters.reset') }}</BButton>
      <div v-if="advancedFiltersOpen" id="operation-advanced-filters" class="operation-advanced-filters">
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
        <span>{{ t('adminWorkspace.exact') }}</span></div
      >
    </template>
    <template #summary
      ><span>{{ t('adminWorkspace.logCount', { count: total.toLocaleString() }) }}</span
      ><span>{{ t('adminWorkspace.logHint') }}</span></template
    >
    <BVirtualList
      v-if="bookmark.isMobile && (logList.length || loading)"
      ref="mobileListRef"
      class="operation-mobile-list"
      :items="logList"
      item-key="id"
      :item-height="88"
      :loading="loading"
      :has-more="hasMore && !failed"
      @load-more="loadMore"
    >
      <template #default="{ item }"
        ><BButton type="text" block class="operation-mobile-row" @click="openDetail(item)"
          ><span class="operation-mobile-row__heading"
            ><strong>{{ item.operation || '—' }}</strong
            ><time>{{ formatDateOnly(item.createTime) }} {{ formatTimeOnly(item.createTime) }}</time></span
          ><span>{{ item.alias || item.email || '—' }} · {{ item.module || '—' }}</span
          ><small
            >{{ item.system?.os || t('apiLog.unknown') }} · {{ runtimeLabel(item) }} · {{ item.ip || '—' }}</small
          ></BButton
        ></template
      >
    </BVirtualList>
    <BTable
      v-else-if="logList.length || loading"
      ref="tableRef"
      fill
      virtual
      row-key="id"
      :data="logList"
      :columns="columns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore && !failed"
      :row-height="48"
      @load-more="loadMore"
      @row-click="openDetail"
    >
      <template #bodyCell="{ text, record, column }">
        <span v-if="column.key === 'alias'" class="operation-identity"
          ><strong>{{ record.alias || record.email || '—' }}</strong
          ><small>{{ record.email || '—' }}</small></span
        >
        <span v-else-if="column.key === 'createTime'" class="operation-time"
          ><strong>{{ formatTimeOnly(record.createTime) }}</strong
          ><small>{{ formatDateOnly(record.createTime) }}</small></span
        >
        <span
          v-else-if="column.key === 'system'"
          :style="{ color: getApiLogOsColor(text?.os), fontSize: 'var(--ui-font-12, 12px)' }"
        >
          {{ text?.os || t('apiLog.unknown') }}
        </span>
        <span
          v-else-if="column.key === 'runtime'"
          :style="{ color: getApiLogRuntimeColor(record.system?.runtime), fontSize: 'var(--ui-font-12, 12px)' }"
        >
          {{ runtimeLabel(record) }}
        </span>
      </template>
    </BTable>
    <div v-else class="operation-empty" :role="failed ? 'alert' : 'status'"
      ><p>{{ failed ? t('common.requestFailedDescription') : t('adminWorkspace.emptyLogs') }}</p
      ><BButton v-if="failed" size="small" @click="reloadLogs">{{ t('common.retry') }}</BButton></div
    >
    <div v-if="logList.length" class="operation-footer"
      ><span>{{ logList.length.toLocaleString() }} / {{ total.toLocaleString() }}</span
      ><BButton v-if="failed" size="small" @click="loadMore">{{ t('common.retry') }}</BButton
      ><span v-else>{{ t('adminWorkspace.logDetailHint') }}</span></div
    >
  </AdminDataPage>

  <BModal
    v-model:visible="detailVisible"
    :title="t('adminOperationLog.detail.title')"
    width="min(var(--ui-layout-620, 620px), 94vw)"
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
  import { formatAdminDateTime, parseAdminDateTime, ADMIN_DEFAULT_TIME_ZONE } from '@/utils/adminDateTime';
  import { adminWorkspaceMessages } from '@/i18n/locales/adminWorkspace';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
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

  const { t, locale } = useI18n({ messages: adminWorkspaceMessages, missingWarn: false, fallbackWarn: false });
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
  const mobileListRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const advancedFiltersOpen = ref(Boolean(route.query.userId));
  const advancedFilterCount = computed(() => Number(Boolean(filters.module)) + Number(Boolean(filters.userId)));
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  const clearVisible = ref(false);
  const clearing = ref(false);
  let timer: number | null = null;

  const returnTo = computed(() => {
    const value = String(route.query.returnTo || '');
    return value === '/admin/userMg' || value === '/userMg' ? value : '';
  });

  const columns = computed(() => [
    { title: t('adminOperationLog.columns.time'), key: 'createTime', width: 'var(--ui-layout-140, 140px)' },
    { title: t('adminOperationLog.columns.user'), key: 'alias', width: 'var(--ui-layout-180, 180px)' },
    { title: t('adminOperationLog.columns.module'), key: 'module', width: 'var(--ui-layout-100, 100px)' },
    { title: t('adminOperationLog.columns.operation'), key: 'operation' },
    { title: t('adminOperationLog.columns.ip'), key: 'ip', width: 'var(--ui-layout-125, 125px)' },
    { title: t('apiLog.operatingSystem'), key: 'system', width: 'var(--ui-layout-100, 100px)' },
    { title: t('apiLog.runtime'), key: 'runtime', width: 'var(--ui-layout-120, 120px)' },
  ]);

  const {
    items: logList,
    total,
    loading,
    failed,
    hasMore,
    loadMore,
    reload,
    cancel,
  } = useAdminCursorList<any>({
    request: (cursor, limit, options) =>
      apiQueryPost(
        '/api/common/getOperationLogs',
        {
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
        },
        options,
      ),
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
    mobileListRef.value?.scrollToTop();
    void reload();
  }
  function onDateRangeChange(start?: string, end?: string) {
    filters.startDate = start || '';
    filters.endDate = end || '';
    reloadLogs();
  }
  function resetFilters() {
    Object.assign(filters, { keyword: '', module: '', userId: '', startDate: '', endDate: '', hideInternal: true });
    advancedFiltersOpen.value = false;
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
    return formatAdminDateTime(value, locale.value);
  }
  function formatTimeOnly(value: unknown) {
    const date = parseAdminDateTime(value);
    return date
      ? new Intl.DateTimeFormat(locale.value, {
          timeZone: ADMIN_DEFAULT_TIME_ZONE,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(date)
      : '—';
  }
  function formatDateOnly(value: unknown) {
    const date = parseAdminDateTime(value);
    return date
      ? new Intl.DateTimeFormat(locale.value, {
          timeZone: ADMIN_DEFAULT_TIME_ZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(date)
      : '—';
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
    width: var(--ui-layout-150, 150px);
  }
  .operation-filter--search {
    flex: 1 1 var(--ui-layout-270, 270px);
    min-width: 0;
  }
  .operation-filter--user {
    width: min(var(--ui-layout-190, 190px), 20vw);
  }
  .operation-filter--range {
    width: var(--ui-layout-210, 210px);
  }
  .operation-filter--range :deep(.drp-trigger.b_btn) {
    width: 100%;
    justify-content: space-between;
  }
  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }
  .operation-detail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    margin: 0;
  }
  .operation-detail > div {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  .operation-detail dt {
    color: var(--sub-text-color);
    font-size: var(--ui-font-11, 11px);
  }
  .operation-detail dd {
    margin: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
  }

  .operation-identity,
  .operation-time {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--ui-space-3, 3px);
  }
  .operation-identity strong,
  .operation-identity small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .operation-identity small,
  .operation-time small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .operation-advanced-filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    flex: 1 1 100%;
    gap: var(--ui-space-10, 10px);
    padding-top: var(--ui-space-8, 8px);
  }
  .operation-advanced-filters > span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .operation-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  .operation-footer {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .operation-mobile-list {
    flex: 1;
    min-height: 0;
  }
  .operation-mobile-row.b_btn {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: var(--ui-space-5, 5px);
    width: 100%;
    height: 100%;
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    color: var(--text-color);
    text-align: left;
    font-size: var(--ui-font-14, 14px);
    line-height: 1.4;
    border-bottom: 1px solid var(--surface-divider-color);
    border-radius: 0;
  }
  .operation-mobile-row__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .operation-mobile-row__heading strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .operation-mobile-row__heading time,
  .operation-mobile-row small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .operation-mobile-row__heading time {
    flex: none;
    font-size: var(--ui-font-11, 11px);
  }
  .operation-mobile-row small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: (@admin-bp-mobile - 1px)) {
    .operation-page :deep(.admin-data-page__actions) {
      position: absolute;
      top: var(--ui-space-4, 4px);
      right: 0;
      width: auto;
    }
    .operation-page :deep(.admin-data-page__actions .b_btn) {
      width: var(--ui-control-44, 44px);
      height: var(--ui-control-44, 44px);
      padding: var(--ui-space-10, 10px);
      background: transparent;
    }
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
