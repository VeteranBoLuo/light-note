import { describe, expect, it, vi } from 'vitest';
import { ensureSingleReminderBuffer, previewTodoPlan } from './todoSeriesService.js';

const schedule = {
  version: 1, mode: 'repeat', channels: ['in_app'],
  repeat: { kind: 'weekly', startDate: '2026-09-12', localTime: '18:35', weekdays: [1, 2, 3, 4, 5], stop: { type: 'completion_or_due' } },
};
function draft(stop = schedule.repeat.stop, due = false) {
  return {
    taskMode: 'single', title: '打卡',
    timing: { timezone: 'Asia/Shanghai', anchorDate: due ? '2026-10-01' : null, startTime: null, dueTime: due ? '20:00' : null },
    plan: { type: 'once', pastPolicy: 'keep_overdue' }, reminder: { mode: 'none' },
    singleTaskReminder: { ...schedule, repeat: { ...schedule.repeat, stop } },
  };
}
const now = new Date('2026-09-12T00:00:00Z');

describe('single reminder lifetime', () => {
  it.each([
    [{ type: 'completion_or_due' }, false, true],
    [{ type: 'completion_or_due' }, true, false],
    [{ type: 'completion' }, true, true],
    [{ type: 'manual' }, false, true],
    [{ type: 'until', until: '2026-10-01' }, false, false],
    [{ type: 'max_count', maxCount: 4 }, false, false],
  ])('reports the actual stopping condition: %j due=%s', (stop, due, ongoing) => {
    expect(previewTodoPlan(draft(stop, due), { now }).reminderIsOngoing).toBe(ongoing);
  });

  it('continues beyond the first window and years later without duplicating overlapping reminders', async () => {
    const rule = { id: 'rule', version: 1, user_id: 'user', todo_id: 'todo', title: '打卡', todo_status: 'pending', del_flag: 0,
      timezone: 'Asia/Shanghai', schedule_json: JSON.stringify({ version: 2, schedule }), start_at: null, due_at: null };
    const stored = new Map();
    const connection = { query: vi.fn(async (sql, args) => {
      if (sql.includes('FOR UPDATE')) return [[{ ...rule }]];
      if (sql.startsWith('SELECT channel')) return [[...stored.values()].map(job => ({ channel: job.channel, scheduled_at: job.original_scheduled_at_utc }))];
      if (sql.startsWith('INSERT IGNORE INTO todo_reminder_jobs')) {
        const columns = sql.match(/\(([^)]+)\)/)[1].split(',');
        for (const values of args[0]) {
          const row = Object.fromEntries(columns.map((key, i) => [key, values[i]]));
          const key = `${row.channel}|${row.original_scheduled_at_utc}`;
          expect(stored.has(key), 'same scheduled moment must not be inserted again').toBe(false);
          expect(row.stop_at_utc).toBeNull();
          stored.set(key, row);
        }
        return [{ affectedRows: args[0].length }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    expect((await ensureSingleReminderBuffer(connection, 'rule', { now })).reminderJobsCreated).toBeGreaterThan(0);
    const firstEnd = [...stored.values()].at(-1).original_scheduled_at_utc;
    expect((await ensureSingleReminderBuffer(connection, 'rule', { now: new Date('2026-10-15T00:00:00Z') })).reminderJobsCreated).toBeGreaterThan(0);
    expect([...stored.values()].at(-1).original_scheduled_at_utc > firstEnd).toBe(true);
    expect((await ensureSingleReminderBuffer(connection, 'rule', { now: new Date('2026-10-15T00:00:00Z') })).reminderJobsCreated).toBe(0);
    expect((await ensureSingleReminderBuffer(connection, 'rule', { now: new Date('2028-09-12T00:00:00Z') })).reminderJobsCreated).toBeGreaterThan(0);
    rule.todo_status = 'completed';
    expect((await ensureSingleReminderBuffer(connection, 'rule', { now: new Date('2029-01-01T00:00:00Z') })).reminderJobsCreated).toBe(0);
  });
});
