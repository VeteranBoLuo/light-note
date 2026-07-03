<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 增长</p>
          <h2 class="admin-title">游客转化漏斗</h2>
          <p class="admin-subtitle">访问 → 撞墙 → 点注册 → 到达注册页 → 注册成功(按独立访客 fingerprint 去重)</p>
        </div>
      </header>

      <div class="funnel-filter">
        <label>起始 <input type="date" v-model="startDate" /></label>
        <label>结束 <input type="date" v-model="endDate" /></label>
        <button class="funnel-btn" @click="query">查询</button>
        <button class="funnel-btn ghost" @click="reset">全期</button>
        <span class="funnel-range-hint">当前:{{ rangeHint }}</span>
      </div>

      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">访问量</span>
          <strong class="admin-stat-value">{{ pageView }}</strong>
          <span class="admin-stat-hint">独立访客 · {{ uniqueIps }} 个 IP</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">撞墙访客</span>
          <strong class="admin-stat-value">{{ wall }}</strong>
          <span class="admin-stat-hint">访问→撞墙 {{ visitToWall }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">点击注册</span>
          <strong class="admin-stat-value">{{ cta }}</strong>
          <span class="admin-stat-hint">撞墙→点击 {{ wallToCta }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">到达注册页</span>
          <strong class="admin-stat-value">{{ registerView }}</strong>
          <span class="admin-stat-hint">点击→到达 {{ ctaToView }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">注册成功</span>
          <strong class="admin-stat-value">{{ reg }}</strong>
          <span class="admin-stat-hint">到达→注册 {{ viewToReg }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">整体转化</span>
          <strong class="admin-stat-value">{{ visitToReg }}%</strong>
          <span class="admin-stat-hint">访问→注册</span>
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
        <li class="admin-stat-card">
          <span class="admin-stat-label">激活用户</span>
          <strong class="admin-stat-value">{{ activated }}</strong>
          <span class="admin-stat-hint">注册→激活 {{ regToActivated }}%(近似)</span>
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
        <p class="funnel-section-title">按天趋势(游客访问 / 点击注册 / 注册成功)</p>
        <div class="funnel-trend-wrap">
          <table class="funnel-trend">
            <thead>
              <tr><th>日期</th><th>访问</th><th>点击注册</th><th>注册成功</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in trend" :key="t.d">
                <td>{{ t.d }}</td><td>{{ t.pv }}</td><td>{{ t.cta }}</td><td>{{ t.reg }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';

  const pageView = ref(0);
  const wall = ref(0);
  const cta = ref(0);
  const registerView = ref(0);
  const reg = ref(0);
  const uniqueIps = ref(0);
  const hotspots = ref<any[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const shareView = ref(0);
  const shareCta = ref(0);
  const activated = ref(0);
  const trend = ref<any[]>([]);
  const startDate = ref('');
  const endDate = ref('');

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
  const visitToWall = computed(() => rate(wall.value, pageView.value));
  const wallToCta = computed(() => rate(cta.value, wall.value));
  const ctaToView = computed(() => rate(registerView.value, cta.value));
  const viewToReg = computed(() => rate(reg.value, registerView.value));
  const visitToReg = computed(() => rate(reg.value, pageView.value));
  const shareViewToCta = computed(() => rate(shareCta.value, shareView.value));
  const regToActivated = computed(() => rate(activated.value, reg.value));
  const rangeHint = computed(() => (startDate.value || endDate.value ? `${startDate.value || '起'} ~ ${endDate.value || '今'}` : '全期'));

  function fetchData() {
    apiBasePost('/api/common/getConversionFunnel', {
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
    }).then((res: any) => {
      if (res.status === 200) {
        const d = res.data || {};
        pageView.value = d.pageViewVisitors || 0;
        wall.value = d.wallHitVisitors || 0;
        cta.value = d.ctaClickVisitors || 0;
        registerView.value = d.registerViewVisitors || 0;
        reg.value = d.registerVisitors || 0;
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
  function query() {
    fetchData();
  }
  function reset() {
    startDate.value = '';
    endDate.value = '';
    fetchData();
  }

  onMounted(fetchData);
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
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-color);
  }
  .funnel-filter input[type='date'] {
    padding: 5px 8px;
    border: 1px solid var(--card-border-color, #ddd);
    border-radius: 6px;
    background: var(--background-color);
    color: var(--text-color);
  }
  .funnel-btn {
    padding: 6px 14px;
    border: 0;
    border-radius: 6px;
    background: #615ced;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  }
  .funnel-btn.ghost {
    background: transparent;
    border: 1px solid var(--card-border-color, #ddd);
    color: var(--text-color);
  }
  .funnel-range-hint {
    color: var(--sub-text-color, #888);
    font-size: 12px;
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
