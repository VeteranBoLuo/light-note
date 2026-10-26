<template>
  <span
    ref="root"
    class="achievement-emblem"
    :class="[
      `achievement-emblem--${visual.family}`,
      `achievement-emblem--tier-${visual.tier}`,
      `achievement-emblem--rarity-${visual.rarity}`,
      {
        'achievement-emblem--apex': visual.apex,
        'achievement-emblem--compact': size <= 34,
        'achievement-emblem--showcase': size >= 68,
        'achievement-emblem--locked': locked,
        'achievement-emblem--animated': effectsReady && motionReady,
        'achievement-emblem--paused': !visible || !pageVisible,
      },
    ]"
    :style="emblemStyle"
    aria-hidden="true"
  >
    <img
      v-if="art && !failed"
      class="achievement-emblem__art"
      :src="art"
      alt=""
      :loading="animated && size >= 100 ? 'eager' : 'lazy'"
      decoding="async"
      draggable="false"
      @load="loaded = true"
      @error="failed = true"
    />
    <span v-else class="achievement-emblem__fallback">
      <SvgIcon :src="visual.icon" :size="Math.max(14, size * 0.58)" :density-aware="false" />
    </span>
    <AchievementMotion
      v-if="effectsReady && motionArtwork"
      :key="art"
      :artwork="motionArtwork"
      :large="size > 96"
      :paused="!visible || !pageVisible"
      @ready="motionReady = true"
      @error="motionFailed = true"
    />
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch, type WatchStopHandle } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { achievementVisualFor, achievementVisualStyle } from '@/config/achievements';
  import { achievementArtwork } from '@/config/achievementArtwork';
  import { ACHIEVEMENT_MOTION } from '@/config/achievementMotion';
  import AchievementMotion from './AchievementMotion.vue';

  // size is a rendered dimension; callers using useUiDensity must not be scaled a second time.
  const props = withDefaults(
    defineProps<{ achievementKey: string; group?: string; size?: number; locked?: boolean; animated?: boolean }>(),
    { group: '', size: 46, locked: false, animated: false },
  );
  const visual = computed(() => achievementVisualFor(props.achievementKey, props.group));
  const art = computed(() => achievementArtwork(props.achievementKey, props.size > 96));
  const motionArtwork = computed(() => ACHIEVEMENT_MOTION[props.achievementKey]);
  const emblemStyle = computed(() => ({
    ...achievementVisualStyle(props.achievementKey, props.group),
    '--achievement-size': `${props.size}px`,
    // Stable phases keep awards from starting their action in unison.
    '--enamel-phase': `${-(Array.from(props.achievementKey).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 53) / 10}s`,
  }));
  const root = ref<HTMLElement>();
  const loaded = ref(false),
    failed = ref(false),
    motionReady = ref(false),
    motionFailed = ref(false),
    visible = ref(false),
    pageVisible = ref(true),
    reducedMotion = ref(false);
  // Small community badges and ordinary tiers stay still, even when motion is opted into.
  const motionCandidate = computed(
    () =>
      props.animated && visual.value.tier === 5 && !props.locked && props.size >= 64 && Boolean(motionArtwork.value),
  );
  const effectsReady = computed(
    () => motionCandidate.value && !reducedMotion.value && loaded.value && !failed.value && !motionFailed.value,
  );
  watch(effectsReady, () => {
    motionReady.value = false;
  });
  let observer: IntersectionObserver | undefined;
  let motionQuery: MediaQueryList | undefined;
  let stopWatching: WatchStopHandle | undefined;
  function syncVisibility() {
    pageVisible.value = !document.hidden;
  }
  function syncMotion() {
    reducedMotion.value = Boolean(motionQuery?.matches);
  }
  function releaseTracking() {
    observer?.disconnect();
    observer = undefined;
    motionQuery?.removeEventListener('change', syncMotion);
    motionQuery = undefined;
    document.removeEventListener('visibilitychange', syncVisibility);
    visible.value = false;
  }
  watch(art, () => {
    loaded.value = false;
    failed.value = false;
    motionReady.value = false;
    motionFailed.value = false;
  });
  onMounted(() => {
    stopWatching = watch(
      motionCandidate,
      (enabled) => {
        releaseTracking();
        if (!enabled) return;
        syncVisibility();
        motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        syncMotion();
        motionQuery?.addEventListener('change', syncMotion);
        document.addEventListener('visibilitychange', syncVisibility);
        if (typeof IntersectionObserver === 'function' && root.value) {
          observer = new IntersectionObserver(
            ([entry]) => {
              visible.value = entry.isIntersecting;
            },
            { threshold: 0.25 },
          );
          observer.observe(root.value);
        } else visible.value = true;
      },
      { immediate: true },
    );
  });
  onBeforeUnmount(() => {
    stopWatching?.();
    releaseTracking();
  });
</script>

<style scoped lang="less">
  .achievement-emblem {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--achievement-size);
    height: var(--achievement-size);
    isolation: isolate;
    vertical-align: middle;
  }
  .achievement-emblem__art {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
  }
  .achievement-emblem--locked {
    filter: grayscale(0.9) saturate(0.25);
    opacity: 0.58;
  }
  .achievement-emblem--animated .achievement-emblem__art {
    opacity: 0;
  }
  .achievement-emblem--sharing .achievement-emblem__fallback {
    border: 2px solid var(--achievement-metal-mid);
    color: var(--achievement-deep);
    background: linear-gradient(145deg, var(--achievement-highlight), var(--achievement-secondary));
    box-shadow: inset 0 0 0 2px var(--achievement-metal-highlight);
    border-radius: 28% 28% 42% 42%;
  }
  .achievement-emblem__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80%;
    height: 80%;
    border: 1px solid var(--achievement-accent);
    border-radius: 25%;
    color: var(--achievement-accent);
    background: var(--background-color);
  }
</style>
