<template>
  <div class="security-v2-shell">
    <aside class="security-v2-side">
      <h1>{{ t('securityV2.title') }}</h1>
      <div class="security-v2-scope-mini">
        <span v-for="line in scopeLines" :key="line">{{ line }}</span>
      </div>
      <BButton
        v-for="tab in tabs"
        :key="tab.key"
        class="security-v2-side-tab"
        :class="{ 'is-active': activeKey === tab.key }"
        @click="router.push({ name: tab.routeName })"
      >
        <span>{{ tab.label }}</span>
        <small v-if="tab.key === 'review' && pendingCount">{{ pendingCount }}</small>
      </BButton>
    </aside>
    <main class="security-v2-main">
      <RouterView @pending-count="pendingCount = $event" />
    </main>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { securityCenterMessages } from './securityCenterI18n';

  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const route = useRoute();
  const router = useRouter();
  const pendingCount = ref(0);
  const tabs = computed(() => [
    { key: 'overview', routeName: 'securityCenterOverview', label: t('securityV2.nav.overview') },
    { key: 'review', routeName: 'securityCenterReview', label: t('securityV2.nav.review') },
    { key: 'quality', routeName: 'securityCenterQuality', label: t('securityV2.nav.quality') },
    { key: 'access', routeName: 'securityCenterAccess', label: t('securityV2.nav.access') },
  ]);
  const activeKey = computed(() => String(route.meta.securitySection || 'overview'));
  const scopeLines = computed(() => String(t('securityV2.scopeMini')).split('\n'));
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
