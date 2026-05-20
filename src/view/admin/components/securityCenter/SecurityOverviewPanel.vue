<template>
  <div class="security-overview-panel" :class="{ 'is-mobile': mobile }">
    <ul class="admin-stats security-stats" :class="{ 'mobile-stats': mobile }">
      <li v-for="card in statCards" :key="card.label" class="admin-stat-card security-stat-card">
        <span class="admin-stat-label">{{ card.label }}</span>
        <strong class="admin-stat-value">{{ card.value }}</strong>
        <span class="admin-stat-hint">{{ card.hint }}</span>
      </li>
    </ul>

    <div class="overview-layout">
      <section class="security-section overview-trend-section">
        <div class="overview-section-title">
          <h3>24小时攻击趋势</h3>
          <span>按小时统计</span>
        </div>
        <div class="trend-summary">
          <span>总事件 <strong>{{ trendTotal }}</strong></span>
          <span>拦截率 <strong>{{ blockedRate }}%</strong></span>
          <span>峰值 <strong>{{ trendPeakValue }}</strong> 次/小时</span>
        </div>
        <div v-if="trendPoints.length" class="trend-chart">
          <svg viewBox="0 0 100 54" preserveAspectRatio="none" aria-label="24小时攻击趋势">
            <defs>
              <linearGradient id="securityTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--security-high)" stop-opacity="0.22" />
                <stop offset="100%" stop-color="var(--security-high)" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <line class="trend-grid-line" x1="2" x2="98" y1="7" y2="7" />
            <line class="trend-grid-line" x1="2" x2="98" y1="28" y2="28" />
            <line class="trend-grid-line is-baseline" x1="2" x2="98" y1="49" y2="49" />
            <polygon :points="trendAreaPoints" class="trend-area" />
            <line
              v-if="hoverTrend"
              class="trend-hover-line"
              :x1="hoverTrend.x"
              :x2="hoverTrend.x"
              y1="7"
              y2="49"
            />
            <polyline :points="trendLinePoints" class="trend-line" />
            <g v-for="point in trendPoints" :key="point.time">
              <rect
                class="trend-hit-area"
                :x="point.hitX"
                y="0"
                :width="point.hitWidth"
                height="54"
                @mouseenter="hoverTrend = point"
                @mouseleave="hoverTrend = null"
              />
            </g>
          </svg>
          <div v-if="hoverTrend" class="trend-tooltip" :style="trendTooltipStyle">
            <strong>{{ hoverTrend.time }}</strong>
            <span>事件：{{ hoverTrend.total }} 次</span>
            <span>拦截：{{ hoverTrend.blocked }} 次</span>
            <em v-if="hoverTrend.isPeak">当前峰值</em>
          </div>
          <div class="trend-labels">
            <span>{{ trendPoints[0]?.time || '-' }}</span>
            <span>{{ peakTrendLabel }}</span>
            <span>{{ trendPoints[trendPoints.length - 1]?.time || '-' }}</span>
          </div>
        </div>
        <div v-else class="security-empty">暂无趋势数据</div>
      </section>

      <section class="security-section overview-risk-section">
        <div class="overview-section-title">
          <h3>威胁等级</h3>
          <span>近7日</span>
        </div>
        <div class="severity-stack" aria-label="威胁等级分布">
          <span
            v-for="item in severityBars"
            :key="item.key"
            :class="['severity-stack-segment', `is-${item.key}`]"
            :style="{ width: item.percent + '%' }"
          />
        </div>
        <div class="severity-list">
          <div v-for="item in severityBars" :key="item.key" class="severity-item">
            <span :class="['severity-dot', `is-${item.key}`]"></span>
            <span>{{ item.label }}</span>
            <strong>{{ item.total }}</strong>
            <em>{{ item.percent }}%</em>
          </div>
        </div>
      </section>
    </div>

    <div class="overview-grid" :class="{ 'mobile-security-grid': mobile }">
      <section class="security-section">
        <div class="overview-section-title">
          <h3>攻击类型分布</h3>
          <span>Top {{ typeBars.length }}</span>
        </div>
        <div class="overview-bars">
          <div v-for="item in typeBars" :key="item.name" class="overview-bar-row">
            <div class="overview-bar-meta">
              <span>{{ item.name }}</span>
              <strong>{{ item.total }}</strong>
            </div>
            <div class="overview-bar-track">
              <span class="overview-bar-fill is-type" :style="{ width: item.percent + '%' }"></span>
            </div>
          </div>
          <div v-if="!typeBars.length" class="security-empty">暂无攻击类型数据</div>
        </div>
      </section>

      <section class="security-section">
        <div class="overview-section-title">
          <h3>处置状态</h3>
          <span>近7日</span>
        </div>
        <div class="overview-bars compact">
          <div v-for="item in statusBars" :key="item.name" class="overview-bar-row">
            <div class="overview-bar-meta">
              <span>{{ item.name }}</span>
              <strong>{{ item.total }}</strong>
            </div>
            <div class="overview-bar-track">
              <span class="overview-bar-fill is-status" :style="{ width: item.percent + '%' }"></span>
            </div>
          </div>
          <div v-if="!statusBars.length" class="security-empty">暂无处置数据</div>
        </div>
      </section>

      <section class="security-section">
        <div class="overview-section-title">
          <h3>Top 攻击 IP</h3>
          <span>按次数</span>
        </div>
        <div class="rank-list">
          <div v-for="(item, index) in ipRankBars" :key="item.name" class="rank-row">
            <span class="rank-index">{{ index + 1 }}</span>
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-track"><i :style="{ width: item.percent + '%' }"></i></span>
            <strong>{{ item.total }}</strong>
            <em>{{ item.maxScore }}</em>
          </div>
          <div v-if="!ipRankBars.length" class="security-empty">暂无攻击 IP</div>
        </div>
      </section>

      <section class="security-section">
        <div class="overview-section-title">
          <h3>Top 被攻击接口</h3>
          <span>按次数</span>
        </div>
        <div class="rank-list">
          <div v-for="(item, index) in pathRankBars" :key="item.name" class="rank-row">
            <span class="rank-index">{{ index + 1 }}</span>
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-track"><i :style="{ width: item.percent + '%' }"></i></span>
            <strong>{{ item.total }}</strong>
            <em>{{ item.maxScore }}</em>
          </div>
          <div v-if="!pathRankBars.length" class="security-empty">暂无接口数据</div>
        </div>
      </section>
    </div>

    <section v-if="overview.recentEvents?.length" class="security-section recent-section">
      <div class="overview-section-title">
        <h3>近期安全事件</h3>
        <span>最新 {{ overview.recentEvents.length }} 条</span>
      </div>
      <BTable :data="overview.recentEvents" :columns="recentEventColumns" :rowKey="'eventId'">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'matchedRule'">
            <span class="ellipsis-cell">{{ record.matchedRule || record.attackType || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'sourceIp'">
            <span class="ellipsis-cell">{{ record.sourceIp }}</span>
          </template>
          <template v-else-if="column.key === 'actionTaken'">
            {{ record.actionTaken === 'block' ? '拦截' : '记录' }}
          </template>
        </template>
      </BTable>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { REFRESH_TRIGGER, recentColumns, statusText } from './securityShared';

  const props = defineProps({
    mobile: {
      type: Boolean,
      default: false,
    },
  });

  const refreshTrigger = inject(REFRESH_TRIGGER);
  const hoverTrend = ref<any>(null);

  const overview = reactive<any>({
    summary: {},
    severityDistribution: [],
    statusDistribution: [],
    typeDistribution: [],
    trend: [],
    topIps: [],
    topPaths: [],
    recentEvents: [],
  });

  const severityMeta = [
    { key: 'critical', label: '严重' },
    { key: 'high', label: '高危' },
    { key: 'medium', label: '中危' },
    { key: 'low', label: '低危' },
  ];

  const statCards = computed(() => {
    const summary = overview.summary || {};
    return [
      { label: '7日安全事件', value: summary.total || 0, hint: '累计命中' },
      { label: '待处理高危', value: summary.unhandledHighRisk || 0, hint: '优先处置' },
      { label: '今日事件', value: summary.todayTotal || 0, hint: '当天新增' },
      { label: '已拦截', value: summary.blocked || 0, hint: '防护动作' },
      { label: '活跃攻击IP', value: summary.activeIps || 0, hint: '近7日' },
      { label: '今日严重', value: summary.todayCritical || 0, hint: 'critical' },
    ];
  });

  const trendSeries = computed(() => {
    const source = Array.isArray(overview.trend) ? overview.trend : [];
    return source.map((item) => ({
      time: item.time || '',
      total: Number(item.total || 0),
      blocked: Number(item.blocked || 0),
    }));
  });

  const trendScaleMax = computed(() => Math.max(1, ...trendSeries.value.map((item) => item.total)));
  const trendTotal = computed(() => trendSeries.value.reduce((sum, item) => sum + item.total, 0));
  const trendBlockedTotal = computed(() => trendSeries.value.reduce((sum, item) => sum + item.blocked, 0));
  const blockedRate = computed(() => (trendTotal.value ? Math.round((trendBlockedTotal.value / trendTotal.value) * 100) : 0));
  const peakTrend = computed(() => {
    const peak = trendSeries.value.reduce((current, item) => (item.total > current.total ? item : current), {
      time: '',
      total: 0,
      blocked: 0,
    });
    return peak;
  });
  const trendPeakValue = computed(() => peakTrend.value.total || 0);
  const peakTrendLabel = computed(() => (peakTrend.value.total ? `峰值 ${peakTrend.value.time}` : '暂无攻击'));

  const trendPoints = computed(() => {
    const length = trendSeries.value.length;
    if (!length) return [];
    return trendSeries.value.map((item, index) => {
      const x = length === 1 ? 50 : (index / (length - 1)) * 96 + 2;
      const y = 49 - (item.total / trendScaleMax.value) * 42;
      const hitWidth = length === 1 ? 96 : 96 / (length - 1);
      const hitX = Math.min(100 - hitWidth, Math.max(0, x - hitWidth / 2));
      return { ...item, x, y, hitX, hitWidth, isPeak: item.total > 0 && item.total === peakTrend.value.total };
    });
  });

  const trendTooltipStyle = computed(() => {
    const point = hoverTrend.value;
    if (!point) return {};
    const x = Math.min(88, Math.max(12, point.x));
    return {
      left: `${x}%`,
      top: '34px',
      transform: 'translateX(-50%)',
    };
  });

  const trendLinePoints = computed(() => trendPoints.value.map((point) => `${point.x},${point.y}`).join(' '));
  const trendAreaPoints = computed(() => {
    if (!trendPoints.value.length) return '';
    const first = trendPoints.value[0];
    const last = trendPoints.value[trendPoints.value.length - 1];
    return `${first.x},49 ${trendLinePoints.value} ${last.x},49`;
  });

  function createBars(rows: any[], nameKey: string, labelMap: Record<string, string> = {}) {
    const list = (rows || []).map((item) => ({
      name: labelMap[item[nameKey]] || item[nameKey] || '-',
      total: Number(item.total || 0),
      maxScore: Number(item.maxScore || 0),
    }));
    const max = Math.max(1, ...list.map((item) => item.total));
    return list.map((item) => ({ ...item, percent: Math.max(4, Math.round((item.total / max) * 100)) }));
  }

  const typeBars = computed(() => createBars(overview.typeDistribution, 'attackType'));

  const statusBars = computed(() =>
    createBars(overview.statusDistribution, 'handledStatus').map((item) => ({
      ...item,
      name: statusText(item.name),
    })),
  );

  const ipRankBars = computed(() => createBars(overview.topIps, 'sourceIp'));
  const pathRankBars = computed(() => createBars(overview.topPaths, 'requestPath'));

  const severityBars = computed(() => {
    const rows = Array.isArray(overview.severityDistribution) ? overview.severityDistribution : [];
    const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
    return severityMeta.map((meta) => {
      const row = rows.find((item) => item.severity === meta.key);
      const value = Number(row?.total || 0);
      return {
        ...meta,
        total: value,
        percent: total ? Math.round((value / total) * 100) : 0,
      };
    });
  });

  const recentEventColumns = computed(() =>
    props.mobile
      ? [
          { title: '时间', key: 'createdAt' },
          { title: '规则', key: 'matchedRule' },
          { title: '分数', key: 'threatScore' },
        ]
      : recentColumns,
  );

  async function loadOverview() {
    const res = await apiBasePost('/api/security/overview', {});
    if (res.status === 200) {
      Object.assign(overview, res.data || {});
    }
  }

  watch(
    () => refreshTrigger?.value,
    () => {
      loadOverview();
    },
  );

  onMounted(() => {
    loadOverview();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
