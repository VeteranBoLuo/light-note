<template>
  <span class="bookmark-favicon" :style="faviconStyle" aria-hidden="true">
    <span v-if="resolvedLoading" class="bookmark-favicon__loading"></span>
    <img v-else :src="resolvedSrc || icon.nullImg" alt="" @error="handleError" />
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import icon from '@/config/icon.ts';
  import {
    BOOKMARK_ICON_LOADING_TIMEOUT_MS,
    getBookmarkIconRuntimeState,
    resolveBookmarkIconSource,
  } from '@/composables/bookmarkIconRuntime.ts';

  const props = withDefaults(
    defineProps<{
      src?: string;
      bookmarkId?: string;
      size?: number;
      tileSize?: number;
      loading?: boolean;
    }>(),
    {
      src: '',
      bookmarkId: '',
      size: 22,
      tileSize: 34,
      loading: false,
    },
  );

  const faviconStyle = computed(() => ({
    '--bookmark-favicon-size': `${props.size}px`,
    '--bookmark-favicon-tile-size': `${props.tileSize}px`,
  }));
  const runtimeState = computed(() => getBookmarkIconRuntimeState(props.bookmarkId));
  const resolvedSrc = computed(() => resolveBookmarkIconSource(props.bookmarkId, props.src));
  const loadingTimedOut = ref(false);
  let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  const requestedLoading = computed(
    () => props.loading || Boolean(runtimeState.value?.refreshing) || Boolean(runtimeState.value?.batchLoading),
  );
  // 刷新已有图标时继续展示旧图；只有当前确实没有可用图标时才展示加载态。
  // 无论上游请求是否能正常收尾，单个组件最多展示约 30 秒动画，随后稳定回退通用图标。
  const resolvedLoading = computed(() => !resolvedSrc.value && requestedLoading.value && !loadingTimedOut.value);

  function clearLoadingTimeout() {
    if (loadingTimeout !== null) clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  watch(
    [resolvedSrc, requestedLoading, () => runtimeState.value?.requestToken],
    ([source, loading]) => {
      clearLoadingTimeout();
      loadingTimedOut.value = false;
      if (source || !loading) return;
      loadingTimeout = setTimeout(() => {
        loadingTimeout = null;
        loadingTimedOut.value = true;
      }, BOOKMARK_ICON_LOADING_TIMEOUT_MS);
    },
    { immediate: true },
  );

  function handleError(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image.getAttribute('src') !== icon.nullImg) image.src = icon.nullImg;
  }

  onBeforeUnmount(clearLoadingTimeout);
</script>

<style scoped lang="less">
  .bookmark-favicon {
    width: var(--bookmark-favicon-tile-size);
    height: var(--bookmark-favicon-tile-size);
    padding: calc((var(--bookmark-favicon-tile-size) - var(--bookmark-favicon-size)) / 2);
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
    border: 0;
    border-radius: calc(var(--bookmark-favicon-tile-size) * 0.29);
    background: transparent;
  }

  .bookmark-favicon img,
  .bookmark-favicon__loading {
    width: var(--bookmark-favicon-size);
    height: var(--bookmark-favicon-size);
    display: block;
    border-radius: calc(var(--bookmark-favicon-size) * 0.2);
  }

  .bookmark-favicon img {
    object-fit: contain;
    /* favicon 原图直出：不铺底、不反色、不描边，完整保留站点品牌色。 */
    filter: var(--bookmark-favicon-image-filter, none);
  }

  .bookmark-favicon__loading {
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--primary-color) 7%, var(--card-border-color)) 20%,
      color-mix(in srgb, var(--primary-color) 18%, var(--background-color)) 45%,
      color-mix(in srgb, var(--primary-color) 7%, var(--card-border-color)) 70%
    );
    background-size: 220% 100%;
    animation: bookmark-favicon-loading 1.1s ease-in-out infinite;
  }

  @keyframes bookmark-favicon-loading {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bookmark-favicon__loading {
      animation: none;
    }
  }
</style>
