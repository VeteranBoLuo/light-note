import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTodoDeletion,
  applyTodoStatusChange,
  batchSetTodoStatus,
  createTodo,
  deleteTodo,
  findOwnedTodoForAi,
  listTodoPage,
  listTodos,
  nextRecurrenceAt,
  prepareTodoStatusChange,
  prepareTodoDeletion,
  queryTodoAttentionCounts,
  reorderTodos,
  setTodoStatus,
  snoozeTodo,
  updateTodo,
} from './todoService.js';

describe('todoService', () => {
  let connection;

  beforeEach(() => {
    connection = { query: vi.fn() };
  });

  it('拒绝空标题，且不执行数据库写入', async () => {
    await expect(createTodo(connection, 'user-1', { title: '   ' })).rejects.toThrow('待办标题不能为空');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('按 owner 和稳定 ID 为 AI 读取最新待办正文与子待办，不暴露提醒邮箱', async () => {
    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'todo-1',
          title: '整理发票',
          description: '按月份归档',
          checklist: JSON.stringify([
            { id: 'child-1', text: '下载电子票', done: true },
            { id: 'child-2', text: '提交报销', done: false },
          ]),
          priority: 2,
          status: 'pending',
          dueAt: '2026-08-05 18:00:00',
          completedAt: null,
          recurrence: null,
          updatedAt: '2026-08-03 22:00:00',
        },
      ],
    ]);

    const result = await findOwnedTodoForAi(connection, 'user-1', 'todo-1');

    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ? AND user_id = ?'), [
      'todo-1',
      'user-1',
    ]);
    expect(result).toMatchObject({
      id: 'todo-1',
      description: '按月份归档',
      checklist: [
        { id: 'child-1', text: '下载电子票', done: true },
        { id: 'child-2', text: '提交报销', done: false },
      ],
    });
    expect(result).not.toHaveProperty('email');
  });

  it('创建带提醒的待办时写入待办和提醒计划', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', {
      title: '处理账单',
      dueAt: '2026-07-20T18:00',
      reminderAt: '2026-07-20T17:00',
    });

    expect(connection.query).toHaveBeenCalledTimes(5);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO todo_items');
    expect(connection.query.mock.calls[3][0]).toContain('INSERT INTO todo_reminders');
    expect(connection.query.mock.calls[4][0]).toContain('INSERT IGNORE INTO growth_events');
  });

  it('管理员维护上下文创建待办时不写成长事实', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', { title: '代用户维护' }, { suppressUserRewards: true });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT IGNORE INTO growth_events'))).toBe(
      false,
    );
  });

  it('创建周期提醒时分别写入站内和邮箱渠道', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', {
      title: '周期复盘',
      dueAt: '2026-07-30T18:00',
      reminder: {
        mode: 'repeat',
        channels: ['in_app', 'email'],
        startAt: '2026-07-20T09:00',
        endAt: '2026-07-30T09:00',
        intervalMinutes: 1440,
        email: 'owner@example.com',
      },
    });

    const reminderInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO todo_reminders SET ?');
    expect(reminderInserts).toHaveLength(2);
    expect(reminderInserts.map(([, [row]]) => row.channel)).toEqual(['in_app', 'email']);
  });

  it('更新提醒时优先复用相同计划时间的历史记录，避免唯一索引冲突', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '回访客户',
            description: null,
            checklist: '[]',
            priority: 1,
            due_at: '2026-07-21T10:00',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 'historical-reminder' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateTodo(connection, 'user-1', 'todo-1', {
      reminder: {
        mode: 'once',
        channels: ['in_app'],
        startAt: '2026-07-20T09:00',
      },
    });

    expect(connection.query.mock.calls[4]).toEqual([
      expect.stringContaining('ORDER BY (scheduled_at = ?) DESC'),
      ['todo-1', 'user-1', 'in_app', '2026-07-20 09:00:00'],
    ]);
    expect(connection.query.mock.calls[5][1].at(-1)).toBe('historical-reminder');
  });

  it('邮箱渠道必须提供有效邮箱', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '测试邮件提醒',
        reminder: {
          mode: 'once',
          channels: ['email'],
          startAt: '2026-07-20T09:00',
          email: 'invalid',
        },
      }),
    ).rejects.toThrow('提醒邮箱格式无效');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('周期提醒结束时间必须晚于开始时间', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '错误周期',
        reminder: {
          mode: 'repeat',
          channels: ['in_app'],
          startAt: '2026-07-20T09:00',
          endAt: '2026-07-20T08:00',
          intervalMinutes: 60,
        },
      }),
    ).rejects.toThrow('提醒结束时间必须晚于开始时间');
  });

  it('限制单个周期计划的提醒次数，避免邮件滥发', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '过于频繁的计划',
        reminder: {
          mode: 'repeat',
          channels: ['email'],
          startAt: '2026-07-20T09:00',
          endAt: '2026-07-21T09:00',
          intervalMinutes: 5,
          email: 'owner@example.com',
        },
      }),
    ).rejects.toThrow('单个周期提醒最多执行 100 次');
  });

  it('重复任务与重复提醒分别落库，完成后才能生成下一实例', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', {
      title: '每周复盘',
      dueAt: '2026-07-31T18:00',
      recurrence: { frequency: 'weekly', interval: 1, endAt: '2026-09-01T18:00' },
      reminder: {
        mode: 'repeat',
        channels: ['in_app'],
        startAt: '2026-07-31T09:00',
        endAt: '2026-07-31T17:00',
        intervalMinutes: 120,
      },
    });

    const todoRow = connection.query.mock.calls[0][1][0];
    expect(JSON.parse(todoRow.recurrence_rule)).toMatchObject({ frequency: 'weekly', interval: 1 });
    expect(todoRow.series_id).toBe(todoRow.id);
    const reminderRow = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO todo_reminders SET ?')[1][0];
    expect(reminderRow.repeat_interval_minutes).toBe(120);
  });

  it('月度重复在月末按目标月最后一天生成，不跳到下下个月', () => {
    const next = nextRecurrenceAt('2027-01-31 18:00:00', { frequency: 'monthly', interval: 1 });
    expect(next?.getFullYear()).toBe(2027);
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(28);
    expect(next?.getHours()).toBe(18);
  });

  it('拒绝晚于截止时间的提醒', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '处理账单',
        dueAt: '2026-07-20T17:00',
        reminderAt: '2026-07-20T18:00',
      }),
    ).rejects.toThrow('提醒时间不能晚于截止时间');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('更新不属于当前用户的待办时返回 null', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(updateTodo(connection, 'user-2', 'todo-1', { title: '越权更新' })).resolves.toBeNull();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'), ['todo-1', 'user-2']);
  });

  it('软删除始终带 user_id 条件', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(deleteTodo(connection, 'user-3', 'todo-2')).resolves.toBe(1);
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-2', 'user-3']);
    expect(connection.query.mock.calls[1][1]).toEqual(['todo-2', 'user-3']);
  });

  it('完成重复任务时创建清单重置的下一实例，重复执行不会为未插入行创建孤立提醒', async () => {
    const current = {
      id: 'todo-series-1',
      user_id: 'user-3',
      title: '每日巡检',
      description: '检查服务',
      checklist: JSON.stringify([{ id: 'check-1', text: '查看状态', done: true }]),
      priority: 2,
      sort_order: 1000,
      status: 'pending',
      due_at: '2026-07-30 18:00:00',
      series_id: 'todo-series-1',
      recurrence_rule: JSON.stringify({ frequency: 'daily', interval: 1, endAt: null }),
    };
    connection.query
      .mockResolvedValue([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[current]])
      .mockResolvedValueOnce([
        [
          {
            id: 'reminder-1',
            channel: 'in_app',
            scheduledAt: '2026-07-30 17:00:00',
            startAt: '2026-07-30 17:00:00',
            intervalMinutes: null,
            endAt: null,
            email: null,
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(setTodoStatus(connection, 'user-3', current.id, 'completed')).resolves.toBe(1);

    const nextInsert = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT IGNORE INTO todo_items'));
    expect(nextInsert[1]).toEqual(
      expect.arrayContaining([
        '2026-07-31 18:00:00',
        'todo-series-1',
        JSON.stringify({ frequency: 'daily', interval: 1, endAt: null }),
      ]),
    );
    expect(JSON.parse(nextInsert[1][4])).toEqual([{ id: 'check-1', text: '查看状态', done: false }]);
    expect(connection.query.mock.calls.some(([sql]) => sql === 'INSERT INTO todo_reminders SET ?')).toBe(true);

    connection.query.mockReset();
    connection.query
      .mockResolvedValue([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...current, status: 'pending' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    await setTodoStatus(connection, 'user-3', current.id, 'completed');
    expect(connection.query.mock.calls.some(([sql]) => sql === 'INSERT INTO todo_reminders SET ?')).toBe(false);
  });

  it('v2 完成状态按 series_id 进入系列服务并生成下一项', async () => {
    const current = {
      id: 'todo-v2-1',
      title: '浇花',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'pending',
      start_at: '2026-08-06 09:00:00',
      due_at: '2026-08-06 10:00:00',
      sort_order: 100,
      plan_version: 2,
      series_id: 'series-v2-1',
      occurrence_no: 1,
    };
    connection.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM todo_items') && sql.includes('LIMIT 1 FOR UPDATE')) return [[current]];
      if (sql.includes('UPDATE todo_items') && sql.includes('completed_at')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE todo_reminder_jobs')) return [{ affectedRows: 2 }];
      if (sql.includes('SELECT * FROM todo_series')) {
        return [[{ id: 'series-v2-1', status: 'active', repeat_mode: 'after_completion', schedule_rule: '{}' }]];
      }
      if (sql.includes('FROM todo_items WHERE series_id')) {
        return [[{ id: 'already-generated', delFlag: 0, generatedByTodoId: 'todo-v2-1' }]];
      }
      return [{ affectedRows: 1 }];
    });

    await expect(setTodoStatus(connection, 'user-3', current.id, 'completed')).resolves.toBe(1);

    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM todo_series'), [
      'series-v2-1',
      'user-3',
    ]);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('FROM todo_items WHERE series_id'), [
      'series-v2-1',
      2,
    ]);
  });

  it('撤销完成时同一事务恢复原任务，并删除本次自动生成的下一实例', async () => {
    const current = {
      id: 'todo-series-2',
      status: 'completed',
      due_at: '2026-07-30 18:00:00',
      series_id: 'todo-series-2',
      recurrence_rule: JSON.stringify({ frequency: 'daily', interval: 1 }),
    };
    connection.query
      .mockResolvedValue([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[current]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 'generated-next' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      batchSetTodoStatus(connection, 'user-3', [current.id], 'pending', { undoCompletion: true }),
    ).resolves.toMatchObject({ affected: 1 });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM todo_items'), [
      'generated-next',
      'user-3',
    ]);
  });

  it('批量状态操作发现任一目标变化时显式失败，交由外层事务整体回滚', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(batchSetTodoStatus(connection, 'user-3', ['missing'], 'completed')).rejects.toThrow(
      '部分待办已发生变化',
    );
  });

  it('拖动排序会逐项校验归属并写入日期、优先级和稳定顺序', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await expect(
      reorderTodos(connection, 'user-4', [
        { id: 'todo-a', dueAt: '2026-08-01T09:00', priority: 2 },
        { id: 'todo-b', dueAt: null, priority: 0 },
      ]),
    ).resolves.toEqual({ affected: 2 });
    expect(connection.query.mock.calls[0][1]).toEqual(['2026-08-01 09:00:00', 2, 2, 1000, 'todo-a', 'user-4']);
    expect(connection.query.mock.calls[1][1]).toEqual([null, 0, 0, 2000, 'todo-b', 'user-4']);
    expect(connection.query.mock.calls[0][0]).toContain('due_at = IF(COALESCE(plan_version, 1) = 2, due_at, ?)');
  });

  it('新版待办排序接口始终保留数据库截止时间，时间修改必须改走带范围的 v2 编辑', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      reorderTodos(connection, 'user-4', [{ id: 'todo-v2', dueAt: '2026-08-02T09:00', priority: 1 }]),
    ).resolves.toEqual({ affected: 1 });
    expect(connection.query.mock.calls[0][0]).toContain('due_at = IF(COALESCE(plan_version, 1) = 2, due_at, ?)');
  });

  it('稍后提醒在没有现有计划时创建站内提醒', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 'todo-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const target = new Date(Date.now() + 60 * 60_000);
    const result = await snoozeTodo(connection, 'user-5', 'todo-1', target);
    expect(result.id).toBe('todo-1');
    const insert = connection.query.mock.calls[2];
    expect(insert[0]).toBe('INSERT INTO todo_reminders SET ?');
    expect(insert[1][0]).toMatchObject({ todo_id: 'todo-1', user_id: 'user-5', channel: 'in_app' });
  });

  it('v2 稍后提醒只写 reminder jobs，不会回流旧调度表', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-v2',
            plan_version: 2,
            instance_timezone: 'Asia/Shanghai',
            status: 'pending',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'job-1', channel: 'in_app', status: 'pending' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await snoozeTodo(connection, 'user-5', 'todo-v2', '2099-08-07T09:00');

    expect(result).toMatchObject({ id: 'todo-v2', snoozedJobs: 1 });
    expect(connection.query.mock.calls[2][0]).toContain('UPDATE todo_reminder_jobs');
    expect(connection.query.mock.calls.every(([sql]) => !sql.includes('todo_reminders'))).toBe(true);
  });

  it('筛选全部时不追加完成状态条件', async () => {
    connection.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);

    await expect(listTodos(connection, 'user-4', { status: 'all' })).resolves.toEqual([]);

    expect(connection.query.mock.calls[0]).toEqual([expect.not.stringContaining('status = ?'), ['user-4']]);
  });

  it('智能排序统一使用下一次提醒、计划时间与优先级，并稳定格式化实例日期', async () => {
    connection.query.mockResolvedValueOnce([[]]);

    await listTodoPage(connection, 'user-4', {
      status: 'pending',
      sort: 'smart',
      includeTotal: false,
    });

    const [sql] = connection.query.mock.calls[0];
    expect(sql).toContain("DATE_FORMAT(occurrence_date, '%Y-%m-%d') AS occurrenceDate");
    expect(sql).toContain('MIN(j.scheduled_at_local)');
    expect(sql).toContain('AS actionAt');
    expect(sql).toContain('priority DESC');
    expect(sql).toContain('actionAt ASC');
    expect(sql).toContain('occurrence_no ASC');
  });

  it('支持按下一步时间和优先级排序，未知排序仍拒绝', async () => {
    connection.query.mockResolvedValue([[]]);
    await expect(listTodoPage(connection, 'user-4', { sort: 'action', includeTotal: false })).resolves.toMatchObject({
      items: [],
    });
    await expect(listTodoPage(connection, 'user-4', { sort: 'priority', includeTotal: false })).resolves.toMatchObject({
      items: [],
    });
    await expect(listTodoPage(connection, 'user-4', { sort: 'random' })).rejects.toThrow('无效的待办筛选参数');
  });

  it('工作台逾期筛选同时覆盖已过截止时间和已错过的计划实例', async () => {
    connection.query.mockResolvedValueOnce([[]]);

    const result = await listTodoPage(connection, 'user-4', {
      status: 'pending',
      due: 'overdue',
      sort: 'due',
      limit: 3,
      includeTotal: false,
    });

    expect(result.items).toEqual([]);
    const [sql, params] = connection.query.mock.calls[0];
    expect(sql).toContain('status = ?');
    expect(sql).toContain('due_at IS NOT NULL AND due_at < NOW()');
    expect(sql).toContain('occurrence_date IS NOT NULL AND occurrence_date < CURDATE()');
    expect(params).toEqual(['user-4', 'pending', 4, 0]);
  });

  it('工作台今日筛选覆盖今天到期和今天计划的实例', async () => {
    connection.query.mockResolvedValueOnce([[]]);

    await listTodoPage(connection, 'user-4', {
      status: 'pending',
      due: 'today',
      sort: 'due',
      limit: 5,
      includeTotal: false,
    });

    const [sql] = connection.query.mock.calls[0];
    expect(sql).toContain('due_at >= NOW() AND due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)');
    expect(sql).toContain('occurrence_date = CURDATE()');
  });

  it('最近创建按系列创建时间排序，不被后台滚动生成实例顶到最前', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await listTodoPage(connection, 'user-4', { status: 'pending', sort: 'newest', includeTotal: false });
    const [sql] = connection.query.mock.calls[0];
    expect(sql).toContain('SELECT s.create_time FROM todo_series s WHERE s.id = todo_items.series_id');
    expect(sql).toContain('occurrence_no ASC');
  });

  it('拒绝未知的 due 筛选取值', async () => {
    await expect(listTodoPage(connection, 'user-4', { due: 'someday' })).rejects.toThrow('无效的待办筛选参数');
    expect(connection.query).not.toHaveBeenCalled();
  });

  describe('queryTodoAttentionCounts 导航角标计数', () => {
    it('只统计未完成且未删除的待办，一次查询同时得到逾期与今天', async () => {
      connection.query.mockResolvedValueOnce([[{ todoOverdueTotal: 1, todoDueTodayTotal: 2, todoDueWeekTotal: 5 }]]);

      const result = await queryTodoAttentionCounts(connection, 'user-9');

      expect(result).toEqual({ todoOverdueTotal: 1, todoDueTodayTotal: 2, todoDueWeekTotal: 5, todoAttentionTotal: 3 });
      expect(connection.query).toHaveBeenCalledTimes(1);
      const [sql, params] = connection.query.mock.calls[0];
      expect(sql).toContain("status = 'pending'");
      expect(sql).toContain('del_flag = 0');
      expect(params).toEqual(['user-9']);
    });

    /**
     * 角标与待办列表、工作台摘要必须共用同一份日期定义。
     * 分界点是「当前时刻」而不是「今天 00:00」：今天已过截止时间的待办算逾期，
     * 与列表分组一致；断言这两段 SQL 与 due=overdue / due=today 完全一致。
     */
    it('复用列表的同一份日期边界，不另写一套 SQL', async () => {
      connection.query.mockResolvedValueOnce([[{ todoOverdueTotal: 0, todoDueTodayTotal: 0 }]]);
      await queryTodoAttentionCounts(connection, 'user-9');
      const [attentionSql] = connection.query.mock.calls[0];

      connection.query.mockReset();
      connection.query.mockResolvedValueOnce([[]]);
      await listTodoPage(connection, 'user-9', { status: 'pending', due: 'overdue', includeTotal: false });
      const [overdueSql] = connection.query.mock.calls[0];

      connection.query.mockReset();
      connection.query.mockResolvedValueOnce([[]]);
      await listTodoPage(connection, 'user-9', { status: 'pending', due: 'today', includeTotal: false });
      const [todaySql] = connection.query.mock.calls[0];

      const OVERDUE = 'due_at IS NOT NULL AND due_at < NOW()';
      const TODAY = 'due_at IS NOT NULL AND due_at >= NOW() AND due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)';
      expect(overdueSql).toContain(OVERDUE);
      expect(todaySql).toContain(TODAY);
      expect(attentionSql).toContain(OVERDUE);
      expect(attentionSql).toContain(TODAY);
    });

    /**
     * 互斥性是这个口径的正确性前提：overdue 用 `< NOW()`、today 用 `>= NOW()`，
     * 同一条待办不可能同时落进两个 SUM，因此总数恒等于两个分项之和。
     */
    it('逾期与今天互斥，普通无日期待办仍被排除，计划实例按 occurrence_date 归档', async () => {
      connection.query.mockResolvedValueOnce([[{ todoOverdueTotal: 4, todoDueTodayTotal: 3 }]]);

      const result = await queryTodoAttentionCounts(connection, 'user-9');
      expect(result.todoAttentionTotal).toBe(result.todoOverdueTotal + result.todoDueTodayTotal);

      const [sql] = connection.query.mock.calls[0];
      // 分界点互补：一边严格早于当前时刻，另一边从当前时刻起算
      expect(sql).toContain('due_at < NOW()');
      expect(sql).toContain('due_at >= NOW()');
      // 上界封在明天 00:00，未来待办不计入
      expect(sql).toContain('DATE_ADD(CURDATE(), INTERVAL 1 DAY)');
      // 普通无日期待办不进任何一档；固定日程即使没有 due_at，也按实例日统计。
      expect(sql.match(/due_at IS NOT NULL/g)).toHaveLength(3);
      expect(sql).toContain('occurrence_date < CURDATE()');
      expect(sql).toContain('occurrence_date = CURDATE()');
    });

    it('没有任何待办时 SUM 返回 NULL，计数归一为 0 而不是 NaN', async () => {
      connection.query.mockResolvedValueOnce([[{ todoOverdueTotal: null, todoDueTodayTotal: null }]]);

      await expect(queryTodoAttentionCounts(connection, 'user-9')).resolves.toEqual({
        todoOverdueTotal: 0,
        todoDueTodayTotal: 0,
        todoDueWeekTotal: 0,
        todoAttentionTotal: 0,
      });
    });

    it('结果行缺失时不抛错，按 0 处理', async () => {
      connection.query.mockResolvedValueOnce([[]]);

      await expect(queryTodoAttentionCounts(connection, 'user-9')).resolves.toEqual({
        todoOverdueTotal: 0,
        todoDueTodayTotal: 0,
        todoDueWeekTotal: 0,
        todoAttentionTotal: 0,
      });
    });
  });

  it('Agent 摘要分页不读取说明或提醒邮箱，并返回清单进度和下一页游标', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '整理发票',
            checklist: JSON.stringify([
              { id: 'a', text: '归档', done: true },
              { id: 'b', text: '核对', done: false },
            ]),
            priority: 2,
            status: 'pending',
            dueAt: '2026-07-24 10:00:00',
            completedAt: null,
          },
          {
            id: 'todo-2',
            title: '下一条',
            checklist: '[]',
            priority: 1,
            status: 'pending',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([
        [
          { todoId: 'todo-1', channel: 'in_app' },
          { todoId: 'todo-1', channel: 'email' },
        ],
      ]);

    const result = await listTodoPage(connection, 'user-5', { status: 'pending', limit: 1, view: 'summary' });

    expect(connection.query.mock.calls[0][0]).toContain('LIMIT ? OFFSET ?');
    expect(connection.query.mock.calls[0][0]).not.toContain('description');
    expect(connection.query.mock.calls[0][1]).toEqual(['user-5', 'pending', 2, 0]);
    expect(connection.query.mock.calls[2][0]).not.toContain('target_email');
    expect(result).toEqual({
      items: [
        {
          id: 'todo-1',
          title: '整理发票',
          priority: 2,
          status: 'pending',
          dueAt: '2026-07-24 10:00:00',
          actionAt: null,
          completedAt: null,
          checklistProgress: { completed: 1, total: 2 },
          reminderChannels: ['in_app', 'email'],
        },
      ],
      total: 2,
      nextCursor: expect.any(String),
    });
  });

  it('为 Agent 状态修改按关键词冻结单个待办和权威版本，不向模型暴露待办说明', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '整理发票',
            description: '仅服务端快照使用',
            checklist: '[]',
            priority: 2,
            status: 'pending',
            dueAt: '2026-07-24 10:00:00',
            completedAt: null,
            updatedAt: '2026-07-23 10:00:00',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ activeReminderCount: 2 }]]);

    const result = await prepareTodoStatusChange(connection, 'user-6', {
      keyword: '发票',
      status: 'completed',
    });

    expect(connection.query.mock.calls[0]).toEqual([expect.stringContaining('title LIKE ?'), ['user-6', '%发票%']]);
    expect(connection.query.mock.calls[0][0]).not.toContain('SELECT *');
    expect(result).toMatchObject({
      todoId: 'todo-1',
      status: 'completed',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      activeReminderCount: 2,
    });
    expect(result.expectedVersion).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('checklist');
  });

  it('多个同名待办不会默认选择，而是返回服务端白名单候选', async () => {
    connection.query.mockResolvedValueOnce([
      [
        { id: 'todo-1', title: '周报', checklist: '[]', priority: 1, status: 'pending', updatedAt: '2026-07-23' },
        { id: 'todo-2', title: '周报', checklist: '[]', priority: 2, status: 'pending', updatedAt: '2026-07-22' },
      ],
    ]);

    await expect(
      prepareTodoStatusChange(connection, 'user-7', { keyword: '周报', status: 'completed' }),
    ).rejects.toMatchObject({
      code: 'TODO_SELECTION_REQUIRED',
      status: 409,
      data: {
        candidates: [
          { todoId: 'todo-1', title: '周报', status: 'pending' },
          { todoId: 'todo-2', title: '周报', status: 'pending' },
        ],
      },
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('按标题关键词冻结目标时把 LIKE 通配符按字面文本处理', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(
      prepareTodoStatusChange(connection, 'user-7', { keyword: '100%', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_NOT_FOUND' });
    expect(connection.query.mock.calls[0][1]).toEqual(['user-7', '%100\\%%']);
  });

  it('准备阶段会拒绝不存在和已处于目标状态的待办', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(
      prepareTodoStatusChange(connection, 'user-8', { todoId: 'missing', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_NOT_FOUND', status: 404 });

    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'todo-3',
          title: '已完成事项',
          checklist: '[]',
          priority: 1,
          status: 'completed',
          updatedAt: '2026-07-23',
        },
      ],
    ]);
    await expect(
      prepareTodoStatusChange(connection, 'user-8', { todoId: 'todo-3', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_STATUS_NOOP', status: 409 });
  });

  it('确认执行在事务内锁定待办、复核版本，并复用统一状态 Service 暂停提醒', async () => {
    const row = {
      id: 'todo-4',
      title: '完成合同',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'pending',
      dueAt: '2026-07-24 18:00:00',
      recurrenceRule: null,
      completedAt: null,
      updatedAt: '2026-07-23 11:00:00',
    };
    connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ activeReminderCount: 1 }]]);
    const prepared = await prepareTodoStatusChange(connection, 'user-9', { todoId: 'todo-4', status: 'completed' });
    connection.query.mockReset();
    connection.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[{ activeReminderCount: 2 }]])
      .mockResolvedValueOnce([[{ ...row, due_at: row.dueAt, recurrence_rule: null }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await applyTodoStatusChange(connection, 'user-9', prepared);

    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-4', 'user-9']);
    expect(connection.query.mock.calls[1][0]).toContain('COUNT(*)');
    expect(connection.query.mock.calls[2][0]).toContain('SELECT * FROM todo_items');
    expect(connection.query.mock.calls[4][0]).toContain('UPDATE todo_items');
    const pauseReminderCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes("status = 'paused_complete'"),
    );
    expect(pauseReminderCall?.[0]).toContain('UPDATE todo_reminders');
    expect(result).toMatchObject({
      state: 'changed',
      todoId: 'todo-4',
      title: '完成合同',
      previousStatus: 'pending',
      status: 'completed',
      pausedReminderCount: 2,
    });
  });

  it('确认前目标被修改时拒绝写入；若已被改为目标状态则安全返回 noop', async () => {
    const row = {
      id: 'todo-5',
      title: '更新状态',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'pending',
      dueAt: null,
      completedAt: null,
      updatedAt: '2026-07-23 11:00:00',
    };
    connection.query.mockResolvedValueOnce([[row]]);
    await expect(
      applyTodoStatusChange(connection, 'user-10', {
        todoId: 'todo-5',
        status: 'completed',
        expectedVersion: 'outdated-version',
      }),
    ).rejects.toMatchObject({ code: 'TODO_STATUS_CONFLICT', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);

    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[{ ...row, status: 'completed', completedAt: '2026-07-23 12:00:00' }]]);
    await expect(
      applyTodoStatusChange(connection, 'user-10', {
        todoId: 'todo-5',
        status: 'completed',
        expectedVersion: 'any-snapshot',
      }),
    ).resolves.toMatchObject({ state: 'noop', status: 'completed' });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('Agent 删除预检按 owner 冻结单条普通待办并默认仅当前项', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-delete-1',
            title: '整理发票',
            description: null,
            checklist: '[]',
            priority: 2,
            status: 'pending',
            dueAt: '2026-08-12 18:00:00',
            recurrenceRule: null,
            completedAt: null,
            updatedAt: '2026-08-11 10:00:00',
            planVersion: 1,
            seriesId: null,
            occurrenceNo: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ activeReminderCount: 2 }]]);

    const prepared = await prepareTodoDeletion(connection, 'user-delete-1', { keyword: '发票' });

    expect(connection.query.mock.calls[0]).toEqual([
      expect.stringContaining('title LIKE ?'),
      ['user-delete-1', '%发票%'],
    ]);
    expect(prepared).toMatchObject({
      todoId: 'todo-delete-1',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      scope: 'current',
      activeReminderCount: 2,
      expectedVersion: expect.any(String),
    });
    expect(prepared).not.toHaveProperty('description');
    expect(prepared).not.toHaveProperty('checklist');
  });

  it('Agent 删除任务系列时范围缺失会失败关闭', async () => {
    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'todo-series-delete-1',
          title: '每周周报',
          checklist: '[]',
          priority: 1,
          status: 'pending',
          recurrenceRule: null,
          updatedAt: '2026-08-11 10:00:00',
          planVersion: 2,
          seriesId: 'series-1',
          occurrenceNo: 3,
        },
      ],
    ]);

    await expect(
      prepareTodoDeletion(connection, 'user-delete-2', { todoId: 'todo-series-delete-1' }),
    ).rejects.toMatchObject({ code: 'TODO_DELETE_SCOPE_REQUIRED', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('Agent 删除确认在事务内复核版本并复用普通待办软删除 Service', async () => {
    const row = {
      id: 'todo-delete-2',
      title: '清理旧任务',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'completed',
      dueAt: null,
      recurrenceRule: null,
      completedAt: '2026-08-10 10:00:00',
      updatedAt: '2026-08-11 09:00:00',
      planVersion: 1,
      seriesId: null,
      occurrenceNo: null,
    };
    connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ activeReminderCount: 0 }]]);
    const prepared = await prepareTodoDeletion(connection, 'user-delete-3', { todoId: row.id });
    connection.query.mockReset();
    connection.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await applyTodoDeletion(connection, 'user-delete-3', prepared);

    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-delete-2', 'user-delete-3']);
    expect(connection.query.mock.calls[1][0]).toContain('SET del_flag = 1');
    expect(connection.query.mock.calls[1][1]).toEqual(['todo-delete-2', 'user-delete-3']);
    expect(result).toMatchObject({
      state: 'deleted',
      todoId: 'todo-delete-2',
      title: '清理旧任务',
      previousStatus: 'completed',
      scope: 'current',
      affectedItems: 1,
    });
  });

  it('Agent 删除确认前目标变更会拒绝写入', async () => {
    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'todo-delete-3',
          title: '已变更待办',
          checklist: '[]',
          priority: 1,
          status: 'pending',
          updatedAt: '2026-08-11 12:00:00',
          planVersion: 1,
        },
      ],
    ]);

    await expect(
      applyTodoDeletion(connection, 'user-delete-4', {
        todoId: 'todo-delete-3',
        scope: 'current',
        expectedVersion: 'outdated-version',
      }),
    ).rejects.toMatchObject({ code: 'TODO_DELETE_CONFLICT', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
});
