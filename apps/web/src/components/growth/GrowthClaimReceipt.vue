<template>
  <div
    :key="receipt.id"
    class="claim-receipt"
    :class="{ 'claim-receipt--block': block }"
    role="status"
    :title="description"
  >
    <span class="claim-receipt__icon" aria-hidden="true"><SvgIcon :src="icon.message.success" size="16" /></span>
    <!-- 只展示实际到账的奖励；来源与条数放在悬停说明和读屏文字里，避免与按钮行抢位置。 -->
    <span v-if="!receipt.rewards.length" class="claim-receipt__summary">{{ receipt.summary }}</span>
    <span v-else class="claim-receipt__sr">{{ description }}</span>
    <span v-if="receipt.rewards.length" class="claim-receipt__rewards">
      <span
        v-for="reward in receipt.rewards"
        :key="reward.kind"
        class="claim-receipt__reward"
        :class="`is-${reward.kind}`"
      >
        <SvgIcon :src="REWARD_ICONS[reward.kind]" size="13" />{{ reward.label }}
      </span>
    </span>
    <BButton
      type="text"
      icon-only
      size="small"
      class="claim-receipt__close"
      :aria-label="t('common.close')"
      @click="$emit('dismiss')"
    >
      <SvgIcon :src="icon.common.close" size="12" />
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { ClaimReceiptState, GrowthClaimReceipt } from '@/composables/useGrowthClaimFeedback';

  /**
   * 成长奖励领取回执：在触发领取的卡片里原位展示结果，替代多行全局提示。
   * 语义色只用于图标，正文保持常规层级；来源与条数放在 title 与读屏文字中。
   */
  const props = withDefaults(defineProps<{ receipt: ClaimReceiptState; block?: boolean }>(), { block: false });
  defineEmits<{ dismiss: [] }>();
  const { t } = useI18n();
  const description = computed(() =>
    props.receipt.single || !props.receipt.sources
      ? props.receipt.summary
      : t('growth.claimAllSuccessBySource', { sources: props.receipt.sources }),
  );

  const REWARD_ICONS: Record<GrowthClaimReceipt['rewards'][number]['kind'], string> = {
    exp: icon.growth.level,
    points: icon.growth.coin,
    frames: icon.growth.crown,
  };
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .claim-receipt {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: .ui-space(6px) [] .ui-space(8px) [];
    min-width: 0;
    color: var(--text-color);
    font-size: .ui-font(13px) [];
    animation: claim-receipt-in 0.25s ease;
  }
  .claim-receipt__icon {
    display: grid;
    color: var(--success-color);
  }
  .claim-receipt__summary {
    font-weight: 600;
    white-space: nowrap;
  }
  .claim-receipt__sr {
    position: absolute;
    /* ui-density-fixed: 仅供读屏的隐藏文字，1px 裁剪框不参与界面密度 */
    width: 1px;
    /* ui-density-fixed: 仅供读屏的隐藏文字，1px 裁剪框不参与界面密度 */
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .claim-receipt__rewards {
    display: inline-flex;
    flex-wrap: wrap;
    gap: .ui-space(6px) [];
  }
  .claim-receipt__reward {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(4px) [];
    padding: .ui-space(2px) [] .ui-space(8px) [];
    border: 1px solid var(--surface-divider-color);
    border-radius: 999px;
    background: var(--surface-panel-bg);
    color: var(--text-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
    white-space: nowrap;
  }
  .claim-receipt__reward.is-points > :first-child {
    color: var(--warning-color);
  }
  .claim-receipt__reward.is-exp > :first-child,
  .claim-receipt__reward.is-frames > :first-child {
    color: var(--primary-color);
  }
  .claim-receipt__close.b_btn {
    width: .ui-control(24px) [];
    height: .ui-control(24px) [];
    color: var(--desc-color);
  }
  .claim-receipt--block {
    display: flex;
    width: 100%;
    padding: .ui-space(10px) [] .ui-space(4px) [] 0;
    border-top: 1px solid var(--surface-divider-color);
  }
  .claim-receipt--block .claim-receipt__close.b_btn {
    margin-left: auto;
  }
  @keyframes claim-receipt-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .claim-receipt {
      animation: none;
    }
  }
</style>
