<template>
  <div
    ref="frameElement"
    class="avatar-frame"
    :class="[
      `avatar-frame--${variant || 'default'}`,
      artwork ? `avatar-frame--motion-${artwork.motion}` : '',
      {
        'avatar-frame--dynamic': isDynamic,
        'avatar-frame--motion-paused': isMotionPaused,
      },
    ]"
    :style="frameStyle"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="avatar-frame__portrait">
      <SvgIcon :src="src" :size="displayAvatarSize" />
    </span>
    <span class="avatar-frame__canvas">
      <span v-if="artwork" class="avatar-frame__ambient" aria-hidden="true"></span>
      <img v-if="artwork" class="avatar-frame__art" :src="artwork.src" alt="" draggable="false" aria-hidden="true" />
      <img
        v-if="hasArtDetail"
        class="avatar-frame__art-detail"
        :src="artwork?.src"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      <span v-if="artwork && !usesDedicatedInnerRing" class="avatar-frame__inner-ring" aria-hidden="true">
        <img class="avatar-frame__art-inner" :src="artwork.src" alt="" draggable="false" />
      </span>
      <template v-if="variant === 'dragon' && artwork?.motionSrc">
        <img
          class="avatar-frame__dragon-layer avatar-frame__dragon-layer--body"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.effectSrc"
          class="avatar-frame__dragon-layer avatar-frame__dragon-layer--cloud-flame"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-trail avatar-frame__dragon-trail--base"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-trail avatar-frame__dragon-trail--mane"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-trail avatar-frame__dragon-trail--left"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-trail avatar-frame__dragon-trail--right"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-trail avatar-frame__dragon-trail--bottom"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <svg
          v-if="artwork.trailSrc"
          class="avatar-frame__dragon-flow"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <g class="avatar-frame__dragon-flow-group avatar-frame__dragon-flow-group--mane">
            <path pathLength="100" d="M60 36 C66 30 70 25 70 16 C70 10 73 6 77 3" />
            <path pathLength="100" d="M65 37 C73 31 78 26 79 18 C80 12 84 9 89 8" />
            <path pathLength="100" d="M69 39 C78 35 84 31 86 25 C88 20 92 18 96 18" />
            <path pathLength="100" d="M72 41 C82 40 88 37 91 32 C93 29 96 28 99 29" />
          </g>
          <g class="avatar-frame__dragon-flow-group avatar-frame__dragon-flow-group--left">
            <path pathLength="100" d="M27 76 C20 72 15 67 16 61 C17 56 13 53 8 51" />
            <path pathLength="100" d="M22 70 C17 65 18 60 21 56 C24 51 22 46 17 42" />
            <path pathLength="100" d="M31 81 C23 79 17 77 12 72 C8 68 6 64 7 60" />
          </g>
          <g class="avatar-frame__dragon-flow-group avatar-frame__dragon-flow-group--right">
            <path pathLength="100" d="M73 78 C80 74 84 69 84 63 C84 57 88 53 94 50" />
            <path pathLength="100" d="M78 82 C85 78 90 74 91 68 C92 63 95 60 99 59" />
            <path pathLength="100" d="M76 73 C81 68 80 63 78 59 C76 55 79 51 84 48" />
          </g>
          <g class="avatar-frame__dragon-flow-group avatar-frame__dragon-flow-group--bottom">
            <path pathLength="100" d="M18 75 C30 86 43 90 56 89 C69 88 80 83 88 75" />
            <path pathLength="100" d="M24 82 C37 91 53 94 67 91 C77 89 85 84 92 78" />
          </g>
        </svg>
        <img
          v-if="artwork.accentSrc"
          class="avatar-frame__dragon-layer avatar-frame__dragon-layer--pearl"
          :src="artwork.accentSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          class="avatar-frame__dragon-ornament avatar-frame__dragon-ornament--crown"
          :src="artwork.src"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          class="avatar-frame__dragon-ornament avatar-frame__dragon-ornament--seal"
          :src="artwork.src"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
      </template>
      <template v-if="variant === 'celestial' && artwork?.motionSrc">
        <img
          class="avatar-frame__celestial-wing avatar-frame__celestial-wing--left"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
        <img
          class="avatar-frame__celestial-wing avatar-frame__celestial-wing--right"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
      </template>
      <template v-if="variant === 'streak-eternal' && artwork?.motionSrc">
        <img
          class="avatar-frame__eternal-object avatar-frame__eternal-object--sun"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
      </template>
      <span v-if="isDynamic" class="avatar-frame__motion avatar-frame__motion--back" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </span>
    </span>
    <span class="avatar-frame__canvas avatar-frame__canvas--front" aria-hidden="true">
      <img v-if="hasArtFocus" class="avatar-frame__art-focus" :src="artwork?.src" alt="" draggable="false" />
      <img
        v-if="variant === 'dragon' && artwork?.motionSrc"
        class="avatar-frame__dragon-layer avatar-frame__dragon-layer--head"
        :src="artwork.motionSrc"
        alt=""
        draggable="false"
      />
      <span v-if="variant === 'streak-eternal' && artwork?.motionSpriteSrc" class="avatar-frame__eternal-rabbit-runner">
        <span class="avatar-frame__eternal-rabbit-direction">
          <span
            class="avatar-frame__eternal-rabbit-sprite"
            :style="{ backgroundImage: `url(${artwork.motionSpriteSrc})` }"
          ></span>
        </span>
      </span>
      <span v-if="isDynamic" class="avatar-frame__motion avatar-frame__motion--front">
        <i></i><i></i><i></i><i></i>
      </span>
    </span>
    <span v-if="artwork" class="avatar-frame__bezel" aria-hidden="true"></span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { avatarFrameArtwork } from '@/config/avatarFrameArtwork';
  import { frameVariant } from '@/config/growthFrames';

  // 装饰统一在 64px 设计画布中缩放；头像本体独立按请求像素渲染，避免小尺寸二次缩放失焦。
  const FRAME_DESIGN_AVATAR_SIZE = 64;
  const FRAME_DESIGN_RIM = 6;
  const FRAME_DESIGN_OUTER_SIZE = FRAME_DESIGN_AVATAR_SIZE + FRAME_DESIGN_RIM * 2;

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
  const artwork = computed(() => avatarFrameArtwork(variant.value));
  const isDynamic = computed(() => artwork.value?.motion !== undefined && artwork.value.motion !== 'static');
  const hasArtDetail = computed(() =>
    Boolean(
      variant.value &&
      [
        'flame',
        'ocean',
        'aurora',
        'note-masterpiece',
        'file-vault',
        'neon',
        'galaxy',
        'bookmark-archive',
        'note-constellation',
        'file-constellation',
      ].includes(variant.value),
    ),
  );
  // 只有确实跨入头像孔的身份主体才保留前景焦点；普通框体统一由窄内沿层贴合头像，避免遮住头像内容。
  const hasArtFocus = computed(() => variant.value === 'flame');
  // 龙曜底图已经包含完整金属内圈；再次缩放同源底图会生成第二套曲率，让龙身与框体接头错位。
  const usesDedicatedInnerRing = computed(() => variant.value === 'dragon');
  const displayAvatarSize = computed(() => Math.max(1, Number(props.size) || 1));
  const frameStyle = computed(() => {
    const scale = displayAvatarSize.value / FRAME_DESIGN_AVATAR_SIZE;
    const layoutOuterSize = artwork.value?.outerSize ?? FRAME_DESIGN_OUTER_SIZE;
    const displayOuterSize = Math.round(layoutOuterSize * scale);
    return {
      '--frame-display-outer-size': `${displayOuterSize}px`,
      '--frame-display-avatar-size': `${displayAvatarSize.value}px`,
      '--frame-canvas-scale': String(scale),
      '--frame-outer-size': `${FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-art-size': `${artwork.value?.artSize ?? FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-inner-art-size': `${artwork.value?.innerArtSize ?? FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-effect-size': `${layoutOuterSize}px`,
      '--frame-accent': artwork.value?.accent ?? '#cbd5e1',
      '--frame-glow': artwork.value?.glow ?? 'rgba(148, 163, 184, 0.2)',
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
    z-index: 1;
    position: absolute;
    top: 50%;
    left: 50%;
    display: inline-grid;
    place-items: center;
    width: var(--frame-outer-size);
    height: var(--frame-outer-size);
    transform: translate(-50%, -50%) scale(var(--frame-canvas-scale));
    transform-origin: center;
    backface-visibility: hidden;
  }

  .avatar-frame__canvas--front {
    z-index: 4;
  }

  .avatar-frame__ambient,
  .avatar-frame__art,
  .avatar-frame__art-detail,
  .avatar-frame__inner-ring,
  .avatar-frame__art-inner,
  .avatar-frame__art-focus,
  .avatar-frame__dragon-layer,
  .avatar-frame__dragon-trail,
  .avatar-frame__dragon-flow,
  .avatar-frame__dragon-ornament,
  .avatar-frame__celestial-wing,
  .avatar-frame__eternal-object,
  .avatar-frame__eternal-rabbit-runner,
  .avatar-frame__eternal-rabbit-direction,
  .avatar-frame__eternal-rabbit-sprite,
  .avatar-frame__motion,
  .avatar-frame__portrait,
  .avatar-frame__bezel {
    position: absolute;
    pointer-events: none;
  }

  .avatar-frame__ambient {
    z-index: 0;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    border-radius: 50%;
    background: radial-gradient(circle, transparent 48%, var(--frame-glow) 64%, transparent 77%);
    filter: blur(4px);
    opacity: 0.72;
    transform: translate(-50%, -50%);
  }

  .avatar-frame--motion-static .avatar-frame__ambient {
    opacity: 0.42;
    filter: blur(3px);
  }

  // 动态档必须在 2 秒内能被察觉：主题动画之外保留一条连续材质光脉，避免长周期首段看起来完全静止。
  .avatar-frame--dynamic .avatar-frame__ambient {
    animation: frame-ambient-breathe 3.2s ease-in-out infinite;
    will-change: opacity, transform, filter;
  }

  .avatar-frame--motion-colorful .avatar-frame__ambient {
    animation-duration: 2.8s;
  }

  .avatar-frame--motion-legendary .avatar-frame__ambient {
    animation-duration: 2.4s;
  }

  .avatar-frame--motion-ceiling .avatar-frame__ambient {
    animation-duration: 2s;
  }

  .avatar-frame__art {
    z-index: 3;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow));
    user-select: none;
    -webkit-user-drag: none;
  }

  // 只复制需要“素材本体局部运动”的主题区域；裁切后的高光与原画完全同源，避免悬浮贴纸感。
  .avatar-frame__art-detail {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }

  .avatar-frame__art-focus {
    top: 50%;
    left: 50%;
    display: block;
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    user-select: none;
    -webkit-user-drag: none;
  }

  // 外框继续按稀有度使用各自视觉尺寸；普通素材复制一条同源窄内沿，并逐款缩放到 64px 中央开孔。
  // 已经自带完整金属内圈的复合素材（如龙曜）走专属内沿，不能再复制整张素材。
  // 80px 安全窗限制外径，64px 独立头像盖住中心，最终只露出半径 32–40px 的主题材质。
  .avatar-frame__inner-ring {
    z-index: 5;
    top: 50%;
    left: 50%;
    width: 80px;
    height: 80px;
    overflow: hidden;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__art-inner {
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-inner-art-size);
    height: var(--frame-inner-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    filter: drop-shadow(0 0 1.5px var(--frame-glow));
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__art-focus {
    z-index: 5;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
  }

  .avatar-frame--dynamic .avatar-frame__art,
  .avatar-frame--dynamic .avatar-frame__art-detail,
  .avatar-frame--dynamic .avatar-frame__art-focus,
  .avatar-frame--dynamic .avatar-frame__dragon-layer,
  .avatar-frame--dynamic .avatar-frame__dragon-trail,
  .avatar-frame--dynamic .avatar-frame__dragon-flow path,
  .avatar-frame--dynamic .avatar-frame__dragon-ornament,
  .avatar-frame--dynamic .avatar-frame__celestial-wing,
  .avatar-frame--dynamic .avatar-frame__eternal-object,
  .avatar-frame--dynamic .avatar-frame__eternal-rabbit-runner,
  .avatar-frame--dynamic .avatar-frame__eternal-rabbit-direction,
  .avatar-frame--dynamic .avatar-frame__eternal-rabbit-sprite,
  .avatar-frame--dynamic .avatar-frame__motion::before,
  .avatar-frame--dynamic .avatar-frame__motion::after,
  .avatar-frame--dynamic .avatar-frame__motion i {
    will-change: transform, opacity, filter;
  }

  .avatar-frame__motion {
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__motion--back {
    z-index: 2;
  }

  .avatar-frame__motion--front {
    z-index: 4;
  }

  .avatar-frame__motion::before,
  .avatar-frame__motion::after,
  .avatar-frame__motion i {
    position: absolute;
    display: block;
    content: '';
    pointer-events: none;
  }

  .avatar-frame__motion i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--frame-accent);
    box-shadow: 0 0 5px var(--frame-glow);
    opacity: 0;
  }

  .avatar-frame__portrait {
    z-index: 2;
    top: 50%;
    left: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-display-avatar-size);
    height: var(--frame-display-avatar-size);
    overflow: hidden;
    border: 0;
    border-radius: 50%;
    background: var(--background-color);
    box-shadow: none;
    transform: translate(-50%, -50%);
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

  // 头像本体脱离主题缩放画布，始终按调用方给定像素直接渲染；装饰只在头像外缘活动，不能改其尺寸与清晰度。
  .avatar-frame__bezel {
    z-index: 3;
    top: 50%;
    left: 50%;
    width: var(--frame-display-avatar-size);
    height: var(--frame-display-avatar-size);
    border: 1.25px solid var(--frame-accent);
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.58),
      0 0 4px var(--frame-glow);
    opacity: 0.9;
    transform: translate(-50%, -50%);
  }

  .avatar-frame--default .avatar-frame__portrait {
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.42);
  }

  /* 进阶积分：局部材质开始动态，不让框体无意义地整圈旋转。 */
  .avatar-frame--dynamic.avatar-frame--gold .avatar-frame__art {
    animation: frame-gold-breathe 4.6s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__motion--front::before {
    top: 8px;
    left: 12px;
    width: 26px;
    height: 2px;
    border-radius: 50%;
    background: linear-gradient(90deg, transparent, #fff7c2, transparent);
    filter: blur(0.3px) drop-shadow(0 0 3px #fbbf24);
    transform: rotate(-34deg);
    animation: frame-gold-glint 4.6s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__motion--front::after {
    right: 12px;
    bottom: 13px;
    width: 4px;
    height: 4px;
    background: #fff7c2;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    animation: frame-local-twinkle 2.7s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--sakura .avatar-frame__art {
    animation: frame-sakura-bloom 5.2s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(1) {
    top: 7px;
    left: 14px;
    width: 6px;
    height: 4px;
    border-radius: 70% 25% 70% 25%;
    background: #ffd1df;
    animation: frame-petal-drift 4.8s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(2) {
    top: 14px;
    right: 9px;
    width: 5px;
    height: 3px;
    border-radius: 70% 25% 70% 25%;
    background: #ff9fbd;
    animation: frame-petal-drift 4.8s 1.6s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(3) {
    right: 15px;
    bottom: 7px;
    width: 6px;
    height: 4px;
    border-radius: 70% 25% 70% 25%;
    background: #ffe0e9;
    animation: frame-petal-drift 4.8s 3.2s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--sunset .avatar-frame__art {
    animation: frame-sunset-sky 5.4s ease-in-out infinite;
  }

  .avatar-frame--sunset .avatar-frame__motion--back::before {
    top: 8px;
    right: 9px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff7cc 0 28%, #ffb168 48%, transparent 72%);
    animation: frame-sunset-sun 4.2s ease-in-out infinite;
  }

  .avatar-frame--sunset .avatar-frame__motion--back::after {
    left: 10px;
    bottom: 9px;
    width: 38px;
    height: 8px;
    border-radius: 50%;
    border-top: 2px solid rgba(255, 227, 209, 0.86);
    animation: frame-cloud-breathe 5.4s ease-in-out infinite;
  }

  /* 炫彩成就：主题局部运动；炫彩积分：增加第二动态通道和更明显能量变化。 */
  .avatar-frame--dynamic.avatar-frame--streak-month .avatar-frame__art {
    animation: frame-moonlight-breathe 5.2s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front::before {
    top: 6px;
    left: 50%;
    width: 9px;
    height: 9px;
    margin-left: -4.5px;
    border-radius: 50%;
    background: #f5f3ff;
    box-shadow: 0 0 10px #c4b5fd;
    transform-origin: 4.5px 38px;
    animation: frame-moon-phase-travel 5.2s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--back::after {
    top: 6px;
    right: 8px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.9), rgba(165, 180, 252, 0.32) 46%, transparent 72%);
    animation: frame-local-pulse 3s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(2) {
    width: 4px;
    height: 4px;
    border-radius: 0;
    background: #eef2ff;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    animation: frame-moon-star-twinkle 3.6s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(1) {
    left: 10px;
    bottom: 16px;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(2) {
    right: 9px;
    bottom: 21px;
    animation-delay: -1.8s;
  }

  .avatar-frame--note-masterpiece .avatar-frame__art-detail {
    // 同源副本只做像素对齐的水色明暗变化；真实位移交给独立水线和星点，避免带动金属环残影。
    clip-path: polygon(0 53%, 24% 58%, 41% 71%, 55% 66%, 71% 56%, 100% 47%, 100% 100%, 0 100%);
    animation: frame-note-water-flow 3.8s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--back::after {
    left: 2px;
    bottom: 5px;
    width: 61px;
    height: 20px;
    border-bottom: 3px solid rgba(153, 246, 228, 0.96);
    border-radius: 50%;
    filter: drop-shadow(0 0 3px #2dd4bf);
    animation: frame-ink-current 3.8s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front::before {
    left: 18px;
    bottom: 9px;
    width: 30px;
    height: 9px;
    border-top: 2px solid rgba(204, 251, 241, 0.88);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(45, 212, 191, 0.9));
    animation: frame-note-river-glint 3.8s -1.1s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(2) {
    left: 11px;
    bottom: 13px;
    width: 4px;
    height: 4px;
    background: #ccfbf1;
    box-shadow: 0 0 7px #2dd4bf;
    animation: frame-river-spark 3.8s linear infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(2) {
    animation-delay: 1.9s;
  }

  .avatar-frame--dynamic.avatar-frame--file-vault .avatar-frame__art {
    animation: frame-vault-metal-light 4.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__art-detail {
    // 只高亮顶部云阙，不再让同源副本覆盖整圈结构。
    clip-path: polygon(25% 0, 75% 0, 70% 35%, 30% 35%);
    transform-origin: 50% 18%;
    animation: frame-vault-cloud-gate 3.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--back::before {
    top: 8px;
    left: 50%;
    width: 22px;
    height: 27px;
    margin-left: -11px;
    border-radius: 7px 7px 48% 48%;
    background: linear-gradient(
      180deg,
      rgba(254, 240, 138, 0.9),
      rgba(96, 165, 250, 0.78) 28%,
      rgba(67, 56, 202, 0.24) 70%,
      transparent
    );
    box-shadow:
      inset 0 0 5px rgba(219, 234, 254, 0.8),
      0 0 8px rgba(59, 130, 246, 0.72);
    clip-path: polygon(18% 0, 82% 0, 100% 100%, 0 100%);
    transform-origin: 50% 0;
    animation: frame-vault-energy-curtain 3.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front::before {
    top: 3px;
    left: 50%;
    width: 13px;
    height: 13px;
    margin-left: -6.5px;
    background: linear-gradient(
      135deg,
      rgba(219, 234, 254, 0.98),
      rgba(59, 130, 246, 0.96) 48%,
      rgba(79, 70, 229, 0.82)
    );
    clip-path: polygon(50% 0, 64% 34%, 100% 50%, 64% 66%, 50% 100%, 36% 66%, 0 50%, 36% 34%);
    filter: drop-shadow(0 0 5px rgba(96, 165, 250, 1));
    transform-origin: center;
    animation: frame-vault-door-shine 3.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front::after {
    top: 17px;
    left: 50%;
    width: 30px;
    height: 11px;
    margin-left: -15px;
    border-top: 2px solid rgba(254, 240, 138, 0.72);
    border-bottom: 2.5px solid rgba(147, 197, 253, 1);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(96, 165, 250, 0.9));
    animation: frame-vault-cloud-rise 3.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--back::after {
    right: 5px;
    bottom: 8px;
    width: 30px;
    height: 8px;
    border-top: 2.5px solid rgba(224, 242, 254, 0.94);
    box-shadow: -9px 3px 0 -1px rgba(147, 197, 253, 0.55);
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgba(96, 165, 250, 0.74));
    animation: frame-vault-cloud-drift 4.2s -1.1s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i {
    width: 5px;
    height: 5px;
    border-radius: 0;
    background: #93c5fd;
    clip-path: polygon(50% 0, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0 50%, 36% 36%);
    box-shadow: none;
    filter: drop-shadow(0 0 2px rgba(96, 165, 250, 0.92));
    animation: frame-vault-data-rise 3.6s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(1) {
    left: 8px;
    bottom: 16px;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(2) {
    right: 8px;
    bottom: 16px;
    animation-delay: -0.9s;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(3) {
    left: 16px;
    bottom: 7px;
    animation-delay: -1.8s;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(4) {
    right: 16px;
    bottom: 7px;
    animation-delay: -2.7s;
  }

  .avatar-frame--dynamic.avatar-frame--ocean .avatar-frame__art {
    animation: frame-ocean-metal-light 4.8s ease-in-out infinite;
  }

  .avatar-frame--ocean .avatar-frame__art-detail {
    clip-path: polygon(0 0, 52% 0, 57% 22%, 42% 41%, 53% 63%, 43% 100%, 0 100%);
    animation: frame-ocean-water-flow 4.8s linear infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--back::before {
    top: 17px;
    left: 3px;
    width: 31px;
    height: 66px;
    background: linear-gradient(
      180deg,
      rgba(224, 242, 254, 0.1),
      rgba(125, 211, 252, 0.7) 26%,
      rgba(14, 165, 233, 0.68) 58%,
      rgba(30, 64, 175, 0.08)
    );
    clip-path: polygon(
      55% 0,
      75% 7%,
      64% 19%,
      82% 31%,
      63% 44%,
      78% 58%,
      57% 72%,
      68% 86%,
      43% 100%,
      29% 88%,
      45% 73%,
      31% 58%,
      49% 44%,
      35% 29%,
      53% 17%,
      42% 6%
    );
    transform-origin: 72% 52%;
    animation: frame-ocean-undertow 4.8s cubic-bezier(0.42, 0, 0.24, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--back::after {
    bottom: 8px;
    left: 15px;
    width: 48px;
    height: 11px;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.88),
      rgba(125, 211, 252, 0.7) 48%,
      rgba(2, 132, 199, 0.08)
    );
    clip-path: polygon(
      0 70%,
      14% 46%,
      27% 58%,
      40% 24%,
      54% 53%,
      68% 14%,
      82% 48%,
      100% 28%,
      91% 82%,
      72% 70%,
      55% 100%,
      34% 76%,
      14% 94%
    );
    transform-origin: 16% 68%;
    animation: frame-ocean-return 4.8s cubic-bezier(0.42, 0, 0.24, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front::before {
    top: 16px;
    left: 7px;
    width: 28px;
    height: 12px;
    background: linear-gradient(150deg, #fff 0 18%, #bae6fd 22% 48%, #38bdf8 52% 72%, rgba(14, 116, 144, 0.08) 100%);
    clip-path: polygon(0 74%, 13% 52%, 24% 59%, 36% 12%, 48% 50%, 60% 3%, 72% 46%, 84% 18%, 100% 54%, 88% 88%, 0 100%);
    transform-origin: 82% 78%;
    animation: frame-ocean-current 4.8s cubic-bezier(0.42, 0, 0.24, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front::after {
    top: 43px;
    left: 0;
    width: 24px;
    height: 11px;
    background: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.96) 0 20%,
      rgba(186, 230, 253, 0.9) 24% 52%,
      rgba(14, 165, 233, 0.2) 74%,
      transparent
    );
    clip-path: polygon(
      0 76%,
      15% 50%,
      29% 61%,
      43% 12%,
      57% 52%,
      72% 4%,
      84% 45%,
      100% 24%,
      92% 84%,
      63% 72%,
      38% 100%,
      14% 88%
    );
    transform-origin: 88% 78%;
    animation: frame-foam-rise 4.8s cubic-bezier(0.42, 0, 0.24, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i {
    width: 9px;
    height: 5px;
    border-radius: 0;
    background: linear-gradient(145deg, #fff 0 26%, #bae6fd 30% 60%, rgba(56, 189, 248, 0.08));
    clip-path: polygon(0 70%, 23% 46%, 38% 58%, 54% 5%, 72% 48%, 100% 24%, 86% 88%, 42% 78%, 18% 100%);
    box-shadow: none;
    animation: frame-ocean-crest-run 4.8s cubic-bezier(0.42, 0, 0.24, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(1) {
    top: 13px;
    left: 15px;
    --ocean-crest-angle: -24deg;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(2) {
    top: 36px;
    left: 2px;
    --ocean-crest-angle: -73deg;
    animation-delay: -1.6s;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(3) {
    bottom: 14px;
    left: 18px;
    --ocean-crest-angle: -132deg;
    animation-delay: -3.2s;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(4) {
    bottom: 25px;
    left: 3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #e0f2fe;
    clip-path: none;
    animation: frame-water-drop 3.6s -0.8s cubic-bezier(0.36, 0, 0.2, 1) infinite;
  }

  .avatar-frame--dynamic.avatar-frame--aurora .avatar-frame__art {
    animation: frame-aurora-metal-light 5.4s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__ambient {
    background:
      radial-gradient(ellipse at 24% 64%, rgba(34, 211, 238, 0.42), transparent 34%),
      radial-gradient(ellipse at 76% 64%, rgba(168, 85, 247, 0.42), transparent 34%),
      radial-gradient(circle, transparent 52%, rgba(103, 232, 249, 0.22) 66%, transparent 78%);
    filter: blur(2px);
    opacity: 0.62;
  }

  .avatar-frame--aurora .avatar-frame__art-detail {
    clip-path: polygon(0 42%, 30% 42%, 42% 68%, 58% 68%, 70% 42%, 100% 42%, 100% 100%, 0 100%);
    opacity: 0.22;
    animation: frame-aurora-ribbon-flow 4.2s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--back::before,
  .avatar-frame--aurora .avatar-frame__motion--back::after {
    bottom: 7px;
    width: 24px;
    height: 48px;
    background: linear-gradient(
      155deg,
      transparent 5% 24%,
      rgba(103, 232, 249, 0.78) 43%,
      rgba(139, 92, 246, 0.68) 61%,
      transparent 79%
    );
    clip-path: polygon(
      8% 100%,
      12% 68%,
      35% 47%,
      18% 35%,
      52% 27%,
      42% 10%,
      82% 20%,
      100% 0,
      92% 42%,
      72% 70%,
      68% 100%
    );
    filter: drop-shadow(0 0 2px rgba(103, 232, 249, 0.72));
    mix-blend-mode: screen;
    transform-origin: 50% 100%;
  }

  .avatar-frame--aurora .avatar-frame__motion--back::before {
    left: 8px;
    animation: frame-aurora-veil-left 3.8s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--back::after {
    right: 8px;
    background: linear-gradient(
      205deg,
      transparent 5% 24%,
      rgba(196, 181, 253, 0.78) 43%,
      rgba(34, 211, 238, 0.66) 61%,
      transparent 79%
    );
    animation: frame-aurora-veil-right 3.8s -1.9s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--back i {
    display: none;
  }

  .avatar-frame--aurora .avatar-frame__motion--front::before {
    display: none;
  }

  .avatar-frame--aurora .avatar-frame__motion--front::after {
    top: 0;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: radial-gradient(circle, #fff 0 18%, #a5f3fc 24% 42%, #8b5cf6 54% 70%, transparent 74%);
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 4px rgba(103, 232, 249, 0.92)) drop-shadow(0 0 7px rgba(139, 92, 246, 0.58));
    animation: frame-aurora-core-charge 4.2s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i {
    width: 2px;
    height: 2px;
    border-radius: 0;
    background: #c4b5fd;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    box-shadow: none;
    animation: frame-local-twinkle 4.2s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(1) {
    top: 18px;
    left: 8px;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(2) {
    top: 22px;
    right: 7px;
    animation-delay: -2.1s;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(3),
  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(4) {
    bottom: 15px;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(3) {
    left: 9px;
    animation-delay: -1.05s;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(4) {
    right: 9px;
    animation-delay: -3.15s;
  }

  .avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art {
    animation: frame-flame-metal-light 4.2s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motion--back::before,
  .avatar-frame--flame .avatar-frame__motion--back::after,
  .avatar-frame--flame .avatar-frame__motion--back i {
    display: none;
  }

  .avatar-frame--flame .avatar-frame__motion--front::before {
    top: 6px;
    right: 7px;
    width: 7px;
    height: 15px;
    background: linear-gradient(180deg, #fff7b2 0 8%, #fbbf24 24%, #f97316 58%, rgba(220, 38, 38, 0.2) 100%);
    clip-path: polygon(50% 0, 72% 31%, 64% 50%, 92% 76%, 57% 100%, 20% 82%, 34% 55%, 12% 35%, 42% 43%);
    filter: drop-shadow(0 0 2px rgba(251, 146, 60, 0.86));
    transform-origin: 50% 100%;
    animation: frame-flame-tongue 2.8s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motion--front::after {
    bottom: 13px;
    left: 6px;
    width: 6px;
    height: 13px;
    background: linear-gradient(180deg, #fff3a6 0 9%, #fb923c 32%, #ea580c 66%, rgba(185, 28, 28, 0.18) 100%);
    clip-path: polygon(48% 0, 70% 28%, 62% 49%, 90% 75%, 56% 100%, 18% 82%, 32% 56%, 10% 34%, 42% 42%);
    filter: drop-shadow(0 0 2px rgba(251, 146, 60, 0.82));
    transform-origin: 50% 100%;
    --flame-side-angle: -34deg;
    animation: frame-flame-side-burn 2.9s -1.45s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motion--front i {
    right: 9px;
    bottom: 13px;
    width: 2px;
    height: 4px;
    border-radius: 60% 20% 60% 20%;
    background: #ffe08a;
    animation: frame-ember-rise 3.8s ease-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motion--front i:nth-child(2) {
    right: 14px;
    animation-delay: -1.9s;
  }

  .avatar-frame--flame .avatar-frame__motion--front i:nth-child(3) {
    right: auto;
    bottom: 15px;
    left: 9px;
    animation-delay: -0.95s;
  }

  .avatar-frame--flame .avatar-frame__motion--front i:nth-child(4) {
    right: auto;
    bottom: 20px;
    left: 15px;
    animation-delay: -2.85s;
  }

  .avatar-frame--flame .avatar-frame__art-detail {
    clip-path: polygon(0 30%, 24% 30%, 34% 67%, 50% 84%, 66% 67%, 76% 22%, 100% 20%, 100% 100%, 0 100%);
    opacity: 0.18;
    animation: frame-flame-material 3.6s ease-in-out infinite;
  }

  // 赤焰凤首是跨过内沿的身份主体，保留原尺寸前景；其余圆环仍由头像遮罩和校准内沿共同约束。
  .avatar-frame--flame .avatar-frame__art-focus {
    clip-path: polygon(47% 0, 100% 0, 100% 48%, 76% 48%, 62% 38%, 47% 28%);
    filter: drop-shadow(0 0 2px rgba(251, 146, 60, 0.72));
  }

  /* 积分传说严格递进：霓虹 < 星河 < 龙曜 < 天穹。 */
  .avatar-frame--dynamic.avatar-frame--neon .avatar-frame__art {
    animation: frame-neon-pulse 3.8s ease-in-out infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--back::before {
    inset: 4px;
    border: 3px solid transparent;
    border-top-color: rgba(103, 232, 249, 0.96);
    border-right-color: rgba(217, 70, 239, 0.92);
    border-bottom-color: rgba(103, 232, 249, 0.58);
    border-radius: 50%;
    box-shadow:
      0 0 6px rgba(34, 211, 238, 0.82),
      inset 0 0 5px rgba(217, 70, 239, 0.52);
    animation: frame-neon-chase 3.4s linear infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--back::after {
    top: 4px;
    left: 50%;
    width: 5px;
    height: 9px;
    margin-left: -2.5px;
    border-radius: 50%;
    background: #f5d0fe;
    box-shadow:
      0 0 5px #67e8f9,
      0 0 11px #d946ef;
    transform-origin: 2.5px 51px;
    animation: frame-neon-node-sweep 3.4s ease-in-out infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--back i {
    width: 8px;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, #ecfeff 35%, #67e8f9 58%, #d946ef 100%);
    box-shadow: 0 0 4px rgba(34, 211, 238, 0.78);
    animation: frame-neon-circuit-flow 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(1) {
    top: 5px;
    left: 31px;
    --neon-circuit-angle: 8deg;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(2) {
    top: 35px;
    right: 3px;
    --neon-circuit-angle: 92deg;
    animation-delay: -0.8s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(3) {
    bottom: 5px;
    left: 40px;
    --neon-circuit-angle: 178deg;
    animation-delay: -1.6s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(4) {
    top: 53px;
    left: 3px;
    --neon-circuit-angle: 88deg;
    animation-delay: -2.4s;
  }

  .avatar-frame--neon .avatar-frame__motion--front::before {
    top: 15px;
    left: 7px;
    width: 18px;
    height: 7px;
    border-top: 3px solid #67e8f9;
    border-radius: 50%;
    filter: drop-shadow(0 0 4px #06b6d4);
    animation: frame-neon-arc 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--front::after {
    right: 7px;
    bottom: 13px;
    width: 16px;
    height: 6px;
    border-bottom: 3px solid #f0abfc;
    border-radius: 50%;
    filter: drop-shadow(0 0 4px #d946ef);
    animation: frame-neon-arc 2.8s -1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite reverse;
  }

  .avatar-frame--neon .avatar-frame__motion--front i {
    width: 4px;
    height: 4px;
    background: #ecfeff;
    animation: frame-neon-spark 2.4s ease-out infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(1) {
    top: 10px;
    right: 18px;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(2) {
    right: 8px;
    bottom: 24px;
    animation-delay: 0.8s;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(3) {
    bottom: 8px;
    left: 22px;
    animation-delay: 1.6s;
  }

  .avatar-frame--neon .avatar-frame__art-detail {
    clip-path: polygon(0 0, 64% 0, 61% 28%, 48% 43%, 31% 53%, 0 61%);
    transform-origin: 30% 24%;
    animation: frame-neon-crystal-charge 3.4s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--galaxy .avatar-frame__art {
    animation: frame-galaxy-breathe 5.2s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--back::before {
    top: 8px;
    left: -2px;
    width: 96px;
    height: 72px;
    border: 2px solid rgba(254, 240, 138, 0.76);
    border-radius: 50%;
    box-shadow:
      0 0 5px rgba(196, 181, 253, 0.64),
      inset 0 0 5px rgba(124, 58, 237, 0.32);
    transform: rotate(24deg);
    animation: frame-galaxy-orbit 6.8s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--back::after {
    top: -1px;
    left: 17px;
    width: 72px;
    height: 104px;
    border: 1px solid rgba(196, 181, 253, 0.68);
    border-right-color: rgba(254, 240, 138, 0.9);
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgba(167, 139, 250, 0.72));
    transform: rotate(58deg);
    animation: frame-galaxy-orbit-reverse 8.4s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front::before {
    top: 4px;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: #fff8c7;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 4px #fef08a) drop-shadow(0 0 8px #a78bfa);
    transform-origin: 4px 51px;
    animation: frame-galaxy-comet-sweep 4.2s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front::after {
    right: 6px;
    bottom: 12px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #c4b5fd 34%, #6d28d9 68%, transparent 72%);
    box-shadow: 0 0 8px rgba(167, 139, 250, 0.9);
    animation: frame-galaxy-planet-pulse 3.2s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i {
    animation: frame-star-drift 4.8s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(1) {
    top: 8px;
    left: 18px;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(2) {
    right: 9px;
    bottom: 19px;
    animation-delay: 1.6s;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(3) {
    left: 11px;
    bottom: 14px;
    animation-delay: 3.2s;
  }

  .avatar-frame--galaxy .avatar-frame__art-detail {
    clip-path: polygon(0 52%, 18% 50%, 42% 62%, 68% 58%, 100% 48%, 100% 100%, 0 100%);
    animation: frame-galaxy-nebula-shimmer 5.2s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--dragon .avatar-frame__art {
    animation: frame-dragon-metal-light 5.8s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__ambient {
    background:
      radial-gradient(circle at 69% 31%, rgba(255, 191, 36, 0.42), transparent 28%),
      radial-gradient(circle, transparent 46%, rgba(249, 115, 22, 0.26) 63%, transparent 78%);
    filter: blur(3px);
  }

  .avatar-frame__dragon-layer,
  .avatar-frame__dragon-trail,
  .avatar-frame__dragon-ornament {
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__dragon-layer--body {
    z-index: 4;
    filter: brightness(1.02) saturate(1.04) drop-shadow(0 1px 1px rgba(120, 53, 15, 0.32));
    backface-visibility: hidden;
  }

  .avatar-frame__dragon-layer--cloud-flame {
    z-index: 5;
    filter: brightness(1.04) saturate(1.04) drop-shadow(0 0 2px rgba(249, 115, 22, 0.44));
    animation: frame-dragon-cloud-light 4.6s ease-in-out infinite;
  }

  // 参考图圈出的焰须、左右游丝与底部弧光使用同画布透明线稿分区驱动；
  // 底层火丝保持像素对齐，亮脉只沿线条掠过，避免平移整块裁片产生贴纸感或断层。
  .avatar-frame__dragon-trail {
    z-index: 7;
    filter: saturate(1.28) contrast(1.08) drop-shadow(0 0 2px rgba(249, 115, 22, 0.82));
  }

  .avatar-frame__dragon-trail--base {
    opacity: 0.46;
    filter: brightness(1.02) saturate(1.16) drop-shadow(0 0 1px rgba(249, 115, 22, 0.6));
    animation: frame-dragon-trail-ember 4.8s ease-in-out infinite;
  }

  .avatar-frame__dragon-trail--mane,
  .avatar-frame__dragon-trail--left,
  .avatar-frame__dragon-trail--right,
  .avatar-frame__dragon-trail--bottom {
    opacity: 1;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: 190% 190%;
    mask-size: 190% 190%;
    filter: brightness(2.35) saturate(1.46) contrast(1.12) drop-shadow(0 0 3.5px rgba(255, 139, 18, 1));
  }

  .avatar-frame__dragon-trail--mane {
    z-index: 9;
    clip-path: polygon(57% 0, 100% 0, 100% 49%, 69% 49%, 57% 37%);
    -webkit-mask-image: linear-gradient(
      112deg,
      transparent 27%,
      rgba(0, 0, 0, 0.18) 39%,
      #000 50%,
      rgba(0, 0, 0, 0.24) 61%,
      transparent 73%
    );
    mask-image: linear-gradient(
      112deg,
      transparent 27%,
      rgba(0, 0, 0, 0.18) 39%,
      #000 50%,
      rgba(0, 0, 0, 0.24) 61%,
      transparent 73%
    );
    animation: frame-dragon-trail-mane 1.9s linear infinite;
  }

  .avatar-frame__dragon-trail--left {
    clip-path: polygon(0 34%, 34% 34%, 34% 93%, 0 93%);
    -webkit-mask-image: linear-gradient(
      148deg,
      transparent 28%,
      rgba(0, 0, 0, 0.2) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.22) 60%,
      transparent 72%
    );
    mask-image: linear-gradient(
      148deg,
      transparent 28%,
      rgba(0, 0, 0, 0.2) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.22) 60%,
      transparent 72%
    );
    animation: frame-dragon-trail-left 2.8s -0.9s linear infinite;
  }

  .avatar-frame__dragon-trail--right {
    clip-path: polygon(66% 34%, 100% 34%, 100% 93%, 66% 93%);
    -webkit-mask-image: linear-gradient(
      32deg,
      transparent 28%,
      rgba(0, 0, 0, 0.2) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.22) 60%,
      transparent 72%
    );
    mask-image: linear-gradient(
      32deg,
      transparent 28%,
      rgba(0, 0, 0, 0.2) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.22) 60%,
      transparent 72%
    );
    animation: frame-dragon-trail-right 2.7s -1.8s linear infinite;
  }

  .avatar-frame__dragon-trail--bottom {
    clip-path: polygon(10% 68%, 92% 68%, 92% 100%, 10% 100%);
    -webkit-mask-image: linear-gradient(
      90deg,
      transparent 27%,
      rgba(0, 0, 0, 0.18) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.24) 60%,
      transparent 73%
    );
    mask-image: linear-gradient(
      90deg,
      transparent 27%,
      rgba(0, 0, 0, 0.18) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.24) 60%,
      transparent 73%
    );
    animation: frame-dragon-trail-bottom 3.2s -0.6s linear infinite;
  }

  // 线稿遮罩负责持续底光，矢量火脉沿参考图的龙鬃、左右火丝和底部弧线真实行进。
  // 这里不移动整张素材，也不改变龙身与头像框坐标，避免局部错层或“整块贴纸”感。
  .avatar-frame__dragon-flow {
    z-index: 8;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    overflow: visible;
    color: #fff0a0;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 0 1.4px rgba(255, 247, 194, 1)) drop-shadow(0 0 3.6px rgba(249, 115, 22, 0.96));
    user-select: none;
  }

  .avatar-frame__dragon-flow path {
    --dragon-flow-duration: 2.15s;
    --dragon-flow-delay: 0s;
    --dragon-sway-duration: 2.8s;
    --dragon-sway-delay: 0s;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 28 7;
    vector-effect: non-scaling-stroke;
    opacity: 1;
    will-change: transform, stroke-dashoffset, opacity;
  }

  .avatar-frame__dragon-flow path:nth-child(2) {
    --dragon-flow-duration: 2.45s;
    --dragon-flow-delay: -0.8s;
    --dragon-sway-duration: 3.15s;
    --dragon-sway-delay: -1.1s;
    stroke-width: 1.02;
    stroke-dasharray: 21 7;
  }

  .avatar-frame__dragon-flow path:nth-child(3) {
    --dragon-flow-duration: 2.7s;
    --dragon-flow-delay: -1.45s;
    --dragon-sway-duration: 2.65s;
    --dragon-sway-delay: -1.8s;
    stroke-width: 0.88;
    stroke-dasharray: 18 8;
  }

  .avatar-frame__dragon-flow path:nth-child(4) {
    --dragon-flow-duration: 2.9s;
    --dragon-flow-delay: -2.1s;
    --dragon-sway-duration: 3.35s;
    --dragon-sway-delay: -2.4s;
    stroke-width: 0.78;
    stroke-dasharray: 16 8;
  }

  .avatar-frame__dragon-flow-group--mane path {
    stroke-width: 1.28;
    transform-box: fill-box;
    transform-origin: 0% 100%;
    animation:
      frame-dragon-fire-flow var(--dragon-flow-duration) linear var(--dragon-flow-delay) infinite,
      frame-dragon-mane-sway var(--dragon-sway-duration) ease-in-out var(--dragon-sway-delay) infinite alternate;
  }

  .avatar-frame__dragon-flow-group--left path {
    transform-box: fill-box;
    transform-origin: 100% 100%;
    animation:
      frame-dragon-fire-flow var(--dragon-flow-duration) linear var(--dragon-flow-delay) infinite reverse,
      frame-dragon-left-filament-sway var(--dragon-sway-duration) ease-in-out var(--dragon-sway-delay) infinite
        alternate;
  }

  .avatar-frame__dragon-flow-group--right path {
    transform-box: fill-box;
    transform-origin: 0% 100%;
    animation:
      frame-dragon-fire-flow var(--dragon-flow-duration) linear var(--dragon-flow-delay) infinite,
      frame-dragon-right-filament-sway var(--dragon-sway-duration) ease-in-out var(--dragon-sway-delay) infinite
        alternate;
  }

  .avatar-frame__dragon-flow-group--bottom path {
    transform-box: fill-box;
    transform-origin: 50% 0%;
    animation:
      frame-dragon-fire-flow var(--dragon-flow-duration) linear var(--dragon-flow-delay) infinite,
      frame-dragon-bottom-filament-sway var(--dragon-sway-duration) ease-in-out var(--dragon-sway-delay) infinite
        alternate;
  }

  .avatar-frame__dragon-layer--pearl {
    z-index: 6;
    filter: brightness(1.04) drop-shadow(0 0 3px rgba(251, 191, 36, 0.76));
    animation: frame-dragon-pearl-light 3.6s ease-in-out infinite;
  }

  // 同源龙头仅用于抬升层级，不做位移；精确像素叠加不会产生第二个龙头。
  .avatar-frame__dragon-layer--head {
    z-index: 10;
    clip-path: polygon(49% 0, 85% 0, 85% 16%, 81% 22%, 82% 33%, 78% 42%, 70% 47%, 59% 45%, 51% 39%, 47% 30%);
    filter: brightness(1.03) saturate(1.04) drop-shadow(0 1px 1px rgba(120, 53, 15, 0.3));
  }

  .avatar-frame__dragon-ornament {
    z-index: 7;
    opacity: 0.96;
    filter: brightness(1.04) drop-shadow(0 0 2px rgba(251, 191, 36, 0.52));
  }

  .avatar-frame__dragon-ornament--crown {
    clip-path: polygon(0 0, 100% 0, 100% 30%, 0 30%);
    animation: frame-dragon-crown-light 3.8s ease-in-out infinite;
  }

  .avatar-frame__dragon-ornament--seal {
    clip-path: polygon(0 72%, 100% 72%, 100% 100%, 0 100%);
  }

  .avatar-frame--dragon .avatar-frame__bezel {
    z-index: 3;
    border-width: 2px;
    border-color: rgba(255, 224, 130, 0.9);
    box-shadow:
      inset 0 0 0 1px rgba(255, 251, 235, 0.72),
      0 0 0 1px rgba(180, 83, 9, 0.28),
      0 0 5px rgba(245, 158, 11, 0.54);
  }

  .avatar-frame--dragon .avatar-frame__motion--back::before,
  .avatar-frame--dragon .avatar-frame__motion--back::after {
    border-radius: 50%;
    border: 1px solid transparent;
    filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.72));
  }

  .avatar-frame--dragon .avatar-frame__motion--back::before {
    inset: 1px 4px 5px 2px;
    border-top-color: rgba(255, 247, 194, 0.92);
    border-right-color: rgba(249, 115, 22, 0.72);
    transform: rotate(-16deg);
    animation: frame-dragon-orbit-shimmer 4.8s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--back::after {
    inset: 6px 1px 2px 5px;
    border-bottom-color: rgba(253, 230, 138, 0.76);
    border-left-color: rgba(245, 158, 11, 0.66);
    transform: rotate(22deg);
    animation: frame-dragon-orbit-shimmer 4.8s -2.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--front {
    z-index: 8;
  }

  .avatar-frame--dragon .avatar-frame__motion--front::before {
    top: 11px;
    right: 5px;
    width: 27px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(
      ellipse at 40% 54%,
      rgba(255, 247, 194, 0.58),
      rgba(249, 115, 22, 0.18) 44%,
      transparent 72%
    );
    transform-origin: 50% 58%;
    animation: frame-dragon-head-aura 3.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--front::after {
    right: 8px;
    bottom: 9px;
    width: 6px;
    height: 6px;
    background: #fff7c2;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 4px #fbbf24);
    animation: frame-dragon-pearl-glint 3.6s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--front i {
    width: 4px;
    height: 4px;
    border-radius: 0;
    background: linear-gradient(135deg, #fffde7, #fcd34d 54%, #ea580c);
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    box-shadow: none;
    animation: frame-dragon-star-drift 4.8s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--front i:nth-child(1) {
    top: 6px;
    left: 19px;
  }

  .avatar-frame--dragon .avatar-frame__motion--front i:nth-child(2) {
    top: 17px;
    right: 3px;
    animation-delay: -1.2s;
  }

  .avatar-frame--dragon .avatar-frame__motion--front i:nth-child(3) {
    left: 4px;
    bottom: 23px;
    animation-delay: -2.4s;
  }

  .avatar-frame--dragon .avatar-frame__motion--front i:nth-child(4) {
    right: 19px;
    bottom: 3px;
    animation-delay: -3.6s;
  }

  .avatar-frame--dynamic.avatar-frame--celestial .avatar-frame__art {
    animation: frame-celestial-unfold 5s ease-in-out infinite;
  }

  .avatar-frame__celestial-wing {
    z-index: 3;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__celestial-wing--left {
    clip-path: polygon(0 28%, 50% 28%, 50% 100%, 0 100%);
    transform-origin: 35% 78%;
    animation: frame-celestial-art-wing-left 3.4s linear infinite alternate;
  }

  .avatar-frame__celestial-wing--right {
    clip-path: polygon(50% 28%, 100% 28%, 100% 100%, 50% 100%);
    transform-origin: 65% 78%;
    animation: frame-celestial-art-wing-right 3.4s linear infinite alternate;
  }

  .avatar-frame--celestial .avatar-frame__motion--back::before {
    top: 8px;
    left: -1px;
    width: 78px;
    height: 58px;
    border: 1px solid rgba(253, 230, 138, 0.72);
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(129, 140, 248, 0.58);
    transform: rotate(18deg);
    animation: frame-celestial-orbit 7.4s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--front::before {
    top: 3px;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: #eef2ff;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 5px #818cf8);
    animation: frame-celestial-core 2.8s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--front::after {
    bottom: 2px;
    left: 50%;
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
    background: #ddd6fe;
    transform: rotate(45deg);
    box-shadow: 0 0 6px #60a5fa;
    animation: frame-celestial-core 2.8s -1.4s ease-in-out infinite;
  }

  /* 成就传说：三款标准传说各自强化成就象征，岁序长明与天穹同属全局天花板。 */
  .avatar-frame--dynamic.avatar-frame--bookmark-archive .avatar-frame__art {
    animation: frame-library-metal-light 5.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__ambient {
    opacity: 0.18;
    filter: none;
    animation: none;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(2) {
    bottom: 4px;
    width: 19px;
    height: 7px;
    border-radius: 2px;
    background: linear-gradient(90deg, #fef3c7, #c4b5fd);
    animation: frame-page-flutter 4.6s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(1) {
    left: 5px;
    transform-origin: right center;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(2) {
    right: 5px;
    transform-origin: left center;
    animation-delay: -2.3s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front::before {
    bottom: 2px;
    left: 50%;
    width: 35px;
    height: 13px;
    margin-left: -17.5px;
    background: linear-gradient(90deg, #fef3c7, #c4b5fd 50%, #fef3c7);
    clip-path: polygon(0 16%, 48% 36%, 50% 100%, 52% 36%, 100% 16%, 91% 84%, 55% 100%, 45% 100%, 9% 84%);
    transform-origin: 50% 100%;
    animation: frame-library-open-book 4.6s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back::before {
    right: 4px;
    bottom: 6px;
    left: 4px;
    height: 14px;
    border-bottom: 2px solid rgba(254, 243, 199, 0.92);
    border-radius: 50%;
    background: linear-gradient(90deg, transparent, rgba(196, 181, 253, 0.48), transparent);
    animation: frame-library-shelf-light 4.8s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__art-detail {
    clip-path: polygon(0 46%, 100% 46%, 100% 100%, 0 100%);
    transform-origin: 50% 86%;
    animation: frame-library-page-material 4.6s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--note-constellation .avatar-frame__art {
    animation: frame-constellation-ink 5.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--back::before {
    inset: 5px;
    border: 2px dashed rgba(167, 243, 208, 0.86);
    border-radius: 50%;
    filter: drop-shadow(0 0 5px #2dd4bf);
    animation: frame-constellation-draw 5.8s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--back::after {
    right: 7px;
    bottom: 7px;
    width: 48px;
    height: 34px;
    border-right: 2px solid rgba(94, 234, 212, 0.88);
    border-bottom: 2px solid rgba(165, 243, 252, 0.72);
    border-radius: 50%;
    filter: drop-shadow(0 0 5px rgba(45, 212, 191, 0.76));
    animation: frame-constellation-ink-arc 4.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front::before {
    top: 7px;
    left: 9px;
    width: 8px;
    height: 8px;
    background: #ecfeff;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 5px #2dd4bf);
    animation: frame-constellation-pen 4.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__art-detail {
    clip-path: polygon(0 17%, 33% 0, 100% 58%, 72% 100%, 38% 72%);
    animation: frame-constellation-material 5.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i {
    width: 4px;
    height: 4px;
    animation: frame-local-twinkle 2.8s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(1) {
    top: 9px;
    right: 13px;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(2) {
    left: 8px;
    bottom: 18px;
    animation-delay: 0.9s;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(3) {
    right: 10px;
    bottom: 11px;
    animation-delay: 1.8s;
  }

  .avatar-frame--dynamic.avatar-frame--file-constellation .avatar-frame__art {
    animation: frame-archive-metal-light 5.6s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__ambient {
    opacity: 0.14;
    filter: none;
    animation: none;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front::before {
    top: 0;
    left: 50%;
    width: 34px;
    height: 27px;
    margin-left: -17px;
    background: linear-gradient(
      90deg,
      rgba(96, 165, 250, 0.26),
      rgba(219, 234, 254, 0.96) 32%,
      rgba(254, 240, 138, 0.98) 50%,
      rgba(147, 197, 253, 0.92) 68%,
      rgba(79, 70, 229, 0.24)
    );
    clip-path: polygon(0 14%, 42% 0, 50% 74%, 58% 0, 100% 14%, 76% 100%, 50% 74%, 24% 100%);
    transform-origin: center;
    animation: frame-archive-gate 5.6s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front::after {
    top: 17px;
    left: 50%;
    width: 7px;
    height: 7px;
    margin-left: -3.5px;
    background: #fef9c3;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    animation: frame-archive-star-rise 5.6s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--back::after {
    right: 2px;
    bottom: 5px;
    width: 38px;
    height: 10px;
    border-top: 2px solid rgba(239, 246, 255, 0.82);
    border-radius: 50%;
    animation: frame-cloud-breathe 5.6s -1.4s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--back::before {
    inset: 6px;
    border: 1.5px solid transparent;
    border-top-color: rgba(191, 219, 254, 0.86);
    border-right-color: rgba(253, 230, 138, 0.82);
    border-radius: 50%;
    animation: frame-archive-portal-arc 5.6s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i {
    width: 4px;
    height: 4px;
    border-radius: 0;
    background: #dbeafe;
    box-shadow: none;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    animation: frame-archive-star-path 4.8s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(1) {
    top: 19px;
    left: 5px;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(2) {
    top: 12px;
    right: 7px;
    animation-delay: -1.2s;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(3) {
    right: 9px;
    bottom: 12px;
    animation-delay: -2.4s;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(4) {
    left: 8px;
    bottom: 17px;
    animation-delay: -3.6s;
  }

  .avatar-frame--file-constellation .avatar-frame__art-detail {
    clip-path: polygon(18% 0, 82% 0, 75% 31%, 100% 42%, 100% 100%, 0 100%, 0 42%, 25% 31%);
    transform-origin: 50% 18%;
    animation: frame-archive-gate-material 5.6s ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__art {
    animation: frame-eternal-time-light 6.8s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--back::before,
  .avatar-frame--streak-eternal .avatar-frame__motion--back::after {
    inset: 1px;
    border-radius: 50%;
    border: 1px solid transparent;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--back::before {
    border-top-color: rgba(254, 240, 138, 0.9);
    border-right-color: rgba(196, 181, 253, 0.68);
    animation: frame-eternal-epoch-orbit 11s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--back::after {
    inset: 5px;
    border-bottom-color: rgba(125, 211, 252, 0.78);
    border-left-color: rgba(251, 191, 36, 0.72);
    animation: frame-eternal-epoch-orbit-reverse 8.6s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front::before {
    top: 8px;
    left: 50%;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: radial-gradient(circle, #fffceb 0 16%, #fde68a 34%, rgba(245, 158, 11, 0.34) 68%, transparent 72%);
    filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.84));
    animation: frame-eternal-sun-halo 4s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front::after {
    bottom: 3px;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: linear-gradient(135deg, #fff7c2, #f59e0b 48%, #fef3c7);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.8));
    animation: frame-eternal-gem-glint 3.8s -1.9s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i {
    box-shadow: none;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(1) {
    top: 35px;
    left: 2px;
    width: 4px;
    height: 6px;
    border-radius: 72% 16% 68% 34%;
    background: #f9a8d4;
    animation: frame-eternal-petal-drift 5.2s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(2) {
    top: 49px;
    left: 7px;
    width: 3px;
    height: 5px;
    border-radius: 70% 18% 72% 30%;
    background: #fecdd3;
    animation: frame-eternal-petal-drift 5.2s -2.6s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(3) {
    top: 39px;
    right: 2px;
    width: 4px;
    height: 7px;
    border-radius: 80% 12% 80% 24%;
    background: linear-gradient(160deg, #fef3c7, #a3a84a 72%);
    transform-origin: 50% 100%;
    animation: frame-eternal-pine-sway 4.6s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(4) {
    left: 23px;
    bottom: 12px;
    width: 5px;
    height: 5px;
    border-radius: 0;
    background: #fff7c2;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    animation: frame-eternal-rabbit-glint 3.6s ease-in-out infinite;
  }

  .avatar-frame__eternal-object {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__eternal-object--sun {
    clip-path: polygon(39% 4%, 61% 4%, 63% 28%, 37% 28%);
    transform-origin: 50% 16%;
    animation: frame-eternal-sun-contract 4s ease-in-out infinite;
  }

  .avatar-frame__eternal-rabbit-runner {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    transform: translate(-50%, -50%) translate(-4px, 3px);
    // 4.8s = 6 个完整的 0.8s 起跳周期；半程正好 3 跳，每跳约前进 15px，让腿部节奏与位移匹配。
    animation: frame-eternal-rabbit-bridge 4.8s linear infinite;
  }

  .avatar-frame__eternal-rabbit-direction {
    inset: 0;
    display: block;
    transform: scaleX(1);
    transform-origin: 30% 80%;
    animation: frame-eternal-rabbit-direction 4.8s linear infinite;
  }

  .avatar-frame__eternal-rabbit-sprite {
    top: 80%;
    left: 30%;
    display: block;
    width: 34px;
    height: 34px;
    background-repeat: no-repeat;
    background-position: 0 6.63%;
    background-size: 400% 400%;
    transform: translate(-50%, -50%);
    transform-origin: 50% 72%;
    user-select: none;
    backface-visibility: hidden;
    will-change: transform, background-position;
    // 任意时刻只显示一个完整姿态，避免两只兔子透明叠加形成晕影；20fps 姿态配合连续位移维持流畅度。
    animation:
      frame-eternal-rabbit-sprite 0.8s step-end infinite,
      frame-eternal-rabbit-body-arc 0.8s ease-in-out infinite;
  }

  @keyframes frame-ambient-breathe {
    0%,
    100% {
      opacity: 0.42;
      filter: blur(3.5px);
      transform: translate(-50%, -50%);
    }
    50% {
      opacity: 0.78;
      filter: blur(5px);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-gold-breathe {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(0.98);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 6px var(--frame-glow)) brightness(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-gold-glint {
    0%,
    100% {
      opacity: 0.15;
      transform: translate(-7px, 5px) rotate(-34deg) scaleX(0.5);
    }
    45% {
      opacity: 1;
      transform: translate(25px, -9px) rotate(-34deg) scaleX(1.15);
    }
    70% {
      opacity: 0.25;
      transform: translate(36px, -14px) rotate(-34deg) scaleX(0.65);
    }
  }

  @keyframes frame-sakura-bloom {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.18)) drop-shadow(0 0 3px var(--frame-glow)) saturate(0.96);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.18)) drop-shadow(0 0 6px var(--frame-glow)) saturate(1.12)
        brightness(1.04);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-petal-drift {
    0%,
    100% {
      opacity: 0.2;
      transform: translate(0, -2px) rotate(-20deg);
    }
    35% {
      opacity: 0.95;
    }
    70% {
      opacity: 0.55;
      transform: translate(14px, 18px) rotate(115deg);
    }
  }

  @keyframes frame-sunset-sky {
    0%,
    100% {
      filter: drop-shadow(0 0 3px var(--frame-glow)) saturate(0.94) brightness(0.98);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 0 7px var(--frame-glow)) saturate(1.12) brightness(1.06);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-sunset-sun {
    0%,
    100% {
      opacity: 0.58;
      transform: scale(0.86);
    }
    50% {
      opacity: 1;
      transform: scale(1.18);
    }
  }

  @keyframes frame-cloud-breathe {
    0%,
    100% {
      opacity: 0.34;
      transform: translateX(-2px) scaleX(0.86);
    }
    50% {
      opacity: 0.9;
      transform: translateX(3px) scaleX(1.08);
    }
  }

  @keyframes frame-moonlight-breathe {
    0%,
    100% {
      filter: drop-shadow(0 0 3px var(--frame-glow)) brightness(0.94);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 0 7px var(--frame-glow)) brightness(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-moon-phase-travel {
    0%,
    100% {
      opacity: 0.3;
      transform: rotate(-58deg) translateY(1px) scale(0.7);
    }
    50% {
      opacity: 1;
      transform: rotate(58deg) translateY(-1px) scale(1.2);
    }
  }

  @keyframes frame-local-pulse {
    0%,
    100% {
      opacity: 0.32;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1.16);
    }
  }

  @keyframes frame-moon-star-twinkle {
    0%,
    100% {
      opacity: 0.24;
      filter: brightness(0.94);
      transform: translateY(1px) scale(0.72) rotate(0deg);
    }
    50% {
      opacity: 0.92;
      filter: brightness(1.3);
      transform: translateY(-1px) scale(1.12) rotate(45deg);
    }
  }

  @keyframes frame-note-water-flow {
    0%,
    100% {
      opacity: 0.16;
      filter: brightness(1.02) saturate(1.02);
      transform: translate(-50%, -50%);
    }
    46% {
      opacity: 0.82;
      filter: brightness(1.42) saturate(1.24) hue-rotate(-5deg);
      transform: translate(-50%, -50%);
    }
    72% {
      opacity: 0.42;
      filter: brightness(1.16) saturate(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-ink-current {
    0%,
    100% {
      opacity: 0.32;
      transform: translateX(-4px) scaleX(0.82);
    }
    50% {
      opacity: 1;
      transform: translateX(4px) scaleX(1.1);
    }
  }

  @keyframes frame-note-river-glint {
    0%,
    100% {
      opacity: 0.18;
      transform: translateX(-5px) scaleX(0.64) skewX(-8deg);
    }
    48% {
      opacity: 0.84;
      transform: translateX(5px) scaleX(1.04) skewX(6deg);
    }
    72% {
      opacity: 0.42;
      transform: translateX(2px) scaleX(0.82) skewX(-2deg);
    }
  }

  @keyframes frame-river-spark {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.6);
    }
    35% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(35px, -7px) scale(1.1);
    }
  }

  @keyframes frame-vault-metal-light {
    0%,
    100% {
      filter: brightness(0.98) saturate(1.04) hue-rotate(5deg);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: brightness(1.08) saturate(1.2) hue-rotate(16deg);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-vault-cloud-gate {
    0%,
    100% {
      opacity: 0.22;
      filter: brightness(1.04) saturate(1.08) hue-rotate(5deg) drop-shadow(0 0 1px rgba(96, 165, 250, 0.35));
      transform: translate(-50%, -50%);
    }
    42% {
      opacity: 0.94;
      filter: brightness(1.52) saturate(1.42) hue-rotate(16deg) drop-shadow(0 0 5px rgba(96, 165, 250, 0.9));
      transform: translate(-50%, -50%);
    }
    72% {
      opacity: 0.5;
      filter: brightness(1.22) saturate(1.22) hue-rotate(10deg) drop-shadow(0 0 2px rgba(96, 165, 250, 0.55));
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-vault-energy-curtain {
    0%,
    100% {
      opacity: 0.2;
      filter: brightness(0.94) saturate(0.92);
      transform: scaleY(0.72);
    }
    42% {
      opacity: 0.9;
      filter: brightness(1.28) saturate(1.18);
      transform: scaleY(1);
    }
    72% {
      opacity: 0.5;
      filter: brightness(1.08) saturate(1.06);
      transform: scaleY(0.86);
    }
  }

  @keyframes frame-vault-door-shine {
    0%,
    100% {
      opacity: 0.34;
      transform: rotate(-18deg) scale(0.76);
    }
    42% {
      opacity: 1;
      transform: rotate(0deg) scale(1.28);
    }
    72% {
      opacity: 0.56;
      transform: rotate(18deg) scale(0.88);
    }
  }

  @keyframes frame-vault-cloud-rise {
    0%,
    100% {
      opacity: 0.24;
      transform: translateY(3px) scaleX(0.66);
    }
    42% {
      opacity: 1;
      transform: translateY(-4px) scaleX(1.16);
    }
    72% {
      opacity: 0.42;
      transform: translateY(-1px) scaleX(0.9);
    }
  }

  @keyframes frame-vault-cloud-drift {
    0%,
    100% {
      opacity: 0.34;
      transform: translateX(-4px) scaleX(0.76);
    }
    50% {
      opacity: 1;
      transform: translateX(4px) scaleX(1.14);
    }
  }

  @keyframes frame-vault-data-rise {
    0% {
      opacity: 0;
      transform: translateY(4px) rotate(0deg) scale(0.62);
    }
    18% {
      opacity: 0.94;
    }
    55% {
      opacity: 1;
      transform: translateY(-8px) rotate(45deg) scale(1.12);
    }
    100% {
      opacity: 0;
      transform: translateY(-15px) rotate(90deg) scale(0.72);
    }
  }

  @keyframes frame-archive-gate {
    0%,
    100% {
      opacity: 0.28;
      transform: translateY(2px) scaleX(0.58) scaleY(0.88);
    }
    44% {
      opacity: 0.94;
      transform: translateY(-2px) scaleX(1.06) scaleY(1.04);
    }
    72% {
      opacity: 0.52;
      transform: translateY(-1px) scaleX(0.84) scaleY(0.96);
    }
  }

  @keyframes frame-ocean-metal-light {
    0%,
    100% {
      transform: translate(-50%, -50%);
      filter: brightness(0.98) saturate(1.02);
    }
    48% {
      transform: translate(-50%, -50%);
      filter: brightness(1.07) saturate(1.08);
    }
  }

  @keyframes frame-ocean-water-flow {
    0% {
      opacity: 0.12;
      filter: brightness(1.04) saturate(1.02);
      clip-path: polygon(0 67%, 42% 56%, 58% 69%, 48% 100%, 0 100%);
      transform: translate(-50%, -50%);
    }
    16% {
      opacity: 0.58;
      filter: brightness(1.2) saturate(1.1);
      clip-path: polygon(0 55%, 48% 43%, 60% 58%, 47% 85%, 0 86%);
      transform: translate(-50%, -50%);
    }
    38% {
      opacity: 0.84;
      filter: brightness(1.34) saturate(1.18);
      clip-path: polygon(0 32%, 52% 22%, 61% 39%, 45% 67%, 0 66%);
      transform: translate(-50%, -50%);
    }
    61% {
      opacity: 0.94;
      filter: brightness(1.42) saturate(1.2);
      clip-path: polygon(0 0, 50% 0, 59% 17%, 43% 46%, 0 44%);
      transform: translate(-50%, -50%);
    }
    78% {
      opacity: 0.18;
      filter: brightness(1.12) saturate(1.06);
      clip-path: polygon(0 0, 46% 0, 54% 10%, 39% 32%, 0 29%);
      transform: translate(-50%, -50%);
    }
    100% {
      opacity: 0.12;
      filter: brightness(1.04) saturate(1.02);
      clip-path: polygon(0 67%, 42% 56%, 58% 69%, 48% 100%, 0 100%);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-ocean-undertow {
    0%,
    100% {
      opacity: 0.24;
      transform: translate(-1px, 1px) skewY(-3deg) scaleX(0.92) scaleY(0.96);
    }
    26% {
      opacity: 0.54;
      transform: translate(0, 0) skewY(1deg) scaleX(0.98) scaleY(1.01);
    }
    54% {
      opacity: 0.76;
      transform: translate(1px, 2px) skewY(4deg) scaleX(1.04) scaleY(1.05);
    }
    78% {
      opacity: 0.4;
      transform: translate(0, 1px) skewY(0deg) scaleX(0.96) scaleY(0.99);
    }
  }

  @keyframes frame-ocean-return {
    0%,
    100% {
      opacity: 0.2;
      transform: translate(-2px, 1px) skewX(-5deg) scaleX(0.88) scaleY(0.92);
    }
    34% {
      opacity: 0.62;
      transform: translate(0, 0) skewX(2deg) scaleX(0.98) scaleY(1.01);
    }
    62% {
      opacity: 0.86;
      transform: translate(3px, -2px) skewX(5deg) scaleX(1.05) scaleY(1.06);
    }
    82% {
      opacity: 0.4;
      transform: translate(1px, 0) skewX(1deg) scaleX(0.95) scaleY(0.98);
    }
  }

  @keyframes frame-ocean-current {
    0%,
    100% {
      opacity: 0.32;
      transform: translate(-1px, 2px) rotate(-5deg) skewY(-3deg) scaleX(0.9) scaleY(0.94);
    }
    24% {
      opacity: 0.68;
      transform: translate(0, 0) rotate(-2deg) skewY(1deg) scaleX(0.97) scaleY(1);
    }
    49% {
      opacity: 0.94;
      transform: translate(2px, -3px) rotate(3deg) skewY(5deg) scaleX(1.06) scaleY(1.07);
    }
    72% {
      opacity: 0.58;
      transform: translate(1px, -1px) rotate(0deg) skewY(1deg) scaleX(0.97) scaleY(1.01);
    }
  }

  @keyframes frame-foam-rise {
    0%,
    100% {
      opacity: 0.16;
      transform: translate(-1px, 2px) rotate(-6deg) scale(0.84);
    }
    34% {
      opacity: 0.64;
      transform: translate(0, 0) rotate(-2deg) scale(0.96);
    }
    56% {
      opacity: 0.94;
      transform: translate(2px, -3px) rotate(3deg) scale(1.06);
    }
    78% {
      opacity: 0.3;
      transform: translate(4px, -5px) rotate(5deg) scale(0.9);
    }
  }

  @keyframes frame-ocean-crest-run {
    0%,
    100% {
      opacity: 0.14;
      transform: translate(-1px, 1px) rotate(var(--ocean-crest-angle)) skewX(-6deg) scaleX(0.82) scaleY(0.84);
    }
    28% {
      opacity: 0.68;
      transform: translate(0, 0) rotate(var(--ocean-crest-angle)) skewX(1deg) scaleX(0.96) scaleY(0.98);
    }
    52% {
      opacity: 0.96;
      transform: translate(2px, -2px) rotate(var(--ocean-crest-angle)) skewX(5deg) scaleX(1.06) scaleY(1.04);
    }
    76% {
      opacity: 0.38;
      transform: translate(4px, -4px) rotate(var(--ocean-crest-angle)) skewX(1deg) scaleX(0.92) scaleY(0.94);
    }
  }

  @keyframes frame-water-drop {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.5);
    }
    32% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translate(16px, -19px) scale(1.15);
    }
  }

  @keyframes frame-aurora-metal-light {
    0%,
    100% {
      filter: hue-rotate(-8deg) brightness(0.98) saturate(1.04);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: hue-rotate(12deg) brightness(1.08) saturate(1.12);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-aurora-ribbon-flow {
    0%,
    100% {
      opacity: 0.16;
      filter: brightness(1.04) saturate(1.08) hue-rotate(-12deg);
      transform: translate(-50%, -50%);
    }
    32% {
      opacity: 0.3;
      filter: brightness(1.12) saturate(1.16) hue-rotate(4deg);
      transform: translate(-50%, -50%);
    }
    56% {
      opacity: 0.48;
      filter: brightness(1.22) saturate(1.24) hue-rotate(16deg);
      transform: translate(-50%, -50%);
    }
    78% {
      opacity: 0.24;
      filter: brightness(1.1) saturate(1.12) hue-rotate(3deg);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-aurora-veil-left {
    0%,
    100% {
      opacity: 0.26;
      transform: translate(-1px, 1px) skewY(-4deg) scaleX(0.86) scaleY(0.94);
    }
    30% {
      opacity: 0.66;
      transform: translate(0, 0) skewY(1deg) scaleX(0.98) scaleY(1.01);
    }
    56% {
      opacity: 0.9;
      transform: translate(2px, -2px) skewY(5deg) scaleX(1.06) scaleY(1.06);
    }
    80% {
      opacity: 0.46;
      transform: translate(1px, 0) skewY(0deg) scaleX(0.94) scaleY(0.98);
    }
  }

  @keyframes frame-aurora-veil-right {
    0%,
    100% {
      opacity: 0.24;
      transform: translate(1px, 1px) skewY(4deg) scaleX(0.86) scaleY(0.94);
    }
    28% {
      opacity: 0.62;
      transform: translate(0, 0) skewY(-1deg) scaleX(0.97) scaleY(1.01);
    }
    58% {
      opacity: 0.92;
      transform: translate(-2px, -3px) skewY(-5deg) scaleX(1.06) scaleY(1.07);
    }
    82% {
      opacity: 0.44;
      transform: translate(-1px, 0) skewY(0deg) scaleX(0.94) scaleY(0.98);
    }
  }

  @keyframes frame-aurora-depth-veil {
    0%,
    100% {
      opacity: 0.16;
      transform: translateX(var(--aurora-rest-x)) translateY(1px) rotate(var(--aurora-tilt)) skewY(-3deg) scaleX(0.82)
        scaleY(0.9);
    }
    34% {
      opacity: 0.64;
      transform: translateX(0) translateY(0) rotate(var(--aurora-tilt)) skewY(1deg) scaleX(0.96) scaleY(1.01);
    }
    58% {
      opacity: 0.82;
      transform: translateX(var(--aurora-peak-x)) translateY(-2px) rotate(var(--aurora-tilt)) skewY(4deg) scaleX(1.04)
        scaleY(1.06);
    }
    82% {
      opacity: 0.34;
      transform: translateX(0) translateY(0) rotate(var(--aurora-tilt)) skewY(0deg) scaleX(0.9) scaleY(0.97);
    }
  }

  @keyframes frame-aurora-curtain-unfold {
    0%,
    100% {
      opacity: 0.24;
      transform: translateY(-1px) scaleX(0.84) scaleY(0.72);
    }
    24% {
      opacity: 0.58;
      transform: translateY(0) scaleX(0.96) scaleY(0.9);
    }
    48% {
      opacity: 0.92;
      transform: translateY(1px) scaleX(1.08) scaleY(1.08);
    }
    68% {
      opacity: 0.7;
      transform: translateY(0) scaleX(1) scaleY(0.96);
    }
    84% {
      opacity: 0.4;
      transform: translateY(-1px) scaleX(0.9) scaleY(0.8);
    }
  }

  @keyframes frame-aurora-core-charge {
    0%,
    100% {
      opacity: 0.48;
      transform: rotate(0deg) scale(0.82);
    }
    30% {
      opacity: 0.68;
      transform: rotate(12deg) scale(0.94);
    }
    48% {
      opacity: 0.9;
      transform: rotate(30deg) scale(1.08);
    }
    64% {
      opacity: 0.72;
      transform: rotate(44deg) scale(0.98);
    }
    82% {
      opacity: 0.56;
      transform: rotate(22deg) scale(0.88);
    }
  }

  @keyframes frame-aurora-starfall {
    0%,
    100% {
      opacity: 0.14;
      transform: translate(-2px, -3px) rotate(0deg) scale(0.58);
    }
    38% {
      opacity: 0.82;
      transform: translate(1px, 1px) rotate(45deg) scale(0.94);
    }
    56% {
      opacity: 1;
      transform: translate(4px, 7px) rotate(90deg) scale(1.28);
    }
    78% {
      opacity: 0.38;
      transform: translate(6px, 11px) rotate(135deg) scale(0.72);
    }
  }

  @keyframes frame-flame-metal-light {
    0%,
    100% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 2px var(--frame-glow)) brightness(0.98);
    }
    38% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 4px var(--frame-glow)) brightness(1.1);
    }
    68% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 3px var(--frame-glow)) brightness(1.04);
    }
  }

  @keyframes frame-ember-rise {
    0% {
      opacity: 0;
      transform: translate(0, 4px) rotate(0deg) scale(0.6);
    }
    32% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-8px, -27px) rotate(140deg) scale(1.1);
    }
  }

  @keyframes frame-ember-rise-left {
    0% {
      opacity: 0;
      transform: translate(0, 4px) rotate(0deg) scale(0.55);
    }
    28% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(10px, -31px) rotate(-125deg) scale(1.08);
    }
  }

  @keyframes frame-flame-tongue {
    0%,
    100% {
      opacity: 0.44;
      filter: drop-shadow(0 0 2px #fb923c) drop-shadow(0 0 4px rgba(220, 38, 38, 0.52));
      transform: rotate(34deg) skewY(-4deg) translateY(1px);
    }
    38% {
      opacity: 0.86;
      filter: drop-shadow(0 0 3px #fde68a) drop-shadow(0 0 5px rgba(239, 68, 68, 0.68));
      transform: rotate(42deg) skewY(5deg) translate(-0.5px, -2px);
    }
    72% {
      opacity: 0.62;
      transform: rotate(38deg) skewY(-2deg) translate(0.5px, -1px);
    }
  }

  @keyframes frame-flame-hot-edge {
    0%,
    100% {
      opacity: 0.5;
      filter: drop-shadow(0 0 3px #fb923c) drop-shadow(0 0 6px rgba(220, 38, 38, 0.6));
      transform: rotate(-8deg);
    }
    44% {
      opacity: 1;
      filter: drop-shadow(0 0 6px #fde68a) drop-shadow(0 0 11px rgba(239, 68, 68, 0.88));
      transform: rotate(9deg);
    }
    72% {
      opacity: 0.76;
      transform: rotate(3deg);
    }
  }

  @keyframes frame-flame-material {
    0%,
    100% {
      opacity: 0.14;
      filter: brightness(1.04) saturate(1.04);
      transform: translate(-50%, -50%);
    }
    34% {
      opacity: 0.42;
      filter: brightness(1.18) saturate(1.14) drop-shadow(0 0 2px rgba(254, 215, 91, 0.64));
      transform: translate(-50%, -50%);
    }
    68% {
      opacity: 0.22;
      filter: brightness(1.1) saturate(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-flame-side-burn {
    0%,
    100% {
      opacity: 0.34;
      transform: rotate(var(--flame-side-angle)) translateY(1px) skewY(-4deg) scaleX(0.9) scaleY(0.88);
    }
    38% {
      opacity: 0.92;
      transform: rotate(var(--flame-side-angle)) translateY(-2px) skewY(7deg) scaleX(1.04) scaleY(1.08);
    }
    68% {
      opacity: 0.62;
      transform: rotate(var(--flame-side-angle)) translateY(-1px) skewY(-2deg) scaleX(0.97) scaleY(1.01);
    }
  }

  @keyframes frame-neon-pulse {
    0%,
    100% {
      filter: drop-shadow(0 0 4px var(--frame-glow)) brightness(0.92);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 0 9px var(--frame-glow)) brightness(1.14);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-neon-chase {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-neon-node-sweep {
    0% {
      opacity: 0.48;
      transform: rotate(-44deg) scale(0.78);
    }
    48% {
      opacity: 1;
      transform: rotate(138deg) scale(1.22);
    }
    72% {
      opacity: 0.7;
      transform: rotate(235deg) scale(0.9);
    }
    100% {
      opacity: 0.48;
      transform: rotate(316deg) scale(0.78);
    }
  }

  @keyframes frame-neon-circuit-flow {
    0%,
    100% {
      opacity: 0.12;
      transform: rotate(var(--neon-circuit-angle)) scaleX(0.42);
    }
    24% {
      opacity: 0.42;
      transform: rotate(var(--neon-circuit-angle)) scaleX(0.76);
    }
    44% {
      opacity: 1;
      transform: rotate(var(--neon-circuit-angle)) scaleX(1.18);
    }
    64% {
      opacity: 0.34;
      transform: rotate(var(--neon-circuit-angle)) scaleX(0.64);
    }
  }

  @keyframes frame-neon-arc {
    0%,
    100% {
      opacity: 0.28;
      transform: translate(-2px, 1px) skewX(-24deg) scaleX(0.64);
    }
    42% {
      opacity: 1;
      transform: translate(8px, -4px) skewX(18deg) scaleX(1.22);
    }
    66% {
      opacity: 0.72;
      transform: translate(3px, 2px) skewX(-8deg) scaleX(0.92);
    }
  }

  @keyframes frame-neon-spark {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.45);
    }
    32% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-13px, 10px) scale(1.2);
    }
  }

  @keyframes frame-neon-crystal-charge {
    0%,
    100% {
      opacity: 0.08;
      filter: brightness(1.04) saturate(1.04) hue-rotate(-8deg);
      transform: translate(-50%, -50%);
    }
    42% {
      opacity: 0.72;
      filter: brightness(1.42) saturate(1.28) hue-rotate(16deg) drop-shadow(0 0 5px rgba(103, 232, 249, 0.9));
      transform: translate(-50%, -50%);
    }
    70% {
      opacity: 0.3;
      filter: brightness(1.16) saturate(1.12) hue-rotate(4deg);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-galaxy-breathe {
    0%,
    100% {
      filter: drop-shadow(0 0 5px var(--frame-glow)) brightness(0.96);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 0 10px var(--frame-glow)) brightness(1.1);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-galaxy-orbit {
    to {
      transform: rotate(384deg);
    }
  }

  @keyframes frame-galaxy-orbit-reverse {
    to {
      transform: rotate(-302deg);
    }
  }

  @keyframes frame-galaxy-comet-sweep {
    0%,
    100% {
      opacity: 0.28;
      transform: rotate(-66deg) translateY(2px) scale(0.72);
    }
    46% {
      opacity: 1;
      transform: rotate(58deg) translateY(-2px) scale(1.32);
    }
    72% {
      opacity: 0.72;
      transform: rotate(116deg) scale(0.96);
    }
  }

  @keyframes frame-galaxy-planet-pulse {
    0%,
    100% {
      opacity: 0.48;
      transform: translate(-2px, 2px) scale(0.72);
    }
    50% {
      opacity: 1;
      transform: translate(2px, -2px) scale(1.28);
    }
  }

  @keyframes frame-galaxy-nebula-shimmer {
    0%,
    100% {
      opacity: 0.06;
      filter: brightness(1.02) saturate(1.02);
      transform: translate(-50%, -50%);
    }
    48% {
      opacity: 0.62;
      filter: brightness(1.38) saturate(1.2) drop-shadow(0 0 5px rgba(196, 181, 253, 0.86));
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-star-drift {
    0%,
    100% {
      opacity: 0.2;
      transform: scale(0.55) rotate(0deg);
    }
    48% {
      opacity: 1;
      transform: scale(1.25) rotate(120deg);
    }
  }

  @keyframes frame-dragon-metal-light {
    0%,
    100% {
      transform: translate(-50%, -50%);
      filter: brightness(0.98) saturate(1.02);
    }
    42% {
      transform: translate(-50%, -50%);
      filter: brightness(1.09) saturate(1.1);
    }
    72% {
      transform: translate(-50%, -50%);
      filter: brightness(1.03) saturate(1.05);
    }
  }

  @keyframes frame-dragon-trail-ember {
    0%,
    100% {
      opacity: 0.34;
      filter: brightness(0.98) saturate(1.08) drop-shadow(0 0 1px rgba(249, 115, 22, 0.48));
    }
    50% {
      opacity: 0.54;
      filter: brightness(1.12) saturate(1.18) drop-shadow(0 0 1.5px rgba(255, 153, 28, 0.68));
    }
  }

  @keyframes frame-dragon-trail-mane {
    0% {
      -webkit-mask-position: 132% 50%;
      mask-position: 132% 50%;
      opacity: 0.58;
    }
    36%,
    68% {
      opacity: 1;
    }
    100% {
      -webkit-mask-position: -42% 50%;
      mask-position: -42% 50%;
      opacity: 0.72;
    }
  }

  @keyframes frame-dragon-trail-left {
    0% {
      -webkit-mask-position: 50% -30%;
      mask-position: 50% -30%;
      opacity: 0.84;
    }
    34%,
    72% {
      opacity: 0.96;
    }
    100% {
      -webkit-mask-position: 50% 122%;
      mask-position: 50% 122%;
      opacity: 0.9;
    }
  }

  @keyframes frame-dragon-trail-right {
    0% {
      -webkit-mask-position: 50% 122%;
      mask-position: 50% 122%;
      opacity: 0.84;
    }
    32%,
    70% {
      opacity: 0.98;
    }
    100% {
      -webkit-mask-position: 50% -30%;
      mask-position: 50% -30%;
      opacity: 0.9;
    }
  }

  @keyframes frame-dragon-trail-bottom {
    0% {
      -webkit-mask-position: -32% 50%;
      mask-position: -32% 50%;
      opacity: 0.84;
    }
    34%,
    72% {
      opacity: 1;
    }
    100% {
      -webkit-mask-position: 120% 50%;
      mask-position: 120% 50%;
      opacity: 0.9;
    }
  }

  @keyframes frame-dragon-fire-flow {
    0% {
      stroke-dashoffset: 0;
      opacity: 0.5;
    }
    18% {
      opacity: 1;
    }
    76% {
      opacity: 0.92;
    }
    100% {
      stroke-dashoffset: -100;
      opacity: 0.54;
    }
  }

  @keyframes frame-dragon-mane-sway {
    0% {
      transform: rotate(-7deg) scaleY(0.9);
    }
    48% {
      transform: rotate(11deg) scaleY(1.16);
    }
    100% {
      transform: rotate(-2deg) scaleY(1.04);
    }
  }

  @keyframes frame-dragon-left-filament-sway {
    0% {
      transform: rotate(-4deg) scaleY(0.96);
    }
    52% {
      transform: rotate(5deg) scaleY(1.08);
    }
    100% {
      transform: rotate(-1.5deg) scaleY(1.01);
    }
  }

  @keyframes frame-dragon-right-filament-sway {
    0% {
      transform: rotate(4deg) scaleY(0.96);
    }
    52% {
      transform: rotate(-5deg) scaleY(1.08);
    }
    100% {
      transform: rotate(1.5deg) scaleY(1.01);
    }
  }

  @keyframes frame-dragon-bottom-filament-sway {
    0% {
      transform: translateY(0.8px) scaleY(0.9);
    }
    50% {
      transform: translateY(-1.8px) scaleY(1.13);
    }
    100% {
      transform: translateY(-0.2px) scaleY(1.01);
    }
  }

  @keyframes frame-dragon-cloud-light {
    0%,
    100% {
      opacity: 0.78;
      filter: brightness(0.98) saturate(1.02) drop-shadow(0 0 2px rgba(249, 115, 22, 0.34));
    }
    46% {
      opacity: 1;
      filter: brightness(1.16) saturate(1.12) drop-shadow(0 0 3px rgba(249, 115, 22, 0.58));
    }
    72% {
      opacity: 0.9;
      filter: brightness(1.07) saturate(1.06) drop-shadow(0 0 2px rgba(251, 191, 36, 0.42));
    }
  }

  @keyframes frame-dragon-pearl-light {
    0%,
    100% {
      opacity: 0.86;
      filter: brightness(1) drop-shadow(0 0 2px rgba(251, 191, 36, 0.66));
    }
    48% {
      opacity: 1;
      filter: brightness(1.18) drop-shadow(0 0 5px rgba(251, 191, 36, 0.86));
    }
    72% {
      opacity: 0.94;
      filter: brightness(1.08) drop-shadow(0 0 3px rgba(251, 191, 36, 0.72));
    }
  }

  @keyframes frame-dragon-crown-light {
    0%,
    100% {
      opacity: 0.82;
      filter: brightness(0.98) drop-shadow(0 0 1px rgba(251, 191, 36, 0.46));
      transform: translate(-50%, -50%);
    }
    50% {
      opacity: 1;
      filter: brightness(1.22) drop-shadow(0 0 4px rgba(254, 240, 138, 0.84));
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-dragon-orbit-shimmer {
    0%,
    100% {
      opacity: 0.44;
    }
    50% {
      opacity: 0.88;
    }
  }

  @keyframes frame-dragon-head-aura {
    0%,
    100% {
      opacity: 0.26;
      transform: scale(0.82) rotate(-5deg);
    }
    52% {
      opacity: 0.84;
      transform: scale(1.08) rotate(3deg);
    }
  }

  @keyframes frame-dragon-pearl-glint {
    0%,
    100% {
      opacity: 0.24;
      transform: rotate(0deg) scale(0.58);
    }
    48% {
      opacity: 1;
      transform: rotate(90deg) scale(1.24);
    }
  }

  @keyframes frame-dragon-star-drift {
    0%,
    100% {
      opacity: 0.16;
      transform: translate(0, 1px) rotate(0deg) scale(0.56);
    }
    44% {
      opacity: 1;
      transform: translate(1px, -2px) rotate(70deg) scale(1.16);
    }
    72% {
      opacity: 0.38;
      transform: translate(-1px, -1px) rotate(116deg) scale(0.76);
    }
  }

  @keyframes frame-celestial-unfold {
    0%,
    100% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 6px var(--frame-glow)) brightness(0.96);
    }
    50% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 13px var(--frame-glow)) brightness(1.12);
    }
  }

  @keyframes frame-celestial-orbit {
    to {
      transform: rotate(378deg);
    }
  }

  @keyframes frame-celestial-core {
    0%,
    100% {
      opacity: 0.52;
      transform: scale(0.72) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.3) rotate(45deg);
    }
  }

  @keyframes frame-celestial-art-wing-left {
    from {
      filter: brightness(0.98) saturate(1.02);
      transform: translate(-50%, -50%) rotate(1deg) translateX(1px);
    }
    to {
      filter: brightness(1.13) saturate(1.12) drop-shadow(-1px 1px 3px rgba(129, 140, 248, 0.68));
      transform: translate(-50%, -50%) rotate(-5deg) translate(-2px, -1px) scaleX(1.015);
    }
  }

  @keyframes frame-celestial-art-wing-right {
    from {
      filter: brightness(0.98) saturate(1.02);
      transform: translate(-50%, -50%) rotate(-1deg) translateX(-1px);
    }
    to {
      filter: brightness(1.13) saturate(1.12) drop-shadow(1px 1px 3px rgba(129, 140, 248, 0.68));
      transform: translate(-50%, -50%) rotate(5deg) translate(2px, -1px) scaleX(1.015);
    }
  }

  @keyframes frame-library-metal-light {
    0%,
    100% {
      filter: brightness(0.98) contrast(1.01);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: brightness(1.08) contrast(1.04);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-page-flutter {
    0%,
    100% {
      opacity: 0.5;
      transform: perspective(22px) rotateX(28deg) rotateZ(-3deg) scaleX(0.9);
    }
    46% {
      opacity: 1;
      transform: perspective(22px) rotateX(-18deg) rotateZ(2deg) translateY(-1px) scaleX(1.02);
    }
    72% {
      opacity: 0.74;
      transform: perspective(22px) rotateX(5deg) rotateZ(-1deg) scaleX(0.96);
    }
  }

  @keyframes frame-library-open-book {
    0%,
    100% {
      opacity: 0.46;
      transform: perspective(28px) rotateX(34deg) scaleX(0.88);
    }
    46% {
      opacity: 1;
      transform: perspective(28px) rotateX(-8deg) translateY(-1px) scaleX(1.03);
    }
    72% {
      opacity: 0.74;
      transform: perspective(28px) rotateX(10deg) scaleX(0.97);
    }
  }

  @keyframes frame-library-shelf-light {
    0%,
    100% {
      opacity: 0.3;
      transform: translateX(-3px) scaleX(0.82);
    }
    48% {
      opacity: 1;
      transform: translateX(3px) scaleX(1.04);
    }
  }

  @keyframes frame-library-page-material {
    0%,
    100% {
      opacity: 0.08;
      filter: brightness(1.04);
      transform: translate(-50%, -50%) perspective(38px) rotateX(2deg);
    }
    46% {
      opacity: 0.48;
      filter: brightness(1.26) contrast(1.03);
      transform: translate(-50%, -50%) perspective(38px) rotateX(-4deg);
    }
    72% {
      opacity: 0.24;
      filter: brightness(1.14);
      transform: translate(-50%, -50%) perspective(38px) rotateX(1deg);
    }
  }

  @keyframes frame-constellation-draw {
    0%,
    100% {
      opacity: 0.28;
      clip-path: polygon(0 0, 28% 0, 28% 34%, 0 34%);
    }
    42% {
      opacity: 0.94;
      clip-path: polygon(0 0, 100% 0, 100% 62%, 0 62%);
    }
    72% {
      opacity: 1;
      clip-path: inset(0);
    }
  }

  @keyframes frame-constellation-ink-arc {
    0%,
    100% {
      opacity: 0.22;
      transform: translate(-5px, 3px) rotate(-18deg) scale(0.7);
    }
    46% {
      opacity: 1;
      transform: translate(3px, -4px) rotate(8deg) scale(1.08);
    }
    72% {
      opacity: 0.66;
      transform: translate(1px, -1px) rotate(-3deg) scale(0.92);
    }
  }

  @keyframes frame-constellation-pen {
    0%,
    100% {
      opacity: 0.2;
      transform: translate(0, 0) rotate(0deg) scale(0.66);
    }
    44% {
      opacity: 1;
      transform: translate(43px, 35px) rotate(135deg) scale(1.28);
    }
    72% {
      opacity: 0.72;
      transform: translate(64px, 49px) rotate(210deg) scale(0.92);
    }
  }

  @keyframes frame-constellation-material {
    0%,
    100% {
      opacity: 0.1;
      filter: brightness(1.02) saturate(1.02);
      transform: translate(-50%, -50%) skewX(-1.2deg) translate(-1px, 1px);
    }
    48% {
      opacity: 0.72;
      filter: brightness(1.4) saturate(1.2) drop-shadow(0 0 5px rgba(94, 234, 212, 0.82));
      transform: translate(-50%, -50%) skewX(2deg) translate(2px, -2px);
    }
  }

  @keyframes frame-archive-gate-material {
    0%,
    100% {
      opacity: 0.08;
      filter: brightness(1.02) contrast(1.01);
      transform: translate(-50%, -50%);
    }
    48% {
      opacity: 0.68;
      filter: brightness(1.34) contrast(1.05) saturate(1.12);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-archive-star-rise {
    0%,
    100% {
      opacity: 0.18;
      transform: translateY(4px) rotate(0deg) scale(0.7);
    }
    44% {
      opacity: 1;
      transform: translateY(-5px) rotate(45deg) scale(1.15);
    }
    72% {
      opacity: 0.48;
      transform: translateY(-2px) rotate(90deg) scale(0.88);
    }
  }

  @keyframes frame-archive-portal-arc {
    0%,
    100% {
      opacity: 0.22;
      transform: rotate(-8deg) scale(0.94);
    }
    44% {
      opacity: 0.96;
      transform: rotate(8deg) scale(1.03);
    }
    72% {
      opacity: 0.52;
      transform: rotate(1deg) scale(0.98);
    }
  }

  @keyframes frame-archive-star-path {
    0%,
    100% {
      opacity: 0.14;
      transform: translate(0, 3px) rotate(0deg) scale(0.68);
    }
    44% {
      opacity: 1;
      transform: translate(2px, -4px) rotate(45deg) scale(1.18);
    }
    72% {
      opacity: 0.46;
      transform: translate(-1px, -1px) rotate(90deg) scale(0.86);
    }
  }

  @keyframes frame-archive-metal-light {
    0%,
    100% {
      filter: brightness(0.98) contrast(1.02);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: brightness(1.07) contrast(1.04);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-constellation-ink {
    0%,
    100% {
      transform: translate(-50%, -50%) skewX(-0.5deg);
      filter: drop-shadow(0 0 5px var(--frame-glow)) brightness(0.96);
    }
    50% {
      transform: translate(-50%, -50%) skewX(0.8deg);
      filter: drop-shadow(0 0 10px var(--frame-glow)) brightness(1.09);
    }
  }

  @keyframes frame-eternal-time-light {
    0%,
    100% {
      filter: drop-shadow(0 0 4px var(--frame-glow)) saturate(0.98) brightness(0.98);
      transform: translate(-50%, -50%);
    }
    42% {
      filter: drop-shadow(0 0 8px var(--frame-glow)) saturate(1.1) brightness(1.09);
      transform: translate(-50%, -50%);
    }
    72% {
      filter: drop-shadow(0 0 6px rgba(96, 165, 250, 0.58)) saturate(1.04) brightness(1.04);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-eternal-epoch-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-eternal-epoch-orbit-reverse {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-eternal-sun-halo {
    0%,
    100% {
      opacity: 0.52;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  @keyframes frame-eternal-gem-glint {
    0%,
    100% {
      opacity: 0.34;
      transform: rotate(0deg) scale(0.7);
    }
    50% {
      opacity: 1;
      transform: rotate(45deg) scale(1.16);
    }
  }

  @keyframes frame-eternal-sun-contract {
    0%,
    100% {
      filter: brightness(1.08) saturate(1.04) drop-shadow(0 0 3px rgba(251, 191, 36, 0.68));
      transform: translate(-50%, -50%) scale(1.04);
    }
    50% {
      filter: brightness(1.34) saturate(1.12) drop-shadow(0 0 5px rgba(251, 191, 36, 0.88));
      transform: translate(-50%, -50%) scale(0.84);
    }
  }

  @keyframes frame-eternal-rabbit-bridge {
    0% {
      transform: translate(-50%, -50%) translate(-4px, 3px);
    }
    16.667% {
      transform: translate(-50%, -50%) translate(11.333px, -1px);
    }
    33.333% {
      transform: translate(-50%, -50%) translate(26.667px, -5px);
    }
    50% {
      transform: translate(-50%, -50%) translate(42px, -9px);
    }
    66.667% {
      transform: translate(-50%, -50%) translate(26.667px, -5px);
    }
    83.333% {
      transform: translate(-50%, -50%) translate(11.333px, -1px);
    }
    100% {
      transform: translate(-50%, -50%) translate(-4px, 3px);
    }
  }

  @keyframes frame-eternal-rabbit-direction {
    0%,
    49.99% {
      transform: scaleX(1);
    }
    50%,
    99.99% {
      transform: scaleX(-1);
    }
    100% {
      transform: scaleX(1);
    }
  }

  @keyframes frame-eternal-rabbit-sprite {
    0% {
      background-position: 0 6.63%;
    }
    6.25% {
      background-position: 33.333% 6.94%;
    }
    12.5% {
      background-position: 66.667% 6.84%;
    }
    18.75% {
      background-position: 100% 7.37%;
    }
    25% {
      background-position: 0 36.88%;
    }
    31.25% {
      background-position: 33.333% 36.03%;
    }
    37.5% {
      background-position: 66.667% 34.86%;
    }
    43.75% {
      background-position: 100% 35.49%;
    }
    50% {
      background-position: 0 67.13%;
    }
    56.25% {
      background-position: 33.333% 69.78%;
    }
    62.5% {
      background-position: 66.667% 68.72%;
    }
    68.75% {
      background-position: 100% 69.04%;
    }
    75% {
      background-position: 0 99.08%;
    }
    81.25% {
      background-position: 33.333% 99.29%;
    }
    87.5% {
      background-position: 66.667% 99.18%;
    }
    93.75% {
      background-position: 100% 99.71%;
    }
    100% {
      background-position: 0 6.63%;
    }
  }

  @keyframes frame-eternal-rabbit-body-arc {
    0%,
    100% {
      transform: translate(-50%, -50%) translateY(1px);
    }
    18.75% {
      transform: translate(-50%, -50%) translateY(-2px);
    }
    43.75%,
    50% {
      transform: translate(-50%, -50%) translateY(-6px);
    }
    75% {
      transform: translate(-50%, -50%) translateY(-2px);
    }
    87.5% {
      transform: translate(-50%, -50%) translateY(1px);
    }
  }

  @keyframes frame-eternal-petal-drift {
    0% {
      opacity: 0;
      transform: translate(0, -2px) rotate(-18deg) scale(0.7);
    }
    28% {
      opacity: 1;
      transform: translate(2px, 2px) rotate(22deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(8px, 17px) rotate(132deg) scale(0.76);
    }
  }

  @keyframes frame-eternal-pine-sway {
    0%,
    100% {
      opacity: 0.38;
      transform: rotate(-8deg) scaleY(0.86);
    }
    50% {
      opacity: 0.9;
      transform: rotate(7deg) scaleY(1.06);
    }
  }

  @keyframes frame-eternal-rabbit-glint {
    0%,
    100% {
      opacity: 0.28;
      transform: rotate(0deg) scale(0.68);
    }
    50% {
      opacity: 1;
      transform: rotate(45deg) scale(1.2);
    }
  }

  @keyframes frame-local-twinkle {
    0%,
    100% {
      opacity: 0.22;
      transform: scale(0.62) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.3) rotate(45deg);
    }
  }

  .avatar-frame--motion-paused .avatar-frame__ambient,
  .avatar-frame--motion-paused .avatar-frame__art,
  .avatar-frame--motion-paused .avatar-frame__art-detail,
  .avatar-frame--motion-paused .avatar-frame__dragon-layer,
  .avatar-frame--motion-paused .avatar-frame__dragon-trail,
  .avatar-frame--motion-paused .avatar-frame__dragon-flow path,
  .avatar-frame--motion-paused .avatar-frame__dragon-ornament,
  .avatar-frame--motion-paused .avatar-frame__celestial-wing,
  .avatar-frame--motion-paused .avatar-frame__eternal-object,
  .avatar-frame--motion-paused .avatar-frame__eternal-rabbit-runner,
  .avatar-frame--motion-paused .avatar-frame__eternal-rabbit-direction,
  .avatar-frame--motion-paused .avatar-frame__eternal-rabbit-sprite,
  .avatar-frame--motion-paused .avatar-frame__motion,
  .avatar-frame--motion-paused .avatar-frame__motion::before,
  .avatar-frame--motion-paused .avatar-frame__motion::after,
  .avatar-frame--motion-paused .avatar-frame__motion i {
    animation: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-frame__ambient,
    .avatar-frame__art,
    .avatar-frame__art-detail,
    .avatar-frame__dragon-layer,
    .avatar-frame__dragon-trail,
    .avatar-frame__dragon-flow path,
    .avatar-frame__dragon-ornament,
    .avatar-frame__celestial-wing,
    .avatar-frame__eternal-object,
    .avatar-frame__eternal-rabbit-runner,
    .avatar-frame__eternal-rabbit-direction,
    .avatar-frame__eternal-rabbit-sprite,
    .avatar-frame__motion,
    .avatar-frame__motion::before,
    .avatar-frame__motion::after,
    .avatar-frame__motion i {
      animation: none !important;
    }
  }
</style>
