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

    <section v-if="data" class="ov-today" aria-labelledby="ov-today-title">
      <header class="ov-today__header">
        <div>
          <h3 id="ov-today-title">今日运营</h3>
          <p>
            北京时间自然日 · 主值为今日新增，辅助值为全站累计 ·
            {{ hideInternal ? '不含内部账号与新手种子资源' : '包含内部账号，仍不含新手种子资源' }}
            <span v-if="sameTimeCutoff"> · {{ t('adminOverview.sameTimeCutoff', { time: sameTimeCutoff }) }}</span>
          </p>
        </div>
        <div class="ov-today__capacity" aria-label="全站容量">
          <span class="ov-today__capacity-item">
            <span class="ov-today__capacity-label">全站存储</span>
            <strong class="ov-today__capacity-value">{{ mb(data.resources.storageMb) }}</strong>
            <span class="ov-today__capacity-hint">云盘文件占用</span>
          </span>
          <span class="ov-today__capacity-item" :class="{ 'is-warning': Number(data.resources.trashCount || 0) > 0 }">
            <span class="ov-today__capacity-label">回收站待清理</span>
            <strong class="ov-today__capacity-value">{{ mb(data.resources.trashMb) }}</strong>
            <span class="ov-today__capacity-hint">{{ n(data.resources.trashCount) }} 个文件</span>
          </span>
        </div>
      </header>
      <ul class="admin-stats ov-today__stats">
        <li class="admin-stat-card ov-today__stat-card">
          <BButton
            block
            class="ov-today__stat-action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: '新增用户' })"
            @click="drillDownTodayRecent('user')"
          >
            <span class="admin-stat-label">新增用户</span>
            <strong class="admin-stat-value">{{ n(data.users.today) }}</strong>
            <span class="admin-stat-hint">累计 {{ n(data.users.total) }}</span>
            <span v-if="baselineText('users')" class="ov-today__baseline">{{ baselineText('users') }}</span>
            <span class="ov-today__stat-link">{{ t('adminOverviewRecent.viewTodayDetails') }}</span>
          </BButton>
        </li>
        <li class="admin-stat-card ov-today__stat-card">
          <BButton
            block
            class="ov-today__stat-action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: '新增资源' })"
            @click="drillDownTodayRecent('resource')"
          >
            <span class="admin-stat-label">新增资源</span>
            <strong class="admin-stat-value">{{ n(todayResourceTotal) }}</strong>
            <span class="admin-stat-hint">累计 {{ n(totalResourceTotal) }}</span>
            <span v-if="baselineText('resources')" class="ov-today__baseline">{{ baselineText('resources') }}</span>
            <span class="ov-today__stat-link">{{ t('adminOverviewRecent.viewTodayDetails') }}</span>
          </BButton>
        </li>
        <li class="admin-stat-card ov-today__stat-card">
          <BButton
            block
            class="ov-today__stat-action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: '新增书签' })"
            @click="drillDownTodayRecent('bookmark')"
          >
            <span class="admin-stat-label">新增书签</span>
            <strong class="admin-stat-value">{{ n(data.resources.bookmarkToday) }}</strong>
            <span class="admin-stat-hint">累计 {{ n(data.resources.bookmarkTotal) }}</span>
            <span v-if="baselineText('bookmarks')" class="ov-today__baseline">{{ baselineText('bookmarks') }}</span>
            <span class="ov-today__stat-link">{{ t('adminOverviewRecent.viewTodayDetails') }}</span>
          </BButton>
        </li>
        <li class="admin-stat-card ov-today__stat-card">
          <BButton
            block
            class="ov-today__stat-action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: '新增笔记' })"
            @click="drillDownTodayRecent('note')"
          >
            <span class="admin-stat-label">新增笔记</span>
            <strong class="admin-stat-value">{{ n(data.resources.noteToday) }}</strong>
            <span class="admin-stat-hint">累计 {{ n(data.resources.noteTotal) }}</span>
            <span v-if="baselineText('notes')" class="ov-today__baseline">{{ baselineText('notes') }}</span>
            <span class="ov-today__stat-link">{{ t('adminOverviewRecent.viewTodayDetails') }}</span>
          </BButton>
        </li>
        <li class="admin-stat-card ov-today__stat-card">
          <BButton
            block
            class="ov-today__stat-action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: '新增文件' })"
            @click="drillDownTodayRecent('file')"
          >
            <span class="admin-stat-label">新增文件</span>
            <strong class="admin-stat-value">{{ n(data.resources.fileToday) }}</strong>
            <span class="admin-stat-hint">累计 {{ n(data.resources.fileTotal) }}</span>
            <span v-if="baselineText('files')" class="ov-today__baseline">{{ baselineText('files') }}</span>
            <span class="ov-today__stat-link">{{ t('adminOverviewRecent.viewTodayDetails') }}</span>
          </BButton>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">新增待办</span>
          <strong class="admin-stat-value">{{ n(data.todos.createdToday) }}</strong>
          <span class="admin-stat-hint">累计 {{ n(data.todos.total) }}</span>
          <span v-if="baselineText('todos')" class="ov-today__baseline">{{ baselineText('todos') }}</span>
        </li>
      </ul>
    </section>

    <section v-if="todayInsights.length" class="ov-insights" aria-labelledby="ov-insights-title">
      <strong id="ov-insights-title" class="ov-insights__title">{{ t('adminOverview.insightTitle') }}</strong>
      <ul class="ov-insights__list">
        <li
          v-for="insight in todayInsights"
          :key="insight.metric"
          class="ov-insights__item"
          :class="{ 'is-down': insight.direction === 'down' }"
        >
          <span>{{ insightText(insight) }}</span>
          <BButton size="small" class="ov-insights__action" @click="openInsight(insight)">
            {{
              insight.metric === 'users' ? t('adminOverview.viewConversion') : t('adminOverviewRecent.viewTodayDetails')
            }}
          </BButton>
        </li>
      </ul>
    </section>

    <!-- 待办提示:有待处理事项时高亮 -->
    <div v-if="data && pendingTotal > 0" class="ov-todo">
      <SvgIcon class="ov-todo-icon" :src="icon.settings.notification" size="16" aria-hidden="true" />
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
      <BButton size="small" class="ov-todo-center" @click="go('actionCenter')">
        {{ t('adminOverview.openActionCenter') }}
      </BButton>
    </div>

    <p class="ov-section-title"> 运行与待办健康 <span class="ov-section-tip">系统运行、事项积压与完成情况</span> </p>
    <ul class="admin-stats ov-health-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">活跃用户</span>
        <strong class="admin-stat-value">{{ n(data?.active.today) }}</strong>
        <span class="admin-stat-hint">登录会话口径</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">AI 调用</span>
        <strong class="admin-stat-value">{{ n(data?.ai.todayCount) }}</strong>
        <span class="admin-stat-hint">Token {{ n(data?.ai.todayTokens) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">API 请求</span>
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
      <li class="admin-stat-card">
        <span class="admin-stat-label">当前未完成</span>
        <strong class="admin-stat-value">{{ n(data?.todos.pending) }}</strong>
        <span class="admin-stat-hint">今日到期 {{ n(data?.todos.dueToday) }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'ov-todo-overdue': (data?.todos?.overdue || 0) > 0 }">
        <span class="admin-stat-label">当前逾期</span>
        <strong class="admin-stat-value" :class="{ 'ov-err': (data?.todos?.overdue || 0) > 0 }">
          {{ n(data?.todos?.overdue) }}
        </strong>
        <span class="admin-stat-hint" :class="{ 'ov-err': (data?.todos?.overdue || 0) > 0 }">
          {{ data ? ((data.todos.overdue || 0) > 0 ? '需优先处理' : '暂无逾期') : '—' }}
        </span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">今日完成</span>
        <strong class="admin-stat-value">{{ n(data?.todos.completedToday) }}</strong>
        <span class="admin-stat-hint">北京时间自然日</span>
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
    <div ref="recentAnchor" class="ov-recent-anchor">
      <AdminRecentAdditions
        :data="recentData"
        :loading="recentLoading"
        :error="recentError"
        :stacked="bookmark.isMobile || bookmark.isTablet"
        :mobile="bookmark.isMobile"
        :filter="recentFilter"
        :filtered-total="recentFilteredTotal"
        @retry="loadRecent"
        @view-users="go('userMg')"
        @filter-change="changeRecentFilter"
      />
    </div>
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { ref, computed, nextTick, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import AdminGrowthTrendCard from './AdminGrowthTrendCard.vue';
  import AdminRecentAdditions from './AdminRecentAdditions.vue';
  import {
    buildAdminTodayInsights,
    type AdminTodayBaseline,
    type AdminTodayInsight,
    type AdminTodayMetricKey,
  } from './adminTodayInsights.ts';
  import type { AdminRecentData, AdminRecentFilter, AdminRecentFilterType } from './adminRecentTypes.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { findVerticalScrollContainer, scrollIntoContainer } from '@/utils/zoom.ts';

  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const data = ref<any>(null);
  const hideInternal = ref(true);
  const loading = ref(false);
  const trendLoading = ref(false);
  const recentData = ref<AdminRecentData | null>(null);
  const recentLoading = ref(false);
  const recentError = ref(false);
  const recentScope = ref<string | null>(null);
  const recentFilter = ref<AdminRecentFilter>({ period: 'recent', type: 'all' });
  const recentAnchor = ref<HTMLElement | null>(null);
  const trendDays = ref('7');
  const trendOptions = [
    { key: '7', label: '近 7 天' },
    { key: '15', label: '近 15 天' },
    { key: '30', label: '近 30 天' },
    { key: '90', label: '近 90 天' },
  ];
  const trendCache = new Map<string, any>();
  let trendRequestSequence = 0;
  let recentRequestSequence = 0;
  const todayResourceTotal = computed(() =>
    data.value
      ? Number(data.value.resources.bookmarkToday || 0) +
        Number(data.value.resources.noteToday || 0) +
        Number(data.value.resources.fileToday || 0)
      : null,
  );
  const totalResourceTotal = computed(() =>
    data.value
      ? Number(data.value.resources.bookmarkTotal || 0) +
        Number(data.value.resources.noteTotal || 0) +
        Number(data.value.resources.fileTotal || 0)
      : null,
  );
  const sameTimeCutoff = computed(() => {
    const baseline = data.value?.todayBaseline as AdminTodayBaseline | undefined;
    return baseline?.available && baseline.mode === 'same_elapsed_time' ? baseline.cutoffTime : '';
  });
  const todayInsights = computed(() =>
    data.value
      ? buildAdminTodayInsights(
          {
            users: Number(data.value.users.today || 0),
            resources: Number(todayResourceTotal.value || 0),
            bookmarks: Number(data.value.resources.bookmarkToday || 0),
            notes: Number(data.value.resources.noteToday || 0),
            files: Number(data.value.resources.fileToday || 0),
            todos: Number(data.value.todos.createdToday || 0),
          },
          data.value.todayBaseline,
        )
      : [],
  );
  const recentFilteredTotal = computed(() => {
    if (!data.value || recentFilter.value.period !== 'today') return null;
    switch (recentFilter.value.type) {
      case 'all':
        return Number(data.value.users.today || 0) + Number(todayResourceTotal.value || 0);
      case 'resource':
        return Number(todayResourceTotal.value || 0);
      case 'user':
        return Number(data.value.users.today || 0);
      case 'bookmark':
        return Number(data.value.resources.bookmarkToday || 0);
      case 'note':
        return Number(data.value.resources.noteToday || 0);
      case 'file':
        return Number(data.value.resources.fileToday || 0);
      default:
        return null;
    }
  });

  const pageSubtitle = computed(() =>
    data.value ? `今日运营、系统健康与趋势 · 更新于 ${data.value.generatedAt}` : '今日运营、系统健康与趋势',
  );

  const n = (v: any) => (v == null ? '—' : Number(v).toLocaleString());
  const mb = (v: any) => {
    const m = Number(v || 0);
    return m >= 1024 ? `${(m / 1024).toFixed(2)} GB` : `${m} MB`;
  };

  function baselineText(metric: AdminTodayMetricKey) {
    const baseline = data.value?.todayBaseline as AdminTodayBaseline | undefined;
    const values = baseline?.available ? baseline.metrics?.[metric] : null;
    if (!values) return '';
    return t('adminOverview.todayBaseline', {
      yesterday: n(values.yesterday),
      days: baseline?.sampleDays || 7,
      average: n(values.average7d),
    });
  }

  function insightText(insight: AdminTodayInsight) {
    const metric = t(`adminOverview.metric.${insight.focus || insight.metric}`);
    const base =
      insight.changePercent == null
        ? t('adminOverview.insightFromZero', { metric, current: n(insight.current) })
        : t('adminOverview.insightChange', {
            metric,
            direction: t(`adminOverview.direction.${insight.direction}`),
            percent: insight.changePercent,
            current: n(insight.current),
            average: n(insight.average7d),
          });
    return insight.cause
      ? `${base}${t('adminOverview.insightCause', { component: t(`adminOverview.metric.${insight.cause}`) })}`
      : base;
  }

  const pendingTotal = computed(() => (data.value ? data.value.pending.opinion + data.value.pending.security : 0));
  const insightRecentType: Record<NonNullable<AdminTodayInsight['focus']>, AdminRecentFilterType> = {
    bookmarks: 'bookmark',
    notes: 'note',
    files: 'file',
  };

  function go(id: string) {
    router.push(bookmark.isMobile ? `/${id}` : `/admin/${id}`);
  }

  function goToSecurityEvents() {
    router.push({
      name: bookmark.isMobile ? 'securityEvents' : 'securityCenterEvents',
      query: { handledStatus: 'unhandled' },
    });
  }

  function openInsight(insight: AdminTodayInsight) {
    if (insight.metric === 'users') {
      go('conversion');
      return;
    }
    void drillDownTodayRecent(insight.focus ? insightRecentType[insight.focus] : 'resource');
  }

  async function load() {
    trendRequestSequence += 1;
    trendLoading.value = false;
    loading.value = true;
    void loadRecent();
    try {
      const res: any = await apiBasePost('/api/common/getAdminOverview', { hideInternal: hideInternal.value });
      if (res.status === 200) {
        data.value = res.data;
        trendCache.clear();
        trendCache.set(`${hideInternal.value}:7`, {
          trend: res.data.trend,
          days: 7,
          granularity: 'day',
        });
        if (trendDays.value !== '7') await loadTrend();
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadRecent() {
    const hideInternalValue = hideInternal.value;
    const filter = { ...recentFilter.value };
    const scopeKey = `${hideInternalValue}:${filter.period}:${filter.type}`;
    const requestSequence = ++recentRequestSequence;
    if (recentScope.value !== scopeKey) recentData.value = null;
    recentScope.value = scopeKey;
    recentLoading.value = true;
    recentError.value = false;
    try {
      const response: any = await apiBasePost('/api/common/getAdminOverviewRecent', {
        hideInternal: hideInternalValue,
        ...filter,
      });
      if (requestSequence !== recentRequestSequence) return;
      if (response.status === 200) recentData.value = response.data;
      else recentError.value = true;
    } catch (_error) {
      if (requestSequence === recentRequestSequence) recentError.value = true;
    } finally {
      if (requestSequence === recentRequestSequence) recentLoading.value = false;
    }
  }

  function changeRecentFilter(filter: AdminRecentFilter) {
    if (filter.period === recentFilter.value.period && filter.type === recentFilter.value.type) return;
    recentFilter.value = filter;
    void loadRecent();
  }

  async function drillDownTodayRecent(type: AdminRecentFilterType) {
    recentFilter.value = { period: 'today', type };
    void loadRecent();
    await nextTick();
    const target = recentAnchor.value;
    if (!target) return;
    const fallbackContainer = target.closest<HTMLElement>('.admin-data-page__table');
    const container = findVerticalScrollContainer(target, fallbackContainer);
    if (!container) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollIntoContainer(container, target, 8, reducedMotion ? 'auto' : 'smooth');
  }

  async function loadTrend() {
    if (!data.value) return;
    const days = Number(trendDays.value);
    const cacheKey = `${hideInternal.value}:${days}`;
    const cached = trendCache.get(cacheKey);
    if (cached) {
      data.value.trend = cached.trend;
      data.value.trendPeriod = { days: cached.days, granularity: cached.granularity };
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
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
  }

  .ov-today {
    display: grid;
    gap: 10px;
  }
  .ov-today__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .ov-today__header h3,
  .ov-today__header p {
    margin: 0;
  }
  .ov-today__header h3 {
    color: var(--text-color);
    font-size: 15px;
  }
  .ov-today__header p {
    margin-top: 3px;
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .ov-today__capacity {
    display: grid;
    flex: 0 1 340px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: min(100%, 340px);
  }
  .ov-today__capacity-item {
    display: grid;
    min-width: 0;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--card-background);

    &.is-warning {
      border-color: var(--warning-color);
    }
  }
  .ov-today__capacity-label,
  .ov-today__capacity-hint {
    overflow-wrap: anywhere;
    color: var(--sub-text-color);
    font-size: 10px;
  }
  .ov-today__capacity-value {
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.25;
  }
  .ov-today__capacity-item.is-warning .ov-today__capacity-hint {
    color: var(--warning-color);
    font-weight: 600;
  }
  .ov-today__stat-card {
    padding: 0;
  }
  .ov-today__stat-action.b_btn {
    width: 100%;
    height: 100%;
    min-height: 118px;
    align-items: flex-start;
    justify-content: flex-start;
    flex-direction: column;
    padding: 12px 14px;
    border-radius: 11px;
    background: transparent;
    color: var(--text-color);
    line-height: 1.35;
    text-align: left;
    white-space: normal;

    &:hover {
      background: var(--hover-background);
    }
  }
  .ov-today__stat-link {
    margin-top: auto;
    padding-top: 7px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 600;
  }
  .ov-today__baseline {
    display: block;
    margin-top: 4px;
    overflow-wrap: anywhere;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.35;
  }
  .ov-today__stats,
  .ov-health-stats {
    grid-template-columns: repeat(6, minmax(0, 1fr));
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
    color: #d97706;
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

  .ov-todo-center.b_btn {
    margin-left: auto;
    border-color: var(--warning-color);
    background: var(--card-background);
    color: var(--text-color);
  }

  .ov-insights {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    border-left: 3px solid var(--primary-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
  }
  .ov-insights__title {
    flex: none;
    padding-top: 5px;
    font-size: 12px;
  }
  .ov-insights__list {
    display: grid;
    flex: 1;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ov-insights__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    color: var(--text-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .ov-insights__item.is-down {
    color: var(--warning-color);
    font-weight: 600;
  }
  .ov-insights__action.b_btn {
    flex: none;
    color: var(--primary-color);
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

  .ov-recent-anchor {
    min-width: 0;
  }

  @media (max-width: 720px) {
    .ov-today__stats,
    .ov-health-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .ov-today__header {
      align-items: stretch;
      flex-direction: column;
    }
    .ov-today__capacity {
      flex-basis: auto;
      width: 100%;
    }
    .ov-insights,
    .ov-insights__item {
      align-items: stretch;
      flex-direction: column;
    }
    .ov-insights__title {
      padding-top: 0;
    }
    .ov-insights__action.b_btn,
    .ov-todo-center.b_btn {
      align-self: flex-start;
      margin-left: 0;
    }
    .ov-trend-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .ov-trend-control {
      width: 100%;
      justify-content: space-between;
    }
  }

  @media (min-width: 721px) and (max-width: 1024px) {
    .ov-today__stats,
    .ov-health-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
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

  :global(html.light-note-mobile-rendering) .ov-todo,
  :global(html.light-note-mobile-rendering) .ov-insights {
    box-shadow: none;
  }
</style>
