import { describe, expect, it, vi } from 'vitest';
import { CommunityChatRealtimeBroker, COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL } from './realtimeBroker.js';

function silentLogger() {
  return { error: vi.fn() };
}

describe('CommunityChatRealtimeBroker', () => {
  it('本地事件只投递一次，并把目标账号 ID 留在内部元数据', () => {
    const broker = new CommunityChatRealtimeBroker({ redis: null, logger: silentLogger(), instanceId: 'node-a' });
    const listener = vi.fn();
    broker.subscribe(listener);

    const event = broker.publish(
      'access.changed',
      { reason: 'community_banned', disconnect: true },
      { targetUserId: 'user-1' },
    );

    expect(event).toMatchObject({ type: 'access.changed', payload: { disconnect: true } });
    expect(listener).toHaveBeenCalledWith({ event, internal: { targetUserId: 'user-1' } });
    expect(JSON.stringify(event)).not.toContain('user-1');
  });

  it('Redis 失败不会抛给业务写事务，本地订阅仍然收到事件', async () => {
    const redis = {
      isOpen: true,
      publish: vi.fn(async () => {
        throw Object.assign(new Error('redis unavailable'), { code: 'ECONNREFUSED' });
      }),
      duplicate: vi.fn(() => ({
        isOpen: true,
        on: vi.fn(),
        subscribe: vi.fn(async () => {}),
        unsubscribe: vi.fn(async () => {}),
        quit: vi.fn(async () => {}),
      })),
    };
    const logger = silentLogger();
    const broker = new CommunityChatRealtimeBroker({ redis, logger, instanceId: 'node-a' });
    const listener = vi.fn();
    broker.subscribe(listener);
    await broker.startRedisBridge();

    expect(() =>
      broker.publish('message.created', { roomSlug: 'general', messagePublicId: 'message-0001' }),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL, expect.any(String));
    expect(logger.error).toHaveBeenCalled();
    await broker.close();
  });

  it('接收其他实例的 Redis 事件、忽略本实例回声并按 eventId 去重', () => {
    const broker = new CommunityChatRealtimeBroker({ redis: null, logger: silentLogger(), instanceId: 'node-b' });
    const listener = vi.fn();
    broker.subscribe(listener);
    const event = {
      protocolVersion: 1,
      type: 'message.removed',
      eventId: 'event-0001',
      serverTime: '2026-08-09T10:00:00.000Z',
      payload: { roomSlug: 'general', messagePublicId: 'message-0001', reason: 'moderation' },
    };

    expect(broker.receiveRedis(JSON.stringify({ sourceInstanceId: 'node-a', event, internal: {} }))).toBe(true);
    expect(broker.receiveRedis(JSON.stringify({ sourceInstanceId: 'node-a', event, internal: {} }))).toBe(false);
    expect(broker.receiveRedis(JSON.stringify({ sourceInstanceId: 'node-b', event, internal: {} }))).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
