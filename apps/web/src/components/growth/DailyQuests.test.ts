import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import DailyQuests from './DailyQuests.vue';

const dailyQuestsSource = readFileSync(resolve(process.cwd(), 'src/components/growth/DailyQuests.vue'), 'utf8');
const mobileRenderingSource = readFileSync(
  resolve(process.cwd(), 'src/assets/css/mobile-rendering-baseline.less'),
  'utf8',
);

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountBonus(
  bonus: { exp: number; points: number; claimed: boolean; claimable: boolean; stages?: any[] },
  options: {
    locale?: 'zh-CN' | 'en-US';
    questKey?: string;
    showExperienceSources?: boolean;
    dailyExp?: number;
    dailyCap?: number;
    dailyCapReached?: boolean;
    showClaimAction?: boolean;
  } = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  const locale = options.locale ?? 'zh-CN';
  const quests = [
    { key: 'checkin', done: true },
    { key: 'daily_bookmark', done: true, random: true, cur: 1, target: 1 },
    { key: options.questKey ?? 'daily_todo_create', done: false, random: true, cur: 0, target: 1 },
  ];
  const app = createApp({
    setup: () => () =>
      h(DailyQuests, {
        quests,
        bonus,
        showExperienceSources: options.showExperienceSources ?? true,
        dailyExp: options.dailyExp ?? 86,
        dailyCap: options.dailyCap ?? 200,
        dailyCapReached: options.dailyCapReached ?? false,
        showClaimAction: options.showClaimAction ?? true,
      }),
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
    randomCount: host.querySelectorAll('.dq-random').length,
    experienceGuide: host.querySelector('.dq-exp-guide')?.textContent?.replace(/\s+/g, ' ').trim(),
    experienceCap: host.querySelector('.dq-exp-cap')?.textContent?.replace(/\s+/g, ' ').trim(),
    experienceCapPercent: host.querySelector('.dq-exp-cap [role="progressbar"]')?.getAttribute('aria-valuenow'),
    claimAction: host.querySelector('.dq-bonus'),
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
        { key: 'basic', required: 2, exp: 5, points: 10, claimed: false, claimable: true },
        { key: 'complete', required: 3, exp: 10, points: 20, claimed: false, claimable: false },
      ],
    });
    expect(result.labels).toEqual(['完成每日签到', '收藏一条书签', '创建一个待办']);
    expect(result.stages).toEqual(['完成 2/3+5 经验 · +10 积分可领取', '完成 3/3+10 经验 · +20 积分2/3']);
    expect(result.randomCount).toBe(0);
    expect(result.experienceGuide).toContain('经验获取来源');
    expect(result.experienceGuide).toContain('每日签到+5~10 经验 / 天');
    expect(result.experienceGuide).toContain('新增书签 / 笔记 / 文件每类前 3 条，每条：书签 +10 · 文件 +12 · 笔记 +15');
    expect(result.experienceGuide).toContain('同一类型当天新增超过 3 条后，单条经验逐步降低，最低 +1');
    expect(result.experienceGuide).toContain('每日任务阶梯+5 / +10 经验 / 天');
    expect(result.experienceCap).toContain('每日经验上限今日 86 / 200');
    expect(result.experienceCap).toContain('一次性成长奖励单独计算，不占每日额度');
    expect(result.experienceCapPercent).toBe('43');
  });

  it('达到每日上限后明确告知不再增长，一次性奖励仍可领取', () => {
    const result = mountBonus(
      {
        exp: 15,
        points: 30,
        claimed: false,
        claimable: false,
        stages: [{ key: 'complete', required: 3, exp: 10, points: 20, claimed: true, claimable: false }],
      },
      { dailyExp: 200, dailyCap: 200, dailyCapReached: true },
    );

    expect(result.experienceCap).toContain('今日 200 / 200');
    expect(result.experienceCap).toContain('继续新增内容不再增加每日经验');
    expect(result.experienceCap).toContain('一次性奖励仍可正常领取');
    expect(result.experienceCapPercent).toBe('100');
  });

  it('英语环境展示待办任务文案而不是原始多语言 key', () => {
    const result = mountBonus({ exp: 0, points: 30, claimed: false, claimable: false }, { locale: 'en-US' });
    expect(result.labels).toEqual(['Check in for the day', 'Save one bookmark', 'Create one to-do']);
    expect(result.labels.join(' ')).not.toContain('growth.quest_');
  });

  it('后端出现未知任务键时展示本地化兜底文案', () => {
    const result = mountBonus({ exp: 0, points: 30, claimed: false, claimable: false }, { questKey: 'future_task' });
    expect(result.labels.at(-1)).toBe('完成一项每日任务');
    expect(result.labels.join(' ')).not.toContain('growth.quest_');
  });

  it('root 阶梯只显示实际可领取的积分', () => {
    const result = mountBonus({
      exp: 0,
      points: 30,
      claimed: false,
      claimable: true,
      stages: [{ key: 'basic', required: 2, exp: 0, points: 10, claimed: false, claimable: true }],
    });
    expect(result.stages).toEqual(['完成 2/3+10 积分可领取']);
    expect(result.experienceGuide).toContain('当前账号按满级管理权益计算，不累计经验');
  });

  it('已领取阶段保持明确状态', () => {
    const result = mountBonus({
      exp: 15,
      points: 30,
      claimed: false,
      claimable: false,
      stages: [{ key: 'basic', required: 2, exp: 5, points: 10, claimed: true, claimable: false }],
    });
    expect(result.stages).toEqual(['完成 2/3+5 经验 · +10 积分已领取']);
  });

  it('工作台可以隐藏经验来源说明，保持紧凑卡片布局', () => {
    const result = mountBonus(
      { exp: 15, points: 30, claimed: false, claimable: false },
      { showExperienceSources: false },
    );
    expect(result.experienceGuide).toBeUndefined();
  });

  it('外层已提供一键领取时可以隐藏重复的单项领取入口', () => {
    const result = mountBonus({ exp: 0, points: 15, claimed: false, claimable: true }, { showClaimAction: false });
    expect(result.claimAction).toBeNull();
  });
});

