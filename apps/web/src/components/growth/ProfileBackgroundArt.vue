<template>
  <div
    v-if="background"
    ref="element"
    class="profile-background-art"
    :class="{
      'is-ready': ready,
      'is-running': running,
      'is-thumbnail': thumbnail,
      'is-fountain': background.animated === 'fountain',
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
        <ProfileBackgroundFountain
          v-if="background.animated === 'fountain' && ready && !reducedMotion"
          :image="imageElement"
          :running="Boolean(running)"
        />
        <template v-else-if="background.animated === 'lighthouse'">
          <span class="profile-background-art__beam" />
          <span class="profile-background-art__lighthouse" />
          <span class="profile-background-art__water">
            <span class="profile-background-art__water-fade">
              <span class="profile-background-art__ripples" />
            </span>
          </span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type WatchStopHandle } from 'vue';
  import { profileBackground } from '@/config/profileBackgrounds';
  import ProfileBackgroundFountain from './ProfileBackgroundFountain.vue';

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
      left: `${(width - sceneWidth) * (background.value?.animated === 'fountain' ? 0.6 : 0.72)}px`,
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
  .is-fountain .profile-background-art__scene {
    background-position: 60% center;
  }
  .is-fountain .profile-background-art__scene > img {
    object-position: 60% center;
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
  .profile-background-art__motion span {
    position: absolute;
    animation-play-state: paused;
  }
  .is-running .profile-background-art__motion span {
    animation-play-state: running;
  }
  .profile-background-art__lighthouse {
    left: 73%;
    top: 1%;
    width: 8%;
    height: 24%;
    background: radial-gradient(ellipse, #fffef4 0%, #fff1b9d9 14%, #ffd79080 32%, transparent 70%);
    mix-blend-mode: screen;
    animation: background-lighthouse-glow 2s ease-in-out infinite alternate;
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
    animation: background-lighthouse-sweep 3.6s ease-in-out infinite alternate;
  }
  .profile-background-art__water {
    inset: 0;
    // 按原图海湾水域向内描边，岸线固定；仅内部水纹移动，不能连遮罩一起平移到山体上。
    // 不支持裁切时省略水纹，保留灯塔动效。
    display: none;
  }
  @supports (clip-path: polygon(0 0, 100% 0, 100% 100%)) {
    .profile-background-art__water {
      display: block;
      clip-path: polygon(
        60.6% 46.8%,
        63.8% 47%,
        63.4% 51.8%,
        66.5% 56.5%,
        69.5% 60.5%,
        71.5% 63%,
        68% 64.5%,
        66.7% 68.5%,
        64.3% 67.8%,
        62.5% 65%,
        63.6% 62%,
        64.9% 60.7%,
        62.9% 58.5%,
        61.8% 55%,
        58.8% 53%,
        58% 49.5%
      );
    }
  }
  .profile-background-art__water-fade {
    left: 57%;
    top: 44%;
    width: 16%;
    height: 26%;
    overflow: hidden;
    mask-image: linear-gradient(180deg, transparent, #000 22%, #000 65%, transparent);
    mix-blend-mode: screen;
  }
  .profile-background-art__ripples {
    left: 0;
    top: -25%;
    width: 100%;
    height: 125%;
    opacity: 0.7;
    background: repeating-linear-gradient(180deg, transparent 0%, transparent 6%, #fff4cfa6 7%, transparent 10%);
    mask-image: linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent);
    // 每轮恰好移动一个条纹周期，首尾图案相同；渐入渐出由外层固定遮罩完成。
    animation: background-water-light 1.2s linear infinite;
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
      transform: translateY(0);
    }
    to {
      transform: translateY(10%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .profile-background-art__motion {
      display: none;
    }
    .profile-background-art__scene > img {
      transition: none;
    }
    .profile-background-art__motion span {
      animation: none;
    }
  }
</style>
