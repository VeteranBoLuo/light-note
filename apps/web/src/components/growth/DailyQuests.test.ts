import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import DailyQuests from './DailyQuests.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountBonus(
  bonus: { exp: number; points: number; claimed: boolean; claimable: boolean; stages?: any[] },
  options: { locale?: 'zh-CN' | 'en-US'; questKey?: string } = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  const locale = options.locale ?? 'zh-CN';
  const quests = [
    { key: 'checkin', done: true },
    { key: 'create', done: true },
    { key: options.questKey ?? 'daily_todo', done: false, random: true, cur: 0, target: 1 },
  ];
  const app = createApp({
    setup: () => () => h(DailyQuests, { quests, bonus }),
  });
  app.component('OriginalIcon', { render: () => h('span') });
  app.use(
    createI18n({
      legacy: false,
      locale,
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    labels: [...host.querySelectorAll('.dq-label')].map((node) => node.childNodes[0]?.textContent?.trim()),
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
    expect(result.labels).toEqual(['完成每日签到', '新增一条内容', '完成一个待办']);
    expect(result.stages).toEqual(['完成 2/3+10 经验 · +20 积分可领取', '完成 3/3+5 经验 · +10 积分2/3']);
    expect(result.random).toBe('今日随机');
  });

  it('英语环境展示待办任务文案而不是原始多语言 key', () => {
    const result = mountBonus(
      { exp: 0, points: 30, claimed: false, claimable: false },
      { locale: 'en-US' },
    );
    expect(result.labels).toEqual(['Check in for the day', 'Create one item', 'Complete one to-do']);
    expect(result.labels.join(' ')).not.toContain('growth.quest_');
  });

  it('后端出现未知任务键时展示本地化兜底文案', () => {
    const result = mountBonus(
      { exp: 0, points: 30, claimed: false, claimable: false },
      { questKey: 'future_task' },
    );
    expect(result.labels.at(-1)).toBe('完成一项每日任务');
    expect(result.labels.join(' ')).not.toContain('growth.quest_');
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
