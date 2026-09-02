<template>
  <Settings v-if="view === 'settings'" :data-state="visualState" />
  <main v-else-if="view === 'summary'" class="ai-quota-summary-harness">
    <AiQuotaSummary layout="tile" entry-source="桌面个人中心" />
  </main>
  <AiUsagePage v-else :data-state="visualState" />
</template>

<script setup lang="ts">
  import AiQuotaSummary from '@/components/aiSkills/AiQuotaSummary.vue';
  import AiUsagePage from '@/view/aiUsage/AiUsagePage.vue';
  import Settings from '@/view/settings/Settings.vue';

  defineProps<{ visualState: string; view: 'usage' | 'settings' | 'summary' }>();
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
    height: 100%;
    min-height: 100%;
    margin: 0;
  }

  body {
    display: block;
    overflow: hidden;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .ai-quota-summary-harness {
    width: min(320px, calc(100vw - 32px));
    margin: 24px auto;
  }
</style>
