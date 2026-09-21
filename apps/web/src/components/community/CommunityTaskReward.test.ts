import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ user: null as any, claim: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/composables/useGrowth', () => ({ useGrowth: () => ({ claimAllRewards: mocks.claim }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }) }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
import Reward from './CommunityTaskReward.vue';
let cleanup = () => {};
afterEach(() => {
  cleanup();
  mocks.claim.mockReset();
});
it.each(['active', 'claimable', 'claimed'])('shows %s reward state without allowing a preview claim', async (state) => {
  mocks.user = reactive({ id: 'subject', role: 'user', adminContext: { id: 'context' } });
  const app = createApp(Reward, { topic: { slug: 'autumn', reward: { exp: 20, points: 100, state } } as any });
  const host = document.createElement('div');
  app.mount(host);
  cleanup = () => app.unmount();
  expect(host.textContent).toContain('100');
  expect(host.textContent).toContain('20');
  expect(host.textContent).toContain('community.feed.reward_' + state);
  expect(host.querySelector('button')).toBeNull();
  expect(mocks.claim).not.toHaveBeenCalled();
  mocks.user.adminContext = null;
  await nextTick();
  if (state === 'claimable') {
    mocks.claim.mockResolvedValue({
      status: 200,
      data: { ok: true, receipts: [{ key: 'autumn', status: 'claimed' }] },
    });
    host.querySelector('button')!.click();
    await nextTick();
    await nextTick();
    expect(mocks.claim).toHaveBeenCalledWith(['community'], ['autumn']);
    expect(host.textContent).toContain('community.feed.reward_claimed');
    mocks.user.adminContext = { id: 'another-preview' };
    await nextTick();
    expect(host.textContent).toContain('community.feed.reward_claimable');
  }
});
