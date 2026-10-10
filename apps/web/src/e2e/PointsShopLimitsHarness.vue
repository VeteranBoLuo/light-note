<template>
  <main class="points-shop-limits-harness">
    <header>
      <span>Points economy C7 / visual QA</span>
      <h1>补签卡与积分商店状态</h1>
      <p>本地隔离视觉夹具，用于核对可兑换、已兑换、积分不足、加载和错误状态，不连接后端或改变资产。</p>
    </header>

    <section class="points-shop-limits-harness__surface">
      <GrowthCard :read-only="true" :show-calendar="false" />
      <MilestoneLadder :current-streak="67" :milestones="milestones" />
      <PointsShop :read-only="readOnly" />
    </section>
  </main>
</template>

<script setup lang="ts">
  import GrowthCard from '@/components/growth/GrowthCard.vue';
  import MilestoneLadder from '@/components/growth/MilestoneLadder.vue';
  const readOnly = new URLSearchParams(location.search).get('state') === 'readonly';
  const milestones = [
    { days: 7, points: 50, cards: 1, storageMb: 0, reached: true },
    { days: 30, points: 300, cards: 1, storageMb: 512, reached: true },
    { days: 100, points: 600, cards: 0, storageMb: 1024, reached: false },
    { days: 365, points: 2000, cards: 0, storageMb: 2048, reached: false },
  ];
  import PointsShop from '@/components/growth/PointsShop.vue';
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
    height: auto;
    margin: 0;
  }

  html,
  body {
    overflow: auto;
  }

  body {
    display: block;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .points-shop-limits-harness {
    display: grid;
    width: min(1080px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px 24px 72px;
    gap: 22px;
  }

  .points-shop-limits-harness > header,
  .points-shop-limits-harness__surface {
    padding: 22px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .points-shop-limits-harness__surface {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
  }

  .points-shop-limits-harness h1 {
    margin: 8px 0;
    font-size: clamp(24px, 4vw, 36px);
  }

  .points-shop-limits-harness p,
  .points-shop-limits-harness header > span {
    color: var(--desc-color);
  }

  @media (max-width: 600px) {
    .points-shop-limits-harness {
      padding: 18px 12px 48px;
      gap: 18px;
    }

    .points-shop-limits-harness > header,
    .points-shop-limits-harness__surface {
      padding: 16px;
    }
  }
</style>
