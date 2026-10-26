import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  NotificationRealtimeEvents,
  notificationRealtimeEvents,
  queueNotificationChange,
  queueNotificationSourceChange,
} from './notificationRealtimeEvents.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

  it('commits direct and source hints together, discarding both on rollback or pool release', async () => {
    const source = vi.spyOn(notificationRealtimeEvents, 'publishSource').mockImplementation(() => {});
    const publish = vi.fn(),
      db = connection();
    queueNotificationChange(db, ['a'], publish);
    queueNotificationSourceChange(db, { kind: 'batch', ids: ['batch'] });
    queueNotificationSourceChange(db, { kind: 'batch', ids: ['batch'] });
    expect(source).not.toHaveBeenCalled();
    await db.commit();
    expect(source).toHaveBeenCalledExactlyOnceWith({ kind: 'batch', ids: ['batch'] });
    expect(publish).toHaveBeenCalledExactlyOnceWith(['a']);
    source.mockClear();
    queueNotificationSourceChange(db, { kind: 'feed_post', ids: ['post'] });
    await db.rollback();
    queueNotificationSourceChange(db, { kind: 'publication', ids: ['resource'] });
    db.release();
    await db.commit();
    expect(source).not.toHaveBeenCalled();
  });
});

describe('notification Redis bridge', () => {
  it('reconciles connected clients once Redis recovers from a missed-hint gap', async () => {
    let onReady;
    const subscriber = {
      on: vi.fn((event, cb) => { if (event === 'ready') onReady = cb; }),
      connect: vi.fn(async () => onReady()),
      subscribe: vi.fn(),
      isOpen: true,
      quit: vi.fn(),
    };
    const getDb = vi.fn();
    const bus = new NotificationRealtimeEvents({
      getRedis: async () => ({ isReady: true, duplicate: () => subscriber }), getDb,
    });
    const listener = vi.fn();
    const unsubscribe = bus.subscribe('alice', listener);
    await bus.start();
    expect(listener).not.toHaveBeenCalled();
    onReady();
    expect(listener).toHaveBeenCalledExactlyOnceWith();
    expect(getDb).not.toHaveBeenCalled();
    unsubscribe();
    onReady();
    expect(listener).toHaveBeenCalledOnce();
    await bus.close();
  });

  it('coalesces source changes into one indexed query and targets only matching connected recipients', async () => {
    vi.useFakeTimers();
    const db = { query: vi.fn(async () => [[{ userId: 'alice' }]]) };
    const bus = new NotificationRealtimeEvents({ getDb: async () => db });
    const alice = vi.fn(),
      bob = vi.fn();
    bus.subscribe('alice', alice);
    bus.subscribe('bob', bob);
    bus.publishSource({ kind: 'chat', ids: ['m1'] });
    bus.publishSource({ kind: 'chat', ids: ['m1', 'm2'] });
    await vi.advanceTimersByTimeAsync(50);
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0][1]).toEqual(['alice', 'bob', 'm1', 'm2']);
    expect(alice).toHaveBeenCalledOnce();
    expect(bob).not.toHaveBeenCalled();
    await bus.close();
  });

  it('does no source SQL when all recipients are offline', async () => {
    vi.useFakeTimers();
    const getDb = vi.fn(),
      bus = new NotificationRealtimeEvents({ getDb });
    bus.publishSource({ kind: 'batch', ids: ['b'] });
    await vi.advanceTimersByTimeAsync(100);
    expect(getDb).not.toHaveBeenCalled();
    await bus.close();
  });

  it('receives source invalidations from another process without exposing source IDs to clients', async () => {
    vi.useFakeTimers();
    let receive;
    const subscriber = {
      on: vi.fn(),
      connect: vi.fn(),
      subscribe: async (_channel, cb) => {
        receive = cb;
      },
      isOpen: true,
      quit: vi.fn(),
    };
    const db = { query: vi.fn(async () => [[{ userId: 'alice' }]]) };
    const bus = new NotificationRealtimeEvents({
      getDb: async () => db,
      getRedis: async () => ({ isReady: true, duplicate: () => subscriber }),
    });
    const alice = vi.fn();
    bus.subscribe('alice', alice);
    await bus.start();
    receive(JSON.stringify({ source: 'worker', scope: { kind: 'publication', ids: ['source-id'] } }));
    await vi.advanceTimersByTimeAsync(50);
    expect(alice).toHaveBeenCalledExactlyOnceWith();
    await bus.close();
  });
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
