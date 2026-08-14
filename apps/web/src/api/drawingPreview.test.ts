import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
vi.mock('@/http/request', () => ({ apiBasePost }));

const { invalidateDrawingPreview, loadDrawingPreview, resetDrawingPreviewCacheForTests } =
  await import('./drawingPreview');

describe('drawingPreview api', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiBasePost.mockReset();
    resetDrawingPreviewCacheForTests();
  });

  afterEach(() => {
    resetDrawingPreviewCacheForTests();
    vi.useRealTimers();
  });

  it('把同一帧进入可视区的卡片合并为一次静默请求并缓存结果', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        items: [
          { id: 'n1', revision: 1, preview: { v: 1, page: { width: 1024, height: 1448 }, elements: [] } },
          { id: 'n2', revision: 2, preview: { v: 1, page: { width: 1024, height: 1448 }, elements: [] } },
        ],
      },
    });
    const first = loadDrawingPreview('n1', 1);
    const second = loadDrawingPreview('n2', 2);
    await vi.advanceTimersByTimeAsync(16);

    expect(apiBasePost).toHaveBeenCalledTimes(1);
    expect(apiBasePost).toHaveBeenCalledWith('/api/note/queryDrawingPreviews', { ids: ['n1', 'n2'] }, { silent: true });
    expect(JSON.parse(await first)).toMatchObject({ v: 1 });
    await second;
    await loadDrawingPreview('n1', 1);
    expect(apiBasePost).toHaveBeenCalledTimes(1);

    invalidateDrawingPreview('n1');
    void loadDrawingPreview('n1', 1);
    await vi.advanceTimersByTimeAsync(16);
    expect(apiBasePost).toHaveBeenCalledTimes(2);
  });
});
