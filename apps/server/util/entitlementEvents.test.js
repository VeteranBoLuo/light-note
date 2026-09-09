import { describe, it, expect, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
import { normalizeEntitlementEvent } from './entitlementEvents.js';
describe('资源商店事件白名单', () => {
  it('客户端不能伪造结算或到账事件，未知字段被移除', () => {
    expect(normalizeEntitlementEvent(null)).toBeNull();
    expect(normalizeEntitlementEvent({ event: 'enter_store', flowId: {} }).flowId).toBeUndefined();
    expect(normalizeEntitlementEvent({ event: 'paid' })).toBeNull();
    expect(normalizeEntitlementEvent({ event: 'checkout_created' })).toBeNull();
    expect(
      normalizeEntitlementEvent({
        event: 'enter_store',
        source: 'bookmark.dialog',
        prompt: 'private',
        userId: 'forged',
        amount: 100,
      }),
    ).toEqual({ event: 'enter_store', source: 'bookmark', flowId: undefined, skuId: undefined, asset: undefined });
  });
  it('关联标识只接受固定格式，服务端才能生成结算事件', () => {
    expect(
      normalizeEntitlementEvent({ event: 'select_item', skuId: 'ai-6', flowId: 'https://example.com/private' }).flowId,
    ).toBeUndefined();
    expect(normalizeEntitlementEvent({ event: 'checkout_created' }, true)?.event).toBe('checkout_created');
  });
});
