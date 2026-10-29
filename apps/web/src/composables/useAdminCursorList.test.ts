import { describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { useAdminCursorList } from './useAdminCursorList';

describe('useAdminCursorList', () => {
  it('ignores an old request failure after a new filter has loaded', async () => {
    let rejectOld!: (reason: Error) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject;
          }),
      )
      .mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'new' }], total: 1, hasMore: false } });
    let list!: ReturnType<typeof useAdminCursorList<{ id: string }>>;
    const host = document.createElement('div');
    const app = createApp({
      setup() {
        list = useAdminCursorList({ request });
        return () => h('div');
      },
    });
    app.mount(host);
    const oldRequest = list.reload();
    await list.reload();
    rejectOld(new Error('late failure'));
    await oldRequest;
    expect(list.failed.value).toBe(false);
    expect(list.items.value).toEqual([{ id: 'new' }]);
    app.unmount();
  });
  it('preserves loaded rows after an append failure and clears failure on explicit retry', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: '1' }], total: 2, hasMore: true, nextCursor: 'next' },
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: { items: [{ id: '2' }], total: 2, hasMore: false } });
    let list!: ReturnType<typeof useAdminCursorList<{ id: string }>>;
    const host = document.createElement('div');
    const app = createApp({
      setup() {
        list = useAdminCursorList({ request });
        return () => h('div');
      },
    });
    app.mount(host);
    await list.reload();
    expect(list.failed.value).toBe(false);
    await list.loadMore();
    expect(list.failed.value).toBe(true);
    expect(list.items.value).toEqual([{ id: '1' }]);
    expect(list.nextCursor.value).toBe('next');
    await list.loadMore();
    expect(list.failed.value).toBe(false);
    expect(list.items.value).toEqual([{ id: '1' }, { id: '2' }]);
    app.unmount();
  });

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

    expect(request).toHaveBeenNthCalledWith(1, null, 50, { activity: 'foreground' });
    expect(request).toHaveBeenNthCalledWith(2, 'c1', 50, { activity: 'incremental' });
    expect(list.items.value).toEqual([{ id: '1' }, { id: '2' }]);
    expect(list.total.value).toBe(2);
    expect(list.hasMore.value).toBe(false);
    app.unmount();
  });
});
