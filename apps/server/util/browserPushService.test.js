import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
import pool from '../db/index.js';
import { browserPushEnabled, validatePushSubscription, pushFailure } from './browserPushPolicy.js';
import {
  expandPushOutbox,
  processNextPush,
  bindPushSubscription,
  unbindPushSubscription,
} from './browserPushService.js';
import { createNotification } from './notification.js';
import { createManorNudgeService } from './services/knowledgeManorNudges.js';
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  BROWSER_PUSH_ORIGIN: 'https://light.test',
  BROWSER_PUSH_ENABLED: 'true',
  BROWSER_PUSH_VAPID_PUBLIC_KEY: 'public',
  BROWSER_PUSH_VAPID_PRIVATE_KEY: 'private',
  BROWSER_PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
};
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: {
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'),
    auth: Buffer.alloc(16, 1).toString('base64url'),
  },
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('browser push policy', () => {
  it('fails closed without explicit enabled VAPID configuration', () => {
    expect(browserPushEnabled({})).toBe(false);
    expect(browserPushEnabled(env)).toBe(true);
    expect(browserPushEnabled({ ...env, BROWSER_PUSH_VAPID_PRIVATE_KEY: '' })).toBe(false);
  });
  it('accepts valid provider subscriptions and rejects SSRF targets and malformed keys', () => {
    expect(validatePushSubscription(subscription)).toEqual(subscription);
    const quark = { ...subscription, endpoint: 'https://jmt17.google.com/fcm/send/test' };
    expect(validatePushSubscription(quark)).toEqual(quark);
    for (const endpoint of [
      'http://jmt17.google.com/send',
      'https://jmt17.google.com.evil.test/send',
      'https://evil.jmt17.google.com/send',
      'https://u:p@jmt17.google.com/send',
      'https://jmt17.google.com:444/send',
      'https://jmt17.google.com/send#fragment',
      'https://google.com/send',
      'http://fcm.googleapis.com/send',
      'https://127.0.0.1/send',
      'https://fcm.googleapis.com.evil.test/send',
      'https://u:p@fcm.googleapis.com/send',
      'https://fcm.googleapis.com:444/send',
    ]) {
      expect(() => validatePushSubscription({ ...subscription, endpoint })).toThrow();
    }
    expect(() =>
      validatePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'short' } }),
    ).toThrow();
  });
  it('bounds retries and expires invalid endpoints', () => {
    expect(pushFailure(410, 1)).toBe('invalid');
    expect(pushFailure(429, 1)).toBe('pending');
    expect(pushFailure(503, 8)).toBe('failed');
    expect(pushFailure(403, 1)).toBe('failed');
  });
});
describe('transactional notification outbox', () => {
  it('来源调查邀请在浏览器和华为推送同时启用时也只写站内通知', async () => {
    for (const [key, value] of Object.entries({
      ...env,
      HUAWEI_PUSH_ENABLED: 'true',
      HUAWEI_PUSH_APP_ID: '123',
      HUAWEI_PUSH_PROJECT_ID: '456',
      HUAWEI_PUSH_APP_SECRET: 'test-secret',
      HUAWEI_PUSH_ORIGIN: 'https://light.test',
    }))
      vi.stubEnv(key, value);
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await createNotification('user-1', { type: 'signup_source_survey', title: '来源调查' }, conn);
    expect(conn.query.mock.calls[0][1][0].browser_push_pending).toBe(0);
  });
  it('writes the marker in the same INSERT and caller transaction; dedup does not enqueue another row', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const conn = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]),
    };
    const payload = { type: 'system', title: 'Hello', sourceType: 'test', sourceId: 'source-1' };
    const first = await createNotification('user-1', payload, conn);
    expect(first).toBeTruthy();
    expect(await createNotification('user-1', payload, conn)).toBeNull();
    expect(conn.query.mock.calls[0][0]).toContain('browser_push_created_at = CURRENT_TIMESTAMP(6)');
    expect(conn.query.mock.calls[0][1][0].browser_push_pending).toBe(1);
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('rolls back expansion if device fanout fails; outbox can be retried after restart', async () => {
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'n1' }]])
        .mockRejectedValueOnce(new Error('database')),
    };
    await expect(expandPushOutbox({ getConnection: async () => conn }, env)).rejects.toThrow();
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });
  it('expands only subscriptions active before creation, then consumes outbox atomically', async () => {
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'n1' }]])
        .mockResolvedValue([{ affectedRows: 1 }]),
    };
    expect(await expandPushOutbox({ getConnection: async () => conn }, env)).toBe(1);
    expect(conn.query.mock.calls[1][0]).toContain('s.enabled_at <= n.browser_push_created_at');
    expect(conn.query.mock.calls[1][0]).toContain('INSERT IGNORE');
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});
function workerDb({
  ttl = 300,
  active = true,
  ownerEligible = true,
  preferences = {},
  notification = { id: 'n1', type: 'todo_reminder', title: '待办提醒', content: '做事' },
  endpoint = subscription.endpoint,
} = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.startsWith("UPDATE browser_push_jobs SET status = 'sending'")) return [{ affectedRows: 1 }];
      if (sql.includes('FROM browser_push_jobs WHERE lease_token'))
        return [
          [
            {
              id: 1,
              notification_id: 'n1',
              subscription_id: 's1',
              generation: 'g1',
              ttl,
              attempts: 1,
              delay_seconds: 3,
            },
          ],
        ];
      if (sql.startsWith('SELECT id FROM browser_push_jobs')) return [[{ id: 1 }]];
      if (sql.includes('SELECT s.*'))
        return [
          active
            ? [
                {
                  id: 's1',
                  generation: 'g1',
                  user_id: 'u1',
                  endpoint,
                  ...subscription.keys,
                  locale: 'zh-CN',
                  push_preferences: JSON.stringify(preferences),
                },
              ]
            : [],
        ];
      if (sql.startsWith('SELECT * FROM notification')) return [[notification]];
      if (sql.includes('FROM user WHERE id'))
        return [ownerEligible ? [{ push_preferences: JSON.stringify(preferences) }] : []];
      return [{ affectedRows: 1 }];
    }),
  };
}
describe('push worker', () => {
  it('defers only browser delivery during quiet hours without consuming retries', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-08T15:00:00Z'));
      const preferences = {
        notificationsDnd: true,
        notificationsDndStart: '22:00',
        notificationsDndEnd: '08:00',
        notificationsTimezoneOffset: -480,
      };
      const db = workerDb({ ttl: 86400, preferences }),
        send = vi.fn();
      expect((await processNextPush({ db, send, env })).status).toBe('deferred');
      expect(send).not.toHaveBeenCalled();
      expect(db.query.mock.calls.at(-1)[0]).toContain('attempts = GREATEST(0, attempts - 1)');
      expect(db.query.mock.calls.at(-1)[1][0]).toBe(60);
      vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
      expect((await processNextPush({ db, send, env })).status).toBe('accepted');
      expect(send).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it('expires queued pushes even during quiet hours', async () => {
    const db = workerDb({ ttl: 0, preferences: { notificationsDnd: true } }),
      send = vi.fn();
    expect((await processNextPush({ db, send, env })).status).toBe('expired');
    expect(send).not.toHaveBeenCalled();
  });
  it('sends once under an atomic lease; payload only opens notification center', async () => {
    const db = workerDb(),
      send = vi.fn();
    expect(await processNextPush({ db, send, env })).toEqual({ status: 'accepted', delaySeconds: 3 });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toMatchObject({
      notificationId: 'n1',
      title: '待办提醒',
      body: '做事',
      userId: 'u1',
    });
    expect(send.mock.calls[0][1]).not.toHaveProperty('link');
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY id LIMIT 1');
    expect(db.query.mock.calls.at(-1)[0]).toContain("AND status = 'sending'");
  });
  it.each([
    { ttl: 0, active: true, status: 'expired' },
    { ttl: 100, active: false, status: 'cancelled' },
    { ttl: 100, active: true, ownerEligible: false, status: 'cancelled' },
  ])('does not send $status jobs', async ({ status, ...options }) => {
    const send = vi.fn();
    expect((await processNextPush({ db: workerDb(options), send, env })).status).toBe(status);
    expect(send).not.toHaveBeenCalled();
  });
  it('retries provider transport failures and invalidates 410 endpoints', async () => {
    for (const [statusCode, status] of [
      [503, 'pending'],
      [410, 'invalid'],
    ]) {
      const db = workerDb();
      const send = vi.fn().mockRejectedValue({ statusCode });
      expect((await processNextPush({ db, send, env })).status).toBe(status);
      if (statusCode === 410) expect(db.query.mock.calls.some(([sql]) => sql.includes('SET active = 3'))).toBe(true);
    }
  });
  it('losing worker does not fetch or send any task', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) },
      send = vi.fn();
    expect(await processNextPush({ db, send, env })).toBeNull();
    expect(db.query).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });
  it('unbind cancels only the authenticated device generation in one transaction', async () => {
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    await unbindPushSubscription('u1', 's1', 'g1', { getConnection: async () => conn });
    expect(conn.query.mock.calls[0][1]).toEqual(['s1', 'u1', 'g1']);
    expect(conn.query.mock.calls[1][1]).toEqual(['s1', 'g1']);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});

