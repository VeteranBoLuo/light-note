import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn(), getConnection: vi.fn() } }));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));
import pool from '../db/index.js';
import { createNotification } from './notification.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { processDueTodoReminders, startTodoReminderScheduler } from './todoReminder.js';
import { processDueTodoReminderJobs, startTodoReminderV2Scheduler } from './todoReminderV2.js';
import { generateWeeklyReports } from './weeklyReport.js';
import { generateGrowthNudges } from './growth.js';
import { runOrganizeCompletionNotifications } from './services/organizeCompletionNotification.js';
import { expandPushOutbox, processNextPush } from './browserPushService.js';
import { browserPushEnabled } from './browserPushPolicy.js';

const pushEnv = {
  BROWSER_PUSH_ENABLED: 'true',
  BROWSER_PUSH_ORIGIN: 'https://light.test',
  BROWSER_PUSH_VAPID_PUBLIC_KEY: 'public',
  BROWSER_PUSH_VAPID_PRIVATE_KEY: 'private',
  BROWSER_PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('notification production isolation', () => {
  it.each(['local', 'development', 'dev', 'test', undefined])(
    '%s cannot consume upstream reminders or push jobs even with remote writes and push enabled',
    async (runtime) => {
      for (const [key, value] of Object.entries(pushEnv)) vi.stubEnv(key, value);
      vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', runtime);
      vi.stubEnv('NODE_ENV', undefined);
      vi.stubEnv('ALLOW_REMOTE_DATABASE_WRITES', 'true');

      startTodoReminderScheduler();
      startTodoReminderV2Scheduler();
      expect(vi.getTimerCount()).toBe(0);
      await processDueTodoReminders();
      await processDueTodoReminderJobs();
      await generateWeeklyReports();
      await generateGrowthNudges();
      await runOrganizeCompletionNotifications('worker');
      expect(await expandPushOutbox()).toBe(0);
      expect(await processNextPush()).toBeNull();

      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.getConnection).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
      expect(sendTrackedEmail).not.toHaveBeenCalled();
      expect(browserPushEnabled()).toBe(false);
    },
  );

  it('production still scans reminders when browser push is disabled', async () => {
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'production');
    vi.stubEnv('BROWSER_PUSH_ENABLED', 'false');
    pool.query.mockImplementation(async (sql) => (sql.trim().startsWith('SELECT') ? [[]] : [{ affectedRows: 0 }]));
    await processDueTodoReminders();
    await processDueTodoReminderJobs();
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(browserPushEnabled()).toBe(false);
    expect(notificationSchedulerEnabled()).toBe(true);
  });

  it('uses the existing runtime aliases and safe fallback', () => {
    expect(notificationSchedulerEnabled({ LIGHTNOTE_RUNTIME_ENV: 'prod' })).toBe(true);
    expect(notificationSchedulerEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(notificationSchedulerEnabled({ LIGHTNOTE_RUNTIME_ENV: 'local', NODE_ENV: 'production' })).toBe(false);
    expect(notificationSchedulerEnabled({})).toBe(false);
  });
});
