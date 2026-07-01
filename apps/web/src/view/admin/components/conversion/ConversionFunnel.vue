<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 增长</p>
          <h2 class="admin-title">游客转化漏斗</h2>
          <p class="admin-subtitle">访问 → 撞墙 → 点注册 → 注册成功(按独立访客 fingerprint 去重)</p>
        </div>
      </header>

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
          <span class="admin-stat-label">注册成功</span>
          <strong class="admin-stat-value">{{ reg }}</strong>
          <span class="admin-stat-hint">点击→注册 {{ ctaToReg }}%</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">整体转化</span>
          <strong class="admin-stat-value">{{ visitToReg }}%</strong>
          <span class="admin-stat-hint">访问→注册</span>
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
  const reg = ref(0);
  const uniqueIps = ref(0);
  const hotspots = ref<any[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);

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
  const ctaToReg = computed(() => rate(reg.value, cta.value));
  const visitToReg = computed(() => rate(reg.value, pageView.value));

  function fetchData() {
    apiBasePost('/api/common/getConversionFunnel', {}).then((res: any) => {
      if (res.status === 200) {
        const d = res.data || {};
        pageView.value = d.pageViewVisitors || 0;
        wall.value = d.wallHitVisitors || 0;
        cta.value = d.ctaClickVisitors || 0;
        reg.value = d.registerVisitors || 0;
        uniqueIps.value = d.uniqueIps || 0;
        hotspots.value = d.hotspots || [];
        total.value = hotspots.value.length;
      }
    });
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
</style>
