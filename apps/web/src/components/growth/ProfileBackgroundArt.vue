<template>
  <div
    v-if="background"
    ref="element"
    class="profile-background-art"
    :class="{ 'is-ready': ready, 'is-running': running, 'is-thumbnail': thumbnail, 'is-atlas': background.animated }"
    aria-hidden="true"
  >
    <div
      class="profile-background-art__scene"
      :style="{ ...sceneStyle, backgroundImage: 'url(' + background.poster + ')' }"
    >
      <img
        :key="source"
        ref="imageElement"
        :src="source"
        alt=""
        decoding="async"
        :loading="thumbnail ? 'lazy' : 'eager'"
        @load="onLoad"
        @error="onError"
      />
      <div v-if="background.animated && !thumbnail" class="profile-background-art__motion">
        <span class="profile-background-art__crystal" />
        <span class="profile-background-art__tracer" />
        <span class="profile-background-art__tracer is-second" />
        <span class="profile-background-art__star is-one" />
        <span class="profile-background-art__star is-two" />
        <span class="profile-background-art__star is-three" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type WatchStopHandle } from 'vue';
  import { profileBackground } from '@/config/profileBackgrounds';
  import { useProfileBackgroundMotion } from '@/composables/useProfileBackgroundMotion';

  const props = defineProps<{ backgroundId?: string | null; thumbnail?: boolean }>();
  const background = computed(() => profileBackground(props.backgroundId));
  const source = computed(() => (props.thumbnail ? background.value?.thumbnail : background.value?.src));
  const loadedSource = ref('');
  const ready = computed(() => Boolean(source.value && loadedSource.value === source.value));
  const element = ref<HTMLElement | null>(null);
  const imageElement = ref<HTMLImageElement | null>(null);
  const sceneStyle = ref<CSSProperties>({});
  const visible = ref(false);
  const pageVisible = ref(!document.hidden);
  const reducedMotion = ref(true);
  const { paused } = useProfileBackgroundMotion();
  const running = computed(
    () =>
      background.value?.animated &&
      !props.thumbnail &&
      ready.value &&
      visible.value &&
      pageVisible.value &&
      !reducedMotion.value &&
      !paused.value,
  );
  let observer: IntersectionObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let stopObserving: WatchStopHandle | undefined;
  let media: MediaQueryList | undefined;
  const syncVisibility = () => (pageVisible.value = !document.hidden);
  const syncMotion = () => (reducedMotion.value = media?.matches ?? true);
  async function onLoad(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    try {
      await image.decode?.();
    } catch {
      return; // 解码失败继续展示首帧，不启用动效。
    }
    if (image === imageElement.value && image.getAttribute('src') === source.value && image.naturalWidth > 0)
      loadedSource.value = source.value || '';
  }
  function onError(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image === imageElement.value && image.getAttribute('src') === source.value) loadedSource.value = '';
  }
  function resizeScene() {
    const target = element.value;
    if (!target) return;
    const width = target.clientWidth;
    const height = target.clientHeight;
    if (!width || !height) return;
    // 插画与光点共用 3:1 的原图坐标；这是内容几何，不参与 UI 密度换算。
    const sceneWidth = Math.max(width, height * 3);
    const sceneHeight = sceneWidth / 3;
    sceneStyle.value = {
      width: `${sceneWidth}px`,
      height: `${sceneHeight}px`,
      left: `${(width - sceneWidth) * 0.52}px`,
      top: `${(height - sceneHeight) / 2}px`,
    };
  }
  function observeTarget() {
    observer?.disconnect();
    resizeObserver?.disconnect();
    observer = undefined;
    resizeObserver = undefined;
    visible.value = false;
    sceneStyle.value = {};
    const target = element.value;
    if (!target || props.thumbnail || !background.value?.animated) return;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => (visible.value = Boolean(entry?.isIntersecting)), {
        threshold: 0.01,
      });
      observer.observe(target);
    } else visible.value = true;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeScene);
      resizeObserver.observe(target);
      resizeScene();
    }
  }
  onMounted(() => {
    media = window.matchMedia('(prefers-reduced-motion: reduce)');
    syncMotion();
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    stopObserving = watch([element, () => props.thumbnail, () => background.value?.animated], observeTarget, {
      immediate: true,
      flush: 'post',
    });
  });
  onBeforeUnmount(() => {
    stopObserving?.();
    observer?.disconnect();
    resizeObserver?.disconnect();
    media?.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', syncVisibility);
  });
