<template>
  <span
    class="enamel-motion"
    :class="[
      `enamel-motion--${artwork.kind}`,
      { 'enamel-motion--ready': ready, 'enamel-motion--paused': paused || !ready },
    ]"
    aria-hidden="true"
  >
    <img
      v-for="layer in artwork.layers"
      :key="layer"
      class="enamel-motion__layer"
      :class="`enamel-motion__layer--${layer}`"
      :src="achievementMotionLayer(artwork, layer, large)"
      alt=""
      decoding="async"
      draggable="false"
      @load="onLoad(layer)"
      @error="onError"
    />
    <span v-if="artwork.kind === 'lighthouse'" class="enamel-lighthouse">
      <i class="enamel-lighthouse__beam enamel-lighthouse__beam--left" />
      <i class="enamel-lighthouse__beam enamel-lighthouse__beam--right" />
      <i class="enamel-lighthouse__lens" />
    </span>
  </span>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { achievementMotionLayer, type AchievementMotionArtwork } from '@/config/achievementMotion';
  const props = defineProps<{ artwork: AchievementMotionArtwork; large: boolean; paused: boolean }>();
  const emit = defineEmits<{ ready: []; error: [] }>();
  const loaded = ref(new Set<string>());
  const failed = ref(false);
  const ready = computed(() => !failed.value && loaded.value.size === props.artwork.layers.length);
  function onLoad(layer: string) {
    if (failed.value || loaded.value.has(layer)) return;
    loaded.value.add(layer);
    if (ready.value) emit('ready');
  }
  function onError() {
    failed.value = true;
    emit('error');
  }
