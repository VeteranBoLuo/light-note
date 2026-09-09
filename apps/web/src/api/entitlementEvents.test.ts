import { describe, expect, it, vi } from 'vitest';
const post = vi.hoisted(() => vi.fn().mockResolvedValue({ status: 200 }));
vi.mock('@/http/request', () => ({ apiBasePost: post }));
vi.mock('@/utils/authStorage', () => ({ isAdminLoginPreview: () => false }));
import { recordEntitlementEvent } from './entitlementEvents';
describe('资源购买低敏事件', () => {
  it('即使调用方传入完整上下文，也只发送白名单字段', () => {
    recordEntitlementEvent('enter_store', {
      flowId: 'flow',
      source: 'note',
      asset: 'ai',
      prompt: 'private input',
      returnPath: '/private',
      userId: 'private-user',
    } as any);
    expect(post.mock.calls[0][1]).toEqual({
      event: 'enter_store',
      flowId: 'flow',
      source: 'note',
      asset: 'ai',
      skuId: undefined,
    });
  });
});
