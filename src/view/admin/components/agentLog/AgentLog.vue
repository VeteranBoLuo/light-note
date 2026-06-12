<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / AI</p>
          <h2 class="admin-title">AI 调用监控</h2>
          <p class="admin-subtitle">大模型请求记录、Token 消耗与费用统计</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">总请求</span>
          <strong class="admin-stat-value">{{ total }}</strong>
          <span class="admin-stat-hint">累计</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日请求</span>
          <strong class="admin-stat-value">{{ todayCount }}</strong>
          <span class="admin-stat-hint">次</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日 Token</span>
          <strong class="admin-stat-value">{{ formatNumber(todayTokens) }}</strong>
          <span class="admin-stat-hint">tk</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日费用</span>
          <strong class="admin-stat-value">¥{{ todayCost }}</strong>
          <span class="admin-stat-hint">累计</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input
            v-model:value="searchValue"
            placeholder="搜索用户 / 提问 / 工具"
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card">
        <BTable
          :data="logList"
          :columns="columns"
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

      <BModal v-model:visible="detailVisible" title="调用详情" width="550px" :show-footer="false" :mask-closable="true">
        <div class="agent-detail" v-if="selectedRecord">
          <div class="agent-detail__grid">
            <div><label>用户</label><p>{{ selectedRecord.userAlias || '-' }}</p></div>
            <div><label>状态</label><p>{{ selectedRecord.status === 'success' ? '✓ 成功' : '✗ 失败' }}</p></div>
            <div><label>时间</label><p>{{ formatTime(selectedRecord.createdAt) }}</p></div>
            <div><label>耗时</label><p>{{ selectedRecord.durationMs }} ms</p></div>
            <div><label>API 调用次数</label><p>{{ selectedRecord.iterations || 1 }} 次</p></div>
            <div><label>费用</label><p>¥{{ Number(selectedRecord.cost || 0).toFixed(6) }}</p></div>
          </div>
          <div class="agent-detail__question">
            <label>提问</label>
            <p>{{ selectedRecord.question || '-' }}</p>
          </div>
          <div class="agent-detail__tools" v-if="selectedRecord.toolsUsed">
            <label>调用工具</label>
            <p>{{ selectedRecord.toolsUsed }}</p>
          </div>
          <div class="agent-detail__tokens">
            <div class="token-bar">
              <span>Prompt</span><span class="token-val">{{ formatNumber(selectedRecord.promptTokens) }} tk</span>
              <span>输出</span><span class="token-val">{{ formatNumber(selectedRecord.completionTokens) }} tk</span>
              <span>合计</span><span class="token-val">{{ formatNumber(selectedRecord.totalTokens) }} tk</span>
            </div>
          </div>
          <div class="agent-detail__error" v-if="selectedRecord.errorMsg">
            <label>错误信息</label>
            <p>{{ selectedRecord.errorMsg }}</p>
          </div>
        </div>
      </BModal>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const logList = ref([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const todayCount = ref(0);
  const todayTokens = ref(0);
  const todayCost = ref('0');
  const searchValue = ref('');
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  let timer: number | null = null;

  const columns = [
    { title: '用户', key: 'userAlias', width: '1fr' },
    { title: '提问', key: 'question', width: '2fr', ellipsis: true },
    { title: '工具', key: 'toolsUsed', width: '1fr' },
    { title: '费用(¥)', key: 'cost', width: '100px' },
    { title: '调用', key: 'iterations', width: '60px' },
    { title: '时间', key: 'createdAt', width: '1fr' },
  ];

  function onPageChange(page: number) { currentPage.value = page; fetchLogs(); }
  function onSizeChange(_: number, size: number) { currentPage.value = 1; pageSize.value = size; fetchLogs(); }
  function onRowClick(record: any) { selectedRecord.value = record; detailVisible.value = true; }

  function handleSearch() {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => { currentPage.value = 1; fetchLogs(); }, 500);
  }

  function fetchLogs() {
    apiBasePost('/api/common/getAgentLogs', {
      keyword: searchValue.value || undefined,
      pageSize: pageSize.value,
      currentPage: currentPage.value,
    }).then((res: any) => {
      if (res.status === 200) {
        logList.value = res.data.items || [];
        total.value = res.data.total || 0;
      }
    });
  }

  function fetchTodaySummary() {
    apiBasePost('/api/common/getAgentLogsSummary', {}).then((res: any) => {
      if (res.status === 200) {
        const d = res.data;
        todayCount.value = d.today?.count ?? 0;
        todayTokens.value = d.today?.tokens ?? 0;
        todayCost.value = d.today?.cost ?? '0';
      }
    }).catch((err: any) => {
      console.warn('获取今日汇总失败:', err);
    });
  }

  function formatTime(t: string) {
    if (!t) return '';
    return new Date(t).toLocaleString('zh-CN');
  }

  function formatNumber(n: number) {
    if (n == null) return '0';
    return n.toLocaleString();
  }

  onMounted(() => {
    fetchLogs();
    fetchTodaySummary();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';
  .log-search-input { flex: 1; }
  .admin-table-card { padding: 0; }

  .agent-detail__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 20px;
    margin-bottom: 16px;
  }
  .agent-detail__grid label,
  .agent-detail__question label,
  .agent-detail__tools label,
  .agent-detail__error label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .agent-detail__grid p,
  .agent-detail__question p,
  .agent-detail__tools p,
  .agent-detail__error p {
    margin: 0;
    color: var(--text-color);
    word-break: break-all;
  }
  .agent-detail__question,
  .agent-detail__tools,
  .agent-detail__error {
    margin-bottom: 12px;
  }
  .agent-detail__tokens {
    margin-bottom: 12px;
    padding: 10px 12px;
    background: var(--card-color);
    border-radius: 8px;
  }
  .token-bar {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--desc-color);
  }
  .token-val {
    color: var(--text-color);
    font-weight: 600;
    margin-right: 8px;
  }
</style>
