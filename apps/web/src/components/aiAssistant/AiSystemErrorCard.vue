<template>
  <BCard class="ai-system-error" variant="panel" padding="12px" role="alert">
    <span class="ai-system-error__icon" :class="`is-${presentation.kind}`" aria-hidden="true">
      <SvgIcon :src="icon.message.error" size="18" />
    </span>
    <span class="ai-system-error__copy">
      <strong>{{ t(presentation.titleKey) }}</strong>
      <span>{{ t(presentation.descriptionKey) }}</span>
      <small>{{ t('ai.systemError.reference', { code: presentation.referenceCode }) }}</small>
    </span>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resolveAiSystemError } from './aiSystemError';

  const props = defineProps<{ code?: string | null }>();
  const { t } = useI18n();
  const presentation = computed(() => resolveAiSystemError(props.code));
</script>

<style scoped lang="less">
  .ai-system-error {
    --b-card-border-color: color-mix(in srgb, var(--message-error-color) 25%, var(--surface-border-color));
    --b-card-background: color-mix(in srgb, var(--message-error-color) 5%, var(--workspace-panel-bg-color));

    display: flex;
    max-width: min(620px, 100%);
    gap: 10px;
    align-items: flex-start;
  }
  .ai-system-error__icon {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--message-error-color);
    background: color-mix(in srgb, var(--message-error-color) 12%, transparent);
  }
  .ai-system-error__copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.5;
  }
  .ai-system-error__copy > span,
  .ai-system-error__copy small {
    color: var(--desc-color);
  }
  .ai-system-error__copy small {
    font-size: 11px;
  }
</style>
