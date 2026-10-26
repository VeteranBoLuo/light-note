import { describe, it, expect, vi } from 'vitest';
import { NotificationRealtimeEvents, queueNotificationChange } from './notificationRealtimeEvents.js';

function connection() {
  return { commit: vi.fn().mockResolvedValue('committed'), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() };
}

describe('committed notification hints', () => {
  it('deduplicates recipients and publishes only after commit, then restores reusable connections', async () => {
    const db = connection(),
      publish = vi.fn(),
      original = db.commit;
    queueNotificationChange(db, ['a'], publish);
    queueNotificationChange(db, ['a', 'b'], publish);
    expect(publish).not.toHaveBeenCalled();
    expect(await db.commit()).toBe('committed');
    expect(publish).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
    expect(db.commit).toBe(original);
    queueNotificationChange(db, ['c'], publish);
    await db.commit();
    expect(publish).toHaveBeenLastCalledWith(['c']);
  });

  it.each(['rollback', 'release', 'destroy'])('discards rolled back or abandoned hints on %s', async (method) => {
    const db = connection(),
      publish = vi.fn(),
      original = db.commit;
    queueNotificationChange(db, ['a'], publish);
    await db[method]();
    expect(db.commit).toBe(original);
    await db.commit();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish failed commits or turn successful commits into errors', async () => {
    const db = connection(),
      publish = vi.fn(() => {
        throw new Error('hint failure');
      });
    db.commit.mockRejectedValueOnce(new Error('commit failure'));
    queueNotificationChange(db, ['a'], publish);
    await expect(db.commit()).rejects.toThrow('commit failure');
    expect(publish).not.toHaveBeenCalled();
    await db.rollback();
    queueNotificationChange(db, ['b'], publish);
    await expect(db.commit()).resolves.toBe('committed');
  });

  it('publishes autocommit writes immediately', () => {
    const publish = vi.fn();
    queueNotificationChange(null, ['a'], publish);
    expect(publish).toHaveBeenCalledWith(['a']);
  });
});

describe('notification Redis bridge', () => {
  it('targets only the recipient, ignores its own Redis echo, and crosses process boundaries', async () => {
    let receive;
    const subscriber = {
      on: vi.fn(),
      connect: vi.fn(),
      subscribe: vi.fn(async (_channel, cb) => {
        receive = cb;
      }),
      isOpen: true,
      quit: vi.fn(),
    };
    const redis = { isReady: true, duplicate: () => subscriber, publish: vi.fn() };
    const bus = new NotificationRealtimeEvents({ getRedis: async () => redis });
    const alice = vi.fn(),
      bob = vi.fn();
    bus.subscribe('alice', alice);
    const unsubscribe = bus.subscribe('bob', bob);
    await Promise.all([bus.start(), bus.start()]);
    expect(subscriber.connect).toHaveBeenCalledOnce();
    bus.publish(['alice']);
    await vi.waitFor(() => expect(redis.publish).toHaveBeenCalledOnce());
    expect(alice).toHaveBeenCalledOnce();
    expect(bob).not.toHaveBeenCalled();
    receive(redis.publish.mock.calls[0][1]);
    expect(alice).toHaveBeenCalledOnce();
    receive(JSON.stringify({ source: 'other-worker', userIds: ['bob'] }));
    expect(bob).toHaveBeenCalledOnce();
    unsubscribe();
    receive(JSON.stringify({ source: 'other-worker', userIds: ['bob'] }));
    expect(bob).toHaveBeenCalledOnce();
    await bus.close();
    expect(subscriber.quit).toHaveBeenCalledOnce();
  });

  it('retains local delivery when Redis is down and retries subscription later', async () => {
    const redis = { isReady: false };
    const logger = { error: vi.fn() };
    const bus = new NotificationRealtimeEvents({ getRedis: async () => redis, logger });
    const listener = vi.fn();
    bus.subscribe('a', listener);
    expect(await bus.start()).toBe(false);
    bus.publish(['a']);
    expect(listener).toHaveBeenCalledOnce();
    await bus.close();
  });
});
