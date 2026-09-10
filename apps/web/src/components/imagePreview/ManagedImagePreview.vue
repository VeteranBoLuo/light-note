<template>
  <div
    ref="root"
    class="managed-image-preview"
    :data-presentation="state?.presentation"
    :data-preview-state="failed ? 'failed' : state?.status || 'queued'"
  >
    <img
      v-if="hasPreview"
      :key="imageGeneration"
      :src="state?.url || undefined"
      :alt="alt"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      draggable="false"
      @error="onImageError"
    />
    <template v-else>
      <slot name="fallback">
        <SvgIcon class="managed-image-preview__placeholder" :src="icon.toolbox.image" :size="24" aria-hidden="true" />
        <div class="managed-image-preview__status" role="status">
          <span>{{ statusLabel }}</span>
          <BPopover v-if="reason" v-model:open="detailsOpen" trigger="manual">
            <BButton
              size="small"
              :aria-expanded="detailsOpen"
              @click.stop="detailsOpen = !detailsOpen"
              @keydown.esc.stop="detailsOpen = false"
              >{{ t('imagePreview.details') }}</BButton
            >
            <template #content>
              <div class="managed-image-preview__details" @keydown.esc.stop="detailsOpen = false">
                <p>{{ reason }}</p>
                <BButton
                  v-if="failed || state?.retryable || state?.errorCode === 'IMAGE_STATUS_UNAVAILABLE'"
                  size="small"
                  :disabled="retrying"
                  @click.stop="retry"
                >
                  {{ t(retrying ? 'imagePreview.retrying' : 'imagePreview.retry') }}
                </BButton>
              </div>
            </template>
          </BPopover>
        </div>
      </slot>
    </template>
    <span v-if="state?.presentation === 'long_top' && hasPreview" class="managed-image-preview__badge">{{
      t('imagePreview.long')
    }}</span>
  </div>
</template>
<script setup lang="ts">
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useI18n } from 'vue-i18n';
  import { retryImagePreview } from '@/api/imagePreview';
  import { imagePreviewMessageKey } from '@/utils/imagePreviewMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
  import { useImagePreview, refreshImagePreview } from '@/composables/useImagePreview';
  import type { ImagePreviewSource, ImagePreviewState } from '@/api/imagePreview';
  const props = withDefaults(defineProps<{ source: ImagePreviewSource; alt?: string; initial?: ImagePreviewState }>(), {
    alt: '',
  });
  const { t } = useI18n();
  const retrying = ref(false);
  const detailsOpen = ref(false);
  let epoch = 0;
  let reloads = 0;
  const imageGeneration = ref(0);
  const root = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const failed = ref(false);
  const waitingTooLong = ref(false);
  const state = useImagePreview(
    computed(() => props.source),
    visible,
    computed(() => props.initial),
  );
  const hasPreview = computed(
    () =>
      Boolean(state.value?.url) &&
      ['ready', 'queued', 'processing'].includes(state.value?.status || '') &&
      !failed.value,
  );
  const statusLabel = computed(() =>
    t(
      failed.value || state.value?.status === 'failed'
        ? 'imagePreview.unavailable'
        : state.value?.status === 'unsupported'
          ? 'imagePreview.unavailable'
          : state.value?.status === 'disabled'
            ? 'imagePreview.disabled'
            : state.value?.status === 'unavailable'
              ? 'imagePreview.inaccessible'
              : waitingTooLong.value
                ? 'imagePreview.stillProcessing'
                : 'imagePreview.generating',
    ),
  );
  const reason = computed(() =>
    state.value?.status === 'unsupported'
      ? t('imagePreview.unsupported')
      : failed.value
        ? t('imagePreview.network')
        : state.value?.status === 'failed'
          ? t(imagePreviewMessageKey(state.value.errorCode))
          : '',
  );
  watch(
    [
      () => `${props.source.sourceType}:${props.source.sourceId}`,
      () => visible.value && ['queued', 'processing'].includes(state.value?.status || ''),
    ],
    ([, pending], _previous, onCleanup) => {
      waitingTooLong.value = false;
      if (!pending) return;
      const timeout = setTimeout(() => {
        waitingTooLong.value = true;
      }, 60000);
      onCleanup(() => clearTimeout(timeout));
    },
    { immediate: true },
  );
  async function onImageError() {
    failed.value = true;
    if (reloads++ === 0) {
      const target = { ...props.source };
      const requestEpoch = epoch;
      const { resolveImagePreviews } = await import('@/api/imagePreview');
      try {
        const [fresh] = await resolveImagePreviews([target], true);
        if (
          requestEpoch !== epoch ||
          target.sourceId !== props.source.sourceId ||
          target.sourceType !== props.source.sourceType
        )
          return;
        if (fresh?.url) {
          refreshImagePreview(target, fresh);
          imageGeneration.value++;
          failed.value = false;
        }
      } catch {
        /* Show a local, actionable failure after the single automatic reload. */
      }
    }
  }
  async function retry() {
    if (retrying.value) return;
    const target = { ...props.source };
    const requestEpoch = epoch;
    retrying.value = true;
    try {
      if (failed.value || state.value?.errorCode === 'IMAGE_STATUS_UNAVAILABLE') {
        const { resolveImagePreviews } = await import('@/api/imagePreview');
        const [fresh] = await resolveImagePreviews([target], true);
        if (
          requestEpoch === epoch &&
          target.sourceId === props.source.sourceId &&
          target.sourceType === props.source.sourceType &&
          fresh
        ) {
          refreshImagePreview(target, fresh);
          imageGeneration.value++;
          failed.value = false;
        }
      } else {
        const fresh = await retryImagePreview(target);
        if (requestEpoch === epoch) refreshImagePreview(target, fresh);
      }
    } catch {
      /* Retain the existing failure and allow a later user retry. */
    } finally {
      if (
        requestEpoch === epoch &&
        target.sourceId === props.source.sourceId &&
        target.sourceType === props.source.sourceType
      )
        retrying.value = false;
    }
  }
  watch(
    () => `${props.source.sourceType}:${props.source.sourceId}`,
    () => {
      epoch++;
      detailsOpen.value = false;
      failed.value = false;
      reloads = 0;
      retrying.value = false;
      imageGeneration.value++;
    },
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
  onBeforeUnmount(() => {
    epoch++;
    observer?.disconnect();
  });
</script>
<style scoped>
  .managed-image-preview.managed-image-preview {
    position: relative;
    flex-direction: column;
    gap: 6px;
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
  .managed-image-preview[data-presentation='long_top'] img {
    object-position: center top;
  }
  .managed-image-preview__placeholder {
    color: var(--bl-text-color-secondary, #888);
    font-size: 24px;
  }
  .managed-image-preview__status {
    padding: 2px 6px;
    display: grid;
    gap: 4px;
    text-align: center;
    color: var(--desc-color);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .managed-image-preview__details {
    max-width: min(260px, 72vw);
    padding: 12px;
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .managed-image-preview__details p {
    margin: 0 0 8px;
  }
  .managed-image-preview__badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 6px;
    border: 1px solid var(--workspace-border);
    border-radius: 4px;
    background: var(--workspace-content);
    color: var(--text-color);
    font-size: 12px;
  }
</style>
