<template>
  <BButton
    class="points-balance-summary"
    :class="[`is-${layout}`, { 'is-loading': loading, 'is-unavailable': unavailable }]"
    :aria-label="accessibleLabel"
    :aria-busy="loading"
    :title="accessibleLabel"
    v-click-log="{
      module: '积分明细',
      operation: `打开页面【${entrySource}】`,
    }"
    @click="emit('open-details')"
  >
    <span class="points-balance-summary__icon" aria-hidden="true">
      <SvgIcon :src="icon.growth.coin" size="17" />
    </span>
    <span class="points-balance-summary__body">
      <span class="points-balance-summary__copy">
        <span>{{ t('personCenter.points') }}</span>
        <strong>{{ balanceText }}</strong>
        <small v-if="!loading && !unavailable">{{ t('personCenter.pointsDetailHint') }}</small>
      </span>
    </span>
    <SvgIcon class="points-balance-summary__arrow" :src="icon.arrow_right" size="15" aria-hidden="true" />
  </BButton>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      points?: number | null;
      loading?: boolean;
      layout?: 'row' | 'tile';
      entrySource: '桌面个人中心' | '移动个人中心';
    }>(),
    {
      points: null,
      loading: false,
      layout: 'tile',
    },
  );

  const emit = defineEmits<{
    'open-details': [];
  }>();
  const { t, locale } = useI18n();
  const unavailable = computed(() => props.points == null || !Number.isFinite(Number(props.points)));
  const balanceText = computed(() => {
    if (props.loading && props.points == null) return t('personCenter.pointsLoading');
    if (unavailable.value) return t('personCenter.pointsUnavailable');
    return Number(props.points).toLocaleString(locale.value);
  });
  const accessibleLabel = computed(() => `${t('personCenter.points')}，${balanceText.value}`);
</script>

<style scoped lang="less">
  .points-balance-summary.b_btn {
    position: relative;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 68px;
    display: flex;
    justify-content: flex-start;
    gap: 9px;
    padding: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
    line-height: 1.25;
    text-align: left;
    white-space: normal;
  }

  .points-balance-summary__icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #b45309;
    background: #fff7e6;
  }

  .points-balance-summary__copy {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding-right: 13px;
  }

  .points-balance-summary__body {
    min-width: 0;
    flex: 1 1 auto;
  }

  .points-balance-summary__copy span {
    color: var(--desc-color);
    font-size: 10px;
  }

  .points-balance-summary__copy strong {
    max-width: 100%;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .points-balance-summary__copy small {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.2;
  }

  .points-balance-summary__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .points-balance-summary.is-tile .points-balance-summary__arrow {
    position: absolute;
    top: 8px;
    right: 7px;
  }

  .points-balance-summary.is-loading .points-balance-summary__copy strong,
  .points-balance-summary.is-unavailable .points-balance-summary__copy strong {
    color: var(--desc-color);
    font-weight: 500;
  }

  .points-balance-summary.is-loading .points-balance-summary__icon,
  .points-balance-summary.is-unavailable .points-balance-summary__icon {
    color: var(--desc-color);
    background: var(--surface-divider-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .points-balance-summary.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--menu-item-h-bg-color);
    }
  }

  .points-balance-summary.b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--menu-item-h-bg-color);
  }

  [data-theme='night'] .points-balance-summary__icon {
    color: #f3b44f;
    background: rgba(180, 83, 9, 0.18);
  }

  html.light-note-mobile-rendering .points-balance-summary__icon {
    box-shadow: none;
  }
</style>
