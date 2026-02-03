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
        <a-table
          :data-source="logList"
          :columns="logColumns"
          row-key="id"
          :scroll="{ y: tableScrollY }"
          :pagination="false"
        >
          <template #expandedRowRender="{ record }">
            <div class="admin-expand-panel">
              <div>昵称：{{ record.alias }}</div>
              <div>邮箱：{{ record.email }}</div>
              <div>模块：{{ record.module }}</div>
              <div>操作：{{ record.operation }}</div>
              <div>时间：{{ record.createTime }}</div>
            </div>
          </template>
        </a-table>
      </div>

      <footer class="admin-footer">
        <a-pagination
          :current="currentPage"
          :page-size="pageSize"
          show-size-changer
          size="small"
          :total="total"
          @change="onChange"
        >
          <template #buildOptionText="props">
            <span>{{ props.value }}条/页</span>
          </template>
        </a-pagination>
      </footer>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    return [
      {
        title: '昵称',
        dataIndex: 'alias',
        ellipsis: true,
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        ellipsis: true,
      },
      {
        title: '模块',
        dataIndex: 'module',
        ellipsis: true,
      },
      {
        title: '操作',
        dataIndex: 'operation',
        ellipsis: true,
      },
      {
        title: '时间',
        dataIndex: 'createTime',
        ellipsis: true,
      },
    ];
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
    searchApiLog();
  };

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

  const timer = ref();
  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      searchApiLog();
    }, 500);
  }

  const total = ref(0);
  const searchValue = ref('');

  const { tableScrollY } = useTableScrollY();

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
