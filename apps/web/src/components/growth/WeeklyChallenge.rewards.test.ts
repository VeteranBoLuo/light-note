import { createApp, nextTick, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
const state = vi.hoisted(() => ({ weekly: null as any }));
vi.mock('@/composables/useGrowth.ts', () => ({
  useGrowth: () => ({ weekly: state.weekly, loadWeekly: async () => state.weekly.value, claimingRewards: false }),
}));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, args?: any) => (key === 'growth.weeklyReward' ? `+${args.n} 积分` : key),
    te: () => false,
  }),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: {} }));
import Weekly from './WeeklyChallenge.vue';
let cleanup = () => {};
afterEach(() => cleanup());
it('未完成、待领取、已领取三种状态均展示各自奖励', async () => {
  state.weekly = ref({
    earnedPoints: 40,
    totalPoints: 120,
    challenges: [
      { key: 'one', cur: 0, target: 1, reward: 20, done: false, claimable: false, claimed: false },
      { key: 'two', cur: 1, target: 1, reward: 60, done: true, claimable: true, claimed: false },
      { key: 'three', cur: 1, target: 1, reward: 40, done: true, claimable: false, claimed: true },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Weekly);
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await nextTick();
  await nextTick();
  expect([...host.querySelectorAll('.wc-main .wc-reward')].map((el) => el.textContent)).toEqual([
    '+20 积分',
    '+60 积分',
    '+40 积分',
  ]);
  expect(host.querySelector('.wc-claim')).not.toBeNull();
  expect(host.querySelector('.wc-claimed')).not.toBeNull();
});
