import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBaseGet = vi.fn();
const apiBasePost = vi.fn();

vi.doMock('@/http/request.ts', () => ({ apiBaseGet, apiBasePost }));

const dailyReviewApi = await import('./dailyReviewApi');

describe('dailyReviewApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiBaseGet.mockResolvedValue({ status: 200, data: null });
    apiBasePost.mockResolvedValue({ status: 200, data: null });
  });

  it('读取与幂等生成使用相互独立的正式端点', async () => {
    await dailyReviewApi.getTodayDailyReview();
    await dailyReviewApi.ensureTodayDailyReview();

    expect(apiBaseGet).toHaveBeenCalledWith('/api/daily-review/today', undefined, { silent: true });
    expect(apiBasePost).toHaveBeenCalledWith('/api/daily-review/today/ensure', undefined, { silent: true });
  });

  it('保留后端按账号时区固化的资源自然日', async () => {
    apiBaseGet.mockResolvedValueOnce({
      status: 200,
      data: {
        generated: true,
        date: '2026-09-01',
        timezone: 'Asia/Singapore',
        session: { id: 'session-1', status: 'active', itemCount: 1 },
        progress: { done: 0, total: 1, pending: 1 },
        items: [
          {
            id: 'item-1',
            slot: 1,
            resourceType: 'note',
            resourceId: 'note-1',
            title: '旧笔记',
            url: null,
            time: '2025-12-31 23:59:59',
            resourceDate: '2024-09-01',
            reasonCode: 'on_this_day',
            reasonTag: null,
            action: 'pending',
          },
        ],
      },
    });

    const response = await dailyReviewApi.getTodayDailyReview();

    expect(response.data.items[0].resourceDate).toBe('2024-09-01');
  });

  it('打开内容时使用 Axios fetch adapter 的 keepalive，且保留统一请求拦截链', async () => {
    await dailyReviewApi.updateDailyReviewItem('daily/item 1', 'open', { keepalive: true });

    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/daily-review/items/daily%2Fitem%201/action',
      { action: 'open' },
      { silent: true, adapter: 'fetch', fetchOptions: { keepalive: true } },
    );
  });

  it('资源偏好与当日收起继续使用普通写入', async () => {
    await dailyReviewApi.updateDailyReviewItem('item-1', 'snooze_7d');
    await dailyReviewApi.updateDailyReviewToday('skip_today');

    expect(apiBasePost).toHaveBeenNthCalledWith(
      1,
      '/api/daily-review/items/item-1/action',
      { action: 'snooze_7d' },
      { silent: true },
    );
    expect(apiBasePost).toHaveBeenNthCalledWith(
      2,
      '/api/daily-review/today/action',
      { action: 'skip_today' },
      { silent: true },
    );
  });
});
