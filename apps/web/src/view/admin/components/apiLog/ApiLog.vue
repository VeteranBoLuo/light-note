<template>
  <AdminDataPage
    eyebrow="Admin / API"
    title="API 日志"
    subtitle="实时掌握 API 调用和用户行为状态"
    toolbar-hint="支持模糊匹配 · 回车或停止输入 0.3s 自动查询"
    :summary-count="total"
  >
    <template #toolbar>
      <b-input
        v-model:value="searchValue"
        placeholder="搜索昵称 / 邮箱 / IP / 接口 URL"
        class="log-search-input"
        @input="handleSearch"
      >
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="hideInternal" @change="searchApiLog()" />
        隐藏内部账号(管理员/测试)
      </span>
      <b-button type="danger" @click="clearApiLogs">清空日志</b-button>
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      :data="logList"
      :columns="logColumns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ text, record, column }">
        <template v-if="column.key === 'system'">
          <span :style="{ color: getApiLogOsColor(text?.os), fontSize: '12px' }">{{
            text?.os || t('apiLog.unknown')
          }}</span>
        </template>
        <template v-else-if="column.key === 'runtime'">
          <span :style="{ color: getApiLogRuntimeColor(record.system?.runtime), fontSize: '12px' }">{{
            t(getApiLogRuntimeLabelKey(record.system?.runtime))
          }}</span>
        </template>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal v-model:visible="detailVisible" title="API 详情" width="600px" :show-footer="false" :mask-closable="true">
    <div style="display: flex; flex-direction: column; gap: 10px; color: var(--text-color)" v-if="selectedRecord">
      <div>时间：{{ selectedRecord.requestTime }}</div>
      <div>接口：{{ selectedRecord.url }}</div>
      <div>
        请求参数：
        <pre
          style="
            margin: 4px 0 0;
            max-height: 120px;
            overflow: auto;
            padding: 8px;
            border-radius: 6px;
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-all;
          "
          >{{ selectedRecord.req }}</pre>
      </div>
      <div>ip地址：{{ selectedRecord?.ip }}</div>
      <div>指纹：{{ selectedRecord.system?.fingerprint }}</div>
      <div>省份：{{ selectedRecord.location?.province }}</div>
      <div>城市：{{ selectedRecord.location?.city }}</div>
      <div>浏览器：{{ selectedRecord.system?.browser }}</div>
      <div>{{ t('apiLog.operatingSystem') }}：{{ selectedRecord.system?.os || t('apiLog.unknown') }}</div>
      <div>{{ t('apiLog.runtime') }}：{{ t(getApiLogRuntimeLabelKey(selectedRecord.system?.runtime)) }}</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import { useI18n } from 'vue-i18n';
  import { getApiLogOsColor, getApiLogRuntimeColor, getApiLogRuntimeLabelKey } from '@/utils/apiLogPresentation.ts';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  const { t } = useI18n();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const searchValue = ref('');
  const hideInternal = ref(true);
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
        filters: { key: searchValue.value, hideInternal: hideInternal.value },
      }),
    onError: (_error, silent) => {
      if (!silent) message.error(t('common.requestFailedDescription'));
    },
  });
  const hasLoaded = ref(false);
  const inPageActive = ref(false);

  const logColumns = computed(() => {
    return [
      {
        title: '昵称',
        key: 'alias',
        width: '1fr',
      },
      {
        title: '邮箱',
        key: 'email',
        width: '1fr',
      },
      {
        title: '时间',
        key: 'requestTime',
        width: '1fr',
      },
      {
        title: '接口',
        key: 'url',
        width: '1fr',
      },
      {
        title: 'ip',
        key: 'ip',
        width: '1fr',
      },
      {
        title: t('apiLog.operatingSystem'),
        key: 'system',
        width: '110px',
      },
      {
        title: t('apiLog.runtime'),
        key: 'runtime',
        width: '100px',
      },
    ];
  });

  function clearApiLogs() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空日志？`,
      onOk() {
        apiBaseGet('/api/common/clearApiLogs', {}).then((res) => {
          if (res.status === 200) {
            message.success('日志清空成功');
            searchApiLog();
          }
        });
      },
    });
  }

  const timer = ref<any>(null);
  function clearSearchTimer() {
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
  }
  function handleSearch() {
    clearSearchTimer();
    timer.value = setTimeout(() => {
      searchApiLog({ silent: true });
    }, 300);
  }

  function cancelPendingRequest() {
    cancel();
  }

  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  async function searchApiLog(options: { silent?: boolean } = {}) {
    tableRef.value?.scrollToTop();
    const loaded = await reload(options);
    if (loaded) hasLoaded.value = true;
  }

  const handleVisibilityChange = () => {
    if (!document.hidden && hasLoaded.value && inPageActive.value) {
      searchApiLog({ silent: true });
    }
  };

  onMounted(() => {
    inPageActive.value = true;
    searchApiLog();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onActivated(() => {
    inPageActive.value = true;
    if (hasLoaded.value) {
      searchApiLog({ silent: true });
    }
  });

  onDeactivated(() => {
    inPageActive.value = false;
    cancelPendingRequest();
  });

  onUnmounted(() => {
    inPageActive.value = false;
    clearSearchTimer();
    cancelPendingRequest();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<style lang="less" scoped>
  .log-search-input {
    flex: 1;
  }

  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
  }

  @media (max-width: 960px) {
    .log-search-input {
      width: 100%;
    }
  }
</style>
