<template>
  <div
    ref="stage"
    class="lt-stage lr-stage"
    :class="{
      'is-free': mode === 'free',
      'is-paid': mode === 'paid',
      'is-charging': phase === 'charging',
      'is-opening': phase === 'opening',
      'is-revealing': phase === 'revealing',
      'is-result': phase === 'result',
      'is-golden': golden,
      'is-narrow': narrow,
      'is-reduced': motionReduced,
    }"
    :style="timingStyle"
  >
    <canvas ref="particles" class="lr-particles" aria-hidden="true"></canvas>
    <span class="lr-atmosphere" aria-hidden="true"></span>
    <span class="lr-light-column" aria-hidden="true"></span>
    <span class="lr-shockwave" aria-hidden="true"></span>
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
          v-for="(prize, index) in displayedPrizes"
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
          <span class="lr-prize-icon">
            <SvgIcon :src="prizeIcon(prize)" :size="results.length === 1 ? 44 : 24" aria-hidden="true" />
          </span>
          <strong>{{ prizeValue(prize, locale) }}</strong>
          <span class="lr-kind">{{
            results.length > 1 && prize.kind === 'ai_pack' ? t('growth.lotteryAiTokenUnit') : prizeKindLabel(prize, t)
          }}</span>
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
        <template v-if="mode === 'free'">
          <div class="lr-gift-halo"><span></span><span></span></div>
          <div class="lr-gift">
            <span class="lr-gift-light"></span>
            <span class="lr-gift-body"></span>
            <span class="lr-gift-lid"><b></b><b></b></span>
          </div>
        </template>
        <template v-else>
          <div class="lr-orbits"><span></span><span></span><span></span><span></span></div>
          <div class="lr-crystal">
            <div class="lr-cube"><b></b><b></b><b></b><b></b><b></b><b></b></div>
            <SvgIcon class="lr-core-mark" :src="icon.organize.spark" :size="28" />
          </div>
        </template>
        <span class="lr-ground"></span>
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
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LotteryPrize } from '@/composables/useGrowth';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { prizeIcon, prizeKindLabel, prizeLabel, prizeValue } from '@/utils/lotteryPresentation';
  import {
    LOTTERY_CARD_MS,
    LOTTERY_STAGGER_MS,
    LOTTERY_TIMINGS,
    type LotteryDrawMode,
    type LotteryRevealPhase,
  } from './useLotteryReveal';

  const props = defineProps<{
    phase: LotteryRevealPhase;
    mode: LotteryDrawMode;
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
  const stage = ref<HTMLElement>();
  const particles = ref<HTMLCanvasElement>();
  const showResults = computed(() => props.results.length > 0 && ['revealing', 'result'].includes(props.phase));
  // Only the reveal order changes; the receipt remains in its original draw order.
  const displayedPrizes = computed(() =>
    props.results.length === 10
      ? [...props.results.filter((prize) => !prize.guaranteed), ...props.results.filter((prize) => prize.guaranteed)]
      : props.results,
  );
  const golden = computed(
    () =>
      props.mode === 'paid' &&
      ['opening', 'revealing', 'result'].includes(props.phase) &&
      props.results.some((p) => p.guaranteed),
  );
  const timingStyle = computed(() => ({
    '--lr-charge': `${LOTTERY_TIMINGS[props.mode].charge}ms`,
    '--lr-opening': `${LOTTERY_TIMINGS[props.mode].opening}ms`,
    '--lr-card': `${LOTTERY_CARD_MS}ms`,
  }));
  const title = computed(() => {
    if (props.phase === 'charging')
      return t(props.mode === 'free' ? 'growth.lotteryGiftCharging' : 'growth.lotteryStarsCharging');
    if (props.phase === 'opening')
      return t(
        props.mode === 'free'
          ? 'growth.lotteryGiftOpening'
          : props.drawingTimes === 10
            ? 'growth.lotteryOpeningTen'
            : 'growth.lotteryOpening',
      );
    if (props.phase === 'waiting') return t('growth.lotteryConfirming');
    if (props.phase === 'uncertain') return t('growth.lotteryResultUncertain');
    return props.idleTitle;
  });
  const hint = computed(() => {
    if (props.phase === 'charging' || props.phase === 'opening') return t('growth.lotteryOpeningHint');
    if (props.phase === 'waiting') return t('growth.lotteryConfirmingHint');
    if (props.phase === 'uncertain')
      return t(props.retryAllowed ? 'growth.lotteryResultUncertainHint' : 'growth.lotteryResultMissingHint');
    return props.idleHint;
  });

  // Decorative coordinates follow the measured stage, independently of interface density.
  const seeds = Array.from({ length: 72 }, (_, i) => ({
    x: ((i * 73 + 19) % 997) / 997,
    y: ((i * 137 + 31) % 991) / 991,
    angle: i * 2.399963,
    depth: 0.3 + (i % 9) / 10,
    speed: 0.4 + (i % 11) / 14,
  }));
  let frame = 0;
  let observer: ResizeObserver | undefined;
  let phaseStarted = 0;
  let width = 0;
  let height = 0;
  let context: CanvasRenderingContext2D | null = null;
  function paint(progress = 0, active = false) {
    if (!context || !width || !height) return;
    const ctx = context;
    const free = props.mode === 'free';
    const tone = golden.value ? '245,212,134' : free ? '145,111,200' : '211,191,255';
    const cx = width * 0.5;
    const cy = height * 0.46;
    ctx.clearRect(0, 0, width, height);
    seeds.forEach((seed, i) => {
      ctx.fillStyle = `rgba(${tone},${(0.13 + (i % 5) * 0.04) * (free ? 0.4 : 1)})`;
      ctx.beginPath();
      ctx.arc(seed.x * width, seed.y * height, i % 7 === 0 ? 1.1 : 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!active || props.motionReduced) return;
    const count = free || props.narrow ? 42 : seeds.length;
    for (let i = 0; i < count; i++) {
      const p = seeds[i];
      let x: number, y: number, px: number, py: number, alpha: number;
      if (free && props.phase === 'charging') {
        const travel = (progress * 1.45 + p.depth) % 1;
        x = cx + Math.sin(p.angle + travel * 3.4) * width * (0.12 + p.depth * 0.06) * (1 - travel * 0.8);
        y = height * 0.72 - travel * height * 0.43;
        px = x - 3 * Math.cos(p.angle + travel * 3.4);
        py = y + 8;
        alpha = Math.sin(travel * Math.PI) * (0.3 + progress * 0.45);
      } else if (props.phase === 'charging') {
        const radius = (1 - progress) * Math.max(width, height) * (0.5 + p.depth * 0.4) + 8;
        const angle = p.angle + progress * 5.4;
        x = cx + Math.cos(angle) * radius;
        y = cy + Math.sin(angle) * radius * 0.55;
        px = cx + Math.cos(angle - 0.07) * radius * 1.025;
        py = cy + Math.sin(angle - 0.07) * radius * 0.55 * 1.025;
        alpha = 0.15 + progress * 0.65;
      } else {
        const radius = progress * Math.max(width, height) * p.speed * (free ? 0.7 : 1);
        x = cx + Math.cos(p.angle) * radius;
        y = cy + Math.sin(p.angle) * radius * 0.7;
        px = cx + Math.cos(p.angle) * radius * 0.83;
        py = cy + Math.sin(p.angle) * radius * 0.58;
        alpha = Math.max(0, 0.8 - progress);
      }
      ctx.strokeStyle = `rgba(${tone},${alpha})`;
      ctx.lineWidth = i % 6 === 0 ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  function stopParticles() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function animate(now: number) {
    if (!['charging', 'opening'].includes(props.phase) || props.motionReduced || document.hidden) {
      stopParticles();
      paint();
      return;
    }
    const duration =
      props.phase === 'charging' ? LOTTERY_TIMINGS[props.mode].charge : LOTTERY_TIMINGS[props.mode].opening;
    const progress = Math.min(1, (now - phaseStarted) / duration);
    paint(progress, true);
    if (progress < 1) frame = requestAnimationFrame(animate);
    else {
      stopParticles();
      paint();
    }
  }
  function resizeParticles() {
    if (!particles.value || !stage.value || !context) return;
    width = stage.value.clientWidth;
    height = stage.value.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    particles.value.width = Math.round(width * ratio);
    particles.value.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint();
  }
  watch(
    [() => props.phase, () => props.mode, () => props.motionReduced],
    () => {
      stopParticles();
      phaseStarted = performance.now();
      paint();
      if (context && !props.motionReduced && ['charging', 'opening'].includes(props.phase))
        frame = requestAnimationFrame(animate);
    },
    { flush: 'post' },
  );
  onMounted(() => {
    // A renderer without canvas still has the complete CSS scene and reward flow.
    try {
      context = particles.value?.getContext('2d') || null;
    } catch {
      context = null;
    }
    if (!context || !stage.value) return;
    observer = new ResizeObserver(resizeParticles);
    observer.observe(stage.value);
    resizeParticles();
  });
  onBeforeUnmount(() => {
    stopParticles();
    observer?.disconnect();
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .lr-stage {
    --lr-text: var(--lottery-theater-text, var(--text-color));
    --lr-muted: var(--lottery-theater-muted, var(--desc-color));
    --lr-accent: var(--primary-color);
    --lr-beam: #b69dff;
    display: grid;
    align-items: center;
    flex: 1;
    min-height: .ui-layout(360px) [];
    min-width: 0;
    padding: .ui-space(18px) [] .ui-space(20px) [] .ui-space(22px) [];
    position: relative;
    isolation: isolate;
    overflow: hidden;
    text-align: center;
    color: var(--lr-text);
  }
  .lr-stage.is-paid {
    --lr-accent: #d3bfff;
  }
  .lr-stage.is-golden {
    --lr-beam: #f5d486;
  }
  .lr-particles,
  .lr-atmosphere,
  .lr-light-column,
  .lr-shockwave {
    position: absolute;
    pointer-events: none;
  }
  .lr-particles {
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }
  .lr-atmosphere {
    width: 70%;
    height: 65%;
    left: 50%;
    top: 45%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(164, 122, 255, 0.23), transparent 68%);
    opacity: 0.7;
  }
  .is-free .lr-atmosphere {
    opacity: 0.35;
  }
  .lr-light-column {
    left: 50%;
    top: -15%;
    bottom: -15%;
    width: 46%;
    z-index: 1;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(202, 175, 255, 0.04),
      var(--lr-beam),
      rgba(202, 175, 255, 0.04),
      transparent
    );
    transform: translateX(-50%) scaleX(0);
    opacity: 0;
  }
  .lr-shockwave {
    left: 50%;
    top: 45%;
    width: .ui-layout(90px) [];
    height: .ui-layout(90px) [];
    border: 2px solid var(--lr-beam);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
    z-index: 1;
    box-shadow: 0 0 24px rgba(192, 150, 255, 0.4);
  }
  .lr-idle,
  .lr-result {
    position: relative;
    z-index: 2;
    min-width: 0;
    width: 100%;
  }
  .lr-idle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .ui-space(8px) [];
  }
  .lr-idle h3 {
    margin: .ui-space(6px) [] 0 0;
    font-size: .ui-font(19px) [];
    line-height: 1.45;
  }
  .lr-idle p {
    margin: 0;
    color: var(--lr-muted);
    font-size: .ui-font(13px) [];
    line-height: 1.6;
  }
  .lr-art {
    --lr-scene-y: 50%;
    width: 100%;
    max-width: .ui-layout(240px) [];
    height: .ui-layout(215px) [];
    position: relative;
    display: grid;
    place-items: center;
    transform-style: preserve-3d;
  }
  .lr-art * {
    box-sizing: border-box;
  }
  .lr-ground {
    position: absolute;
    left: 50%;
    bottom: 5%;
    width: 80%;
    height: .ui-layout(24px) [];
    transform: translateX(-50%);
    border-radius: 50%;
    opacity: 0.5;
    background: radial-gradient(ellipse, rgba(188, 144, 255, 0.55), transparent 68%);
    filter: blur(3px);
  }
  .is-free .lr-ground {
    top: calc(var(--lr-scene-y) + var(--ui-layout-72, 72px));
    bottom: auto;
  }

  // The gift and crystal are decorative 3D illustrations; they do not introduce UI controls.
  .lr-gift-halo {
    position: absolute;
    width: .ui-layout(216px) [];
    height: .ui-layout(216px) [];
    left: 50%;
    top: var(--lr-scene-y);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(249, 221, 190, 0.25), transparent 69%);
  }
  .lr-gift-halo span {
    --lr-art-stroke: rgba(165, 127, 211, 0.28);
    position: absolute;
    inset: 0;
    border: 1px solid var(--lr-art-stroke);
    border-radius: 50%;
    transform: rotateX(20deg) rotateZ(-30deg);
  }
  .lr-gift-halo span:last-child {
    --lr-art-stroke: rgba(165, 127, 211, 0.2);
    inset: 7%;
    border-style: dashed;
    border-color: var(--lr-art-stroke);
    transform: rotateX(38deg) rotateZ(24deg);
  }
  .lr-gift {
    position: absolute;
    left: 50%;
    top: var(--lr-scene-y);
    width: .ui-layout(140px) [];
    height: .ui-layout(174px) [];
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 16px 16px rgba(116, 79, 178, 0.18));
  }
  .lr-gift-body {
    --lr-art-stroke: #cdb6e6;
    position: absolute;
    width: 76%;
    height: 55%;
    top: 37%;
    left: 12%;
    border-radius: 6px 6px 10px 10px;
    background: linear-gradient(100deg, #e9dcfa, #fffaf5 42%, #d9c5ed);
    border: 1px solid var(--lr-art-stroke);
    box-shadow: inset -15px 0 14px rgba(102, 65, 161, 0.13);
  }
  .lr-gift-body::after,
  .lr-gift-lid::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: .ui-layout(24px) [];
    transform: translateX(-50%);
    background: linear-gradient(90deg, #8b6ed8, #b094ef, #8767d3);
  }
  .lr-gift-lid {
    --lr-art-stroke: #d2bfef;
    position: absolute;
    width: 88%;
    height: 16%;
    left: 6%;
    top: 29%;
    background: linear-gradient(110deg, #fffaf7, #dfcaf6);
    border: 1px solid var(--lr-art-stroke);
    border-radius: 6px;
    box-shadow: 0 5px 8px rgba(90, 58, 145, 0.14);
  }
  .lr-gift-lid b {
    --lr-art-stroke: #a386e5;
    position: absolute;
    bottom: 95%;
    width: .ui-layout(44px) [];
    height: .ui-layout(30px) [];
    left: 50%;
    border: .ui-layout(6px) [] solid var(--lr-art-stroke);
    border-radius: 55% 55% 20% 55%;
    transform-origin: 100% 100%;
    transform: translateX(-100%) rotate(16deg);
  }
  .lr-gift-lid b:last-child {
    border-radius: 55% 55% 55% 20%;
    transform-origin: 0 100%;
    transform: rotate(-16deg);
  }
  .lr-gift-lid::before {
    content: '';
    position: absolute;
    z-index: 1;
    left: 50%;
    top: -30%;
    width: .ui-layout(24px) [];
    height: .ui-layout(18px) [];
    transform: translateX(-50%);
    border-radius: 5px;
    background: linear-gradient(110deg, #b59bef, #9171d8 75%);
    box-shadow: 0 2px 4px rgba(102, 65, 161, 0.15);
  }
  .lr-gift-light {
    position: absolute;
    width: 110%;
    height: 90%;
    left: -5%;
    top: -10%;
    opacity: 0;
    transform-origin: 50% 90%;
    background: linear-gradient(0deg, #d7b8ff, #fff7de 40%, transparent);
    clip-path: polygon(37% 100%, 0 0, 100% 0, 63% 100%);
    filter: blur(6px);
  }
  .lr-orbits {
    position: absolute;
    inset: 5% 0;
    transform: rotateX(62deg) rotateZ(-24deg);
    transform-style: preserve-3d;
  }
  .lr-orbits span {
    --lr-art-stroke: rgba(180, 145, 255, 0.32);
    position: absolute;
    inset: 0;
    border: 1px solid var(--lr-art-stroke);
    border-radius: 50%;
    box-shadow: 0 0 18px rgba(142, 98, 255, 0.1);
  }
  .lr-orbits span:nth-child(2) {
    --lr-art-stroke: transparent;
    --lr-art-top-stroke: #c2adff;
    --lr-art-bottom-stroke: rgba(194, 173, 255, 0.25);
    inset: 9%;
    border: 2px solid transparent;
    border-top-color: var(--lr-art-top-stroke);
    border-bottom-color: var(--lr-art-bottom-stroke);
    transform: rotate(45deg);
  }
  .lr-orbits span:nth-child(3) {
    inset: 18%;
    border-style: dashed;
    transform: rotate(90deg);
  }
  .lr-orbits span:nth-child(4) {
    --lr-art-stroke: rgba(194, 173, 255, 0.1);
    inset: -10%;
    border-color: var(--lr-art-stroke);
  }
  .lr-crystal {
    position: absolute;
    width: .ui-layout(140px) [];
    height: .ui-layout(170px) [];
    top: 3%;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    place-items: center;
    perspective: .ui-layout(500px) [];
    filter: drop-shadow(0 12px 25px rgba(146, 90, 255, 0.5));
  }
  .lr-cube {
    --lr-half-edge: .ui-layout(38px) [];
    width: .ui-layout(76px) [];
    height: .ui-layout(76px) [];
    transform-style: preserve-3d;
    transform: rotateX(-27deg) rotateY(45deg);
    position: relative;
  }
  .lr-cube b {
    --lr-art-stroke: rgba(242, 229, 255, 0.8);
    position: absolute;
    inset: 0;
    border: 1px solid var(--lr-art-stroke);
    border-radius: 7px;
    box-shadow: inset 0 0 25px rgba(255, 255, 255, 0.15);
    backface-visibility: hidden;
  }
  .lr-cube b:nth-child(1) {
    background: linear-gradient(140deg, #d3b5ff, #7651c5 65%, #492872);
    transform: translateZ(var(--lr-half-edge));
  }
  .lr-cube b:nth-child(2) {
    background: linear-gradient(40deg, #3c236c, #b29aff);
    transform: rotateY(-90deg) translateZ(var(--lr-half-edge));
  }
  .lr-cube b:nth-child(3) {
    background: linear-gradient(120deg, #f1e5ff, #ac87e6);
    transform: rotateX(90deg) translateZ(var(--lr-half-edge));
  }
  .lr-cube b:nth-child(4) {
    background: linear-gradient(140deg, #b59ae6, #513184);
    transform: rotateY(180deg) translateZ(var(--lr-half-edge));
  }
  .lr-cube b:nth-child(5) {
    background: linear-gradient(40deg, #3c236c, #b29aff);
    transform: rotateY(90deg) translateZ(var(--lr-half-edge));
  }
  .lr-cube b:nth-child(6) {
    background: linear-gradient(120deg, #765596, #b091e4);
    transform: rotateX(-90deg) translateZ(var(--lr-half-edge));
  }
  .lr-core-mark {
    position: absolute;
    left: 50%;
    top: 48%;
    transform: translate(-50%, -50%);
    color: #fff;
    filter: drop-shadow(0 0 8px #c1a2ff);
  }

  .is-charging .lr-orbits {
    animation: lr-orbit var(--lr-charge) cubic-bezier(0.35, 0, 0.25, 1) both;
  }
  .is-charging .lr-cube {
    animation: lr-core var(--lr-charge) cubic-bezier(0.5, 0, 0.3, 1) both;
  }
  .is-charging .lr-atmosphere {
    animation: lr-charge-glow var(--lr-charge) ease-in both;
  }
  .is-charging .lr-gift {
    animation: lr-gift-charge var(--lr-charge) cubic-bezier(0.4, 0, 0.25, 1) both;
  }
  .is-charging .lr-gift-lid {
    animation: lr-lid-rattle var(--lr-charge) ease-in-out both;
  }
  .is-charging .lr-gift-light {
    animation: lr-seam var(--lr-charge) ease-in both;
  }
  .is-charging .lr-gift-halo {
    animation: lr-gift-halo-charge var(--lr-charge) ease-in-out both;
  }
  .is-opening .lr-light-column,
  .is-revealing .lr-light-column {
    animation: lr-light 0.8s cubic-bezier(0.3, 0, 0.2, 1) both;
  }
  .is-opening .lr-shockwave,
  .is-revealing .lr-shockwave {
    animation: lr-wave 0.8s ease-out both;
  }
  .is-opening .lr-art {
    animation: lr-disappear var(--lr-opening) ease-in both;
  }
  .is-free.is-opening .lr-light-column,
  .is-free.is-revealing .lr-light-column {
    animation: none;
  }
  .is-free.is-opening .lr-art {
    animation: lr-gift-out var(--lr-opening) ease-out both;
  }
  .is-opening .lr-gift-lid {
    animation: lr-lid-open var(--lr-opening) cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .is-opening .lr-gift-light {
    animation: lr-gift-light var(--lr-opening) ease-out both;
  }
  .is-opening .lr-gift-halo {
    animation: lr-gift-halo-open var(--lr-opening) ease-out both;
  }

  .lr-result-heading {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: .ui-space(6px) [];
    min-height: .ui-layout(28px) [];
    margin-bottom: .ui-space(14px) [];
    color: var(--lr-muted);
    font-size: .ui-font(13px) [];
  }
  .lr-delivered-icon {
    color: var(--success-color);
  }
  .is-paid .lr-delivered-icon {
    color: #86dba8;
  }
  .lr-prizes {
    display: grid;
    max-width: .ui-layout(900px) [];
    margin-inline: auto;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: .ui-space(8px) [];
    perspective: .ui-layout(900px) [];
  }
  .lr-prize {
    --lr-prize-stroke: var(--workspace-border);
    display: flex;
    min-width: 0;
    min-height: .ui-layout(120px) [];
    position: relative;
    overflow: hidden;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: .ui-space(6px) [];
    padding: .ui-space(12px) [] .ui-space(4px) [];
    border: 1px solid var(--lr-prize-stroke);
    background: var(--workspace-content);
    border-radius: 12px;
    transform-style: preserve-3d;
  }
  .is-paid .lr-prize {
    --lr-prize-stroke: rgba(191, 174, 230, 0.3);
    background: linear-gradient(150deg, #302746, #1f1936);
  }
  .is-paid .lr-prize.is-rare {
    --lr-prize-stroke: #a782ff;
    background: linear-gradient(145deg, #4d306f, #271b43 74%);
    box-shadow:
      inset 0 0 28px rgba(177, 115, 255, 0.12),
      0 0 14px rgba(153, 88, 255, 0.14);
  }
  .is-paid .lr-prize.is-guaranteed {
    --lr-prize-stroke: #f5d486;
    background: linear-gradient(145deg, #624c2c, #332738 75%);
    box-shadow:
      inset 0 0 28px rgba(249, 207, 122, 0.15),
      0 0 16px rgba(249, 207, 122, 0.17);
  }
  .lr-prize-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--lr-accent);
    flex-shrink: 0;
    margin: .ui-space(4px) [] 0;
  }
  .is-guaranteed .lr-prize-icon {
    color: #f5d486;
  }
  .lr-prize strong {
    font-size: .ui-font(17px) [];
    line-height: 1.3;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .lr-rarity {
    min-height: .ui-layout(16px) [];
    font-size: .ui-font(11px) [];
    color: var(--lr-accent);
  }
  .is-guaranteed .lr-rarity {
    color: #f5d486;
  }
  .lr-kind,
  .lr-prize small {
    font-size: .ui-font(11px) [];
    color: var(--lr-muted);
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
    font-size: .ui-font(36px) [];
  }
  .is-single .lr-kind,
  .is-single .lr-rarity {
    font-size: .ui-font(13px) [];
  }
  .is-free .lr-prize {
    --lr-prize-stroke: transparent;
    background: transparent;
    box-shadow: none;
  }
  .is-free .lr-prize-icon {
    width: .ui-layout(82px) [];
    height: .ui-layout(82px) [];
    border-radius: 50%;
    background: var(--workspace-content);
    box-shadow: 0 10px 32px rgba(116, 79, 178, 0.16);
  }
  .lr-delivery {
    margin: .ui-space(16px) [] 0 .ui-space(4px) [];
    color: var(--lr-muted);
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
    color: var(--lr-accent);
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
  .is-paid .lr-uncertain-actions .text_btn {
    color: var(--lr-accent);
  }
  .is-revealing .lr-prize {
    animation: lr-card var(--lr-card) cubic-bezier(0.2, 0.8, 0.2, 1) var(--lr-delay) both;
  }
  .is-free.is-revealing .lr-prize {
    animation-name: lr-free-reward;
  }
  .is-revealing.is-paid .lr-prize::after {
    content: '';
    position: absolute;
    inset: -100%;
    pointer-events: none;
    background: linear-gradient(120deg, transparent 40%, rgba(255, 255, 255, 0.18) 49%, transparent 58%);
    transform: translateX(-80%);
    animation: lr-sheen 0.42s ease-out calc(var(--lr-delay) + 0.18s) both;
  }
  .is-narrow .lr-prizes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .ui-space(6px) [];
  }
  .is-narrow .lr-prizes.is-single {
    grid-template-columns: minmax(0, .ui-layout(220px) []);
  }
  .is-narrow .is-ten .lr-prize:last-child {
    grid-column: 2;
  }
  .is-narrow .is-ten .lr-prize {
    min-height: .ui-layout(108px) [];
  }
  .is-narrow .is-ten .lr-prize strong {
    font-size: .ui-font(14px) [];
  }
  .is-narrow .is-single .lr-prize strong {
    font-size: .ui-font(32px) [];
  }
  .is-narrow.lr-stage {
    min-height: .ui-layout(320px) [];
    padding: .ui-space(16px) [] .ui-space(12px) [];
  }

  // Growth's shared mobile baseline forces panel borders to neutral. These solid/RGBA
  // illustration strokes and receipt-based reward borders are safe in the same WebView baseline.
  :global(html.light-note-mobile-rendering .lt-stage.lr-stage .lr-art *) {
    border-color: var(--lr-art-stroke, transparent) !important;
    border-top-color: var(--lr-art-top-stroke, var(--lr-art-stroke, transparent)) !important;
    border-bottom-color: var(--lr-art-bottom-stroke, var(--lr-art-stroke, transparent)) !important;
  }
  :global(html.light-note-mobile-rendering .lt-stage.lr-stage .lr-prize) {
    border-color: var(--lr-prize-stroke) !important;
  }
  :global(html.light-note-mobile-rendering .lt-stage.lr-stage .lr-shockwave) {
    border-color: var(--lr-beam) !important;
  }

  @keyframes lr-orbit {
    0% {
      transform: rotateX(62deg) rotateZ(-24deg) scale(0.94);
    }
    65% {
      transform: rotateX(58deg) rotateZ(460deg) scale(0.87);
    }
    100% {
      transform: rotateX(15deg) rotateZ(680deg) scale(0.5);
    }
  }
  @keyframes lr-core {
    0% {
      transform: rotateX(-27deg) rotateY(45deg);
    }
    70% {
      transform: rotateX(20deg) rotateY(230deg) scale(0.78);
    }
    100% {
      transform: rotateX(5deg) rotateY(405deg) scale(0.64);
    }
  }
  @keyframes lr-charge-glow {
    0% {
      opacity: 0.45;
      transform: translate(-50%, -50%) scale(1);
    }
    75% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.3);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.6);
    }
  }
  @keyframes lr-light {
    0% {
      opacity: 0;
      transform: translateX(-50%) scaleX(0.04);
    }
    30% {
      opacity: 0.85;
      transform: translateX(-50%) scaleX(1.2);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) scaleX(2.4);
    }
  }
  @keyframes lr-wave {
    0% {
      opacity: 0.8;
      transform: translate(-50%, -50%) scale(0.15);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(5);
    }
  }
  @keyframes lr-disappear {
    to {
      opacity: 0;
      transform: translateY(-10%) scale(0.65);
    }
  }
  @keyframes lr-gift-charge {
    0% {
      transform: translate(-50%, -50%);
    }
    35% {
      transform: translate(-50%, -48%) scale(0.97);
    }
    58% {
      transform: translate(-50%, -54%) rotate(-3deg);
    }
    76% {
      transform: translate(-50%, -56%) rotate(3deg);
    }
    100% {
      transform: translate(-50%, -59%) scale(1.04);
    }
  }
  @keyframes lr-lid-rattle {
    0%,
    42% {
      transform: translateY(0);
    }
    55% {
      transform: translateY(-7%) rotate(-3deg);
    }
    72% {
      transform: translateY(-11%) rotate(3deg);
    }
    100% {
      transform: translateY(-22%);
    }
  }
  @keyframes lr-seam {
    0%,
    30% {
      opacity: 0;
      transform: scale(0.55, 0.3);
    }
    100% {
      opacity: 0.5;
      transform: scale(1, 0.7);
    }
  }
  @keyframes lr-gift-halo-charge {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.65;
    }
    70% {
      transform: translate(-50%, -50%) rotate(26deg) scale(0.87);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) rotate(42deg) scale(0.76);
      opacity: 1;
    }
  }
  @keyframes lr-lid-open {
    0% {
      transform: translateY(-22%);
      opacity: 1;
    }
    65% {
      transform: translate(15%, -310%) rotate(16deg);
      opacity: 1;
    }
    100% {
      transform: translate(23%, -390%) rotate(26deg);
      opacity: 0;
    }
  }
  @keyframes lr-gift-out {
    0%,
    65% {
      opacity: 1;
      transform: translateY(-7%) scale(1.04);
    }
    100% {
      opacity: 0;
      transform: translateY(5%) scale(0.85);
    }
  }
  @keyframes lr-gift-light {
    0% {
      opacity: 0.4;
      transform: scale(0.8, 0.65);
    }
    42% {
      opacity: 1;
      transform: scale(1.7, 1.35);
    }
    100% {
      opacity: 0;
      transform: scale(2.6, 1.6);
    }
  }
  @keyframes lr-gift-halo-open {
    0% {
      transform: translate(-50%, -50%) scale(0.76);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.45);
      opacity: 0;
    }
  }
  @keyframes lr-card {
    from {
      opacity: 0;
      transform: translateY(16%) rotateY(-105deg) rotateX(12deg) scale(0.72);
    }
    to {
      opacity: 1;
      transform: translateY(0) rotateY(0) rotateX(0) scale(1);
    }
  }
  @keyframes lr-free-reward {
    0% {
      opacity: 0;
      transform: translateY(12%) scale(0.78);
    }
    70% {
      opacity: 1;
      transform: translateY(-2%) scale(1.03);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes lr-sheen {
    to {
      transform: translateX(80%);
    }
  }
  .is-reduced *,
  .is-reduced *::before,
  .is-reduced *::after {
    animation: none !important;
    transition: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .lr-stage *,
    .lr-stage *::before,
    .lr-stage *::after {
      animation: none !important;
      transition: none !important;
    }
  }
  :global(.disable-animations .lr-stage *) {
    animation: none !important;
    transition: none !important;
  }
  :global(.disable-animations .lr-stage *::after) {
    animation: none !important;
  }
</style>
