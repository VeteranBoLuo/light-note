<template>
  <main class="support-campaigns-harness" :data-visual-state="visualState">
    <SupportCampaignManagement />
  </main>
</template>

<script setup lang="ts">
  import SupportCampaignManagement from '@/view/admin/components/supportManagement/SupportCampaignManagement.vue';

  defineProps<{ visualState: string }>();
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

  body {
    display: block;
    overflow: auto;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .support-campaigns-harness {
    width: min(1120px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px 24px 72px;
  }

  @media (max-width: 600px) {
    .support-campaigns-harness {
      padding: 18px 12px 48px;
    }
  }
</style>
