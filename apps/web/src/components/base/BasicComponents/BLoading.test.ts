import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BLoading from './BLoading.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountLoading(initialLoading: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const loading = ref(initialLoading);
  const app = createApp({
    setup() {
      return () => h(BLoading, { loading: loading.value, bar: true, title: 'Loading page' });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, loading };
}

describe('BLoading bar', () => {
  it('提供不会阻塞页面操作的全局进度反馈', () => {
    const { host } = mountLoading(true);
    const bar = host.querySelector<HTMLElement>('.b-loading-bar');

    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-label')).toBe('Loading page');
    expect(bar?.getAttribute('aria-valuetext')).toBe('Loading page');
    expect(bar?.style.display).not.toBe('none');
  });

  it('导航完成后隐藏进度条', async () => {
    const { host, loading } = mountLoading(true);
    loading.value = false;
    await nextTick();

    expect(host.querySelector<HTMLElement>('.b-loading-bar')?.style.display).toBe('none');
  });
});
