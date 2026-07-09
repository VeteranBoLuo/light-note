<template>
  <div class="admin-panel-container">
    <section class="admin-panel ov-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 总览</p>
          <h2 class="admin-title">数据总览</h2>
          <p class="admin-subtitle">
            全站累计规模与近期动态一览<template v-if="data"> · 更新于 {{ data.generatedAt }}</template>
          </p>
        </div>
      </header>

      <!-- 待办提示:有待处理事项时高亮 -->
      <div v-if="data && pendingTotal > 0" class="ov-todo">
        <span class="ov-todo-icon">🔔</span>
        <span class="ov-todo-text">待处理事项</span>
        <button v-if="data.pending.opinion > 0" class="ov-todo-chip" @click="go('userOpinion')">待回复反馈 {{ data.pending.opinion }} 条</button>
        <span v-if="data.pending.security > 0" class="ov-todo-chip danger">未处理高危安全事件 {{ data.pending.security }} 起</span>
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

      <!-- AI 消耗:累计为主 + 今日增量 -->
      <p class="ov-section-title">AI 消耗 <span class="ov-section-tip">累计总量 · 今日增量</span></p>
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
        <li class="admin-stat-card">
          <span class="admin-stat-label">费用</span>
          <strong class="admin-stat-value">¥{{ data?.ai.totalCost ?? '0.0000' }}</strong>
          <span class="admin-stat-hint">今日 ¥{{ data?.ai.todayCost ?? '0.0000' }}</span>
        </li>
      </ul>

      <!-- 活跃与健康:近期动态 -->
      <p class="ov-section-title">活跃与健康 <span class="ov-section-tip">近期动态</span></p>
      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日活跃用户</span>
          <strong class="admin-stat-value">{{ n(data?.active.today) }}</strong>
          <span class="admin-stat-hint">近 7 天 {{ n(data?.active.week) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日 API 请求</span>
          <strong class="admin-stat-value">{{ n(data?.system.apiToday) }}</strong>
          <span class="admin-stat-hint" :class="{ 'ov-err': (data?.system.apiErrorsToday || 0) > 0 }">错误 {{ n(data?.system.apiErrorsToday) }}</span>
        </li>
        <li class="admin-stat-card ov-link" @click="go('agentLog')">
          <span class="admin-stat-label">AI 监控</span>
          <strong class="admin-stat-value">→</strong>
          <span class="admin-stat-hint">调用明细</span>
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
        <li class="admin-stat-card ov-link" @click="go('conversion')">
          <span class="admin-stat-label">转化漏斗</span>
          <strong class="admin-stat-value">→</strong>
          <span class="admin-stat-hint">详细分析</span>
        </li>
      </ul>

      <!-- 近7天趋势迷你双线图 -->
      <p class="ov-section-title">近 7 天新增趋势</p>
      <div class="ov-trend" v-if="data">
        <div class="ov-trend-legend">
          <span class="ov-lg ov-lg-user">● 新增用户</span>
          <span class="ov-lg ov-lg-content">● 新增内容(书签+笔记+文件)</span>
        </div>
        <svg class="ov-trend-svg" viewBox="0 0 100 42" preserveAspectRatio="none">
          <polyline :points="linePoints('content')" class="ov-line ov-line-content" vector-effect="non-scaling-stroke" />
          <polyline :points="linePoints('users')" class="ov-line ov-line-user" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="ov-trend-x">
          <span v-for="(p, i) in data.trend" :key="i">{{ p.d }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';

  const data = ref<any>(null);

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
  const trendMax = computed(() => {
    const t = data.value?.trend || [];
    return Math.max(1, ...t.map((p: any) => Math.max(p.users, p.content)));
  });
  function linePoints(key: string) {
    const t = data.value?.trend || [];
    if (!t.length) return '';
    const w = 100;
    const top = 2;
    const h = 38;
    return t
      .map((p: any, i: number) => {
        const x = t.length > 1 ? (i / (t.length - 1)) * w : 0;
        const y = top + (h - (Number(p[key]) / trendMax.value) * h);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function go(id: string) {
    router.push('/admin/' + id);
  }

  function load() {
    apiBasePost('/api/common/getAdminOverview', {}).then((res: any) => {
      if (res.status === 200) data.value = res.data;
    });
  }

  onMounted(load);
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

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
    background: color-mix(in srgb, #f59e0b 12%, var(--background-color));
    border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent);
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
    padding: 4px 10px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, #f59e0b 22%, transparent);
    color: var(--text-color);
    font-size: 12.5px;
    cursor: pointer;
  }
  .ov-todo-chip.danger {
    background: color-mix(in srgb, #ef4444 20%, transparent);
    cursor: default;
  }

  .ov-err {
    color: #ef4444 !important;
    font-weight: 600;
  }

  .ov-link {
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .ov-link:hover {
    border-color: var(--primary-color);
  }

  /* 近7天趋势迷你双线图 */
  .ov-trend {
    padding: 14px 16px 10px;
    border: 1px solid var(--card-border-color, #eee);
    border-radius: 12px;
    background: var(--card-background, var(--background-color));
  }
  .ov-trend-legend {
    display: flex;
    gap: 18px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--sub-text-color, #888);
  }
  .ov-lg-user {
    color: #615ced;
  }
  .ov-lg-content {
    color: #22c55e;
  }
  .ov-trend-svg {
    display: block;
    width: 100%;
    height: 120px;
  }
  .ov-line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .ov-line-user {
    stroke: #615ced;
  }
  .ov-line-content {
    stroke: #22c55e;
  }
  .ov-trend-x {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 10px;
    color: var(--sub-text-color, #888);
  }
</style>
