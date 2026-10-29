<template>
  <main class="infra-shell">
    <aside class="infra-shell__sidebar" :aria-label="t('serverManagement.navigationLabel')">
      <div class="infra-shell__brand"
        ><strong>{{ t('serverManagement.title') }}</strong></div
      >
      <nav class="infra-shell__nav">
        <BButton
          v-for="item in navItems"
          :key="item.key"
          class="infra-shell__nav-item"
          :class="{ 'is-active': activeKey === item.key }"
          :aria-current="activeKey === item.key ? 'page' : undefined"
          @click="go(item.key)"
        >
          <SvgIcon :src="item.icon" size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </BButton>
      </nav>
    </aside>

    <section class="infra-shell__workspace">
      <router-view />
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  type ModuleKey = 'overview' | 'diagnostics' | 'services' | 'security' | 'storage' | 'events';
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const navItems = computed(() => [
    { key: 'overview' as const, label: t('serverManagement.modules.overview'), icon: icon.infrastructure.overview },
    {
      key: 'diagnostics' as const,
      label: t('serverManagement.modules.diagnostics'),
      icon: icon.infrastructure.diagnostics,
    },
    { key: 'services' as const, label: t('serverManagement.modules.services'), icon: icon.infrastructure.service },
    { key: 'security' as const, label: t('serverManagement.modules.security'), icon: icon.infrastructure.security },
    { key: 'storage' as const, label: t('serverManagement.modules.storage'), icon: icon.infrastructure.storage },
    { key: 'events' as const, label: t('serverManagement.modules.events'), icon: icon.infrastructure.events },
  ]);
  const activeKey = computed<ModuleKey>(() => {
    const value = String(route.meta.infraModule || 'overview');
    return navItems.value.some((item) => item.key === value) ? (value as ModuleKey) : 'overview';
  });

  function go(key: string) {
    if (key === activeKey.value) return;
    void router.push(`/serverManagement/${key}`);
  }
</script>

<style scoped lang="less">
  .infra-shell {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--ui-layout-216, 216px) minmax(0, 1fr);
    overflow: hidden;
    background: var(--background-color);
    color: var(--text-color);
    font-size: var(--ui-font-16, 16px);
  }
  .infra-shell__sidebar {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-18, 18px);
    padding: var(--ui-space-24, 24px) var(--ui-space-16, 16px) var(--ui-space-18, 18px);
    overflow-y: auto;
    border-right: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .infra-shell__brand {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: 0 var(--ui-space-8, 8px) var(--ui-space-8, 8px);
  }
  .infra-shell__brand strong {
    font-size: var(--ui-font-15, 15px);
  }
  .infra-shell__nav {
    display: grid;
    gap: var(--ui-space-6, 6px);
  }
  .infra-shell__nav-item {
    width: 100%;
    min-height: var(--ui-control-42, 42px);
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
  }
  .infra-shell__nav-item:hover,
  .infra-shell__nav-item:focus-visible {
    border-color: var(--surface-border-color);
    color: var(--text-color);
    background: var(--hover-background);
  }
  .infra-shell__nav-item.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--hover-background);
    font-weight: 600;
  }
  .infra-shell__workspace {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  @media (max-width: 767px) {
    .infra-shell {
      display: flex;
      flex-direction: column;
    }
    .infra-shell__sidebar {
      display: none;
    }
    .infra-shell__workspace {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
  }
</style>
