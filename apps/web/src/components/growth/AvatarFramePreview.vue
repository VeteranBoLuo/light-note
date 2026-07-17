<template>
  <div
    class="avatar-frame"
    :class="[`avatar-frame--${variant || 'default'}`, { 'avatar-frame--compact': props.size <= 40 }]"
    :style="frameStyle"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="avatar-frame__ring" aria-hidden="true"></span>
    <span class="avatar-frame__motif" aria-hidden="true"></span>
    <span class="avatar-frame__orbit" aria-hidden="true"></span>
    <span class="avatar-frame__comet" aria-hidden="true"></span>
    <span class="avatar-frame__portrait">
      <SvgIcon :src="src" :size="size" />
    </span>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { frameVariant } from '@/config/growthFrames';

  const props = withDefaults(
    defineProps<{
      frameId?: string | null;
      src: string;
      size?: number;
      decorative?: boolean;
    }>(),
    {
      frameId: null,
      size: 60,
      decorative: true,
    },
  );

  const variant = computed(() => frameVariant(props.frameId));
  const frameStyle = computed(() => {
    const rim = Math.max(3, Math.round(props.size * 0.1));
    return {
      '--frame-size': `${props.size}px`,
      '--frame-rim': `${rim}px`,
      '--frame-outer-size': `${props.size + rim * 2}px`,
      '--frame-motif-inset': `${Math.max(1, Math.round(rim * 0.35))}px`,
      '--frame-motif-outset': `${-Math.max(1, Math.round(rim * 0.35))}px`,
      // 小头像沿用同一套视觉语言，但所有光晕随尺寸收紧，避免导航栏出现一团扩散紫雾。
      '--frame-galaxy-glow': `${Math.max(5, Math.round(props.size * 0.14))}px`,
      '--frame-galaxy-orbit-glow': `${Math.max(3, Math.round(props.size * 0.08))}px`,
      '--frame-galaxy-star-glow': `${Math.max(4, Math.round(props.size * 0.11))}px`,
      '--frame-galaxy-star-wide-glow': `${Math.max(6, Math.round(props.size * 0.15))}px`,
      '--frame-galaxy-drop-y': `${Math.max(2, Math.round(props.size * 0.06))}px`,
      '--frame-galaxy-drop-blur': `${Math.max(7, Math.round(props.size * 0.16))}px`,
      '--frame-galaxy-drop-spread': `-${Math.max(3, Math.round(props.size * 0.1))}px`,
    };
  });
</script>

