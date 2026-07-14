<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 增长</p>
          <h2 class="admin-title">游客转化各阶段</h2>
          <p class="admin-subtitle">
            主链:访问 → 进入示例 → 打开注册 → 提交 → 注册成功。数字为各阶段独立访客数(按非空 fingerprint 去重),相邻百分比是近似转化、非严格时序漏斗;撞墙为独立意图分支,不在主链必经路径上。
          </p>
        </div>
      </header>

      <div class="funnel-filter">
        <DateRangePicker @change="onDateChange" ref="drpRef" />
      </div>

      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">访问量</span>
          <strong class="admin-stat-value">{{ pageView }}</strong>
          <span class="admin-stat-hint">独立访客 · {{ uniqueIps }} 个 IP</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">进入示例</span>
          <strong class="admin-stat-value">{{ demoEnter }}</strong>
          <span class="admin-stat-hint">访问→进入 {{ visitToDemo }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">打开注册</span>
          <strong class="admin-stat-value">{{ signupOpen }}</strong>
          <span class="admin-stat-hint">进入→打开 {{ demoToOpen }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">提交注册</span>
          <strong class="admin-stat-value">{{ signupSubmit }}</strong>
          <span class="admin-stat-hint">打开→提交 {{ signupOpenToSubmit }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">注册成功</span>
          <strong class="admin-stat-value">{{ reg }}</strong>
          <span class="admin-stat-hint">提交→成功 {{ submitToReg }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">整体转化</span>
          <strong class="admin-stat-value">{{ visitToReg }}%</strong>
          <span class="admin-stat-hint">访问→注册</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">撞墙访客(意图分支)</span>
          <strong class="admin-stat-value">{{ wall }}</strong>
          <span class="admin-stat-hint">撞墙→打开注册 {{ wallToSignupOpen }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">激活用户</span>
          <strong class="admin-stat-value">{{ activated }}</strong>
          <span class="admin-stat-hint">本期注册中激活 {{ regToActivated }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">注册失败</span>
          <strong class="admin-stat-value">{{ signupFailed }}</strong>
          <span class="admin-stat-hint">{{ failReasonsText || '按标准原因码统计' }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">无法归因</span>
          <strong class="admin-stat-value">{{ unattributed }}</strong>
          <span class="admin-stat-hint">空 fingerprint 事件(不计入访客数)</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">分享页曝光</span>
          <strong class="admin-stat-value">{{ shareView }}</strong>
          <span class="admin-stat-hint">独立访客</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">分享页点击</span>
          <strong class="admin-stat-value">{{ shareCta }}</strong>
          <span class="admin-stat-hint">曝光→点击 {{ shareViewToCta }}%</span>
        </li>
      </ul>

      <div class="admin-table-card">
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
      </div>

      <div class="admin-table-card" v-if="trend.length">
        <p class="funnel-section-title">按天趋势(游客访问 / 打开注册 / 注册成功)</p>
        <div class="funnel-trend-wrap">
          <table class="funnel-trend">
            <thead>
              <tr><th>日期</th><th>访问</th><th>打开注册</th><th>注册成功</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in trend" :key="t.d">
                <td>{{ t.d }}</td
                ><td>{{ t.pv }}</td
                ><td>{{ t.signupOpen }}</td
                ><td>{{ t.reg }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import DateRangePicker from './DateRangePicker.vue';

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
  .funnel-section-title {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--text-color);
  }
  .funnel-filter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-color);
  }
  .funnel-trend-wrap {
    overflow-x: auto;
  }
  .funnel-trend {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--text-color);
  }
  .funnel-trend th,
  .funnel-trend td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--card-border-color, #eee);
    font-variant-numeric: tabular-nums;
  }
  .funnel-trend th {
    color: var(--sub-text-color, #888);
    font-weight: 500;
  }

  /* 本面板内容较多(统计卡 + 撞墙热点表 + 按天趋势表),覆盖 admin-manage.less 的
     「固定视口高 + flex 平分 + overflow:hidden」布局:改为整面板纵向滚动、内容按自然高度排布,
     避免卡片换行挤占后两个表格空间导致看不清、且整体没有滚动条 */
  .admin-panel {
    overflow-y: auto;
  }
  .admin-table-card {
    flex: none;
    overflow: visible;
    margin-bottom: 16px;
  }
  /* 撞墙热点表(ant-table)原本靠 flex:1 撑满 + 内部滚动,现改为自然高度随面板一起滚 */
  :deep(.ant-table-wrapper),
  :deep(.ant-table-body) {
    flex: none;
    overflow: visible !important;
  }
</style>
