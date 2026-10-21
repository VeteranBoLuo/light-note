<template>
  <main class="weekly-report-harness" :class="{ 'is-integration': integration }">
    <template v-if="integration">
      <nav class="weekly-report-harness-nav">
        <span>本地隔离联调 · 合成账号 · F8 返回</span>
        <BButton @click="router.push('/growth')">成长中心</BButton>
        <BButton @click="router.push('/notifications')">周报通知</BButton>
      </nav>
      <RouterView />
    </template>
    <template v-else>
      <BButton type="primary" @click="visible = true">打开成长周报</BButton>
      <WeeklyReportModal v-model:visible="visible" :initial-period="initialPeriod" :snapshot="snapshot" />
    </template>
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { RouterView, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import type { WeeklyReportData, WeeklyReportPeriodKind } from '@/utils/weeklyReport';

  defineProps<{ initialPeriod: WeeklyReportPeriodKind; snapshot: WeeklyReportData | null; integration?: boolean }>();
  const router = useRouter();
  const visible = ref(true);
</script>

<style scoped>
  .weekly-report-harness {
    min-height: 100vh;
    padding: var(--ui-space-12, 12px);
    background: var(--workspace-canvas);
  }
  .weekly-report-harness-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-12, 12px);
    color: var(--desc-color);
  }
  .weekly-report-harness.is-integration {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100vh;
    min-height: 0;
    overflow: hidden;
  }
  .is-integration .weekly-report-harness-nav {
    flex: 0 0 auto;
  }
  .is-integration > :deep(.growth-page),
  .is-integration > :deep(.nt-page) {
    flex: 1 1 auto;
    height: 0;
    min-height: 0;
  }
</style>
