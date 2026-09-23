<template>
  <span v-if="failed" class="settings-save-error" role="alert">
    <SvgIcon :src="icon.message.warning" size="13" aria-hidden="true" />
    {{ t('settingsRefine.save.failed') }}
    <BButton size="small" @click="retrySave">{{ t('common.retry') }}</BButton>
  </span>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { usePreferenceSaveState } from '@/utils/savePreference';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const props = defineProps<{ keys: string[] }>();
  const { t } = useI18n();
  const { states, retry } = usePreferenceSaveState();
  const failed = computed(() => props.keys.find((key) => states[key]?.phase === 'failed'));
  const retrySave = () => {
    if (failed.value) void retry(failed.value).catch(() => {});
  };
</script>
<style scoped>
  .settings-save-error {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-5, 5px);
    font-size: var(--ui-font-12, 12px);
    color: var(--error-color);
    line-height: 1.5;
    margin-top: var(--ui-space-6, 6px);
  }
</style>
