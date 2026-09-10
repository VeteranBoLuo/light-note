<template>
  <section class="quota-value scene-panel">
    <div class="quota-value__copy"
      ><span>{{ t('autumn.reference.credits') }}</span
      ><h2>{{ t('autumn.valueTitle') }}</h2
      ><p>{{ t('autumn.valueDescription') }}</p></div
    >
    <div class="quota-compare"
      ><section
        v-for="side in ['token', 'credit']"
        :key="side"
        :class="['quota-compare__side', { 'is-selected': side === 'credit' }]"
        ><h3
          ><SvgIcon :src="side === 'token' ? icon.growth.ai : icon.settings.privacy" size="21" />{{
            t(`autumn.reference.${side === 'token' ? 'tokens' : 'credits'}`)
          }}</h3
        ><p v-for="i in 3" :key="i"
          ><span aria-hidden="true">{{ side === 'token' ? '·' : '✓' }}</span
          >{{ t(`autumn.reference.${side}${i}`) }}</p
        ></section
      ><span class="quota-compare__versus" aria-hidden="true">VS</span></div
    >
    <p class="quota-value__note" aria-hidden="true">{{ t('autumn.reference.note') }}<br />— 轻笺</p>
  </section>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const { t } = useI18n();
</script>
<style scoped>
  .quota-value {
    display: grid;
    grid-template-columns: 1.15fr 1fr 0.22fr;
    gap: 18px;
    align-items: center;
    padding: 14px 18px;
  }
  .quota-value__copy > span {
    font-size: 12px;
    color: var(--primary-color);
    font-weight: 600;
  }
  h2 {
    font:
      700 25px/1.35 'Songti SC',
      serif;
    margin: 5px 0 7px;
  }
  p {
    font-size: 14px;
    line-height: 1.65;
    color: var(--desc-color);
    margin: 0;
  }
  .quota-compare {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .quota-compare__side {
    border: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg);
    border-radius: 10px;
    padding: 12px;
    min-width: 0;
  }
  .quota-compare__side.is-selected {
    border-color: var(--primary-color);
    background: var(--card-background);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    margin: 0 0 8px;
  }
  .quota-compare__side p {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 12px;
    line-height: 1.6;
    margin-top: 5px;
  }
  .quota-compare__side p > span {
    flex-shrink: 0;
    color: var(--primary-color);
  }
  .is-selected h3 {
    color: var(--primary-color);
  }
  .quota-compare__versus {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    background: var(--card-background);
    color: var(--primary-color);
    font-weight: 700;
  }
  .quota-value__note {
    white-space: pre-line;
    font:
      italic 13px/1.9 'Songti SC',
      serif;
    color: var(--primary-color);
    transform: rotate(-7deg);
    text-align: center;
  }
  .is-compact .quota-value {
    grid-template-columns: 1fr 1fr;
  }
  .is-compact .quota-value__note {
    display: none;
  }
  .is-mobile .quota-value {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 15px;
  }
</style>
