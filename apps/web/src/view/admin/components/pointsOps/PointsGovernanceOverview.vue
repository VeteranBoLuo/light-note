<template>
  <section class="points-health" aria-label="积分健康总览">
    <div class="points-health__toolbar">
      <div>
        <h2>积分健康总览</h2>
        <p>默认查看近 28 天；存量分布为当前快照，趋势与产消均使用有界时间窗。</p>
      </div>
      <div class="points-health__filters">
        <BSelect
          v-model:value="rangeMode"
          class="points-health__range"
          :options="rangeOptions"
          @change="handleRangeChange"
        />
        <template v-if="rangeMode === 'custom'">
          <BInput v-model:value="customStartDate" type="date" aria-label="统计开始日期" />
          <BInput v-model:value="customEndDate" type="date" aria-label="统计结束日期" />
          <BButton size="small" :loading="loading" @click="reload">应用</BButton>
        </template>
      </div>
    </div>

    <p v-if="loadError && data" class="points-health__refresh-error" role="alert">{{ loadError }}</p>
    <div v-else-if="loadError && !data" class="points-health__error" role="alert">
      <p>{{ loadError }}</p>
      <BButton size="small" :loading="loading" @click="reload">{{ t('adminPointsGovernance.retry') }}</BButton>
    </div>

    <div v-if="data" class="points-health__metrics">
      <article v-for="item in metricCards" :key="item.label" class="points-health__metric">
        <span>{{ item.label }}</span>
        <strong :class="item.tone">{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </div>

    <div v-if="data" class="points-health__grid">
      <article class="points-health__panel">
        <header><h3>余额分布</h3><span>当前账户快照</span></header>
        <div class="points-health__distribution">
          <div v-for="item in distribution" :key="item.label">
            <span>{{ item.label }}</span
            ><b>{{ item.value }}</b>
          </div>
        </div>
      </article>

      <article class="points-health__panel">
        <header><h3>健康提示</h3><span>仅提示，不自动调参</span></header>
        <div v-if="data.warnings?.length" class="points-health__warnings">
          <p v-for="warning in data.warnings" :key="warning.code" :class="`is-${warning.level}`">
            {{ warningLabels[warning.code] || warning.code }}
          </p>
        </div>
        <p v-else class="points-health__healthy">当前没有触发 C5 初始观察阈值。</p>
      </article>
    </div>

    <article v-if="data" class="points-health__panel points-health__trend">
      <header class="points-health__trend-header">
        <div>
          <h3>{{ t('adminPointsGovernance.trendTitle') }}</h3>
          <span>{{ t('adminPointsGovernance.trendHint') }}</span>
        </div>
        <span>{{ data.range.startDate }} 至 {{ data.range.endDate }}</span>
      </header>
      <template v-if="trendChart.hasActivity">
        <div class="points-health__trend-legend" aria-hidden="true">
          <span><i class="is-issued" />+ {{ t('adminPointsGovernance.issued') }}</span>
          <span><i class="is-spent" />− {{ t('adminPointsGovernance.spent') }}</span>
          <span><i class="is-net" />{{ t('adminPointsGovernance.net') }}</span>
        </div>
        <div
          v-auto-scrollbar
          class="points-health__chart-scroll"
          role="group"
          :aria-label="t('adminPointsGovernance.trendAria')"
        >
          <div
            class="points-health__chart"
            :style="{
              minWidth: trendMinWidth,
              '--trend-count': trend.length,
              '--trend-baseline': `${trendChart.baselineY}%`,
            }"
          >
            <div class="points-health__chart-plot-layer" aria-hidden="true">
              <span class="points-health__zero-line"><b>0</b></span>
              <svg
                v-if="trend.length > 1"
                class="points-health__net-line"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polyline
                  :points="trendChart.linePoints"
                  fill="none"
                  vector-effect="non-scaling-stroke"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="points-health__chart-columns">
              <BTooltip
                v-for="item in trend"
                :key="item.day"
                class="points-health__bar-tooltip"
                :title="trendTooltip(item)"
              >
                <div
                  class="points-health__bar-item"
                  :class="{ 'is-active': activeTrendDay === item.day }"
                  role="button"
                  tabindex="0"
                  :aria-label="trendActionLabel(item)"
                  :aria-pressed="activeTrendDay === item.day"
                  @click="openTrendDay(item.day)"
                  @focus="selectTrendDay(item.day)"
                  @keydown.enter="openTrendDay(item.day)"
                  @keydown.space.prevent="openTrendDay(item.day)"
                >
                  <span class="points-health__bar-plot" aria-hidden="true">
                    <i
                      v-if="item.issued > 0"
                      class="points-health__bar is-issued"
                      :style="{
                        bottom: `${100 - trendChart.baselineY}%`,
                        height: `${item.issuedHeight}%`,
                      }"
                    />
                    <i
                      v-if="item.spent > 0"
                      class="points-health__bar is-spent"
                      :style="{ top: `${trendChart.baselineY}%`, height: `${item.spentHeight}%` }"
                    />
                    <i class="points-health__net-dot" :style="{ top: `${item.netY}%` }" />
                  </span>
                  <small>{{ item.label }}</small>
                </div>
              </BTooltip>
            </div>
          </div>
        </div>
        <div v-if="activeTrend" class="points-health__trend-summary" role="status">
          <strong>{{ activeTrend.day }}</strong>
          <span class="is-issued"
            >{{ t('adminPointsGovernance.issued') }} <b>+{{ format(activeTrend.issued) }}</b></span
          >
          <span class="is-spent"
            >{{ t('adminPointsGovernance.spent') }} <b>-{{ format(activeTrend.spent) }}</b></span
          >
          <span class="is-net"
            >{{ t('adminPointsGovernance.net') }} <b>{{ formatSigned(activeTrend.net) }}</b></span
          >
        </div>
      </template>
      <p v-else class="points-health__empty">{{ t('adminPointsGovernance.empty') }}</p>
    </article>

    <article v-if="data" class="points-health__panel points-health__leaderboard">
      <header>
        <div>
          <h3>当前积分余额 Top 20</h3>
          <span>仅统计普通有效账号，按当前可用积分排序</span>
        </div>
        <span>点击用户查看积分来源、消耗与最近流水</span>
      </header>
      <BTable
        v-if="leaderboardRows.length"
        :data="leaderboardRows"
        :columns="leaderboardColumns"
        row-key="userId"
        row-clickable
        @row-click="openUser"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'rank'" class="points-health__rank" :class="{ 'is-top': record.rank <= 3 }">
            {{ record.rank }}
          </span>
          <span v-else-if="column.key === 'identity'" class="points-health__identity">
            <strong>{{ record.alias || '未设置昵称' }}</strong>
            <small>{{ record.email || record.userId }}</small>
          </span>
          <strong v-else-if="column.key === 'pointsLabel'" class="points-health__points">
            <SvgIcon :src="icon.growth.coin" size="14" aria-hidden="true" />{{ record.pointsLabel }}
          </strong>
          <template v-else>{{ record[column.key] }}</template>
        </template>
      </BTable>
      <p v-else class="points-health__empty">当前没有持有积分的普通账号。</p>
    </article>
    <BLoading v-if="loading" :loading="true" inline class="points-health__loading" title="正在加载积分健康数据" />
    <PointsGovernanceDailyDetailModal
      v-model:visible="dailyDetailVisible"
      :summary="activeTrend"
      :hide-internal="props.hideInternal"
      @select-user="openUser"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi, { type PointsGovernanceDailyDetailUser } from '@/api/growthApi';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import { buildPointsGovernanceTrend, type PointsGovernanceTrendPoint } from './pointsGovernanceTrend';
  import PointsGovernanceDailyDetailModal from './PointsGovernanceDailyDetailModal.vue';

  interface BalanceLeaderboardUser extends PointsGovernanceDailyDetailUser {
    rank: number;
    userId: string;
    alias: string | null;
    email: string | null;
    points: number;
    level: number;
    lastActiveTime: string | null;
  }

  const props = withDefaults(defineProps<{ hideInternal?: boolean }>(), { hideInternal: true });
  const emit = defineEmits<{ 'select-user': [user: PointsGovernanceDailyDetailUser] }>();
  const bookmark = bookmarkStore();
  const { t } = useI18n();

  const loading = ref(false);
  const data = ref<any>(null);
  const loadError = ref('');
  const activeTrendDay = ref('');
  const dailyDetailVisible = ref(false);
  const rangeMode = ref<number | 'custom'>(28);
  const customStartDate = ref('');
  const customEndDate = ref('');
  const rangeOptions = [
    { label: '近 7 天', value: 7 },
    { label: '近 28 天', value: 28 },
    { label: '近 90 天', value: 90 },
    { label: '自定义', value: 'custom' },
  ];
  const warningLabels: Record<string, string> = {
    LOW_CONSUMPTION_RATIO: '消耗 / 产出低于 55%，建议观察目标达成周期和商品吸引力。',
    HIGH_CONSUMPTION_RATIO: '消耗 / 产出高于 85%，建议观察新用户与低余额用户压力。',
    FREE_RANDOM_SHARE_HIGH: '免费随机回流占可重复产出超过 30%，随机来源偏高。',
    OPERATIONS_SHARE_HIGH: '运营发放占总产出超过 10%，请复核活动与人工调整。',
  };

  const format = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
  const formatSigned = (value: unknown) => {
    const number = Number(value || 0);
    return number > 0 ? `+${format(number)}` : format(number);
  };
  const formatDate = (value: unknown) => {
    const date = new Date(String(value || ''));
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN');
  };
  const metricCards = computed(() => {
    const metrics = data.value?.metrics || {};
    return [
      { label: '总产出', value: `+${format(metrics.issued)}`, hint: '时间窗内所有正向流水', tone: 'is-up' },
      { label: '总消耗', value: `-${format(metrics.spent)}`, hint: '时间窗内所有负向流水', tone: 'is-down' },
      {
        label: '净发行',
        value: format(metrics.netIssued),
        hint: '产出减消耗',
        tone: metrics.netIssued >= 0 ? 'is-up' : 'is-down',
      },
      {
        label: '稳定产出',
        value: format(metrics.stableIssued),
        hint: `人均 ${format(metrics.stableAverage)}`,
        tone: '',
      },
      {
        label: '消耗 / 产出',
        value: `${metrics.consumptionToIssuanceRatio || 0}%`,
        hint: '初始观察区间 55%～85%',
        tone: '',
      },
      { label: '当前总存量', value: format(metrics.outstanding), hint: '全站当前余额快照', tone: '' },
      { label: '获得积分人数', value: format(metrics.earners), hint: '时间窗内有正向流水', tone: '' },
      { label: '消费人数', value: format(metrics.spenders), hint: '时间窗内有负向流水', tone: '' },
      { label: '免费回流占比', value: `${metrics.freeRandomShare || 0}%`, hint: '免费惊喜 ÷ 可重复产出', tone: '' },
      { label: '运营注入占比', value: `${metrics.operationsShare || 0}%`, hint: '运营正向积分 ÷ 总产出', tone: '' },
    ];
  });
  const distribution = computed(() => {
    const value = data.value?.balanceDistribution || {};
    return [
      { label: '账户数', value: format(value.accounts) },
      { label: '零余额', value: format(value.zeroBalance) },
      { label: 'P50', value: format(value.p50) },
      { label: 'P75', value: format(value.p75) },
      { label: 'P90', value: format(value.p90) },
      { label: 'P99', value: format(value.p99) },
      { label: '> 6,000', value: `${value.over6000Ratio || 0}%` },
      { label: '> 16,000', value: `${value.over16000Ratio || 0}%` },
      { label: '> 24,000', value: `${value.over24000Ratio || 0}%` },
    ];
  });
  const trendChart = computed(() => buildPointsGovernanceTrend(data.value?.trends || []));
  const trend = computed(() => trendChart.value.points);
  const trendMinWidth = computed(() => `${Math.max(280, trend.value.length * 34)}px`);
  const activeTrend = computed(() => trend.value.find((item) => item.day === activeTrendDay.value) || null);
  const leaderboardRows = computed(() =>
    (data.value?.balanceLeaderboard || []).map((row: BalanceLeaderboardUser) => ({
      ...row,
      pointsLabel: format(row.points),
      levelLabel: `Lv.${Number(row.level || 1)}`,
      lastActiveLabel: formatDate(row.lastActiveTime),
    })),
  );
  const leaderboardColumns = computed(() =>
    bookmark.isMobile
      ? [
          { title: '排名', key: 'rank', width: '52px', ellipsis: false },
          { title: '用户', key: 'identity', width: 'minmax(120px, 1fr)', ellipsis: false },
          { title: '积分', key: 'pointsLabel', width: '92px', ellipsis: false },
        ]
      : [
          { title: '排名', key: 'rank', width: '64px', ellipsis: false },
          { title: '用户', key: 'identity', width: 'minmax(220px, 1fr)', ellipsis: false },
          { title: '当前积分', key: 'pointsLabel', width: '130px', ellipsis: false },
          { title: '等级', key: 'levelLabel', width: '90px', ellipsis: false },
          { title: '最近活跃', key: 'lastActiveLabel', width: '130px', ellipsis: false },
        ],
  );

  function trendTooltip(item: PointsGovernanceTrendPoint) {
    return t('adminPointsGovernance.tooltip', {
      day: item.day,
      issued: format(item.issued),
      spent: format(item.spent),
      net: formatSigned(item.net),
    });
  }

  function trendActionLabel(item: PointsGovernanceTrendPoint) {
    return t('adminPointsGovernance.trendActionAria', { summary: trendTooltip(item) });
  }

  function selectTrendDay(day: string) {
    activeTrendDay.value = day;
  }

  function openTrendDay(day: string) {
    selectTrendDay(day);
    dailyDetailVisible.value = true;
  }

  function openUser(user: PointsGovernanceDailyDetailUser) {
    emit('select-user', user);
  }

  async function reload() {
    dailyDetailVisible.value = false;
    const payload: Record<string, unknown> = { hideInternal: props.hideInternal };
    if (rangeMode.value === 'custom') {
      if (!customStartDate.value || !customEndDate.value) {
        message.info('请选择自定义开始和结束日期');
        return;
      }
      payload.startDate = customStartDate.value;
      payload.endDate = customEndDate.value;
    } else payload.presetDays = rangeMode.value;
    loading.value = true;
    loadError.value = '';
    try {
      const result = await growthApi.adminPointsGovernanceOverview(payload);
      if (result.status === 200) {
        data.value = result.data;
        return;
      }
      loadError.value = result.msg || t('adminPointsGovernance.loadFailed');
      message.error(loadError.value);
    } catch {
      loadError.value = data.value ? t('adminPointsGovernance.refreshFailed') : t('adminPointsGovernance.loadFailed');
      message.error(loadError.value);
    } finally {
      loading.value = false;
    }
  }

  function handleRangeChange() {
    if (rangeMode.value !== 'custom') void reload();
  }

  watch(trend, (rows) => {
    if (activeTrendDay.value && !rows.some((row) => row.day === activeTrendDay.value)) {
      activeTrendDay.value = '';
      dailyDetailVisible.value = false;
    }
  });

  defineExpose({ reload });
  onMounted(reload);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .points-health {
    position: relative;
    display: grid;
    gap: 16px;
    min-height: 240px;
  }
  .points-health__toolbar,
  .points-health__panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    color: var(--text-color);
    font-size: 18px;
  }
  h3 {
    color: var(--text-color);
    font-size: 14px;
  }
  .points-health__toolbar p,
  header span,
  small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-health__filters {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  .points-health__range {
    width: 132px;
    flex: 0 0 auto;
  }
  .points-health__filters :deep(.input-container) {
    width: 142px;
  }
  .points-health__error,
  .points-health__refresh-error {
    border: 1px solid var(--danger-color);
    border-radius: 10px;
    color: var(--danger-color);
    background: var(--card-background);
    font-size: 12px;
  }
  .points-health__error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
  }
  .points-health__refresh-error {
    padding: 10px 12px;
  }
  .points-health__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .points-health__metric,
  .points-health__panel {
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
  }
  .points-health__metric {
    display: grid;
    gap: 5px;
    padding: 14px;
  }
  .points-health__metric > span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-health__metric strong {
    color: var(--text-color);
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .points-health__metric strong.is-up {
    color: var(--success-color);
  }
  .points-health__metric strong.is-down {
    color: var(--danger-color);
  }
  .points-health__grid {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: 12px;
  }
  .points-health__panel {
    display: grid;
    gap: 14px;
    padding: 15px;
  }
  .points-health__distribution {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .points-health__distribution div {
    display: grid;
    gap: 3px;
    padding: 9px;
    border-radius: 8px;
    background: var(--card-background);
  }
  .points-health__distribution span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .points-health__distribution b {
    color: var(--text-color);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .points-health__warnings {
    display: grid;
    gap: 8px;
  }
  .points-health__warnings p,
  .points-health__healthy {
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .points-health__warnings p {
    border: 1px solid var(--warning-color);
    background: var(--card-background);
  }
  .points-health__healthy {
    border: 1px solid var(--success-color);
    background: var(--card-background);
  }
  .points-health__trend {
    --trend-plot-height: 174px;
    overflow: hidden;
  }
  .points-health__trend-header {
    align-items: flex-start;
  }
  .points-health__trend-header > div {
    display: grid;
    gap: 3px;
  }
  .points-health__trend-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-health__trend-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .points-health__trend-legend i {
    display: inline-block;
    width: 12px;
    height: 7px;
    border-radius: 3px;
  }
  .points-health__trend-legend i.is-issued {
    background: var(--success-color);
  }
  .points-health__trend-legend i.is-spent {
    background: var(--danger-color);
  }
  .points-health__trend-legend i.is-net {
    width: 14px;
    height: 0;
    border-top: 2px solid var(--points-trend-net-color);
    border-radius: 0;
  }
  .points-health__chart-scroll {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
  }
  .points-health__chart {
    position: relative;
    width: 100%;
  }
  .points-health__chart-columns {
    position: relative;
    z-index: 4;
    display: grid;
    grid-template-columns: repeat(var(--trend-count), minmax(30px, 1fr));
    width: 100%;
  }
  .points-health__chart-plot-layer {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    left: 0;
    height: var(--trend-plot-height);
    pointer-events: none;
  }
  .points-health__zero-line {
    position: absolute;
    z-index: 1;
    top: var(--trend-baseline);
    right: 0;
    left: 0;
    height: 0;
    border-top: 1px solid var(--surface-border-color);
    pointer-events: none;
  }
  .points-health__zero-line b {
    position: absolute;
    top: 0;
    left: 0;
    padding-right: 4px;
    color: var(--desc-color);
    background: var(--workbench-subcard-bg);
    font-size: 10px;
    font-weight: 400;
    line-height: 16px;
    transform: translateY(-50%);
  }
  .points-health__net-line {
    position: absolute;
    z-index: 2;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .points-health__net-line polyline {
    stroke: var(--points-trend-net-color);
    stroke-width: 1.6px;
  }
  .points-health__bar-tooltip {
    width: 100%;
    min-width: 30px;
  }
  .points-health__bar-item {
    display: grid;
    grid-template-rows: var(--trend-plot-height) 20px;
    gap: 5px;
    width: 100%;
    min-width: 30px;
    border: 1px solid transparent;
    border-radius: 7px;
    box-sizing: border-box;
    cursor: pointer;
    outline: none;
    text-align: center;
  }
  .points-health__bar-item:hover small,
  .points-health__bar-item:focus small,
  .points-health__bar-item.is-active small {
    color: var(--points-trend-net-color);
  }
  .points-health__bar-item:focus-visible {
    outline: 2px solid var(--focus-ring-color);
    outline-offset: -2px;
  }
  .points-health__bar-item.is-active {
    border-color: var(--points-trend-net-color);
  }
  .points-health__bar-plot {
    position: relative;
    display: block;
    width: 100%;
    height: var(--trend-plot-height);
  }
  .points-health__bar {
    position: absolute;
    left: 50%;
    width: 10px;
    min-height: 3px;
    transform: translateX(-50%);
  }
  .points-health__bar.is-issued {
    border-radius: 5px 5px 2px 2px;
    background: var(--success-color);
  }
  .points-health__bar.is-spent {
    border-radius: 2px 2px 5px 5px;
    background: var(--danger-color);
  }
  .points-health__net-dot {
    position: absolute;
    z-index: 2;
    left: 50%;
    display: block;
    width: 8px;
    height: 8px;
    border: 2px solid var(--workbench-subcard-bg);
    border-radius: 50%;
    box-sizing: border-box;
    background: var(--points-trend-net-color);
    transform: translate(-50%, -50%);
  }
  .points-health__trend-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .points-health__trend-summary > strong {
    color: var(--text-color);
  }
  .points-health__trend-summary span {
    display: inline-flex;
    gap: 4px;
  }
  .points-health__trend-summary .is-issued b {
    color: var(--success-color);
  }
  .points-health__trend-summary .is-spent b {
    color: var(--danger-color);
  }
  .points-health__trend-summary .is-net b {
    color: var(--points-trend-net-color);
  }
  .points-health__leaderboard header > div {
    display: grid;
    gap: 3px;
  }
  .points-health__rank {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--desc-color);
    background: var(--card-background);
    font-variant-numeric: tabular-nums;
  }
  .points-health__rank.is-top {
    border: 1px solid var(--warning-color);
    color: var(--text-color);
  }
  .points-health__identity {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .points-health__identity strong,
  .points-health__identity small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .points-health__identity strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .points-health__points {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--warning-color);
    font-variant-numeric: tabular-nums;
  }
  .points-health__empty {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-health__loading {
    justify-content: center;
    width: 100%;
    padding: 16px 0;
  }
  @media (max-width: @admin-bp-mobile) {
    .points-health__toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .points-health__filters {
      width: 100%;
      justify-content: flex-start;
    }
    .points-health__range {
      width: 100%;
    }
    .points-health__filters :deep(.input-container) {
      width: min(100%, 168px);
    }
    .points-health__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .points-health__grid {
      grid-template-columns: 1fr;
    }
    .points-health__error,
    .points-health__trend-header {
      align-items: flex-start;
      flex-direction: column;
    }
    .points-health__trend {
      --trend-plot-height: 158px;
    }
    .points-health__trend-legend {
      gap: 10px 14px;
    }
    .points-health__trend-summary {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }
    .points-health__leaderboard header {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
