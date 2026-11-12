import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import GrowthTodayPanel from './GrowthTodayPanel.vue';
import type { Growth, Quest, QuestBonus, StreakMilestone } from '@/composables/useGrowth';
import type { OverviewNextStep } from '@/utils/growthOverview';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

const baseGrowth = (patch: Partial<Growth> = {}): Growth =>
  ({
    exp: 4860,
    level: 6,
    name: '进士',
    spaceMb: 2560,
    aiTokenDaily: 200000,
    streak: 4,
    protectCards: 1,
    makeupDays: [],
    checkedInToday: false,
    levelStartExp: 4000,
    nextLevelExp: 5800,
    expToNext: 940,
    progress: 48,
    isMax: false,
    dailyExp: 12,
    dailyCap: 200,
    ...patch,
  }) as Growth;
const bonus = (patch: Partial<QuestBonus> = {}): QuestBonus => ({
  exp: 10,
  points: 10,
  claimed: false,
  claimable: false,
  stages: [
    { key: 'basic', required: 2, exp: 5, points: 5, claimed: false, claimable: false },
    { key: 'complete', required: 3, exp: 10, points: 10, claimed: false, claimable: false },
  ],
  ...patch,
});

function mount(
  props: {
    growth?: Growth;
    quests?: Quest[];
    bonus?: QuestBonus;
    milestones?: StreakMilestone[];
    claimableCount?: number;
    nextStep?: OverviewNextStep | null;
    readOnly?: boolean;
    stacked?: boolean;
    totalCheckins?: number;
    receipt?: Record<string, unknown> | null;
  } = {},
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
) {
  const events: Array<[string, unknown?]> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(GrowthTodayPanel, {
        growth: props.growth ?? baseGrowth(),
        quests: props.quests ?? [
          { key: 'checkin', done: false },
          { key: 'daily_bookmark', done: true, cur: 1, target: 1 },
          { key: 'daily_todo_create', done: false, cur: 0, target: 1 },
        ],
        bonus: props.bonus ?? bonus(),
        checkinDays: ['20261102', '20261103'],
        totalCheckins: props.totalCheckins ?? 41,
        maxStreak: 12,
        milestones: props.milestones ?? [],
        claimableCount: props.claimableCount ?? 1,
        nextStep: props.nextStep ?? null,
        readOnly: props.readOnly ?? false,
        stacked: props.stacked ?? false,
        receipt: props.receipt ?? null,
        'onDismiss-receipt': () => events.push(['dismiss-receipt']),
        onCheckin: () => events.push(['checkin']),
        'onClaim-all': () => events.push(['claim-all']),
        'onClaim-stage': () => events.push(['claim-stage']),
        onQuest: (key: string) => events.push(['quest', key]),
        'onNext-step': () => events.push(['next-step']),
        'onOpen-calendar': () => events.push(['open-calendar']),
      }),
  });
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];
  const button = (text: string) => buttons().find((item) => item.textContent?.trim() === text);
  return { host, events, buttons, button };
}

