<template>
  <AdminDataPage
    eyebrow="Admin / Operation"
    :title="t('adminOperationLog.title')"
    :subtitle="t('adminOperationLog.subtitle')"
    :toolbar-hint="t('adminOperationLog.toolbarHint')"
    :summary-count="total"
  >
    <template #actions>
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
      <BInput
        v-model:value="filters.startDate"
        type="date"
        class="operation-filter operation-filter--date"
        @change="reloadLogs"
      />
      <span class="operation-filter-separator">{{ t('adminOperationLog.filters.to') }}</span>
      <BInput
        v-model:value="filters.endDate"
        type="date"
        class="operation-filter operation-filter--date"
        @change="reloadLogs"
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
        <span v-if="column.key === 'system'" :style="{ color: getApiLogOsColor(text?.os), fontSize: '12px' }">
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
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
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
    module: '',
    userId: String(route.query.userId || '').slice(0, 255),
    startDate: '',
    endDate: '',
    hideInternal: true,
  });
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  let timer: number | null = null;

  const columns = computed(() =>
    bookmark.isMobile
      ? [
          { title: t('adminOperationLog.columns.time'), key: 'createTime', width: '150px' },
          { title: t('adminOperationLog.columns.module'), key: 'module', width: '120px' },
          { title: t('adminOperationLog.columns.operation'), key: 'operation', width: 'minmax(200px, 1.5fr)' },
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
  function resetFilters() {
    Object.assign(filters, { keyword: '', module: '', userId: '', startDate: '', endDate: '', hideInternal: true });
    reloadLogs();
  }
  function openDetail(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }
  function clearOperationLogs() {
    Alert.alert({
      title: t('adminOperationLog.clearTitle'),
      content: t('adminOperationLog.clearConfirm'),
      onOk() {
        apiBaseGet('/api/common/clearOperationLogs', {}).then((response: any) => {
          if (response?.status === 200) {
            message.success(t('adminOperationLog.clearSuccess'));
            reloadLogs();
          }
        });
      },
    });
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
  .operation-filter--date {
    width: 138px;
  }
  .operation-filter-separator {
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
    .operation-filter--date {
      width: 100%;
    }
    .operation-filter-separator {
      display: none;
    }
    .operation-detail {
      grid-template-columns: 1fr;
    }
  }
</style>
