<template>
  <img
    v-bind="$attrs"
    ref="element"
    :src="url || EMPTY_IMAGE"
    :alt="alt"
    :title="state?.status === 'failed' ? t('imageOptimization.failed') : undefined"
    decoding="async"
    @load="loaded"
    @error="failedLoad"
  />
  <span v-if="source === 'cloud' && !url" class="derived-image-placeholder" role="status">
    <SvgIcon :src="icon.message.info" size="22" />
    <span>{{ t(state?.status === 'failed' ? 'imageOptimization.failed' : 'imageOptimization.preparing') }}</span>
  </span>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useImagePreview } from '@/composables/useImagePreview';
  import { EMPTY_IMAGE, imagePreviewsEnabled, type ImagePreviewSource } from '@/api/imagePreviewApi';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineOptions({ inheritAttrs: false });
  const props = defineProps<{ source: ImagePreviewSource; resourceId: string; originalUrl: string; alt?: string }>();
  const emit = defineEmits<{ load: [event: Event]; error: [] }>();
  const { t } = useI18n();
  const element = ref<HTMLImageElement>();
  const active = ref(false);
  const { state, disabled, refreshOnce } = useImagePreview(
    () => props.source,
    () => props.resourceId,
    () => active.value,
  );
  const url = computed(() =>
    !imagePreviewsEnabled(props.source) || disabled.value ? props.originalUrl : state.value?.previewUrl || '',
  );
  let observer: IntersectionObserver | undefined;
  onMounted(() => {
    if (!('IntersectionObserver' in window)) {
      active.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        active.value = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: '100% 0px' },
    );
    if (element.value) observer.observe(element.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
  function loaded(event: Event) {
    if (url.value) emit('load', event);
  }
  function failedLoad() {
    emit('error');
    refreshOnce();
  }
</script>

<style scoped>
  .derived-image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--desc-color);
    font-size: 12px;
    pointer-events: none;
  }
</style>
