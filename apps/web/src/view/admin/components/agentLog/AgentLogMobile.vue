<template>
  <div class="phone-list-container">
    <section class="phone-balance-card">
      <div>
        <span>{{ t('aiMonitor.balance.title') }}</span>
        <strong>{{ balanceDisplay }}</strong>
        <small v-if="balanceHint">{{ balanceHint }}</small>
      </div>
      <BButton size="small" :loading="balanceLoading" @click="fetchBalance(true)">
        {{ t('aiMonitor.balance.refresh') }}
      </BButton>
    </section>
    <section class="phone-balance-change-card">
      <span>{{ t('aiMonitor.balance.changeTitle') }}</span>
      <strong>{{ dailyBalanceChangeDisplay }}</strong>
      <small>{{ dailyBalanceChangeHint }}</small>
    </section>
    <div class="phone-search-bar">
      <b-input v-model:value="searchValue" placeholder="搜索用户/提问/工具" height="36px" @input="handleSearch">
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
    </div>

    <div v-if="!loading && logList.length === 0" class="phone-empty">暂无 AI 调用记录</div>
    <BVirtualList
      v-else
      ref="listRef"
      class="phone-list-body"
      :items="logList"
      :item-height="82"
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
    >
      <template #default="{ item }">
        <div class="phone-list-item" @click="openDetail(item)">
          <div class="phone-item-main">
            <span class="phone-item-user">{{ item.userAlias || '未知' }}</span>
            <span class="phone-item-task">{{ item.taskTypeLabel || item.taskType || 'AI 请求' }}</span>
          </div>
          <div class="phone-item-question">{{ item.requestPreview || item.question || '-' }}</div>
          <div class="phone-item-meta">
            <span>{{ formatToolsUsed(item.toolsUsed) }}</span>
            <span>·</span>
            <span>{{ item.totalTokens || 0 }} tk</span>
            <span>·</span>
            <span>{{ item.status === 'success' ? '✓' : '✗' }}</span>
            <span>·</span>
            <span>{{ formatTime(item.createdAt) }}</span>
          </div>
        </div>
      </template>
    </BVirtualList>

    <BModal v-model:visible="detailVisible" title="调用详情" width="90%" :show-footer="false">
      <div v-if="selected" class="detail-grid">
        <div class="detail-row"><strong>用户：</strong>{{ selected.userAlias }}</div>
        <div class="detail-row">
          <strong>{{ selected.requestLabel || '请求摘要' }}：</strong>{{ selected.requestPreview || selected.question }}
          <small v-if="selected.requestTruncated" class="detail-request-hint">
            已显示前 500 字，原摘要共 {{ selected.requestChars }} 字
          </small>
        </div>
        <div class="detail-row"><strong>工具：</strong>{{ formatToolsUsed(selected.toolsUsed) }}</div>
        <div class="detail-row"
          ><strong>供应商：</strong>{{ selected.provider || '-' }} / {{ selected.model || '-' }}</div
        >
        <div class="detail-row"><strong>Request ID：</strong>{{ selected.requestId || '-' }}</div>
        <div class="detail-row"><strong>API 次数：</strong>{{ selected.iterations }}</div>
        <div class="detail-row"
          ><strong>Token：</strong>{{ selected.promptTokens }} + {{ selected.completionTokens }} =
          {{ selected.totalTokens }}</div
        >
        <div class="detail-row"><strong>耗时：</strong>{{ selected.durationMs }} ms</div>
        <div class="detail-row"
          ><strong>阶段耗时：</strong>Planner {{ selected.plannerMs ?? '-' }} / Tool {{ selected.toolMs ?? '-' }} /
          Final {{ selected.finalMs ?? '-' }} ms</div
        >
        <div class="detail-row"><strong>Usage：</strong>{{ selected.usageStatus || '-' }}</div>
        <div class="detail-row"><strong>状态：</strong>{{ selected.status }}</div>
        <div class="detail-row">
          <strong>结果：</strong>
          <span class="agent-outcome-tag" :class="`is-${selectedOutcome.tone}`">
            <i class="agent-outcome-dot" aria-hidden="true"></i>{{ selectedOutcome.label }}
          </span>
        </div>
        <div class="detail-row"
          ><strong>正文：</strong>{{ formatAnswerChars(selected) }} ·
          {{ formatDeliveredLabel(selected.delivered) }}</div
        >
        <div class="detail-row detail-digest">{{ formatAnswerDigest(selected) }}</div>
        <div class="detail-row" v-if="chainLoading || chainSteps.length">
          <strong>动作时间线：</strong>
          <span v-if="chainLoading" class="detail-chain-loading">正在加载…</span>
          <ol v-else class="detail-chain">
            <li v-for="step in chainSteps" :key="step.id" :class="{ 'is-current': step.isCurrent }">
              <i class="agent-outcome-dot" :class="`is-${step.tone}`" aria-hidden="true"></i>
              <span>{{ step.title }}</span>
              <small>{{ step.detail }} · {{ step.at }}</small>
            </li>
          </ol>
        </div>
        <div class="detail-row"><strong>时间：</strong>{{ formatTime(selected.createdAt) }}</div>
      </div>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
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

  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const searchValue = ref('');
  const selected = ref<any>(null);
  const detailVisible = ref(false);
  const chainSteps = ref<AgentLogChainStep[]>([]);
  const chainLoading = ref(false);
  // 连续点开多条记录时只认最后一次请求，避免旧响应覆盖当前详情的时间线。
  let chainRequestSeq = 0;
  const balance = ref<any>(null);
  const balanceLoading = ref(false);
  const balanceError = ref(false);
  let timer: number | null = null;
  const {
    items: logList,
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
        hideInternal: true,
      }),
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

  const selectedOutcome = computed(() => outcomeMeta(selected.value?.outcomeKind));

  function openDetail(record: any) {
    selected.value = record;
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
      // 链路只是补充信息，拿不到就不显示，不影响详情其余内容。
      if (seq === chainRequestSeq) chainSteps.value = [];
    } finally {
      if (seq === chainRequestSeq) chainLoading.value = false;
    }
  }

  function handleSearch() {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(fetchLogs, 500);
  }

  function fetchLogs() {
    listRef.value?.scrollToTop();
    void reload();
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

  function formatBalanceAmount(value: unknown, currency: unknown) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;
    const code = String(currency || '')
      .trim()
      .toUpperCase();
    const symbol = code === 'CNY' ? '¥' : `${code || ''} `;
    return `${symbol}${safeAmount.toFixed(2)}`;
  }

  function formatToolsUsed(value: unknown) {
    if (!value) return '无工具';
    try {
      const parsed = JSON.parse(String(value));
      if (!Array.isArray(parsed)) return String(value);
      return parsed.map((tool) => `${tool.name}${tool.status ? `(${tool.status})` : ''}`).join('、');
    } catch {
      return String(value);
    }
  }

  onMounted(() => {
    fetchLogs();
    fetchBalance();
  });
