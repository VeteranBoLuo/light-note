import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import BVirtualList from './BVirtualList.vue';
import BLoading from './BLoading.vue';

const flush = async () => {
  await nextTick();
  await nextTick();
};

describe('BVirtualList loading ownership', () => {
  it('keeps its loading footer by default', async () => {
    const host = document.createElement('div');
    const app = createApp({ render: () => h(BVirtualList, { loading: true }) });
    app.directive('auto-scrollbar', {});
    app.mount(host);
    try {
      await flush();
      expect(host.querySelectorAll('.b-loading-inline')).toHaveLength(1);
    } finally {
      app.unmount();
    }
  });

  it('lets a custom tail own the indicator without losing the loading lock or loaded rows', async () => {
    const loading = ref(true);
    const loadMore = vi.fn();
    const host = document.createElement('div');
    const app = createApp({
      render: () =>
        h(
          BVirtualList,
          {
            items: [{ id: 'task' }, { id: 'tail' }],
            loading: loading.value,
            showLoadingIndicator: false,
            hasMore: true,
            onLoadMore: loadMore,
          },
          {
            default: ({ item }: { item: { id: string } }) =>
              item.id === 'tail'
                ? h(BLoading, { inline: true, loading: loading.value, title: '正在加载…' })
                : h('span', { class: 'existing-task' }, '已加载待办'),
          },
        ),
    });
    app.directive('auto-scrollbar', {});
    app.mount(host);
    try {
      await flush();
      expect(host.querySelectorAll('.b-loading-inline')).toHaveLength(1);
      expect(host.querySelector('.b-virtual-list__loading')).toBeNull();
      expect(host.querySelector('.existing-task')?.textContent).toBe('已加载待办');
      expect(host.querySelector('.b-virtual-list')?.getAttribute('aria-busy')).toBe('true');
      host.querySelector('.b-virtual-list')!.dispatchEvent(new Event('scroll'));
      expect(loadMore).not.toHaveBeenCalled();
      loading.value = false;
      await flush();
      expect(host.querySelector('.b-virtual-list')?.getAttribute('aria-busy')).toBe('false');
      expect(loadMore).toHaveBeenCalled();
    } finally {
      app.unmount();
    }
  });
});
