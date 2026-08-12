import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { CommunityChatRealtimeBroker } from './realtimeBroker.js';
import {
  __test__,
  CommunityChatRealtimeUpgradeLimiter,
  getCommunityChatRealtimeClientIp,
  isCommunityChatRealtimeOriginAllowed,
  registerCommunityChatRealtimeHub,
  resolveCommunityChatRealtimeAccess,
} from './realtimeHub.js';

const REALTIME_ENV = {
  NODE_ENV: 'test',
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_REALTIME_ENABLED: '1',
};

const cleanups = [];

async function createHarness(options = {}) {
  const server = http.createServer((_req, res) => res.end('ok'));
  const broker = new CommunityChatRealtimeBroker({ redis: null, logger: { error: vi.fn() } });
  const hub = registerCommunityChatRealtimeHub(server, {
    env: REALTIME_ENV,
    broker,
    logger: { error: vi.fn() },
    assertReadAccess: async () => ({ memberRole: 'visitor' }),
    manageBrokerLifecycle: false,
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const origin = `http://127.0.0.1:${port}`;
  cleanups.push(async () => {
    await hub.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
  return { broker, hub, origin, url: `ws://127.0.0.1:${port}/realtime/chat` };
}

function connectClient(url, origin, options = {}) {
  const events = [];
  const waiters = new Map();
  const ws = new WebSocket(url, { origin, ...options });
  ws.on('message', (raw) => {
    const event = JSON.parse(String(raw));
    events.push(event);
    const pending = waiters.get(event.type) || [];
    waiters.delete(event.type);
    for (const resolve of pending) resolve(event);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const waitFor = (type) => {
    const existing = events.find((event) => event.type === type);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const pending = waiters.get(type) || [];
      pending.push(resolve);
      waiters.set(type, pending);
    });
  };
  return { events, opened, waitFor, ws };
}

async function subscribe(client, presenceClientId = '') {
  await client.opened;
  client.ws.send(
    JSON.stringify({
      protocolVersion: 1,
      type: 'room.subscribe',
      requestId: 'subscribe-0001',
      payload: { roomSlug: 'general', ...(presenceClientId ? { presenceClientId } : {}) },
    }),
  );
  return client.waitFor('room.subscribed');
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

describe('communityChat realtime hub', () => {
  it('游客可以同源连接并订阅，广播包只触发 REST 权威刷新所需的公有标识', async () => {
    const { broker, origin, url } = await createHarness();
    const client = connectClient(url, origin);
    await subscribe(client);

    broker.publish('message.created', { roomSlug: 'general', messagePublicId: 'message-0001' });
    const event = await client.waitFor('message.created');

    expect(event).toMatchObject({
      protocolVersion: 1,
      type: 'message.created',
      payload: { roomSlug: 'general', messagePublicId: 'message-0001' },
    });
    expect(JSON.stringify(event)).not.toContain('userId');
    expect(JSON.stringify(event)).not.toContain('role');

    broker.publish('message.updated', { roomSlug: 'general', messagePublicId: 'message-0001', reason: 'recall' });
    const updated = await client.waitFor('message.updated');
    expect(updated.payload).toEqual({ roomSlug: 'general', messagePublicId: 'message-0001', reason: 'recall' });
  });

  it('在线人数按账号或游客浏览器去重，并在离线宽限后广播减少', async () => {
    const db = {
      query: vi.fn(async (_sql, params) => [[{ id: params[0], alias: params[0], role: 'user', del_flag: '0' }], []]),
    };
    const { hub, origin, url } = await createHarness({
      db,
      presenceGraceMs: 30,
      getSessionById: async (sid) => ({ user_id: sid }),
      getRestrictions: async () => [],
      assertReadAccess: async ({ user }) => ({ memberRole: user.role }),
    });
    const guestFirst = connectClient(url, origin);
    const guestSecondTab = connectClient(url, origin);
    const userFirst = connectClient(url, origin, { headers: { Cookie: 'sid=user-a' } });
    const userSecondDevice = connectClient(url, origin, { headers: { Cookie: 'sid=user-a' } });

    expect((await subscribe(guestFirst, 'guest-device-0001')).payload.onlineCount).toBe(1);
    expect((await subscribe(guestSecondTab, 'guest-device-0001')).payload.onlineCount).toBe(1);
    expect((await subscribe(userFirst, 'user-device-000001')).payload.onlineCount).toBe(2);
    expect((await subscribe(userSecondDevice, 'user-device-000002')).payload.onlineCount).toBe(2);
    expect(hub.getOnlineCount()).toBe(2);

    userFirst.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(hub.getOnlineCount()).toBe(2);
    userSecondDevice.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(hub.getOnlineCount()).toBe(1);
    const changed = guestFirst.events.filter((event) => event.type === 'presence.changed').at(-1);
    expect(changed?.payload).toEqual({ onlineCount: 1 });
  });

  it('按实时数据库账号认证 sid，并且定向权限事件不会泄漏给其他连接', async () => {
    const db = {
      query: vi.fn(async (_sql, params) => [[{ id: params[0], alias: params[0], role: 'user', del_flag: '0' }], []]),
    };
    const { broker, origin, url } = await createHarness({
      db,
      getSessionById: async (sid) => ({ user_id: sid === 'session-a' ? 'user-a' : 'user-b' }),
      getRestrictions: async () => [],
      assertReadAccess: async ({ user }) => ({ memberRole: user.role }),
    });
    const first = connectClient(url, origin, { headers: { Cookie: 'sid=session-a' } });
    const second = connectClient(url, origin, { headers: { Cookie: 'sid=session-b' } });
    await Promise.all([subscribe(first), subscribe(second)]);

    broker.publish('access.changed', { reason: 'community_banned', disconnect: true }, { targetUserId: 'user-a' });
    const event = await first.waitFor('access.changed');
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(event.payload).toEqual({ reason: 'community_banned', disconnect: true });
    expect(second.events.some((item) => item.type === 'access.changed')).toBe(false);
    expect(JSON.stringify(event)).not.toContain('user-a');
  });

  it('拒绝缺少 Origin 的升级请求，并在实时开关关闭时返回 503', async () => {
    const { url } = await createHarness();
    const missingOriginStatus = await new Promise((resolve) => {
      const ws = new WebSocket(url);
      ws.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
        response.resume();
      });
      ws.on('error', () => {});
    });
    expect(missingOriginStatus).toBe(403);

    const server = http.createServer();
    const broker = new CommunityChatRealtimeBroker({ redis: null, logger: { error: vi.fn() } });
    const hub = registerCommunityChatRealtimeHub(server, {
      env: { ...REALTIME_ENV, COMMUNITY_CHAT_REALTIME_ENABLED: '0' },
      broker,
      manageBrokerLifecycle: false,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const disabledStatus = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime/chat`, {
        origin: `http://127.0.0.1:${port}`,
      });
      ws.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
        response.resume();
      });
      ws.on('error', () => {});
    });
    expect(disabledStatus).toBe(503);
    await hub.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('Origin、IP 与升级频控采用失败关闭规则', () => {
    const req = {
      headers: {
        origin: 'https://boluo66.top',
        host: 'internal:9001',
        'x-forwarded-host': 'boluo66.top',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '203.0.113.8',
      },
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(isCommunityChatRealtimeOriginAllowed(req, { NODE_ENV: 'production' })).toBe(true);
    expect(
      isCommunityChatRealtimeOriginAllowed(
        { ...req, headers: { ...req.headers, origin: 'https://evil.example' } },
        { NODE_ENV: 'production' },
      ),
    ).toBe(false);
    expect(
      isCommunityChatRealtimeOriginAllowed(
        {
          ...req,
          headers: {
            ...req.headers,
            origin: 'https://evil.example',
            'x-forwarded-host': 'evil.example',
          },
          socket: { remoteAddress: '203.0.113.9' },
        },
        { NODE_ENV: 'production' },
      ),
    ).toBe(false);
    expect(getCommunityChatRealtimeClientIp(req)).toBe('203.0.113.8');
    const limiter = new CommunityChatRealtimeUpgradeLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.consume('203.0.113.8', 100)).toBe(true);
    expect(limiter.consume('203.0.113.8', 101)).toBe(true);
    expect(limiter.consume('203.0.113.8', 102)).toBe(false);
    expect(limiter.consume('203.0.113.8', 1101)).toBe(true);
    expect(__test__.realtimePathMatches({ url: '/realtime/chat?userId=root' })).toBe(false);
  });

  it('带 sid 时从 user 表读取实时角色，不信任会话角色快照', async () => {
    const db = {
      query: vi.fn(async () => [[{ id: 'user-1', alias: '薄荷', role: 'root', del_flag: '0' }], []]),
    };
    const assertReadAccess = vi.fn(async () => ({}));
    const result = await resolveCommunityChatRealtimeAccess({
      sid: 'session-1',
      env: REALTIME_ENV,
      db,
      getSessionById: async () => ({ user_id: 'user-1', role: 'visitor' }),
      getRestrictions: async () => [],
      assertReadAccess,
    });

    expect(result.user).toMatchObject({ id: 'user-1', role: 'root', isAuthenticated: true });
    expect(assertReadAccess).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'root' }) }),
    );
  });
});
