import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAfterBookmarkImport, useBookmarkIconBatchTracking } from './useBookmarkIconBatch';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) || null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function processingState(overrides: Record<string, unknown> = {}) {
  return {
    batchId: 'batch-1',
    total: 2,
    completed: 0,
    success: 0,
    notFound: 0,
    failed: 0,
    cancelled: 0,
    queued: 1,
    processing: 1,
    retryWaiting: 0,
    status: 'processing',
    updates: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('useBookmarkIconBatchTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应用增量 updates，并在下一次状态请求发送 nextCursor', async () => {
    const bookmarks = ref([{ id: 'bookmark-1', iconUrl: '' }]);
    const requestStatus = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: processingState({
          completed: 1,
          success: 1,
          updates: [
            {
              jobId: 4,
              bookmarkId: 'bookmark-1',
              status: 'success',
              iconUrl: '/uploads/new.png',
              finishedAt: '2026-07-25T02:00:00.123Z',
            },
          ],
          nextCursor: {
            finishedAt: '2026-07-25T02:00:00.123Z',
            jobId: 4,
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: processingState({ completed: 1, success: 1 }),
      });
    const tracker = useBookmarkIconBatchTracking({
      bookmarks,
      reloadBookmarks: vi.fn(),
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus,
      storage: createStorage(),
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
    });

    await tracker.start('batch-1', 2);
    expect(bookmarks.value[0].iconUrl).toBe('/uploads/new.png');
    await tracker.pollNow();

    expect(requestStatus).toHaveBeenNthCalledWith(2, 'batch-1', {
      finishedAt: '2026-07-25T02:00:00.123Z',
      jobId: 4,
    });
  });

  it('批次完成后清除 pending，并最终 reload 一次但不重复同步补图', async () => {
    const storage = createStorage();
    const reloadBookmarks = vi.fn().mockResolvedValue(undefined);
    const tracker = useBookmarkIconBatchTracking({
      bookmarks: ref([]),
      reloadBookmarks,
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus: vi.fn().mockResolvedValue({
        status: 200,
        data: processingState({
          total: 1,
          completed: 1,
          success: 1,
          queued: 0,
          processing: 0,
          status: 'completed',
        }),
      }),
      storage,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
    });

    await tracker.start('batch-1', 1);

    expect(storage.removeItem).toHaveBeenCalledWith('icon-batch-pending:user-1');
    expect(reloadBookmarks).toHaveBeenCalledWith({ refreshIcons: false });
    expect(tracker.state.value?.status).toBe('completed');
  });

  it('连续三次状态查询失败后清除后台批次并恢复渐进补图', async () => {
    const storage = createStorage();
    const reloadBookmarks = vi.fn().mockResolvedValue(undefined);
    const notifyFallback = vi.fn();
    const tracker = useBookmarkIconBatchTracking({
      bookmarks: ref([]),
      reloadBookmarks,
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus: vi.fn().mockRejectedValue(new Error('offline')),
      notifyFallback,
      storage,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
    });

    await tracker.start('batch-1', 1);
    await tracker.pollNow();
    await tracker.pollNow();

    expect(notifyFallback).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledWith('icon-batch-pending:user-1');
    expect(reloadBookmarks).toHaveBeenCalledWith({ refreshIcons: true });
    expect(tracker.state.value).toBeNull();
  });

  it('Worker 长时间无进度时也会降级，避免永久停在默认图标', async () => {
    let currentTime = 0;
    const reloadBookmarks = vi.fn().mockResolvedValue(undefined);
    const notifyFallback = vi.fn();
    const tracker = useBookmarkIconBatchTracking({
      bookmarks: ref([]),
      reloadBookmarks,
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus: vi.fn().mockResolvedValue({
        status: 200,
        data: processingState({
          queued: 2,
          processing: 0,
        }),
      }),
      notifyFallback,
      storage: createStorage(),
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      now: () => currentTime,
      stallFallbackMs: 30_000,
    });

    await tracker.start('batch-1', 2);
    currentTime = 30_001;
    await tracker.pollNow();

    expect(notifyFallback).toHaveBeenCalledOnce();
    expect(reloadBookmarks).toHaveBeenCalledWith({ refreshIcons: true });
  });

  it('仅剩等待重试时转为低频后台状态，且离开页面后不再恢复成正在补全', async () => {
    let currentTime = 0;
    const storage = createStorage();
    const schedule = vi.fn(() => 1);
    const notifyFallback = vi.fn();
    const tracker = useBookmarkIconBatchTracking({
      bookmarks: ref([]),
      reloadBookmarks: vi.fn().mockResolvedValue(undefined),
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus: vi.fn().mockResolvedValue({
        status: 200,
        data: processingState({
          total: 2,
          completed: 1,
          success: 1,
          queued: 0,
          processing: 0,
          retryWaiting: 1,
        }),
      }),
      notifyFallback,
      storage,
      schedule,
      cancelSchedule: vi.fn(),
      now: () => currentTime,
      stallFallbackMs: 30_000,
    });

    await tracker.start('batch-1', 2);
    currentTime = 60 * 60 * 1000;
    await tracker.pollNow();

    expect(tracker.state.value?.retryWaiting).toBe(1);
    expect(tracker.readPendingBatch()).toBe('');
    expect(storage.removeItem).toHaveBeenCalledWith('icon-batch-pending:user-1');
    expect(schedule.mock.calls[schedule.mock.calls.length - 1]?.[1]).toBe(15_000);
    expect(notifyFallback).not.toHaveBeenCalled();
  });

  it('后台重试重新进入处理队列时重置停滞计时并恢复 pending', async () => {
    let currentTime = 0;
    const storage = createStorage();
    const notifyFallback = vi.fn();
    const requestStatus = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: processingState({
          total: 2,
          completed: 1,
          success: 1,
          queued: 0,
          processing: 0,
          retryWaiting: 1,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: processingState({
          total: 2,
          completed: 1,
          success: 1,
          queued: 0,
          processing: 1,
          retryWaiting: 0,
        }),
      });
    const tracker = useBookmarkIconBatchTracking({
      bookmarks: ref([]),
      reloadBookmarks: vi.fn().mockResolvedValue(undefined),
      storageKey: computed(() => 'icon-batch-pending:user-1'),
      requestStatus,
      notifyFallback,
      storage,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      now: () => currentTime,
      stallFallbackMs: 30_000,
    });

    await tracker.start('batch-1', 2);
    currentTime = 60 * 60 * 1000;
    await tracker.pollNow();

    expect(tracker.readPendingBatch()).toBe('batch-1');
    expect(notifyFallback).not.toHaveBeenCalled();
  });
});

describe('refreshAfterBookmarkImport', () => {
  it('HTML 与 Excel 共用同一后台批次分流', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);

    await expect(refreshAfterBookmarkImport({ batchId: 'batch-1', total: 3 }, start, reload)).resolves.toBe(true);
    expect(start).toHaveBeenCalledWith('batch-1', 3);
    expect(reload).toHaveBeenCalledWith({ refreshIcons: false });

    start.mockClear();
    reload.mockClear();
    await expect(refreshAfterBookmarkImport(undefined, start, reload)).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledWith({ refreshIcons: true });
  });
});
