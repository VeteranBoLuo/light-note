import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./AchievementEmblem.vue', () => ({
  default: {
    props: ['achievementKey', 'animated'],
    template: '<span :data-achievement="achievementKey" :data-animated="animated" />',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
import MilestoneLadder from './MilestoneLadder.vue';
import zh from '@/i18n/locales/zh-CN';
let cleanup: () => void;
afterEach(() => cleanup?.());
function mount(streak: number, animated = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(MilestoneLadder, {
    currentStreak: streak,
    animated,
    milestones: [7, 30, 100, 365].map((days) => ({
      days,
      points: 50,
      cards: 1,
      storageMb: 0,
      reached: streak >= days,
    })),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}
describe('current streak milestones', () => {
  it.each([
    [0, 0],
    [7, 0],
    [30, 100 / 3],
    [83, ((1 + 53 / 70) / 3) * 100],
    [100, 200 / 3],
    [365, 100],
    [500, 100],
  ])('interpolates %i days without crossing the next station', (days, pct) => {
    const host = mount(days);
    expect(parseFloat((host.querySelector('.ml-line span') as HTMLElement).style.width)).toBeCloseTo(pct);
    expect(host.querySelectorAll('.ml-node.reached')).toHaveLength([7, 30, 100, 365].filter((n) => n <= days).length);
  });
  it('shows the next threshold and keeps reached distinct from paid rewards', () => {
    const host = mount(83);
    expect(host.textContent).toContain('距 100 天还差 17 天');
    expect(host.textContent).toContain('补签不发里程碑奖励');
    expect(host.textContent).toContain('达成状态仅表示当前连签天数');
    expect(host.textContent).not.toContain('已领取');
  });
  it.each([
    [100, true, 'false'],
    [365, true, 'true'],
    [365, false, 'false'],
  ] as const)('only animates the earned milestone and honors preferences (%i, %s)', (streak, animated, expected) => {
    const host = mount(streak, animated);
    expect(host.querySelector('[data-achievement="streak_365"]')?.getAttribute('data-animated')).toBe(expected);
  });
});
