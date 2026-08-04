<template>
  <AdminDataPage eyebrow="Admin / 增长" title="游客转化各阶段" :subtitle="pageSubtitle" layout="scroll">
    <template #toolbar>
      <DateRangePicker ref="drpRef" @change="onDateChange" />
    </template>

    <!-- 主链单独成行并显示每步转化：12 张卡平铺时看不出漏斗形状，也分不清哪些在必经路径上 -->
    <ol class="funnel-chain">
      <li v-for="step in mainChain" :key="step.label" class="funnel-chain__step">
        <div class="funnel-chain__card">
          <span class="funnel-chain__label">{{ step.label }}</span>
          <strong class="funnel-chain__value">{{ formatNumber(step.value) }}</strong>
          <!-- 转化率贴在本步卡内（表示「从上一步到本步」），不做卡片之间的独立标签：
               窄屏换行后行首标签会指向错误的相邻卡。 -->
          <span v-if="step.rate !== null" class="funnel-chain__rate" :data-weak="step.rate < 20">
            <span class="funnel-chain__rate-arrow" aria-hidden="true">↳</span>
            上一步 {{ step.rate }}%
          </span>
          <span class="funnel-chain__bar" :style="{ width: `${step.width}%` }"></span>
        </div>
      </li>
    </ol>
    <p class="funnel-chain__summary">
      整体转化（访问 → 注册）<strong>{{ visitToReg }}%</strong>
    </p>

    <ul class="admin-stats funnel-side">
      <li v-for="item in sideMetrics" :key="item.label" class="admin-stat-card">
        <span class="admin-stat-label">{{ item.label }}</span>
        <strong class="admin-stat-value">{{ item.value }}</strong>
        <span class="admin-stat-hint">{{ item.hint }}</span>
      </li>
    </ul>

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

    <section v-if="trend.length" class="funnel-block">
      <h3 class="funnel-section-title">按天趋势（游客访问 / 打开注册 / 注册成功）</h3>
      <BTable :data="trend" :columns="trendColumns" />
    </section>
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import DateRangePicker from './DateRangePicker.vue';

  const pageSubtitle =
    '主链：访问 → 进入示例 → 打开注册 → 提交 → 注册成功。数字为各阶段独立访客数（按非空 fingerprint 去重），相邻百分比是近似转化、非严格时序漏斗；撞墙为独立意图分支，不在主链必经路径上。';

  const pageView = ref(0);
  const demoEnter = ref(0);
  const wall = ref(0);
  const signupOpen = ref(0);
  const signupSubmit = ref(0);
  const reg = ref(0);
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

  const paginatedHotspots = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return hotspots.value.slice(start, start + pageSize.value);
  });

  function onPageChange(page: number) {
    currentPage.value = page;
  }
  function onSizeChange(page: number, size: number) {
    currentPage.value = 1;
    pageSize.value = size;
  }

  const columns = [
    { title: '功能接口', key: 'context', width: '2fr', ellipsis: true },
    { title: '撞墙次数', key: 'cnt', width: '120px' },
  ];
  // 趋势此前是手写 <table>，违反 B 组件铁律且与页面其余表格样式不一致
  const trendColumns = [
    { title: '日期', key: 'd', width: '1fr' },
    { title: '访问', key: 'pv', width: '1fr' },
    { title: '打开注册', key: 'signupOpen', width: '1fr' },
    { title: '注册成功', key: 'reg', width: '1fr' },
  ];

  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const visitToDemo = computed(() => rate(demoEnter.value, pageView.value));
  const demoToOpen = computed(() => rate(signupOpen.value, demoEnter.value)); // 主链:进入示例→打开注册(撞墙不在主链)
  const wallToSignupOpen = computed(() => rate(signupOpen.value, wall.value)); // 独立分支:撞墙→打开注册
  const signupOpenToSubmit = computed(() => rate(signupSubmit.value, signupOpen.value));
  const submitToReg = computed(() => rate(reg.value, signupSubmit.value));
  const visitToReg = computed(() => rate(reg.value, pageView.value));
  const shareViewToCta = computed(() => rate(shareCta.value, shareView.value));
  const regToActivated = computed(() => rate(activated.value, reg.value));
  // 失败原因码 → 中文,拼成一行在「注册失败」卡展示
  const REASON_LABEL: Record<string, string> = {
    email_exists: '账号已存在',
    weak_password: '密码太弱',
    server_error: '服务异常',
  };
  const failReasonsText = computed(() =>
    failReasons.value.map((r) => `${REASON_LABEL[r.reason] || r.reason} ${r.cnt}`).join(' · '),
  );

  /** 主链五步：条宽以访问量为基准，直观看出在哪一步流失最多。 */
  const mainChain = computed(() => {
    const base = pageView.value || 0;
    const width = (value: number) => (base > 0 ? Math.max(4, Math.round((value / base) * 100)) : 4);
    return [
      { label: '访问量', value: pageView.value, rate: null as number | null, width: width(pageView.value) },
      { label: '进入示例', value: demoEnter.value, rate: visitToDemo.value, width: width(demoEnter.value) },
      { label: '打开注册', value: signupOpen.value, rate: demoToOpen.value, width: width(signupOpen.value) },
      { label: '提交注册', value: signupSubmit.value, rate: signupOpenToSubmit.value, width: width(signupSubmit.value) },
      { label: '注册成功', value: reg.value, rate: submitToReg.value, width: width(reg.value) },
    ];
  });

  /** 旁支指标：与主链分开陈列，避免读者误以为它们在必经路径上。 */
  const sideMetrics = computed(() => [
    { label: '撞墙访客（意图分支）', value: formatNumber(wall.value), hint: `撞墙→打开注册 ${wallToSignupOpen.value}%` },
    { label: '激活用户', value: formatNumber(activated.value), hint: `本期注册中激活 ${regToActivated.value}%` },
    { label: '注册失败', value: formatNumber(signupFailed.value), hint: failReasonsText.value || '按标准原因码统计' },
    { label: '独立 IP', value: formatNumber(uniqueIps.value), hint: '访问量对应的 IP 去重数' },
    { label: '无法归因', value: formatNumber(unattributed.value), hint: '空 fingerprint 事件（不计入访客数）' },
    { label: '分享页曝光', value: formatNumber(shareView.value), hint: '独立访客' },
    { label: '分享页点击', value: formatNumber(shareCta.value), hint: `曝光→点击 ${shareViewToCta.value}%` },
  ]);

  function fetchData(start?: string, end?: string) {
    apiBasePost('/api/common/getConversionFunnel', {
      startDate: start || undefined,
      endDate: end || undefined,
    }).then((res: any) => {
      if (res.status === 200) {
        const d = res.data || {};
        pageView.value = d.pageViewVisitors || 0;
        demoEnter.value = d.demoEnterVisitors || 0;
        wall.value = d.wallHitVisitors || 0;
        signupOpen.value = d.signupOpenVisitors || 0;
        signupSubmit.value = d.signupSubmitVisitors || 0;
        reg.value = d.registerVisitors || 0;
        signupFailed.value = d.signupFailedVisitors || 0;
        unattributed.value = d.unattributedEvents || 0;
        failReasons.value = d.signupFailReasons || [];
        shareView.value = d.shareViewVisitors || 0;
        shareCta.value = d.shareCtaClickVisitors || 0;
        activated.value = d.activatedUsers || 0;
        uniqueIps.value = d.uniqueIps || 0;
        hotspots.value = d.hotspots || [];
        trend.value = d.trend || [];
        total.value = hotspots.value.length;
        currentPage.value = 1;
      }
    });
  }

  function onDateChange(start?: string, end?: string) {
    fetchData(start, end);
  }
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  /* 主链漏斗：每步一张卡 + 一条按访问量归一的宽度条，步与步之间标转化率。
     条宽最小 4%，保证 0 值也能看见卡片轮廓。 */
  .funnel-chain {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .funnel-chain__step {
    display: flex;
    flex: 1 1 170px;
    min-width: 0;
  }

  .funnel-chain__rate {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--desc-color);
  }

  .funnel-chain__rate-arrow {
    margin-right: 2px;
    opacity: 0.7;
  }

  /* 转化率过低时标红，扫一眼就能定位流失最严重的一步 */
  .funnel-chain__rate[data-weak='true'] {
    color: var(--danger-color, #dc2626);
    font-weight: 600;
  }

  .funnel-chain__card {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    padding: 12px 14px 14px;
    border-radius: 12px;
    background: var(--surface-raised-background);
    border: 1px solid var(--surface-border-color);
    overflow: hidden;
  }

  .funnel-chain__label {
    display: block;
    font-size: 12px;
    color: var(--desc-color);
  }

  .funnel-chain__value {
    display: block;
    margin-top: 2px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  .funnel-chain__bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--primary-color);
    transition: width 0.3s ease;
  }

  .funnel-chain__summary {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--desc-color);

    strong {
      margin-left: 4px;
      font-size: 16px;
      color: var(--primary-color);
      font-variant-numeric: tabular-nums;
    }
  }

  .funnel-side {
    margin-top: 4px;
  }

  .funnel-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .funnel-section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
  }
</style>