</script>

<style scoped lang="less">
  .profile-background-art {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .profile-background-art__scene {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: 72% center;
  }
  .profile-background-art__scene > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 72% center;
    opacity: 0;
    transition: opacity 0.35s ease;
  }
  .is-atlas .profile-background-art__scene {
    background-position: 52% center;
  }
  .is-atlas .profile-background-art__scene > img {
    object-position: 52% center;
  }
  .profile-background-art.is-thumbnail {
    position: relative;
    aspect-ratio: 3;
    border-radius: 0;
  }
  .is-ready .profile-background-art__scene > img {
    opacity: 1;
  }
  .profile-background-art__motion {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.6s ease 0.35s;
  }
  .is-ready .profile-background-art__motion {
    opacity: 1;
  }
  .profile-background-art__motion > span {
    position: absolute;
    animation-play-state: paused;
  }
  .is-running .profile-background-art__motion > span {
    animation-play-state: running;
  }
  .profile-background-art__star {
    /* ui-density-fixed: 插画中的星光几何不随界面密度变化 */
    width: 3px;
    /* ui-density-fixed: 插画中的星光几何不随界面密度变化 */
    height: 3px;
    border-radius: 50%;
    background: #f5ebff;
    box-shadow: 0 0 7px #ccb7ff;
    animation: background-star-glint 5s ease-in-out infinite alternate;
  }
  .profile-background-art__star.is-one {
    left: 44%;
    top: 10%;
    animation-delay: -1s;
  }
  .profile-background-art__star.is-two {
    left: 75%;
    top: 84%;
    animation-delay: -3s;
  }
  .profile-background-art__star.is-three {
    left: 88%;
    top: 27%;
    animation-delay: -4s;
  }
  .profile-background-art__crystal {
    left: 54%;
    top: 26%;
    width: 17%;
    height: 47%;
    background: radial-gradient(ellipse, #d0b2ff72, transparent 68%);
    mix-blend-mode: screen;
    animation: background-crystal-light 6s ease-in-out infinite alternate;
  }
  .profile-background-art__tracer {
    // 不支持路径动效时保留静态画面与晶核微光，不把光点显示在左上角。
    display: none;
    left: 0;
    top: 0;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    width: 4px;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    height: 4px;
    border-radius: 50%;
    background: #fff3cf;
    box-shadow: 0 0 8px 2px #ebd3a6aa;
  }
  @supports (offset-path: ellipse(23% 39% at 63% 49%)) {
    .profile-background-art__tracer {
      display: block;
      offset-path: ellipse(23% 39% at 63% 49%);
      animation: background-star-orbit 22s linear infinite;
    }
  }
  .profile-background-art__tracer.is-second {
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    width: 3px;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    height: 3px;
    opacity: 0.6;
    animation-delay: -11s;
  }
  @keyframes background-star-glint {
    from {
      opacity: 0.15;
      transform: scale(0.65);
    }
    to {
      opacity: 0.8;
      transform: scale(1.15);
    }
  }
  @keyframes background-crystal-light {
    from {
      opacity: 0.14;
      transform: scale(0.95);
    }
    to {
      opacity: 0.5;
      transform: scale(1.04);
    }
  }
  @keyframes background-star-orbit {
    from {
      offset-distance: 0%;
    }
    to {
      offset-distance: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .profile-background-art__motion {
      display: none;
    }
    .profile-background-art__scene > img {
      transition: none;
    }
    .profile-background-art__motion > span {
      animation: none;
    }
  }
</style>
