import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  deleteTodoPlan,
  ensureSeriesBuffer,
  ensureTodoCalendarRange,
  generateAfterCompletionNext,
  loadV2ReminderMap,
  previewTodoPlan,
  runIdempotentTodoMutation,
  runSeriesAction,
  skipTodoInstance,
  snoozeV2Todo,
  todoSeriesInternals,
  updateTodoPlan,
} from './todoSeriesService.js';

describe('todoSeriesService v2', () => {
  it('单任务预览范围使用真实开始与截止日期', () => {
    const preview = previewTodoPlan(
      {
        taskMode: 'single',
        title: '跨日学习计划',
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-07',
          startTime: '01:10',
          dueTime: '01:10',
          dueDayOffset: 21,
        },
        plan: { type: 'once' },
        reminder: { mode: 'none', channels: [] },
        singleTaskReminder: { version: 1, mode: 'none', channels: [] },
      },
      { now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(preview.firstOccurrence).toMatchObject({
      startAt: '2026-08-07 01:10:00',
      dueAt: '2026-08-28 01:10:00',
    });
    expect(preview.displaySummary.range).toBe('2026-08-07 至 2026-08-28');
  });

  it('按间隔重复提醒的预览使用与编辑器一致的自然单位', () => {
    const baseInput = {
      taskMode: 'single',
      title: '每日学习提醒',
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2026-08-07',
        startTime: '09:00',
        dueTime: '18:00',
        dueDayOffset: 2,
      },
      plan: { type: 'once' },
      reminder: { mode: 'none', channels: [] },
    };
    const previewOptions = { now: new Date('2026-08-06T00:00:00.000Z') };

    const dailyPreview = previewTodoPlan(
      {
        ...baseInput,
        singleTaskReminder: {
          version: 1,
          mode: 'repeat',
          repeat: { kind: 'interval', intervalMinutes: 1440, stop: 'completion_or_due' },
          channels: ['in_app'],
        },
      },
      previewOptions,
    );
    const hourlyPreview = previewTodoPlan(
      {
        ...baseInput,
        singleTaskReminder: {
          version: 1,
          mode: 'repeat',
          repeat: { kind: 'interval', intervalMinutes: 120, stop: 'completion_or_due' },
          channels: ['in_app'],
        },
      },
      previewOptions,
    );

    expect(dailyPreview.displaySummary.reminder).toBe('每 1 天提醒 · 站内');
    expect(hourlyPreview.displaySummary.reminder).toBe('每 2 小时提醒 · 站内');
  });

  it('多次催办预览说明首次时机、间隔、次数和停止条件', () => {
    const preview = previewTodoPlan(
      {
        taskMode: 'independent',
        title: '每日学习',
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-07',
          startTime: '09:30',
          dueTime: '18:30',
          dueDayOffset: 0,
        },
        plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'count', count: 1 } },
        reminder: {
          mode: 'nudge',
          trigger: { type: 'at_start' },
          nudge: { intervalMinutes: 60, maxCount: 4, stop: 'completion_or_due' },
          channels: ['in_app'],
        },
      },
      { now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(preview.displaySummary.reminder).toBe(
      '任务开始时首次提醒，之后每 1 小时提醒，最多 4 次，完成或截止时停止 · 站内',
    );
  });

  it('每条提醒一次的预览会说明具体提醒时机', () => {
    const preview = previewTodoPlan(
      {
        taskMode: 'independent',
        title: '每日学习',
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-07',
          startTime: '09:30',
          dueTime: '18:30',
          dueDayOffset: 0,
        },
        plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'count', count: 1 } },
        reminder: {
          mode: 'once_per_instance',
          trigger: { type: 'fixed_time', fixedTime: '10:00' },
          channels: ['in_app'],
        },
      },
      { now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(preview.displaySummary.reminder).toBe('当天 10:00 提醒一次 · 站内');
  });

  it('无开始和截止时间的独立计划在预览中明确标为全天待办', () => {
    const preview = previewTodoPlan(
      {
        taskMode: 'independent',
        title: '每天点外卖',
        timing: { timezone: 'Asia/Shanghai' },
        plan: { type: 'scheduled', frequency: 'daily', interval: 1, end: { mode: 'count', count: 1 } },
        reminder: {
          mode: 'once_per_instance',
          trigger: { type: 'fixed_time', fixedTime: '11:10' },
          channels: ['in_app'],
        },
      },
      { now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(preview.displaySummary.range).toBe('2026-08-06');
    expect(preview.displaySummary.timing).toBe('全天待办（未设置开始和截止时间）');
    expect(preview.displaySummary.reminder).toBe('当天 11:10 提醒一次 · 站内');
  });

  it('按最大次数催办的 Job 不把截止时间保存为停止线', () => {
    const rows = todoSeriesInternals.jobRowsForOccurrence({
      userId: 'user-1',
      todoId: 'todo-1',
      seriesId: null,
      rule: { id: 'rule-1', version: 1 },
      occurrence: {
        timezone: 'Asia/Shanghai',
        dueAtUtc: '2026-08-06 07:00:00',
      },
      momentEntry: {
        moments: [
          {
            sequenceNo: 1,
            scheduledAtUtc: '2026-08-06 06:00:00',
            scheduledAtLocal: '2026-08-06 14:00:00',
            deliverable: true,
            skippedReason: null,
          },
        ],
      },
      reminder: {
        mode: 'nudge',
        nudge: { stop: 'max_count', maxCount: 3, intervalMinutes: 60 },
        channels: ['in_app'],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].stop_at_utc).toBeNull();
  });

  it('提醒规则是展示事实源：即使任务已全部发送，仍保留每项提醒配置', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'series-rule',
              todoId: null,
              seriesId: 'series-1',
              mode: 'once_per_instance',
              triggerType: 'fixed_time',
              fixedTime: '09:00:00',
              offsetMinutes: null,
              intervalMinutes: null,
              maxCount: null,
              stopType: null,
              channels: '["in_app"]',
              targetEmail: null,
              quietPolicy: 'defer_once',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]),
    };

    const result = await loadV2ReminderMap(db, 'user-1', [{ id: 'todo-1', seriesId: 'series-1' }]);

    expect(result.get('todo-1')).toMatchObject({
      mode: 'once_per_instance',
      trigger: { type: 'fixed_time', fixedTime: '09:00' },
      channels: ['in_app'],
      nextAt: null,
      remainingCount: 0,
      paused: false,
    });
  });

  it('单项覆盖规则优先于所属系列规则', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'direct-rule',
              todoId: 'todo-1',
              seriesId: 'series-1',
              mode: 'nudge',
              triggerType: 'at_start',
              fixedTime: null,
              offsetMinutes: null,
              intervalMinutes: 60,
              maxCount: 3,
              stopType: 'completion_or_due',
              channels: '["in_app","email"]',
              targetEmail: 'owner@example.com',
              quietPolicy: 'skip',
            },
            {
              id: 'series-rule',
              todoId: null,
              seriesId: 'series-1',
              mode: 'once_per_instance',
              triggerType: 'fixed_time',
              fixedTime: '09:00:00',
              offsetMinutes: null,
              intervalMinutes: null,
              maxCount: null,
              stopType: null,
              channels: '["in_app"]',
              targetEmail: null,
              quietPolicy: 'defer_once',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              todoId: 'todo-1',
              channel: 'in_app',
              scheduledAtLocal: '2026-08-07 09:00:00',
              status: 'pending',
            },
          ],
        ]),
    };

    const result = await loadV2ReminderMap(db, 'user-1', [{ id: 'todo-1', seriesId: 'series-1' }]);

    expect(result.get('todo-1')).toMatchObject({
      mode: 'nudge',
      channels: ['in_app', 'email'],
      nudge: { intervalMinutes: 60, maxCount: 3, stop: 'completion_or_due' },
      nextAt: '2026-08-07 09:00:00',
      remainingCount: 1,
    });
  });

  it('双渠道催办的剩余次数按催办序号计算，不把渠道数重复相加', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'series-rule',
              todoId: null,
              seriesId: 'series-1',
              mode: 'nudge',
              triggerType: 'at_start',
              fixedTime: null,
              offsetMinutes: null,
              intervalMinutes: 60,
              maxCount: 2,
              stopType: 'completion_or_due',
              channels: '["in_app","email"]',
              targetEmail: 'owner@example.com',
              quietPolicy: 'defer_once',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              todoId: 'todo-1',
              channel: 'in_app',
              sequenceNo: 1,
              scheduledAtLocal: '2026-08-07 09:00:00',
              status: 'pending',
            },
            {
              todoId: 'todo-1',
              channel: 'email',
              sequenceNo: 1,
              scheduledAtLocal: '2026-08-07 09:00:00',
              status: 'pending',
            },
            {
              todoId: 'todo-1',
              channel: 'in_app',
              sequenceNo: 2,
              scheduledAtLocal: '2026-08-07 10:00:00',
              status: 'pending',
            },
            {
              todoId: 'todo-1',
              channel: 'email',
              sequenceNo: 2,
              scheduledAtLocal: '2026-08-07 10:00:00',
              status: 'pending',
            },
          ],
        ]),
    };

    const result = await loadV2ReminderMap(db, 'user-1', [{ id: 'todo-1', seriesId: 'series-1' }]);

    expect(result.get('todo-1')).toMatchObject({ remainingCount: 2, nextAt: '2026-08-07 09:00:00' });
  });

  it('幂等写操作缺少键时拒绝，成功回执可安全重放', async () => {
    const emptyDb = { query: vi.fn() };
    await expect(runIdempotentTodoMutation(emptyDb, 'user-1', {}, 'pause', vi.fn())).rejects.toMatchObject({
      code: 'TODO_IDEMPOTENCY_REQUIRED',
    });
    expect(emptyDb.query).not.toHaveBeenCalled();

    const callback = vi.fn();
    const db = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            action: 'pause',
            requestHash: crypto.createHash('sha256').update('{"action":"pause","scope":"series"}').digest('hex'),
            status: 'succeeded',
            responseJson: '{"status":"paused"}',
          },
        ],
      ]),
    };
    const replay = await runIdempotentTodoMutation(
      db,
      'user-1',
      { idempotencyKey: 'idem-1', scope: 'series' },
      'pause',
      callback,
    );

    expect(replay).toEqual({ status: 'paused', replayed: true });
    expect(callback).not.toHaveBeenCalled();
  });

  it('完成后再次安排按用户墙钟跨 DST 推进，并保持本项时长', () => {
    const occurrence = todoSeriesInternals.nextAfterCompletionOccurrence(
      {
        timezone: 'America/New_York',
        schedule_rule: JSON.stringify({
          plan: { type: 'after_completion', interval: 1, unit: 'day' },
          timing: { timezone: 'America/New_York', startTime: '10:00', dueTime: '11:30' },
        }),
      },
      {
        occurrence_no: 1,
        start_at: '2026-03-07 10:00:00',
        due_at: '2026-03-07 11:30:00',
      },
      new Date('2026-03-07T15:00:00.000Z'),
    );

    expect(occurrence).toMatchObject({
      occurrenceNo: 2,
      occurrenceDate: '2026-03-08',
      startAt: '2026-03-08 10:00:00',
      startAtUtc: '2026-03-08 14:00:00',
      dueAt: '2026-03-08 11:30:00',
      dueAtUtc: '2026-03-08 15:30:00',
    });
  });

  it('完成后再次安排的提醒保留超过 30 天的真实截止跨度', () => {
    const moments = todoSeriesInternals.reminderMomentsForAdHocOccurrence(
      {
        occurrenceNo: 2,
        occurrenceDate: '2026-09-01',
        startAt: '2026-09-01 09:00:00',
        dueAt: '2026-11-05 18:00:00',
        timezone: 'Asia/Shanghai',
        state: 'normal',
      },
      {
        mode: 'once_per_instance',
        trigger: { type: 'before_due', offsetMinutes: 60 },
        channels: ['in_app'],
        quietPolicy: 'defer_once',
      },
      new Date('2026-08-06T00:00:00.000Z'),
    );

    expect(moments).toHaveLength(1);
    expect(moments[0].scheduledAtLocal).toBe('2026-11-05 17:00:00');
  });

  it('完成后再次安排兼容 MySQL2 返回的 Date 类型开始与截止时间', () => {
    const occurrence = todoSeriesInternals.nextAfterCompletionOccurrence(
      {
        timezone: 'Asia/Shanghai',
        schedule_rule: JSON.stringify({
          plan: { type: 'after_completion', interval: 1, unit: 'day' },
          timing: { timezone: 'Asia/Shanghai', startTime: '09:00', dueTime: '10:30' },
        }),
      },
      {
        occurrence_no: 1,
        start_at: new Date(2026, 7, 6, 9, 0, 0),
        due_at: new Date(2026, 7, 6, 10, 30, 0),
      },
      new Date('2026-08-07T01:00:00.000Z'),
    );

    expect(occurrence).toMatchObject({
      occurrenceDate: '2026-08-08',
      startAt: '2026-08-08 09:00:00',
      dueAt: '2026-08-08 10:30:00',
    });
  });

  it('完成后按月再次安排明确使用目标月最后一天', () => {
    const occurrence = todoSeriesInternals.nextAfterCompletionOccurrence(
      {
        timezone: 'Asia/Shanghai',
        schedule_rule: JSON.stringify({
          plan: { type: 'after_completion', interval: 1, unit: 'month' },
          timing: { timezone: 'Asia/Shanghai', startTime: '09:00', dueTime: '10:00' },
        }),
      },
      {
        occurrence_no: 1,
        start_at: '2027-01-31 09:00:00',
        due_at: '2027-01-31 10:00:00',
      },
      new Date('2027-01-31T01:00:00.000Z'),
    );

    expect(occurrence).toMatchObject({
      occurrenceDate: '2027-02-28',
      startAt: '2027-02-28 09:00:00',
      dueAt: '2027-02-28 10:00:00',
    });
  });

  it('撤销完成后再次完成会复用被撤销的下一项，并按新的完成时间重新排期', async () => {
    const series = {
      id: 'series-1',
      user_id: 'user-1',
      title: '浇花',
      description: null,
      checklist_template: '[]',
      priority: 1,
      status: 'active',
      repeat_mode: 'after_completion',
      timezone: 'Asia/Shanghai',
      version: 3,
      schedule_rule: JSON.stringify({
        plan: { type: 'after_completion', interval: 1, unit: 'day', end: { mode: 'never' } },
        timing: { timezone: 'Asia/Shanghai', startTime: '09:00', dueTime: '10:00' },
      }),
    };
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM todo_series') && sql.includes('FOR UPDATE')) return [[series]];
        if (sql.includes('FROM todo_items WHERE series_id')) {
          return [[{ id: 'next-todo', delFlag: 1, generatedByTodoId: 'current-todo' }]];
        }
        if (sql.includes('FROM todo_reminder_rules')) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };

    await expect(
      generateAfterCompletionNext(
        db,
        'user-1',
        {
          id: 'current-todo',
          occurrence_no: 1,
          start_at: '2026-08-06 09:00:00',
          due_at: '2026-08-06 10:00:00',
          sort_order: 100,
        },
        new Date('2026-08-08T01:00:00.000Z'),
      ),
    ).resolves.toBe('next-todo');

    const reactivate = db.query.mock.calls.find(([sql]) => sql.includes('del_flag = 0, deleted_at = NULL'));
    expect(reactivate).toBeTruthy();
    expect(reactivate[1]).toEqual(
      expect.arrayContaining(['2026-08-09 09:00:00', '2026-08-09 10:00:00', 'next-todo', 'user-1']),
    );
    expect(db.query.mock.calls.some(([sql]) => sql.includes("cancel_reason = 'completion_undone'"))).toBe(true);
  });

  it('跳过实例只允许待处理项，重复跳过保持幂等', async () => {
    const completedDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [{ id: 'todo-1', seriesId: 'series-1', status: 'completed', instanceState: 'normal' }],
        ]),
    };
    await expect(skipTodoInstance(completedDb, 'user-1', 'todo-1')).rejects.toMatchObject({
      code: 'TODO_INSTANCE_NOT_PENDING',
      status: 409,
    });
    expect(completedDb.query).toHaveBeenCalledOnce();

    const skippedDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'todo-2', seriesId: 'series-1', status: 'pending', instanceState: 'skipped' }]]),
    };
    await expect(skipTodoInstance(skippedDb, 'user-1', 'todo-2')).resolves.toEqual({
      todoId: 'todo-2',
      state: 'skipped',
      affectedJobs: 0,
    });
    expect(skippedDb.query).toHaveBeenCalledOnce();
  });

  it('已有 v2 单次任务改成重复计划时事务内退役原项并创建新系列', async () => {
    const draft = {
      title: '每日复盘',
      description: '',
      priority: 1,
      checklist: [],
      resourceRefs: [],
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2026-08-10',
        startTime: '09:00',
        dueTime: '10:00',
        dueDayOffset: 0,
      },
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'count', count: 2 },
        pastPolicy: 'keep_overdue',
      },
      reminder: { mode: 'none' },
    };
    const preview = previewTodoPlan(draft, { now: new Date('2026-08-06T00:00:00Z') });
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT * FROM todo_items')) {
          return [[{ id: 'old-todo', series_id: null, plan_version: 2 }]];
        }
        if (sql.includes("cancel_reason = 'single_replaced_by_series'")) return [{ affectedRows: 2 }];
        return [{ affectedRows: 1 }];
      }),
    };

    const result = await updateTodoPlan(
      db,
      'user-1',
      {
        ...draft,
        todoId: 'old-todo',
        scope: 'current',
        previewHash: preview.previewHash,
        idempotencyKey: 'replace-single-1',
      },
      { now: new Date('2026-08-06T00:00:00Z') },
    );

    expect(result).toMatchObject({
      replacedTodoId: 'old-todo',
      scope: 'current',
      planVersion: 2,
      createdCount: 2,
      affectedItems: 1,
      affectedJobs: 2,
    });
    expect(db.query.mock.calls.some(([sql]) => sql === 'INSERT INTO todo_series SET ?')).toBe(true);
    expect(db.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO todo_items SET ?')).toHaveLength(2);
  });

  it('系列的仅本次修改不能偷偷创建另一套重复计划', async () => {
    const draft = {
      title: '每日复盘',
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2026-08-10',
        startTime: '09:00',
        dueTime: '10:00',
        dueDayOffset: 0,
      },
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'count', count: 2 },
        pastPolicy: 'keep_overdue',
      },
      reminder: { mode: 'none' },
    };
    const preview = previewTodoPlan(draft, { now: new Date('2026-08-06T00:00:00Z') });
    const db = {
      query: vi.fn().mockResolvedValueOnce([[{ id: 'todo-1', series_id: 'series-1', plan_version: 2 }]]),
    };

    await expect(
      updateTodoPlan(
        db,
        'user-1',
        { ...draft, todoId: 'todo-1', scope: 'current', previewHash: preview.previewHash },
        { now: new Date('2026-08-06T00:00:00Z') },
      ),
    ).rejects.toMatchObject({ code: 'TODO_CURRENT_SCOPE_PLAN_INVALID', status: 400 });
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('已结束系列不可被新请求重新暂停或恢复', async () => {
    for (const action of ['pause', 'resume']) {
      const db = { query: vi.fn().mockResolvedValueOnce([[{ id: 'series-1', status: 'ended' }]]) };
      await expect(runSeriesAction(db, 'user-1', { seriesId: 'series-1', action })).rejects.toMatchObject({
        code: 'TODO_SERIES_ENDED',
        status: 409,
      });
      expect(db.query).toHaveBeenCalledOnce();
    }
  });

  it('暂停系列只暂停尚未领取的 Job，不篡改 processing 的邮件投递结果', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'series-1', status: 'active' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 3 }]),
    };

    await expect(runSeriesAction(db, 'user-1', { seriesId: 'series-1', action: 'pause' })).resolves.toEqual({
      seriesId: 'series-1',
      status: 'paused',
      affectedJobs: 3,
    });
    expect(db.query.mock.calls[2][0]).toContain("status = 'pending'");
    expect(db.query.mock.calls[2][0]).not.toContain("status IN ('pending','processing')");
  });

  it('删除整个系列覆盖全部未完成实例，而不是只处理今天之后', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'todo-2',
              series_id: 'series-1',
              occurrence_no: 2,
            },
          ],
        ])
        .mockResolvedValueOnce([{ affectedRows: 5 }])
        .mockResolvedValueOnce([{ affectedRows: 8 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await deleteTodoPlan(db, 'user-1', { todoId: 'todo-2', scope: 'series' });

    expect(result).toMatchObject({
      scope: 'series',
      seriesId: 'series-1',
      status: 'ended',
      affectedItems: 5,
      affectedJobs: 8,
    });
    expect(db.query.mock.calls[1][0]).not.toContain('occurrence_no >=');
    expect(db.query.mock.calls[3][1]).toEqual(['series-1', 'user-1']);
  });

  it('滚动补齐遇到唯一键竞争时不为未插入实例创建孤立提醒', async () => {
    const series = {
      id: 'series-1',
      user_id: 'user-1',
      title: '每日复盘',
      description: null,
      checklist_template: '[]',
      priority: 1,
      repeat_mode: 'scheduled',
      status: 'active',
      timezone: 'Asia/Shanghai',
      version: 1,
      next_occurrence_no: 20,
      schedule_rule: JSON.stringify({
        timing: {
          timezone: 'Asia/Shanghai',
          anchorDate: '2026-08-06',
          startTime: '09:00',
          dueTime: '10:00',
          dueDayOffset: 0,
        },
        plan: {
          type: 'scheduled',
          frequency: 'daily',
          interval: 1,
          end: { mode: 'never' },
          pastPolicy: 'keep_overdue',
        },
      }),
    };
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT * FROM todo_series')) return [[series]];
        if (sql.includes('MAX(occurrence_no)')) return [[{ maxOccurrenceNo: 24 }]];
        if (sql.includes('FROM todo_reminder_rules')) return [[]];
        if (sql === 'INSERT IGNORE INTO todo_items SET ?') return [{ affectedRows: 0 }];
        return [{ affectedRows: 1 }];
      }),
    };

    const result = await ensureSeriesBuffer(db, 'series-1', { now: new Date('2026-08-06T00:00:00Z') });

    expect(result).toEqual({ createdCount: 0, reminderJobsCreated: 0 });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT IGNORE INTO todo_reminder_jobs'))).toBe(false);
    const firstInsert = db.query.mock.calls.find(([sql]) => sql === 'INSERT IGNORE INTO todo_items SET ?');
    expect(firstInsert?.[1]?.[0]?.occurrence_no).toBe(25);
  });

  it('日历补齐只扫描当前用户尚未覆盖可视末日的长期固定日程', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[]]) };
    const result = await ensureTodoCalendarRange(
      db,
      'user-1',
      { endDate: '2026-09-30' },
      { now: new Date('2026-08-18T00:00:00Z') },
    );

    expect(result).toEqual({ createdCount: 0, seriesCount: 0 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("repeat_mode = 'scheduled'"), [
      'user-1',
      '2026-09-30',
    ]);
  });

  it('日历补齐拒绝无效日期和超过未来一年的范围', async () => {
    const db = { query: vi.fn() };
    await expect(
      ensureTodoCalendarRange(db, 'user-1', { endDate: 'not-a-date' }, { now: new Date('2026-08-18T00:00:00Z') }),
    ).rejects.toMatchObject({ code: 'TODO_CALENDAR_RANGE_INVALID' });
    await expect(
      ensureTodoCalendarRange(db, 'user-1', { endDate: '2027-09-01' }, { now: new Date('2026-08-18T00:00:00Z') }),
    ).rejects.toMatchObject({ code: 'TODO_CALENDAR_RANGE_TOO_LARGE' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('v2 稍后提醒没有现成 Job 时只创建当前实例的单次站内提醒', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await snoozeV2Todo(
      db,
      'user-1',
      {
        id: 'todo-1',
        plan_version: 2,
        series_id: 'series-1',
        instance_timezone: 'Asia/Shanghai',
      },
      '2099-08-07 09:00:00',
    );

    expect(result).toMatchObject({ id: 'todo-1', scheduledAt: '2099-08-07 09:00:00', snoozedJobs: 1 });
    expect(db.query.mock.calls[1][0]).toContain('UPDATE todo_reminder_rules');
    expect(db.query.mock.calls[2][0]).toBe('INSERT INTO todo_reminder_rules SET ?');
    expect(db.query.mock.calls[3][0]).toBe('INSERT IGNORE INTO todo_reminder_jobs SET ?');
    expect(db.query.mock.calls.every(([sql]) => !sql.includes('todo_reminders'))).toBe(true);
  });

  it('v2 稍后提醒每个渠道只移动最早一条，不级联后续催办', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 'in-app-1', channel: 'in_app', status: 'pending' },
            { id: 'in-app-2', channel: 'in_app', status: 'pending' },
            { id: 'email-1', channel: 'email', status: 'pending' },
          ],
        ])
        .mockResolvedValue([{ affectedRows: 1 }]),
    };

    const result = await snoozeV2Todo(
      db,
      'user-1',
      { id: 'todo-1', instance_timezone: 'Asia/Shanghai' },
      '2099-08-07 09:00:00',
    );

    expect(result.snoozedJobs).toBe(2);
    const updatedIds = db.query.mock.calls.slice(1).map((call) => call[1][2]);
    expect(updatedIds).toEqual(['in-app-1', 'email-1']);
  });
});