<style scoped lang="less">
  .avatar-frame {
    position: relative;
    isolation: isolate;
    display: inline-grid;
    place-items: center;
    width: var(--frame-outer-size);
    height: var(--frame-outer-size);
    line-height: 0;
    flex: 0 0 auto;
  }

  .avatar-frame__ring,
  .avatar-frame__motif,
  .avatar-frame__orbit,
  .avatar-frame__comet {
    position: absolute;
    pointer-events: none;
  }

  .avatar-frame__ring,
  .avatar-frame__motif {
    inset: 0;
    border-radius: 50%;
  }

  .avatar-frame__orbit,
  .avatar-frame__comet {
    display: none;
  }

  .avatar-frame__ring {
    z-index: 0;
    background: conic-gradient(from 180deg, #8b5cf6, #6366f1, #8b5cf6);
    box-shadow: 0 5px 14px -7px rgba(79, 70, 229, 0.9);
  }

  .avatar-frame__motif {
    z-index: 1;
  }

  .avatar-frame__portrait {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-size);
    height: var(--frame-size);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--background-color) 85%, transparent);
    border-radius: 50%;
    background: var(--background-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--card-border-color) 35%, transparent);
  }

  .avatar-frame__portrait :deep(img),
  .avatar-frame__portrait :deep(.icon-base64),
  .avatar-frame__portrait :deep(.icon-fixed-base64) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit;
    object-fit: cover;
  }

  /* 鎏金：金属分层与一束缓慢扫过的高光。 */
  .avatar-frame--gold .avatar-frame__ring {
    background: conic-gradient(
      from 210deg,
      #7c2d12,
      #d97706 12%,
      #fde68a 25%,
      #f59e0b 38%,
      #fff3b0 51%,
      #b45309 68%,
      #fbbf24 82%,
      #7c2d12
    );
    box-shadow:
      0 0 0 1px rgba(253, 230, 138, 0.78),
      0 6px 16px -7px rgba(180, 83, 9, 0.82);
    animation: frame-gold-turn 11s linear infinite;
  }

  .avatar-frame--gold .avatar-frame__motif {
    inset: var(--frame-motif-inset);
    overflow: hidden;
    background: linear-gradient(118deg, transparent 37%, rgba(255, 255, 255, 0.82) 49%, transparent 60%);
    mix-blend-mode: screen;
    animation: frame-gold-glint 3.8s ease-in-out infinite;
  }

  /* 樱绯：柔和双层花瓣环与轻微呼吸，不以颜色轮换冒充动效。 */
  .avatar-frame--sakura .avatar-frame__ring {
    background: conic-gradient(from 15deg, #fce7f3, #f472b6, #be185d, #f9a8d4, #fff1f7, #ec4899, #fce7f3);
    box-shadow:
      0 0 0 2px rgba(251, 207, 232, 0.76),
      0 7px 16px -8px rgba(219, 39, 119, 0.8);
  }

  .avatar-frame--sakura .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(ellipse at 18% 38%, rgba(255, 255, 255, 0.92) 0 7%, transparent 8%),
      radial-gradient(ellipse at 78% 23%, rgba(255, 222, 239, 0.98) 0 6%, transparent 7%),
      radial-gradient(ellipse at 86% 72%, rgba(255, 255, 255, 0.85) 0 5%, transparent 6%),
      radial-gradient(ellipse at 26% 84%, rgba(244, 114, 182, 0.85) 0 6%, transparent 7%);
    filter: drop-shadow(0 1px 2px rgba(190, 24, 93, 0.26));
    animation: frame-sakura-float 4.4s ease-in-out infinite;
  }

  /* 霓虹：两色能量环与轨道光点，强调赛博轮廓。 */
  .avatar-frame--neon .avatar-frame__ring {
    background: conic-gradient(from 0deg, #22d3ee, #3b82f6 23%, #7c3aed 46%, #e879f9 68%, #22d3ee);
    box-shadow:
      0 0 8px rgba(34, 211, 238, 0.76),
      0 0 18px rgba(168, 85, 247, 0.54),
      inset 0 0 6px rgba(255, 255, 255, 0.72);
    animation: frame-neon-pulse 2.2s ease-in-out infinite;
  }

  .avatar-frame--neon .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(103, 232, 249, 0.7);
    box-shadow:
      0 0 0 1px rgba(192, 132, 252, 0.32),
      0 0 8px rgba(34, 211, 238, 0.5);
    clip-path: polygon(0 39%, 29% 0, 100% 24%, 78% 100%, 10% 82%);
    animation: frame-neon-orbit 6s linear infinite;
  }

  /* 星河：深紫星云、星点、环绕星轨和掠过的彗星，作为高阶款的专属语言。 */
  .avatar-frame--galaxy .avatar-frame__ring {
    background:
      radial-gradient(circle at 68% 22%, rgba(255, 255, 255, 0.98) 0 3%, transparent 4%),
      radial-gradient(circle at 21% 68%, rgba(255, 255, 255, 0.85) 0 2.5%, transparent 3.5%),
      conic-gradient(from 45deg, #312e81, #7c3aed 18%, #ec4899 39%, #60a5fa 60%, #4f46e5 80%, #312e81);
    box-shadow:
      0 0 0 2px rgba(196, 181, 253, 0.72),
      0 0 var(--frame-galaxy-glow) rgba(139, 92, 246, 0.74),
      0 var(--frame-galaxy-drop-y) var(--frame-galaxy-drop-blur) var(--frame-galaxy-drop-spread) rgba(49, 46, 129, 0.8);
    animation: frame-galaxy-turn 13s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(circle at 19% 18%, #fff 0 2%, transparent 3%),
      radial-gradient(circle at 84% 38%, #e0e7ff 0 1.8%, transparent 3%),
      radial-gradient(circle at 44% 95%, #fff 0 1.7%, transparent 3%);
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.9));
    animation: frame-galaxy-twinkle 2.7s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motif::after {
    position: absolute;
    top: 7%;
    left: 12%;
    width: 20%;
    aspect-ratio: 1;
    content: '';
    background: linear-gradient(
      90deg,
      transparent 43%,
      rgba(255, 255, 255, 0.96) 46% 54%,
      transparent 57%
    );
    clip-path: polygon(46% 0, 54% 0, 59% 41%, 100% 46%, 100% 54%, 59% 59%, 54% 100%, 46% 100%, 41% 59%, 0 54%, 0 46%, 41% 41%);
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.95));
    animation: frame-galaxy-starburst 4.6s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -8%;
    border: 1px solid rgba(224, 231, 255, 0.4);
    border-right-color: transparent;
    border-bottom-color: transparent;
    border-radius: 50%;
    box-shadow: 0 0 var(--frame-galaxy-orbit-glow) rgba(196, 181, 253, 0.42);
    transform: rotate(-24deg);
    animation: frame-galaxy-orbit 7.4s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit::after {
    position: absolute;
    top: -2px;
    left: 51%;
    width: max(3px, 10%);
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 2px rgba(219, 234, 254, 0.58),
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.86),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(129, 140, 248, 0.76);
  }

  .avatar-frame--galaxy .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 6%;
    right: -5%;
    width: 25%;
    height: max(2px, 4%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(196, 181, 253, 0.42) 48%, #fff);
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.72);
    transform: rotate(-28deg);
    transform-origin: right center;
    animation: frame-galaxy-comet 5.8s ease-in-out infinite;
  }

  /* 顶部/移动端的小头像只保留紧凑星轨，完整彗星与爆闪留给商店的展示尺寸。 */
  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__motif::after,
  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__comet {
    display: none;
  }

  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__orbit {
    inset: -4%;
  }

  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__orbit::after {
    width: max(2px, 8%);
    box-shadow:
      0 0 0 1px rgba(219, 234, 254, 0.62),
      0 0 var(--frame-galaxy-orbit-glow) rgba(129, 140, 248, 0.74);
  }

  @keyframes frame-gold-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-gold-glint {
    0%,
    28%,
    100% {
      opacity: 0.12;
      transform: translateX(-24%);
    }
    52% {
      opacity: 0.86;
      transform: translateX(22%);
    }
  }

  @keyframes frame-sakura-float {
    0%,
    100% {
      opacity: 0.72;
      transform: rotate(-5deg) scale(0.95);
    }
    50% {
      opacity: 1;
      transform: rotate(6deg) scale(1.04);
    }
  }

  @keyframes frame-neon-pulse {
    0%,
    100% {
      filter: brightness(0.95) saturate(1);
      transform: scale(0.98);
    }
    50% {
      filter: brightness(1.25) saturate(1.25);
      transform: scale(1.02);
    }
  }

  @keyframes frame-neon-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-galaxy-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-galaxy-twinkle {
    0%,
    100% {
      opacity: 0.38;
      transform: scale(0.94);
    }
    50% {
      opacity: 1;
      transform: scale(1.08);
    }
  }

  @keyframes frame-galaxy-starburst {
    0%,
    32%,
    100% {
      opacity: 0;
      transform: scale(0.42) rotate(12deg);
    }
    45% {
      opacity: 1;
      transform: scale(1.18) rotate(12deg);
    }
    58% {
      opacity: 0;
      transform: scale(1.45) rotate(12deg);
    }
  }

  @keyframes frame-galaxy-orbit {
    to {
      transform: rotate(336deg);
    }
  }

  @keyframes frame-galaxy-comet {
    0%,
    54%,
    100% {
      opacity: 0;
      transform: translate(-24%, 18%) rotate(-28deg) scaleX(0.5);
    }
    64% {
      opacity: 1;
      transform: translate(0, 0) rotate(-28deg) scaleX(1);
    }
    76% {
      opacity: 0;
      transform: translate(22%, -18%) rotate(-28deg) scaleX(1.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-frame__ring,
    .avatar-frame__motif,
    .avatar-frame__orbit,
    .avatar-frame__comet {
      animation: none !important;
    }
  }
</style>
