<template>
  <AdminDataPage eyebrow="Admin / 增长" title="游客转化各阶段" :subtitle="pageSubtitle" layout="scroll">
    <template #toolbar>
      <DateRangePicker ref="drpRef" @change="onDateChange" />
    </template>

    <!--
      三段式而不是一条直链：进入示例和打开注册是**并行入口**，不是上下游。
      有人直接点注册、从没进过示例，把两者串起来算「上一步转化」会拿两批不相干的人相除
      （直接注册的人多时还会超过 100%）。所以按「共同起点 → 两条并行路径 → 汇聚后的注册链」画。
    -->
    <div class="funnel-origin">
      <span class="funnel-chain__label">访问量（共同起点）</span>
      <strong class="funnel-origin__value">{{ formatNumber(pageView) }}</strong>
      <span class="funnel-chain__label">独立访客，下面两条路径都从这里出发</span>
    </div>

    <ul class="funnel-parallel">
      <li v-for="branch in entryBranches" :key="branch.label" class="funnel-parallel__item">
        <div class="funnel-chain__card">
          <span class="funnel-parallel__tag">{{ branch.tag }}</span>
          <span class="funnel-chain__label">{{ branch.label }}</span>
          <strong class="funnel-chain__value">{{ formatNumber(branch.value) }}</strong>
          <span class="funnel-chain__rate">占访问 {{ branch.share }}%</span>
          <span class="funnel-chain__note">{{ branch.note }}</span>
          <span class="funnel-chain__bar" :style="{ width: `${branch.width}%` }"></span>
        </div>
      </li>
    </ul>

    <p class="funnel-merge"><span aria-hidden="true">↓</span> 两条路径在这里汇聚</p>

    <!-- 汇聚点往后才是真正的时序漏斗：打开注册 → 提交 → 成功，人群逐层收窄 -->
    <ol class="funnel-chain">
      <li v-for="step in signupChain" :key="step.label" class="funnel-chain__step">
        <div class="funnel-chain__card">
          <span class="funnel-chain__label">{{ step.label }}</span>
          <strong class="funnel-chain__value">{{ formatNumber(step.value) }}</strong>
          <!-- 转化率贴在本步卡内（表示「从上一步到本步」），不做卡片之间的独立标签：
               窄屏换行后行首标签会指向错误的相邻卡。 -->
          <span v-if="step.rate !== null" class="funnel-chain__rate" :data-weak="step.rate < 20">
            <span class="funnel-chain__rate-arrow" aria-hidden="true">↳</span>
            上一步 {{ step.rate }}%
          </span>
          <span v-if="step.note" class="funnel-chain__note">{{ step.note }}</span>
          <span class="funnel-chain__bar" :style="{ width: `${step.width}%` }"></span>
        </div>
      </li>
    </ol>
    <p class="funnel-chain__summary">
      整体转化（访问 → 注册）<strong>{{ visitToReg }}%</strong>
      <span class="funnel-chain__summary-split"
        >注册成功里 看过示例 {{ formatNumber(demoThenReg) }} 人 · 未看示例 {{ formatNumber(directReg) }} 人</span
      >
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
    '访问之后分两条并行路径：进入示例 / 直接打开注册（互不为上下游，有人从不进示例就注册），两路汇聚到打开注册后才是时序漏斗：打开注册 → 提交 → 注册成功。数字为独立访客数（按非空 fingerprint 去重）；路径归属按「示例是否发生在注册意图之前」判定；撞墙是独立意图分支，与看示例会重叠，只算它自身的转化。';

  const pageView = ref(0);
  const demoEnter = ref(0);
  const wall = ref(0);
  const signupOpen = ref(0);
  const signupSubmit = ref(0);
  const reg = ref(0);
  // 路径拆分:demoThen* 与 direct* 互斥,相加等于对应事件的总访客数
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
  const visitToDirectOpen = computed(() => rate(directSignupOpen.value, pageView.value));
  // 示例这条路径自己的转化：分子必须是「看过示例之后又打开注册的人」，
  // 不能用 signupOpen 总数——那里面混着从没进示例的直接注册者。
  const demoToOpen = computed(() => rate(demoThenSignupOpen.value, demoEnter.value));
  // 独立分支：撞墙之后打开注册的人 ÷ 撞墙的人（同样不能拿 signupOpen 总数当分子）
  const wallToSignupOpen = computed(() => rate(wallThenSignupOpen.value, wall.value));
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

  /** 条宽统一以访问量为基准，跨两段也能直接比长短。 */
  const barWidth = (value: number) => {
    const base = pageView.value || 0;
    return base > 0 ? Math.max(4, Math.round((value / base) * 100)) : 4;
  };

  /**
   * 访问之后的两条并行入口。两者是并列关系而不是先后关系，所以只给「占访问」的比例，
   * 不给「上一步 → 本步」的转化率——那会暗示一条不存在的时序链。
   */
  const entryBranches = computed(() => [
    {
      tag: '路径 A',
      label: '进入示例',
      value: demoEnter.value,
      share: visitToDemo.value,
      note: `其中 ${formatNumber(demoThenSignupOpen.value)} 人之后打开注册（示例→注册意图 ${demoToOpen.value}%）`,
      width: barWidth(demoEnter.value),
    },
    {
      tag: '路径 B',
      label: '直接打开注册',
      value: directSignupOpen.value,
      share: visitToDirectOpen.value,
      note: '没进过示例就点了注册，示例不影响这批人',
      width: barWidth(directSignupOpen.value),
    },
  ]);

  /** 汇聚后的注册链：这三步是真子集关系，才配算「上一步」转化率。 */
  const signupChain = computed(() => [
    {
      label: '打开注册（两路汇聚）',
      value: signupOpen.value,
      rate: null as number | null,
      note: `示例路径 ${formatNumber(demoThenSignupOpen.value)} + 直接 ${formatNumber(directSignupOpen.value)}`,
      width: barWidth(signupOpen.value),
    },
    {
      label: '提交注册',
      value: signupSubmit.value,
      rate: signupOpenToSubmit.value,
      note: '',
      width: barWidth(signupSubmit.value),
    },
    { label: '注册成功', value: reg.value, rate: submitToReg.value, note: '', width: barWidth(reg.value) },
  ]);

  /** 旁支指标：与主链分开陈列，避免读者误以为它们在必经路径上。 */
  const sideMetrics = computed(() => [
    {
      label: '撞墙访客（意图分支）',
      value: formatNumber(wall.value),
      // 与看示例会重叠，所以不并进上面两条互斥路径，只看它自己带来了多少注册意图
      hint: `撞墙后打开注册 ${formatNumber(wallThenSignupOpen.value)} 人（${wallToSignupOpen.value}%）`,
    },
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
        demoThenSignupOpen.value = d.demoThenSignupOpenVisitors || 0;
        directSignupOpen.value = d.directSignupOpenVisitors || 0;
        demoThenReg.value = d.demoThenRegisterVisitors || 0;
        directReg.value = d.directRegisterVisitors || 0;
        wallThenSignupOpen.value = d.wallThenSignupOpenVisitors || 0;
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

  /* 共同起点：左侧实色竖条标出「所有路径都从这里出发」。
     用实色 border 而不是混色背景——APK 的 WebView 会把 color-mix 回退成实色、
     混色阴影回退成透明，层次会整块消失（见 docs/development.md 的 Android APK 样式回退）。 */
  .funnel-origin {
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--surface-border-color);
    border-left: 3px solid var(--primary-color);
    background: var(--surface-raised-background);
  }

  .funnel-origin__value {
    display: block;
    margin: 2px 0;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  /* 并行入口：两张并列卡，故意不带 ↳「上一步」箭头，避免读成一条时序链。 */
  .funnel-parallel {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .funnel-parallel__item {
    display: flex;
    flex: 1 1 240px;
    min-width: 0;
  }

  /* 路径标签做成中性 chip：底色/描边/文字都取两套主题各自定义的实色。
     不用主色当小字——primary(#615ced) 在深色表面上只有 2.02~3.38:1（theme.less 深色块已记录同一问题），
     也不用 color-mix 提亮，那在 APK 的 WebView 里会被回退掉。 */
  .funnel-parallel__tag {
    display: inline-block;
    margin-bottom: 6px;
    padding: 1px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--primary-btn-bg-color);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-color);
  }

  .funnel-chain__note {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }

  /* 汇聚提示同理用正文色而不是主色：12px 的主色小字在深色下只有 3.38:1 */
  .funnel-merge {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color);

    span {
      margin-right: 2px;
    }
  }

  /* 汇聚后的注册链：每步一张卡 + 一条按访问量归一的宽度条，步与步之间标转化率。
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
    color: var(--danger-color);
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

  /* 路径对比跟在整体转化后面：示例到底带来了多少真实注册，一眼能和「未看示例」对比 */
  .funnel-chain__summary-split {
    margin-left: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--surface-border-color);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 767px) {
    .funnel-chain__summary-split {
      display: block;
      margin: 6px 0 0;
      padding: 0;
      border-left: none;
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