it('激活只接受等待客户端持久化的订阅，关闭后重放激活不能恢复推送', async () => {
  const { activatePushSubscription } = await import('./browserPushService.js');
  const db = {
    query: vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[]]),
  };
  expect(await activatePushSubscription('u1', 's1', 'g1', db)).toBe(false);
  expect(db.query.mock.calls[0][0]).toContain('AND active = 2');
  expect(db.query.mock.calls[1][0]).toContain('AND active = 1');
});

it.each([{ active: 3 }, { active: 0, invalid: 1 }])(
  'rejects reactivation of a provider-invalid endpoint',
  async (previous) => {
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'u1' }]])
        .mockResolvedValueOnce([[{ id: 's1', ...previous }]]),
    };
    await expect(
      bindPushSubscription('u1', subscription, 'zh-CN', { getConnection: async () => conn }),
    ).rejects.toMatchObject({ code: 'PUSH_SUBSCRIPTION_INVALID' });
    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
  },
);

const manorClock = new Date('2026-11-02T13:00:00Z');
const manorNotice = () => ({
  id: 'n1',
  user_id: 'u1',
  type: 'manor_water_expiring',
  source_type: 'manor_daily',
  source_id: 'u1:20261102',
  meta: {
    manor: {
      dayKey: '20261102',
      timezone: 'Asia/Shanghai',
      expiresAt: '2026-11-02T16:00:00.000Z',
      water: 10,
      ripe: 2,
      tankFull: 0,
      compostFull: false,
      crafted: false,
      rewards: 0,
    },
  },
});
const manorEnv = { ...env, KNOWLEDGE_MANOR_ENABLED: 'true', KNOWLEDGE_MANOR_AUDIENCE: 'all' };
function manorWorker({ preferences = {}, endpoint, summary = { fresh: false, water: 2, ripe: 1 } } = {}) {
  const state = { clock: manorClock, preferences: { notifyManor: true, ...preferences }, summary };
  const notification = manorNotice(),
    db = workerDb({ ttl: 86400, preferences: state.preferences, notification, endpoint });
  const base = db.query.getMockImplementation();
  db.query.mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT id,role,del_flag,preferences FROM user'))
      return [[{ id: 'u1', role: 'user', del_flag: '0', preferences: state.preferences }]];
    if (sql.includes('FROM knowledge_manors WHERE user_id='))
      return [[{ updatedAtMs: manorClock.getTime() - 24 * 3600000, revision: 1 }]];
    if (sql.includes('FROM user_growth_preferences WHERE user_id=')) return [[{ timezone: 'Asia/Shanghai' }]];
    return base(sql, params);
  });
  const attention = vi.fn(async () => state.summary);
  const service = createManorNudgeService({
    db,
    env: manorEnv,
    now: () => state.clock,
    attention,
    runtimeReader: async () => ({ mode: 'open' }),
  });
  return { state, db, attention, service, notification };
}

