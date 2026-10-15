<template>
  <div ref="sentinel" class="group-continuation" :aria-busy="loading">
    <template v-if="error">
      <span role="alert">{{ error }}</span>
      <BButton :disabled="disabled" @click="$emit('retry')">{{ t('common.retry') }}</BButton>
    </template>
    <BLoading v-else inline loading :title="t('organizeWorkspace.loading')" />
  </div>
</template>

<script setup lang="ts">
  import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  const props = defineProps<{ cursor?: string | null; loading: boolean; error?: string; disabled: boolean }>();
  const emit = defineEmits<{ load: []; retry: [] }>();
  const { t } = useI18n();
  const sentinel = ref<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  function observe() {
    observer?.disconnect();
    if (
      !sentinel.value ||
      props.loading ||
      props.error ||
      props.disabled ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    observer = new IntersectionObserver(
      (entries) => {
        if (!props.loading && !props.error && !props.disabled && entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          emit('load');
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel.value);
  }
  onMounted(observe);
  watch(() => [props.cursor, props.loading, props.error, props.disabled], observe, { flush: 'post' });
  onActivated(observe);
  onDeactivated(() => observer?.disconnect());
  onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
  .group-continuation {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px);
  }
</style>
