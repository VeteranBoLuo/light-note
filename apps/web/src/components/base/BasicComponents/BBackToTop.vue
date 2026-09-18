<template>
  <BButton v-if="visible" class="b-back-to-top" :aria-label="label" :title="label" @click="backToTop">
    <SvgIcon :src="icon.ai.scrollUp" size="20" aria-hidden="true" />
  </BButton>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue';
  import BButton from './BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resourceListBackToTopBehavior } from '@/utils/resourceListScroll';
  const props = defineProps<{ target?: HTMLElement | null; label: string }>();
  const visible = ref(false);
  watch(
    () => props.target,
    (target, _, onCleanup) => {
      const update = () => {
        visible.value = Boolean(target && target.scrollTop >= Math.max(320, target.clientHeight));
      };
      update();
      target?.addEventListener('scroll', update, { passive: true });
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
      if (target) observer?.observe(target);
      onCleanup(() => {
        target?.removeEventListener('scroll', update);
        observer?.disconnect();
      });
    },
    { immediate: true, flush: 'post' },
  );
  function backToTop() {
    const target = props.target;
    if (!target) return;
    target.scrollTo({
      top: 0,
      behavior: resourceListBackToTopBehavior({
        position: { top: target.scrollTop, viewportHeight: target.clientHeight },
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      }),
    });
  }
</script>
<style scoped>
  .b-back-to-top.b_btn {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 20;
    width: 42px;
    height: 42px;
    padding: 0;
    border-radius: 50%;
    background: var(--workspace-open-canvas);
    color: var(--desc-color);
    border: 1px solid var(--workspace-divider);
    box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  }
  .b-back-to-top.b_btn:hover {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }
  @media (max-width: 767px) {
    .b-back-to-top.b_btn {
      right: 16px;
      bottom: calc(132px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
