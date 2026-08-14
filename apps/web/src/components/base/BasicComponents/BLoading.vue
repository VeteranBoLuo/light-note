<template>
  <div v-if="bar" v-show="loading" class="b-loading-bar" role="progressbar" :aria-label="title" :aria-valuetext="title">
    <span class="b-loading-bar__indicator" aria-hidden="true"></span>
  </div>
  <div v-else-if="inline" v-show="loading" class="b-loading-inline" role="status" aria-live="polite">
    <span class="b-loading-inline__indicator" aria-hidden="true">
      <i></i>
      <i></i>
      <i></i>
    </span>
    <span class="b-loading-inline__title">
      <slot name="title">{{ title }}</slot>
    </span>
  </div>
  <div
    v-else
    class="loader-container"
    :style="{ opacity: loading ? '0.6' : '1', zIndex: hasSlotContent ? 'auto' : '-1' }"
  >
    <div ref="slotContainerRef" style="height: 100%">
      <slot></slot>
    </div>
    <div v-if="loading">
      <div class="loading both-center">
        <slot name="title">
          <div class="title">{{ title }}</div>
        </slot>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { nextTick, onMounted, ref } from 'vue';

  const props = defineProps({
    loading: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: '',
    },
    inline: {
      type: Boolean,
      default: false,
    },
    bar: {
      type: Boolean,
      default: false,
    },
  });

  const slotContainerRef = ref<HTMLElement>();
  const hasSlotContent = ref<boolean>(false);

  onMounted(() => {
    nextTick(() => {
      if (slotContainerRef.value) {
        hasSlotContent.value = slotContainerRef.value.children.length > 0;
      }
    });
  });
</script>

<style lang="less" scoped>
  .b-loading-bar {
    position: fixed;
    z-index: 1200;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    overflow: hidden;
    pointer-events: none;
    background: rgba(78, 75, 70, 0.12);
  }

  .b-loading-bar__indicator {
    width: 38%;
    height: 100%;
    display: block;
    background: var(--primary-color, #4e4b46);
    transform: translate3d(-120%, 0, 0);
    animation: b-loading-bar-move 1.05s ease-in-out infinite;
  }

  @keyframes b-loading-bar-move {
    0% {
      transform: translate3d(-120%, 0, 0);
    }

    55% {
      transform: translate3d(90%, 0, 0);
    }

    100% {
      transform: translate3d(300%, 0, 0);
    }
  }

  :global(.disable-animations .b-loading-bar__indicator) {
    width: 100%;
    opacity: 0.65;
    transform: none;
    animation: none !important;
  }

  .b-loading-inline {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    gap: 9px;
    color: var(--desc-color);
    font-size: 13px;
  }

  .b-loading-inline__indicator {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .b-loading-inline__indicator i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary-color);
    animation: b-loading-inline-pulse 1.1s ease-in-out infinite;
  }

  .b-loading-inline__indicator i:nth-child(2) {
    animation-delay: 0.14s;
  }

  .b-loading-inline__indicator i:nth-child(3) {
    animation-delay: 0.28s;
  }

  @keyframes b-loading-inline-pulse {
    0%,
    60%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }
    30% {
      opacity: 1;
      transform: translateY(-2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-loading-bar__indicator {
      width: 100%;
      opacity: 0.65;
      transform: none;
      animation: none;
    }

    .b-loading-inline__indicator i {
      animation: none;
      opacity: 0.65;
    }
  }

  .title {
    font-size: 12px;
  }
  .loader-container {
    height: 100%;
    width: 100%;
  }

  .loading {
    --speed-of-animation: 0.9s;
    --gap: 6px;
    --first-color: #4c86f9;
    --second-color: #49a84c;
    --third-color: #f6bb02;
    --fourth-color: #f6bb02;
    --fifth-color: #2196f3;
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 100px;
    gap: 6px;
    height: 100px;
  }

  .loading span {
    width: 4px;
    height: 50px;
    background: var(--first-color);
    animation: scale var(--speed-of-animation) ease-in-out infinite;
  }

  .loading span:nth-child(2) {
    background: var(--second-color);
    animation-delay: -0.8s;
  }

  .loading span:nth-child(3) {
    background: var(--third-color);
    animation-delay: -0.7s;
  }

  .loading span:nth-child(4) {
    background: var(--fourth-color);
    animation-delay: -0.6s;
  }

  .loading span:nth-child(5) {
    background: var(--fifth-color);
    animation-delay: -0.5s;
  }

  @keyframes scale {
    0%,
    40%,
    100% {
      transform: scaleY(0.05);
    }

    20% {
      transform: scaleY(1);
    }
  }
</style>
