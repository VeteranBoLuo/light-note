import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readEntitlementJourney, saveEntitlementJourney } from './entitlementJourney';
describe('购买返回上下文', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });
  it('保存相同账号输入，账号切换清除并防止再次读取', () => {
    saveEntitlementJourney({ userId: 'a', source: 'note', asset: 'ai', returnPath: '/noteLibrary', prompt: 'draft' });
    expect(readEntitlementJourney('a')?.prompt).toBe('draft');
    expect(readEntitlementJourney('b')).toBeNull();
    expect(readEntitlementJourney('a')).toBeNull();
  });
  it('到期失效，拒绝外部跳转', () => {
    vi.useFakeTimers();
    saveEntitlementJourney({ userId: 'a', source: 'note', asset: 'ai', returnPath: '/noteLibrary' });
    vi.advanceTimersByTime(86400001);
    expect(readEntitlementJourney('a')).toBeNull();
    saveEntitlementJourney({ userId: 'a', source: 'note', asset: 'ai', returnPath: '//evil.example' });
    expect(readEntitlementJourney('a')).toBeNull();
  });
});
