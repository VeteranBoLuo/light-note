import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTodoTestSchema } from '../../test-utils/todoSchema.js';

const mocks = vi.hoisted(() => ({ db: { getConnection: vi.fn(), query: vi.fn() } }));
vi.mock('../../db/index.js', () => ({ default: mocks.db }));
vi.mock('../notificationSchedulerPolicy.js', () => ({ notificationSchedulerEnabled: () => true }));
vi.mock('../notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('../emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));

import { createNotification } from '../notification.js';
import { sendTrackedEmail } from '../emailDelivery.js';
import { processDueTodoReminders } from '../todoReminder.js';
import { processDueTodoReminderJobs } from '../todoReminderV2.js';
import { listTodoPage } from './todoService.js';
import { ensureSeriesBuffer } from './todoSeriesService.js';
import { setTodoReminderPause } from './todoReminderPauseService.js';

const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socket)('todo reminder pause on isolated MySQL', () => {
  const schema = `todo_reminder_pause_${randomUUID().replaceAll('-', '')}`;
  let admin;
  let db;
  let created = false;

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw new Error('Use a disposable MySQL socket');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Use a disposable MySQL instance with TCP disabled');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await admin.query(`USE ${schema}`);
    await admin.query(`CREATE TABLE user (
      id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,
      del_flag TINYINT DEFAULT 0, preferences JSON
    ) ENGINE=InnoDB`);
    await installTodoTestSchema(admin);
    await admin.query("INSERT INTO user (id) VALUES ('owner'), ('other')");
    db = mysql.createPool({ socketPath: socket, user: 'root', database: schema, dateStrings: true, timezone: '+08:00' });
    mocks.db.getConnection.mockImplementation(async () => {
      const connection = await db.getConnection();
      await connection.query("SET time_zone = '+08:00'");
      return connection;
    });
    mocks.db.query.mockImplementation(async (...args) => {
      const connection = await mocks.db.getConnection();
      try {
        return await connection.query(...args);
      } finally {
        connection.release();
      }
    });
  });

  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  beforeEach(async () => {
    createNotification.mockClear();
    sendTrackedEmail.mockClear();
    for (const table of ['todo_reminder_jobs', 'todo_reminders', 'todo_reminder_rules', 'todo_items', 'todo_series', 'todo_reminder_pauses']) {
      await db.query(`DELETE FROM ${table}`);
    }
  });

  async function setPause(todoId, action, userId = 'owner') {
    const connection = await mocks.db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await setTodoReminderPause(connection, userId, { todoId, action });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function addTodo(id, { owner = 'owner', seriesId = null, planVersion = 2, timezone = 'Asia/Shanghai' } = {}) {
    await db.query('INSERT INTO todo_items SET ?', [{
      id, user_id: owner, title: id, series_id: seriesId, plan_version: planVersion, instance_timezone: timezone,
    }]);
  }

  async function addJob(todoId, id, seconds, { channel = 'in_app', retryCount = 0 } = {}) {
    await db.query(
      `INSERT INTO todo_reminder_jobs (id,user_id,todo_id,channel,timezone,dedupe_key,scheduled_at_utc,original_scheduled_at_utc,scheduled_at_local,retry_count)
       SELECT ?, i.user_id, i.id, ?, 'Asia/Shanghai', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
              DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), INTERVAL ? SECOND), ?
         FROM todo_items i WHERE i.id = ?`,
      [id, channel, id, seconds, seconds, seconds, retryCount, todoId],
    );
  }

  async function jobStatus(id) {
    const [[row]] = await db.query('SELECT status, cancel_reason FROM todo_reminder_jobs WHERE id = ?', [id]);
    return row;
  }

  it('shares one pause across a series, keeps generating tasks, and resumes without delivering the backlog', async () => {
    await db.query(`INSERT INTO todo_series (id, user_id, title, repeat_mode, timezone, schedule_rule)
      VALUES ('series', 'owner', '健身', 'scheduled', 'Asia/Shanghai', ?)`, [JSON.stringify({
      timing: { timezone: 'Asia/Shanghai', anchorDate: '2026-11-13' },
      plan: { type: 'scheduled', frequency: 'daily', end: { mode: 'never' }, pastPolicy: 'skip_missed' },
    })]);
    await addTodo('first', { seriesId: 'series' });
    await addTodo('foreign', { owner: 'other' });
    await expect(setPause('first', 'pause_week', 'other')).rejects.toMatchObject({ status: 404 });
    const paused = await setPause('first', 'pause_week');
    const remainingHours = (Date.parse(paused.reminderPausedUntil) - Date.now()) / 3_600_000;
    expect(remainingHours).toBeGreaterThan(167.99);
    expect(remainingHours).toBeLessThanOrEqual(168);
    expect(await setPause('first', 'pause_week')).toEqual(paused);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const generation = await ensureSeriesBuffer(connection, 'series', { now: new Date('2026-11-13T04:00:00Z') });
      expect(generation.createdCount).toBeGreaterThan(0);
      await connection.commit();
    } finally {
      connection.release();
    }
    const [[generated]] = await db.query("SELECT id FROM todo_items WHERE series_id = 'series' AND id <> 'first' LIMIT 1");
    const [series] = await db.query("SELECT status FROM todo_series WHERE id = 'series'");
    expect(series[0].status).toBe('active');
    const page = await listTodoPage(db, 'owner', { ids: ['first', generated.id] });
    expect(page.items.map(item => item.reminderPausedUntil)).toEqual([paused.reminderPausedUntil, paused.reminderPausedUntil]);

    await addJob('first', 'already-due', -10);
    await addJob(generated.id, 'new-instance-email', -5, { channel: 'email' });
    await addJob('foreign', 'other-owner', -5);
    await processDueTodoReminderJobs();
    expect(await jobStatus('already-due')).toEqual({ status: 'skipped', cancel_reason: 'reminder_paused' });
    expect(await jobStatus('new-instance-email')).toEqual({ status: 'skipped', cancel_reason: 'reminder_paused' });
    expect(await jobStatus('other-owner')).toMatchObject({ status: 'sent' });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(sendTrackedEmail).not.toHaveBeenCalled();

    await addJob(generated.id, 'missed-while-offline', -1);
    expect(await setPause(generated.id, 'resume')).toMatchObject({ reminderPausedUntil: null });
    await addJob('first', 'on-resume-boundary', 0);
    await processDueTodoReminderJobs();
    expect(await jobStatus('missed-while-offline')).toMatchObject({ status: 'skipped' });
    expect(await jobStatus('on-resume-boundary')).toMatchObject({ status: 'sent' });
  });

  it('expires without a resume request and preserves future reminders after downtime', async () => {
    await addTodo('single');
    await setPause('single', 'pause_week');
    await db.query(`UPDATE todo_reminder_pauses SET paused_from_utc = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY),
      paused_until_utc = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 SECOND) WHERE target_id = 'single'`);
    await addJob('single', 'missed', -60);
    await addJob('single', 'next-original-slot', -10);
    await addJob('single', 'retry-from-pause', -10, { retryCount: 1 });
    await db.query("UPDATE todo_reminder_jobs SET original_scheduled_at_utc = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND) WHERE id = 'retry-from-pause'");
    await processDueTodoReminderJobs();
    expect(await jobStatus('missed')).toMatchObject({ status: 'skipped' });
    expect(await jobStatus('retry-from-pause')).toMatchObject({ status: 'skipped' });
    expect(await jobStatus('next-original-slot')).toMatchObject({ status: 'sent' });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((await listTodoPage(db, 'owner', { ids: ['single'] })).items[0].reminderPausedUntil).toBeNull();
  });

  it('serializes simultaneous pause requests from different occurrences to one deadline', async () => {
    await addTodo('first', { seriesId: 'series' });
    await addTodo('second', { seriesId: 'series' });
    const [first, second] = await Promise.all([setPause('first', 'pause_week'), setPause('second', 'pause_week')]);
    expect(first.reminderPausedUntil).toBe(second.reminderPausedUntil);
    const [[count]] = await db.query("SELECT COUNT(*) AS total FROM todo_reminder_pauses WHERE target_id = 'series'");
    expect(count.total).toBe(1);
  });

  it('resumes at the same plan-local time across a daylight saving change', async () => {
    await addTodo('local-time', { timezone: 'America/New_York' });
    const now = Temporal.Instant.from('2099-03-07T15:15:00Z');
    const clock = vi.spyOn(Temporal.Now, 'zonedDateTimeISO').mockImplementation((zone) => now.toZonedDateTimeISO(zone));
    try {
      expect(await setPause('local-time', 'pause_week')).toMatchObject({ reminderPausedUntil: '2099-03-14T14:15:00Z' });
    } finally {
      clock.mockRestore();
    }
  });

  it('advances a legacy repeat to its first original slot at the cutoff and cancels a missed one-off', async () => {
    await addTodo('legacy', { planVersion: 1 });
    await addTodo('legacy-once', { planVersion: 1 });
    await setPause('legacy', 'pause_week');
    await setPause('legacy-once', 'pause_week');
    const anchor = '2000-01-01 18:10:00';
    await db.query(`UPDATE todo_reminder_pauses SET paused_from_utc = '1999-12-29 10:10:00',
      paused_until_utc = '2000-01-02 10:10:00'`);
    await db.query(
      `INSERT INTO todo_reminders (id,todo_id,user_id,scheduled_at,schedule_start_at,repeat_interval_minutes,repeat_end_at)
       VALUES ('repeat','legacy','owner',?,?,1440,'2000-01-02 18:10:00'), ('once','legacy-once','owner',?, ?,NULL,NULL)`,
      [anchor, anchor, anchor, anchor],
    );
    expect((await listTodoPage(db, 'owner', { ids: ['legacy'] })).items[0].reminder.nextAt).toBe('2000-01-02 18:10:00');
    await processDueTodoReminders();
    expect((await db.query('SELECT id,status,scheduled_at FROM todo_reminders ORDER BY id'))[0]).toEqual([
      { id: 'once', status: 'cancelled', scheduled_at: anchor },
      { id: 'repeat', status: 'pending', scheduled_at: '2000-01-02 18:10:00' },
    ]);
    expect(createNotification).not.toHaveBeenCalled();
    await processDueTodoReminders();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps the next original legacy slot available when resuming early', async () => {
    await addTodo('early-resume', { planVersion: 1 });
    await setPause('early-resume', 'pause_week');
    await mocks.db.query(`INSERT INTO todo_reminders
      (id,todo_id,user_id,scheduled_at,schedule_start_at,repeat_interval_minutes,repeat_end_at)
      VALUES ('daily','early-resume','owner',DATE_SUB(NOW(), INTERVAL 1 HOUR),DATE_SUB(NOW(), INTERVAL 1 HOUR),1440,DATE_ADD(NOW(), INTERVAL 14 DAY))`);
    await processDueTodoReminders();
    expect(createNotification).not.toHaveBeenCalled();
    const [[row]] = await mocks.db.query(`SELECT scheduled_at, status,
      TIMESTAMPDIFF(HOUR, schedule_start_at, scheduled_at) AS hoursFromAnchor
      FROM todo_reminders WHERE id = 'daily'`);
    expect(row).toMatchObject({ status: 'pending', hoursFromAnchor: 24 });
    await setPause('early-resume', 'resume');
    const page = await listTodoPage(db, 'owner', { ids: ['early-resume'] });
    expect(page.items[0]).toMatchObject({ reminderPausedUntil: null, reminder: { nextAt: row.scheduled_at } });
  });
});
