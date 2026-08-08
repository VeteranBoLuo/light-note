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

function mountBonus(bonus: { exp: number; points: number; claimed: boolean; claimable: boolean; stages?: any[] }) {
  const host = document.createElement('div');
  document.body.append(host);
  const quests = [
    { key: 'checkin', done: true },
    { key: 'create', done: true },
    { key: 'daily_todo', done: false, random: true, cur: 0, target: 1 },
  ];
  const app = createApp({
    setup: () => () => h(DailyQuests, { quests, bonus }),
  });
  app.component('OriginalIcon', { render: () => h('span') });
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
  return {
    stages: [...host.querySelectorAll('.dq-stage')].map((node) => node.textContent?.replace(/\s+/g, ' ').trim()),
    random: host.querySelector('.dq-random')?.textContent?.trim(),
  };
}

describe('每日任务阶梯奖励', () => {
  it('普通用户分别展示 2/3 与 3/3 奖励', () => {
    const result = mountBonus({
      exp: 15,
      points: 30,
      claimed: false,
      claimable: true,
      stages: [
        { key: 'basic', required: 2, exp: 10, points: 20, claimed: false, claimable: true },
        { key: 'complete', required: 3, exp: 5, points: 10, claimed: false, claimable: false },
      ],
    });
    expect(result.stages).toEqual(['完成 2/3+10 经验 · +20 积分可领取', '完成 3/3+5 经验 · +10 积分2/3']);
    expect(result.random).toBe('今日随机');
  });

  it('root 阶梯只显示实际可领取的积分', () => {
    const result = mountBonus({
      exp: 0,
      points: 30,
      claimed: false,
      claimable: true,
      stages: [{ key: 'basic', required: 2, exp: 0, points: 20, claimed: false, claimable: true }],
    });
    expect(result.stages).toEqual(['完成 2/3+20 积分可领取']);
  });

  it('已领取阶段保持明确状态', () => {
    const result = mountBonus({
      exp: 15,
      points: 30,
      claimed: false,
      claimable: false,
      stages: [{ key: 'basic', required: 2, exp: 10, points: 20, claimed: true, claimable: false }],
    });
    expect(result.stages).toEqual(['完成 2/3+10 经验 · +20 积分已领取']);
  });
});
