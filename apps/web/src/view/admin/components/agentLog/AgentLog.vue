<template>
  <AdminDataPage
    eyebrow="Admin / AI"
    title="AI 调用监控"
    :subtitle="t('aiMonitor.subtitle')"
    toolbar-hint="支持模糊匹配 · 回车或停止输入 0.5s 自动查询"
    :summary-count="total"
  >
    <template #metrics>
      <li class="admin-stat-card agent-balance-card">
        <span class="admin-stat-label">{{ t('aiMonitor.balance.title') }}</span>
        <strong class="admin-stat-value">{{ balanceDisplay }}</strong>
        <span class="admin-stat-hint agent-balance-hint">
          <span>{{ balanceHint || t('aiMonitor.balance.currentHint') }}</span>
          <BButton size="small" :loading="balanceLoading" @click="fetchBalance(true)">
            {{ t('aiMonitor.balance.refresh') }}
          </BButton>
        </span>
      </li>
      <li class="admin-stat-card agent-balance-change-card">
        <span class="admin-stat-label">{{ t('aiMonitor.balance.changeTitle') }}</span>
        <strong class="admin-stat-value">{{ dailyBalanceChangeDisplay }}</strong>
        <span class="admin-stat-hint">{{ dailyBalanceChangeHint }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiMonitor.metrics.todayTokens') }}</span>
        <strong class="admin-stat-value">{{ formatNumber(todayTokens) }}</strong>
        <span class="admin-stat-hint">{{ todayTokenHint }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">30 天质量</span>
        <strong class="admin-stat-value">{{ quality.errorRate }}% 错误率</strong>
        <span class="admin-stat-hint agent-quality-hint">
          P95 {{ formatDuration(quality.durationP95) }} · 首字 P50 {{ formatDuration(quality.firstTokenP50) }} ·
          工具错误 {{ quality.toolErrorRate }}% / 命中 {{ quality.toolHitRate }}%
        </span>
      </li>
    </template>

    <template #toolbar>
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
      <span class="admin-toolbar-switch">
        <BSwitch v-model:checked="hideInternal" @change="onToggleInternal" />
        隐藏内部账号(管理员/测试)
      </span>
    </template>

    <BTable
      ref="tableRef"
      fill
      virtual
      :data="logList"
      :columns="columns"
      :row-clickable="true"
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
      @row-click="onRowClick"
    />
  </AdminDataPage>

  <BModal v-model:visible="detailVisible" title="调用详情" width="550px" :show-footer="false" :mask-closable="true">
    <div class="agent-detail" v-if="selectedRecord">
      <div class="agent-detail__grid">
        <div
          ><label>用户</label><p>{{ selectedRecord.userAlias || '-' }}</p></div
        >
        <div
          ><label>状态</label><p>{{ selectedRecord.status || '-' }}</p></div
        >
        <div
          ><label>供应商 / 模型</label
          ><p>{{ selectedRecord.provider || '-' }} / {{ selectedRecord.model || '-' }}</p></div
        >
        <div
          ><label>Request ID</label><p>{{ selectedRecord.requestId || '-' }}</p></div
        >
        <div
          ><label>时间</label><p>{{ formatTime(selectedRecord.createdAt) }}</p></div
        >
        <div
          ><label>耗时</label><p>{{ selectedRecord.durationMs }} ms</p></div
        >
        <div
          ><label>首字耗时</label><p>{{ selectedRecord.firstTokenMs ?? '-' }} ms</p></div
        >
        <div
          ><label>API 调用次数</label><p>{{ selectedRecord.iterations || 1 }} 次</p></div
        >
        <div
          ><label>Usage</label><p>{{ selectedRecord.usageStatus || '-' }}</p></div
        >
        <div
          ><label>结束原因</label><p>{{ selectedRecord.finishReason || '-' }}</p></div
        >
      </div>
      <div class="agent-detail__question">
        <label>提问</label>
        <p>{{ selectedRecord.question || '-' }}</p>
      </div>
      <div class="agent-detail__outcome">
        <label>结果</label>
        <p class="agent-outcome-line">
          <span class="agent-outcome-tag" :class="`is-${selectedOutcome.tone}`">
            <i class="agent-outcome-dot" aria-hidden="true"></i>{{ selectedOutcome.label }}
          </span>
          <span class="agent-outcome-meta"
            >正文 {{ formatAnswerChars(selectedRecord) }} · {{ formatDeliveredLabel(selectedRecord.delivered) }}</span
          >
        </p>
        <p class="agent-outcome-digest">{{ formatAnswerDigest(selectedRecord) }}</p>
      </div>
      <div class="agent-detail__chain" v-if="chainLoading || chainSteps.length">
        <label>动作时间线</label>
        <p v-if="chainLoading" class="agent-chain-loading">正在加载链路…</p>
        <ol v-else class="agent-chain">
          <li v-for="step in chainSteps" :key="step.id" :class="{ 'is-current': step.isCurrent }">
            <i class="agent-outcome-dot" :class="`is-${step.tone}`" aria-hidden="true"></i>
            <span class="agent-chain-title">{{ step.title }}</span>
            <span class="agent-chain-detail">{{ step.detail }}</span>
            <span class="agent-chain-time">{{ step.at }}</span>
          </li>
        </ol>
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
        <p
          >Planner {{ selectedRecord.plannerMs ?? '-' }} ms · Tool {{ selectedRecord.toolMs ?? '-' }} ms · Final
          {{ selectedRecord.finalMs ?? '-' }} ms</p
        >
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
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import {
    type AgentLogChainStep,
    fetchAgentLogChain,
    formatAnswerChars,
    formatAnswerDigest,
    formatDeliveredLabel,
    outcomeMeta,
  } from './agentLogOutcome.ts';

  const { t } = useI18n();

  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const todayCount = ref(0);
  const todayTokens = ref(0);
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
  const chainSteps = ref<AgentLogChainStep[]>([]);
  const chainLoading = ref(false);
  // 快速连续点行会并发多个链路请求，只认最后一次，避免旧响应覆盖当前记录的时间线。
  let chainRequestSeq = 0;
  let timer: number | null = null;
  const {
    items: logList,
    total,
    loading,
    hasMore,
    loadMore,
    reload,
  } = useAdminCursorList<any>({
    request: (cursor, limit) =>
      apiBasePost('/api/common/getAgentLogs', {
        cursor,
        limit,
        keyword: searchValue.value || undefined,
        hideInternal: hideInternal.value,
      }),
    mapItems: (items) =>
      items.map((item: any) => ({
        ...item,
        toolsUsedDisplay: formatToolsUsed(item.toolsUsed),
      })),
    onError: () => message.error(t('common.requestFailedDescription')),
  });

  const balanceDisplay = computed(() => {
    if (balanceLoading.value && !balance.value) return t('aiMonitor.balance.loading');
    if (!balance.value) return t('aiMonitor.balance.unavailable');
    return formatBalanceAmount(balance.value.totalBalance, balance.value.currency);
  });
  const balanceHint = computed(() => {
    if (balanceError.value && !balance.value) return t('aiMonitor.balance.failed');
    if (!balance.value) return '';
    if (!balance.value.isAvailable) return t('aiMonitor.balance.disabled');
    return balance.value.stale ? t('aiMonitor.balance.cached') : '';
  });
  const dailyBalanceChange = computed(() => balance.value?.dailyBalanceChange || null);
  const dailyBalanceChangeDisplay = computed(() => {
    const change = dailyBalanceChange.value;
    if (!change?.isAvailable) return t('aiMonitor.balance.unavailable');
    const amount = Number(change.change);
    if (!Number.isFinite(amount)) return t('aiMonitor.balance.unavailable');
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    return `${sign}${formatBalanceAmount(amount, change.currency || balance.value?.currency)}`;
  });
  const dailyBalanceChangeHint = computed(() => {
    const change = dailyBalanceChange.value;
    if (!change?.isAvailable) return t('aiMonitor.balance.changeUnavailable');
    if (change.stale || balance.value?.stale) return t('aiMonitor.balance.changeCached');
    return change.partialDay ? t('aiMonitor.balance.changeFromBootstrap') : t('aiMonitor.balance.changeFromMidnight');
  });
  const todayTokenHint = computed(() =>
    t('aiMonitor.metrics.todayTokensHint', {
      calls: formatNumber(todayCount.value),
      total: formatNumber(total.value),
    }),
  );

  const columns = [
    { title: '用户', key: 'userAlias', width: '1fr' },
    { title: '提问', key: 'question', width: '2fr', ellipsis: true },
    { title: '工具', key: 'toolsUsedDisplay', width: '1fr' },
    { title: '供应商', key: 'provider', width: '90px' },
    { title: '调用', key: 'iterations', width: '60px' },
    { title: '时间', key: 'createdAt', width: '1fr' },
  ];

  const selectedOutcome = computed(() => outcomeMeta(selectedRecord.value?.outcomeKind));

  function onRowClick(record: any) {
    selectedRecord.value = record;
    detailVisible.value = true;
    void loadChain(record);
  }

  async function loadChain(record: any) {
    const seq = ++chainRequestSeq;
    chainSteps.value = [];
    if (!record?.correlationId) return;
    chainLoading.value = true;
    try {
      const steps = await fetchAgentLogChain(record);
      if (seq === chainRequestSeq) chainSteps.value = steps;
    } catch {
      // 链路是补充信息，取不到就不显示这一块，不打断详情查看。
      if (seq === chainRequestSeq) chainSteps.value = [];
    } finally {
      if (seq === chainRequestSeq) chainLoading.value = false;
    }
  }

  function handleSearch() {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      fetchLogs();
    }, 500);
  }

  // 隐藏内部账号(root/test)开关:切换后列表与统计同步按新口径重查
  function onToggleInternal() {
    fetchLogs();
    fetchTodaySummary();
  }

  function fetchLogs() {
    tableRef.value?.scrollToTop();
    void reload();
  }

  function fetchTodaySummary() {
    apiBasePost('/api/common/getAgentLogsSummary', { hideInternal: hideInternal.value })
      .then((res: any) => {
        if (res.status === 200) {
          const d = res.data;
          todayCount.value = d.today?.count ?? 0;
          todayTokens.value = d.today?.tokens ?? 0;
          quality.value = { ...quality.value, ...(d.quality || {}) };
        }
      })
      .catch((err: any) => {
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

  function formatBalanceAmount(value: unknown, currency: unknown) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;
    const code = String(currency || '')
      .trim()
      .toUpperCase();
    const symbol = code === 'CNY' ? '¥' : `${code || ''} `;
    return `${symbol}${safeAmount.toFixed(2)}`;
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
  .log-search-input {
    flex: 1;
  }
  .agent-balance-card {
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 9%, var(--card-background)),
      var(--card-background)
    );
  }
  .agent-balance-change-card {
    border-color: color-mix(in srgb, var(--success-color) 24%, var(--card-border-color));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--success-color) 8%, var(--card-background)),
      var(--card-background)
    );
  }
  .agent-balance-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .agent-quality-hint {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-toolbar-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
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
  .agent-detail__outcome label,
  .agent-detail__chain label,
  .agent-detail__error label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .agent-detail__grid p,
  .agent-detail__question p,
  .agent-detail__tools p,
  .agent-detail__outcome p,
  .agent-detail__error p {
    margin: 0;
    color: var(--text-color);
    word-break: break-all;
  }
  .agent-detail__question,
  .agent-detail__tools,
  .agent-detail__outcome,
  .agent-detail__chain,
  .agent-detail__error {
    margin-bottom: 12px;
  }

  // 状态信号必须有实色描边 + 实心圆点：APK 的系统 WebView 会把 color-mix 回退成实色，
  // 只靠混色底色表达的差异会全部消失。
  .agent-outcome-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .agent-outcome-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border: 1px solid var(--desc-color);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color);
  }
  .agent-outcome-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--desc-color);
    flex-shrink: 0;
  }
  .agent-outcome-tag.is-success {
    border-color: var(--success-color);
  }
  .agent-outcome-tag.is-success .agent-outcome-dot,
  .agent-outcome-dot.is-success {
    background: var(--success-color);
  }
  .agent-outcome-tag.is-warning {
    border-color: var(--warning-color);
  }
  .agent-outcome-tag.is-warning .agent-outcome-dot,
  .agent-outcome-dot.is-warning {
    background: var(--warning-color);
  }
  .agent-outcome-tag.is-danger {
    border-color: var(--error-color);
  }
  .agent-outcome-tag.is-danger .agent-outcome-dot,
  .agent-outcome-dot.is-danger {
    background: var(--error-color);
  }
  .agent-outcome-meta {
    font-size: 12px;
    color: var(--desc-color);
  }
  .agent-outcome-digest {
    margin-top: 6px !important;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--card-color);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .agent-chain-loading {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }
  .agent-chain {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .agent-chain li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    gap: 2px 8px;
    padding: 7px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-color);
  }
  // 当前查看的那一条：左描边 + 加粗双信号。用 --focus-ring-color 而不是 --primary-color，
  // 后者在深色主题的表面色上只有 2.02:1（见 admin-mixins.less 的说明）。
  .agent-chain li.is-current {
    border-left: 3px solid var(--focus-ring-color);
    font-weight: 600;
  }
  .agent-chain-detail {
    grid-column: 2;
    font-size: 12px;
    color: var(--desc-color);
    font-weight: 400;
  }
  .agent-chain-time {
    grid-row: 1;
    grid-column: 3;
    font-size: 12px;
    color: var(--desc-color);
    font-weight: 400;
    white-space: nowrap;
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
