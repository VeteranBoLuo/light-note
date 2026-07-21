<template>
  <Teleport to="body">
  <transition name="lvup-fade" appear>
    <div v-if="visible" class="lvup-mask" @click="close">
      <div class="lvup-stage" @click.stop>
        <div class="lvup-rays" :class="`tier-${tier}`"></div>
        <div v-if="tier >= 5" class="lvup-aura"></div>
        <div
          v-for="r in ringCount"
          :key="r"
          class="lvup-ring"
          :style="{ animationDelay: `${(r - 1) * 0.5}s` }"
        ></div>

        <div v-if="tier >= 4" class="lvup-crown" :class="{ 'crown-gold': tier >= 5 }" aria-hidden="true">👑</div>

        <div class="lvup-badge" :class="`tier-${tier}`">
          <span class="lvup-badge-shine"></span>
          <span class="lvup-lv">Lv.{{ level }}</span>
        </div>

        <ul class="lvup-confetti" aria-hidden="true">
          <li v-for="p in pieces" :key="p.i" :style="p.style"></li>
        </ul>

        <div class="lvup-text">
          <div class="lvup-title">{{ t('growth.levelUpTitle') }}</div>
          <div class="lvup-name">{{ t('growth.ranks.' + level) }}</div>
          <div class="lvup-sub">{{ t('growth.levelUpSub', { lv: level }) }}</div>
        </div>

        <div class="lvup-hint">{{ t('growth.levelUpDismiss') }}</div>
      </div>
    </div>
  </transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { tierOf } from '@/config/growthTier';

  const props = defineProps<{ level: number; name: string }>();
  const emit = defineEmits<{ (e: 'close'): void }>();
  const { t } = useI18n();

  const visible = ref(true);
  // tier 越高越隆重(1~5)。阈值收口在 config/growthTier。
  const tier = computed(() => tierOf(props.level));

  // 光环层数随 tier 递增:tier1-2 两环、tier3-4 三环、tier5 四环
  const ringCount = computed(() => (tier.value >= 5 ? 4 : tier.value >= 3 ? 3 : 2));

  // 彩带:数量随 tier 递增(tier1≈22 → tier5≈54),从中心爆发,随机角度/距离/颜色/延迟
  const COLORS = ['#615ced', '#22d3ee', '#fbbf24', '#f43f5e', '#34d399', '#fb923c', '#a855f7'];
  const pieces = computed(() => {
    const count = 14 + tier.value * 8;
    return Array.from({ length: count }).map((_, i) => {
      const angle = (360 / count) * i + (i % 3) * 7;
      const dist = 120 + (i % 5) * 26 + tier.value * 8;
      const rad = (angle * Math.PI) / 180;
      return {
        i,
        style: {
          '--tx': `${Math.cos(rad) * dist}px`,
          '--ty': `${Math.sin(rad) * dist}px`,
          '--rot': `${(i % 2 ? 1 : -1) * (180 + (i % 6) * 60)}deg`,
          '--delay': `${(i % 7) * 40}ms`,
          background: COLORS[i % COLORS.length],
          width: i % 3 === 0 ? '7px' : '9px',
          height: i % 3 === 0 ? '12px' : '9px',
        } as Record<string, string>,
      };
    });
  });

  function close() {
    if (!visible.value) return;
    visible.value = false;
    setTimeout(() => emit('close'), 260); // 等淡出过渡结束
  }
  // 注意:不再设自动关闭定时器。庆祝动画常驻,直到用户点击遮罩或刷新页面(方便截图/展示)。
</script>

