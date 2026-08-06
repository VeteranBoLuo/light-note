<template>
  <AdminDataPage eyebrow="Admin / 总览" title="数据总览" :subtitle="pageSubtitle" layout="scroll">
    <template #actions>
      <label class="ov-hide-internal">
        <BSwitch v-model:checked="hideInternal" :disabled="loading" @change="load" />隐藏内部账号（管理员/测试）
      </label>
      <BButton size="small" :loading="loading" @click="load">刷新</BButton>
    </template>

    <!-- 加载态：此前 data 为 null 时全部显示「—」，分不清是在加载还是真的没有数据 -->
    <p v-if="loading && !data" class="ov-loading">正在加载全站数据…</p>

    <!-- 待办提示:有待处理事项时高亮 -->
    <div v-if="data && pendingTotal > 0" class="ov-todo">
      <span class="ov-todo-icon">🔔</span>
      <span class="ov-todo-text">待处理事项</span>
      <BButton
        v-if="data.pending.opinion > 0"
        size="small"
        class="ov-todo-chip"
        role="button"
        tabindex="0"
        @click="go('userOpinion')"
        @keydown.enter.prevent="go('userOpinion')"
        @keydown.space.prevent="go('userOpinion')"
      >
        待回复反馈 {{ data.pending.opinion }} 条
      </BButton>
      <BButton
        v-if="data.pending.security > 0"
        size="small"
        class="ov-todo-chip danger"
        role="button"
        tabindex="0"
        @click="goToSecurityEvents"
        @keydown.enter.prevent="goToSecurityEvents"
        @keydown.space.prevent="goToSecurityEvents"
      >
        未处理高危安全事件 {{ data.pending.security }} 起
      </BButton>
    </div>

    <!-- 用户与内容:累计为主 + 今日增量 -->
    <p class="ov-section-title">用户与内容 <span class="ov-section-tip">累计总量 · 今日增量</span></p>
    <ul class="admin-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">总用户</span>
        <strong class="admin-stat-value">{{ n(data?.users.total) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.users.today) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">书签</span>
        <strong class="admin-stat-value">{{ n(data?.resources.bookmarkTotal) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.resources.bookmarkToday) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">笔记</span>
        <strong class="admin-stat-value">{{ n(data?.resources.noteTotal) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.resources.noteToday) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">文件</span>
        <strong class="admin-stat-value">{{ n(data?.resources.fileTotal) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.resources.fileToday) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">全站存储</span>
        <strong class="admin-stat-value">{{ mb(data?.resources.storageMb) }}</strong>
        <span class="admin-stat-hint">云盘文件占用</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">回收站待清理</span>
        <strong class="admin-stat-value">{{ mb(data?.resources.trashMb) }}</strong>
        <span class="admin-stat-hint">{{ n(data?.resources.trashCount) }} 个文件</span>
      </li>
    </ul>

    <!-- AI 用量:累计为主 + 今日增量；金额以 AI 监控的供应商余额变化为准。 -->
    <p class="ov-section-title">AI 用量 <span class="ov-section-tip">累计总量 · 今日增量</span></p>
    <ul class="admin-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">调用次数</span>
        <strong class="admin-stat-value">{{ n(data?.ai.totalCount) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.ai.todayCount) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">Token 消耗</span>
        <strong class="admin-stat-value">{{ n(data?.ai.totalTokens) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.ai.todayTokens) }}</span>
      </li>
    </ul>

    <!-- 活跃与健康:近期动态 -->
    <p class="ov-section-title">活跃与健康 <span class="ov-section-tip">近期动态</span></p>
    <ul class="admin-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">今日活跃用户</span>
        <strong class="admin-stat-value">{{ n(data?.active.today) }}</strong>
        <span class="admin-stat-hint">
          近 {{ data?.active?.periodDays || 7 }} 天 {{ n(data?.active?.period ?? data?.active?.week) }}
        </span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">今日 API 请求</span>
        <strong class="admin-stat-value">{{ n(data?.system.apiToday) }}</strong>
        <span class="admin-stat-hint ov-api-health">
          <span :class="{ 'ov-warn': (data?.system.apiBusinessErrorsToday || 0) > 0 }"
            >业务 4xx {{ n(data?.system.apiBusinessErrorsToday) }}</span
          >
          <span :class="{ 'ov-muted-warn': (data?.system.apiInvalidRequestsToday || 0) > 0 }"
            >无效访问 {{ n(data?.system.apiInvalidRequestsToday) }}</span
          >
          <span :class="{ 'ov-err': (data?.system.apiServerErrorsToday || 0) > 0 }"
            >服务 5xx {{ n(data?.system.apiServerErrorsToday) }}</span
          >
        </span>
      </li>
      <li class="admin-stat-card ov-link-card">
        <BButton class="ov-link-action" @click="go('agentLog')">
          <span class="admin-stat-label">AI 监控</span>
          <strong class="admin-stat-value" aria-hidden="true">→</strong>
          <span class="admin-stat-hint">调用明细</span>
        </BButton>
      </li>
    </ul>

    <p class="ov-section-title">待办运行 <span class="ov-section-tip">全站聚合 · 不展示待办正文</span></p>
    <ul class="admin-stats ov-todo-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">待办总量</span>
        <strong class="admin-stat-value">{{ n(data?.todos?.total) }}</strong>
        <span class="admin-stat-hint">{{ delta(data?.todos?.createdToday) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">当前未完成</span>
        <strong class="admin-stat-value">{{ n(data?.todos?.pending) }}</strong>
        <span class="admin-stat-hint">今日到期 {{ n(data?.todos?.dueToday) }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'ov-todo-overdue': (data?.todos?.overdue || 0) > 0 }">
        <span class="admin-stat-label">今日完成</span>
        <strong class="admin-stat-value">{{ n(data?.todos?.completedToday) }}</strong>
        <span class="admin-stat-hint" :class="{ 'ov-err': (data?.todos?.overdue || 0) > 0 }">
          当前逾期 {{ n(data?.todos?.overdue) }}
        </span>
      </li>
    </ul>

    <!-- 游客转化:累计 -->
    <p class="ov-section-title">游客转化 <span class="ov-section-tip">累计</span></p>
    <ul class="admin-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">累计访客</span>
        <strong class="admin-stat-value">{{ n(data?.conversion.visitors) }}</strong>
        <span class="admin-stat-hint">独立指纹</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">累计注册</span>
        <strong class="admin-stat-value">{{ n(data?.conversion.registers) }}</strong>
        <span class="admin-stat-hint">整体转化 {{ convRate }}%</span>
      </li>
      <li class="admin-stat-card ov-link-card">
        <BButton class="ov-link-action" @click="go('conversion')">
          <span class="admin-stat-label">转化漏斗</span>
          <strong class="admin-stat-value" aria-hidden="true">→</strong>
          <span class="admin-stat-hint">详细分析</span>
        </BButton>
      </li>
    </ul>

    <div class="ov-trend-head">
      <p class="ov-section-title">近 {{ trendDays }} 天新增趋势</p>
      <div class="ov-trend-control">
        <span v-if="trendLoading" class="ov-trend-loading">正在更新…</span>
        <BTabs v-model:active-tab="trendDays" :options="trendOptions" variant="segment" @change="loadTrend" />
      </div>
    </div>
    <AdminGrowthTrendCard
      v-if="data"
      :trend="data.trend"
      :period-days="Number(trendDays)"
      :granularity="data.trendPeriod?.granularity || 'day'"
    />
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import AdminGrowthTrendCard from './AdminGrowthTrendCard.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';

  const bookmark = bookmarkStore();
  const data = ref<any>(null);
  const hideInternal = ref(true);
  const loading = ref(false);
  const trendLoading = ref(false);
  const trendDays = ref('7');
  const trendOptions = [
    { key: '7', label: '近 7 天' },
    { key: '15', label: '近 15 天' },
    { key: '30', label: '近 30 天' },
    { key: '90', label: '近 90 天' },
  ];
  const trendCache = new Map<string, any>();
  let trendRequestSequence = 0;

  const pageSubtitle = computed(() =>
    data.value ? `全站累计规模与近期动态一览 · 更新于 ${data.value.generatedAt}` : '全站累计规模与近期动态一览',
  );

  const n = (v: any) => (v == null ? '—' : Number(v).toLocaleString());
  const delta = (v: any) => (v == null ? '今日 —' : `今日 +${Number(v).toLocaleString()}`);
  const mb = (v: any) => {
    const m = Number(v || 0);
    return m >= 1024 ? `${(m / 1024).toFixed(2)} GB` : `${m} MB`;
  };

  const pendingTotal = computed(() => (data.value ? data.value.pending.opinion + data.value.pending.security : 0));
  const convRate = computed(() => {
    const c = data.value?.conversion;
    if (!c || !c.visitors) return 0;
    return Math.round((c.registers / c.visitors) * 1000) / 10;
  });

  // 趋势双线迷你图:归一化到 viewBox 高度(顶部留 2、底部到 40)
  function go(id: string) {
    router.push(bookmark.isMobile ? `/${id}` : `/admin/${id}`);
  }

  function goToSecurityEvents() {
    router.push({
      name: bookmark.isMobile ? 'securityEvents' : 'securityCenterEvents',
      query: { handledStatus: 'unhandled' },
    });
  }

  async function load() {
    trendRequestSequence += 1;
    trendLoading.value = false;
    loading.value = true;
    try {
      const res: any = await apiBasePost('/api/common/getAdminOverview', { hideInternal: hideInternal.value });
      if (res.status === 200) {
        data.value = res.data;
        data.value.active.period = res.data.active?.week || 0;
        data.value.active.periodDays = 7;
        trendCache.clear();
        trendCache.set(`${hideInternal.value}:7`, {
          trend: res.data.trend,
          days: 7,
          granularity: 'day',
          activeUsers: res.data.active?.week || 0,
        });
        if (trendDays.value !== '7') await loadTrend();
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadTrend() {
    if (!data.value) return;
    const days = Number(trendDays.value);
    const cacheKey = `${hideInternal.value}:${days}`;
    const cached = trendCache.get(cacheKey);
    if (cached) {
      data.value.trend = cached.trend;
      data.value.trendPeriod = { days: cached.days, granularity: cached.granularity };
      data.value.active.period = cached.activeUsers;
      data.value.active.periodDays = cached.days;
      return;
    }
    const requestSequence = ++trendRequestSequence;
    trendLoading.value = true;
    try {
      const response: any = await apiBasePost('/api/common/getAdminOverviewTrend', {
        days,
        hideInternal: hideInternal.value,
      });
      if (requestSequence !== trendRequestSequence || response.status !== 200) return;
      trendCache.set(cacheKey, response.data);
      data.value.trend = response.data.trend;
      data.value.trendPeriod = { days: response.data.days, granularity: response.data.granularity };
      data.value.active.period = response.data.activeUsers;
      data.value.active.periodDays = response.data.days;
    } finally {
      if (requestSequence === trendRequestSequence) trendLoading.value = false;
    }
  }

  onMounted(load);
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .ov-hide-internal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-color);
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
  }

  .ov-loading {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }

  /* 内容较多:整面板纵向滚动、KPI 卡按自然高度排布(同 ConversionFunnel 的做法) */
  .admin-panel {
    overflow-y: auto;
  }
  .admin-stats {
    flex: none;
  }

  .ov-section-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 20px 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }
  .ov-section-title:first-of-type {
    margin-top: 10px;
  }
  .ov-section-tip {
    font-size: 11px;
    font-weight: 400;
    color: var(--sub-text-color, #888);
  }

  .ov-todo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--warning-color) 12%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--warning-color) 35%, transparent);
    font-size: 13px;
    color: var(--text-color);
  }
  .ov-todo-icon {
    font-size: 15px;
  }
  .ov-todo-text {
    font-weight: 600;
  }
  .ov-todo-chip {
    min-height: 26px;
    height: auto !important;
    padding: 4px 10px !important;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning-color) 22%, transparent);
    color: var(--text-color);
    font-size: 12.5px;
    line-height: 1.35 !important;
    cursor: pointer;
    transition:
      background 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;

    &:hover,
    &:focus-visible {
      outline: none;
      transform: translateY(-1px);
      box-shadow: 0 3px 8px color-mix(in srgb, var(--warning-color) 18%, transparent);
    }
  }
  .ov-todo-chip.danger {
    background: color-mix(in srgb, var(--danger-color) 20%, transparent);

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--danger-color) 28%, transparent);
      box-shadow: 0 3px 8px color-mix(in srgb, var(--danger-color) 18%, transparent);
    }
  }

  .ov-err {
    color: var(--danger-color) !important;
    font-weight: 600;
  }

  .ov-todo-overdue {
    border-color: var(--danger-color);
  }

  .ov-trend-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 20px;

    .ov-section-title {
      margin: 0;
    }
  }

  .ov-trend-control {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ov-trend-loading {
    color: var(--desc-color);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .ov-trend-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .ov-trend-control {
      width: 100%;
      justify-content: space-between;
    }
  }

  .ov-api-health {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 10px;
    line-height: 1.45;
  }
  .ov-warn {
    color: var(--warning-color);
    font-weight: 600;
  }
  .ov-muted-warn {
    color: var(--desc-color);
    font-weight: 600;
  }

  /* 卡片负责表面和高度，BButton 只负责交互。不再让按钮的默认 32px
     高度与 admin-stat-card 竞争，否则标题、箭头和提示会溢出卡片。 */
  .ov-link-card {
    padding: 0;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .ov-link-card:hover,
  .ov-link-card:focus-within {
    border-color: var(--primary-color);
  }

  .ov-link-action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    flex: 1;
    width: 100%;
    min-height: 100%;
    height: auto !important;
    padding: 12px 14px;
    border: 0 !important;
    border-radius: 11px;
    background: transparent;
    line-height: normal;
    font: inherit;
    text-align: left;
    cursor: pointer;
    white-space: normal;
  }
</style>
