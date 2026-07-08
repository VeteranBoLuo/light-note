<template>
  <Teleport to="body">
  <transition name="lvup-fade" appear>
    <div v-if="visible" class="lvup-mask" @click="close">
      <div class="lvup-stage" @click.stop>
        <div class="lvup-rays"></div>
        <div class="lvup-ring lvup-ring--1"></div>
        <div class="lvup-ring lvup-ring--2"></div>

        <div class="lvup-badge" :class="`tier-${tier}`">
          <span class="lvup-badge-shine"></span>
          <span class="lvup-lv">Lv.{{ level }}</span>
        </div>

        <ul class="lvup-confetti" aria-hidden="true">
          <li v-for="p in pieces" :key="p.i" :style="p.style"></li>
        </ul>

        <div class="lvup-text">
          <div class="lvup-title">{{ t('growth.levelUpTitle') }}</div>
          <div class="lvup-name">{{ name }}</div>
          <div class="lvup-sub">{{ t('growth.levelUpSub', { lv: level }) }}</div>
        </div>

        <div class="lvup-hint">{{ t('growth.levelUpDismiss') }}</div>
      </div>
    </div>
  </transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{ level: number; name: string }>();
  const emit = defineEmits<{ (e: 'close'): void }>();
  const { t } = useI18n();

  const visible = ref(true);
  const tier = computed(() => (props.level >= 13 ? 5 : props.level >= 10 ? 4 : props.level >= 7 ? 3 : props.level >= 4 ? 2 : 1));

  // 彩带:从中心爆发,随机角度/距离/颜色/延迟
  const COLORS = ['#615ced', '#22d3ee', '#fbbf24', '#f43f5e', '#34d399', '#fb923c', '#a855f7'];
  const pieces = Array.from({ length: 28 }).map((_, i) => {
    const angle = (360 / 28) * i + (i % 3) * 7;
    const dist = 120 + (i % 5) * 26;
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

  let timer: ReturnType<typeof setTimeout> | null = null;
  function close() {
    if (!visible.value) return;
    visible.value = false;
    if (timer) clearTimeout(timer);
    setTimeout(() => emit('close'), 260); // 等淡出过渡结束
  }
  onMounted(() => {
    timer = setTimeout(close, 4200); // 自动关闭
  });
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<style scoped lang="less">
  .lvup-mask {
    position: fixed;
    inset: 0;
    z-index: 999999; /* 高于全局搜索下拉(300001)与 AI 助手(200000),庆祝动画盖住一切 */
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

  /* 光环脉冲 */
  .lvup-ring {
    position: absolute;
    top: 92px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.5);
  }
  .lvup-ring--1 {
    animation: lvup-ring 1.6s ease-out infinite;
  }
  .lvup-ring--2 {
    animation: lvup-ring 1.6s ease-out infinite 0.8s;
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
  .tier-1 {
    background: linear-gradient(135deg, #6b7280, #9ca3af);
  }
  .tier-2 {
    background: linear-gradient(135deg, #2563eb, #38bdf8);
  }
  .tier-3 {
    background: linear-gradient(135deg, #7c3aed, #a855f7);
  }
  .tier-4 {
    background: linear-gradient(135deg, #d97706, #fbbf24);
  }
  .tier-5 {
    background: linear-gradient(135deg, #db2777, #f43f5e, #fb923c);
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
    .lvup-confetti li {
      animation: none;
    }
    .lvup-badge {
      animation: lvup-pop 0.4s ease-out both;
    }
    .lvup-ring {
      display: none;
    }
  }
</style>
