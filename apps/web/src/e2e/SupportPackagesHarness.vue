<template>
  <EntitlementStore v-if="route.path === '/store'" :data-visual-state="visualState" />
  <SupportUs v-else-if="route.path === '/support'" />
  <CampaignPage v-else-if="route.path.startsWith('/campaign/')" />
  <CampaignShowcase v-else-if="route.path === '/draft'" draft />
  <main v-else style="padding: 24px">原书签任务 · 视觉验收</main>
  <EntitlementReturnHost />
</template>

<script setup lang="ts">
  import SupportUs from '@/view/support/SupportUs.vue';
  import CampaignPage from '@/view/campaign/CampaignPage.vue';
  import CampaignShowcase from '@/components/support/CampaignShowcase.vue';
  import EntitlementStore from '@/view/entitlementStore/EntitlementStore.vue';
  import EntitlementReturnHost from '@/components/support/EntitlementReturnHost.vue';
  import { useRoute } from 'vue-router';
  const route = useRoute();

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
</style>
