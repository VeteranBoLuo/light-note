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
        <label class="ov-hide-internal">
          <BSwitch v-model:checked="hideInternal" @change="load" />隐藏内部账号(管理员/测试)
        </label>
      </header>

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
          <span class="admin-stat-hint">近 7 天 {{ n(data?.active.week) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日 API 请求</span>
          <strong class="admin-stat-value">{{ n(data?.system.apiToday) }}</strong>
          <span class="admin-stat-hint ov-api-health">
            <span :class="{ 'ov-warn': (data?.system.apiBusinessErrorsToday || 0) > 0 }">业务 4xx {{ n(data?.system.apiBusinessErrorsToday) }}</span>
            <span :class="{ 'ov-muted-warn': (data?.system.apiInvalidRequestsToday || 0) > 0 }">无效访问 {{ n(data?.system.apiInvalidRequestsToday) }}</span>
            <span :class="{ 'ov-err': (data?.system.apiServerErrorsToday || 0) > 0 }">服务 5xx {{ n(data?.system.apiServerErrorsToday) }}</span>
          </span>
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
        <div class="ov-trend-chart" @mouseleave="hoverIdx = null">
          <svg class="ov-trend-svg" viewBox="0 0 100 42" preserveAspectRatio="none">
            <line
              v-if="hoverPoint"
              class="ov-trend-hover-line"
              :x1="hoverPoint.x"
              :x2="hoverPoint.x"
              y1="0"
              y2="42"
              vector-effect="non-scaling-stroke"
            />
            <polyline :points="linePoints('content')" class="ov-line ov-line-content" vector-effect="non-scaling-stroke" />
            <polyline :points="linePoints('users')" class="ov-line ov-line-user" vector-effect="non-scaling-stroke" />
            <rect
              v-for="(p, i) in trendPoints"
              :key="i"
              class="ov-trend-hit"
              :x="p.hitX"
              y="0"
              :width="p.hitWidth"
              height="42"
              @mouseenter="hoverIdx = i"
            />
          </svg>
          <!-- 高亮圆点用 HTML 层,避免 SVG 非等比拉伸把圆压成椭圆 -->
          <template v-if="hoverPoint">
            <span class="ov-trend-dot ov-dot-content" :style="dotStyle(hoverPoint.yContent)"></span>
            <span class="ov-trend-dot ov-dot-user" :style="dotStyle(hoverPoint.yUser)"></span>
          </template>
          <div v-if="hoverPoint" class="ov-trend-tooltip" :style="tooltipStyle">
            <strong>{{ hoverPoint.d }}</strong>
            <span class="ov-tt-row"><i class="ov-tt-dot ov-dot-user"></i>新增用户 <b>{{ n(hoverPoint.users) }}</b></span>
            <span class="ov-tt-row"><i class="ov-tt-dot ov-dot-content"></i>新增内容 <b>{{ n(hoverPoint.content) }}</b></span>
          </div>
        </div>
        <div class="ov-trend-x">
          <span v-for="(p, i) in data.trend" :key="i" :class="{ 'is-active': hoverIdx === i }">{{ p.d }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';

  const bookmark = bookmarkStore();
  const data = ref<any>(null);
  const hideInternal = ref(true);

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
  const VB_W = 100;
  const VB_H = 42;
  const TOP = 2;
  const CH = 38;
  const trendMax = computed(() => {
    const t = data.value?.trend || [];
    return Math.max(1, ...t.map((p: any) => Math.max(p.users, p.content)));
  });
  const pointY = (v: any) => TOP + (CH - (Number(v) / trendMax.value) * CH);
  // 每个数据点的绘制坐标 + 透明命中区(hover 用)
  const trendPoints = computed(() => {
    const t = data.value?.trend || [];
    const n = t.length;
    return t.map((p: any, i: number) => {
      const x = n > 1 ? (i / (n - 1)) * VB_W : 50;
      const hitWidth = n > 1 ? VB_W / (n - 1) : VB_W;
      const hitX = Math.min(VB_W - hitWidth, Math.max(0, x - hitWidth / 2));
      return {
        d: p.d,
        users: Number(p.users),
        content: Number(p.content),
        x,
        yUser: pointY(p.users),
        yContent: pointY(p.content),
        hitX,
        hitWidth,
      };
    });
  });
  function linePoints(key: string) {
    const yk = key === 'users' ? 'yUser' : 'yContent';
    return trendPoints.value.map((p: any) => `${p.x.toFixed(1)},${p[yk].toFixed(1)}`).join(' ');
  }
  // hover 交互:悬停某天时显示参考线 + 高亮点 + 数值气泡
  const hoverIdx = ref<number | null>(null);
  const hoverPoint = computed(() => (hoverIdx.value == null ? null : trendPoints.value[hoverIdx.value] || null));
  function dotStyle(y: number) {
    return { left: `${hoverPoint.value?.x ?? 0}%`, top: `${(y / VB_H) * 100}%` };
  }
  const tooltipStyle = computed(() => {
    if (!hoverPoint.value) return {};
    // 贴近数据点,两端 clamp 避免气泡溢出图表容器
    const x = Math.min(85, Math.max(15, hoverPoint.value.x));
    return { left: `${x}%` };
  });

  function go(id: string) {
    router.push(bookmark.isMobile ? `/${id}` : `/admin/${id}`);
  }

  function goToSecurityEvents() {
    router.push({
      name: bookmark.isMobile ? 'securityEvents' : 'securityCenterEvents',
      query: { handledStatus: 'unhandled' },
    });
  }

  function load() {
    apiBasePost('/api/common/getAdminOverview', { hideInternal: hideInternal.value }).then((res: any) => {
      if (res.status === 200) data.value = res.data;
    });
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
    min-height: 26px;
    height: auto !important;
    padding: 4px 10px !important;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, #f59e0b 22%, transparent);
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
      box-shadow: 0 3px 8px color-mix(in srgb, #f59e0b 18%, transparent);
    }
  }
  .ov-todo-chip.danger {
    background: color-mix(in srgb, #ef4444 20%, transparent);

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, #ef4444 28%, transparent);
      box-shadow: 0 3px 8px color-mix(in srgb, #ef4444 18%, transparent);
    }
  }

  .ov-err {
    color: #ef4444 !important;
    font-weight: 600;
  }

  .ov-api-health {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 10px;
    line-height: 1.45;
  }
  .ov-warn {
    color: #f59e0b;
    font-weight: 600;
  }
  .ov-muted-warn {
    color: var(--sub-text-color, #7c8b9e);
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
  .ov-trend-chart {
    position: relative;
  }
  .ov-trend-hover-line {
    stroke: var(--sub-text-color, #888);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.5;
  }
  .ov-trend-hit {
    fill: transparent;
    cursor: pointer;
  }
  /* hover 高亮圆点(HTML 绝对定位,尺寸恒定不受 SVG 拉伸影响) */
  .ov-trend-dot {
    position: absolute;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    border: 2px solid var(--background-color);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
    pointer-events: none;
    z-index: 2;
  }
  .ov-dot-user {
    background: #615ced;
  }
  .ov-dot-content {
    background: #22c55e;
  }
  .ov-trend-tooltip {
    position: absolute;
    top: 2px;
    transform: translateX(-50%);
    z-index: 3;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--card-border-color, #eee);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    font-size: 12px;
    color: var(--text-color);
    white-space: nowrap;
  }
  .ov-trend-tooltip strong {
    font-size: 12px;
  }
  .ov-tt-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--sub-text-color, #888);
  }
  .ov-tt-row b {
    color: var(--text-color);
    margin-left: 2px;
  }
  .ov-tt-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .ov-trend-x {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 10px;
    color: var(--sub-text-color, #888);
  }
  .ov-trend-x span.is-active {
    color: var(--text-color);
    font-weight: 600;
  }
</style>
