<template>
  <div
    ref="frameElement"
    class="avatar-frame"
    :class="[
      `avatar-frame--${variant || 'default'}`,
      {
        'avatar-frame--motion-paused': isMotionPaused,
      },
    ]"
    :style="frameStyle"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="avatar-frame__canvas">
      <span class="avatar-frame__ring" aria-hidden="true"></span>
      <span class="avatar-frame__motif" aria-hidden="true"></span>
      <span class="avatar-frame__orbit" aria-hidden="true"></span>
      <span class="avatar-frame__comet" aria-hidden="true"></span>
      <span v-if="hasFrameIdentity" class="avatar-frame__signature" aria-hidden="true">
        <SvgIcon
          v-if="variant === 'dragon'"
          class="avatar-frame__dragon-crest"
          :src="icon.avatarFrame.dragonCrest"
          :size="FRAME_DRAGON_ART_SIZE"
        />
        <span class="avatar-frame__signature-mark"></span>
      </span>
      <span class="avatar-frame__portrait">
        <SvgIcon :src="src" :size="FRAME_DESIGN_AVATAR_SIZE" />
      </span>
      <SvgIcon
        v-if="variant === 'dragon'"
        class="avatar-frame__dragon-head"
        :src="icon.avatarFrame.dragonHead"
        :size="FRAME_DRAGON_ART_SIZE"
        aria-hidden="true"
      />
    </span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';

  // 头像框只维护一份与商店卡片一致的 64px 设计画布，真实入口整体等比缩放。
  // 不允许再按 30/32/40/64px 分别重排 1px 描边、渐变和轨道，否则小尺寸会发生像素取整，
  // 造成商店预览的外置星点在顶栏/个人中心/聊天室中向内挤压或圆环锯齿化。
  const FRAME_DESIGN_AVATAR_SIZE = 64;
  const FRAME_DESIGN_RIM = 6;
  const FRAME_DESIGN_OUTER_SIZE = FRAME_DESIGN_AVATAR_SIZE + FRAME_DESIGN_RIM * 2;
  // 96px 素材盒配合带 bleed 的 132px viewBox，主体视觉尺寸不变，但为边缘描边和阴影预留安全区。
  const FRAME_DRAGON_ART_SIZE = 96;
  const FRAME_IDENTITY_VARIANTS = new Set(['dragon']);

  const props = withDefaults(
    defineProps<{
      frameId?: string | null;
      src: string;
      size?: number;
      decorative?: boolean;
      animated?: boolean;
      pauseWhenOffscreen?: boolean;
    }>(),
    {
      frameId: null,
      size: 60,
      decorative: true,
      animated: true,
      pauseWhenOffscreen: false,
    },
  );

  const frameElement = ref<HTMLElement | null>(null);
  const isMotionVisible = ref(!props.pauseWhenOffscreen);
  const isMotionPaused = computed(() => !props.animated || (props.pauseWhenOffscreen && !isMotionVisible.value));
  let visibilityObserver: IntersectionObserver | null = null;

  onMounted(() => {
    if (!props.pauseWhenOffscreen || typeof IntersectionObserver === 'undefined' || !frameElement.value) return;
    const scrollContainer = frameElement.value.closest('.community-message-list');
    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isMotionVisible.value = Boolean(entry?.isIntersecting);
      },
      {
        root: scrollContainer,
        rootMargin: '24px 0px',
        threshold: 0.01,
      },
    );
    visibilityObserver.observe(frameElement.value);
  });

  onBeforeUnmount(() => {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
  });

  const variant = computed(() => frameVariant(props.frameId));
  const hasFrameIdentity = computed(() => FRAME_IDENTITY_VARIANTS.has(variant.value || ''));
  const frameStyle = computed(() => {
    const displayAvatarSize = Math.max(1, Number(props.size) || 1);
    const scale = displayAvatarSize / FRAME_DESIGN_AVATAR_SIZE;
    // 外层占位仍贴合各入口原来的整数像素盒（30→36、32→38、40→48），
    // 画布则在盒内绝对居中，避免 flex 右对齐时因 0.375px 余量看起来向一侧偏移。
    const displayOuterSize = Math.round(FRAME_DESIGN_OUTER_SIZE * scale);
    // 天穹外圈点阵按设计比例缩小时保留 1px 的可见下限；几何位置仍来自同一 64px 画布，
    // 因而不会再发生点阵向圆环内收，只增强顶栏/聊天室小头像上的抗锯齿可读性。
    const constellationStroke = Math.min(3, Math.max(1.5, 1 / scale));
    return {
      '--frame-display-outer-size': `${displayOuterSize}px`,
      '--frame-canvas-scale': String(scale),
      '--frame-constellation-stroke': `${constellationStroke}px`,
      '--frame-size': `${FRAME_DESIGN_AVATAR_SIZE}px`,
      '--frame-rim': `${FRAME_DESIGN_RIM}px`,
      '--frame-outer-size': `${FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-motif-inset': '2px',
      '--frame-motif-outset': '-2px',
      '--frame-galaxy-glow': '9px',
      '--frame-galaxy-orbit-glow': '5px',
      '--frame-galaxy-star-glow': '7px',
      '--frame-galaxy-star-wide-glow': '10px',
      '--frame-celestial-glow': '13px',
      '--frame-galaxy-drop-y': '4px',
      '--frame-galaxy-drop-blur': '10px',
      '--frame-galaxy-drop-spread': '-6px',
    };
  });
</script>

<style scoped lang="less">
  .avatar-frame {
    position: relative;
    isolation: isolate;
    display: inline-grid;
    place-items: center;
    width: var(--frame-display-outer-size);
    height: var(--frame-display-outer-size);
    overflow: visible;
    line-height: 0;
    flex: 0 0 auto;
  }

  .avatar-frame__canvas {
    position: absolute;
    top: 50%;
    left: 50%;
    display: inline-grid;
    place-items: center;
    width: var(--frame-outer-size);
    height: var(--frame-outer-size);
    flex: 0 0 auto;
    transform: translate(-50%, -50%) scale(var(--frame-canvas-scale));
    transform-origin: center;
    backface-visibility: hidden;
  }

  .avatar-frame__ring,
  .avatar-frame__motif,
  .avatar-frame__orbit,
  .avatar-frame__comet,
  .avatar-frame__signature {
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

  .avatar-frame__signature {
    z-index: 4;
    inset: 0;
    transform-origin: center;
    will-change: transform;
  }

  .avatar-frame__signature-mark {
    position: absolute;
    display: block;
    pointer-events: none;
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

  /* 薄荷：积分基础款使用晶莹双环、八向切面和四枚薄荷晶点，不使用持续动效。 */
  .avatar-frame--mint .avatar-frame__ring {
    background: conic-gradient(
      from 195deg,
      #064e3b,
      #0f766e 14%,
      #5eead4 27%,
      #ecfdf5 38%,
      #2dd4bf 51%,
      #99f6e4 66%,
      #0d9488 82%,
      #064e3b
    );
    box-shadow:
      0 0 0 1px rgba(209, 250, 229, 0.96),
      0 0 0 3px rgba(20, 184, 166, 0.2),
      inset 0 0 5px rgba(255, 255, 255, 0.52),
      inset 0 -3px 5px rgba(6, 78, 59, 0.28),
      0 0 7px rgba(94, 234, 212, 0.3),
      0 7px 16px -8px rgba(13, 148, 136, 0.86);
  }

  .avatar-frame--mint .avatar-frame__ring::before,
  .avatar-frame--mint .avatar-frame__ring::after,
  .avatar-frame--ink .avatar-frame__ring::before,
  .avatar-frame--ink .avatar-frame__ring::after,
  .avatar-frame--moonstone .avatar-frame__ring::before,
  .avatar-frame--moonstone .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--mint .avatar-frame__ring::before {
    inset: 7%;
    border: 1.5px solid rgba(236, 253, 245, 0.92);
    border-right-color: rgba(13, 148, 136, 0.64);
    box-shadow: inset 0 0 3px rgba(6, 95, 70, 0.46);
  }

  .avatar-frame--mint .avatar-frame__ring::after {
    inset: -7%;
    background:
      radial-gradient(circle at 50% 3%, #fff 0 2.8%, #5eead4 3.8% 6%, transparent 7%),
      radial-gradient(circle at 97% 50%, #ecfdf5 0 2.8%, #14b8a6 3.8% 6%, transparent 7%),
      radial-gradient(circle at 50% 97%, #fff 0 2.8%, #2dd4bf 3.8% 6%, transparent 7%),
      radial-gradient(circle at 3% 50%, #d1fae5 0 2.8%, #0d9488 3.8% 6%, transparent 7%);
    filter: drop-shadow(0 0 3px rgba(94, 234, 212, 0.72));
  }

  .avatar-frame--mint .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(167, 243, 208, 0.7);
    background: repeating-conic-gradient(from 22.5deg, rgba(255, 255, 255, 0.88) 0deg 2deg, transparent 2deg 45deg);
    box-shadow: inset 0 0 3px rgba(236, 253, 245, 0.54);
  }

  /* 墨韵：积分基础款使用墨玉双环与不对称笔锋，静态但有明确材质层次。 */
  .avatar-frame--ink .avatar-frame__ring {
    background: conic-gradient(
      from 28deg,
      #020617,
      #475569 13%,
      #f8fafc 25%,
      #94a3b8 34%,
      #1e293b 48%,
      #030712 67%,
      #cbd5e1 82%,
      #334155 91%,
      #020617
    );
    box-shadow:
      0 0 0 1px rgba(226, 232, 240, 0.82),
      0 0 0 3px rgba(71, 85, 105, 0.22),
      inset 0 0 6px rgba(248, 250, 252, 0.42),
      inset 0 -4px 6px rgba(2, 6, 23, 0.52),
      0 0 6px rgba(148, 163, 184, 0.24),
      0 8px 18px -9px rgba(2, 6, 23, 0.94);
  }

  .avatar-frame--ink .avatar-frame__ring::before {
    inset: 7%;
    border: 1.5px solid rgba(226, 232, 240, 0.74);
    border-bottom-color: rgba(15, 23, 42, 0.9);
    box-shadow: inset 0 0 4px rgba(2, 6, 23, 0.62);
  }

  .avatar-frame--ink .avatar-frame__ring::after {
    inset: -7%;
    border: 2px solid transparent;
    border-top-color: rgba(248, 250, 252, 0.92);
    border-right-color: rgba(100, 116, 139, 0.72);
    border-bottom-color: rgba(15, 23, 42, 0.9);
    border-radius: 46% 54% 43% 57%;
    filter: drop-shadow(0 2px 3px rgba(2, 6, 23, 0.58));
    transform: rotate(-13deg);
  }

  .avatar-frame--ink .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(203, 213, 225, 0.56);
    background:
      radial-gradient(circle at 18% 30%, rgba(248, 250, 252, 0.94) 0 2.8%, transparent 4%),
      radial-gradient(circle at 80% 76%, rgba(100, 116, 139, 0.9) 0 3.2%, transparent 4.5%),
      linear-gradient(138deg, transparent 43%, rgba(248, 250, 252, 0.7) 45% 47%, transparent 49%);
    box-shadow: inset 0 0 4px rgba(226, 232, 240, 0.3);
    clip-path: polygon(8% 27%, 27% 5%, 62% 1%, 93% 24%, 98% 61%, 77% 94%, 42% 99%, 11% 82%, 1% 48%);
  }

  /* 月白：基础档最高价的瓷釉银蓝双环，全部细节保持静态。 */
  .avatar-frame--moonstone .avatar-frame__ring {
    background: conic-gradient(
      from 205deg,
      #334155,
      #94a3b8 15%,
      #f8fafc 28%,
      #bfdbfe 42%,
      #ffffff 54%,
      #93c5fd 69%,
      #64748b 84%,
      #334155
    );
    box-shadow:
      0 0 0 1px rgba(226, 232, 240, 0.94),
      0 0 0 3px rgba(148, 163, 184, 0.2),
      inset 0 0 5px rgba(255, 255, 255, 0.72),
      inset 0 -3px 5px rgba(59, 130, 246, 0.18),
      0 0 7px rgba(191, 219, 254, 0.32),
      0 7px 16px -9px rgba(71, 85, 105, 0.8);
  }

  .avatar-frame--moonstone .avatar-frame__ring::before {
    inset: 7%;
    border: 1.5px solid rgba(255, 255, 255, 0.88);
    border-left-color: rgba(96, 165, 250, 0.66);
    box-shadow: inset 0 0 4px rgba(148, 163, 184, 0.38);
  }

  .avatar-frame--moonstone .avatar-frame__ring::after {
    inset: -6%;
    background:
      radial-gradient(circle at 50% 2%, #fff 0 2.6%, #cbd5e1 3.6% 5.4%, transparent 6.4%),
      radial-gradient(circle at 98% 50%, #eff6ff 0 2.6%, #93c5fd 3.6% 5.4%, transparent 6.4%),
      radial-gradient(circle at 50% 98%, #fff 0 2.6%, #cbd5e1 3.6% 5.4%, transparent 6.4%),
      radial-gradient(circle at 2% 50%, #dbeafe 0 2.6%, #64748b 3.6% 5.4%, transparent 6.4%);
    filter: drop-shadow(0 1px 2px rgba(100, 116, 139, 0.42));
  }

  .avatar-frame--moonstone .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(219, 234, 254, 0.72);
    background: repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.8) 0deg 1.5deg, transparent 1.5deg 90deg);
    box-shadow: inset 0 0 4px rgba(255, 255, 255, 0.48);
  }

  /* 初光：首签免费框保持克制，只用一圈晨光与一个清晰实心标记。 */
  .avatar-frame--first-light .avatar-frame__ring {
    background: conic-gradient(from 210deg, #475569, #94a3b8 38%, #d1d5db 58%, #64748b 76%, #475569);
    box-shadow:
      0 0 0 1px rgba(100, 116, 139, 0.58),
      0 4px 10px -8px rgba(71, 85, 105, 0.7);
  }

  .avatar-frame--first-light .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(226, 232, 240, 0.72);
    background: radial-gradient(circle at 50% 2%, #fef3c7 0 3%, #d97706 4% 5.5%, transparent 6.5%);
  }

  /* 七日晨光：免费进阶按积分基础档控制，只保留静态七段晨曦。 */
  .avatar-frame--streak-seed .avatar-frame__ring {
    background: conic-gradient(
      from -90deg,
      #1e3a8a,
      #3b82f6 30%,
      #bfdbfe 46%,
      #fde68a 56%,
      #f59e0b 68%,
      #475569 84%,
      #1e3a8a
    );
    box-shadow:
      0 0 0 1px rgba(147, 197, 253, 0.68),
      0 6px 14px -8px rgba(37, 99, 235, 0.74);
  }

  .avatar-frame--streak-seed .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(254, 243, 199, 0.72);
    background: repeating-conic-gradient(from -90deg, rgba(255, 255, 255, 0.86) 0deg 3deg, transparent 3deg 51.4deg);
  }

  /* 书页初藏：低饱和纸页环与两枚书签刻度。 */
  .avatar-frame--bookmark-seed .avatar-frame__ring {
    background: conic-gradient(from 28deg, #475569, #75658f 28%, #c4b5d5 49%, #7c6f9b 72%, #475569);
    box-shadow:
      0 0 0 1px rgba(124, 111, 155, 0.52),
      0 5px 11px -8px rgba(71, 85, 105, 0.76);
  }

  .avatar-frame--bookmark-seed .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(237, 233, 254, 0.64);
    background:
      linear-gradient(90deg, transparent 17%, rgba(255, 255, 255, 0.7) 18% 21%, transparent 22%),
      linear-gradient(90deg, transparent 74%, rgba(226, 232, 240, 0.68) 75% 78%, transparent 79%);
  }

  /* 青笔初成：低饱和青墨环上保留一笔浅色墨迹。 */
  .avatar-frame--note-seed .avatar-frame__ring {
    background: conic-gradient(from 205deg, #365f52, #65a98c 31%, #b8d8ca 53%, #6f9f8c 73%, #365f52);
    box-shadow:
      0 0 0 1px rgba(101, 169, 140, 0.5),
      0 5px 11px -8px rgba(54, 95, 82, 0.72);
  }

  .avatar-frame--note-seed .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(209, 232, 222, 0.68);
    background: linear-gradient(132deg, transparent 44%, rgba(236, 253, 245, 0.66) 46% 48%, transparent 50%);
  }

  /* 云匣初启：蓝灰文件环只保留一枚低调的暖色标签。 */
  .avatar-frame--file-seed .avatar-frame__ring {
    background: conic-gradient(from 12deg, #475569, #64748b 32%, #b2becd 53%, #718397 72%, #475569);
    box-shadow:
      0 0 0 1px rgba(113, 131, 151, 0.5),
      0 5px 11px -8px rgba(71, 85, 105, 0.74);
  }

  .avatar-frame--file-seed .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(226, 232, 240, 0.68);
    background:
      linear-gradient(0deg, transparent 76%, rgba(253, 186, 116, 0.7) 77% 80%, transparent 81%),
      radial-gradient(circle at 78% 75%, #e2e8f0 0 2.5%, #64748b 3.5% 5%, transparent 6%);
  }

  /* 鎏金：积分进阶入门档，以慢速扫光和无光点细轨表达“流转”，强度低于樱绯与晚霞。 */
  .avatar-frame--gold .avatar-frame__ring {
    background: conic-gradient(
      from 205deg,
      #78350f,
      #b45309 17%,
      #e6ad35 29%,
      #fff0b3 38%,
      #d28b16 52%,
      #92500b 70%,
      #dba52f 85%,
      #78350f
    );
    box-shadow:
      0 0 0 1px rgba(245, 205, 104, 0.74),
      0 0 0 2px rgba(217, 119, 6, 0.12),
      inset 0 0 5px rgba(255, 247, 214, 0.52),
      0 0 7px rgba(245, 158, 11, 0.22),
      0 5px 12px -7px rgba(146, 80, 11, 0.82);
  }

  .avatar-frame--gold .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    overflow: hidden;
    border: 1px solid rgba(255, 240, 176, 0.62);
    background: linear-gradient(126deg, transparent 31%, rgba(255, 255, 255, 0.86) 46% 52%, transparent 67%);
    mix-blend-mode: screen;
    animation: frame-gold-glint 4.6s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -4%;
    border: 1px solid transparent;
    border-top-color: rgba(255, 240, 176, 0.76);
    border-right-color: rgba(217, 119, 6, 0.4);
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(245, 158, 11, 0.26);
    animation: frame-premium-orbit 14s linear infinite;
  }

  .avatar-frame--gold .avatar-frame__orbit::after {
    position: absolute;
    top: 7%;
    right: 13%;
    width: max(2px, 5%);
    height: max(2px, 5%);
    content: '';
    border-radius: 50%;
    background: #fff3bf;
    box-shadow: 0 0 4px rgba(245, 158, 11, 0.62);
  }

  /* 樱绯：柔和双层花瓣环与轻微呼吸，不以颜色轮换冒充动效。 */
  .avatar-frame--sakura .avatar-frame__ring {
    background: conic-gradient(from 15deg, #fce7f3, #f472b6, #be185d, #f9a8d4, #fff1f7, #ec4899, #fce7f3);
    box-shadow:
      0 0 0 2px rgba(251, 207, 232, 0.76),
      inset 0 0 5px rgba(255, 255, 255, 0.62),
      0 0 8px rgba(244, 114, 182, 0.3),
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

  .avatar-frame--sakura .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -5%;
    border: 1px solid rgba(251, 207, 232, 0.68);
    border-top-color: transparent;
    border-left-color: rgba(244, 114, 182, 0.28);
    border-radius: 50%;
    animation: frame-premium-orbit-reverse 11.5s linear infinite;
  }

  .avatar-frame--sakura .avatar-frame__orbit::after {
    position: absolute;
    right: 7%;
    bottom: 12%;
    width: max(3px, 8%);
    height: max(2px, 5%);
    content: '';
    border-radius: 80% 20% 70% 30%;
    background: #fff1f7;
    box-shadow: 0 0 6px rgba(244, 114, 182, 0.76);
    transform: rotate(34deg);
  }

  /* 霓虹：高亮能量环与电弧轨道，作为传说入门档；强度低于星河、龙曜和天穹。 */
  .avatar-frame--neon .avatar-frame__ring {
    background: conic-gradient(from 0deg, #22d3ee, #3b82f6 23%, #7c3aed 46%, #e879f9 68%, #22d3ee);
    box-shadow:
      0 0 0 1px rgba(207, 250, 254, 0.46),
      0 0 9px rgba(34, 211, 238, 0.78),
      0 0 20px rgba(168, 85, 247, 0.56),
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

  .avatar-frame--neon .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -9%;
    border: 1.5px solid rgba(103, 232, 249, 0.64);
    border-left-color: transparent;
    border-bottom-color: rgba(192, 132, 252, 0.34);
    border-radius: 50%;
    animation: frame-neon-track 7.5s linear infinite;
  }

  .avatar-frame--neon .avatar-frame__orbit::before {
    position: absolute;
    left: 1%;
    bottom: 17%;
    width: 18%;
    height: max(2px, 3.5%);
    content: '';
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, #67e8f9 58%, #e879f9);
    box-shadow:
      0 0 5px rgba(34, 211, 238, 0.82),
      0 0 8px rgba(232, 121, 249, 0.56);
    transform: rotate(32deg);
  }

  .avatar-frame--neon .avatar-frame__orbit::after {
    position: absolute;
    top: 5%;
    right: 10%;
    width: max(3px, 8%);
    height: max(3px, 8%);
    content: '';
    border-radius: 50%;
    background: #ecfeff;
    box-shadow:
      0 0 5px #22d3ee,
      0 0 9px rgba(192, 132, 252, 0.72);
  }

  .avatar-frame--neon .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 9%;
    right: -10%;
    width: 31%;
    height: max(2px, 3.5%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.52) 43%, #ecfeff);
    box-shadow:
      0 0 7px rgba(34, 211, 238, 0.72),
      0 0 9px rgba(192, 132, 252, 0.66);
    transform: rotate(-32deg);
    transform-origin: right center;
    animation: frame-neon-comet 4.8s ease-in-out infinite;
  }

  /* 晚霞：暖色地平线与柔和的暮光呼吸。 */
  .avatar-frame--sunset .avatar-frame__ring {
    background: conic-gradient(from 205deg, #7c3aed, #c026d3 20%, #fb7185 43%, #fb923c 64%, #fcd34d 79%, #7c3aed);
    box-shadow:
      0 0 0 1px rgba(253, 186, 116, 0.65),
      inset 0 0 5px rgba(255, 237, 213, 0.48),
      0 0 8px rgba(251, 113, 133, 0.28),
      0 7px 17px -8px rgba(190, 24, 93, 0.72);
  }

  .avatar-frame--sunset .avatar-frame__motif {
    inset: var(--frame-motif-inset);
    background: linear-gradient(155deg, transparent 48%, rgba(255, 247, 237, 0.7) 50%, transparent 53%);
    animation: frame-sunset-glow 4.8s ease-in-out infinite;
  }

  .avatar-frame--sunset .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -5%;
    border: 1px solid rgba(253, 186, 116, 0.66);
    border-left-color: transparent;
    border-bottom-color: rgba(192, 38, 211, 0.24);
    border-radius: 50%;
    animation: frame-premium-orbit 12s linear infinite;
  }

  .avatar-frame--sunset .avatar-frame__orbit::after {
    position: absolute;
    top: 8%;
    right: 9%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    content: '';
    border-radius: 50%;
    background: #fef3c7;
    box-shadow: 0 0 7px rgba(251, 146, 60, 0.86);
  }

  .avatar-frame--sunset .avatar-frame__orbit::before {
    position: absolute;
    bottom: 13%;
    left: 2%;
    width: 20%;
    height: max(2px, 3%);
    content: '';
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(251, 113, 133, 0.68), #fde68a);
    box-shadow: 0 0 5px rgba(251, 146, 60, 0.5);
    transform: rotate(32deg);
  }

  /* 潮汐：积分炫彩入门档，以内外双海流、椭圆潮轨和三枚气泡拉开与进阶档的层级。 */
  .avatar-frame--ocean .avatar-frame__ring {
    background:
      radial-gradient(circle at 76% 16%, rgba(255, 255, 255, 0.96) 0 2.5%, transparent 3.8%),
      conic-gradient(from 155deg, #082f49, #0369a1 16%, #06b6d4 34%, #a5f3fc 48%, #38bdf8 61%, #2563eb 78%, #082f49);
    box-shadow:
      0 0 0 1px rgba(125, 211, 252, 0.7),
      0 0 0 3px rgba(14, 165, 233, 0.16),
      inset 0 0 6px rgba(224, 242, 254, 0.58),
      0 0 13px rgba(34, 211, 238, 0.46),
      0 7px 17px -8px rgba(2, 132, 199, 0.78);
  }

  .avatar-frame--ocean .avatar-frame__ring::before,
  .avatar-frame--ocean .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--ocean .avatar-frame__ring::before {
    inset: -5%;
    border: 2px solid transparent;
    border-top-color: rgba(224, 242, 254, 0.82);
    border-right-color: rgba(34, 211, 238, 0.5);
    border-bottom-color: rgba(37, 99, 235, 0.2);
    box-shadow: 0 0 5px rgba(14, 165, 233, 0.34);
    animation: frame-ocean-current 6.8s ease-in-out infinite;
  }

  .avatar-frame--ocean .avatar-frame__ring::after {
    inset: 6%;
    border: 1px solid rgba(224, 242, 254, 0.72);
    border-top-color: rgba(14, 165, 233, 0.2);
    border-left-color: rgba(37, 99, 235, 0.52);
    transform: rotate(-22deg);
  }

  .avatar-frame--ocean .avatar-frame__motif {
    inset: -4%;
    background:
      radial-gradient(circle at 25% 18%, rgba(240, 249, 255, 0.96) 0 3%, transparent 4%),
      radial-gradient(circle at 88% 47%, rgba(186, 230, 253, 0.92) 0 4%, transparent 5%),
      radial-gradient(circle at 33% 91%, rgba(224, 242, 254, 0.88) 0 2%, transparent 3%);
    filter: drop-shadow(0 0 4px rgba(14, 165, 233, 0.54));
    animation: frame-ocean-float 4s ease-in-out infinite;
  }

  .avatar-frame--ocean .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -9%;
    border: 1.5px solid rgba(186, 230, 253, 0.72);
    border-left-color: transparent;
    border-bottom-color: rgba(37, 99, 235, 0.24);
    border-radius: 50%;
    box-shadow: 0 0 5px rgba(56, 189, 248, 0.28);
    transform: rotate(-18deg) scaleY(0.84);
    animation: frame-ocean-orbit 8.2s linear infinite;
  }

  .avatar-frame--ocean .avatar-frame__orbit::before,
  .avatar-frame--ocean .avatar-frame__orbit::after {
    position: absolute;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--ocean .avatar-frame__orbit::before {
    left: 5%;
    bottom: 17%;
    width: max(2px, 5%);
    height: max(2px, 5%);
    background: rgba(240, 249, 255, 0.92);
    box-shadow: 0 0 5px rgba(14, 165, 233, 0.64);
  }

  .avatar-frame--ocean .avatar-frame__orbit::after {
    top: 9%;
    right: 10%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    background: #e0f2fe;
    box-shadow: 0 0 6px rgba(34, 211, 238, 0.76);
  }

  /* 极光：中高档的冷色光幕，通过反向旋转产生缓慢流动。 */
  .avatar-frame--aurora .avatar-frame__ring {
    background: conic-gradient(
      from 25deg,
      #042f2e,
      #10b981 17%,
      #67e8f9 36%,
      #818cf8 55%,
      #d946ef 73%,
      #34d399 89%,
      #042f2e
    );
    box-shadow:
      0 0 0 1px rgba(167, 243, 208, 0.66),
      inset 0 0 6px rgba(207, 250, 254, 0.5),
      0 0 15px rgba(45, 212, 191, 0.58),
      0 8px 20px -10px rgba(99, 102, 241, 0.78);
    animation: frame-aurora-turn 10s linear infinite;
  }

  .avatar-frame--aurora .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 2px solid transparent;
    border-top-color: rgba(216, 180, 254, 0.78);
    border-right-color: rgba(153, 246, 228, 0.7);
    border-radius: 44% 56% 48% 52%;
    filter: blur(0.25px);
    animation: frame-aurora-wave 5.2s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -7%;
    border: 1.5px solid rgba(103, 232, 249, 0.66);
    border-left-color: transparent;
    border-bottom-color: rgba(216, 180, 254, 0.3);
    border-radius: 50%;
    animation: frame-aurora-orbit 9s linear infinite;
  }

  .avatar-frame--aurora .avatar-frame__orbit::after {
    position: absolute;
    top: 2%;
    right: 16%;
    width: max(3px, 8%);
    height: max(3px, 8%);
    content: '';
    border-radius: 50%;
    background: #ecfeff;
    box-shadow:
      0 0 5px #67e8f9,
      0 0 9px rgba(192, 132, 252, 0.64);
  }

  .avatar-frame--aurora .avatar-frame__orbit::before {
    position: absolute;
    bottom: 11%;
    left: -1%;
    width: 23%;
    height: max(2px, 4%);
    content: '';
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, #5eead4 48%, #c084fc);
    box-shadow:
      0 0 5px rgba(45, 212, 191, 0.76),
      0 0 8px rgba(192, 132, 252, 0.42);
    transform: rotate(30deg);
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

  .avatar-frame--galaxy .avatar-frame__ring::before,
  .avatar-frame--galaxy .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--galaxy .avatar-frame__ring::before {
    inset: -12%;
    background: conic-gradient(
      from 12deg,
      #e0e7ff,
      #818cf8 18%,
      #c084fc 36%,
      #fff 50%,
      #60a5fa 68%,
      #7c3aed 84%,
      #e0e7ff
    );
    clip-path: polygon(
      50% 0,
      57% 39%,
      79% 9%,
      67% 43%,
      100% 50%,
      67% 57%,
      79% 91%,
      57% 61%,
      50% 100%,
      43% 61%,
      21% 91%,
      33% 57%,
      0 50%,
      33% 43%,
      21% 9%,
      43% 39%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(129, 140, 248, 0.82));
    animation: frame-galaxy-crown 3.4s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__ring::after {
    inset: 4%;
    border: 1.5px solid rgba(224, 231, 255, 0.86);
    border-top-color: #fff;
    border-right-color: #c084fc;
    border-bottom-color: #60a5fa;
    box-shadow:
      inset 0 0 4px rgba(255, 255, 255, 0.68),
      0 0 4px rgba(196, 181, 253, 0.62);
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

  .avatar-frame--galaxy .avatar-frame__motif::before,
  .avatar-frame--galaxy .avatar-frame__motif::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    background: linear-gradient(90deg, transparent 43%, rgba(255, 255, 255, 0.96) 46% 54%, transparent 57%);
    clip-path: polygon(
      46% 0,
      54% 0,
      59% 41%,
      100% 46%,
      100% 54%,
      59% 59%,
      54% 100%,
      46% 100%,
      41% 59%,
      0 54%,
      0 46%,
      41% 41%
    );
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.95));
  }

  .avatar-frame--galaxy .avatar-frame__motif::before {
    right: 5%;
    bottom: 13%;
    width: 13%;
    height: 13%;
    animation: frame-galaxy-starburst 4.6s 2.3s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motif::after {
    top: 7%;
    left: 12%;
    width: 20%;
    height: 20%;
    aspect-ratio: 1;
    animation: frame-galaxy-starburst 4.6s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -11%;
    border: 2px solid rgba(224, 231, 255, 0.62);
    border-right-color: transparent;
    border-bottom-color: transparent;
    border-radius: 50%;
    box-shadow:
      0 0 var(--frame-galaxy-orbit-glow) rgba(196, 181, 253, 0.62),
      inset 0 0 var(--frame-galaxy-orbit-glow) rgba(96, 165, 250, 0.2);
    transform: rotate(-24deg);
    animation: frame-galaxy-orbit 7.4s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit::before,
  .avatar-frame--galaxy .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--galaxy .avatar-frame__orbit::before {
    right: 4%;
    bottom: 10%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    background: #c4b5fd;
    box-shadow:
      0 0 0 1px rgba(224, 231, 255, 0.68),
      0 0 var(--frame-galaxy-star-glow) rgba(168, 85, 247, 0.84);
  }

  .avatar-frame--galaxy .avatar-frame__orbit::after {
    top: -2px;
    left: 51%;
    width: max(3px, 10%);
    height: max(3px, 10%);
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
    right: -10%;
    width: 38%;
    height: max(2px, 4%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.38) 30%, rgba(196, 181, 253, 0.76) 66%, #fff);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.94),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(129, 140, 248, 0.58);
    transform: rotate(-28deg);
    transform-origin: right center;
    animation: frame-galaxy-comet 4.9s ease-in-out infinite;
  }

  /* 赤焰：金橙火芯叠加暗红外焰，用明暗跳动表达热度。 */
  .avatar-frame--flame .avatar-frame__ring {
    background: conic-gradient(
      from 15deg,
      #7f1d1d,
      #dc2626 18%,
      #fb923c 38%,
      #fef08a 51%,
      #f97316 66%,
      #991b1b 84%,
      #7f1d1d
    );
    box-shadow:
      0 0 0 1px rgba(254, 215, 170, 0.7),
      inset 0 0 6px rgba(254, 240, 138, 0.54),
      0 0 15px rgba(249, 115, 22, 0.7),
      0 8px 19px -10px rgba(153, 27, 27, 0.9);
    animation: frame-flame-pulse 2.7s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(ellipse at 18% 23%, rgba(254, 240, 138, 0.9) 0 5%, transparent 6%),
      radial-gradient(ellipse at 82% 20%, rgba(251, 146, 60, 0.9) 0 6%, transparent 7%),
      radial-gradient(ellipse at 90% 77%, rgba(254, 215, 170, 0.82) 0 5%, transparent 6%),
      radial-gradient(ellipse at 25% 89%, rgba(239, 68, 68, 0.88) 0 6%, transparent 7%);
    clip-path: polygon(
      50% 0,
      62% 9%,
      76% 3%,
      82% 18%,
      98% 26%,
      91% 43%,
      100% 58%,
      87% 70%,
      82% 91%,
      63% 88%,
      50% 100%,
      37% 89%,
      18% 92%,
      14% 72%,
      0 60%,
      9% 43%,
      2% 27%,
      19% 18%,
      25% 3%,
      39% 10%
    );
    animation: frame-flame-dance 3.1s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -7%;
    border: 1.5px solid rgba(254, 215, 170, 0.64);
    border-left-color: transparent;
    border-bottom-color: rgba(220, 38, 38, 0.34);
    border-radius: 50%;
    animation: frame-flame-orbit 7.8s linear infinite;
  }

  .avatar-frame--flame .avatar-frame__orbit::before {
    position: absolute;
    left: 2%;
    bottom: 13%;
    width: 17%;
    height: max(2px, 3.5%);
    content: '';
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, #fb923c 55%, #fef08a);
    box-shadow:
      0 0 5px rgba(249, 115, 22, 0.76),
      0 0 8px rgba(220, 38, 38, 0.48);
    transform: rotate(34deg);
  }

  .avatar-frame--flame .avatar-frame__orbit::after {
    position: absolute;
    top: 4%;
    right: 12%;
    width: max(3px, 9%);
    height: max(3px, 9%);
    content: '';
    border-radius: 52% 48% 72% 28%;
    background: radial-gradient(circle at 38% 32%, #fff7d6, #fbbf24 45%, #dc2626 100%);
    box-shadow:
      0 0 5px #f59e0b,
      0 0 10px rgba(220, 38, 38, 0.72);
  }

  .avatar-frame--flame .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 12%;
    right: -6%;
    width: 27%;
    height: max(2px, 3%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.5) 48%, #fef3c7);
    box-shadow: 0 0 7px rgba(239, 68, 68, 0.62);
    transform: rotate(-30deg);
    transform-origin: right center;
    animation: frame-flame-comet 4.6s ease-in-out infinite;
  }

  /* 龙曜：龙鳞外冠、黑红珐琅双环、双火星轨和焰尾，视觉强度高于星河。 */
  .avatar-frame--dragon .avatar-frame__ring {
    background: repeating-conic-gradient(
      from 8deg,
      #450a0a 0 8deg,
      #b91c1c 8deg 18deg,
      #f59e0b 18deg 24deg,
      #7f1d1d 24deg 34deg
    );
    box-shadow:
      0 0 0 2px rgba(245, 158, 11, 0.74),
      0 0 0 4px rgba(127, 29, 29, 0.34),
      inset 0 0 7px rgba(254, 215, 170, 0.5),
      0 0 20px rgba(245, 158, 11, 0.78),
      0 0 30px rgba(220, 38, 38, 0.46),
      0 10px 24px -10px rgba(69, 10, 10, 0.98);
    animation: frame-dragon-turn 15s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__ring::before,
  .avatar-frame--dragon .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--dragon .avatar-frame__ring::before {
    inset: -18%;
    background: conic-gradient(
      from 0deg,
      #fff7d6,
      #f59e0b 14%,
      #991b1b 28%,
      #fbbf24 43%,
      #fef3c7 50%,
      #dc2626 66%,
      #f59e0b 82%,
      #fff7d6
    );
    clip-path: polygon(
      50% 0,
      57% 34%,
      68% 5%,
      66% 39%,
      85% 15%,
      72% 44%,
      100% 50%,
      72% 56%,
      85% 85%,
      66% 61%,
      68% 95%,
      57% 66%,
      50% 100%,
      43% 66%,
      32% 95%,
      34% 61%,
      15% 85%,
      28% 56%,
      0 50%,
      28% 44%,
      15% 15%,
      34% 39%,
      32% 5%,
      43% 34%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(254, 240, 138, 0.94))
      drop-shadow(0 0 var(--frame-galaxy-star-wide-glow) rgba(239, 68, 68, 0.92));
    animation: frame-dragon-crown 5.2s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__ring::after {
    inset: 4%;
    border: 2px solid rgba(254, 243, 199, 0.88);
    border-right-color: #dc2626;
    border-bottom-color: #f59e0b;
    box-shadow:
      inset 0 0 5px rgba(69, 10, 10, 0.68),
      inset 0 0 9px rgba(245, 158, 11, 0.34),
      0 0 7px rgba(251, 191, 36, 0.82);
    animation: frame-dragon-inner 8s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__motif {
    inset: -7%;
    border: 1.5px solid rgba(254, 215, 170, 0.82);
    background:
      radial-gradient(ellipse at 22% 23%, rgba(254, 243, 199, 0.95) 0 4%, transparent 5%),
      radial-gradient(ellipse at 78% 77%, rgba(251, 191, 36, 0.9) 0 4%, transparent 5%),
      repeating-conic-gradient(from 0deg, rgba(254, 215, 170, 0.58) 0deg 2deg, transparent 2deg 30deg);
    box-shadow:
      inset 0 0 5px rgba(251, 191, 36, 0.34),
      0 0 7px rgba(220, 38, 38, 0.38);
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.82));
    animation: frame-dragon-scales 9s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -15%;
    border: 2.5px solid rgba(251, 191, 36, 0.82);
    border-left-color: transparent;
    border-bottom-color: transparent;
    border-radius: 50%;
    box-shadow:
      0 0 var(--frame-galaxy-orbit-glow) rgba(254, 240, 138, 0.7),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(220, 38, 38, 0.56);
    animation: frame-dragon-orbit 5.9s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__orbit::before,
  .avatar-frame--dragon .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--dragon .avatar-frame__orbit::before {
    left: 2%;
    bottom: 13%;
    width: max(4px, 8%);
    height: max(4px, 8%);
    background: #fb7185;
    box-shadow:
      0 0 6px #dc2626,
      0 0 12px rgba(245, 158, 11, 0.72);
  }

  .avatar-frame--dragon .avatar-frame__orbit::after {
    top: 5%;
    right: 12%;
    width: max(3px, 9%);
    height: max(3px, 9%);
    background: #fef3c7;
    box-shadow:
      0 0 6px #f59e0b,
      0 0 11px rgba(220, 38, 38, 0.7);
  }

  .avatar-frame--dragon .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 8%;
    right: -18%;
    width: 52%;
    height: max(3px, 6%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.42) 30%, #f59e0b 66%, #fff7d6);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(251, 191, 36, 0.92),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(220, 38, 38, 0.76);
    transform: rotate(-29deg);
    transform-origin: right center;
    animation: frame-dragon-comet 4s ease-in-out infinite;
  }

  /* 天穹：以日蚀星冕和贴环星轨压过龙曜；星轨保留层次，但不再用夸张椭圆抢占主体。 */
  .avatar-frame--celestial .avatar-frame__ring {
    background:
      radial-gradient(circle at 70% 19%, #fff 0 2.8%, transparent 4%),
      radial-gradient(circle at 21% 73%, #fde68a 0 2.2%, transparent 3.4%),
      radial-gradient(circle at 44% 91%, #c4b5fd 0 1.8%, transparent 3%),
      conic-gradient(
        from 212deg,
        #020617 0 13%,
        #312e81 23%,
        #713f12 34%,
        #facc15 43%,
        #fff 49%,
        #f59e0b 56%,
        #6d28d9 69%,
        #172554 84%,
        #020617 100%
      );
    box-shadow:
      0 0 0 2px #fde68a,
      0 0 0 5px rgba(49, 46, 129, 0.92),
      0 0 0 7px rgba(250, 204, 21, 0.48),
      inset 0 0 9px rgba(255, 247, 214, 0.62),
      0 0 calc(var(--frame-celestial-glow) + 7px) rgba(250, 204, 21, 0.9),
      0 0 calc(var(--frame-celestial-glow) + 17px) rgba(91, 33, 182, 0.62),
      0 var(--frame-galaxy-drop-y) var(--frame-galaxy-drop-blur) var(--frame-galaxy-drop-spread) rgba(15, 23, 42, 0.96);
    animation: frame-celestial-lustre 3.8s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__ring::before,
  .avatar-frame--celestial .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  /* 白金日蚀冠明显越出环体；深靛外辉确保浅色卡片上也有清晰轮廓。 */
  .avatar-frame--celestial .avatar-frame__ring::before {
    inset: -25%;
    background: conic-gradient(from 18deg, #fff, #facc15 22%, #a16207 38%, #c4b5fd 56%, #7c3aed 72%, #fde68a 88%, #fff);
    clip-path: polygon(
      50% 0,
      55% 34%,
      64% 4%,
      62% 38%,
      79% 9%,
      69% 42%,
      92% 22%,
      74% 46%,
      100% 50%,
      74% 54%,
      92% 78%,
      69% 58%,
      79% 91%,
      62% 62%,
      64% 96%,
      55% 66%,
      50% 100%,
      45% 66%,
      36% 96%,
      38% 62%,
      21% 91%,
      31% 58%,
      8% 78%,
      26% 54%,
      0 50%,
      26% 46%,
      8% 22%,
      31% 42%,
      21% 9%,
      38% 38%,
      36% 4%,
      45% 34%
    );
    filter: drop-shadow(0 0 3px rgba(30, 27, 75, 1)) drop-shadow(0 0 8px rgba(76, 29, 149, 0.86))
      drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.98))
      drop-shadow(0 0 var(--frame-galaxy-star-wide-glow) rgba(250, 204, 21, 0.94));
    animation: frame-celestial-crown 10.5s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__ring::after {
    inset: 3.5%;
    border: 2px solid rgba(196, 181, 253, 0.88);
    border-top-color: #fff7d6;
    border-right-color: #fff;
    border-bottom-color: #f59e0b;
    box-shadow:
      inset 0 0 6px rgba(15, 23, 42, 0.72),
      inset 0 0 10px rgba(250, 204, 21, 0.26),
      0 0 6px rgba(255, 247, 214, 0.7);
    animation: frame-celestial-inner-ring 7.8s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__motif {
    inset: -11%;
    border: var(--frame-constellation-stroke) dotted rgba(255, 247, 214, 0.9);
    background:
      radial-gradient(circle at 17% 22%, #fff 0 2.1%, transparent 3.3%),
      radial-gradient(circle at 82% 67%, #fde68a 0 1.8%, transparent 3%),
      radial-gradient(circle at 36% 94%, #ddd6fe 0 1.7%, transparent 2.8%),
      repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.58) 0deg 1.5deg, transparent 1.5deg 45deg);
    box-shadow: inset 0 0 7px rgba(124, 58, 237, 0.24);
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.84));
    animation: frame-celestial-constellation 4s ease-in-out infinite;
  }

  /* 顶部白金主钻和底部紫晶严格对称，不再堆叠随机星点。 */
  .avatar-frame--celestial .avatar-frame__motif::before,
  .avatar-frame--celestial .avatar-frame__motif::after {
    position: absolute;
    left: 50%;
    aspect-ratio: 1;
    content: '';
    clip-path: polygon(50% 0, 62% 37%, 100% 50%, 62% 63%, 50% 100%, 38% 63%, 0 50%, 38% 37%);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .avatar-frame--celestial .avatar-frame__motif::before {
    top: -11%;
    width: 21%;
    height: 21%;
    background: radial-gradient(circle, #fff 0 14%, #fff7d6 32%, #facc15 58%, #a16207 100%);
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(255, 247, 214, 0.96));
    animation: frame-celestial-jewel 4.8s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motif::after {
    bottom: -8%;
    width: 13%;
    height: 13%;
    background: radial-gradient(circle, #fff 0 12%, #c4b5fd 34%, #7c3aed 68%, #312e81 100%);
    filter: drop-shadow(0 0 var(--frame-galaxy-orbit-glow) rgba(167, 139, 250, 0.92));
    animation: frame-celestial-jewel 4.8s 2.4s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -10% -13%;
    border: 1.75px solid rgba(254, 240, 138, 0.82);
    border-right-color: rgba(196, 181, 253, 0.62);
    border-bottom-color: rgba(96, 165, 250, 0.18);
    border-radius: 50%;
    box-shadow:
      0 0 var(--frame-galaxy-orbit-glow) rgba(255, 255, 255, 0.72),
      0 0 var(--frame-galaxy-star-glow) rgba(253, 224, 71, 0.52),
      inset 0 0 var(--frame-galaxy-orbit-glow) rgba(49, 46, 129, 0.58);
    transform: rotate(18deg) scaleY(0.86);
    animation: frame-celestial-orbit 7.6s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__orbit::before,
  .avatar-frame--celestial .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--celestial .avatar-frame__orbit::before {
    right: 5%;
    bottom: 8%;
    width: max(5px, 10%);
    height: max(5px, 10%);
    background: radial-gradient(circle at 35% 30%, #fff, #c4b5fd 50%, #4f46e5 100%);
    box-shadow:
      0 0 0 1px rgba(224, 231, 255, 0.72),
      0 0 var(--frame-galaxy-star-glow) rgba(139, 92, 246, 0.82);
  }

  .avatar-frame--celestial .avatar-frame__orbit::after {
    top: -3%;
    left: 47%;
    width: max(6px, 12%);
    height: max(6px, 12%);
    background: radial-gradient(circle at 35% 30%, #fff, #fef08a 48%, #d97706 78%);
    box-shadow:
      0 0 0 1px rgba(253, 230, 138, 0.64),
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.86);
  }

  .avatar-frame--celestial .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 1%;
    right: -28%;
    width: 70%;
    height: max(4px, 7%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.38) 28%, #facc15 68%, #fff7d6);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(255, 247, 214, 0.96),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(250, 204, 21, 0.68);
    transform: rotate(-30deg);
    transform-origin: right center;
    animation: frame-celestial-comet 4.2s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__comet::after {
    position: absolute;
    top: 50%;
    right: 0;
    width: max(7px, 18%);
    aspect-ratio: 1;
    content: '';
    background: radial-gradient(circle, #fff 0 14%, #fef08a 26%, #facc15 48%, transparent 70%);
    clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%);
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.96));
    transform: translateY(-50%);
  }

  /* 万卷星库：500 书签身份框，以书页星冕、双层星库和紫金书轨表达收藏沉淀。 */
  .avatar-frame--bookmark-archive .avatar-frame__ring {
    background:
      radial-gradient(circle at 23% 18%, #fff 0 2.2%, transparent 3.4%),
      radial-gradient(circle at 81% 70%, #fde68a 0 1.8%, transparent 3%),
      conic-gradient(from 18deg, #0f172a, #4c1d95 14%, #a78bfa 30%, #fef3c7 47%, #7c3aed 64%, #312e81 82%, #0f172a);
    box-shadow:
      0 0 0 2px #8b5cf6,
      0 0 0 4px rgba(253, 230, 138, 0.28),
      inset 0 0 7px rgba(255, 255, 255, 0.46),
      0 0 calc(var(--frame-celestial-glow) + 2px) rgba(124, 58, 237, 0.78),
      0 0 calc(var(--frame-celestial-glow) + 8px) rgba(76, 29, 149, 0.32);
    animation: frame-bookmark-archive-lustre 5.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__ring::before,
  .avatar-frame--bookmark-archive .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--bookmark-archive .avatar-frame__ring::before {
    inset: -11%;
    background: conic-gradient(from 8deg, #fde68a, #8b5cf6 25%, #fff 48%, #c4b5fd 70%, #facc15 88%, #fde68a);
    clip-path: polygon(
      50% 0,
      57% 39%,
      79% 9%,
      67% 43%,
      100% 50%,
      67% 57%,
      79% 91%,
      57% 61%,
      50% 100%,
      43% 61%,
      21% 91%,
      33% 57%,
      0 50%,
      33% 43%,
      21% 9%,
      43% 39%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(167, 139, 250, 0.82));
    animation: frame-bookmark-archive-crown 18s linear infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__ring::after {
    inset: 4%;
    border: 1.5px solid rgba(255, 255, 255, 0.76);
    border-right-color: #fde68a;
    border-bottom-color: #8b5cf6;
    box-shadow:
      inset 0 0 5px rgba(76, 29, 149, 0.52),
      0 0 4px rgba(253, 230, 138, 0.54);
  }

  .avatar-frame--bookmark-archive .avatar-frame__motif {
    inset: -7%;
    border: 2px dotted rgba(253, 230, 138, 0.92);
    background:
      radial-gradient(circle at 12% 25%, #fff 0 2%, transparent 3%),
      radial-gradient(circle at 84% 83%, #fef3c7 0 1.8%, transparent 2.8%),
      repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.86) 0deg 2deg, transparent 2deg 30deg);
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.64));
    animation: frame-achievement-turn-reverse 17s linear infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motif::before,
  .avatar-frame--bookmark-archive .avatar-frame__motif::after {
    position: absolute;
    width: 17%;
    height: 13%;
    content: '';
    clip-path: polygon(50% 12%, 100% 0, 84% 88%, 50% 70%, 16% 88%, 0 0);
    background: linear-gradient(135deg, #fff, #fde68a 36%, #a78bfa 72%, #4c1d95);
    filter: drop-shadow(0 0 4px rgba(253, 230, 138, 0.78));
    animation: frame-bookmark-archive-page 4.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motif::before {
    top: 2%;
    right: 5%;
    transform: rotate(28deg);
  }

  .avatar-frame--bookmark-archive .avatar-frame__motif::after {
    bottom: 3%;
    left: 6%;
    transform: rotate(-152deg);
    animation-delay: 2.1s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -13%;
    border: 2px solid rgba(196, 181, 253, 0.82);
    border-right-color: transparent;
    border-bottom-color: rgba(253, 230, 138, 0.34);
    border-radius: 50%;
    box-shadow: 0 0 var(--frame-galaxy-orbit-glow) rgba(167, 139, 250, 0.62);
    transform: rotate(18deg) scaleY(0.82);
    animation: frame-achievement-orbit 9.5s linear infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__orbit::before,
  .avatar-frame--bookmark-archive .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--bookmark-archive .avatar-frame__orbit::before {
    top: -3%;
    left: 45%;
    width: max(4px, 9%);
    height: max(4px, 9%);
    background: #fff;
    box-shadow:
      0 0 0 1px rgba(253, 230, 138, 0.76),
      0 0 var(--frame-galaxy-star-glow) rgba(167, 139, 250, 0.9);
  }

  .avatar-frame--bookmark-archive .avatar-frame__orbit::after {
    right: 5%;
    bottom: 8%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    background: #fde68a;
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(250, 204, 21, 0.82);
  }

  .avatar-frame--bookmark-archive .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 7%;
    right: -11%;
    width: 38%;
    height: max(2px, 4%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.42) 30%, #fde68a 72%, #fff);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.9),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(124, 58, 237, 0.58);
    transform: rotate(-27deg);
    transform-origin: right center;
    animation: frame-bookmark-archive-comet 5.8s ease-in-out infinite;
  }

  /* 文心长河：免费炫彩与积分进阶同档，墨光呼吸、完整单轨与随轨光点共同流转。 */
  .avatar-frame--note-masterpiece .avatar-frame__ring {
    background: conic-gradient(
      from 225deg,
      #022c22,
      #047857 16%,
      #34d399 35%,
      #fef08a 50%,
      #10b981 66%,
      #064e3b 84%,
      #022c22
    );
    box-shadow:
      0 0 0 2px #047857,
      inset 0 0 5px rgba(254, 240, 138, 0.34),
      0 0 10px rgba(16, 185, 129, 0.5);
  }

  .avatar-frame--note-masterpiece .avatar-frame__motif {
    inset: -4%;
    border: 1px solid rgba(254, 240, 138, 0.82);
    background:
      radial-gradient(ellipse at 22% 72%, transparent 0 58%, rgba(167, 243, 208, 0.72) 60% 63%, transparent 65%),
      radial-gradient(ellipse at 76% 28%, transparent 0 59%, rgba(253, 224, 71, 0.72) 61% 64%, transparent 66%);
    animation: frame-achievement-breathe 5.4s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -7%;
    border: 1.5px solid rgba(167, 243, 208, 0.74);
    border-left-color: transparent;
    border-bottom-color: rgba(253, 224, 71, 0.24);
    border-radius: 50%;
    box-shadow: 0 0 5px rgba(16, 185, 129, 0.28);
    animation: frame-free-colorful-orbit 11.5s linear infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__orbit::after {
    position: absolute;
    top: 5%;
    right: 13%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    content: '';
    border-radius: 50%;
    background: #fef08a;
    box-shadow:
      0 0 4px rgba(253, 224, 71, 0.88),
      0 0 6px rgba(16, 185, 129, 0.46);
  }

  /* 云阙宝库：免费炫彩与积分进阶同档，晶面呼吸、完整单轨与晶辉光点共同流转。 */
  .avatar-frame--file-vault .avatar-frame__ring {
    background: conic-gradient(
      from 45deg,
      #431407,
      #c2410c 14%,
      #fb923c 29%,
      #fef3c7 44%,
      #38bdf8 59%,
      #075985 76%,
      #7c2d12 90%,
      #431407
    );
    box-shadow:
      0 0 0 2px #c2410c,
      inset 0 0 5px rgba(186, 230, 253, 0.32),
      0 0 10px rgba(249, 115, 22, 0.5);
  }

  .avatar-frame--file-vault .avatar-frame__motif {
    inset: -5%;
    border: 2px solid rgba(186, 230, 253, 0.76);
    clip-path: polygon(50% 0, 82% 9%, 100% 50%, 84% 86%, 50% 100%, 14% 84%, 0 50%, 13% 15%);
    background: repeating-conic-gradient(from 22deg, rgba(255, 255, 255, 0.76) 0deg 2deg, transparent 2deg 45deg);
    animation: frame-achievement-breathe 5.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -7%;
    border: 1.5px solid rgba(186, 230, 253, 0.76);
    border-top-color: transparent;
    border-left-color: rgba(251, 146, 60, 0.28);
    border-radius: 50%;
    box-shadow: 0 0 5px rgba(56, 189, 248, 0.28);
    animation: frame-free-colorful-orbit-reverse 12.5s linear infinite;
  }

  .avatar-frame--file-vault .avatar-frame__orbit::after {
    position: absolute;
    right: 7%;
    bottom: 13%;
    width: max(3px, 7%);
    height: max(3px, 7%);
    content: '';
    border-radius: 50%;
    background: #e0f2fe;
    box-shadow:
      0 0 4px rgba(56, 189, 248, 0.9),
      0 0 6px rgba(249, 115, 22, 0.4);
  }

  /* 翰墨星海：500 篇笔记传说框，笔锋星冕、墨海双环与翡翠彗笔共同形成身份轮廓。 */
  .avatar-frame--note-constellation .avatar-frame__ring {
    background:
      radial-gradient(circle at 74% 16%, #fff 0 2.6%, transparent 4%),
      radial-gradient(circle at 18% 72%, #fef08a 0 2.2%, transparent 3.6%),
      conic-gradient(
        from 218deg,
        #020617,
        #064e3b 14%,
        #10b981 29%,
        #fef08a 45%,
        #a78bfa 58%,
        #047857 76%,
        #172554 91%,
        #020617
      );
    box-shadow:
      0 0 0 2px #34d399,
      0 0 0 4px rgba(253, 224, 71, 0.38),
      inset 0 0 8px rgba(254, 240, 138, 0.5),
      0 0 calc(var(--frame-celestial-glow) + 4px) rgba(16, 185, 129, 0.82),
      0 0 calc(var(--frame-celestial-glow) + 11px) rgba(49, 46, 129, 0.46);
    animation: frame-bookmark-archive-lustre 4.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__ring::before,
  .avatar-frame--note-constellation .avatar-frame__ring::after,
  .avatar-frame--file-constellation .avatar-frame__ring::before,
  .avatar-frame--file-constellation .avatar-frame__ring::after {
    position: absolute;
    content: '';
    pointer-events: none;
  }

  .avatar-frame--note-constellation .avatar-frame__ring::before {
    inset: -19%;
    border-radius: 50%;
    background: conic-gradient(
      from 12deg,
      #fef08a,
      #10b981 20%,
      #312e81 38%,
      #fff 50%,
      #34d399 67%,
      #ca8a04 84%,
      #fef08a
    );
    clip-path: polygon(
      50% 0,
      56% 34%,
      70% 5%,
      66% 39%,
      88% 15%,
      72% 44%,
      100% 50%,
      72% 56%,
      88% 85%,
      66% 61%,
      70% 95%,
      56% 66%,
      50% 100%,
      44% 66%,
      30% 95%,
      34% 61%,
      12% 85%,
      28% 56%,
      0 50%,
      28% 44%,
      12% 15%,
      34% 39%,
      30% 5%,
      44% 34%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(254, 240, 138, 0.92))
      drop-shadow(0 0 var(--frame-galaxy-star-wide-glow) rgba(16, 185, 129, 0.72));
    animation: frame-celestial-crown 14s linear infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__ring::after {
    inset: 4%;
    border: 2px solid rgba(254, 240, 138, 0.9);
    border-right-color: #34d399;
    border-bottom-color: #818cf8;
    border-radius: 50%;
    box-shadow: inset 0 0 6px rgba(2, 44, 34, 0.72);
    animation: frame-celestial-inner-ring 8s linear infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motif {
    inset: -9%;
    border: 1.5px dotted rgba(254, 240, 138, 0.84);
    background:
      radial-gradient(ellipse at 18% 76%, transparent 0 59%, rgba(167, 243, 208, 0.82) 61% 63%, transparent 65%),
      radial-gradient(ellipse at 80% 24%, transparent 0 59%, rgba(196, 181, 253, 0.76) 61% 63%, transparent 65%);
    filter: drop-shadow(0 0 4px rgba(52, 211, 153, 0.72));
    animation: frame-celestial-constellation 4.6s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -17% -13%;
    border: 2px solid rgba(167, 243, 208, 0.86);
    border-right-color: rgba(253, 224, 71, 0.88);
    border-bottom-color: rgba(129, 140, 248, 0.28);
    border-radius: 50%;
    box-shadow: 0 0 var(--frame-galaxy-star-wide-glow) rgba(16, 185, 129, 0.62);
    animation: frame-note-constellation-orbit 9.2s linear infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__orbit::before,
  .avatar-frame--note-constellation .avatar-frame__orbit::after,
  .avatar-frame--file-constellation .avatar-frame__orbit::before,
  .avatar-frame--file-constellation .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--note-constellation .avatar-frame__orbit::before {
    top: -4%;
    left: 44%;
    width: max(5px, 10%);
    background: #fef08a;
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(253, 224, 71, 0.94);
  }

  .avatar-frame--note-constellation .avatar-frame__orbit::after {
    right: 4%;
    bottom: 10%;
    width: max(4px, 8%);
    background: #a7f3d0;
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(16, 185, 129, 0.92);
  }

  .avatar-frame--note-constellation .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 7%;
    right: -18%;
    width: 54%;
    height: max(3px, 6%);
    border-radius: 999px 0 999px 0;
    background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.46) 28%, #fef08a 70%, #fff);
    box-shadow: 0 0 var(--frame-galaxy-star-wide-glow) rgba(52, 211, 153, 0.76);
    transform-origin: right center;
    animation: frame-note-constellation-comet 5.4s ease-in-out infinite;
  }

  /* 寰宇云藏：500 文件传说框，以十二面晶冠、双极星门和蓝金彗轨表达云端终极收藏。 */
  .avatar-frame--file-constellation .avatar-frame__ring {
    background:
      radial-gradient(circle at 24% 15%, #fff 0 2.5%, transparent 4%),
      radial-gradient(circle at 82% 71%, #fde68a 0 2.1%, transparent 3.5%),
      conic-gradient(
        from 42deg,
        #020617,
        #075985 14%,
        #38bdf8 28%,
        #e0f2fe 42%,
        #f59e0b 55%,
        #7c3aed 69%,
        #0e7490 84%,
        #020617
      );
    box-shadow:
      0 0 0 2px #38bdf8,
      0 0 0 4px rgba(245, 158, 11, 0.42),
      inset 0 0 8px rgba(224, 242, 254, 0.58),
      0 0 calc(var(--frame-celestial-glow) + 5px) rgba(14, 165, 233, 0.84),
      0 0 calc(var(--frame-celestial-glow) + 12px) rgba(76, 29, 149, 0.5);
    animation: frame-bookmark-archive-lustre 4.1s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__ring::before {
    inset: -20%;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      #e0f2fe,
      #38bdf8 18%,
      #312e81 36%,
      #fef3c7 52%,
      #f59e0b 68%,
      #0ea5e9 84%,
      #e0f2fe
    );
    clip-path: polygon(
      50% 0,
      58% 35%,
      75% 7%,
      69% 41%,
      93% 25%,
      73% 47%,
      100% 50%,
      73% 55%,
      93% 75%,
      69% 59%,
      75% 93%,
      58% 65%,
      50% 100%,
      42% 65%,
      25% 93%,
      31% 59%,
      7% 75%,
      27% 55%,
      0 50%,
      27% 47%,
      7% 25%,
      31% 41%,
      25% 7%,
      42% 35%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(224, 242, 254, 0.96))
      drop-shadow(0 0 var(--frame-galaxy-star-wide-glow) rgba(14, 165, 233, 0.76));
    animation: frame-celestial-crown 11.5s reverse linear infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__ring::after {
    inset: 3.5%;
    border: 2px solid rgba(224, 242, 254, 0.94);
    border-right-color: #f59e0b;
    border-bottom-color: #7c3aed;
    border-radius: 50%;
    box-shadow: inset 0 0 7px rgba(7, 89, 133, 0.72);
    animation: frame-celestial-inner-ring 7.2s linear infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motif {
    inset: -10%;
    border: 1.5px solid rgba(186, 230, 253, 0.88);
    clip-path: polygon(50% 0, 79% 8%, 100% 34%, 96% 68%, 72% 94%, 39% 100%, 10% 82%, 0 50%, 10% 18%);
    background:
      radial-gradient(circle at 17% 26%, #fff 0 2%, transparent 3.2%),
      radial-gradient(circle at 84% 72%, #fde68a 0 1.8%, transparent 3%),
      repeating-conic-gradient(from 15deg, rgba(255, 255, 255, 0.72) 0deg 2deg, transparent 2deg 30deg);
    filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.76));
    animation: frame-celestial-constellation 4.2s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -18% -15%;
    border: 2px solid rgba(186, 230, 253, 0.9);
    border-left-color: rgba(245, 158, 11, 0.78);
    border-bottom-color: rgba(167, 139, 250, 0.32);
    border-radius: 50%;
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(224, 242, 254, 0.9),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(14, 165, 233, 0.66);
    animation: frame-file-constellation-orbit 8.4s linear infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__orbit::before {
    top: 2%;
    right: 14%;
    width: max(5px, 10%);
    background: #fff;
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(56, 189, 248, 0.98);
  }

  .avatar-frame--file-constellation .avatar-frame__orbit::after {
    left: 6%;
    bottom: 12%;
    width: max(4px, 8%);
    background: #fde68a;
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(245, 158, 11, 0.94);
  }

  .avatar-frame--file-constellation .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 5%;
    right: -19%;
    width: 58%;
    height: max(3px, 6%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.5) 26%, #fde68a 68%, #fff);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(224, 242, 254, 0.96),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(14, 165, 233, 0.72);
    transform-origin: right center;
    animation: frame-file-constellation-comet 4.9s ease-in-out infinite;
  }

  /* 月华渐盈：免费炫彩与积分进阶同档，以月相呼吸、完整月轨和随轨月珠表达坚持。 */
  .avatar-frame--streak-month .avatar-frame__ring {
    background:
      radial-gradient(circle at 75% 20%, rgba(255, 255, 255, 0.94) 0 2.4%, transparent 3.6%),
      conic-gradient(
        from -90deg,
        #0f172a,
        #1d4ed8 18%,
        #818cf8 34%,
        #e9d5ff 48%,
        #f8fafc 58%,
        #a78bfa 72%,
        #312e81 88%,
        #0f172a
      );
    box-shadow:
      0 0 0 2px rgba(129, 140, 248, 0.74),
      0 0 10px rgba(139, 92, 246, 0.48);
  }

  .avatar-frame--streak-month .avatar-frame__motif {
    inset: -4%;
    border: 1px solid rgba(224, 231, 255, 0.82);
    background:
      radial-gradient(circle at 50% 1%, #fff 0 2.5%, #c4b5fd 3.5% 5.3%, transparent 6.3%),
      radial-gradient(circle at 85% 15%, #ede9fe 0 2.2%, transparent 3.4%),
      radial-gradient(circle at 99% 50%, #c7d2fe 0 2.2%, transparent 3.4%),
      radial-gradient(circle at 15% 85%, #ddd6fe 0 2.2%, transparent 3.4%),
      repeating-conic-gradient(from -90deg, rgba(255, 255, 255, 0.76) 0deg 2deg, transparent 2deg 45deg);
    animation: frame-streak-month-phases 5.6s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -7%;
    border: 1.5px solid rgba(196, 181, 253, 0.74);
    border-left-color: transparent;
    border-bottom-color: rgba(96, 165, 250, 0.28);
    border-radius: 50%;
    transform: rotate(-18deg) scaleY(0.86);
    box-shadow: 0 0 5px rgba(129, 140, 248, 0.28);
    animation: frame-free-colorful-moon-orbit 11s linear infinite;
  }

  .avatar-frame--streak-month .avatar-frame__orbit::after {
    position: absolute;
    top: 4%;
    right: 12%;
    width: max(3px, 8%);
    height: max(3px, 8%);
    content: '';
    border-radius: 50%;
    background: radial-gradient(circle at 36% 32%, #fff, #ddd6fe 56%, #6366f1 100%);
    box-shadow: 0 0 5px rgba(196, 181, 253, 0.74);
  }

  /* 岁序长明：365 天最高难度身份框。日月双星、十二月年轮、星冕和周年彗弧全部独立流转。 */
  .avatar-frame--streak-eternal .avatar-frame__ring {
    background:
      radial-gradient(circle at 18% 24%, #fff 0 2.2%, transparent 3.4%),
      radial-gradient(circle at 78% 76%, #fef3c7 0 1.8%, transparent 3%),
      conic-gradient(
        from -90deg,
        #020617,
        #1d4ed8 15%,
        #60a5fa 29%,
        #f8fafc 40%,
        #fef08a 49%,
        #f59e0b 61%,
        #e879f9 74%,
        #7c3aed 86%,
        #020617
      );
    box-shadow:
      0 0 0 2px #fde68a,
      0 0 0 4px rgba(99, 102, 241, 0.46),
      0 0 calc(var(--frame-celestial-glow) + 5px) rgba(96, 165, 250, 0.86),
      0 0 calc(var(--frame-celestial-glow) + 12px) rgba(168, 85, 247, 0.34),
      inset 0 0 7px rgba(255, 255, 255, 0.72);
    animation: frame-eternal-lustre 3.8s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__ring::before,
  .avatar-frame--streak-eternal .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  .avatar-frame--streak-eternal .avatar-frame__ring::before {
    inset: -16%;
    background: conic-gradient(
      from 0deg,
      #fff7d6,
      #facc15 16%,
      #60a5fa 34%,
      #fff 50%,
      #c084fc 68%,
      #f59e0b 84%,
      #fff7d6
    );
    clip-path: polygon(
      50% 0,
      55% 38%,
      70% 8%,
      65% 42%,
      88% 18%,
      70% 47%,
      100% 50%,
      70% 55%,
      88% 82%,
      65% 60%,
      70% 96%,
      55% 63%,
      50% 100%,
      45% 63%,
      30% 96%,
      35% 60%,
      12% 82%,
      30% 55%,
      0 50%,
      30% 47%,
      12% 18%,
      35% 42%,
      30% 8%,
      45% 38%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(253, 224, 71, 0.84));
    animation: frame-eternal-corona 14s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__ring::after {
    inset: 4%;
    border: 1.5px solid rgba(255, 255, 255, 0.88);
    border-top-color: #fde68a;
    border-right-color: #93c5fd;
    border-bottom-color: #c084fc;
    box-shadow:
      inset 0 0 4px rgba(255, 255, 255, 0.72),
      0 0 4px rgba(224, 231, 255, 0.72);
    animation: frame-eternal-inner 8s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motif {
    inset: -7%;
    border: 2px dotted rgba(254, 240, 138, 0.96);
    background:
      radial-gradient(circle at 50% 0, #fff 0 2.5%, #facc15 3.5% 5.5%, transparent 6.5%),
      radial-gradient(circle at 100% 50%, #fff 0 2.3%, #60a5fa 3.3% 5.3%, transparent 6.3%),
      radial-gradient(circle at 50% 100%, #fff 0 2.3%, #c084fc 3.3% 5.3%, transparent 6.3%),
      repeating-conic-gradient(from -90deg, rgba(255, 255, 255, 0.96) 0deg 3deg, transparent 3deg 30deg);
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.78));
    animation: frame-eternal-calendar 11s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -14%;
    border: 2px solid rgba(253, 224, 71, 0.88);
    border-left-color: rgba(147, 197, 253, 0.48);
    border-bottom-color: rgba(192, 132, 252, 0.38);
    border-radius: 50%;
    box-shadow: 0 0 var(--frame-galaxy-orbit-glow) rgba(253, 224, 71, 0.58);
    transform: rotate(24deg) scaleY(0.76);
    animation: frame-eternal-orbit 8.5s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__orbit::before,
  .avatar-frame--streak-eternal .avatar-frame__orbit::after {
    position: absolute;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--streak-eternal .avatar-frame__orbit::before {
    top: -6%;
    left: 44%;
    width: max(5px, 11%);
    height: max(5px, 11%);
    background: radial-gradient(circle at 35% 30%, #fff, #fef08a 38%, #f59e0b 74%, #92400e 100%);
    box-shadow:
      0 0 0 1px #fff7d6,
      0 0 var(--frame-galaxy-star-wide-glow) rgba(253, 224, 71, 1);
  }

  .avatar-frame--streak-eternal .avatar-frame__orbit::after {
    right: 3%;
    bottom: 6%;
    width: max(4px, 9%);
    height: max(4px, 9%);
    background: radial-gradient(circle at 34% 30%, #fff, #bfdbfe 46%, #4f46e5 78%, #1e1b4b 100%);
    box-shadow:
      0 0 0 1px rgba(219, 234, 254, 0.92),
      0 0 var(--frame-galaxy-star-glow) rgba(96, 165, 250, 0.94);
  }

  .avatar-frame--streak-eternal .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 5%;
    right: -13%;
    width: 39%;
    height: max(3px, 5%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(192, 132, 252, 0.5) 34%, #93c5fd 66%, #fff);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.96),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(168, 85, 247, 0.76);
    transform: rotate(-31deg);
    transform-origin: right center;
    animation: frame-eternal-comet 4.4s ease-in-out infinite;
  }

  /* 高阶传说身份结构：语义必须长在框体上，避免外挂小图标沿圆周公转。 */
  .avatar-frame--dragon .avatar-frame__ring {
    background: conic-gradient(
      from 28deg,
      #09090b,
      #3f2a13 16%,
      #f6d27a 31%,
      #7c4a12 45%,
      #111827 62%,
      #d6a84f 81%,
      #09090b
    );
    box-shadow:
      0 0 0 2px #e4c06b,
      0 0 0 5px rgba(24, 17, 8, 0.9),
      inset 0 0 8px rgba(255, 244, 196, 0.46),
      0 0 13px rgba(202, 138, 4, 0.66),
      0 0 24px rgba(113, 63, 18, 0.42);
    animation: frame-dragon-forge-breathe 5.6s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__ring::before {
    display: none;
  }

  .avatar-frame--dragon .avatar-frame__ring::after {
    inset: 4%;
    border: 1.5px solid rgba(255, 244, 196, 0.82);
    border-right-color: #7c4a12;
    border-bottom-color: #d6a84f;
    box-shadow: inset 0 0 7px rgba(9, 9, 11, 0.88);
    animation: none;
  }

  .avatar-frame--dragon .avatar-frame__motif {
    inset: -5%;
    border: 1px solid rgba(228, 192, 107, 0.62);
    background: repeating-conic-gradient(from 12deg, rgba(255, 244, 196, 0.72) 0deg 1.5deg, transparent 1.5deg 18deg);
    filter: drop-shadow(0 0 4px rgba(202, 138, 4, 0.52));
    animation: frame-dragon-scale-glint 4.8s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__orbit {
    display: none;
  }

  .avatar-frame--dragon .avatar-frame__comet {
    display: none;
  }

  .avatar-frame--dragon .avatar-frame__signature {
    z-index: 1;
    inset: -6%;
    display: grid;
    place-items: center;
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgba(9, 9, 11, 0.96)) drop-shadow(0 0 7px rgba(202, 138, 4, 0.68));
  }

  .avatar-frame--dragon .avatar-frame__signature::after {
    position: absolute;
    inset: 2%;
    content: '';
    border-radius: 50%;
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px));
    background: conic-gradient(
      from -35deg,
      transparent 0 82%,
      rgba(255, 244, 196, 0.2) 86%,
      #fff8dc 91%,
      #d6a84f 94%,
      transparent 98%
    );
    opacity: 0;
    animation: frame-dragon-scale-sweep 6.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__dragon-crest {
    position: relative;
    z-index: 1;
    display: block;
    filter: drop-shadow(0 0 1px rgba(9, 9, 11, 0.86)) drop-shadow(0 0 4px rgba(228, 192, 107, 0.68));
    transform-origin: 50% 55%;
    animation: frame-dragon-body-breathe 6.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__dragon-head {
    position: absolute;
    z-index: 3;
    inset: 0;
    display: block;
    margin: auto;
    overflow: visible;
    pointer-events: none;
    filter: drop-shadow(0 1px 0 rgba(41, 27, 10, 0.7)) drop-shadow(0 0 3px rgba(228, 192, 107, 0.46));
    transform-origin: 50% 55%;
    animation: frame-dragon-head-awaken 6.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__dragon-head::before {
    position: absolute;
    top: 29.8%;
    right: 12%;
    width: 1.3%;
    height: auto;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 2px #fff4b8, 0 0 5px #f59e0b;
    opacity: 0;
    transform: scale(0.5);
    animation: frame-dragon-eye-flash 6.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__dragon-head::after {
    position: absolute;
    top: 41%;
    left: 92%;
    width: 8%;
    height: 3.2%;
    content: '';
    border-radius: 999px;
    background: linear-gradient(90deg, #fff7c9 0 14%, #fbbf24 36%, #f97316 64%, transparent 100%);
    filter: drop-shadow(0 0 2px #fde68a) drop-shadow(0 0 5px rgba(249, 115, 22, 0.84));
    opacity: 0;
    transform: translateX(-16%) scaleX(0.3);
    transform-origin: left center;
    animation: frame-dragon-breath-spark 6.4s ease-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__portrait {
    width: calc(var(--frame-size) - 4px);
    height: calc(var(--frame-size) - 4px);
    border: 2px solid #e4c06b;
    background: #fffaf0;
    box-shadow:
      0 0 0 2px rgba(42, 27, 10, 0.96),
      0 0 0 3px rgba(246, 210, 122, 0.88),
      inset 0 0 0 1px rgba(255, 248, 220, 0.92),
      inset 0 0 12px rgba(113, 63, 18, 0.2),
      0 0 8px rgba(214, 168, 79, 0.5);
  }

  .avatar-frame--dragon .avatar-frame__portrait::after {
    position: absolute;
    z-index: 1;
    inset: 0;
    content: '';
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(circle, transparent 68%, rgba(113, 63, 18, 0.08) 80%, rgba(214, 168, 79, 0.3) 100%);
  }

  .avatar-frame--dragon .avatar-frame__signature-mark {
    right: 7%;
    bottom: 2%;
    width: 13%;
    height: auto;
    aspect-ratio: 1;
    border: 1px solid rgba(255, 247, 214, 0.92);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #fde68a 28%, #d6a84f 58%, #713f12 100%);
    box-shadow:
      0 0 6px rgba(255, 247, 214, 0.96),
      0 0 13px rgba(202, 138, 4, 0.8);
    animation: frame-dragon-pearl 6.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__signature-mark::before,
  .avatar-frame--dragon .avatar-frame__signature-mark::after {
    display: none;
  }

  @keyframes frame-dragon-forge-breathe {
    0%,
    100% {
      filter: brightness(0.88) saturate(0.92);
    }
    48%,
    58% {
      filter: brightness(1.18) saturate(1.08);
    }
  }

  @keyframes frame-dragon-scale-glint {
    0%,
    100% {
      opacity: 0.32;
    }
    42% {
      opacity: 0.86;
    }
    62% {
      opacity: 0.5;
    }
  }

  @keyframes frame-dragon-body-breathe {
    0%,
    20%,
    100% {
      opacity: 0.86;
      transform: translateY(1px) rotate(0deg) scale(0.98);
    }
    48%,
    58% {
      opacity: 1;
      transform: translateY(-1px) rotate(7deg) scale(1.015);
    }
    76% {
      opacity: 0.94;
      transform: translateY(0) rotate(-3deg) scale(0.995);
    }
    88% {
      opacity: 0.9;
      transform: translateY(0.5px) rotate(0.7deg) scale(0.985);
    }
  }

  @keyframes frame-dragon-scale-sweep {
    0%,
    24%,
    100% {
      opacity: 0;
      transform: rotate(-72deg);
    }
    42% {
      opacity: 0.72;
      transform: rotate(-18deg);
    }
    54% {
      opacity: 1;
      transform: rotate(58deg);
    }
    72% {
      opacity: 0;
      transform: rotate(154deg);
    }
  }

  @keyframes frame-dragon-head-awaken {
    0%,
    20%,
    100% {
      opacity: 0.96;
      transform: translateY(1px) rotate(0deg) scale(0.98);
    }
    48%,
    58% {
      opacity: 1;
      transform: translateY(-1px) rotate(7deg) scale(1.015);
    }
    76% {
      opacity: 0.98;
      transform: translateY(0) rotate(-3deg) scale(0.995);
    }
    88% {
      opacity: 0.97;
      transform: translateY(0.5px) rotate(0.7deg) scale(0.985);
    }
  }

  @keyframes frame-dragon-pearl {
    0%,
    20%,
    100% {
      opacity: 0.68;
      transform: scale(0.84);
    }
    48%,
    58% {
      opacity: 1;
      transform: scale(1.24);
    }
    76% {
      opacity: 0.82;
      transform: scale(0.94);
    }
  }

  @keyframes frame-dragon-eye-flash {
    0%,
    38%,
    68%,
    100% {
      opacity: 0;
      transform: scale(0.5);
    }
    48% {
      opacity: 1;
      transform: scale(1.8);
    }
    57% {
      opacity: 0.58;
      transform: scale(1);
    }
  }

  @keyframes frame-dragon-breath-spark {
    0%,
    44%,
    68%,
    100% {
      opacity: 0;
      transform: translateX(-16%) scaleX(0.3);
    }
    51% {
      opacity: 1;
      transform: translateX(0) scaleX(0.92);
    }
    60% {
      opacity: 0;
      transform: translateX(32%) scaleX(1.24);
    }
  }

  @keyframes frame-premium-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-premium-orbit-reverse {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-achievement-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-achievement-turn-reverse {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-achievement-orbit {
    from {
      transform: rotate(0deg) scaleY(0.82);
    }
    to {
      transform: rotate(360deg) scaleY(0.82);
    }
  }

  @keyframes frame-achievement-breathe {
    0%,
    100% {
      opacity: 0.68;
      transform: scale(0.98);
    }
    50% {
      opacity: 1;
      transform: scale(1.035);
    }
  }

  @keyframes frame-gift-epic-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-gift-epic-orbit-reverse {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-streak-month-phases {
    0%,
    100% {
      opacity: 0.62;
      transform: scale(0.98);
    }
    50% {
      opacity: 1;
      transform: scale(1.035);
    }
  }

  @keyframes frame-free-colorful-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-free-colorful-orbit-reverse {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-free-colorful-moon-orbit {
    from {
      transform: rotate(-18deg) scaleY(0.86);
    }
    to {
      transform: rotate(342deg) scaleY(0.86);
    }
  }

  @keyframes frame-eternal-lustre {
    0%,
    100% {
      filter: brightness(0.98) saturate(1.04);
    }
    50% {
      filter: brightness(1.24) saturate(1.22);
    }
  }

  @keyframes frame-eternal-corona {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-eternal-inner {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-eternal-calendar {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-eternal-orbit {
    from {
      transform: rotate(24deg) scaleY(0.76);
    }
    to {
      transform: rotate(384deg) scaleY(0.76);
    }
  }

  @keyframes frame-eternal-comet {
    0%,
    38%,
    100% {
      opacity: 0;
      transform: translate(-42%, 30%) rotate(-31deg) scaleX(0.35);
    }
    54% {
      opacity: 1;
      transform: translate(-4%, 2%) rotate(-31deg) scaleX(1.06);
    }
    72% {
      opacity: 0;
      transform: translate(34%, -28%) rotate(-31deg) scaleX(1.22);
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

  @keyframes frame-neon-track {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-neon-comet {
    0%,
    48%,
    100% {
      opacity: 0;
      transform: translate(-30%, 20%) rotate(-32deg) scaleX(0.45);
    }
    62% {
      opacity: 1;
      transform: translate(0, 0) rotate(-32deg) scaleX(1);
    }
    76% {
      opacity: 0;
      transform: translate(24%, -18%) rotate(-32deg) scaleX(1.15);
    }
  }

  @keyframes frame-gold-glint {
    0%,
    34%,
    100% {
      opacity: 0.18;
      transform: translateX(-16%);
    }
    58% {
      opacity: 0.72;
      transform: translateX(16%);
    }
  }

  @keyframes frame-sunset-glow {
    0%,
    100% {
      opacity: 0.3;
      transform: rotate(-8deg);
    }
    50% {
      opacity: 0.9;
      transform: rotate(7deg);
    }
  }

  @keyframes frame-ocean-float {
    0%,
    100% {
      opacity: 0.58;
      transform: translateY(2%);
    }
    50% {
      opacity: 1;
      transform: translateY(-2%);
    }
  }

  @keyframes frame-ocean-current {
    0%,
    100% {
      opacity: 0.62;
      transform: rotate(-10deg) scale(0.98);
    }
    50% {
      opacity: 1;
      transform: rotate(18deg) scale(1.025);
    }
  }

  @keyframes frame-ocean-orbit {
    from {
      transform: rotate(-18deg) scaleY(0.84);
    }
    to {
      transform: rotate(342deg) scaleY(0.84);
    }
  }

  @keyframes frame-aurora-turn {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-aurora-wave {
    0%,
    100% {
      opacity: 0.56;
      transform: rotate(0) scale(0.98);
    }
    50% {
      opacity: 1;
      transform: rotate(18deg) scale(1.04);
    }
  }

  @keyframes frame-aurora-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-galaxy-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-galaxy-crown {
    0%,
    100% {
      opacity: 0.72;
      transform: scale(0.97);
    }
    50% {
      opacity: 1;
      transform: scale(1.035);
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

  @keyframes frame-flame-pulse {
    0%,
    100% {
      filter: brightness(0.96);
      transform: scale(0.98);
    }
    50% {
      filter: brightness(1.2) saturate(1.16);
      transform: scale(1.025);
    }
  }

  @keyframes frame-flame-dance {
    0%,
    100% {
      opacity: 0.66;
      transform: rotate(-3deg) scale(0.98);
    }
    50% {
      opacity: 1;
      transform: rotate(4deg) scale(1.04);
    }
  }

  @keyframes frame-flame-orbit {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-flame-comet {
    0%,
    54%,
    100% {
      opacity: 0;
      transform: translate(-22%, 17%) rotate(-30deg) scaleX(0.46);
    }
    66% {
      opacity: 0.92;
      transform: translate(0, 0) rotate(-30deg) scaleX(1);
    }
    79% {
      opacity: 0;
      transform: translate(20%, -16%) rotate(-30deg) scaleX(1.12);
    }
  }

  @keyframes frame-dragon-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-dragon-orbit {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-dragon-crown {
    0%,
    100% {
      opacity: 0.76;
      transform: scale(0.96) rotate(-2deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.05) rotate(3deg);
    }
  }

  @keyframes frame-dragon-inner {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-dragon-scales {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-dragon-comet {
    0%,
    34%,
    100% {
      opacity: 0;
      transform: translate(-44%, 28%) rotate(-29deg) scaleX(0.36);
    }
    52% {
      opacity: 1;
      transform: translate(-2%, 0) rotate(-29deg) scaleX(1.08);
    }
    70% {
      opacity: 0;
      transform: translate(34%, -24%) rotate(-29deg) scaleX(1.24);
    }
  }

  @keyframes frame-celestial-lustre {
    0%,
    100% {
      filter: brightness(0.98) saturate(1);
    }
    50% {
      filter: brightness(1.15) saturate(1.12);
    }
  }

  @keyframes frame-celestial-crown {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-celestial-inner-ring {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-celestial-constellation {
    0%,
    100% {
      opacity: 0.66;
      filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.66)) brightness(0.92);
    }
    50% {
      opacity: 1;
      filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.94)) brightness(1.2);
    }
  }

  @keyframes frame-celestial-jewel {
    0%,
    34%,
    100% {
      opacity: 0.58;
      transform: translateX(-50%) scale(0.8);
    }
    48% {
      opacity: 1;
      transform: translateX(-50%) scale(1.18);
    }
    62% {
      opacity: 0.76;
      transform: translateX(-50%) scale(0.94);
    }
  }

  @keyframes frame-celestial-orbit {
    to {
      transform: rotate(378deg) scaleY(0.86);
    }
  }

  @keyframes frame-celestial-comet {
    0%,
    42%,
    100% {
      opacity: 0;
      transform: translate(-38%, 24%) rotate(-30deg) scaleX(0.4);
    }
    58% {
      opacity: 1;
      transform: translate(-2%, 0) rotate(-30deg) scaleX(1.05);
    }
    74% {
      opacity: 0;
      transform: translate(30%, -22%) rotate(-30deg) scaleX(1.2);
    }
  }

  @keyframes frame-bookmark-archive-lustre {
    0%,
    100% {
      filter: brightness(0.98) saturate(1);
    }
    50% {
      filter: brightness(1.13) saturate(1.16);
    }
  }

  @keyframes frame-bookmark-archive-crown {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-bookmark-archive-page {
    0%,
    100% {
      opacity: 0.66;
      filter: drop-shadow(0 0 3px rgba(253, 230, 138, 0.62));
    }
    50% {
      opacity: 1;
      filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.92));
    }
  }

  @keyframes frame-bookmark-archive-comet {
    0%,
    46%,
    100% {
      opacity: 0;
      transform: translate(-38%, 24%) rotate(-27deg) scaleX(0.4);
    }
    62% {
      opacity: 1;
      transform: translate(-2%, 0) rotate(-27deg) scaleX(1.04);
    }
    78% {
      opacity: 0;
      transform: translate(28%, -20%) rotate(-27deg) scaleX(1.18);
    }
  }

  @keyframes frame-note-constellation-orbit {
    from {
      transform: rotate(-22deg) scaleY(0.76);
    }
    to {
      transform: rotate(338deg) scaleY(0.76);
    }
  }

  @keyframes frame-note-constellation-comet {
    0%,
    44%,
    100% {
      opacity: 0;
      transform: translate(-38%, 24%) rotate(-28deg) scaleX(0.38);
    }
    60% {
      opacity: 1;
      transform: translate(-2%, 0) rotate(-28deg) scaleX(1.06);
    }
    76% {
      opacity: 0;
      transform: translate(30%, -22%) rotate(-28deg) scaleX(1.2);
    }
  }

  @keyframes frame-file-constellation-orbit {
    from {
      transform: rotate(25deg) scaleY(0.72);
    }
    to {
      transform: rotate(-335deg) scaleY(0.72);
    }
  }

  @keyframes frame-file-constellation-comet {
    0%,
    40%,
    100% {
      opacity: 0;
      transform: translate(-42%, 26%) rotate(-31deg) scaleX(0.36);
    }
    56% {
      opacity: 1;
      transform: translate(-2%, 0) rotate(-31deg) scaleX(1.08);
    }
    72% {
      opacity: 0;
      transform: translate(32%, -24%) rotate(-31deg) scaleX(1.22);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-frame__ring,
    .avatar-frame__ring::before,
    .avatar-frame__ring::after,
    .avatar-frame__motif,
    .avatar-frame__motif::before,
    .avatar-frame__motif::after,
    .avatar-frame__orbit,
    .avatar-frame__orbit::before,
    .avatar-frame__orbit::after,
    .avatar-frame__comet,
    .avatar-frame__comet::before,
    .avatar-frame__comet::after,
    .avatar-frame__signature,
    .avatar-frame__signature::before,
    .avatar-frame__signature::after,
    .avatar-frame__signature-mark,
    .avatar-frame__signature-mark::before,
    .avatar-frame__signature-mark::after,
    .avatar-frame__dragon-crest,
    .avatar-frame__dragon-head,
    .avatar-frame__dragon-head::before,
    .avatar-frame__dragon-head::after {
      animation: none !important;
    }
  }

  .avatar-frame--motion-paused .avatar-frame__ring,
  .avatar-frame--motion-paused .avatar-frame__ring::before,
  .avatar-frame--motion-paused .avatar-frame__ring::after,
  .avatar-frame--motion-paused .avatar-frame__motif,
  .avatar-frame--motion-paused .avatar-frame__motif::before,
  .avatar-frame--motion-paused .avatar-frame__motif::after,
  .avatar-frame--motion-paused .avatar-frame__orbit,
  .avatar-frame--motion-paused .avatar-frame__orbit::before,
  .avatar-frame--motion-paused .avatar-frame__orbit::after,
  .avatar-frame--motion-paused .avatar-frame__comet,
  .avatar-frame--motion-paused .avatar-frame__comet::before,
  .avatar-frame--motion-paused .avatar-frame__comet::after,
  .avatar-frame--motion-paused .avatar-frame__signature,
  .avatar-frame--motion-paused .avatar-frame__signature::before,
  .avatar-frame--motion-paused .avatar-frame__signature::after,
  .avatar-frame--motion-paused .avatar-frame__signature-mark,
  .avatar-frame--motion-paused .avatar-frame__signature-mark::before,
  .avatar-frame--motion-paused .avatar-frame__signature-mark::after,
  .avatar-frame--motion-paused .avatar-frame__dragon-crest,
  .avatar-frame--motion-paused .avatar-frame__dragon-head,
  .avatar-frame--motion-paused .avatar-frame__dragon-head::before,
  .avatar-frame--motion-paused .avatar-frame__dragon-head::after {
    animation: none !important;
  }
</style>
