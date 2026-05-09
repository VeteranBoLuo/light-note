<template>
  <div>
    <ul class="admin-stats security-stats">
      <li v-for="card in statCards" :key="card.label" class="admin-stat-card security-stat-card">
        <span class="admin-stat-label">{{ card.label }}</span>
        <strong class="admin-stat-value">{{ card.value }}</strong>
        <span class="admin-stat-hint">{{ card.hint }}</span>
      </li>
    </ul>

    <div class="security-grid">
      <section class="security-section">
        <h3>攻击类型分布</h3>
        <BTable :data="overview.typeDistribution" :columns="typeColumns" :rowKey="'attackType'" />
      </section>
      <section class="security-section">
        <h3>24小时趋势</h3>
        <BTable :data="overview.trend" :columns="trendColumns" :rowKey="'time'" />
      </section>
      <section class="security-section">
        <h3>Top 攻击 IP</h3>
        <BTable :data="overview.topIps" :columns="topIpColumns" :rowKey="'sourceIp'" />
      </section>
      <section class="security-section">
        <h3>Top 被攻击接口</h3>
        <BTable :data="overview.topPaths" :columns="topPathColumns" :rowKey="'requestPath'" />
      </section>
    </div>

    <div v-if="overview.recentEvents?.length" class="security-section" style="margin-top: 12px">
      <h3>近期安全事件</h3>
      <BTable :data="overview.recentEvents" :columns="recentColumns" :rowKey="'eventId'" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, reactive } from 'vue';
import { apiBasePost } from '@/http/request.ts';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import { REFRESH_TRIGGER, typeColumns, trendColumns, topIpColumns, topPathColumns, recentColumns } from './securityShared';

const refreshTrigger = inject(REFRESH_TRIGGER);

const overview = reactive<any>({
  summary: {},
  typeDistribution: [],
  trend: [],
  topIps: [],
  topPaths: [],
  recentEvents: [],
});

const statCards = computed(() => {
  const summary = overview.summary || {};
  return [
    { label: '7日安全事件', value: summary.total || 0, hint: '累计命中' },
    { label: '今日事件', value: summary.todayTotal || 0, hint: '当天新增' },
    { label: '高危/严重', value: summary.highRisk || 0, hint: '需关注' },
    { label: '已拦截', value: summary.blocked || 0, hint: '防护动作' },
    { label: '活跃攻击IP', value: summary.activeIps || 0, hint: '近7日' },
    { label: '今日严重', value: summary.todayCritical || 0, hint: 'critical' },
  ];
});

async function loadOverview() {
  const res = await apiBasePost('/api/security/overview', {});
  if (res.status === 200) {
    Object.assign(overview, res.data);
  }
}

onMounted(() => {
  loadOverview();
});
</script>

<style lang="less" scoped>
@import './securityCenter.less';
</style>
