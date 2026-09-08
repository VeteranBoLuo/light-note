<template>
  <div ref="root" class="managed-image-preview" :data-preview-state="failed ? 'failed' : state?.status || 'queued'">
    <img
      v-if="state?.status === 'ready' && state.url && !failed"
      :src="state.url"
      :alt="alt"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      draggable="false"
      @error="failed = true"
    />
    <SvgIcon
      v-else
      class="managed-image-preview__placeholder"
      :src="icon.toolbox.image"
      :size="24"
      aria-hidden="true"
    />
  </div>
</template>
<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
  import { useImagePreview } from '@/composables/useImagePreview';
  import type { ImagePreviewSource, ImagePreviewState } from '@/api/imagePreview';
  const props = withDefaults(defineProps<{ source: ImagePreviewSource; alt?: string; initial?: ImagePreviewState }>(), {
    alt: '',
  });
  const root = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const failed = ref(false);
  const state = useImagePreview(
    computed(() => props.source),
    visible,
    computed(() => props.initial),
  );
  let observer: IntersectionObserver | undefined;
  watch(
    () => state.value?.url,
    () => {
      failed.value = false;
    },
  );
  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      visible.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (items) => {
        visible.value = items.some((item) => item.isIntersecting);
      },
      { rootMargin: '100px' },
    );
    if (root.value) observer.observe(root.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
</script>
<style scoped>
  .managed-image-preview.managed-image-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
  }
  .managed-image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .managed-image-preview__placeholder {
    color: var(--bl-text-color-secondary, #888);
    font-size: 24px;
  }
</style>
