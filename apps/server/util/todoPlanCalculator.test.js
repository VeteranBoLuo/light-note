import { describe, expect, it } from 'vitest';
import {
  calculateTodoPlan,
  TODO_PLAN_MAX_FINITE_OCCURRENCES,
  TODO_PLAN_MAX_REMINDER_JOBS,
  TODO_PLAN_MAX_ROLLING_BATCH,
} from './todoPlanCalculator.js';

const NOW = new Date('2026-08-06T00:00:00.000Z');

function dailyPlan(overrides = {}) {
  return {
    title: '每日 PPT 网课学习',
    priority: 1,
    timing: {
      timezone: 'Asia/Shanghai',
      anchorDate: '2026-08-05',
      startTime: '14:00',
      dueTime: '17:30',
      dueDayOffset: 0,
    },
    plan: {
      type: 'scheduled',
      frequency: 'daily',
      interval: 1,
      end: { mode: 'count', count: 30 },
      pastPolicy: 'keep_overdue',
    },
    reminder: {
      mode: 'once_per_instance',
      trigger: { type: 'at_start' },
      channels: ['in_app', 'email'],
      targetEmail: 'owner@example.com',
      quietPolicy: 'defer_once',
    },
    ...overrides,
  };
}

describe('todoPlanCalculator', () => {
  it('一次性任务允许没有开始和截止时间，且不会凭空生成提醒时刻', () => {
    const preview = calculateTodoPlan(
      {
        title: '整理想法',
        timing: { timezone: 'Asia/Shanghai', anchorDate: null, startTime: null, dueTime: null },
        plan: { type: 'once' },
        reminder: { mode: 'none' },
      },
      { now: NOW },
    );

    expect(preview).toMatchObject({ occurrenceCount: 1, reminderJobCount: 0, requiredChoices: [] });
    expect(preview.firstOccurrence).toMatchObject({ occurrenceDate: null, startAt: null, dueAt: null });
  });

  it('无日期任务开启提醒时必须先补充具体日期和时间', () => {
    expect(() =>
      calculateTodoPlan(
        {
          title: '整理想法',
          timing: { timezone: 'Asia/Shanghai', anchorDate: null, startTime: null, dueTime: null },
          plan: { type: 'once' },
          reminder: {
            mode: 'once_per_instance',
            trigger: { type: 'fixed_time', fixedTime: '09:00' },
            channels: ['in_app'],
          },
        },
        { now: NOW },
      ),
    ).toThrow(/具体日期和时间/);
  });

  it('以次数为事实源生成 8 月 5 日到 9 月 3 日共 30 项', () => {
    const preview = calculateTodoPlan(dailyPlan(), { now: NOW });
    expect(preview.occurrenceCount).toBe(30);
    expect(preview.firstOccurrence).toMatchObject({
      occurrenceDate: '2026-08-05',
      startAt: '2026-08-05 14:00:00',
      dueAt: '2026-08-05 17:30:00',
    });
    expect(preview.lastOccurrence).toMatchObject({
      occurrenceNo: 30,
      occurrenceDate: '2026-09-03',
      startAt: '2026-09-03 14:00:00',
      dueAt: '2026-09-03 17:30:00',
    });
    expect(preview.reminderMomentCount).toBe(30);
    expect(preview.reminderJobCount).toBe(60);
    expect(preview.nextReminderAt).toBe('2026-08-06 14:00:00');
  });

  it('过去首项未明确策略时要求用户选择，不静默平移', () => {
    const input = dailyPlan();
    delete input.plan.pastPolicy;
    const preview = calculateTodoPlan(input, { now: NOW });
    expect(preview.requiredChoices).toEqual(['pastPolicy']);
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'PAST_OCCURRENCE', count: 1, policy: null }),
    );
    expect(preview.firstOccurrence.occurrenceDate).toBe('2026-08-05');
  });

  it('支持保留逾期、从今天重启和跳过错过三种策略', () => {
    const keep = calculateTodoPlan(dailyPlan(), { now: NOW });
    const restart = calculateTodoPlan(
      dailyPlan({ plan: { ...dailyPlan().plan, pastPolicy: 'restart_today_keep_count' } }),
      { now: NOW },
    );
    const skip = calculateTodoPlan(dailyPlan({ plan: { ...dailyPlan().plan, pastPolicy: 'skip_missed' } }), {
      now: NOW,
    });
    expect(keep.firstOccurrence).toMatchObject({ occurrenceDate: '2026-08-05', state: 'normal', missed: true });
    expect(restart.firstOccurrence.occurrenceDate).toBe('2026-08-06');
    expect(restart.lastOccurrence.occurrenceDate).toBe('2026-09-04');
    expect(skip.firstOccurrence).toMatchObject({ occurrenceDate: '2026-08-05', state: 'skipped' });
    expect(skip.skippedCount).toBe(1);
    expect(skip.actionableCount).toBe(29);
  });

  it('按日期结束包含末日', () => {
    const preview = calculateTodoPlan(
      dailyPlan({ plan: { ...dailyPlan().plan, end: { mode: 'until', untilDate: '2026-09-03' } } }),
      { now: NOW },
    );
    expect(preview.occurrenceCount).toBe(30);
    expect(preview.lastOccurrence.occurrenceDate).toBe('2026-09-03');
  });

  it('每周可选择多个工作日，并以锚点所在 ISO 周为间隔基准', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-03',
          startTime: '09:00',
          dueTime: '18:00',
          dueDayOffset: 0,
        },
        plan: {
          type: 'scheduled',
          frequency: 'weekly',
          interval: 1,
          weekdays: [1, 3, 5],
          end: { mode: 'count', count: 7 },
          pastPolicy: 'keep_overdue',
        },
        reminder: { mode: 'none' },
      }),
      { now: new Date('2026-08-01T00:00:00Z') },
    );

    expect(preview.occurrences.map((item) => item.occurrenceDate)).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-10',
      '2026-08-12',
      '2026-08-14',
      '2026-08-17',
    ]);
  });

  it('跨年日程保持次数与日期连续', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-12-30',
          startTime: '09:00',
          dueTime: '18:00',
          dueDayOffset: 0,
        },
        plan: {
          type: 'scheduled',
          frequency: 'daily',
          interval: 1,
          end: { mode: 'count', count: 4 },
          pastPolicy: 'keep_overdue',
        },
        reminder: { mode: 'none' },
      }),
      { now: new Date('2026-12-01T00:00:00Z') },
    );

    expect(preview.occurrences.map((item) => item.occurrenceDate)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('每月 31 日可按短月最后一天或跳过', () => {
    const base = dailyPlan({
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2026-01-31',
        startTime: '09:00',
        dueTime: '10:00',
        dueDayOffset: 0,
      },
      reminder: { mode: 'none' },
    });
    const lastDay = calculateTodoPlan(
      {
        ...base,
        plan: {
          type: 'scheduled',
          frequency: 'monthly',
          interval: 1,
          monthDay: 31,
          shortMonthPolicy: 'last_day',
          end: { mode: 'count', count: 3 },
          pastPolicy: 'keep_overdue',
        },
      },
      { now: new Date('2026-01-01T00:00:00Z') },
    );
    const skip = calculateTodoPlan(
      {
        ...base,
        plan: {
          type: 'scheduled',
          frequency: 'monthly',
          interval: 1,
          monthDay: 31,
          shortMonthPolicy: 'skip',
          end: { mode: 'count', count: 3 },
          pastPolicy: 'keep_overdue',
        },
      },
      { now: new Date('2026-01-01T00:00:00Z') },
    );
    expect(lastDay.occurrences.map((item) => item.occurrenceDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(skip.occurrences.map((item) => item.occurrenceDate)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('按本地墙钟计算 DST 缺失时刻并给出警告', () => {
    const preview = calculateTodoPlan(
      {
        timing: {
          timezone: 'America/New_York',
          anchorDate: '2026-03-08',
          startTime: '02:30',
          dueTime: '04:00',
          dueDayOffset: 0,
        },
        plan: { type: 'once', pastPolicy: 'keep_overdue' },
        reminder: { mode: 'once_per_instance', trigger: { type: 'at_start' }, channels: ['in_app'] },
      },
      { now: new Date('2026-03-01T00:00:00Z') },
    );
    expect(preview.firstOccurrence.startAt).toBe('2026-03-08 03:30:00');
    expect(preview.warnings).toContainEqual(expect.objectContaining({ code: 'DST_TIME_ADJUSTED' }));
  });

  it('DST 回拨的重复时刻采用 compatible 的较早时刻且保持本地墙钟不变', () => {
    const preview = calculateTodoPlan(
      {
        timing: {
          timezone: 'America/New_York',
          anchorDate: '2026-11-01',
          startTime: '01:30',
          dueTime: '02:30',
          dueDayOffset: 0,
        },
        plan: { type: 'once', pastPolicy: 'keep_overdue' },
        reminder: { mode: 'once_per_instance', trigger: { type: 'at_start' }, channels: ['in_app'] },
      },
      { now: new Date('2026-10-01T00:00:00Z') },
    );

    expect(preview.firstOccurrence).toMatchObject({
      startAt: '2026-11-01 01:30:00',
      startAtUtc: '2026-11-01 05:30:00',
      dueAt: '2026-11-01 02:30:00',
      dueAtUtc: '2026-11-01 07:30:00',
    });
    expect(preview.warnings).not.toContainEqual(expect.objectContaining({ code: 'DST_TIME_ADJUSTED' }));
  });

  it('允许只有截止时间，并默认在截止前 30 分钟提醒', () => {
    const preview = calculateTodoPlan(
      {
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-07',
          startTime: null,
          dueTime: '09:00',
          dueDayOffset: 1,
        },
        plan: { type: 'once', pastPolicy: 'keep_overdue' },
        reminder: { mode: 'once_per_instance', channels: ['in_app'] },
      },
      { now: NOW },
    );

    expect(preview.firstOccurrence).toMatchObject({
      startAt: null,
      dueAt: '2026-08-08 09:00:00',
    });
    expect(preview.normalizedPlan.reminder.trigger).toEqual({ type: 'before_due', offsetMinutes: 30 });
    expect(preview.nextReminderAt).toBe('2026-08-08 08:30:00');
  });

  it('同日截止早于开始时必须显式选择次日截止', () => {
    expect(() =>
      calculateTodoPlan(
        dailyPlan({
          timing: {
            timezone: 'Asia/Shanghai',
            anchorDate: '2026-08-07',
            startTime: '22:00',
            dueTime: '08:00',
            dueDayOffset: 0,
          },
          plan: { type: 'once', pastPolicy: 'keep_overdue' },
        }),
        { now: NOW },
      ),
    ).toThrow(/次日截止/);
  });

  it('无限计划只滚动生成缓冲窗口，事实上的总次数保持未知', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '09:00',
          dueTime: '18:00',
          dueDayOffset: 0,
        },
        plan: {
          type: 'scheduled',
          frequency: 'daily',
          interval: 1,
          end: { mode: 'never' },
          pastPolicy: 'keep_overdue',
        },
        reminder: { mode: 'none' },
      }),
      { now: NOW },
    );

    expect(preview.occurrenceCount).toBeNull();
    expect(preview.generatedNowCount).toBe(61);
    expect(preview.firstOccurrence.occurrenceDate).toBe('2026-08-06');
    expect(preview.lastOccurrence.occurrenceDate).toBe('2026-10-05');
  });

  it('长期系列单批最多生成 200 项，并可从稳定实例序号继续补齐', () => {
    const input = dailyPlan({
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2025-01-01',
        startTime: '09:00',
        dueTime: '18:00',
        dueDayOffset: 0,
      },
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'never' },
        pastPolicy: 'keep_overdue',
      },
      reminder: { mode: 'none' },
    });

    const firstBatch = calculateTodoPlan(input, { now: NOW });
    const nextBatch = calculateTodoPlan(input, {
      now: NOW,
      occurrenceStart: TODO_PLAN_MAX_ROLLING_BATCH + 1,
      occurrenceLimit: 25,
    });

    expect(firstBatch.generatedNowCount).toBe(TODO_PLAN_MAX_ROLLING_BATCH);
    expect(firstBatch.lastOccurrence.occurrenceNo).toBe(TODO_PLAN_MAX_ROLLING_BATCH);
    expect(nextBatch.generatedNowCount).toBe(25);
    expect(nextBatch.firstOccurrence.occurrenceNo).toBe(TODO_PLAN_MAX_ROLLING_BATCH + 1);
    expect(nextBatch.lastOccurrence.occurrenceNo).toBe(TODO_PLAN_MAX_ROLLING_BATCH + 25);
  });

  it('稀疏长期系列除 60 天窗口外仍至少保留 8 个未来实例', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '09:00',
          dueTime: '18:00',
          dueDayOffset: 0,
        },
        plan: {
          type: 'scheduled',
          frequency: 'monthly',
          interval: 1,
          monthDay: 6,
          shortMonthPolicy: 'last_day',
          end: { mode: 'never' },
          pastPolicy: 'keep_overdue',
        },
        reminder: { mode: 'none' },
      }),
      { now: NOW },
    );

    expect(preview.generatedNowCount).toBe(8);
    expect(preview.lastOccurrence.occurrenceDate).toBe('2027-03-06');
  });

  it('多次催办以截止时间和最大次数共同收口', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '14:00',
          dueTime: '17:30',
          dueDayOffset: 0,
        },
        plan: { type: 'once', pastPolicy: 'keep_overdue' },
        reminder: {
          mode: 'nudge',
          trigger: { type: 'at_start' },
          nudge: { intervalMinutes: 60, maxCount: 20, stop: 'completion_or_due' },
          channels: ['in_app'],
        },
      }),
      { now: NOW },
    );
    expect(preview.reminderMoments[0].moments.map((item) => item.scheduledAtLocal)).toEqual([
      '2026-08-06 14:00:00',
      '2026-08-06 15:00:00',
      '2026-08-06 16:00:00',
      '2026-08-06 17:00:00',
    ]);
  });

  it('选择“最多 N 次”时不会被截止时间提前截断', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '14:00',
          dueTime: '15:00',
          dueDayOffset: 0,
        },
        plan: { type: 'once', pastPolicy: 'keep_overdue' },
        reminder: {
          mode: 'nudge',
          trigger: { type: 'at_start' },
          nudge: { intervalMinutes: 60, maxCount: 3, stop: 'max_count' },
          channels: ['in_app'],
        },
      }),
      { now: NOW },
    );

    expect(preview.reminderMoments[0].moments.map((item) => item.scheduledAtLocal)).toEqual([
      '2026-08-06 14:00:00',
      '2026-08-06 15:00:00',
      '2026-08-06 16:00:00',
    ]);
  });

  it('拒绝超过有限系列上限的次数', () => {
    expect(() =>
      calculateTodoPlan(
        dailyPlan({
          plan: { ...dailyPlan().plan, end: { mode: 'count', count: TODO_PLAN_MAX_FINITE_OCCURRENCES + 1 } },
        }),
        { now: NOW },
      ),
    ).toThrow(/次数/);
  });

  it('拒绝理论上超过 5000 个 Job 的提醒组合', () => {
    expect(() =>
      calculateTodoPlan(
        dailyPlan({
          timing: {
            timezone: 'Asia/Shanghai',
            anchorDate: '2026-08-06',
            startTime: '09:00',
            dueTime: '23:59',
            dueDayOffset: 0,
          },
          plan: {
            type: 'scheduled',
            frequency: 'daily',
            interval: 1,
            end: { mode: 'count', count: TODO_PLAN_MAX_FINITE_OCCURRENCES },
            pastPolicy: 'keep_overdue',
          },
          reminder: {
            mode: 'nudge',
            trigger: { type: 'at_start' },
            nudge: { intervalMinutes: 30, maxCount: 20, stop: 'completion_or_due' },
            channels: ['in_app', 'email'],
            targetEmail: 'owner@example.com',
          },
        }),
        { now: NOW },
      ),
    ).toThrow(`超过 ${TODO_PLAN_MAX_REMINDER_JOBS} 个上限`);
  });

  it('按结束日期生成的有限系列同样不能绕过 366 项上限', () => {
    expect(() =>
      calculateTodoPlan(
        dailyPlan({
          timing: {
            timezone: 'Asia/Shanghai',
            anchorDate: '2026-08-06',
            startTime: '14:00',
            dueTime: '17:30',
            dueDayOffset: 0,
          },
          plan: {
            type: 'scheduled',
            frequency: 'daily',
            interval: 1,
            end: { mode: 'until', untilDate: '2027-08-07' },
            pastPolicy: 'keep_overdue',
          },
        }),
        { now: NOW },
      ),
    ).toThrow(/最多包含 366 项/);
  });

  it('完成后再次安排只预览首项，末项取决于实际完成时间', () => {
    const preview = calculateTodoPlan(
      dailyPlan({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '14:00',
          dueTime: '17:30',
          dueDayOffset: 0,
        },
        plan: {
          type: 'after_completion',
          interval: 3,
          unit: 'day',
          end: { mode: 'count', count: 5 },
          pastPolicy: 'keep_overdue',
        },
      }),
      { now: NOW },
    );
    expect(preview.occurrenceCount).toBe(5);
    expect(preview.generatedNowCount).toBe(1);
    expect(preview.lastOccurrence).toBeNull();
  });
});
