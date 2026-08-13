import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completePointsEconomyRequest,
  getOrCreatePointsEconomyRequest,
  isAmbiguousPointsEconomyFailure,
} from './pointsEconomyRequest';

describe('积分消费请求标识', () => {
  beforeEach(() => sessionStorage.clear());

  it('同标签页相同负载复用 requestId，成功后再生成新 ID', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const payload = { itemId: 'storage_512', expectedCost: 1600 };
    const first = getOrCreatePointsEconomyRequest('u1', 'shop_buy', payload);
    const retry = getOrCreatePointsEconomyRequest('u1', 'shop_buy', payload);
    expect(retry).toEqual(first);
    completePointsEconomyRequest('u1', 'shop_buy', payload);
    expect(getOrCreatePointsEconomyRequest('u1', 'shop_buy', payload).clientRequestId).not.toBe(first.clientRequestId);
  });

  it('不同规范负载分别保留自己的待重放 ID，不会互相覆盖', () => {
    const first = getOrCreatePointsEconomyRequest('u1', 'lottery_paid', { times: 1, expectedCost: 170 });
    const second = getOrCreatePointsEconomyRequest('u1', 'lottery_paid', { times: 10, expectedCost: 1600 });
    expect(second.clientRequestId).not.toBe(first.clientRequestId);
    expect(getOrCreatePointsEconomyRequest('u1', 'lottery_paid', { expectedCost: 170, times: 1 })).toEqual(first);
  });

  it('仅网络未知结果保留待重放请求', () => {
    expect(isAmbiguousPointsEconomyFailure({ code: 'REQUEST_TIMEOUT' })).toBe(true);
    expect(isAmbiguousPointsEconomyFailure({ code: 'NETWORK_ERROR' })).toBe(true);
    expect(isAmbiguousPointsEconomyFailure({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isAmbiguousPointsEconomyFailure({ code: 'ECONNABORTED' })).toBe(true);
    expect(isAmbiguousPointsEconomyFailure({ code: 'ECONOMY_CATALOG_CHANGED' })).toBe(false);
  });

  it('经济版本切换后仍保留未知结果请求，便于服务端跨版本重放原结果', () => {
    const oldPayload = { itemId: 'storage_128', economyVersion: 'points-economy-c3', expectedCost: 250 };
    const oldRequest = getOrCreatePointsEconomyRequest('u-version', 'shop_buy', oldPayload);
    const retry = getOrCreatePointsEconomyRequest('u-version', 'shop_buy', {
      itemId: 'storage_128',
      economyVersion: 'points-economy-c4',
      expectedCost: 500,
    });
    expect(retry.clientRequestId).toBe(oldRequest.clientRequestId);
    expect(retry.payload).toEqual(oldPayload);
  });

  it('未知结果请求不会因客户端时间流逝而生成新的扣费请求号', () => {
    const payload = { itemId: 'ai_pack', economyVersion: 'points-economy-c4', expectedCost: 420 };
    const request = getOrCreatePointsEconomyRequest('u-timeout', 'shop_buy', payload);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
    expect(getOrCreatePointsEconomyRequest('u-timeout', 'shop_buy', payload)).toEqual(request);
    clock.mockRestore();
  });

  it('sessionStorage 暂时不可用时仍在当前页面复用同一请求号', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const payload = { itemId: 'ai_pack', economyVersion: 'points-economy-c4', expectedCost: 420 };
    const first = getOrCreatePointsEconomyRequest('u-storage', 'shop_buy', payload);
    const retry = getOrCreatePointsEconomyRequest('u-storage', 'shop_buy', payload);
    expect(retry).toEqual(first);
    getItem.mockRestore();
    setItem.mockRestore();
    removeItem.mockRestore();
  });
});
