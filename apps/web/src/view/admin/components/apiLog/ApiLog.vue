<template>
  <div class="admin-panel-container">
    <section class="admin-panel api-log__panel">
      <header class="admin-header api-log__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / API</p>
          <h2 class="admin-title">API日志</h2>
          <p class="admin-subtitle">实时掌握API调用和用户行为状态</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label api-log__stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value api-log__stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint api-log__stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input
            v-model:value="searchValue"
            placeholder="搜索昵称|IP/接口URL"
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <BSwitch v-model:checked="hideInternal" @change="searchApiLog()" />隐藏内部账号(管理员/测试)
          <b-button @click="handleSearch" type="primary">搜索</b-button>
          <b-button @click="clearApiLogs">清空日志</b-button>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card" ref="tableCardRef">
        <BTable
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
      </div>

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
              "
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
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  const bookmark = bookmarkStore();
  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });
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
      {
        title: 'code',
        key: 'statusCode',
        width: '1fr',
      },
    ];
  });

  function getOsColor(os?: string): string {
    if (!os) return '#666';
    if (os.includes('Windows')) return '#1677ff';
    if (os.includes('Mac')) return '#00a884';
    if (os.includes('Linux')) return '#52c41a';
    return '#666';
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
  const statCards = computed(() => {
    const totalValue = total.value || 0;
    const hasData = totalValue > 0;
    const start = hasData ? (currentPage.value - 1) * pageSize.value + 1 : 0;
    const end = hasData ? Math.min(totalValue, currentPage.value * pageSize.value) : 0;
    return [
      {
        label: '当前展示区间',
        value: `${start}-${end}`,
        hint: '条记录',
      },
      {
        label: '总日志数',
        value: totalValue,
        hint: '累计',
      },
      {
        label: '分页尺寸',
        value: pageSize.value,
        hint: '条/页',
      },
    ];
  });

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
  @import '@/assets/css/admin-manage.less';

  .admin-table-card {
    padding: 0;
  }

  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
  }

  .log-search-input {
    flex: 1;
  }

  @media (max-width: 960px) {
    .api-log__filters-main {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
