import { describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: (...args) => axiosGet(...args) } }));

const { fetchWebMeta } = await import('./fetchWebMeta.js');

describe('fetchWebMeta cancellation', () => {
  it('不把取消请求吞成普通抓取失败', async () => {
    axiosGet.mockRejectedValueOnce({ name: 'CanceledError', code: 'ERR_CANCELED' });

    await expect(fetchWebMeta('https://example.com')).rejects.toMatchObject({
      name: 'CanceledError',
      code: 'ERR_CANCELED',
    });
  });
});
