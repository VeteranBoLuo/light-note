import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import DailyQuests from './DailyQuests.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountBonus(bonus: { exp: number; points: number; claimed: boolean; claimable: boolean }) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () => h(DailyQuests, { quests: [], bonus }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host.querySelector('.dq-bonus-text')?.textContent?.trim();
}

describe('每日任务整组奖励文案', () => {
  it('普通用户同时显示经验和积分', () => {
    expect(mountBonus({ exp: 15, points: 30, claimed: false, claimable: false })).toBe(
      '全部完成可领 +15 经验 · +30 积分',
    );
  });

  it('root 只显示实际可领取的积分', () => {
    expect(mountBonus({ exp: 0, points: 30, claimed: false, claimable: false })).toBe('全部完成可领 +30 积分');
  });

  it('领取后仍完整显示两类奖励', () => {
    expect(mountBonus({ exp: 15, points: 30, claimed: true, claimable: false })).toBe(
      '今日奖励已领取 +15 经验 · +30 积分',
    );
  });
});
