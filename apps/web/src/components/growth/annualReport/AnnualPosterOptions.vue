<template>
  <div class="ar-poster-options" :class="{ 'is-dark': dark }">
    <div class="arpo-row">
      <span class="arpo-text">
        {{ t('annualReport.share.showName') }}
        <small>{{ t('annualReport.share.showNameHint', { year }) }}</small>
      </span>
      <BSwitch v-model:checked="showName" :aria-label="t('annualReport.share.showName')" />
    </div>
    <div v-if="!light" class="arpo-row">
      <span class="arpo-text">
        {{ t('annualReport.share.showKeywords') }}
        <small>{{ t('annualReport.share.showKeywordsHint') }}</small>
      </span>
      <BSwitch v-model:checked="showKeywords" :aria-label="t('annualReport.share.showKeywords')" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';

  defineProps<{ year: number; light: boolean; dark?: boolean }>();
  const showName = defineModel<boolean>('showName', { required: true });
  const showKeywords = defineModel<boolean>('showKeywords', { required: true });
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .arpo-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) 0;
  }
  .arpo-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .arpo-text small {
    margin-top: var(--ui-space-2, 2px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  /* 移动端最后一页压在固定深色背景上，文字固定为浅色。 */
  .is-dark {
    color: #fff;
  }
  .is-dark .arpo-row + .arpo-row {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .is-dark .arpo-text small {
    color: rgba(255, 255, 255, 0.6);
  }
</style>
