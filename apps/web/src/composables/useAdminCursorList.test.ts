import { describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { useAdminCursorList } from './useAdminCursorList';

describe('useAdminCursorList', () => {
  it('resets, appends and de-duplicates cursor pages', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: { items: [{ id: '1' }], total: 2, hasMore: true, nextCursor: 'c1' } })
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: '1' }, { id: '2' }], hasMore: false, nextCursor: null },
      });
    let list!: ReturnType<typeof useAdminCursorList<{ id: string }>>;
    const host = document.createElement('div');
    const app = createApp({
      setup() {
        list = useAdminCursorList<{ id: string }>({ request });
        return () => h('div');
      },
    });
    app.mount(host);

    await list.reload();
    await list.loadMore();

    expect(request).toHaveBeenNthCalledWith(1, null, 50);
    expect(request).toHaveBeenNthCalledWith(2, 'c1', 50);
    expect(list.items.value).toEqual([{ id: '1' }, { id: '2' }]);
    expect(list.total.value).toBe(2);
    expect(list.hasMore.value).toBe(false);
    app.unmount();
  });
});
