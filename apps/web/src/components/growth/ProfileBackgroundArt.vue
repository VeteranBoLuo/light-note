<template>
  <div
    v-if="background"
    ref="element"
    class="profile-background-art"
    :class="{
      'is-ready': ready,
      'is-running': running,
      'is-thumbnail': thumbnail,
      'is-atlas': background.animated === 'atlas',
      'is-lighthouse': background.animated === 'lighthouse',
    }"
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
        :srcset="thumbnail ? `${background.thumbnail} 720w, ${background.src} ${background.srcWidth}w` : undefined"
        :sizes="thumbnail ? 'auto, 100vw' : undefined"
        alt=""
        decoding="async"
        :loading="thumbnail ? 'lazy' : 'eager'"
        @load="onLoad"
        @error="onError"
      />
      <div v-if="background.animated && !thumbnail" class="profile-background-art__motion">
        <template v-if="background.animated === 'atlas'">
          <span class="profile-background-art__aura" />
          <span class="profile-background-art__crystal" />
          <span class="profile-background-art__gilding" />
          <span class="profile-background-art__tracer" />
          <span class="profile-background-art__tracer is-second" />
          <span class="profile-background-art__star is-one" />
          <span class="profile-background-art__star is-two" />
          <span class="profile-background-art__star is-three" />
        </template>
        <template v-else-if="background.animated === 'lighthouse'">
          <span class="profile-background-art__beam" />
          <span class="profile-background-art__lighthouse" />
          <span class="profile-background-art__water" />
          <span class="profile-background-art__water is-reflection" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type WatchStopHandle } from 'vue';
  import { profileBackground } from '@/config/profileBackgrounds';

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
  const running = computed(
    () =>
      background.value?.animated &&
      !props.thumbnail &&
      ready.value &&
      visible.value &&
      pageVisible.value &&
      !reducedMotion.value,
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
      left: `${(width - sceneWidth) * (background.value?.animated === 'atlas' ? 0.52 : 0.72)}px`,
      top: `${(height - sceneHeight) * (background.value?.animated === 'lighthouse' ? 0.15 : 0.5)}px`,
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
  .is-lighthouse .profile-background-art__scene {
    background-position: 72% 15%;
  }
  .is-lighthouse .profile-background-art__scene > img {
    object-position: 72% 15%;
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
  .profile-background-art__lighthouse {
    left: 73%;
    top: 1%;
    width: 8%;
    height: 24%;
    background: radial-gradient(ellipse, #fffef4 0%, #fff1b9d9 14%, #ffd79080 32%, transparent 70%);
    mix-blend-mode: screen;
    animation: background-lighthouse-glow 3.6s ease-in-out infinite alternate;
  }
  .profile-background-art__beam {
    left: 40%;
    top: 3%;
    width: 37%;
    height: 20%;
    transform-origin: 100% 50%;
    clip-path: polygon(0 0, 100% 47%, 100% 53%, 0 100%);
    background: linear-gradient(90deg, transparent, #fff5c922 20%, #fff2c58c 76%, #fffce5e6);
    mask-image: linear-gradient(0deg, transparent, #000 43%, #000 57%, transparent);
    mix-blend-mode: screen;
    animation: background-lighthouse-sweep 8s ease-in-out infinite alternate;
  }
  .profile-background-art__water {
    left: 57%;
    top: 43%;
    width: 16%;
    height: 30%;
    background: repeating-linear-gradient(0deg, transparent 0%, transparent 8%, #fff4cfdb 9%, transparent 12%);
    border-radius: 50%;
    mask-image: radial-gradient(ellipse, #000 12%, transparent 72%);
    mix-blend-mode: screen;
    animation: background-water-light 4s ease-in-out infinite alternate;
  }
  .profile-background-art__water.is-reflection {
    left: 86%;
    top: 34%;
    width: 11%;
    height: 26%;
    animation-delay: -2s;
    animation-duration: 5s;
  }
  @keyframes background-lighthouse-sweep {
    from {
      opacity: 0.35;
      transform: rotate(-9deg) scaleX(0.88);
    }
    to {
      opacity: 0.9;
      transform: rotate(8deg) scaleX(1);
    }
  }
  @keyframes background-lighthouse-glow {
    from {
      opacity: 0.5;
      transform: scale(0.85);
    }
    to {
      opacity: 1;
      transform: scale(1.2);
    }
  }
  @keyframes background-water-light {
    from {
      opacity: 0.3;
      transform: translate(-3%, -2%) scaleX(0.92);
    }
    to {
      opacity: 0.8;
      transform: translate(3%, 3%) scaleX(1.06);
    }
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
    background: radial-gradient(ellipse, #fff3ddc2, #d5bdff99 30%, #a68aff38 52%, transparent 72%);
    mix-blend-mode: screen;
    animation: background-crystal-light 4.5s ease-in-out infinite alternate;
  }
  .profile-background-art__aura {
    left: 40%;
    top: 4%;
    width: 44%;
    height: 88%;
    border-radius: 50%;
    background: radial-gradient(ellipse, transparent 30%, #bda1fa30 50%, #e3c29240 60%, transparent 73%);
    mix-blend-mode: screen;
    animation: background-atlas-aura 9s ease-in-out infinite alternate;
  }
  .profile-background-art__gilding {
    left: 45%;
    top: 5%;
    width: 31%;
    height: 88%;
    border-radius: 50%;
    background: conic-gradient(
      from 35deg,
      transparent 0deg 245deg,
      #eacb8a24 270deg,
      #fff1c7c2 290deg,
      transparent 320deg
    );
    mask-image: radial-gradient(ellipse, transparent 55%, #000 60%, #000 65%, transparent 71%);
    mix-blend-mode: screen;
    animation: background-gilding-light 12s ease-in-out infinite alternate;
  }
  .profile-background-art__tracer {
    // 不支持路径动效时保留静态画面与晶核微光，不把光点显示在左上角。
    display: none;
    left: 0;
    top: 0;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    width: 5px;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    height: 5px;
    border-radius: 50%;
    background: #fff3cf;
    box-shadow:
      0 0 6px 2px #fff1cb,
      0 0 18px 5px #ebc98a88;
  }
  @supports (offset-path: ellipse(23% 39% at 63% 49%)) {
    .profile-background-art__tracer {
      display: block;
      offset-path: ellipse(23% 39% at 63% 49%);
      animation: background-star-orbit 18s linear infinite;
    }
  }
  .profile-background-art__tracer.is-second {
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    width: 3px;
    /* ui-density-fixed: 插画中的轨道光点不随界面密度变化 */
    height: 3px;
    opacity: 0.8;
    animation-delay: -9s;
  }
  @keyframes background-star-glint {
    from {
      opacity: 0.25;
      transform: scale(0.65);
    }
    to {
      opacity: 1;
      transform: scale(1.4);
    }
  }
  @keyframes background-crystal-light {
    from {
      opacity: 0.35;
      transform: scale(0.92) rotate(-5deg);
    }
    to {
      opacity: 0.85;
      transform: scale(1.08) rotate(5deg);
    }
  }
  @keyframes background-atlas-aura {
    from {
      opacity: 0.3;
      transform: scale(0.94) rotate(-6deg);
    }
    to {
      opacity: 0.75;
      transform: scale(1.04) rotate(6deg);
    }
  }
  @keyframes background-gilding-light {
    from {
      opacity: 0.35;
      transform: rotate(-16deg);
    }
    to {
      opacity: 0.85;
      transform: rotate(18deg);
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
