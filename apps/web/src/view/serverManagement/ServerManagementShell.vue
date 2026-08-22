<template>
  <main class="infra-shell">
    <aside class="infra-shell__sidebar" :aria-label="t('serverManagement.navigationLabel')">
      <div class="infra-shell__brand">
        <span><SvgIcon :src="icon.infrastructure.server" size="22" aria-hidden="true" /></span>
        <div>
          <strong>{{ t('serverManagement.title') }}</strong>
          <small>{{ t('serverManagement.localHost') }}</small>
        </div>
      </div>
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
      <p class="infra-shell__boundary">{{ t('serverManagement.readOnlyBoundary') }}</p>
    </aside>

    <section class="infra-shell__workspace">
      <BTabs
        class="infra-shell__mobile-tabs"
        variant="segment"
        :options="mobileTabOptions"
        :active-tab="activeKey"
        @change="go"
      />
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
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';

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
  const mobileTabOptions = computed(() => navItems.value.map((item) => ({ key: item.key, label: item.label })));

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
    grid-template-columns: 216px minmax(0, 1fr);
    overflow: hidden;
    background: var(--background-color);
    color: var(--text-color);
  }
  .infra-shell__sidebar {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px 16px 18px;
    overflow-y: auto;
    border-right: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .infra-shell__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 8px;
  }
  .infra-shell__brand > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--primary-color);
  }
  .infra-shell__brand div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .infra-shell__brand strong {
    font-size: 15px;
  }
  .infra-shell__brand small,
  .infra-shell__boundary {
    color: var(--desc-color);
    font-size: 11px;
  }
  .infra-shell__nav {
    display: grid;
    gap: 6px;
  }
  .infra-shell__nav-item {
    width: 100%;
    min-height: 42px;
    justify-content: flex-start;
    gap: 10px;
    border-color: transparent;
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
  .infra-shell__boundary {
    margin: auto 8px 0;
    line-height: 1.65;
  }
  .infra-shell__workspace {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .infra-shell__mobile-tabs {
    display: none;
  }
  @media (max-width: 760px) {
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
    .infra-shell__mobile-tabs {
      display: flex;
      flex: 0 0 auto;
      margin: 8px 12px 0;
      overflow-x: auto;
    }
    .infra-shell__workspace :deep(.server-management-page),
    .infra-shell__workspace :deep(.infra-module-page) {
      flex: 1;
      min-height: 0;
    }
  }
</style>
