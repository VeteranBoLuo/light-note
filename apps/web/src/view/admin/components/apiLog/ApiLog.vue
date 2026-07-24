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
        placeholder="搜索昵称 / IP / 接口 URL"
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
      fill
      :data="logList"
      :columns="logColumns"
      :row-clickable="true"
      :pagination="true"
      :total="total"
      :page-size="pageSize"
      :current-page="currentPage"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @row-click="onRowClick"
    >
      <template #bodyCell="{ text, column }">
        <template v-if="column.key === 'system'">
          <span :style="{ color: getOsColor(text?.os), fontSize: '12px' }">{{ text?.os || '未知' }}</span>
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
          style="margin: 4px 0 0; max-height: 120px; overflow: auto; padding: 8px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-all"
          >{{ selectedRecord.req }}</pre>
      </div>
      <div>ip地址：{{ selectedRecord?.ip }}</div>
      <div>指纹：{{ selectedRecord.system?.fingerprint }}</div>
      <div>省份：{{ selectedRecord.location?.province }}</div>
      <div>城市：{{ selectedRecord.location?.city }}</div>
      <div>浏览器：{{ selectedRecord.system?.browser }}</div>
      <div>操作系统：{{ selectedRecord.system?.os }}</div>
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
  const logList = ref([]);
  const loading = ref(false);
  const hasLoaded = ref(false);
  const inPageActive = ref(false);
  const requestToken = ref(0);

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
        title: '系统',
        key: 'system',
        width: '110px',
      },
    ];
  });

  // 常用系统各配一个有辨识度、深浅主题都可读的颜色;未知/其他保持中性灰
  function getOsColor(os?: string): string {
    if (!os) return '#8a919e';
    if (os.includes('Windows')) return '#3b82f6'; // 蓝
    if (os.includes('iOS') || os.includes('iPhone') || os.includes('iPad')) return '#0ea5e9'; // 天蓝
    if (os.includes('macOS')) return '#8b5cf6'; // 紫
    if (os.includes('Android')) return '#22c55e'; // 绿
    if (os.includes('HarmonyOS') || os.includes('Harmony') || os.includes('鸿蒙')) return '#ef4444'; // 红
    if (os.includes('Linux') || os.includes('Ubuntu')) return '#f59e0b'; // 橙
    return '#8a919e'; // 其他/未知
  }

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(20);

  function onPageChange(page: number) {
    currentPage.value = page;
    searchApiLog();
  }

  function onSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
    searchApiLog();
  }

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
      currentPage.value = 1;
      searchApiLog({ silent: true });
    }, 300);
  }

  const total = ref(0);
  const searchValue = ref('');
  function cancelPendingRequest() {
    requestToken.value += 1;
    loading.value = false;
  }

  const hideInternal = ref(true);
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  function searchApiLog(options: { silent?: boolean } = {}) {
    const currentToken = ++requestToken.value;
    loading.value = true;
    apiQueryPost('/api/common/getApiLogs', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
        hideInternal: hideInternal.value,
      },
    })
      .then((res) => {
        if (currentToken !== requestToken.value) {
          return;
        }
        if (res.status === 200) {
          logList.value = res.data.items;
          total.value = res.data.total;
          hasLoaded.value = true;
        } else if (!options.silent) {
          message.error(res.msg || '查询日志失败');
        }
      })
      .catch((error) => {
        if (currentToken !== requestToken.value) {
          return;
        }
        if (!options.silent) {
          message.error(error?.message || '查询日志失败');
        }
      })
      .finally(() => {
        if (currentToken === requestToken.value) {
          loading.value = false;
        }
      });
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
