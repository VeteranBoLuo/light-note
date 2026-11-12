import { describe, expect, it, vi } from 'vitest';
import { createSingleTodoPlan, singleTodoPlanDraft, upgradePlainTodoPlan } from './todoSingleTaskService.js';

const now = new Date('2026-11-06T00:00:00Z');
const legacy = (extra = {}) => ({
  id: 'original',
  user_id: 'owner',
  title: '已有示例',
  description: '保留正文',
  priority: 1,
  status: 'pending',
  del_flag: 0,
  plan_version: 1,
  due_at: null,
  start_at: null,
  ...extra,
});
function database(row = legacy(), reminders = 0) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM todo_items')) return [[row].filter(Boolean)];
      if (sql.includes('AS total')) return [[{ total: reminders }]];
      if (sql.includes('FROM todo_plan_requests')) return [[]];
      return [{ affectedRows: 1 }];
    }),
  };
}
const updates = (db) => db.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE todo_items'));

describe('internal single todo creation and safe sample upgrade', () => {
  it.each([null, '2026-11-07 18:00:00', '2026-11-05 18:00:00'])(
    'creates a real v2 single task with dueAt=%s without a legacy reminder',
    async (dueAt) => {
      const db = database();
      const result = await createSingleTodoPlan(
        db,
        'owner',
        { title: '普通待办', dueAt },
        {
          idempotencyKey: 'sample-create',
          now,
          suppressUserRewards: true,
          invalidateSearch: false,
        },
      );
      const row = db.query.mock.calls.find(([sql]) => sql === 'INSERT INTO todo_items SET ?')[1][0];
      expect(row).toMatchObject({
        id: result.id,
        plan_version: 2,
        series_id: null,
        due_at: dueAt,
        occurrence_date: dueAt ? dueAt.slice(0, 10) : null,
        instance_timezone: 'Asia/Shanghai',
        instance_state: 'normal',
      });
      expect(
        db.query.mock.calls.some(([sql]) => /INSERT.*todo_(reminders|reminder_rules|reminder_jobs|series)\b/.test(sql)),
      ).toBe(false);
      expect(db.query.mock.calls.some(([sql]) => sql.includes('growth_events'))).toBe(false);
    },
  );
  it('keeps optional organization fields absent instead of clearing them implicitly', () => {
    expect(singleTodoPlanDraft({ title: '任务' })).not.toHaveProperty('listId');
    expect(singleTodoPlanDraft({ title: '任务' })).not.toHaveProperty('tagIds');
    expect(singleTodoPlanDraft({ title: '任务', listId: null, tagIds: [] })).toMatchObject({
      listId: null,
      tagIds: [],
    });
  });
  it.each([{ recurrence: { frequency: 'daily' } }, { reminder: { mode: 'once' } }])(
    'refuses to discard a legacy schedule: %o',
    (input) => {
      expect(() => singleTodoPlanDraft({ title: '任务', ...input })).toThrow('普通任务入口不能隐式丢弃重复或提醒配置');
    },
  );
  it('upgrades in place using preview metadata without rewriting content, ownership or references', async () => {
    const db = database(legacy({ due_at: '2026-11-07 18:00:00' }));
    expect(await upgradePlainTodoPlan(db, 'owner', 'original', { now })).toBe(true);
    expect(updates(db)).toHaveLength(1);
    expect(updates(db)[0][1]).toEqual(['2026-11-07', 'Asia/Shanghai', 'normal', 'original', 'owner']);
    expect(db.query.mock.calls.some(([sql]) => /INSERT|DELETE|SET title|SET status/.test(sql))).toBe(false);
  });
  it('dry-run performs no writes or locking reads', async () => {
    const db = database();
    expect(await upgradePlainTodoPlan(db, 'owner', 'original', { apply: false, now })).toBe(true);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT') && !sql.includes('FOR UPDATE'))).toBe(true);
  });
  it.each([
    { plan_version: 2 },
    { del_flag: 1 },
    { status: 'completed' },
    { series_id: 'series' },
    { recurrence_rule: '{}' },
    { generated_by_todo_id: 'parent' },
    { is_exception: 1 },
  ])('preserves historical/custom tasks: %o', async (extra) => {
    const db = database(legacy(extra));
    expect(await upgradePlainTodoPlan(db, 'owner', 'original', { now })).toBe(false);
    expect(updates(db)).toHaveLength(0);
  });
  it('retains any existing reminder history, including cancelled rows', async () => {
    const db = database(legacy(), 1);
    expect(await upgradePlainTodoPlan(db, 'owner', 'original', { now })).toBe(false);
    expect(updates(db)).toHaveLength(0);
  });
  it('allows a verified managed visitor completion without awarding or reopening it', async () => {
    const db = database(legacy({ status: 'completed' }));
    expect(await upgradePlainTodoPlan(db, 'owner', 'original', { now, allowCompleted: true })).toBe(true);
    expect(updates(db)[0][0]).not.toContain('status=');
  });
});
