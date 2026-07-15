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
        <li class="admin-stat-card agent-balance-card">
          <span class="admin-stat-label">{{ t('aiMonitor.balance.title') }}</span>
          <strong class="admin-stat-value">{{ balanceDisplay }}</strong>
          <span class="admin-stat-hint">
            {{ balanceHint }}
            <BButton size="small" :loading="balanceLoading" @click="fetchBalance(true)">
              {{ t('aiMonitor.balance.refresh') }}
            </BButton>
          </span>
        </li>
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
        <li class="admin-stat-card">
          <span class="admin-stat-label">总费用</span>
          <strong class="admin-stat-value">¥{{ totalCost }}</strong>
          <span class="admin-stat-hint">累计</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">30 天错误率</span>
          <strong class="admin-stat-value">{{ quality.errorRate }}%</strong>
          <span class="admin-stat-hint">{{ quality.sampleCount }} 次样本</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">完成耗时 P95</span>
          <strong class="admin-stat-value">{{ formatDuration(quality.durationP95) }}</strong>
          <span class="admin-stat-hint">P50 {{ formatDuration(quality.durationP50) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">首字耗时 P50</span>
          <strong class="admin-stat-value">{{ formatDuration(quality.firstTokenP50) }}</strong>
          <span class="admin-stat-hint">P95 {{ formatDuration(quality.firstTokenP95) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">工具错误率</span>
          <strong class="admin-stat-value">{{ quality.toolErrorRate }}%</strong>
          <span class="admin-stat-hint">命中率 {{ quality.toolHitRate }}%</span>
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
          <BSwitch v-model:checked="hideInternal" @change="onToggleInternal" />隐藏内部账号(管理员/测试)
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
            <div><label>状态</label><p>{{ selectedRecord.status || '-' }}</p></div>
            <div><label>供应商 / 模型</label><p>{{ selectedRecord.provider || '-' }} / {{ selectedRecord.model || '-' }}</p></div>
            <div><label>Request ID</label><p>{{ selectedRecord.requestId || '-' }}</p></div>
            <div><label>时间</label><p>{{ formatTime(selectedRecord.createdAt) }}</p></div>
            <div><label>耗时</label><p>{{ selectedRecord.durationMs }} ms</p></div>
            <div><label>首字耗时</label><p>{{ selectedRecord.firstTokenMs ?? '-' }} ms</p></div>
            <div><label>API 调用次数</label><p>{{ selectedRecord.iterations || 1 }} 次</p></div>
            <div><label>费用</label><p>¥{{ Number(selectedRecord.cost || 0).toFixed(6) }}</p></div>
            <div><label>Usage</label><p>{{ selectedRecord.usageStatus || '-' }}</p></div>
            <div><label>结束原因</label><p>{{ selectedRecord.finishReason || '-' }}</p></div>
          </div>
          <div class="agent-detail__question">
            <label>提问</label>
            <p>{{ selectedRecord.question || '-' }}</p>
          </div>
          <div class="agent-detail__tools" v-if="selectedRecord.toolsUsed">
            <label>调用工具</label>
            <p>{{ formatToolsUsed(selectedRecord.toolsUsed) }}</p>
          </div>
          <div class="agent-detail__tools" v-if="selectedRecord.selectedTools">
            <label>本轮候选工具</label>
            <p>{{ formatSelectedTools(selectedRecord.selectedTools) }}</p>
          </div>
          <div class="agent-detail__tools">
            <label>阶段耗时</label>
            <p>Planner {{ selectedRecord.plannerMs ?? '-' }} ms · Tool {{ selectedRecord.toolMs ?? '-' }} ms · Final {{ selectedRecord.finalMs ?? '-' }} ms</p>
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
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const { t } = useI18n();

  const logList = ref([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const todayCount = ref(0);
  const todayTokens = ref(0);
  const todayCost = ref('0');
  const totalCost = ref('0');
  const balance = ref<any>(null);
  const balanceLoading = ref(false);
  const balanceError = ref(false);
  const quality = ref<any>({
    sampleCount: 0,
    errorRate: 0,
    durationP50: null,
    durationP95: null,
    firstTokenP50: null,
    firstTokenP95: null,
    toolHitRate: 0,
    toolErrorRate: 0,
  });
  const searchValue = ref('');
  const hideInternal = ref(true);
  const selectedRecord = ref<any>(null);
  const detailVisible = ref(false);
  let timer: number | null = null;

  const balanceDisplay = computed(() => {
    if (balanceLoading.value && !balance.value) return t('aiMonitor.balance.loading');
    if (!balance.value) return t('aiMonitor.balance.unavailable');
    const symbol = balance.value.currency === 'CNY' ? '¥' : `${balance.value.currency || ''} `;
    return `${symbol}${Number(balance.value.totalBalance || 0).toFixed(2)}`;
  });
  const balanceHint = computed(() => {
    if (balanceError.value && !balance.value) return t('aiMonitor.balance.failed');
    if (!balance.value) return t('aiMonitor.balance.hint');
    if (!balance.value.isAvailable) return t('aiMonitor.balance.disabled');
    const source = balance.value.stale ? t('aiMonitor.balance.cached') : t('aiMonitor.balance.available');
    return `${source} · ${t('aiMonitor.balance.granted')} ${balance.value.grantedBalance} · ${t('aiMonitor.balance.toppedUp')} ${balance.value.toppedUpBalance}`;
  });

  const columns = [
    { title: '用户', key: 'userAlias', width: '1fr' },
    { title: '提问', key: 'question', width: '2fr', ellipsis: true },
    { title: '工具', key: 'toolsUsedDisplay', width: '1fr' },
    { title: '供应商', key: 'provider', width: '90px' },
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

  // 隐藏内部账号(root/test)开关:切换后列表与统计同步按新口径重查
  function onToggleInternal() {
    currentPage.value = 1;
    fetchLogs();
    fetchTodaySummary();
  }

  function fetchLogs() {
    apiBasePost('/api/common/getAgentLogs', {
      keyword: searchValue.value || undefined,
      pageSize: pageSize.value,
      currentPage: currentPage.value,
      hideInternal: hideInternal.value,
    }).then((res: any) => {
      if (res.status === 200) {
        logList.value = (res.data.items || []).map((item: any) => ({
          ...item,
          toolsUsedDisplay: formatToolsUsed(item.toolsUsed),
        }));
        total.value = res.data.total || 0;
      }
    });
  }

  function fetchTodaySummary() {
    apiBasePost('/api/common/getAgentLogsSummary', { hideInternal: hideInternal.value }).then((res: any) => {
      if (res.status === 200) {
        const d = res.data;
        todayCount.value = d.today?.count ?? 0;
        todayTokens.value = d.today?.tokens ?? 0;
        todayCost.value = d.today?.cost ?? '0';
        totalCost.value = d.total?.cost ?? '0';
        quality.value = { ...quality.value, ...(d.quality || {}) };
      }
    }).catch((err: any) => {
      console.warn('获取汇总失败:', err);
    });
  }

  async function fetchBalance(forceRefresh = false) {
    if (balanceLoading.value) return;
    balanceLoading.value = true;
    balanceError.value = false;
    try {
      const res: any = await apiBasePost('/api/common/getDeepSeekBalance', { forceRefresh }, { silent: true });
      if (res.status === 200 && res.data) balance.value = res.data;
      else balanceError.value = true;
    } catch {
      balanceError.value = true;
    } finally {
      balanceLoading.value = false;
    }
  }

  function formatTime(t: string) {
    if (!t) return '';
    return new Date(t).toLocaleString('zh-CN');
  }

  function formatNumber(n: number) {
    if (n == null) return '0';
    return n.toLocaleString();
  }

  function formatDuration(value: unknown) {
    const duration = Number(value);
    if (!Number.isFinite(duration)) return '-';
    return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
  }

  function formatToolsUsed(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      if (!Array.isArray(parsed)) return String(value || '-');
      return parsed.map((tool) => `${tool.name}${tool.status ? `(${tool.status})` : ''}`).join('、');
    } catch {
      return String(value || '-');
    }
  }

  function formatSelectedTools(value: unknown) {
    if (Array.isArray(value)) return value.join('、');
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed.join('、') : String(value || '-');
    } catch {
      return String(value || '-');
    }
  }

  onMounted(() => {
    fetchLogs();
    fetchTodaySummary();
    fetchBalance();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';
  .log-search-input { flex: 1; }
  .admin-table-card { padding: 0; }
  .agent-balance-card {
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 9%, var(--card-background)), var(--card-background));
  }
  .agent-balance-card .admin-stat-hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

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
