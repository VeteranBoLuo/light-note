import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDeepSeekBalance,
  normalizeDeepSeekBalance,
  resetDeepSeekBalanceCacheForTest,
} from './providerBalance.js';

describe('DeepSeek balance service', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    resetDeepSeekBalanceCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('优先选择 CNY，且保留全部币种', () => {
    const result = normalizeDeepSeekBalance({
      is_available: true,
      balance_infos: [
        { currency: 'USD', total_balance: '2.00', granted_balance: '1', topped_up_balance: '1' },
        { currency: 'CNY', total_balance: '10.50', granted_balance: '3', topped_up_balance: '7.5' },
      ],
    });
    expect(result.currency).toBe('CNY');
    expect(result.totalBalance).toBe('10.50');
    expect(result.balanceInfos).toHaveLength(2);
  });

  it('在缓存有效期内不重复请求上游', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '8', granted_balance: '2', topped_up_balance: '6' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getDeepSeekBalance();
    await getDeepSeekBalance();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
