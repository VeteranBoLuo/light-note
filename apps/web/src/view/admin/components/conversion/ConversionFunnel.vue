<template>
  <AdminDataPage
    eyebrow="Admin / 增长"
    title="游客转化漏斗"
    subtitle="主指标展示各阶段真实去重人数；完整时序路径作为诊断指标单独标注。"
    layout="scroll"
  >
    <template #toolbar>
      <DateRangePicker @change="onDateChange" />
    </template>

    <section class="funnel-block funnel-overview">
      <header class="funnel-block__head">
        <div>
          <h3 class="funnel-section-title">核心转化</h3>
          <p>访问 → 打开注册 → 提交注册 → 注册成功</p>
        </div>
        <div class="funnel-overview__result">
          <span>访问到注册</span>
          <strong>{{ overallRate }}%</strong>
          <small>{{ formatNumber(lastStage?.count || 0) }} / {{ formatNumber(firstStage?.count || 0) }} 人</small>
        </div>
      </header>

      <ol class="funnel-chain" aria-label="核心注册漏斗">
        <li
          v-for="(step, index) in mainFunnel"
          :key="step.key"
          class="funnel-chain__step"
          :class="{ 'is-weak': index === weakestStageIndex && index > 0 }"
        >
          <div class="funnel-chain__card" :style="{ width: `${stageWidth(step.count)}%` }">
            <span class="funnel-chain__label">{{ step.label }}</span>
            <strong class="funnel-chain__value">{{ formatNumber(step.count) }}</strong>
            <span
              v-if="step.key === 'registerSuccess' && orderedRegisterCount !== null"
              class="funnel-chain__path-label"
            >
              其中完整路径 {{ formatNumber(orderedRegisterCount) }} 人
            </span>
            <span v-if="index === weakestStageIndex && index > 0" class="funnel-chain__weak-label">主要流失环节</span>
          </div>
          <div v-if="index < mainFunnel.length - 1" class="funnel-chain__connector">
            <span aria-hidden="true">↓</span>
            <strong>{{ mainFunnel[index + 1].fromPreviousRate ?? 0 }}%</strong>
            <span>{{ stageChangeLabel(step, mainFunnel[index + 1]) }}</span>
          </div>
        </li>
      </ol>

      <p class="funnel-chain__summary">
        各阶段为所选时间内的独立去重总人数；“完整路径”只用于检查四步埋点是否连续，不会替代真实注册数。
      </p>
    </section>

    <section class="funnel-block">
      <header class="funnel-block__head">
        <div>
          <h3 class="funnel-section-title">入口贡献</h3>
          <p>看过示例与直接注册是两条并行入口，不互相充当上一步。</p>
        </div>
      </header>
      <div class="funnel-entry-grid">
        <article v-for="row in entryComparisons" :key="row.label" class="funnel-entry funnel-parallel__item">
          <div class="funnel-entry__head">
            <strong>{{ row.label }}</strong>
            <span>合计 {{ formatNumber(row.total) }}</span>
          </div>
          <div class="funnel-entry__bar" :aria-label="`${row.label}入口构成`">
            <span class="is-demo" :style="{ width: `${row.demoShare}%` }"></span>
            <span class="is-direct" :style="{ width: `${row.directShare}%` }"></span>
          </div>
          <dl>
            <div>
              <dt><i class="is-demo"></i>看过示例</dt>
              <dd>{{ formatNumber(row.demo) }} · {{ row.demoShare }}%</dd>
            </div>
            <div>
              <dt><i class="is-direct"></i>直接进入</dt>
              <dd>{{ formatNumber(row.direct) }} · {{ row.directShare }}%</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>

    <section class="funnel-block">
      <header class="funnel-block__head">
        <div>
          <h3 class="funnel-section-title">转化诊断</h3>
          <p>旁支意图、激活和采集质量不会混入主漏斗。</p>
        </div>
      </header>
      <ul class="admin-stats funnel-diagnostics">
        <li v-for="item in diagnosticCards" :key="item.label" class="admin-stat-card">
          <span class="admin-stat-label">{{ item.label }}</span>
          <strong class="admin-stat-value">{{ item.value }}</strong>
          <span class="admin-stat-hint">{{ item.hint }}</span>
        </li>
      </ul>

      <div v-if="failReasons.length" class="funnel-failures">
        <h4>注册失败原因</h4>
        <div v-for="item in normalizedFailReasons" :key="item.reason" class="funnel-failure">
          <span>{{ item.label }}</span>
          <div><i :style="{ width: `${item.width}%` }"></i></div>
          <strong>{{ formatNumber(item.cnt) }}</strong>
        </div>
      </div>
    </section>

    <section v-if="trend.length" class="funnel-block">
      <h3 class="funnel-section-title">每日趋势</h3>
      <ConversionTrendChart :rows="trend" />
    </section>

    <section class="funnel-block">
      <h3 class="funnel-section-title">撞墙热点</h3>
      <BTable
        :data="paginatedHotspots"
        :columns="columns"
        :pagination="true"
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @page-change="onPageChange"
        @size-change="onSizeChange"
      />
    </section>
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import ConversionTrendChart from './ConversionTrendChart.vue';
  import DateRangePicker from './DateRangePicker.vue';

  interface FunnelStep {
    key: string;
    label: string;
    count: number;
    fromPreviousRate: number | null;
    lost: number | null;
  }

  const mainFunnel = ref<FunnelStep[]>([]);
  const orderedFunnel = ref<FunnelStep[]>([]);
  const pageView = ref(0);
  const demoEnter = ref(0);
  const wall = ref(0);
  const signupOpen = ref(0);
  const signupSubmit = ref(0);
  const reg = ref(0);
  const demoThenSignupOpen = ref(0);
  const directSignupOpen = ref(0);
  const demoThenReg = ref(0);
  const directReg = ref(0);
  const wallThenSignupOpen = ref(0);
  const signupFailed = ref(0);
  const unattributed = ref(0);
  const failReasons = ref<{ reason: string; cnt: number }[]>([]);
  const uniqueIps = ref(0);
  const hotspots = ref<any[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const shareView = ref(0);
  const shareCta = ref(0);
  const activated = ref(0);
  const trend = ref<any[]>([]);

  const firstStage = computed(() => mainFunnel.value[0]);
  const lastStage = computed(() => mainFunnel.value[mainFunnel.value.length - 1]);
  const orderedRegisterCount = computed<number | null>(() => {
    const stage = orderedFunnel.value.find((item) => item.key === 'registerSuccess');
    return stage ? Number(stage.count || 0) : null;
  });
  const orderedPathCoverage = computed(() =>
    orderedRegisterCount.value === null ? 0 : rate(orderedRegisterCount.value, reg.value),
  );
  const overallRate = computed(() => rate(lastStage.value?.count || 0, firstStage.value?.count || 0));
  const weakestStageIndex = computed(() => {
    if (!mainFunnel.value.length || Number(firstStage.value?.count || 0) <= 0) return -1;
    let selected = -1;
    let lowest = Number.POSITIVE_INFINITY;
    mainFunnel.value.forEach((step, index) => {
      if (index > 0 && step.fromPreviousRate !== null && step.fromPreviousRate < lowest) {
        lowest = step.fromPreviousRate;
        selected = index;
      }
    });
    return selected;
  });

  const paginatedHotspots = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return hotspots.value.slice(start, start + pageSize.value);
  });
  const columns = [
    { title: '功能接口', key: 'context', width: '2fr', ellipsis: true },
    { title: '撞墙次数', key: 'cnt', width: '120px' },
  ];

  const rate = (value: number, base: number) => (base > 0 ? Math.round((value / base) * 1000) / 10 : 0);
  const formatNumber = (value: number) => Number(value || 0).toLocaleString('zh-CN');
  const wallToSignupOpen = computed(() => rate(wallThenSignupOpen.value, wall.value));
  const demoToSignupOpen = computed(() => rate(demoThenSignupOpen.value, demoEnter.value));
  const regToActivated = computed(() => rate(activated.value, reg.value));
  const shareViewToCta = computed(() => rate(shareCta.value, shareView.value));

  const entryComparisons = computed(() =>
    [
      { label: '打开注册', demo: demoThenSignupOpen.value, direct: directSignupOpen.value },
      { label: '注册成功', demo: demoThenReg.value, direct: directReg.value },
    ].map((row) => {
      const totalValue = row.demo + row.direct;
      return {
        ...row,
        total: totalValue,
        demoShare: rate(row.demo, totalValue),
        directShare: rate(row.direct, totalValue),
      };
    }),
  );

  const diagnosticCards = computed(() => [
    ...(orderedRegisterCount.value === null
      ? []
      : [
          {
            label: '完整路径注册',
            value: formatNumber(orderedRegisterCount.value),
            hint: `真实注册 ${formatNumber(reg.value)} 人 · 路径覆盖 ${orderedPathCoverage.value}%`,
          },
        ]),
    {
      label: '示例到注册意图',
      value: `${demoToSignupOpen.value}%`,
      hint: `${formatNumber(demoThenSignupOpen.value)} / ${formatNumber(demoEnter.value)} 人`,
    },
    {
      label: '撞墙后产生注册意图',
      value: `${wallToSignupOpen.value}%`,
      hint: `${formatNumber(wallThenSignupOpen.value)} / ${formatNumber(wall.value)} 人`,
    },
    {
      label: '注册后激活',
      value: `${regToActivated.value}%`,
      hint: `${formatNumber(activated.value)} / ${formatNumber(reg.value)} 人`,
    },
    {
      label: '分享曝光到点击',
      value: `${shareViewToCta.value}%`,
      hint: `${formatNumber(shareCta.value)} / ${formatNumber(shareView.value)} 人`,
    },
    {
      label: '采集质量',
      value: formatNumber(unattributed.value),
      hint: `无法归因事件 · 独立 IP ${formatNumber(uniqueIps.value)}`,
    },
    {
      label: '独立事件总量',
      value: formatNumber(signupFailed.value),
      hint: `注册失败 · 打开注册 ${formatNumber(signupOpen.value)} · 提交 ${formatNumber(signupSubmit.value)}`,
    },
  ]);

  const reasonLabels: Record<string, string> = {
    email_exists: '账号已存在',
    weak_password: '密码强度不足',
    server_error: '服务异常',
  };
  const normalizedFailReasons = computed(() => {
    const maximum = Math.max(1, ...failReasons.value.map((item) => Number(item.cnt || 0)));
    return failReasons.value.map((item) => ({
      ...item,
      label: reasonLabels[item.reason] || item.reason,
      width: Math.max(4, Math.round((Number(item.cnt || 0) / maximum) * 100)),
    }));
  });

  function stageWidth(count: number) {
    const base = firstStage.value?.count || 0;
    return base > 0 ? Math.min(100, Math.max(36, Math.round((count / base) * 100))) : 36;
  }

  function stageChangeLabel(previous: FunnelStep, current: FunnelStep) {
    const difference = Number(current.count || 0) - Number(previous.count || 0);
    if (difference > 0) return `较上步多 ${formatNumber(difference)} 人（埋点缺口）`;
    if (difference < 0) return `较上步少 ${formatNumber(Math.abs(difference))} 人`;
    return '人数持平';
  }

  function fallbackFunnel(): FunnelStep[] {
    const raw = [
      ['pageView', '访问', pageView.value],
      ['signupOpen', '打开注册', signupOpen.value],
      ['signupSubmit', '提交注册', signupSubmit.value],
      ['registerSuccess', '注册成功', reg.value],
    ] as const;
    return raw.map(([key, label, count], index) => {
      const previous = index > 0 ? raw[index - 1][2] : 0;
      return {
        key,
        label,
        count,
        fromPreviousRate: index === 0 ? null : rate(count, previous),
        lost: index === 0 ? null : Math.max(0, previous - count),
      };
    });
  }

  function onPageChange(page: number) {
    currentPage.value = page;
  }
  function onSizeChange(_page: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
  }

  async function fetchData(start?: string, end?: string) {
    const response: any = await apiBasePost('/api/common/getConversionFunnel', {
      startDate: start || undefined,
      endDate: end || undefined,
    });
    if (response.status !== 200) return;
    const data = response.data || {};
    pageView.value = data.pageViewVisitors || 0;
    demoEnter.value = data.demoEnterVisitors || 0;
    wall.value = data.wallHitVisitors || 0;
    signupOpen.value = data.signupOpenVisitors || 0;
    signupSubmit.value = data.signupSubmitVisitors || 0;
    reg.value = data.registerVisitors || 0;
    demoThenSignupOpen.value = data.demoThenSignupOpenVisitors || 0;
    directSignupOpen.value = data.directSignupOpenVisitors || 0;
    demoThenReg.value = data.demoThenRegisterVisitors || 0;
    directReg.value = data.directRegisterVisitors || 0;
    wallThenSignupOpen.value = data.wallThenSignupOpenVisitors || 0;
    signupFailed.value = data.signupFailedVisitors || 0;
    unattributed.value = data.unattributedEvents || 0;
    failReasons.value = data.signupFailReasons || [];
    shareView.value = data.shareViewVisitors || 0;
    shareCta.value = data.shareCtaClickVisitors || 0;
    activated.value = data.activatedUsers || 0;
    uniqueIps.value = data.uniqueIps || 0;
    hotspots.value = data.hotspots || [];
    trend.value = data.trend || [];
    // 主数字始终由独立事件标量重建，避免前端先更新、后端进程尚未重启时，
    // 旧接口把严格时序子集（如 2 人）继续误显示成真实注册总数（如 4 人）。
    mainFunnel.value = fallbackFunnel();
    orderedFunnel.value = Array.isArray(data.orderedFunnel)
      ? data.orderedFunnel
      : Array.isArray(data.mainFunnel)
        ? data.mainFunnel
        : [];
    total.value = hotspots.value.length;
    currentPage.value = 1;
  }

  function onDateChange(start?: string, end?: string) {
    void fetchData(start, end);
  }
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .funnel-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .funnel-block__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    p {
      margin: 4px 0 0;
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .funnel-section-title {
    margin: 0;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
  }

  .funnel-overview__result {
    display: grid;
    justify-items: end;
    color: var(--desc-color);
    font-size: 12px;

    strong {
      color: var(--primary-color);
      font-size: 24px;
      line-height: 1.15;
    }
  }

  .funnel-chain {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .funnel-chain__step {
    display: contents;
  }

  .funnel-chain__card {
    position: relative;
    box-sizing: border-box;
    min-width: 220px;
    padding: 12px 18px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--surface-raised-background);
    text-align: center;
    transition: width 0.25s ease;
  }

  .funnel-chain__step.is-weak .funnel-chain__card {
    border: 2px solid var(--danger-color);
  }

  .funnel-chain__label,
  .funnel-chain__value {
    display: block;
  }

  .funnel-chain__label {
    color: var(--desc-color);
    font-size: 12px;
  }

  .funnel-chain__value {
    margin-top: 2px;
    color: var(--text-color);
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .funnel-chain__path-label {
    display: block;
    margin-top: 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .funnel-chain__weak-label {
    display: inline-block;
    margin-top: 5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--danger-color);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
  }

  .funnel-chain__connector {
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    color: var(--desc-color);
    font-size: 12px;

    strong {
      color: var(--text-color);
      font-size: 13px;
    }
  }

  .funnel-chain__summary {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .funnel-entry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .funnel-entry {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }

  .funnel-entry__head {
    display: flex;
    justify-content: space-between;
    color: var(--text-color);
    font-size: 13px;

    span {
      color: var(--desc-color);
    }
  }

  .funnel-entry__bar {
    display: flex;
    height: 12px;
    margin: 12px 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--hover-background);

    span {
      min-width: 2px;
    }
  }

  .is-demo {
    background: var(--primary-color);
  }

  .is-direct {
    background: var(--todo-accent-color);
  }

  .funnel-entry dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 0;

    div {
      min-width: 0;
    }

    dt {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--desc-color);
      font-size: 11px;
    }

    i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    dd {
      margin: 3px 0 0;
      color: var(--text-color);
      font-size: 13px;
      font-weight: 600;
    }
  }

  .funnel-diagnostics {
    margin: 0;
  }

  .funnel-failures {
    padding-top: 12px;
    border-top: 1px solid var(--surface-border-color);

    h4 {
      margin: 0 0 10px;
      color: var(--text-color);
      font-size: 13px;
    }
  }

  .funnel-failure {
    display: grid;
    grid-template-columns: minmax(90px, 160px) minmax(100px, 1fr) 60px;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    color: var(--desc-color);
    font-size: 12px;

    > div {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--hover-background);
    }

    i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--danger-color);
    }

    strong {
      color: var(--text-color);
      text-align: right;
    }
  }

  @media (max-width: 767px) {
    .funnel-block__head,
    .funnel-entry-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .funnel-overview__result {
      justify-items: start;
    }

    .funnel-chain__card {
      min-width: 180px;
    }

    .funnel-failure {
      grid-template-columns: minmax(82px, 110px) minmax(80px, 1fr) 42px;
    }
  }
</style>
