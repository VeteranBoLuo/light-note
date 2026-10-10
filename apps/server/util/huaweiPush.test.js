import { describe, it, expect, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
import { huaweiNotificationPresentation, huaweiPushEnabled, huaweiSubscription } from './huaweiPushPolicy.js';
import { createHuaweiTransport } from './huaweiPushTransport.js';
import { processNextPush } from './browserPushService.js';
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  HUAWEI_PUSH_ENABLED: 'true',
  HUAWEI_PUSH_APP_ID: '123',
  HUAWEI_PUSH_PROJECT_ID: '456',
  HUAWEI_PUSH_APP_SECRET: 'test-only',
  HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
};
const token = 'a'.repeat(100);
const response = (body) => ({ ok: true, json: async () => body });
describe('Huawei transport', () => {
  it('is disabled outside production or with incomplete configuration', () => {
    expect(huaweiPushEnabled(env)).toBe(true);
    expect(huaweiPushEnabled({ ...env, LIGHTNOTE_RUNTIME_ENV: 'local' })).toBe(false);
    expect(huaweiPushEnabled({ ...env, HUAWEI_PUSH_APP_SECRET: '' })).toBe(false);
    for (const bad of ['', 'x', {}, token + '\n', token + '/']) expect(() => huaweiSubscription(bad)).toThrow();
  });
  it('uses application OAuth, a fixed project endpoint and generic WORK content; caches OAuth', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'test-access', expires_in: 3600 }))
      .mockResolvedValue(response({ code: '80000000' }));
    const send = createHuaweiTransport(fetcher);
    await send(
      huaweiSubscription(token),
      {
        notificationId: 'n1',
        content: 'private content',
        huawei: huaweiNotificationPresentation(
          { type: 'todo_reminder', source_type: 'todo_reminder_job', source_id: 'j' },
          env,
        ),
      },
      900,
      env,
    );
    await send(huaweiSubscription(token), { notificationId: 'n1' }, 900, env);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1].body).toContain('client_id=123');
    const [url, request] = fetcher.mock.calls[1];
    expect(url).toBe('https://push-api.cloud.huawei.com/v2/456/messages:send');
    expect(request.redirect).toBe('error');
    const body = JSON.parse(request.body);
    expect(body.message.android).toMatchObject({ category: 'WORK', ttl: '300s', notification: { tag: 'n1' } });
    expect(request.body).not.toContain('private content');
    expect(body.message.token).toEqual([token]);
  });
  it.each([
    ['80300007', 410],
    ['80100000', 410],
    ['80300002', 400],
    ['80200003', 503],
    ['81000001', 503],
  ])('maps provider %s without exposing response contents', async (code, statusCode) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'test-access', expires_in: 3600 }))
      .mockResolvedValue(response({ code, msg: token }));
    await expect(
      createHuaweiTransport(fetcher)(huaweiSubscription(token), { notificationId: 'n' }, 300, env),
    ).rejects.toMatchObject({ statusCode });
  });
});
function workerDb(notification, source = true) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.startsWith("UPDATE browser_push_jobs SET status = 'sending'")) return [{ affectedRows: 1 }];
      if (sql.includes('FROM browser_push_jobs WHERE lease_token'))
        return [[{ id: 1, notification_id: 'n', subscription_id: 's', generation: 'g', ttl: 300, attempts: 1 }]];
      if (sql.includes('SELECT s.*'))
        return [[{ id: 's', user_id: 'u', generation: 'g', ...huaweiSubscription(token) }]];
      if (sql.includes('FROM user WHERE id')) return [[{ push_preferences: '{}', preferred_locale: 'zh-CN' }]];
      if (sql.startsWith('SELECT * FROM notification')) return [[notification]];
      if (sql.includes('FROM todo_reminder_jobs')) return [source ? [{ id: 'j' }] : []];
      if (sql.startsWith('SELECT id FROM browser_push_jobs')) return [[{ id: 1 }]];
      return [{ affectedRows: 1 }];
    }),
  };
}
describe('Huawei business routing', () => {
  it.each([
    { type: 'system' },
    { type: 'todo_reminder' },
    { type: 'community_chat', source_type: 'todo_reminder_job', source_id: 'j' },
  ])('routes other notification types without claiming WORK %j', async (notification) => {
    const send = vi.fn();
    expect((await processNextPush({ db: workerDb(notification), env, send })).status).toBe('accepted');
    expect(send.mock.calls[0][1].huawei.category).toBeUndefined();
  });
  it('requires an existing active todo reminder source', async () => {
    const n = { id: 'n', type: 'todo_reminder', source_type: 'todo_reminder_job', source_id: 'j' };
    const send = vi.fn();
    expect((await processNextPush({ db: workerDb(n, false), env, send })).status).toBe('cancelled');
    expect(send).not.toHaveBeenCalled();
    expect((await processNextPush({ db: workerDb(n), env, send })).status).toBe('accepted');
    expect(send).toHaveBeenCalledOnce();
  });
});

it('uses approved category only, preserving privacy and a fixed destination for all types', () => {
  const n = { type: 'community_chat', meta: { kind: 'reply' }, content: 'private message' };
  expect(huaweiNotificationPresentation(n, env).category).toBeUndefined();
  expect(
    huaweiNotificationPresentation(n, { ...env, HUAWEI_PUSH_APPROVED_CATEGORIES: 'WORK,SUBSCRIPTION' }).category,
  ).toBe('SUBSCRIPTION');
  expect(
    huaweiNotificationPresentation(
      { type: 'community_feed', meta: { kind: 'like' } },
      { ...env, HUAWEI_PUSH_APPROVED_CATEGORIES: 'SUBSCRIPTION' },
    ).category,
  ).toBe('SUBSCRIPTION');
  expect(huaweiNotificationPresentation({ type: 'system' }, env).category).toBeUndefined();
  expect(JSON.stringify(huaweiNotificationPresentation(n, env))).not.toContain('private message');
});
it('does not label generic messages as WORK in the actual provider request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ access_token: 'access', expires_in: 3600 }))
    .mockResolvedValue(response({ code: '80000000' }));
  await createHuaweiTransport(fetcher)(
    huaweiSubscription(token),
    { notificationId: 'n', huawei: huaweiNotificationPresentation({ type: 'system' }, env) },
    300,
    env,
  );
  const message = JSON.parse(fetcher.mock.calls[1][1].body).message;
  expect(message.android.category).toBeUndefined();
  expect(message.notification.title).toBe('轻笺通知');
});

it('queues community feed as well as generic notifications when only Huawei is enabled', async () => {
  vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'production');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv('BROWSER_PUSH_ENABLED', 'false');
  const { createNotification } = await import('./notification.js');
  const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
  try {
    for (const type of ['system', 'community_feed', 'community_chat', 'opinion_reply', 'level_up']) {
      await createNotification('u', { type, title: 'Notification' }, db);
      expect(db.query.mock.lastCall[1][0].browser_push_pending).toBe(1);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
