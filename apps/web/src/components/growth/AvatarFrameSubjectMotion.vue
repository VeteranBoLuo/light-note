<template>
  <span
    ref="root"
    class="avatar-subject"
    :class="[
      `avatar-subject--${artwork.key}`,
      { 'is-ready': ready, 'is-paused': paused || !visible || hidden || !ready },
    ]"
    :style="{ '--subject-play-state': chat ? 'var(--avatar-frame-scroll-secondary-play-state, running)' : 'running' }"
    aria-hidden="true"
  >
    <span class="subject-frame__art">
      <img
        class="subject-frame__base"
        :src="artwork.assets.base"
        alt=""
        draggable="false"
        @load="loaded.add('base')"
        @error="failed = true"
      />
      <template v-if="artwork.key === 'archive'">
        <span class="subject-frame__book">
          <img
            :src="artwork.assets['book']"
            alt=""
            draggable="false"
            @load="loaded.add('book')"
            @error="failed = true"
          />
          <img
            class="subject-frame__leaf subject-frame__leaf--left"
            :src="artwork.assets['book']"
            alt=""
            draggable="false"
            @load="loaded.add('left')"
            @error="failed = true"
          />
          <img
            class="subject-frame__leaf subject-frame__leaf--right"
            :src="artwork.assets['book']"
            alt=""
            draggable="false"
            @load="loaded.add('right')"
            @error="failed = true"
          />
        </span>
      </template>
      <template v-else-if="artwork.key === 'ink'">
        <span class="subject-frame__ink-trail"></span>
        <img
          class="subject-frame__brush"
          :src="artwork.assets['brush']"
          alt=""
          draggable="false"
          @load="loaded.add('brush')"
          @error="failed = true"
        />
      </template>
      <template v-else-if="artwork.key === 'cloud'">
        <img
          v-for="i in 2"
          :key="i"
          class="subject-frame__file"
          :class="`subject-frame__file--${i}`"
          :src="artwork.assets['page']"
          alt=""
          draggable="false"
          @load="loaded.add('page')"
          @error="failed = true"
        />
        <img
          class="subject-frame__scroll"
          :src="artwork.assets['scroll']"
          alt=""
          draggable="false"
          @load="loaded.add('scroll')"
          @error="failed = true"
        />
        <img
          class="subject-frame__cloud"
          :src="artwork.assets['cloud']"
          alt=""
          draggable="false"
          @load="loaded.add('cloud')"
          @error="failed = true"
        />
      </template>
      <template v-else-if="artwork.key === 'galaxy'">
        <span v-for="i in 2" :key="i" class="planet-orbit" :class="`planet-orbit--${i}`"
          ><img
            class="planet-body"
            :src="artwork.assets['planet']"
            alt=""
            draggable="false"
            @load="loaded.add('planet')"
            @error="failed = true"
        /></span>
      </template>
      <template v-else>
        <span class="moon-body"
          ><img
            :src="artwork.assets['moon']"
            alt=""
            draggable="false"
            @load="loaded.add('moon')"
            @error="failed = true" /><i class="moon-shadow"></i
        ></span>
        <img
          v-for="i in 2"
          :key="i"
          class="moon-cloud"
          :class="`moon-cloud--${i}`"
          :src="artwork.assets['cloud']"
          alt=""
          draggable="false"
          @load="loaded.add('cloud')"
          @error="failed = true"
        />
      </template>
    </span>
  </span>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type { AvatarSubjectArtwork } from '@/config/avatarFrameSubjects';
  const props = defineProps<{ artwork: AvatarSubjectArtwork; paused: boolean; chat: boolean }>();
  const emit = defineEmits<{ ready: [key: string, ready: boolean] }>();
  const root = ref<HTMLElement>(),
    loaded = ref(new Set<string>()),
    failed = ref(false),
    visible = ref(true),
    hidden = ref(document.hidden);
  const ready = computed(() => !failed.value && props.artwork.layers.every((key) => loaded.value.has(key)));
  watch(ready, (value) => emit('ready', props.artwork.key, value), { immediate: true });
  let observer: IntersectionObserver | undefined;
  const onVisibility = () => {
    hidden.value = document.hidden;
  };
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility);
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          visible.value = !!entry?.isIntersecting;
        },
        { rootMargin: '40px' },
      );
      if (root.value) observer.observe(root.value);
    }
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  });
</script>
<style scoped>
  /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
  .avatar-subject {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 3;
    /* ui-density-fixed: raster canvas width, scaled by the parent avatar size. */
    width: 128px;
    /* ui-density-fixed: raster canvas height, scaled by the parent avatar size. */
    height: 128px;
    transform: translate(-50%, -50%) scale(var(--frame-canvas-scale));
    pointer-events: none;
    visibility: hidden;
  }
  .avatar-subject.is-ready {
    visibility: visible;
  }
  .subject-frame__art {
    position: absolute;
    inset: 0;
  }
  .subject-frame__art img {
    position: absolute;
    display: block;
    max-width: none;
    object-fit: contain;
    user-select: none;
  }
  .subject-frame__base {
    inset: 0;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 128px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 128px;
  }
  .subject-frame__book {
    position: absolute;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 91px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 33px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 31px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 28.416667px;
    transform: rotate(-8deg);
  }
  .subject-frame__book > img {
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
  /* Both leaves use the exact 384 × 352 book texture, not separately generated paper.
     Spine endpoints are (232,100) and (145,277). A shared origin and rotate3d axis
     keep BOTH endpoints fixed throughout the turn; the clipped leaf contains no cover pixels. */
  .subject-frame__leaf {
    transform-origin: 37.760417% 78.693182%;
    animation: subject-page-left 6s ease-in-out infinite;
  }
  .subject-frame__leaf--left {
    clip-path: polygon(
      60.416667% 28.409091%,
      54.7% 20.5%,
      46.8% 13.6%,
      31.8% 8.2%,
      10.4% 61.9%,
      21.9% 63.6%,
      30.5% 68.2%,
      37.760417% 78.693182%
    );
  }
  .subject-frame__leaf--right {
    clip-path: polygon(
      60.416667% 28.409091%,
      68.8% 26.4%,
      79.7% 28.1%,
      88.5% 32.7%,
      67.7% 86.4%,
      56.3% 81.8%,
      45.8% 78.1%,
      37.760417% 78.693182%
    );
    animation-name: subject-page-right;
  }
  @keyframes subject-page-left {
    0%,
    5%,
    47%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 0deg);
      opacity: 1;
    }
    18% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, -60deg);
      opacity: 1;
    }
    32% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, -148deg);
      opacity: 1;
    }
    39%,
    40% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, -170deg);
      opacity: 0;
    }
    41% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 0deg);
      opacity: 0;
    }
  }
  @keyframes subject-page-right {
    0%,
    52%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 0deg);
      opacity: 1;
    }
    65% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 60deg);
      opacity: 1;
    }
    79% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 148deg);
      opacity: 1;
    }
    86%,
    87% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 170deg);
      opacity: 0;
    }
    88% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(160px) rotate3d(87, -177, 0, 0deg);
      opacity: 0;
    }
  }
  .subject-frame__brush {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 79px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 43px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 43px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 61px;
    transform-origin: 67% 28%;
    animation: subject-brush-write 4.8s cubic-bezier(0.45, 0, 0.24, 1) infinite;
  }
  .subject-frame__ink-trail {
    position: absolute;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 75px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 98px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 29px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 6px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    border-bottom: 2px solid #74bdbb;
    border-radius: 0 0 70% 30%;
    transform: rotate(-20deg);
    transform-origin: left center;
    animation: subject-ink-write 4.8s ease-in-out infinite;
  }
  @keyframes subject-brush-write {
    0%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(3px, -4px) rotate(8deg);
    }
    12% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(0, 1px) rotate(-5deg);
    }
    32% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(5px, 0) rotate(-11deg);
    }
    48% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(1px, 4px) rotate(-3deg);
    }
    64% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(7px, 1px) rotate(-8deg);
    }
    78% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(8px, -6px) rotate(11deg);
    }
  }
  @keyframes subject-ink-write {
    0%,
    10% {
      clip-path: inset(0 100% 0 0);
      opacity: 0;
    }
    18% {
      clip-path: inset(0 85% 0 0);
      opacity: 0.85;
    }
    64% {
      clip-path: inset(0 0 0 0);
      opacity: 0.85;
    }
    85%,
    100% {
      clip-path: inset(0 0 0 0);
      opacity: 0;
    }
  }
  .subject-frame__scroll {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 59px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 94px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 35px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 30px;
    transform-origin: 30% 12%;
    animation: subject-scroll-open 6.2s ease-in-out infinite;
  }
  .subject-frame__file {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 91px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 82px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 24px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 22px;
    transform-origin: 45% 80%;
    animation: subject-file-rise 6.2s ease-in-out infinite;
  }
  .subject-frame__file--2 {
    animation-delay: -3.1s;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 20px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 95px;
  }
  .subject-frame__cloud {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 85px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 101px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 28px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 21px;
    animation: subject-cloud-drift 6.2s ease-in-out infinite;
  }
  @keyframes subject-scroll-open {
    0%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(100px) rotateX(42deg) rotateZ(-5deg);
    }
    24%,
    50% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(100px) rotateX(-12deg) rotateZ(5deg);
    }
    74% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: perspective(100px) rotateX(12deg) rotateZ(0deg);
    }
  }
  @keyframes subject-file-rise {
    0% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(-2px, 5px) rotate(-12deg) rotateY(-25deg);
      opacity: 0;
    }
    14% {
      opacity: 1;
    }
    42% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(3px, -5px) rotate(7deg) rotateY(15deg);
      opacity: 1;
    }
    70% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(6px, -14px) rotate(14deg) rotateY(-15deg);
      opacity: 0.9;
    }
    88%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(8px, -19px) rotate(8deg) rotateY(-30deg);
      opacity: 0;
    }
  }
  @keyframes subject-cloud-drift {
    0%,
    100% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(-3px, 0);
    }
    50% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(4px, -3px);
    }
  }
  .avatar-subject--galaxy .subject-frame__base {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 1px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 5px;
  }
  .planet-orbit {
    position: absolute;
    inset: 0;
    animation: review-planet-orbit 14s linear infinite;
  }
  .planet-body {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 100px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 54px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 25px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 21px;
    animation: review-planet-roll 11s linear infinite;
  }
  .planet-orbit--2 {
    animation-duration: 21s;
    animation-delay: -10.5s;
    animation-direction: reverse;
  }
  .planet-orbit--2 .planet-body {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 108px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 57px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 16px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 14px;
    filter: hue-rotate(32deg);
    animation-duration: 15s;
  }
  @keyframes review-planet-orbit {
    from {
      transform: rotate(-42deg);
    }
    to {
      transform: rotate(318deg);
    }
  }
  @keyframes review-planet-roll {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .avatar-subject--moon .subject-frame__base {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 113px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 116px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 4px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 3px;
  }
  .moon-body {
    position: absolute;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 27px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 27px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 92px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 13px;
    border-radius: 50%;
    overflow: hidden;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    box-shadow: 0 0 3px #b4ceff;
  }
  .moon-body img {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 29px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 33px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: -1px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: -3px;
    object-fit: fill;
  }
  .moon-shadow {
    position: absolute;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    inset: -1px;
    background: linear-gradient(90deg, rgba(33, 48, 92, 0.88), rgba(44, 62, 112, 0.76) 85%, rgba(48, 66, 112, 0.3));
    border-radius: 50%;
    animation: review-moon-phase 12s ease-in-out infinite;
  }
  @keyframes review-moon-phase {
    0%,
    100% {
      transform: translateX(95%);
    }
    25% {
      transform: translateX(30%);
    }
    50% {
      transform: translateX(-12%);
    }
    75% {
      transform: translateX(-65%);
    }
  }
  .moon-cloud {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 49px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 34px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 72px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 86px;
    animation: review-cloud-right 7s ease-in-out infinite;
  }
  .moon-cloud--2 {
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    left: 10px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    top: 88px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    width: 40px;
    /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
    height: 28px;
    animation-name: review-cloud-left;
    animation-delay: -3.5s;
  }
  @keyframes review-cloud-right {
    0%,
    100% {
      transform: translate(0, 0) rotate(-5deg);
    }
    50% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: translate(3px, -2px) rotate(2deg);
    }
  }
  @keyframes review-cloud-left {
    0%,
    100% {
      transform: rotateY(180deg) translate(0, 0);
    }
    50% {
      /* ui-density-fixed: illustration coordinates on a 128px canvas, scaled once by the parent avatar size. */
      transform: rotateY(180deg) translate(2px, -2px);
    }
  }

  .subject-frame__art * {
    animation-play-state: var(--subject-play-state, running);
  }
  .is-paused .subject-frame__art * {
    animation-play-state: paused !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .subject-frame__art * {
      animation: none !important;
    }
    .subject-frame__ink-trail,
    .subject-frame__file--2,
    .moon-shadow {
      display: none;
    }
  }
</style>
