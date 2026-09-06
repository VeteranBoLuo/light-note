<template>
  <div class="image-preview-controls">
    <span role="status">{{ label }}</span>
    <BButton v-if="!original && !expired" size="small" :loading="originalLoading" @click="showOriginal">{{
      t('imageOptimization.viewOriginal')
    }}</BButton>
    <BButton v-if="state?.status === 'failed'" size="small" @click="retryPreview">{{
      t('imageOptimization.retry')
    }}</BButton>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useImagePreview } from '@/composables/useImagePreview';
  import { EMPTY_IMAGE, imagePreviewsEnabled, type ImagePreviewSource } from '@/api/imagePreviewApi';
  const props = defineProps<{
    source: ImagePreviewSource;
    resourceId: string;
    originalUrl: string;
    refreshVersion?: number;
  }>();
  const emit = defineEmits<{ display: [url: string] }>();
  const { t } = useI18n();
  const original = ref(false);
  const originalLoading = ref(false);
  const originalFailed = ref(false);
  let generation = 0;
  let lastPreviewUrl = '';
  function displayPreview(url: string) {
    lastPreviewUrl = url;
    emit('display', url);
  }
  const { state, disabled, retry, refreshOnce, identity } = useImagePreview(
    () => props.source,
    () => props.resourceId,
    () => !original.value,
    'image_display',
  );
  const thumbnail = useImagePreview(
    () => props.source,
    () => props.resourceId,
    () => !original.value && !state.value?.previewUrl,
  );
  watch(thumbnail.state, (value) => {
    if (!original.value && !state.value?.previewUrl && value?.previewUrl) displayPreview(value.previewUrl);
  });
  function retryPreview() {
    originalFailed.value = false;
    retry();
  }
  watch([() => props.resourceId, identity], () => {
    generation++;
    lastPreviewUrl = '';
    emit('display', EMPTY_IMAGE);
    original.value = false;
    originalLoading.value = false;
    originalFailed.value = false;
  });
  onBeforeUnmount(() => {
    generation++;
  });
  watch(
    () => props.refreshVersion,
    () => {
      if (original.value && lastPreviewUrl && lastPreviewUrl !== props.originalUrl) {
        original.value = false;
        originalFailed.value = true;
        emit('display', lastPreviewUrl);
      } else refreshOnce();
    },
  );
  const expired = computed(() => String(state.value?.errorCode || '').includes('EXPIRED'));
  const failed = computed(() => originalFailed.value || state.value?.status === 'failed');
  const label = computed(() =>
    t(
      original.value
        ? 'imageOptimization.original'
        : expired.value
          ? 'imageOptimization.expired'
          : originalFailed.value
            ? 'imageOptimization.originalFailed'
            : failed.value
              ? 'imageOptimization.failed'
              : state.value?.animated
                ? 'imageOptimization.animated'
                : state.value?.status === 'ready'
                  ? 'imageOptimization.preview'
                  : 'imageOptimization.preparing',
    ),
  );
  watch(
    [state, disabled],
    () => {
      if (original.value) return;
      if (disabled.value || !imagePreviewsEnabled(props.source)) {
        original.value = true;
        emit('display', props.originalUrl);
      } else if (state.value?.previewUrl) {
        displayPreview(state.value.previewUrl);
        if (state.value.mode === 'source') original.value = true;
      }
    },
    { immediate: true },
  );
  async function showOriginal() {
    if (originalLoading.value) return;
    const current = generation;
    originalLoading.value = true;
    originalFailed.value = false;
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject();
        image.src = props.originalUrl;
      });
      if (current !== generation) return;
      original.value = true;
      emit('display', props.originalUrl);
    } catch {
      if (current === generation) originalFailed.value = true;
    } finally {
      if (current === generation) originalLoading.value = false;
    }
  }
</script>
<style scoped>
  .image-preview-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    color: inherit;
  }
  .image-preview-controls :deep(.b_btn) {
    white-space: nowrap;
  }
  @media (max-width: 767px) {
    .image-preview-controls :deep(.b_btn) {
      min-height: var(--mobile-touch-size, 44px);
      padding: 0 12px;
    }
  }
</style>
