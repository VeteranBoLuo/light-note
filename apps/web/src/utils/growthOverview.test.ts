import { describe, expect, it } from 'vitest';
import type { Achievement, GrowthNextAction, StreakMilestone, WeeklyChallenge } from '@/composables/useGrowth';
import {
  aggregateTimeline,
  buildWeekStrip,
  pickNextStreakMilestone,
  pickOverviewNextStep,
  rankAchievements,
} from './growthOverview';

const milestone = (days: number, granted = false): StreakMilestone => ({
  days,
  points: days,
  storageMb: 0,
  cards: 0,
  reached: false,
  granted,
});

describe('成长概览：连签里程碑', () => {
  it('跳过已发放与已越过的档位，旧后端缺少发放标记时按未发放处理', () => {
    const list = [milestone(30, true), milestone(7, true), milestone(100), milestone(365)];
    expect(pickNextStreakMilestone(list, 18)?.days).toBe(100);
    expect(pickNextStreakMilestone([milestone(7), milestone(30)], 0)?.days).toBe(7);
    expect(pickNextStreakMilestone([{ ...milestone(7), granted: undefined }], 3)?.days).toBe(7);
    expect(pickNextStreakMilestone([milestone(7), milestone(30)], 40)).toBeNull();
    expect(pickNextStreakMilestone(undefined, 0)).toBeNull();
  });
});

describe('成长概览：本周签到条', () => {
  const now = new Date(2026, 10, 6, 9, 30); // 2026-11-06 周五

  it('从周日开始，按逐日明细标记已签、今天、可补签、普通漏签和未来', () => {
    const days = buildWeekStrip({
      now,
      checkinDays: ['20261102', '20261103', '20261104', '20261105'],
      makeupDays: ['20261101'],
      checkedInToday: false,
      streak: 4,
    });
    expect(days.map((day) => day.key)).toEqual([
      '20261101',
      '20261102',
      '20261103',
      '20261104',
      '20261105',
      '20261106',
      '20261107',
    ]);
    expect(days.map((day) => day.state)).toEqual([
      'makeup',
      'checked',
      'checked',
      'checked',
      'checked',
      'pending',
      'future',
    ]);
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual([6]);
  });

  it('未在补签窗口内的漏签保持中性，今天已签即使明细尚未刷新也点亮', () => {
    const days = buildWeekStrip({ now, checkinDays: ['20261105'], makeupDays: [], checkedInToday: true, streak: 2 });
    expect(days[0].state).toBe('missed');
    expect(days[5].state).toBe('checked');
  });

  it('免账本账号没有逐日明细时，按今天已签和连签天数回推', () => {
    const days = buildWeekStrip({ now, checkinDays: [], checkedInToday: true, streak: 3 });
    expect(days.map((day) => day.state)).toEqual([
      'missed',
      'missed',
      'missed',
      'checked',
      'checked',
      'checked',
      'future',
    ]);
  });
});

describe('成长概览：最近动态合并', () => {
  it('同一天连续的同类新建记录合并，跨天、不同类型和升级里程碑保持独立', () => {
    const entries = aggregateTimeline([
      { source: 'file', name: 'a.png', amount: 0, meta: null, time: '2026-11-05 10:00:00' },
      { source: 'file', name: 'b.png', amount: 0, meta: null, time: '2026-11-05 09:00:00' },
      { source: 'file', name: 'c.png', amount: 0, meta: null, time: '2026-11-05 08:00:00' },
      { source: 'note', name: '周报', amount: 0, meta: null, time: '2026-11-05 07:00:00' },
      { source: 'milestone', name: null, amount: 0, meta: { to: 6 }, time: '2026-11-05 06:00:00' },
      { source: 'milestone', name: null, amount: 0, meta: { to: 5 }, time: '2026-11-05 05:00:00' },
      { source: 'note', name: '旧笔记', amount: 0, meta: null, time: '2026-11-04 23:00:00' },
    ]);
    expect(entries.map(({ source, name, count }) => [source, name, count])).toEqual([
      ['file', 'a.png', 3],
      ['note', '周报', 1],
      ['milestone', null, 1],
      ['milestone', null, 1],
      ['note', '旧笔记', 1],
    ]);
  });
});

describe('成长概览：下一步只补充每日任务之外的一项', () => {
  const action = (type: string, key: string, extra: Partial<GrowthNextAction> = {}): GrowthNextAction => ({
    type,
    key,
    action: `open_${key}`,
    progress: null,
    ...extra,
  });
  const challenge = (key: string, metric: string, cur: number, target: number, done = false): WeeklyChallenge => ({
    key,
    metric,
    cur,
    target,
    reward: 40,
    done,
    claimed: false,
    claimable: false,
  });

  it('未完成的新手路线优先，常驻的任务中心入口不算新手任务', () => {
    expect(
      pickOverviewNextStep(
        [
          action('daily_quest', 'daily_note'),
          action('growth_task', 'profile_avatar', { reward: { exp: 50, points: 0 } }),
        ],
        [challenge('wk_note', 'note', 2, 3)],
      ),
    ).toEqual({ kind: 'starter', key: 'profile_avatar', action: 'open_profile_avatar', exp: 50 });
    expect(pickOverviewNextStep([action('growth_task', 'task_center')], [])).toBeNull();
  });

  it('只剩每日任务时改推最接近完成的周挑战，没有待整理资源时不推整理挑战', () => {
    const challenges = [
      challenge('wk_bookmark', 'bookmark', 1, 5),
      challenge('wk_organize', 'organize', 4, 5),
      challenge('wk_note', 'note', 1, 3),
      challenge('wk_checkin', 'checkin', 5, 5, true),
    ];
    const daily = [action('daily_quest', 'daily_note'), action('daily_quest', 'daily_file')];
    expect(pickOverviewNextStep(daily, challenges, { pendingResourceCount: 3 })).toMatchObject({
      kind: 'weekly',
      key: 'wk_organize',
    });
    expect(pickOverviewNextStep(daily, challenges, { pendingResourceCount: 0 })).toEqual({
      kind: 'weekly',
      key: 'wk_note',
      metric: 'note',
      current: 1,
      target: 3,
      points: 40,
    });
    expect(pickOverviewNextStep(daily, [challenge('wk_checkin', 'checkin', 5, 5, true)])).toBeNull();
  });
});

describe('成长概览：成就挑选', () => {
  const achievement = (key: string, unlocked: boolean, cur: number, target: number, unlockedAt: string | null = null) =>
    ({ key, group: 'create', unlocked, cur, target, unlockedAt }) as Achievement;

  it('最近解锁按时间倒序，最接近达成按进度与目标排序', () => {
    const result = rankAchievements([
      achievement('a', true, 10, 10, '2026-10-01T00:00:00Z'),
      achievement('b', true, 20, 20, '2026-11-01T00:00:00Z'),
      achievement('c', false, 9, 10),
      achievement('d', false, 1, 2),
      achievement('e', false, 45, 50),
    ]);
    expect(result.recent.map((item) => item.key)).toEqual(['b', 'a']);
    expect(result.near.map((item) => item.key)).toEqual(['c', 'e', 'd']);
  });
});