</script>

<style lang="less" scoped>
  .phone-list-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .phone-balance-card {
    margin: 12px 16px 0;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    color: var(--text-color);
  }
  .phone-balance-card > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }
  .phone-balance-card span,
  .phone-balance-card small {
    color: var(--desc-color);
  }
  .phone-balance-card strong {
    font-size: 20px;
  }
  .phone-balance-change-card {
    margin: 8px 16px 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--success-color) 24%, var(--card-border-color));
    border-radius: 12px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    background: color-mix(in srgb, var(--success-color) 7%, var(--card-background));
    color: var(--text-color);
  }
  .phone-balance-change-card > span,
  .phone-balance-change-card small {
    color: var(--desc-color);
  }
  .phone-balance-change-card strong {
    font-size: 18px;
    text-align: right;
  }
  .phone-balance-change-card small {
    grid-column: 1 / -1;
    font-size: 12px;
  }
  .phone-search-bar {
    padding: 12px 16px;
    flex-shrink: 0;
  }
  .phone-list-body {
    flex: 1;
    min-height: 0;
    padding: 0 16px 16px;
  }
  .phone-empty {
    text-align: center;
    opacity: 0.35;
    padding: 60px 0;
    font-size: 14px;
  }
  .phone-list-item {
    height: 82px;
    padding: 12px 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--card-border-color);
    cursor: pointer;
    overflow: hidden;
  }
  .phone-item-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .phone-item-user {
    font-weight: 600;
    color: var(--text-color);
  }
  .phone-item-task {
    padding: 1px 6px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--text-color);
    font-size: 10px;
    font-weight: 600;
  }
  .phone-item-question {
    font-size: 13px;
    color: var(--text-color);
    opacity: 0.8;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .phone-item-meta {
    display: flex;
    gap: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .detail-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--text-color);
  }
  .detail-row {
    font-size: 14px;
    line-height: 1.6;
  }
  .detail-request-hint {
    display: block;
    color: var(--desc-color);
    font-size: 11px;
  }
  // 结果与链路状态用实色描边 + 实心圆点：APK 的系统 WebView 会把混色回退成实色。
  .agent-outcome-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 9px;
    border: 1px solid var(--desc-color);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
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
  .detail-digest {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--card-color);
    font-size: 13px;
    white-space: pre-wrap;
  }
  .detail-chain-loading {
    color: var(--desc-color);
    font-size: 13px;
  }
  .detail-chain {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }
  .detail-chain li {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 2px 8px;
    padding: 6px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    font-size: 13px;
  }
  // 左描边用 --focus-ring-color：--primary-color 在深色主题表面上只有 2.02:1（见 admin-mixins.less）。
  .detail-chain li.is-current {
    border-left: 3px solid var(--focus-ring-color);
    font-weight: 600;
  }
  .detail-chain small {
    grid-column: 2;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }
</style>
