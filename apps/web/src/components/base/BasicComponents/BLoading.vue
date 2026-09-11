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
      <slot name="title">{{ displayTitle }}</slot>
    </span>
  </div>
  <div
    v-else
    v-show="!!$slots.default || loading"
    class="loader-container"
    :class="{ 'is-standalone': !$slots.default && loading }"
    :aria-busy="loading"
  >
    <div v-if="$slots.default" class="b-loading-content">
      <slot></slot>
    </div>
    <div v-if="loading" class="b-loading-overlay" role="status" aria-live="polite">
      <span class="b-loading-inline__indicator" aria-hidden="true"> <i></i><i></i><i></i> </span>
      <span v-if="displayTitle || $slots.title" class="b-loading-inline__title">
        <slot name="title">{{ displayTitle }}</slot>
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, getCurrentInstance } from 'vue';

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
  const instance = getCurrentInstance();
  const displayTitle = computed(() => {
    const fallback = props.inline
      ? ''
      : instance?.appContext.config.globalProperties.$t?.('common.loading') || 'Loading';
    return (props.title || fallback).replace(/(?:\.{3}|…)+\s*$/u, '').trim();
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

  .loader-container {
    position: relative;
    height: 100%;
    width: 100%;
  }
  .loader-container.is-standalone {
    min-height: 100px;
  }
  .loader-container.both-center {
    position: absolute;
  }
  .b-loading-content {
    height: 100%;
  }
  .loader-container[aria-busy='true'] > .b-loading-content {
    opacity: 0.35;
    filter: blur(1px);
  }
  .b-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    color: var(--desc-color);
    font-size: 14px;
    pointer-events: none;
  }
  .b-loading-overlay .b-loading-inline__indicator {
    gap: 5px;
  }
  .b-loading-overlay .b-loading-inline__indicator i {
    width: 8px;
    height: 8px;
  }
  :global(.disable-animations .b-loading-inline__indicator i) {
    animation: none !important;
    opacity: 0.65;
  }
</style>
