<template>
  <div
    class="lt-stage lr-stage"
    :class="{
      'is-charging': phase === 'charging',
      'is-revealing': phase === 'revealing',
      'is-result': phase === 'result',
      'is-narrow': narrow,
      'is-reduced': motionReduced,
    }"
    :style="timingStyle"
  >
    <div v-if="showResults" class="lr-result" aria-live="polite">
      <div class="lr-result-heading">
        <SvgIcon v-if="phase === 'result'" class="lr-delivered-icon" :src="icon.growth.action" :size="18" />
        <span>{{
          t(phase === 'result' ? 'growth.lotteryResultsReceived' : 'growth.lotteryResultsRevealing', {
            n: results.length,
          })
        }}</span>
      </div>
      <div
        class="lr-prizes"
        :class="{ 'is-single': results.length === 1, 'is-ten': results.length === 10 }"
        role="list"
      >
        <div
          v-for="(prize, index) in results"
          :key="index"
          class="lr-prize"
          :class="{ 'is-rare': prize.rare, 'is-guaranteed': prize.guaranteed }"
          :style="{ '--lr-delay': `${index * LOTTERY_STAGGER_MS}ms` }"
          role="listitem"
          :aria-label="prizeLabel(prize, t, locale)"
        >
          <span class="lr-rarity">{{
            prize.guaranteed ? t('growth.lotteryPityHitBadge') : prize.rare ? t('growth.lotteryRare') : ''
          }}</span>
          <SvgIcon :src="prizeIcon(prize)" :size="results.length === 1 ? 44 : 24" aria-hidden="true" />
          <strong>{{ prizeValue(prize, locale) }}</strong>
          <span class="lr-kind">{{ prizeKindLabel(prize, t) }}</span>
          <small v-if="prize.compensated">{{ t('growth.lotteryOverflowCompensated', { n: prize.amount }) }}</small>
        </div>
      </div>
      <p class="lr-delivery" :class="{ 'is-concealed': phase !== 'result' }">{{ delivery }}</p>
      <div class="lr-followup">
        <BButton v-if="phase === 'result'" type="text" @click="emit('backpack')">
          {{ t('growth.lotteryViewBackpack') }}<SvgIcon :src="icon.arrow_right" :size="15" />
        </BButton>
      </div>
    </div>
    <div v-else class="lr-idle">
      <div v-if="phase !== 'uncertain'" class="lr-art" aria-hidden="true">
        <span class="lr-halo"></span><span class="lr-rays"></span><span class="lr-orbit"></span>
        <img :src="gift" class="lr-gift" alt="" width="160" height="160" />
      </div>
      <SvgIcon v-else class="lr-uncertain-icon" :src="icon.message.info" :size="40" aria-hidden="true" />
      <h3>{{ title }}</h3>
      <p>{{ hint }}</p>
      <BLoading v-if="phase === 'waiting'" inline loading />
      <div v-if="phase === 'uncertain'" class="lr-uncertain-actions">
        <BButton v-if="retryAllowed" @click="emit('retry')">{{ t('growth.lotteryRetryResult') }}</BButton>
        <BButton type="text" @click="emit('history')">{{ t('growth.lotteryHistoryTitle') }}</BButton>
      </div>
    </div>
    <template v-if="phase === 'revealing' && !motionReduced">
      <span
        v-for="index in 12"
        :key="index"
        class="lr-spark"
        :style="{ '--lr-angle': `${index * 30}deg` }"
        aria-hidden="true"
      ></span>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LotteryPrize } from '@/composables/useGrowth';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import gift from '@/assets/images/growth/lottery-gift.png';
  import { prizeIcon, prizeKindLabel, prizeLabel, prizeValue } from '@/utils/lotteryPresentation';
  import { LOTTERY_CARD_MS, LOTTERY_CHARGE_MS, LOTTERY_STAGGER_MS, type LotteryRevealPhase } from './useLotteryReveal';

  const props = defineProps<{
    phase: LotteryRevealPhase;
    results: readonly LotteryPrize[];
    drawingTimes: number;
    motionReduced: boolean;
    narrow: boolean;
    idleTitle: string;
    idleHint: string;
    delivery: string;
    retryAllowed: boolean;
  }>();
  const emit = defineEmits<{ retry: []; history: []; backpack: [] }>();
  const { t, locale } = useI18n();
  const showResults = computed(() => props.results.length > 0 && ['revealing', 'result'].includes(props.phase));
  const timingStyle = { '--lr-charge': `${LOTTERY_CHARGE_MS}ms`, '--lr-card': `${LOTTERY_CARD_MS}ms` };
  const title = computed(() => {
    if (props.phase === 'charging')
      return t(props.drawingTimes === 10 ? 'growth.lotteryOpeningTen' : 'growth.lotteryOpening');
    if (props.phase === 'waiting') return t('growth.lotteryConfirming');
    if (props.phase === 'uncertain') return t('growth.lotteryResultUncertain');
    return props.idleTitle;
  });
  const hint = computed(() => {
    if (props.phase === 'charging') return t('growth.lotteryOpeningHint');
    if (props.phase === 'waiting') return t('growth.lotteryConfirmingHint');
    if (props.phase === 'uncertain')
      return t(props.retryAllowed ? 'growth.lotteryResultUncertainHint' : 'growth.lotteryResultMissingHint');
    return props.idleHint;
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .lr-stage {
    display: grid;
    align-items: center;
    flex: 1;
    min-height: .ui-layout(360px) [];
    min-width: 0;
    padding: .ui-space(20px) [] 0;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    text-align: center;
  }
  .lr-idle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .ui-space(8px) [];
  }
  .lr-idle h3 {
    margin: .ui-space(6px) [] 0 0;
    font-size: .ui-font(21px) [];
  }
  .lr-idle p {
    margin: 0;
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    line-height: 1.6;
  }
  .lr-art {
    width: .ui-layout(240px) [];
    height: .ui-layout(200px) [];
    position: relative;
    display: grid;
    place-items: center;
  }
  .lr-gift {
    width: .ui-layout(160px) [];
    height: .ui-layout(160px) [];
    position: relative;
    object-fit: contain;
    transform-origin: 50% 80%;
  }
  .lr-halo {
    position: absolute;
    width: 100%;
    height: 80%;
    border-radius: 50%;
    background: radial-gradient(ellipse, var(--primary-color), transparent 70%);
    opacity: 0.12;
    transform: translateY(12%);
  }
  .lr-orbit {
    position: absolute;
    width: 84%;
    height: 32%;
    border: 1px solid var(--primary-color);
    border-radius: 50%;
    transform: translateY(60%) rotate(-16deg);
    opacity: 0.2;
  }
  .lr-orbit::after {
    content: '';
    width: .ui-space(6px) [];
    height: .ui-space(6px) [];
    border-radius: 50%;
    background: var(--primary-color);
    position: absolute;
    left: 12%;
    top: 8%;
  }
  .lr-rays {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-conic-gradient(
      from 0deg,
      transparent 0deg 27deg,
      var(--primary-color) 29deg 36deg,
      transparent 39deg 60deg
    );
    mask-image: radial-gradient(circle, transparent 0 14%, #000 30%, transparent 70%);
    opacity: 0;
  }
  .is-charging .lr-gift {
    animation: lr-charge var(--lr-charge) cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .is-charging .lr-orbit {
    animation: lr-orbit var(--lr-charge) ease-out both;
  }
  .is-charging .lr-rays {
    animation: lr-rays var(--lr-charge) ease-out both;
  }
  .is-charging .lr-halo {
    animation: lr-halo var(--lr-charge) ease-out both;
  }
  .lr-result {
    min-width: 0;
    width: 100%;
    position: relative;
    z-index: 1;
  }
  .lr-result-heading {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: .ui-space(6px) [];
    min-height: .ui-layout(28px) [];
    margin-bottom: .ui-space(14px) [];
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .lr-result-heading .lr-delivered-icon {
    color: var(--success-color);
  }
  .lr-prizes {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: .ui-space(8px) [];
    perspective: .ui-layout(900px) [];
  }
  .lr-prize {
    display: flex;
    min-width: 0;
    min-height: .ui-layout(120px) [];
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: .ui-space(5px) [];
    padding: .ui-space(10px) [] .ui-space(4px) [];
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
    border-radius: 12px;
  }
  .lr-prize.is-rare {
    border-color: var(--primary-color);
    background: var(--workspace-content);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--workspace-content));
  }
  .lr-prize.is-guaranteed {
    border-color: var(--warning-color);
    background: var(--workspace-content);
    background: color-mix(in srgb, var(--warning-color) 6%, var(--workspace-content));
  }
  .lr-prize > :nth-child(2) {
    color: var(--primary-color);
    flex-shrink: 0;
    margin: .ui-space(4px) [] 0;
  }
  .lr-prize.is-guaranteed > :nth-child(2) {
    color: var(--warning-color);
  }
  .lr-prize strong {
    font-size: .ui-font(17px) [];
    line-height: 1.3;
    white-space: nowrap;
  }
  .lr-rarity {
    min-height: .ui-layout(16px) [];
    font-size: .ui-font(11px) [];
    color: var(--chip-pin-fg);
  }
  .is-guaranteed .lr-rarity {
    color: var(--warning-color);
  }
  .lr-kind,
  .lr-prize small {
    font-size: .ui-font(11px) [];
    color: var(--desc-color);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .lr-prizes.is-single {
    grid-template-columns: minmax(0, .ui-layout(220px) []);
    justify-content: center;
  }
  .is-single .lr-prize {
    min-height: .ui-layout(220px) [];
    padding: .ui-space(20px) [];
    gap: .ui-space(8px) [];
  }
  .is-single .lr-prize strong {
    font-size: .ui-font(32px) [];
  }
  .is-single .lr-kind,
  .is-single .lr-rarity {
    font-size: .ui-font(13px) [];
  }
  .lr-delivery {
    margin: .ui-space(16px) [] 0 .ui-space(4px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.6;
  }
  .is-concealed {
    visibility: hidden;
  }
  .lr-followup {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: .ui-control(32px) [];
  }
  .lr-followup .b_btn {
    gap: .ui-space(5px) [];
  }
  .lr-uncertain-icon {
    color: var(--warning-color);
    margin-bottom: .ui-space(16px) [];
  }
  .lr-uncertain-actions {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    flex-wrap: wrap;
    justify-content: center;
    margin-top: .ui-space(10px) [];
  }
  .is-revealing .lr-prize {
    animation: lr-card var(--lr-card) cubic-bezier(0.2, 0.8, 0.2, 1) var(--lr-delay) both;
  }
  .lr-spark {
    position: absolute;
    top: 45%;
    left: 50%;
    width: .ui-space(4px) [];
    height: .ui-space(4px) [];
    border-radius: 1px;
    background: var(--primary-color);
    pointer-events: none;
    opacity: 0;
    animation: lr-spark 0.8s ease-out both;
  }
  .is-narrow .lr-prizes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .is-narrow .lr-prizes.is-single {
    grid-template-columns: minmax(0, .ui-layout(220px) []);
  }
  .is-narrow .is-ten .lr-prize:last-child {
    grid-column: 2;
  }
  .is-narrow .lr-prize strong {
    font-size: .ui-font(15px) [];
  }
  .is-narrow .is-single .lr-prize strong {
    font-size: .ui-font(30px) [];
  }
  .is-narrow.lr-stage {
    min-height: .ui-layout(320px) [];
    padding: .ui-space(16px) [] 0;
  }
  @keyframes lr-charge {
    0% {
      transform: translateY(0) scale(1) rotate(0);
    }
    22% {
      transform: translateY(var(--ui-space-5, 5px)) scale(0.97) rotate(-3deg);
    }
    34% {
      transform: translateY(calc(var(--ui-space-8, 8px) * -1)) scale(1.02) rotate(3deg);
    }
    46% {
      transform: translateY(calc(var(--ui-space-14, 14px) * -1)) scale(1.04) rotate(-3deg);
    }
    58% {
      transform: translateY(calc(var(--ui-space-20, 20px) * -1)) scale(1.06) rotate(3deg);
    }
    72% {
      transform: translateY(calc(var(--ui-space-22, 22px) * -1)) scale(1.08) rotate(-1deg);
    }
    88% {
      transform: translateY(calc(var(--ui-space-24, 24px) * -1)) scale(1.14) rotate(0);
    }
    100% {
      transform: translateY(calc(var(--ui-space-18, 18px) * -1)) scale(1.08);
    }
  }
  @keyframes lr-orbit {
    0% {
      transform: translateY(60%) rotate(-16deg) scale(1);
      opacity: 0.15;
    }
    70% {
      transform: translateY(30%) rotate(344deg) scale(1.15);
      opacity: 0.4;
    }
    100% {
      transform: translateY(20%) rotate(410deg) scale(1.5);
      opacity: 0;
    }
  }
  @keyframes lr-rays {
    0% {
      opacity: 0;
      transform: scale(0.5) rotate(0);
    }
    75% {
      opacity: 0.12;
      transform: scale(1.1) rotate(30deg);
    }
    100% {
      opacity: 0;
      transform: scale(1.5) rotate(50deg);
    }
  }
  @keyframes lr-halo {
    0% {
      opacity: 0.05;
      transform: translateY(12%) scale(0.85);
    }
    85% {
      opacity: 0.18;
      transform: translateY(8%) scale(1.45);
    }
    100% {
      opacity: 0.1;
      transform: translateY(8%) scale(1.8);
    }
  }
  @keyframes lr-card {
    from {
      transform: translateY(var(--ui-space-16, 16px)) rotateY(-86deg) scale(0.94);
      opacity: 0;
    }
    to {
      transform: translateY(0) rotateY(0) scale(1);
      opacity: 1;
    }
  }
  @keyframes lr-spark {
    from {
      transform: rotate(var(--lr-angle)) translateX(0);
      opacity: 0.7;
    }
    to {
      transform: rotate(var(--lr-angle)) translateX(var(--ui-layout-128, 128px)) rotate(150deg);
      opacity: 0;
    }
  }
  .is-reduced .lr-gift,
  .is-reduced .lr-orbit,
  .is-reduced .lr-rays,
  .is-reduced .lr-halo,
  .is-reduced .lr-prize,
  .is-reduced .lr-spark {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .lr-gift,
    .lr-orbit,
    .lr-rays,
    .lr-halo,
    .lr-prize,
    .lr-spark {
      animation: none;
    }
  }
  :global(.disable-animations .lr-stage) {
    animation: none;
  }
  :global(.disable-animations .lr-stage *) {
    animation: none;
  }
</style>
