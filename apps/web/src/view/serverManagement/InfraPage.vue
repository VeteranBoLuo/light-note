<template>
  <section class="infra-page">
    <div class="infra-page__header"><slot name="header" /></div>
    <nav v-if="bookmark.isMobile" class="infra-page__tabs" :aria-label="t('serverManagement.navigationLabel')">
      <BButton
        v-for="key in modules"
        :key="key"
        :class="{ 'is-active': route.meta.infraModule === key }"
        :aria-current="route.meta.infraModule === key ? 'page' : undefined"
        @click="router.push(`/serverManagement/${key}`)"
      >
        {{ t(`serverManagement.workspace.tabs.${key}`) }}
      </BButton>
    </nav>
    <main ref="scrollRef" class="infra-page__body"><slot /></main>
  </section>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const modules = ['overview', 'diagnostics', 'services', 'security', 'storage', 'events'];
  const scrollRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(scrollRef);
  useMobileTopBar(
    modules.map((key) => `serverManagement-${key}`),
    { ownTopBar: true, onBack: () => void router.push('/personCenter') },
  );
</script>
<style scoped lang="less">
  .infra-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--background-color);
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .infra-page__header {
    padding: var(--ui-space-28, 28px) var(--ui-space-24, 24px) var(--ui-space-20, 20px);
    flex: 0 0 auto;
  }
  .infra-page__body {
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--ui-space-24, 24px) var(--ui-space-32, 32px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-18, 18px);
  }
  .infra-page__body > :deep(*) {
    flex-shrink: 0;
    min-width: 0;
  }
  .infra-page__tabs {
    overflow-x: auto;
    display: flex;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--surface-divider-color);
    padding: 0 var(--ui-space-12, 12px);
  }
  .infra-page__tabs :deep(button) {
    flex: 1 0 auto;
    min-width: 0;
    padding: var(--ui-space-10, 10px) var(--ui-space-4, 4px);
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--desc-color);
  }
  .infra-page__tabs :deep(.is-active) {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
    font-weight: 600;
  }
  @media (max-width: 767px) {
    .infra-page__header {
      padding: var(--ui-space-12, 12px);
    }
    .infra-page__body {
      padding: var(--ui-space-16, 16px) var(--ui-space-12, 12px) var(--ui-space-24, 24px);
      gap: var(--ui-space-14, 14px);
    }
  }
</style>
