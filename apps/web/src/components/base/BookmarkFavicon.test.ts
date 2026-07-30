import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BookmarkFavicon from './BookmarkFavicon.vue';
import { BOOKMARK_ICON_LOADING_TIMEOUT_MS, resetBookmarkIconRuntime } from '@/composables/bookmarkIconRuntime.ts';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  resetBookmarkIconRuntime();
  vi.useRealTimers();
});

function mountFavicon(initialLoading = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const loading = ref(initialLoading);
  const app = createApp({
    setup() {
      return () =>
        h(BookmarkFavicon, {
          bookmarkId: 'bookmark-1',
          loading: loading.value,
        });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, loading };
}

describe('BookmarkFavicon loading fallback', () => {
  it('加载超过 30 秒后停止动画并显示通用图标', async () => {
    vi.useFakeTimers();
    const { host } = mountFavicon();

    expect(host.querySelector('.bookmark-favicon__loading')).not.toBeNull();
    vi.advanceTimersByTime(BOOKMARK_ICON_LOADING_TIMEOUT_MS);
    await nextTick();

    expect(host.querySelector('.bookmark-favicon__loading')).toBeNull();
    expect(host.querySelector('img')).not.toBeNull();
  });
});
