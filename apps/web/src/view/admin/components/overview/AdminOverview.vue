<template>
  <AdminDataPage appearance="workspace" :title="t('adminWorkspace.overview')" layout="scroll">
    <template #actions>
      <label class="ov-hide-internal"
        ><BSwitch v-model:checked="hideInternal" :disabled="loading" @change="changeOverviewScope" />{{
          t('adminWorkspace.hideInternal')
        }}</label
      >
      <BTooltip :title="overviewContext">
        <BButton size="small" :loading="loading" :aria-description="overviewContext" @click="refreshOverview"
          ><SvgIcon :src="icon.infrastructure.refresh" size="16" />{{ t('common.refresh') }}</BButton
        >
      </BTooltip>
    </template>
    <BLoading v-if="loading && !data" inline loading :title="t('adminOverview.loading')" />
    <div v-if="loadError" class="ov-load-error" role="alert"
      ><span>{{ data ? t('adminOverview.refreshFailed') : t('adminOverview.loadFailed') }}</span
      ><BButton size="small" @click="refreshOverview">{{ t('adminOverview.retry') }}</BButton></div
    >
    <template v-if="data">
      <ul class="ov-metrics">
        <li class="ov-metric">
          <BButton
            class="ov-metric__action"
            :aria-label="t('adminActivity.view')"
            :title="t('adminOverview.activeUserHint')"
            @click="activeDrawerOpen = true"
          >
            <SvgIcon class="ov-metric__icon" :src="icon.navigation.user" size="20" />
            <span class="ov-metric__label">{{ t('adminWorkspace.active') }}</span
            ><strong class="ov-metric__value">{{
              data.active?.available === false ? '—' : n(data.active?.today)
            }}</strong>
            <span class="ov-metric__hint">{{ baselineText('activeUsers') || t('adminActivity.noBaseline') }}</span>
            <span v-if="data.active?.available === false" class="ov-metric__hint">{{
              t('adminActivity.unavailable')
            }}</span
            ><span v-else-if="data.active?.partialToday" class="ov-metric__hint">{{ t('adminActivity.partial') }}</span>
            <span class="ov-metric__link">{{ t('adminActivity.view') }} →</span>
          </BButton>
        </li>
        <li class="ov-metric">
          <BButton
            class="ov-metric__action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: t('adminWorkspace.users') })"
            @click="drillDownTodayRecent('user')"
          >
            <SvgIcon class="ov-metric__icon" :src="icon.navigation.user" size="20" /><span class="ov-metric__label">{{
              t('adminWorkspace.users')
            }}</span
            ><strong class="ov-metric__value">{{ n(data.users.today) }}</strong
            ><span class="ov-metric__hint">{{ t('adminWorkspace.cumulative', { count: n(data.users.total) }) }}</span
            ><span v-if="baselineText('users')" class="ov-metric__hint">{{ baselineText('users') }}</span
            ><span class="ov-metric__link">{{ t('adminOverviewRecent.viewTodayDetails') }} →</span>
          </BButton>
        </li>
        <li class="ov-metric ov-metric--resources">
          <BButton
            class="ov-metric__action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: t('adminWorkspace.resources') })"
            :title="baselineText('resources')"
            @click="drillDownTodayRecent('resource')"
          >
            <SvgIcon class="ov-metric__icon" :src="icon.resource.file" size="20" /><span class="ov-metric__label"
              >{{ t('adminWorkspace.resources') }} →</span
            ><span class="ov-metric__headline"
              ><strong class="ov-metric__value">{{ n(todayResourceTotal) }}</strong
              ><span class="ov-metric__hint">{{
                t('adminWorkspace.cumulative', { count: n(totalResourceTotal) })
              }}</span></span
            >
          </BButton>
          <div class="ov-resource-breakdown">
            <BTooltip
              v-for="item in resourceMetrics"
              :key="item.type"
              :title="`${t('adminWorkspace.cumulative', { count: n(item.total) })}${baselineText(item.metric) ? ' · ' + baselineText(item.metric) : ''}`"
              ><BButton
                class="ov-resource-breakdown__row"
                type="text"
                size="small"
                :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: item.label })"
                @click="drillDownTodayRecent(item.type)"
                ><span class="ov-resource-breakdown__label">{{ item.label }}</span
                ><span class="ov-resource-breakdown__counts"
                  ><strong>{{ n(item.total) }}</strong
                  ><small>{{ t('adminWorkspace.todayAdded', { count: n(item.today) }) }}</small></span
                ></BButton
              ></BTooltip
            >
          </div>
        </li>
        <li class="ov-metric">
          <BButton
            class="ov-metric__action"
            :aria-label="t('adminOverviewRecent.viewMetricDetails', { metric: t('adminWorkspace.todos') })"
            @click="drillDownTodayRecent('todo')"
            ><SvgIcon class="ov-metric__icon" :src="icon.todoWorkspace.checkSquare" size="20" /><span
              class="ov-metric__label"
              >{{ t('adminWorkspace.todos') }}</span
            ><strong class="ov-metric__value">{{ n(data.todos.createdToday) }}</strong
            ><span class="ov-metric__hint">{{ t('adminWorkspace.cumulative', { count: n(data.todos.total) }) }}</span
            ><span v-if="baselineText('todos')" class="ov-metric__hint">{{ baselineText('todos') }}</span
            ><span class="ov-metric__link">{{ t('adminOverviewRecent.viewTodayDetails') }} →</span></BButton
          >
        </li>
      </ul>
      <div v-if="pendingTotal > 0" class="ov-attention">
        <SvgIcon :src="icon.settings.notification" size="18" /><strong>{{ t('adminWorkspace.pending') }}</strong>
        <BButton v-if="data.pending.opinion > 0" type="text" size="small" @click="go('userOpinion')">{{
          t('adminWorkspace.opinions', { count: data.pending.opinion })
        }}</BButton>
        <BButton
          v-if="data.pending.security > 0"
          type="text"
          size="small"
          class="ov-danger"
          @click="goToSecurityEvents"
          >{{ t('adminWorkspace.security', { count: data.pending.security }) }}</BButton
        >
        <BButton type="text" size="small" class="ov-attention__all" @click="go('actionCenter')"
          >{{ t('adminOverview.openActionCenter') }} →</BButton
        >
      </div>
      <div class="ov-section-heading"
        ><h3>{{ t('adminWorkspace.trends') }}</h3
        ><div class="ov-trend-control"
          ><BLoading v-if="trendLoading" inline loading :title="t('adminOverview.trendLoading')" /><span
            v-else-if="trendError"
            class="ov-danger"
            role="alert"
            >{{ t('adminOverview.trendLoadFailed')
            }}<BButton size="small" @click="loadTrend">{{ t('adminOverview.retryTrend') }}</BButton></span
          ><BSelect
            v-model:value="trendDays"
            class="ov-period"
            :options="trendOptions"
            :aria-label="t('adminWorkspace.trends')"
            @change="loadTrend" /></div
      ></div>
      <AdminGrowthTrendCard
        :trend="data.trend"
        :period-days="Number(trendDays)"
        :granularity="data.trendPeriod?.granularity || 'day'"
      />
      <section class="ov-runtime" :aria-label="t('adminWorkspace.runtime')">
        <h3>{{ t('adminWorkspace.runtime') }}</h3>
        <div class="ov-runtime__grid">
          <div class="ov-runtime__item"
            ><SvgIcon :src="icon.growth.ai" size="20" /><div
              ><span>{{ t('adminWorkspace.ai') }}</span
              ><strong>{{ n(data.ai.todayCount) }}</strong
              ><small>Token {{ n(data.ai.todayTokens) }}</small
              ><small v-if="baselineText('aiCalls')">{{ baselineText('aiCalls') }}</small></div
            ></div
          >
          <div class="ov-runtime__item"
            ><SvgIcon :src="icon.userCenter.log" size="20" /><div
              ><span>{{ t('adminWorkspace.api') }}</span
              ><strong>{{ n(data.system.apiToday) }}</strong
              ><small class="ov-api-health"
                ><span :class="{ 'ov-warning': data.system.apiBusinessErrorsToday > 0 }">{{
                  t('adminWorkspace.businessErrors', { count: n(data.system.apiBusinessErrorsToday) })
                }}</span
                ><span>{{
                  t('adminWorkspace.invalidRequests', { count: n(data.system.apiInvalidRequestsToday) })
                }}</span
                ><span :class="{ 'ov-danger': data.system.apiServerErrorsToday > 0 }">{{
                  t('adminWorkspace.serverErrors', { count: n(data.system.apiServerErrorsToday) })
                }}</span></small
              ></div
            ></div
          >
          <div class="ov-runtime__item"
            ><SvgIcon :src="icon.todoWorkspace.checkSquare" size="20" /><div
              ><span>{{ t('adminWorkspace.todoHealth') }}</span
              ><strong>{{ t('adminWorkspace.unfinished', { count: n(data.todos.pending) }) }}</strong
              ><small
                >{{ t('adminWorkspace.due', { count: n(data.todos.dueToday) }) }} ·
                <span :class="{ 'ov-danger': data.todos.overdue > 0 }">{{
                  t('adminWorkspace.overdue', { count: n(data.todos.overdue) })
                }}</span>
                · {{ t('adminWorkspace.completed', { count: n(data.todos.completedToday) }) }}</small
              ></div
            ></div
          >
          <div class="ov-runtime__item"
            ><SvgIcon :src="icon.growth.storage" size="20" /><div
              ><span>{{ t('adminWorkspace.storage') }}</span
              ><strong>{{ t('adminWorkspace.used', { size: mb(data.resources.storageMb) }) }}</strong
              ><small>{{
                t('adminWorkspace.trash', { size: mb(data.resources.trashMb), count: n(data.resources.trashCount) })
              }}</small></div
            ></div
          >
        </div>
      </section>
      <section v-if="todayInsights.length" class="ov-insights" :aria-label="t('adminOverview.insightTitle')"
        ><strong>{{ t('adminOverview.insightTitle') }}</strong
        ><div v-for="insight in todayInsights" :key="insight.metric" class="ov-insight"
          ><span>{{ insightText(insight) }}</span
          ><BButton type="text" size="small" @click="openInsight(insight)">{{
            insight.metric === 'users' ? t('adminOverview.viewConversion') : t('adminOverviewRecent.viewTodayDetails')
          }}</BButton></div
        ></section
      >
      <div ref="recentAnchor" class="ov-recent-anchor"
        ><AdminRecentAdditions
          :data="recentData"
          :loading="recentLoading"
          :resource-loading="resourceRecent.loading.value"
          :user-loading="userRecent.loading.value"
          :resource-has-more="resourceRecent.hasMore.value"
          :user-has-more="userRecent.hasMore.value"
          :resource-error="resourceRecentError"
          :user-error="userRecentError"
          :stacked="bookmark.isMobile || bookmark.isTablet"
          :mobile="bookmark.isMobile"
          :filter="recentFilter"
          :filtered-total="recentFilteredTotal"
          @retry-resource="retryResourceRecent"
          @retry-user="retryUserRecent"
          @load-more-resource="loadMoreResourceRecent"
          @load-more-user="loadMoreUserRecent"
          @view-users="go('userMg')"
          @filter-change="changeRecentFilter"
      /></div>
    </template>
    <AdminActiveUsersDrawer
      :open="activeDrawerOpen"
      :hide-internal="hideInternal"
      @close="activeDrawerOpen = false"
      @snapshot="syncActiveSnapshot"
    />
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { ref, computed, nextTick, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import { getAdminOverviewSnapshot } from '@/api/adminOverview.ts';
  import { useAdminCursorList } from '@/composables/useAdminCursorList.ts';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import AdminGrowthTrendCard from './AdminGrowthTrendCard.vue';
  import AdminActiveUsersDrawer from './AdminActiveUsersDrawer.vue';
  import type { ActiveUsersPage } from '@/api/userActivity';
  import AdminRecentAdditions from './AdminRecentAdditions.vue';
  import {
    buildAdminTodayInsights,
    formatAdminTodayBaseline,
    type AdminTodayBaseline,
    type AdminTodayInsight,
    type AdminTodayMetricKey,
  } from './adminTodayInsights.ts';
  import type {
    AdminRecentData,
    AdminRecentFilter,
    AdminRecentFilterType,
    AdminRecentPage,
    AdminRecentResource,
    AdminRecentTarget,
    AdminRecentUser,
  } from './adminRecentTypes.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import { adminWorkspaceMessages } from '@/i18n/locales/adminWorkspace';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { findVerticalScrollContainer, scrollIntoContainer } from '@/utils/scrolling';

  const bookmark = bookmarkStore();
  const { t } = useI18n({ messages: adminWorkspaceMessages, missingWarn: false, fallbackWarn: false });
  const data = ref<any>(null);
  const hideInternal = ref(true);
  const activeDrawerOpen = ref(false);
  let activeDetailSnapshot: ActiveUsersPage | null = null;
  function syncActiveSnapshot(page: ActiveUsersPage) {
    if (!data.value || page.hideInternal !== hideInternal.value) return;
    if (data.value.active?.snapshotAt && data.value.active.snapshotAt > page.snapshotAt) return;
    activeDetailSnapshot = page;
    data.value.active = {
      ...data.value.active,
      snapshotAt: page.snapshotAt,
      available: true,
      today: page.total,
      partialToday: page.partialToday,
      startedAt: page.startedAt,
    };
  }
  const loading = ref(false);
  const loadError = ref(false);
  const trendLoading = ref(false);
  const trendError = ref(false);
  const recentFilter = ref<AdminRecentFilter>({ period: 'recent', type: 'all' });
  const recentAnchor = ref<HTMLElement | null>(null);
  const trendDays = ref('7');
  const trendOptions = computed(() => [
    { value: '7', label: t('adminWorkspace.days', { count: 7 }) },
    { value: '15', label: t('adminWorkspace.days', { count: 15 }) },
    { value: '30', label: t('adminWorkspace.days', { count: 30 }) },
    { value: '90', label: t('adminWorkspace.days', { count: 90 }) },
  ]);
  const trendCache = new Map<string, any>();
  let snapshotRequestSequence = 0;
  let trendRequestSequence = 0;
  const resourceRecentError = ref<'initial' | 'append' | ''>('');
  const userRecentError = ref<'initial' | 'append' | ''>('');
  let resourceRecentLoadMode: 'initial' | 'append' = 'initial';
  let userRecentLoadMode: 'initial' | 'append' = 'initial';

  function requestRecentPage<T>(
    target: AdminRecentTarget,
    cursor: string | null,
    limit: number,
    options: import('@/http/request').RequestOptions,
  ) {
    return apiBasePost(
      '/api/common/getAdminOverviewRecent',
      {
        hideInternal: hideInternal.value,
        ...recentFilter.value,
        target,
        cursor,
        limit,
      },
      options,
    ) as Promise<{ status?: number | boolean; msg?: string; data?: AdminRecentPage<T> }>;
  }

  const resourceRecent = useAdminCursorList<AdminRecentResource>({
    limit: 20,
    itemKey: (item) => `${item.type}:${item.id}`,
    request: (cursor, limit, options) => requestRecentPage<AdminRecentResource>('resource', cursor, limit, options),
    onError: () => {
      resourceRecentError.value = resourceRecentLoadMode;
    },
  });
  const userRecent = useAdminCursorList<AdminRecentUser>({
    limit: 20,
    itemKey: 'id',
    request: (cursor, limit, options) => requestRecentPage<AdminRecentUser>('user', cursor, limit, options),
    onError: () => {
      userRecentError.value = userRecentLoadMode;
    },
  });
  const showRecentResources = computed(() => recentFilter.value.type !== 'user');
  const showRecentUsers = computed(() => ['all', 'user'].includes(recentFilter.value.type));
  const recentData = computed<AdminRecentData>(() => ({
    recentResources: resourceRecent.items.value,
    recentUsers: userRecent.items.value,
    filter: { ...recentFilter.value, timezone: 'Asia/Shanghai' },
    limit: 20,
  }));
  const recentLoading = computed(
    () =>
      (showRecentResources.value && resourceRecent.loading.value) ||
      (showRecentUsers.value && userRecent.loading.value),
  );
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
  const overviewContext = computed(() =>
    [
      t('adminWorkspace.scope'),
      t(hideInternal.value ? 'adminWorkspace.exclude' : 'adminWorkspace.include'),
      data.value?.generatedAt ? t('adminWorkspace.updated', { time: data.value.generatedAt }) : '',
      sameTimeCutoff.value ? t('adminOverview.sameTimeCutoff', { time: sameTimeCutoff.value }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
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
        return (
          Number(data.value.users.today || 0) +
          Number(todayResourceTotal.value || 0) +
          Number(data.value.todos.createdToday || 0)
        );
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
      case 'todo':
        return Number(data.value.todos.createdToday || 0);
      default:
        return null;
    }
  });

  const resourceMetrics = computed(() => [
    {
      type: 'bookmark' as const,
      metric: 'bookmarks' as const,
      label: t('navigation.bookmark'),
      today: data.value?.resources.bookmarkToday,
      total: data.value?.resources.bookmarkTotal,
    },
    {
      type: 'note' as const,
      metric: 'notes' as const,
      label: t('navigation.note'),
      today: data.value?.resources.noteToday,
      total: data.value?.resources.noteTotal,
    },
    {
      type: 'file' as const,
      metric: 'files' as const,
      label: t('adminWorkspace.file'),
      today: data.value?.resources.fileToday,
      total: data.value?.resources.fileTotal,
    },
  ]);

  const n = (v: any) => (v == null ? '—' : Number(v).toLocaleString());
  const mb = (v: any) => {
    const m = Number(v || 0);
    return m >= 1024 ? `${(m / 1024).toFixed(2)} GB` : `${m} MB`;
  };

  function baselineText(metric: AdminTodayMetricKey) {
    return formatAdminTodayBaseline(data.value?.todayBaseline, metric, t);
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

  interface OverviewLoadOptions {
    force?: boolean;
    resetScope?: boolean;
  }

  async function load({ force = false, resetScope = false }: OverviewLoadOptions = {}) {
    const hideInternalValue = hideInternal.value;
    const previousHistory =
      !resetScope && data.value
        ? {
            trend: data.value.trend || [],
            trendPeriod: data.value.trendPeriod,
            todayBaseline: data.value.todayBaseline,
          }
        : null;
    const requestSequence = ++snapshotRequestSequence;
    trendRequestSequence += 1;
    resourceRecent.cancel();
    userRecent.cancel();
    trendLoading.value = false;
    trendError.value = false;
    resourceRecentError.value = '';
    userRecentError.value = '';
    if (resetScope) {
      data.value = null;
    }
    loading.value = true;
    loadError.value = false;
    try {
      const response: any = await getAdminOverviewSnapshot(hideInternalValue, { force });
      if (requestSequence !== snapshotRequestSequence) return;
      if (response.status !== 200) {
        loadError.value = true;
        return;
      }
      data.value = {
        ...response.data,
        trend: previousHistory?.trend || [],
        trendPeriod: previousHistory?.trendPeriod || {
          days: Number(trendDays.value),
          granularity: trendDays.value === '90' ? 'week' : 'day',
        },
        todayBaseline: previousHistory?.todayBaseline || response.data.todayBaseline,
      };
      if (
        data.value.active?.available &&
        data.value.active?.snapshotAt &&
        activeDetailSnapshot &&
        activeDetailSnapshot.hideInternal === hideInternalValue &&
        activeDetailSnapshot.snapshotAt >= (data.value.active?.snapshotAt || '')
      ) {
        syncActiveSnapshot(activeDetailSnapshot);
      }
      trendCache.clear();
      // 核心快照先落屏；历史分析与最近新增随后并发，二者失败都不会清空核心数据。
      void loadTrend();
      void loadRecent();
    } catch (_error) {
      if (requestSequence === snapshotRequestSequence) loadError.value = true;
    } finally {
      if (requestSequence === snapshotRequestSequence) loading.value = false;
    }
  }

  function refreshOverview() {
    void load({ force: true });
  }

  function changeOverviewScope() {
    activeDetailSnapshot = null;
    void load({ force: true, resetScope: true });
  }

  async function loadRecent() {
    resourceRecentError.value = '';
    userRecentError.value = '';
    resourceRecentLoadMode = 'initial';
    userRecentLoadMode = 'initial';
    const loads: Array<Promise<boolean>> = [];
    if (showRecentResources.value) loads.push(resourceRecent.reload());
    else resourceRecent.cancel();
    if (showRecentUsers.value) loads.push(userRecent.reload());
    else userRecent.cancel();
    await Promise.all(loads);
  }

  function loadMoreResourceRecent() {
    resourceRecentLoadMode = 'append';
    resourceRecentError.value = '';
    void resourceRecent.loadMore();
  }

  function loadMoreUserRecent() {
    userRecentLoadMode = 'append';
    userRecentError.value = '';
    void userRecent.loadMore();
  }

  function retryResourceRecent() {
    if (resourceRecent.items.value.length) return loadMoreResourceRecent();
    resourceRecentLoadMode = 'initial';
    resourceRecentError.value = '';
    void resourceRecent.reload();
  }

  function retryUserRecent() {
    if (userRecent.items.value.length) return loadMoreUserRecent();
    userRecentLoadMode = 'initial';
    userRecentError.value = '';
    void userRecent.reload();
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
      data.value = {
        ...data.value,
        trend: cached.trend,
        trendPeriod: { days: cached.days, granularity: cached.granularity },
        todayBaseline: cached.todayBaseline || data.value.todayBaseline,
      };
      trendError.value = false;
      return;
    }
    const requestSequence = ++trendRequestSequence;
    trendLoading.value = true;
    trendError.value = false;
    try {
      const response: any = await apiBasePost('/api/common/getAdminOverviewTrend', {
        days,
        hideInternal: hideInternal.value,
      });
      if (requestSequence !== trendRequestSequence) return;
      if (response.status !== 200) {
        trendError.value = true;
        return;
      }
      trendCache.set(cacheKey, response.data);
      data.value = {
        ...data.value,
        trend: response.data.trend,
        trendPeriod: { days: response.data.days, granularity: response.data.granularity },
        todayBaseline: response.data.todayBaseline || data.value.todayBaseline,
      };
    } catch (_error) {
      if (requestSequence === trendRequestSequence) trendError.value = true;
    } finally {
      if (requestSequence === trendRequestSequence) trendLoading.value = false;
    }
  }

  onMounted(load);
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';
  .ov-hide-internal {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
    color: var(--text-color);
  }
  .ov-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ov-metric {
    position: relative;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .ov-metric__action.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-140, 140px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: var(--ui-space-5, 5px);
    padding: var(--ui-space-16, 16px);
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-color);
    text-align: left;
    white-space: normal;
    line-height: 1.4;
  }
  .ov-metric--resources .ov-metric__action.b_btn {
    min-height: 0;
    padding-bottom: var(--ui-space-8, 8px);
  }
  .ov-metric:not(.ov-metric--resources) .ov-metric__action.b_btn {
    height: 100%;
  }
  .ov-metric__action.b_btn:hover {
    background: var(--surface-card-hover-bg);
  }
  .ov-metric__icon {
    position: absolute;
    top: var(--ui-space-16, 16px);
    right: var(--ui-space-16, 16px);
    color: var(--primary-color);
  }
  .ov-metric__label {
    padding-right: var(--ui-space-24, 24px);
    font-size: var(--ui-font-13, 13px);
  }
  .ov-metric__value {
    font-size: var(--ui-font-30, 30px);
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .ov-metric__headline {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
  }
  .ov-metric__hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .ov-metric__link {
    margin-top: auto;
    color: var(--primary-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ov-resource-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    padding: 0 var(--ui-space-12, 12px) var(--ui-space-12, 12px);
  }
  .ov-resource-breakdown__row.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-control-28, 28px);
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-4, 4px);
    white-space: normal;
    text-align: left;
    line-height: 1.4;
  }
  .ov-resource-breakdown__label {
    flex: none;
    white-space: nowrap;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ov-resource-breakdown__counts {
    display: inline-flex;
    flex: 1;
    align-items: baseline;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }
  .ov-resource-breakdown__counts strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .ov-resource-breakdown__counts small {
    color: var(--primary-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ov-attention {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
    color: var(--text-color);
  }
  .ov-attention > .svg-icon {
    color: var(--warning-color);
  }
  .ov-attention__all {
    margin-left: auto;
  }
  .ov-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .ov-section-heading h3,
  .ov-runtime h3 {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-17, 17px);
  }
  .ov-trend-control {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .ov-period {
    width: var(--ui-layout-140, 140px);
  }
  .ov-runtime {
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .ov-runtime__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-16, 16px);
    margin-top: var(--ui-space-12, 12px);
  }
  .ov-runtime__item {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    gap: var(--ui-space-10, 10px);
    color: var(--primary-color);
  }
  .ov-runtime__item > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--ui-space-5, 5px);
    color: var(--text-color);
  }
  .ov-runtime__item span {
    font-size: var(--ui-font-12, 12px);
  }
  .ov-runtime__item strong {
    font-size: var(--ui-font-21, 21px);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .ov-runtime__item small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.6;
  }
  .ov-api-health {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
  }
  .ov-danger {
    color: var(--danger-color) !important;
  }
  .ov-warning {
    color: var(--warning-color);
  }
  .ov-load-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--danger-color);
    border-radius: 8px;
    color: var(--danger-color);
  }
  .ov-insights {
    display: grid;
    gap: var(--ui-space-6, 6px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ov-insight {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .ov-recent-anchor {
    min-width: 0;
  }
  @media (max-width: @admin-bp-desktop) {
    .ov-metrics,
    .ov-runtime__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: @admin-bp-mobile) {
    .ov-metrics {
      gap: var(--ui-space-8, 8px);
    }
    .ov-metric__action.b_btn {
      padding: var(--ui-space-12, 12px);
    }
    .ov-metric__icon {
      display: none;
    }
    .ov-metric__label {
      padding-right: 0;
    }
    .ov-runtime__grid {
      grid-template-columns: 1fr;
    }
    .ov-runtime__item > div {
      flex: 1;
    }
    .ov-runtime__item strong {
      font-size: var(--ui-font-18, 18px);
    }
    .ov-section-heading,
    .ov-insight {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .ov-trend-control {
      flex-wrap: wrap;
    }
    .ov-attention__all {
      margin-left: 0;
    }
  }
</style>
