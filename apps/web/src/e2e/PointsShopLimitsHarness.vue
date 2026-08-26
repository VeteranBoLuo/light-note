<template>
  <main class="points-shop-limits-harness">
    <header>
      <span>Points economy C5 / visual QA</span>
      <h1>积分商店限兑状态</h1>
      <p>本地隔离视觉夹具，用于核对可兑换、已兑换、积分不足、加载和错误状态，不连接后端或改变资产。</p>
    </header>

    <section class="points-shop-limits-harness__surface">
      <PointsShop />
    </section>
  </main>
</template>

<script setup lang="ts">
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