</script>
<style scoped lang="less">
  // Illustration coordinates scale with the emblem; these are not UI dimensions.
  .enamel-motion {
    position: absolute;
    inset: 0;
    z-index: 2;
    visibility: hidden;
    pointer-events: none;
    user-select: none;
  }
  .enamel-motion--ready {
    visibility: visible;
  }
  .enamel-motion__layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-delay: var(--enamel-phase, 0s);
  }
  // Fixed backing and foreground; only isolated alpha-cut subject parts move.
  .enamel-motion--pages {
    .enamel-motion__layer--left {
      transform-origin: 50% 64%;
      animation-name: enamel-page-left;
      animation-duration: 5.6s;
    }
    .enamel-motion__layer--right {
      transform-origin: 50% 64%;
      animation-name: enamel-page-right;
      animation-duration: 5.6s;
    }
  }
  @keyframes enamel-page-left {
    0%,
    10%,
    60%,
    100% {
      transform: perspective(600px) rotateY(0deg);
      opacity: 1;
    }
    26% {
      transform: perspective(600px) rotateY(75deg);
      opacity: 1;
    }
    42% {
      transform: perspective(600px) rotateY(156deg);
      opacity: 1;
    }
    48% {
      transform: perspective(600px) rotateY(164deg);
      opacity: 0;
    }
    49% {
      transform: perspective(600px) rotateY(0deg);
      opacity: 0;
    }
  }
  @keyframes enamel-page-right {
    0%,
    50%,
    100% {
      transform: perspective(600px) rotateY(0deg);
      opacity: 1;
    }
    66% {
      transform: perspective(600px) rotateY(-75deg);
      opacity: 1;
    }
    82% {
      transform: perspective(600px) rotateY(-156deg);
      opacity: 1;
    }
    88% {
      transform: perspective(600px) rotateY(-164deg);
      opacity: 0;
    }
    89% {
      transform: perspective(600px) rotateY(0deg);
      opacity: 0;
    }
  }
  .enamel-motion--pen .enamel-motion__layer--pen {
    transform-origin: 65% 28%;
    animation: enamel-pen-write 3.8s ease-in-out var(--enamel-phase, 0s) infinite;
  }
  @keyframes enamel-pen-write {
    0%,
    100% {
      transform: translate(-2%, -1%) rotate(-6deg);
    }
    18% {
      transform: translate(1%, 1.2%) rotate(3deg);
    }
    34% {
      transform: translate(-0.8%, 2.6%) rotate(-2deg);
    }
    52% {
      transform: translate(3.2%, 2%) rotate(6deg);
    }
    66% {
      transform: translate(2.5%, -1%) rotate(9deg);
    }
    82% {
      transform: translate(-1%, -3%) rotate(-3deg);
    }
  }
  .enamel-motion--sun {
    .enamel-motion__layer--sun {
      transform-origin: 49% 45%;
      animation: enamel-sun-turn 24s linear var(--enamel-phase, 0s) infinite;
    }
    .enamel-motion__layer--pendant-left {
      transform-origin: 16% 61%;
      animation: enamel-pendant-left 3.7s ease-in-out var(--enamel-phase, 0s) infinite;
    }
    .enamel-motion__layer--pendant-right {
      transform-origin: 84% 61%;
      animation: enamel-pendant-right 4.3s ease-in-out var(--enamel-phase, 0s) infinite;
    }
  }
  @keyframes enamel-sun-turn {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes enamel-pendant-left {
    0%,
    100% {
      transform: rotate(-7deg);
    }
    50% {
      transform: rotate(7deg);
    }
  }
  @keyframes enamel-pendant-right {
    0%,
    100% {
      transform: rotate(6deg);
    }
    50% {
      transform: rotate(-6deg);
    }
  }
  .enamel-motion--bookmark .enamel-motion__layer--bookmark {
    transform-origin: 50% 7%;
    animation: enamel-bookmark-swing 4.6s ease-in-out var(--enamel-phase, 0s) infinite;
  }
  @keyframes enamel-bookmark-swing {
    0%,
    100% {
      transform: perspective(600px) rotate(-6deg) rotateY(-12deg);
    }
    50% {
      transform: perspective(600px) rotate(6deg) rotateY(12deg);
    }
  }
  .enamel-motion--files {
    .enamel-motion__layer--folder {
      transform-origin: 59% 65%;
      animation: enamel-folder-lift 4.8s ease-in-out var(--enamel-phase, 0s) infinite;
    }
    .enamel-motion__layer--document {
      transform-origin: 50% 66%;
      animation: enamel-document-lift 4.8s ease-in-out var(--enamel-phase, 0s) infinite;
    }
  }
  @keyframes enamel-folder-lift {
    0%,
    12%,
    90%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    35%,
    50% {
      transform: translateY(-8%) rotate(7deg);
    }
    68% {
      transform: translateY(-2%) rotate(2deg);
    }
  }
  @keyframes enamel-document-lift {
    0%,
    20%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    48%,
    65% {
      transform: translate(-2%, -12%) rotate(-9deg);
    }
    85% {
      transform: translateY(-2%) rotate(-2deg);
    }
  }
  .enamel-motion--flag .enamel-motion__layer--flag {
    transform-origin: 61% 20%;
    animation: enamel-flag-wave 2.8s ease-in-out var(--enamel-phase, 0s) infinite;
  }
  @keyframes enamel-flag-wave {
    0%,
    100% {
      transform: perspective(600px) rotateY(-24deg) skewY(5deg);
    }
    35% {
      transform: perspective(600px) rotateY(18deg) skewY(-7deg);
    }
    68% {
      transform: perspective(600px) rotateY(-8deg) skewY(3deg);
    }
  }
  .enamel-motion--drawer {
    .enamel-motion__layer--cards {
      transform-origin: 50% 62%;
      animation: enamel-index-rise 5s ease-in-out var(--enamel-phase, 0s) infinite;
    }
    .enamel-motion__layer--drawer {
      transform-origin: 50% 76%;
      animation: enamel-drawer-open 5s ease-in-out var(--enamel-phase, 0s) infinite;
    }
  }
  @keyframes enamel-index-rise {
    0%,
    12%,
    94%,
    100% {
      transform: translateY(0);
    }
    40%,
    58% {
      transform: translateY(-7%);
    }
    75% {
      transform: translateY(-2%);
    }
  }
  @keyframes enamel-drawer-open {
    0%,
    10%,
    94%,
    100% {
      transform: translateY(0);
    }
    32%,
    64% {
      transform: translateY(7%);
    }
    80% {
      transform: translateY(3%);
    }
  }
  .enamel-motion--tree {
    .enamel-motion__layer--left {
      transform-origin: 48% 61%;
      animation: enamel-branch-left 4.4s ease-in-out var(--enamel-phase, 0s) infinite;
    }
    .enamel-motion__layer--right {
      transform-origin: 52% 61%;
      animation: enamel-branch-right 5.1s ease-in-out var(--enamel-phase, 0s) infinite;
    }
  }
  @keyframes enamel-branch-left {
    0%,
    100% {
      transform: rotate(-5deg);
    }
    50% {
      transform: rotate(5deg);
    }
  }
  @keyframes enamel-branch-right {
    0%,
    100% {
      transform: rotate(4deg);
    }
    50% {
      transform: rotate(-6deg);
    }
  }
  // These percentages are registered to the lamp room in the 512px illustration.
  // The tower and book never transform; the optical lens and emitted beams sweep.
  .enamel-lighthouse {
    position: absolute;
    inset: 0;
  }
  .enamel-lighthouse__beam {
    position: absolute;
    top: 18.8%;
    width: 34%;
    height: 10%;
    background: linear-gradient(90deg, #e5fbff 0%, #63bdffb8 20%, #6955e080 62%, #6b49d300 100%);
    clip-path: polygon(0 42%, 100% 0, 100% 100%, 0 58%);
    animation: enamel-lighthouse-sweep 4.2s ease-in-out var(--enamel-phase, 0s) infinite;
  }
  .enamel-lighthouse__beam--right {
    left: 50%;
    transform-origin: 0 50%;
  }
  .enamel-lighthouse__beam--left {
    right: 50%;
    background: linear-gradient(-90deg, #e5fbff 0%, #63bdffb8 20%, #6955e080 62%, #6b49d300 100%);
    clip-path: polygon(100% 42%, 0 0, 0 100%, 100% 58%);
    transform-origin: 100% 50%;
    animation-direction: reverse;
  }
  .enamel-lighthouse__lens {
    position: absolute;
    left: 45.8%;
    top: 18.4%;
    width: 8.4%;
    height: 8.5%;
    border-radius: 35% 35% 28% 28%;
    background: linear-gradient(100deg, #4543c9 0%, #68ceff 35%, #e6ffff 48%, #36b1ed 62%, #5540a8 100%);
    background-size: 220% 100%;
    opacity: 0.86;
    animation: enamel-lighthouse-lens 4.2s ease-in-out var(--enamel-phase, 0s) infinite;
  }
  @keyframes enamel-lighthouse-sweep {
    0%,
    100% {
      transform: rotate(-14deg);
    }
    50% {
      transform: rotate(14deg);
    }
  }
  @keyframes enamel-lighthouse-lens {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }
  .enamel-motion--paused .enamel-motion__layer,
  .enamel-motion--paused .enamel-lighthouse > i {
    animation-play-state: paused;
  }
  @media (prefers-reduced-motion: reduce) {
    .enamel-motion__layer,
    .enamel-lighthouse > i {
      animation: none !important;
    }
  }
</style>
