<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 增长</p>
          <h2 class="admin-title">游客转化漏斗</h2>
          <p class="admin-subtitle">游客从撞墙到注册的转化路径(按独立访客 fingerprint 去重)</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">撞墙访客</span>
          <strong class="admin-stat-value">{{ wall }}</strong>
          <span class="admin-stat-hint">尝试写操作被引导</span>
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
          <strong class="admin-stat-value">{{ wallToReg }}%</strong>
          <span class="admin-stat-hint">撞墙→注册</span>
        </li>
      </ul>

      <div class="admin-table-card">
        <h3 class="funnel-section-title">撞墙热点 · 游客最想用却被挡的功能(优先优化这些)</h3>
        <BTable :data="hotspots" :columns="columns" :pagination="false" />
      </div>

      <p class="admin-subtitle" style="margin-top: 14px">
        注:访问量(page_view)埋点暂未做,漏斗从「撞墙」起算;数据随真实游客积累。
      </p>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';

  const wall = ref(0);
  const cta = ref(0);
  const reg = ref(0);
  const hotspots = ref<any[]>([]);

  const columns = [
    { title: '功能接口', key: 'context', width: '2fr', ellipsis: true },
    { title: '撞墙次数', key: 'cnt', width: '120px' },
  ];

  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const wallToCta = computed(() => rate(cta.value, wall.value));
  const ctaToReg = computed(() => rate(reg.value, cta.value));
  const wallToReg = computed(() => rate(reg.value, wall.value));

  function fetchData() {
    apiBasePost('/api/common/getConversionFunnel', {}).then((res: any) => {
      if (res.status === 200) {
        const e = res.data?.byEvent || {};
        wall.value = e.wall_hit?.visitors || 0;
        cta.value = e.cta_click?.visitors || 0;
        reg.value = e.register?.visitors || 0;
        hotspots.value = res.data?.hotspots || [];
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
