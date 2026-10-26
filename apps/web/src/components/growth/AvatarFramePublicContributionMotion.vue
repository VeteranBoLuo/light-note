<template>
  <canvas ref="canvas" class="contribution-motion" :data-motion-state="motionState" aria-hidden="true" />
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
</style>