describe('成长概览「今天」', () => {
  it('未签到时只有签到是实心主按钮，一键领取退为次要操作', () => {
    const { host, button, events } = mount();
    const primaries = [...host.querySelectorAll('.b_btn.primary_btn')];
    expect(button('签到')).toBeTruthy();
    expect(button('一键领取 1 项')?.classList.contains('is-secondary')).toBe(true);
    expect(primaries.map((item) => item.textContent?.trim())).toEqual(['签到']);
    button('签到')!.click();
    expect(events).toContainEqual(['checkin']);
  });

  it('签到后签到格显示已签到，一键领取成为主操作', () => {
    const { host, button } = mount({
      growth: baseGrowth({ checkedInToday: true, streak: 5 }),
      quests: [
        { key: 'checkin', done: true },
        { key: 'daily_bookmark', done: true, cur: 1, target: 1 },
        { key: 'daily_todo_create', done: false, cur: 0, target: 1 },
      ],
    });
    expect(button('签到')).toBeUndefined();
    expect(host.querySelector('.today-quest.is-checkin')?.textContent).toContain('已签到');
    expect(button('一键领取 1 项')?.classList.contains('primary_btn')).toBe(true);
  });

  it('已达成的阶段奖励可以直接在进度条上领取，只读代管时不提供领取与前往', () => {
    const ready = bonus({
      stages: [
        { key: 'basic', required: 2, exp: 5, points: 5, claimed: false, claimable: true },
        { key: 'complete', required: 3, exp: 10, points: 10, claimed: false, claimable: false },
      ],
    });
    const quests: Quest[] = [
      { key: 'checkin', done: true },
      { key: 'daily_bookmark', done: true, cur: 1, target: 1 },
      { key: 'daily_todo_create', done: false, cur: 0, target: 1 },
    ];
    const first = mount({ bonus: ready, quests, growth: baseGrowth({ checkedInToday: true }) });
    const gift = first.host.querySelector<HTMLButtonElement>('button.today-track__node');
    expect(gift?.textContent).toContain('可领取');
    gift!.click();
    expect(first.events).toContainEqual(['claim-stage']);
    first.button('去完成')!.click();
    expect(first.events).toContainEqual(['quest', 'daily_todo_create']);
    cleanup?.();

    const readOnly = mount({ bonus: ready, quests, readOnly: true, growth: baseGrowth({ checkedInToday: true }) });
    expect(readOnly.host.querySelector('button.today-track__node')).toBeNull();
    expect(readOnly.button('去完成')).toBeUndefined();
    expect(readOnly.host.querySelector('.today-track__node.is-ready')?.textContent).toContain('可领取');
  });

  it('只展示下一个未发放的连签里程碑及其真实奖励', () => {
    const { host } = mount({
      growth: baseGrowth({ streak: 18, checkedInToday: true }),
      milestones: [
        { days: 7, points: 50, storageMb: 0, cards: 1, reached: true, granted: true },
        { days: 30, points: 300, storageMb: 512, cards: 2, reached: false, granted: true },
        { days: 100, points: 600, storageMb: 1024, cards: 3, reached: false, granted: false },
      ],
    });
    const text = host.querySelector('.today-milestone')?.textContent || '';
    expect(text).toContain('100 天连签里程碑');
    expect(text).toContain('还差 82 天');
    expect(text).toContain('+600 积分 · +1 GB 永久空间 · 补签卡 ×3');
  });

  it('下一步按新手路线或周挑战展示，并保留打开签到日历入口', () => {
    const starter = mount({ nextStep: { kind: 'starter', key: 'profile_avatar', action: 'profile', exp: 50 } });
    expect(starter.host.querySelector('.today-next')?.textContent).toContain('下一项：完善个人头像');
    expect(starter.host.querySelector('.today-next')?.textContent).toContain('+50 EXP');
    starter.button('现在去做')!.click();
    starter.button('签到日历')!.click();
    expect(starter.events).toEqual(expect.arrayContaining([['next-step'], ['open-calendar']]));
    cleanup?.();

    const weekly = mount(
      { nextStep: { kind: 'weekly', key: 'wk_bookmark', metric: 'bookmark', current: 3, target: 5, points: 40 } },
      'en-US',
    );
    expect(weekly.host.querySelector('.today-next')?.textContent).toContain('3/5');
    expect(weekly.host.querySelector('.today-next__tag')?.textContent).toBe('This week');
  });

  it('首次使用时签到格说明首次签到，移动端把一键领取放到进度条下方整行', async () => {
    const { host } = mount({
      growth: baseGrowth({ streak: 0, checkedInToday: true, level: 1 }),
      totalCheckins: 0,
      stacked: true,
    });
    await nextTick();
    expect(host.querySelector('.today-panel__head .today-panel__claim')).toBeNull();
    expect(host.querySelector('.today-panel__claim--block')?.textContent).toContain('一键领取 1 项');
    expect(host.querySelector('.today-streak small')?.textContent).toBe('首次签到后开始累计');
  });
  it('领取回执在原位展示摘要与逐项奖励，可手动关闭', () => {
    const receipt = {
      id: 1,
      single: false,
      summary: '已领取 2 项',
      sources: '成长任务 ×1、成就 ×1',
      rewards: [
        { kind: 'exp', value: 30, label: '经验 +30' },
        { kind: 'points', value: 10, label: '积分 +10' },
      ],
    };
    const desktop = mount({ receipt, claimableCount: 0, growth: baseGrowth({ checkedInToday: true }) });
    const box = desktop.host.querySelector('.today-panel__head .claim-receipt');
    expect(box?.getAttribute('role')).toBe('status');
    // 不再显示「已领取 N 项」，来源与条数留在悬停说明和读屏文字里。
    expect(box?.getAttribute('title')).toBe('已领取：成长任务 ×1、成就 ×1');
    expect(box?.querySelector('.claim-receipt__summary')).toBeNull();
    expect(box?.querySelector('.claim-receipt__sr')?.textContent).toBe('已领取：成长任务 ×1、成就 ×1');
    expect([...box!.querySelectorAll('.claim-receipt__reward')].map((item) => item.textContent?.trim())).toEqual([
      '经验 +30',
      '积分 +10',
    ]);
    desktop.host.querySelector<HTMLButtonElement>('.claim-receipt__close')!.click();
    expect(desktop.events).toContainEqual(['dismiss-receipt']);
    cleanup?.();

    const mobile = mount({ receipt, stacked: true, claimableCount: 0 });
    expect(mobile.host.querySelector('.today-panel__head .claim-receipt')).toBeNull();
    expect(mobile.host.querySelector('.claim-receipt--block .claim-receipt__reward')?.textContent).toContain(
      '经验 +30',
    );
  });
  it('没有可列出的奖励时，回执才显示文字摘要', () => {
    const { host } = mount({
      receipt: { id: 2, single: true, summary: '已领取日常任务奖励', sources: '日常任务 ×1', rewards: [] },
      claimableCount: 0,
      growth: baseGrowth({ checkedInToday: true }),
    });
    expect(host.querySelector('.claim-receipt__summary')?.textContent).toBe('已领取日常任务奖励');
    expect(host.querySelector('.claim-receipt__rewards')).toBeNull();
  });
});
