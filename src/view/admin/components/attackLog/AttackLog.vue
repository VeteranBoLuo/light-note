<template>
  <div class="admin-panel-container">
    <section class="admin-panel attack-log__panel">
      <header class="admin-header attack-log__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Security</p>
          <h2>攻击日志</h2>
          <p class="admin-subtitle">监控和记录系统安全威胁</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-table-card">
        <a-table :data-source="logList" :columns="logColumns" row-key="id" :scroll="{ y: 500 }" :pagination="false">
          <template #expandedRowRender="{ record }">
            <div class="admin-expand-panel">
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
      </div>
    </section>
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
  const statCards = computed(() => {
    const totalValue = total.value || 0;
    return [
      {
        label: '总攻击记录',
        value: totalValue,
        hint: '累计',
      },
    ];
  });

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
  @import '@/assets/css/admin-manage.less';

  @media (max-width: 960px) {
  }
</style>
