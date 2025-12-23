<template>
  <div class="loader-container" :style="{ opacity: loading ? '0.6' : '1', zIndex: hasSlotContent ? 'auto' : '-1' }">
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
  .title {
    font-size: 12px;
  }
  .loader-container {
    position: absolute;
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
