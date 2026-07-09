<template>
  <div class="admin-panel-container">
    <section class="admin-panel ov-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / 总览</p>
          <h2 class="admin-title">数据总览</h2>
          <p class="admin-subtitle">
            全站用户、内容、AI 与转化的实时概览<template v-if="data"> · 更新于 {{ data.generatedAt }}</template>
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

      <p class="ov-section-title">用户与内容</p>
      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">总用户</span>
          <strong class="admin-stat-value">{{ n(data?.users.total) }}</strong>
          <span class="admin-stat-hint">今日新增 +{{ n(data?.users.today) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">书签</span>
          <strong class="admin-stat-value">{{ n(data?.resources.bookmarkTotal) }}</strong>
          <span class="admin-stat-hint">今日 +{{ n(data?.resources.bookmarkToday) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">笔记</span>
          <strong class="admin-stat-value">{{ n(data?.resources.noteTotal) }}</strong>
          <span class="admin-stat-hint">今日 +{{ n(data?.resources.noteToday) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">文件</span>
          <strong class="admin-stat-value">{{ n(data?.resources.fileTotal) }}</strong>
          <span class="admin-stat-hint">今日 +{{ n(data?.resources.fileToday) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">全站存储</span>
          <strong class="admin-stat-value">{{ storageDisplay }}</strong>
          <span class="admin-stat-hint">云盘文件占用</span>
        </li>
      </ul>

      <p class="ov-section-title">AI 消耗</p>
      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日调用</span>
          <strong class="admin-stat-value">{{ n(data?.ai.todayCount) }}</strong>
          <span class="admin-stat-hint">累计 {{ n(data?.ai.totalCount) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日 Token</span>
          <strong class="admin-stat-value">{{ n(data?.ai.todayTokens) }}</strong>
          <span class="admin-stat-hint">累计 {{ n(data?.ai.totalTokens) }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">今日费用</span>
          <strong class="admin-stat-value">¥{{ data?.ai.todayCost ?? '0.0000' }}</strong>
          <span class="admin-stat-hint">累计 ¥{{ data?.ai.totalCost ?? '0.0000' }}</span>
        </li>
      </ul>

      <p class="ov-section-title">游客转化</p>
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
          <span class="admin-stat-hint">查看详细分析</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';

  const data = ref<any>(null);

  const n = (v: any) => (v == null ? '—' : Number(v).toLocaleString());
  const pendingTotal = computed(() => (data.value ? data.value.pending.opinion + data.value.pending.security : 0));
  const convRate = computed(() => {
    const c = data.value?.conversion;
    if (!c || !c.visitors) return 0;
    return Math.round((c.registers / c.visitors) * 1000) / 10;
  });
  const storageDisplay = computed(() => {
    const mb = data.value?.resources.storageMb || 0;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
  });

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
    margin: 18px 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--sub-text-color, #888);
  }
  .ov-section-title:first-of-type {
    margin-top: 10px;
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

  .ov-link {
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .ov-link:hover {
    border-color: var(--primary-color);
  }
</style>
