<template>
  <Teleport to="body">
    <transition name="achu-fade" appear @after-leave="emit('close')">
      <div
        v-if="visible"
        ref="mask"
        class="achu-mask"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @click="close"
        @keydown.esc.prevent="close"
        @keydown.enter.prevent="close"
      >
        <div class="achu-stage" :style="paletteStyle">
          <div class="achu-glow" aria-hidden="true"></div>
          <div class="achu-rays" aria-hidden="true"></div>
          <div
            v-for="ring in 3"
            :key="ring"
            class="achu-ring"
            :style="{ animationDelay: `${0.35 + (ring - 1) * 0.55}s` }"
            aria-hidden="true"
          ></div>

          <div class="achu-emblem">
            <AchievementEmblem :achievement-key="achievementKey" :group="group" :size="EMBLEM_SIZE" animated />
          </div>

          <span
            v-for="spark in SPARKS"
            :key="spark.i"
            class="achu-spark"
            :style="spark.style"
            aria-hidden="true"
          ></span>
          <ul class="achu-confetti" aria-hidden="true">
            <li v-for="piece in pieces" :key="piece.i" :style="piece.style"></li>
          </ul>

          <div class="achu-text">
            <div class="achu-kicker">{{ kicker }}</div>
            <div :id="titleId" class="achu-name">{{ name }}</div>
            <div v-if="description" class="achu-sub">{{ description }}</div>
          </div>

          <div class="achu-hint">{{ t('growth.levelUpDismiss') }}</div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, useId } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { achievementVisualFor, achievementVisualStyle } from '@/config/achievements';
  import AchievementEmblem from './AchievementEmblem.vue';

  /**
   * 成就解锁庆祝：节奏沿用升级动画（放射光、光环、彩带），主体换成成就徽章，配色取徽章家族与稀有度。
   * 点击任意处、Esc 或 Enter 关闭；减少动态效果时只保留淡入。
   */
  const props = withDefaults(
    defineProps<{ achievementKey: string; group?: string; name: string; description?: string; kicker: string }>(),
    { group: '', description: '' },
  );
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();

  // 庆祝场景的徽章、光环、星芒和彩带共用固定绘制坐标；文字独立响应密度。
  const EMBLEM_SIZE = 148;
  const titleId = `achu-title-${useId()}`;
  const visible = ref(true);
  const mask = ref<HTMLElement>();

  const visual = computed(() => achievementVisualFor(props.achievementKey, props.group));
  const paletteStyle = computed(() => achievementVisualStyle(props.achievementKey, props.group));

  // 彩带取徽章自己的宝石色与金属色，避免和升级动画的彩虹色混淆。
  const pieces = computed(() => {
    const colors = [
      visual.value.accent,
      visual.value.secondary,
      visual.value.metalBright,
      visual.value.metalHighlight,
      visual.value.highlight,
    ];
    const count = 30;
    return Array.from({ length: count }, (_, i) => {
      const angle = (360 / count) * i + (i % 3) * 6;
      const dist = 130 + (i % 5) * 24;
      const rad = (angle * Math.PI) / 180;
      return {
        i,
        style: {
          '--tx': `${Math.cos(rad) * dist}px`,
          '--ty': `${Math.sin(rad) * dist}px`,
          '--rot': `${(i % 2 ? 1 : -1) * (160 + (i % 6) * 50)}deg`,
          '--delay': `${320 + (i % 7) * 40}ms`,
          background: colors[i % colors.length],
          width: i % 3 === 0 ? '6px' : '8px',
          height: i % 3 === 0 ? '12px' : '8px',
        } as Record<string, string>,
      };
    });
  });

  // 星芒围绕徽章错峰闪烁；位置相对徽章中心。
  const SPARKS = [
    { x: -96, y: -64, s: 18, d: 0.5 },
    { x: 92, y: -82, s: 14, d: 0.9 },
    { x: 108, y: 24, s: 20, d: 1.3 },
    { x: -112, y: 38, s: 12, d: 1.7 },
    { x: -40, y: -104, s: 10, d: 2.1 },
    { x: 46, y: 92, s: 12, d: 2.5 },
  ].map((spark, i) => ({
    i,
    style: {
      '--sx': `${spark.x}px`,
      '--sy': `${spark.y}px`,
      '--ss': `${spark.s}px`,
      animationDelay: `${spark.d}s`,
    } as Record<string, string>,
  }));

  function close() {
    visible.value = false;
  }

  onMounted(() => {
    void nextTick(() => mask.value?.focus({ preventScroll: true }));
  });
</script>