describe('庄园推送沿用队列且最晚当晚零点失效', () => {
  it.each(['browser', 'huawei'])('%s 不向未明确开启庄园提醒的账号投递已有任务', async (channel) => {
    const f = manorWorker({
        preferences: { notifyManor: undefined },
        endpoint: channel === 'huawei' ? 'huawei:fixture-token' : undefined,
      }),
      send = vi.fn();
    const pushEnv =
      channel === 'huawei'
        ? {
            ...manorEnv,
            HUAWEI_PUSH_ENABLED: 'true',
            HUAWEI_PUSH_APP_ID: '123',
            HUAWEI_PUSH_PROJECT_ID: '456',
            HUAWEI_PUSH_APP_SECRET: 'fixture',
            HUAWEI_PUSH_ORIGIN: 'https://light.test',
          }
        : manorEnv;
    expect(
      (await processNextPush({ db: f.db, send, env: pushEnv, now: () => f.state.clock, manorNudges: f.service }))
        .status,
    ).toBe('cancelled');
    expect(send).not.toHaveBeenCalled();
    expect(f.attention).not.toHaveBeenCalled();
  });
  it('outbox 裁剪为账号零点与原 24 小时上限的较早值', async () => {
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[manorNotice()]])
        .mockResolvedValue([{ affectedRows: 1 }]),
    };
    await expandPushOutbox({ getConnection: async () => conn }, manorEnv, manorClock);
    expect(conn.query.mock.calls[1][0]).toContain(
      'LEAST(DATE_ADD(n.browser_push_created_at, INTERVAL 24 HOUR),FROM_UNIXTIME(?))',
    );
    expect(conn.query.mock.calls[1][1][0]).toBe(new Date('2026-11-02T16:00:00Z').getTime() / 1000);
  });
  it.each(['expired', 'invalid-source', 'invalid-meta'])('不展开 %s 的庄园通知，仍清除待处理标记', async (reason) => {
    const notice = manorNotice();
    if (reason === 'invalid-source') notice.source_type = 'wrong';
    if (reason === 'invalid-meta') notice.meta = {};
    const conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[notice]])
        .mockResolvedValue([{ affectedRows: 1 }]),
    };
    await expandPushOutbox(
      { getConnection: async () => conn },
      manorEnv,
      reason === 'expired' ? new Date('2026-11-02T16:00:00Z') : manorClock,
    );
    expect(conn.query.mock.calls).toHaveLength(2);
    expect(conn.query.mock.calls[1][0]).toContain('browser_push_pending = 0');
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('发送当前可收数量，缩短厂商 TTL，并保留原通知中心点击入口', async () => {
    const f = manorWorker(),
      send = vi.fn();
    expect(
      (await processNextPush({ db: f.db, send, env: manorEnv, now: () => f.state.clock, manorNudges: f.service }))
        .status,
    ).toBe('accepted');
    expect(send.mock.calls[0][1]).toMatchObject({ title: '有 2 滴任务水即将到期', notificationId: 'n1' });
    expect(send.mock.calls[0][1]).not.toHaveProperty('link');
    expect(send.mock.calls[0][2]).toBe(3 * 3600);
    expect(f.notification.meta.manor.water).toBe(10);
    expect(f.attention).toHaveBeenCalledOnce();
  });
  it('免打扰不反复统计，延到次日就过期且不外发', async () => {
    const f = manorWorker({
        preferences: {
          notificationsDnd: true,
          notificationsDndStart: '20:00',
          notificationsDndEnd: '08:00',
          notificationsTimezoneOffset: -480,
        },
      }),
      send = vi.fn();
    const options = { db: f.db, send, env: manorEnv, now: () => f.state.clock, manorNudges: f.service };
    expect((await processNextPush(options)).status).toBe('deferred');
    expect(f.attention).not.toHaveBeenCalled();
    f.state.clock = new Date('2026-11-03T00:00:00Z');
    expect((await processNextPush(options)).status).toBe('expired');
    expect(send).not.toHaveBeenCalled();
    expect(f.db.query.mock.calls.at(-1)[1][0]).toBe('expired');
  });
  it.each(['browser', 'huawei'])('%s 在领取后取消，不向厂商发送', async (channel) => {
    const f = manorWorker({
        endpoint: channel === 'huawei' ? 'huawei:fixture-token' : undefined,
        summary: { fresh: false, water: 0, ripe: 2 },
      }),
      send = vi.fn();
    const pushEnv =
      channel === 'huawei'
        ? {
            ...manorEnv,
            HUAWEI_PUSH_ENABLED: 'true',
            HUAWEI_PUSH_APP_ID: '123',
            HUAWEI_PUSH_PROJECT_ID: '456',
            HUAWEI_PUSH_APP_SECRET: 'fixture',
            HUAWEI_PUSH_ORIGIN: 'https://light.test',
          }
        : manorEnv;
    expect(
      (await processNextPush({ db: f.db, send, env: pushEnv, now: () => f.state.clock, manorNudges: f.service }))
        .status,
    ).toBe('cancelled');
    expect(send).not.toHaveBeenCalled();
  });
  it('华为仍使用 MARKETING 及统一文案，不借用待办分类', async () => {
    const f = manorWorker({ endpoint: 'huawei:fixture-token' }),
      send = vi.fn();
    const pushEnv = {
      ...manorEnv,
      HUAWEI_PUSH_ENABLED: 'true',
      HUAWEI_PUSH_APP_ID: '123',
      HUAWEI_PUSH_PROJECT_ID: '456',
      HUAWEI_PUSH_APP_SECRET: 'fixture',
      HUAWEI_PUSH_ORIGIN: 'https://light.test',
    };
    expect(
      (await processNextPush({ db: f.db, send, env: pushEnv, now: () => f.state.clock, manorNudges: f.service }))
        .status,
    ).toBe('accepted');
    expect(send.mock.calls[0][1].huawei).toMatchObject({ category: 'MARKETING', title: '轻笺通知' });
    expect(send.mock.calls[0][2]).toBe(10800);
  });
  it('资格读取失败有限重试，不能当作空结果取消或直接发出', async () => {
    const f = manorWorker(),
      send = vi.fn();
    f.attention.mockRejectedValueOnce({ code: 'ECONNRESET' });
    expect(
      (await processNextPush({ db: f.db, send, env: manorEnv, now: () => f.state.clock, manorNudges: f.service }))
        .status,
    ).toBe('pending');
    expect(send).not.toHaveBeenCalled();
    expect(f.db.query.mock.calls.at(-1)[1][0]).toBe('pending');
  });
});
