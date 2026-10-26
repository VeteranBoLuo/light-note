<template>
  <span
    class="contribution-motion"
    :class="{ 'contribution-motion--legendary': kind === 'legendary', paused: motionState !== 'playing', reduced }"
    aria-hidden="true"
  >
    <template v-if="kind === 'legendary'">
      <i class="beam beam-left"></i><i class="beam beam-right"></i><i class="lens"></i>
    </template>
    <canvas ref="canvas" :data-motion-state="motionState" />
  </span>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { paintPublicContributionFrame, type PublicContributionMotionKind } from './publicContributionMotion';
  import { subscribeContributionMotion } from './publicContributionClock';

  const props = defineProps<{
    kind: PublicContributionMotionKind;
    paused: boolean;
    chat: boolean;
    avatarSize?: number;
  }>();
  const canvas = ref<HTMLCanvasElement>();
  const visible = ref(false),
    hidden = ref(true),
    reduced = ref(false),
    scrolling = ref(false);
  const motionState = computed(() =>
    reduced.value ? 'reduced' : props.paused || !visible.value || hidden.value ? 'paused' : 'playing',
  );
  let context: CanvasRenderingContext2D | null = null;
  let time = 0,
    secondaryTime = 0;
  let stop: (() => void) | undefined;
  let observer: IntersectionObserver | undefined;
  let resize: ResizeObserver | undefined;
  let scrollObserver: MutationObserver | undefined;
  let media: MediaQueryList | undefined;
  const paint = () => {
    if (context && canvas.value)
      paintPublicContributionFrame(
        context,
        canvas.value.width,
        props.kind,
        reduced.value ? 0 : time,
        reduced.value ? 0 : secondaryTime,
        reduced.value,
      );
  };
  const sync = () => {
    stop?.();
    stop = undefined;
    paint();
    if (context && motionState.value === 'playing')
      stop = subscribeContributionMotion((delta) => {
        time += delta;
        if (!scrolling.value) secondaryTime += delta;
        paint();
      });
  };
  const onVisibility = () => {
    hidden.value = document.hidden;
  };
  const onReduction = () => {
    reduced.value = Boolean(media?.matches);
  };
  const sizeCanvas = () => {
    if (!canvas.value) return;
    const width = canvas.value.getBoundingClientRect().width;
    // Raster resolution follows the *rendered* size; illustration coordinates scale once in the parent.
    const pixels = Math.min(768, Math.max(1, Math.ceil(width * Math.min(devicePixelRatio || 1, 2))));
    if (canvas.value.width !== pixels || canvas.value.height !== pixels)
      canvas.value.width = canvas.value.height = pixels;
    paint();
  };
  watch(motionState, sync);
  watch(() => props.avatarSize, sizeCanvas, { flush: 'post' });
  watch(
    () => props.kind,
    () => {
      time = secondaryTime = 0;
      paint();
    },
  );
  onMounted(() => {
    context = canvas.value?.getContext('2d') || null;
    media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener('change', onReduction);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    onReduction();
    sizeCanvas();
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        ([entry]) => {
          visible.value = Boolean(entry?.isIntersecting);
        },
        { rootMargin: '40px' },
      );
      if (canvas.value) observer.observe(canvas.value);
    } else visible.value = true;
    if (typeof ResizeObserver === 'function') {
      resize = new ResizeObserver(sizeCanvas);
      if (canvas.value) resize.observe(canvas.value);
    }
    const list = props.chat ? canvas.value?.closest('.community-message-list') : null;
    if (list) {
      const syncScroll = () => {
        scrolling.value = list.classList.contains('is-actively-scrolling');
      };
      scrollObserver = new MutationObserver(syncScroll);
      scrollObserver.observe(list, { attributes: true, attributeFilter: ['class'] });
      syncScroll();
    }
    sync();
  });
  onBeforeUnmount(() => {
    stop?.();
    observer?.disconnect();
    resize?.disconnect();
    scrollObserver?.disconnect();
    media?.removeEventListener('change', onReduction);
    document.removeEventListener('visibilitychange', onVisibility);
  });
</script>
<style scoped>
  .contribution-motion {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 5;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    transform: translate(-50%, calc(-50% + var(--frame-art-offset-y, 0px)));
    pointer-events: none;
  }
  .contribution-motion canvas {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
  }
  .contribution-motion--legendary canvas {
    width: 112.75917%;
    height: 112.75917%;
    top: -6.379585%;
    left: -6.379585%;
  }
  .beam {
    position: absolute;
    left: 50%;
    top: 10.6%;
    width: 32%;
    height: 13%;
    transform-origin: 0 50%;
    clip-path: polygon(0 50%, 100% 0, 100% 100%);
    background: linear-gradient(90deg, rgba(173, 207, 255, 0.68), rgba(113, 116, 241, 0.4) 35%, rgba(117, 97, 227, 0));
  }
  .beam-right {
    animation: lighthouse-beam-right 5s ease-in-out infinite;
  }
  .beam-left {
    animation: lighthouse-beam-left 5s ease-in-out infinite;
  }
  .lens {
    position: absolute;
    top: 8.6%;
    left: 45.6%;
    width: 8.6%;
    height: 4.8%;
    border-radius: 25%;
    background: linear-gradient(
      100deg,
      transparent 20%,
      rgba(151, 235, 255, 0.2) 35%,
      rgba(217, 248, 255, 0.86) 48%,
      rgba(170, 192, 255, 0.25) 60%,
      transparent 75%
    );
    background-size: 240% 100%;
    animation: lighthouse-lens-sweep 5s ease-in-out infinite;
  }
  .paused .beam,
  .paused .lens {
    animation-play-state: paused;
  }
  .reduced .beam,
  .reduced .lens {
    display: none;
    animation: none;
  }
  @keyframes lighthouse-beam-right {
    0%,
    100% {
      transform: translateY(-50%) rotate(-12deg);
      opacity: 0.65;
    }
    50% {
      transform: translateY(-50%) rotate(12deg);
      opacity: 1;
    }
  }
  @keyframes lighthouse-beam-left {
    0%,
    100% {
      transform: translateY(-50%) rotate(168deg);
      opacity: 1;
    }
    50% {
      transform: translateY(-50%) rotate(192deg);
      opacity: 0.65;
    }
  }
  @keyframes lighthouse-lens-sweep {
    0%,
    100% {
      background-position: 100% 50%;
    }
    50% {
      background-position: 0 50%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .beam,
    .lens {
      display: none;
      animation: none;
    }
  }
</style>