describe('每日任务视觉状态契约', () => {
  it('随机任务只影响服务端选题，不向用户展示无行动价值的随机标记', () => {
    expect(dailyQuestsSource).not.toContain('class="dq-random"');
    expect(dailyQuestsSource).not.toContain('.dq-random {');
  });

  it('完成与领取状态保持统一卡片表面，只在图标和状态文字使用语义色', () => {
    expect(dailyQuestsSource).toMatch(
      /\.dq-item\s*\{[\s\S]*?border:\s*1px solid color-mix\([\s\S]*?var\(--surface-border-color\)[\s\S]*?background:\s*color-mix\([\s\S]*?var\(--card-background\)/,
    );
    expect(dailyQuestsSource).not.toMatch(/\.dq-item\.done\s*\{[\s\S]*?(?:background|border-color):/);
    expect(dailyQuestsSource).toMatch(
      /\.dq-item\.done \.dq-check\s*\{[\s\S]*?border-color:\s*var\(--success-color\);[\s\S]*?color:\s*var\(--success-color\)/,
    );
    expect(dailyQuestsSource).toMatch(
      /\.dq-stage\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?background:\s*var\(--card-background\)/,
    );
    expect(dailyQuestsSource).not.toMatch(/\.dq-stage\.(?:claimable|claimed)\s*\{[\s\S]*?(?:background|border-color):/);
    expect(dailyQuestsSource).toMatch(
      /\.dq-stage\.claimable \.dq-stage-state\s*\{[\s\S]*?color:\s*var\(--warning-color\)/,
    );
    expect(dailyQuestsSource).toMatch(
      /\.dq-stage\.claimed \.dq-stage-state\s*\{[\s\S]*?color:\s*var\(--success-color\)/,
    );
    expect(dailyQuestsSource).toMatch(
      /\.dq-bonus\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?background:\s*var\(--card-background\)/,
    );
    expect(mobileRenderingSource).toMatch(
      /\.growth-page \.dq-item\.done \.dq-check\s*\{[\s\S]*?border-color:\s*var\(--success-color\) !important/,
    );
  });
});