<style scoped lang="less">
  .achu-mask {
    position: fixed;
    inset: 0;
    z-index: 1200; /* 与升级动画同层：高于全局搜索、AI 助手和年度报告移动浮层 */
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(circle at center, rgba(24, 20, 50, 0.64), rgba(8, 8, 20, 0.86));
    backdrop-filter: blur(4px);
    cursor: pointer;
    outline: none;
  }
  .achu-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* ui-density-fixed: 庆祝舞台与徽章、光环、彩带共用固定绘制坐标 */
    width: 320px;
    /* ui-density-fixed: 庆祝舞台与徽章、光环、彩带共用固定绘制坐标 */
    height: 400px;
  }

  /* 徽章背后的家族色光晕 */
  .achu-glow {
    position: absolute;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    top: 6px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    width: 240px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    height: 240px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--achievement-secondary) 62%, transparent),
      color-mix(in srgb, var(--achievement-accent) 22%, transparent) 52%,
      transparent 72%
    );
    animation:
      achu-glow-in 0.6s ease-out both,
      achu-glow 2.6s ease-in-out 0.6s infinite;
    pointer-events: none;
  }

  /* 放射光：金属高光色，慢速旋转 */
  .achu-rays {
    position: absolute;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    top: -104px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    width: 460px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    height: 460px;
    border-radius: 50%;
    background: repeating-conic-gradient(
      from 0deg,
      transparent 0 10deg,
      color-mix(in srgb, var(--achievement-metal-highlight) 26%, transparent) 10deg 16deg,
      transparent 16deg 24deg
    );
    -webkit-mask: radial-gradient(circle, transparent 60px, #000 64px 150px, transparent 190px);
    mask: radial-gradient(circle, transparent 60px, #000 64px 150px, transparent 190px);
    animation:
      achu-ray-in 0.6s ease-out 0.15s both,
      achu-ray-spin 16s linear 0.75s infinite;
    pointer-events: none;
  }

  .achu-ring {
    position: absolute;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    top: 66px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    width: 96px;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    height: 96px;
    border: 2px solid color-mix(in srgb, var(--achievement-metal-highlight) 70%, transparent);
    border-radius: 50%;
    opacity: 0;
    animation: achu-ring 1.9s ease-out infinite;
    pointer-events: none;
  }

  .achu-emblem {
    position: relative;
    z-index: 2;
    display: flex;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    margin-top: 40px;
    filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.45))
      drop-shadow(0 0 22px color-mix(in srgb, var(--achievement-metal-glow) 100%, transparent));
    animation:
      achu-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both,
      achu-float 3s ease-in-out 0.9s infinite;
  }

  /* 四角星芒 */
  .achu-spark {
    position: absolute;
    z-index: 3;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    top: 114px;
    left: 50%;
    width: var(--ss);
    height: var(--ss);
    margin: calc(var(--ss) / -2) 0 0 calc(var(--ss) / -2);
    background: var(--achievement-metal-white);
    clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%);
    filter: drop-shadow(0 0 6px var(--achievement-metal-bright));
    opacity: 0;
    transform: translate(var(--sx), var(--sy)) scale(0.2);
    animation: achu-spark 2.4s ease-in-out infinite;
    pointer-events: none;
  }

  .achu-confetti {
    position: absolute;
    /* ui-density-fixed: 以徽章中心为圆心的装饰几何 */
    top: 114px;
    left: 50%;
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }
  .achu-confetti li {
    position: absolute;
    border-radius: 2px;
    opacity: 0;
    animation: achu-burst 1.1s ease-out var(--delay) forwards;
  }

  .achu-text {
    position: absolute;
    /* ui-density-fixed: 庆祝舞台内的文字锚点，与徽章几何对齐 */
    top: 252px;
    right: 0;
    left: 0;
    padding: 0 var(--ui-space-16, 16px);
    text-align: center;
    animation: achu-text-in 0.6s ease-out 0.45s both;
  }
  .achu-kicker {
    color: var(--achievement-metal-highlight);
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
    letter-spacing: 0.2em;
    text-indent: 0.2em;
  }
  .achu-name {
    margin-top: var(--ui-space-6, 6px);
    color: #fff;
    font-size: var(--ui-font-28, 28px);
    font-weight: 800;
    text-shadow: 0 2px 18px color-mix(in srgb, var(--achievement-accent) 70%, transparent);
  }
  .achu-sub {
    margin-top: var(--ui-space-6, 6px);
    color: rgba(255, 255, 255, 0.74);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .achu-hint {
    position: absolute;
    /* ui-density-fixed: 庆祝舞台内的文字锚点，与徽章几何对齐 */
    bottom: 4px;
    color: rgba(255, 255, 255, 0.42);
    font-size: var(--ui-font-11_5, 11.5px);
  }

  @keyframes achu-pop {
    0% {
      opacity: 0;
      transform: scale(0.2) rotate(-14deg);
    }
    60% {
      opacity: 1;
      transform: scale(1.12) rotate(3deg);
    }
    100% {
      opacity: 1;
      transform: scale(1) rotate(0);
    }
  }
  @keyframes achu-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
  @keyframes achu-glow-in {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes achu-glow {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.75;
    }
    50% {
      transform: scale(1.08);
      opacity: 1;
    }
  }
  @keyframes achu-ray-in {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes achu-ray-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes achu-ring {
    0% {
      opacity: 0.75;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.8);
    }
  }
  @keyframes achu-spark {
    0%,
    100% {
      opacity: 0;
      transform: translate(var(--sx), var(--sy)) scale(0.2) rotate(0deg);
    }
    45% {
      opacity: 1;
      transform: translate(var(--sx), var(--sy)) scale(1) rotate(45deg);
    }
  }
  @keyframes achu-burst {
    0% {
      opacity: 1;
      transform: translate(0, 0) rotate(0);
    }
    100% {
      opacity: 0;
      transform: translate(var(--tx), var(--ty)) rotate(var(--rot));
    }
  }
  @keyframes achu-text-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .achu-fade-enter-active,
  .achu-fade-leave-active {
    transition: opacity 0.25s ease;
  }
  .achu-fade-enter-from,
  .achu-fade-leave-to {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .achu-glow,
    .achu-rays,
    .achu-text {
      animation: none;
    }
    .achu-emblem {
      animation: achu-text-in 0.3s ease-out both;
    }
    .achu-ring,
    .achu-spark,
    .achu-confetti {
      display: none;
    }
  }

  :global(.disable-animations .achu-mask),
  :global(.disable-animations .achu-stage *) {
    animation: none !important;
    transition: none !important;
  }
</style>