<style scoped lang="less">
  .lvup-mask {
    position: fixed;
    inset: 0;
    z-index: 1200; /* 高于全局搜索(1000)与 AI 助手(900),庆祝动画盖住一切 */
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at center, rgba(24, 20, 60, 0.62), rgba(10, 8, 26, 0.82));
    backdrop-filter: blur(4px);
    cursor: pointer;
  }
  .lvup-stage {
    position: relative;
    width: 320px;
    height: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  /* 放射光 */
  .lvup-rays {
    position: absolute;
    top: 92px;
    width: 460px;
    height: 460px;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0 8deg,
      rgba(255, 255, 255, 0.14) 8deg 16deg,
      transparent 16deg 24deg
    );
    animation:
      lvup-ray-in 0.5s ease-out both,
      lvup-ray-spin 14s linear infinite 0.5s;
    -webkit-mask: radial-gradient(circle, transparent 34px, #000 36px 120px, transparent 150px);
    mask: radial-gradient(circle, transparent 34px, #000 36px 120px, transparent 150px);
  }
  /* 放射光强度随 tier 递增,tier5 转为金色 */
  .lvup-rays.tier-1 {
    opacity: 0.4;
  }
  .lvup-rays.tier-2 {
    opacity: 0.6;
  }
  .lvup-rays.tier-3 {
    opacity: 0.8;
  }
  .lvup-rays.tier-4 {
    opacity: 0.95;
    filter: brightness(1.15);
  }
  .lvup-rays.tier-5 {
    opacity: 1;
    filter: brightness(1.4) saturate(1.3);
    background: conic-gradient(
      from 0deg,
      transparent 0 7deg,
      rgba(255, 214, 130, 0.32) 7deg 15deg,
      transparent 15deg 22deg
    );
  }

  /* tier5 专属金色光晕 */
  .lvup-aura {
    position: absolute;
    top: 92px;
    width: 210px;
    height: 210px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 196, 92, 0.5), rgba(255, 150, 60, 0.12) 55%, transparent 72%);
    animation: lvup-aura 2.2s ease-in-out infinite;
    pointer-events: none;
  }

  /* 光环脉冲(数量随 tier) */
  .lvup-ring {
    position: absolute;
    top: 92px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.5);
    animation: lvup-ring 1.7s ease-out infinite;
  }

  /* 皇冠(tier4 起,tier5 镀金) */
  .lvup-crown {
    position: absolute;
    top: 58px;
    left: 50%;
    z-index: 3;
    font-size: 30px;
    line-height: 1;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.45));
    animation: lvup-crown-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
  }
  .lvup-crown.crown-gold {
    filter: drop-shadow(0 0 12px rgba(255, 200, 80, 0.95));
  }

  /* 徽章 */
  .lvup-badge {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow:
      0 18px 40px -12px rgba(0, 0, 0, 0.6),
      0 0 0 6px rgba(255, 255, 255, 0.08);
    overflow: hidden;
    animation:
      lvup-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both,
      lvup-float 2.6s ease-in-out infinite 0.7s;
    margin-bottom: 80px;
  }
  .lvup-lv {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    z-index: 1;
  }
  .lvup-badge-shine {
    position: absolute;
    top: 0;
    left: -60%;
    width: 50%;
    height: 100%;
    background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    transform: skewX(-18deg);
    animation: lvup-shine 1.8s ease-in-out 0.7s infinite;
  }
  /* 徽章配色随 tier(用 .lvup-badge 前缀,避免误套到 .lvup-rays.tier-N) */
  .lvup-badge.tier-1 {
    background: linear-gradient(135deg, #6b7280, #9ca3af);
  }
  .lvup-badge.tier-2 {
    background: linear-gradient(135deg, #2563eb, #38bdf8);
  }
  .lvup-badge.tier-3 {
    background: linear-gradient(135deg, #7c3aed, #a855f7);
  }
  .lvup-badge.tier-4 {
    background: linear-gradient(135deg, #d97706, #fbbf24);
    box-shadow:
      0 18px 40px -12px rgba(0, 0, 0, 0.6),
      0 0 0 6px rgba(255, 255, 255, 0.08),
      0 0 28px rgba(251, 191, 36, 0.55);
  }
  .lvup-badge.tier-5 {
    background: linear-gradient(135deg, #db2777, #f43f5e, #fb923c);
    box-shadow:
      0 18px 40px -12px rgba(0, 0, 0, 0.6),
      0 0 0 6px rgba(255, 255, 255, 0.12),
      0 0 42px rgba(244, 63, 94, 0.65);
  }

  /* 彩带 */
  .lvup-confetti {
    position: absolute;
    top: 140px;
    left: 50%;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lvup-confetti li {
    position: absolute;
    border-radius: 2px;
    opacity: 0;
    animation: lvup-burst 1s ease-out var(--delay) forwards;
  }

  /* 文字 */
  .lvup-text {
    position: absolute;
    bottom: 44px;
    text-align: center;
    animation: lvup-text-in 0.6s ease-out 0.35s both;
  }
  .lvup-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #ffe9a8;
    text-indent: 0.28em;
  }
  .lvup-name {
    margin-top: 6px;
    font-size: 30px;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 2px 18px rgba(124, 92, 255, 0.6);
  }
  .lvup-sub {
    margin-top: 4px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }
  .lvup-hint {
    position: absolute;
    bottom: 8px;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.42);
  }

  @keyframes lvup-pop {
    0% {
      transform: scale(0) rotate(-18deg);
    }
    60% {
      transform: scale(1.14) rotate(4deg);
    }
    100% {
      transform: scale(1) rotate(0);
    }
  }
  @keyframes lvup-float {
    0%,
    100% {
      margin-top: 0;
    }
    50% {
      margin-top: -6px;
    }
  }
  @keyframes lvup-shine {
    0% {
      left: -60%;
    }
    55%,
    100% {
      left: 130%;
    }
  }
  @keyframes lvup-ring {
    0% {
      transform: scale(1);
      opacity: 0.7;
    }
    100% {
      transform: scale(2.6);
      opacity: 0;
    }
  }
  @keyframes lvup-aura {
    0%,
    100% {
      transform: scale(0.9);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.18);
      opacity: 0.9;
    }
  }
  @keyframes lvup-crown-in {
    0% {
      transform: translate(-50%, 8px) scale(0);
      opacity: 0;
    }
    100% {
      transform: translate(-50%, 0) scale(1);
      opacity: 1;
    }
  }
  @keyframes lvup-ray-in {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @keyframes lvup-ray-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes lvup-burst {
    0% {
      transform: translate(0, 0) rotate(0);
      opacity: 1;
    }
    100% {
      transform: translate(var(--tx), var(--ty)) rotate(var(--rot));
      opacity: 0;
    }
  }
  @keyframes lvup-text-in {
    from {
      transform: translateY(14px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .lvup-fade-enter-active,
  .lvup-fade-leave-active {
    transition: opacity 0.25s ease;
  }
  .lvup-fade-enter-from,
  .lvup-fade-leave-to {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .lvup-rays,
    .lvup-ring,
    .lvup-badge-shine,
    .lvup-confetti li,
    .lvup-aura {
      animation: none;
    }
    .lvup-badge {
      animation: lvup-pop 0.4s ease-out both;
    }
    .lvup-ring {
      display: none;
    }
    .lvup-crown {
      animation: none;
    }
  }
</style>
