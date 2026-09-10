<template>
  <div class="push-facts" :class="{ 'push-facts--stacked': stacked }">
    <div
      ><span>{{ t('settingsRefine.push.permission') }}</span
      ><strong>{{
        t(`settingsRefine.push.${diagnostics.stale ? 'unknown' : diagnostics.permission || 'unknown'}`)
      }}</strong></div
    >
    <div
      ><span>{{ t('settingsRefine.push.subscription') }}</span
      ><strong>{{ t(`settingsRefine.push.${connection}`) }}</strong></div
    >
    <div
      ><span>{{ t('settingsRefine.push.system') }}</span
      ><strong>{{ t('settingsRefine.push.systemUnknown') }}</strong></div
    >
  </div>
  <p v-if="diagnostics.stale && diagnostics.checkedAt" class="push-facts-time">{{
    t('settingsRefine.push.lastChecked', { time: new Date(diagnostics.checkedAt).toLocaleTimeString(locale) })
  }}</p>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  defineProps<{ stacked?: boolean }>();
  const { t, locale } = useI18n();
  const { diagnostics } = useBrowserPush();
  const connection = computed(() =>
    diagnostics.value.stale || diagnostics.value.subscription === null || diagnostics.value.bindingActive === null
      ? 'unknown'
      : diagnostics.value.invalid
        ? 'invalid'
        : diagnostics.value.subscription === 'present' && diagnostics.value.bindingActive
          ? 'present'
          : 'absent',
  );
</script>
<style scoped>
  .push-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    padding: 16px 0;
  }
  .push-facts > div {
    display: grid;
    gap: 6px;
    border-left: 1px solid var(--surface-divider-color, var(--border-color));
    padding-left: 16px;
  }
  .push-facts > div:first-child {
    border: 0;
    padding-left: 0;
  }
  .push-facts span,
  .push-facts-time {
    font-size: 12px;
    color: var(--desc-color);
  }
  .push-facts strong {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color);
  }
  .push-facts--stacked {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0;
  }
  .push-facts--stacked > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    padding: 10px 0;
    border: 0;
  }
  .push-facts--stacked > div + div {
    border-top: 1px solid var(--surface-divider-color, var(--border-color));
  }
  .push-facts--stacked strong {
    text-align: right;
    flex-shrink: 0;
  }
</style>
