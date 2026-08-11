import { describe, expect, it, vi } from 'vitest';
import {
  NotificationRealtimeBroker,
  NOTIFICATION_REALTIME_REDIS_CHANNEL,
} from './notificationRealtimeBroker.js';

describe('notification realtime broker', () => {
  it('本地先投递最小失效信号，同一事件经 Redis 回环不会重复消费', async () => {
    let redisConsumer;
    const subscriber = {
      isOpen: false,
      isReady: true,
      connect: vi.fn(async () => {
        subscriber.isOpen = true;
      }),
      subscribe: vi.fn(async (_channel, consumer) => {
        redisConsumer = consumer;
      }),
      unsubscribe: vi.fn(async () => undefined),
      quit: vi.fn(async () => {
        subscriber.isOpen = false;
      }),
      on: vi.fn(),
    };
    const redis = {
      isOpen: true,
      publish: vi.fn(async () => 1),
      duplicate: vi.fn(() => subscriber),
    };
    const broker = new NotificationRealtimeBroker({ redis, logger: { error: vi.fn(), warn: vi.fn() }, instanceId: 'a' });
    const events = [];
    broker.subscribe((event) => events.push(event));
    await broker.startRedisBridge();

    const event = broker.publish('root-1', 'created');
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ protocolVersion: 1, type: 'notification.changed', userId: 'root-1' });
    expect(redis.publish).toHaveBeenCalledWith(
      NOTIFICATION_REALTIME_REDIS_CHANNEL,
      expect.stringContaining(event.eventId),
    );
    expect(redisConsumer).toBeTypeOf('function');
    expect(redisConsumer(JSON.stringify({ sourceInstanceId: 'a', event }))).toBe(false);
    expect(events).toHaveLength(1);
    await broker.close();
  });

  it('拒绝空用户和超长事件，不向订阅者泄露正文', () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const broker = new NotificationRealtimeBroker({ redis: null, logger });
    const listener = vi.fn();
    broker.subscribe(listener);

    expect(broker.publish('', 'created')).toBeNull();
    const event = broker.publish('root-1', 'x'.repeat(100));
    expect(event.reason).toHaveLength(32);
    expect(JSON.stringify(event)).not.toContain('content');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
