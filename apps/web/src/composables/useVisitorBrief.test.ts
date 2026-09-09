import { effectScope, reactive, nextTick } from 'vue';
import { describe, it, expect, vi } from 'vitest';
import { useVisitorBrief } from './useVisitorBrief';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/dailyBriefApi', () => ({ getVisitorBrief: mocks.get }));
describe('visitor brief request ownership', () => {
  it('ignores a response from a previous identity and retains current content after a refresh error', async () => {
    let oldResolve: any;
    mocks.get
      .mockImplementationOnce(() => new Promise((r) => (oldResolve = r)))
      .mockResolvedValueOnce({
        status: 200,
        data: { kind: 'visitor_example', dataDate: 'current', stale: false, brief: null },
      });
    const identity = reactive({ owner: 'old' }),
      scope = effectScope();
    const value = scope.run(() =>
      useVisitorBrief({ enabled: () => true, owner: () => identity.owner, locale: () => 'zh-CN' }),
    )!;
    try {
      identity.owner = 'new';
      await nextTick();
      await vi.waitFor(() => expect(value.state.value?.dataDate).toBe('current'));
      oldResolve({ status: 200, data: { kind: 'visitor_example', dataDate: 'private-old', brief: null } });
      await nextTick();
      expect(value.state.value?.dataDate).toBe('current');
      mocks.get.mockRejectedValueOnce(new Error('network'));
      await value.refresh();
      expect(value.failed.value).toBe(true);
      expect(value.state.value?.dataDate).toBe('current');
    } finally {
      scope.stop();
      vi.resetAllMocks();
    }
  });
});
