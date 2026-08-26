<template>
  <main class="points-governance-harness">
    <header>
      <span>Points governance / visual QA</span>
      <h1>每日产出、消耗与净发行</h1>
      <p>本地隔离视觉夹具，用于核对正负趋势、精确读数与异常状态，不连接后端或改变积分。</p>
    </header>

    <section class="points-governance-harness__surface">
      <PointsGovernanceOverview ref="overview" />
    </section>
  </main>
</template>

<script setup lang="ts">
  import { nextTick, onMounted, ref } from 'vue';
  import PointsGovernanceOverview from '@/view/admin/components/pointsOps/PointsGovernanceOverview.vue';

  const props = withDefaults(defineProps<{ autoRefreshFailure?: boolean }>(), { autoRefreshFailure: false });
  const overview = ref<{ reload: () => Promise<void> }>();

  onMounted(async () => {
    if (!props.autoRefreshFailure) return;
    await nextTick();
    window.setTimeout(() => void overview.value?.reload(), 120);
  });
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  html,
  body {
    overflow: auto;
  }

  body {
    display: block;
    color: var(--text-color);
    background: var(--background-color);
    font-family: var(--app-font-family);
  }

  .points-governance-harness {
    display: grid;
    width: min(1120px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px 24px 72px;
    gap: 22px;
  }

  .points-governance-harness > header,
  .points-governance-harness__surface {
    padding: 22px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .points-governance-harness h1 {
    margin: 8px 0;
    font-size: clamp(24px, 4vw, 36px);
  }

  .points-governance-harness p,
  .points-governance-harness header > span {
    color: var(--desc-color);
  }

  @media (max-width: 600px) {
    .points-governance-harness {
      padding: 18px 12px 48px;
      gap: 18px;
    }

    .points-governance-harness > header,
    .points-governance-harness__surface {
      padding: 16px;
    }
  }
</style>
