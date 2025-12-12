<template>
  <div style="height: 100%; box-sizing: border-box">
    <a-table
      :data-source="logList"
      :columns="logColumns"
      row-key="id"
      style="margin-top: 5px"
      :scroll="{ y: bookmark.screenHeight - 250 }"
      :pagination="false"
    >
      <template #expandedRowRender="{ record }">
        <div style="max-height: 300px; overflow-y: auto; min-height: 120px; color: var(--text-color)">
          <div>攻击类型：{{ record.attackType }}</div>
          <div>攻击时间：{{ record.createdAt }}</div>
          <div>攻击者userAgent：{{ record.userAgent }}</div>
          <div>请求方法：{{ record.requestMethod }}</div>
          <div>请求地址：{{ record.requestPath }}</div>
          <div>
            攻击载荷：
            <pre>{{ record.payload }}</pre>
          </div>
          <div>来源IP地址：{{ record?.sourceIp }}</div>
        </div>
      </template>
    </a-table>
    <p>
      总计
      <a>
        {{ total }}
      </a>
      条攻击记录
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    return [
      {
        title: '攻击类型',
        dataIndex: 'attackType',
        ellipsis: true,
      },
      {
        title: '来源IP地址',
        dataIndex: 'sourceIp',
        ellipsis: true,
      },
      {
        title: '请求地址',
        dataIndex: 'requestPath',
        ellipsis: true,
      },
      {
        title: '攻击载荷',
        dataIndex: 'payload',
        ellipsis: true,
      },
      {
        title: '攻击时间',
        dataIndex: 'createdAt',
        ellipsis: true,
      },
    ];
  });

  const total = ref(0);
  function searchApiLog() {
    apiQueryPost('/api/common/getAttackLogs').then((res) => {
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
  .log-search-input {
    width: 50%;
  }

  :deep(.ant-table-wrapper .ant-table) {
    background-color: var(--background-color);
    color: var(--text-color);
  }
  :deep(.ant-table-cell-ellipsis) {
    background-color: var(--background-color) !important;
    color: var(--text-color) !important;
  }
  :deep(.ant-table-cell-scrollbar) {
    background-color: unset !important;
    display: none;
  }
  :deep(.ant-table-cell) {
    background-color: var(--background-color) !important;
    color: black;
  }
  :deep(.ant-select-dropdown-placement-topLeft) {
    min-width: 100px !important;
    transition: none !important;
  }
  :deep(.ant-select-selector .ant-select-selection-item) {
    background-color: unset !important;
    transition: none !important;
  }
  //:deep(.ant-select-selector) {
  //  transition: none !important;
  //}
  /*--分页背景调色--*/
  :deep(.ant-pagination) {
    color: var(--text-color);
  }
  :deep(.ant-pagination-item a) {
    color: var(--text-color);
  }
  :deep(.ant-pagination-item-active a) {
    color: #4e4b46;
  }
  :deep(.ant-pagination-item-ellipsis) {
    color: var(--icon-color) !important;
  }
</style>
