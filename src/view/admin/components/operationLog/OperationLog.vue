<template>
  <div class="admin-panel-container">
    <section class="admin-panel operation-log__panel">
      <header class="admin-header operation-log__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Operation</p>
          <h2 class="admin-title">操作日志</h2>
          <p class="admin-subtitle">实时掌握后台动作和接口调用状态</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label operation-log__stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value operation-log__stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint operation-log__stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input
            v-model:value="searchValue"
            placeholder="搜索昵称 / 模块 / 操作名"
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <b-button class="operation-log__clear" @click="clearOperationLogs" type="primary">清空日志</b-button>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card">
        <BTable
          :data="logList"
          :columns="logColumns"
          :row-clickable="true"
          :pagination="true"
          :total="total"
          :current-page="currentPage"
          :page-size="pageSize"
          @page-change="onPageChange"
          @size-change="onSizeChange"
          @row-click="onRowClick"
        />
      </div>

      <BModal v-model:visible="detailVisible" title="操作详情" width="500px" :show-footer="false" :mask-closable="true">
        <div style="display: flex; flex-direction: column; gap: 10px; color: var(--text-color)" v-if="selectedRecord">
          <div>昵称：{{ selectedRecord.alias }}</div>
          <div>邮箱：{{ selectedRecord.email }}</div>
          <div>模块：{{ selectedRecord.module }}</div>
          <div>操作：{{ selectedRecord.operation }}</div>
          <div>时间：{{ selectedRecord.createTime }}</div>
        </div>
      </BModal>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = [
    { title: '昵称', key: 'alias', width: '1fr' },
    { title: '邮箱', key: 'email', width: '1fr' },
    { title: '模块', key: 'module', width: '1fr' },
    { title: '操作', key: 'operation', width: '1fr' },
    { title: '时间', key: 'createTime', width: '1fr' },
  ];

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const total = ref(0);
  const searchValue = ref('');
  const timer = ref();
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
  }

  function onPageChange(page: number) {
    currentPage.value = page;
    searchApiLog();
  }
  function onSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
    searchApiLog();
  }

  function clearOperationLogs() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空操作日志？`,
      onOk() {
        apiBaseGet('/api/common/clearOperationLogs', {}).then((res) => {
          if (res.status === 200) {
            message.success('日志清空成功');
            searchApiLog();
          }
        });
      },
    });
  }

  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      searchApiLog();
    }, 500);
  }

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

  function searchApiLog() {
    apiQueryPost('/api/common/getOperationLogs', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
      },
    }).then((res) => {
      if (res.status === 200) {
        logList.value = res.data.items;
        total.value = res.data.total;
      }
    });
  }
  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';
  .log-search-input {
    flex: 1;
  }

  .admin-table-card {
    /* BTable 有自己的 padding，这里取消重复的 */
    padding: 0;
  }

  @media (max-width: 960px) {
    .operation-log__filters-main {
      flex-direction: column;
      align-items: stretch;
    }

    .operation-log__stats {
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    }
  }
</style>
