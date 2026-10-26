import { randomUUID } from 'node:crypto';

const CHANNEL = 'notification:changed:v1';
const MAX_RECIPIENTS = 1000;

// No connections or timers at import time: CLI callers can import notification helpers safely.
export class NotificationRealtimeEvents {
  constructor({ getRedis, logger = console } = {}) {
    this.getRedis = getRedis;
    this.logger = logger;
    this.instanceId = randomUUID();
    this.listeners = new Map();
    this.subscriber = null;
    this.starting = null;
    this.lastErrorAt = 0;
  }

  subscribe(userId, listener) {
    const listeners = this.listeners.get(userId) || new Set();
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(userId);
    };
  }

  deliver(userIds) {
    for (const id of userIds) {
      for (const listener of this.listeners.get(id) || []) {
        try {
          listener();
        } catch {
          /* A disconnected client cannot fail a committed write. */
        }
      }
    }
  }

  logError() {
    if (Date.now() - this.lastErrorAt < 60_000) return;
    this.lastErrorAt = Date.now();
    this.logger.error('[notification-realtime] code=NOTIFICATION_REDIS_UNAVAILABLE');
  }

  publish(userIds) {
    const ids = [...new Set(userIds)].filter((id) => typeof id === 'string' && id && id.length <= 255);
    this.deliver(ids);
    for (let offset = 0; offset < ids.length; offset += MAX_RECIPIENTS) {
      const message = JSON.stringify({ source: this.instanceId, userIds: ids.slice(offset, offset + MAX_RECIPIENTS) });
      void (async () => {
        const redis = await this.getRedis?.();
        // Do not queue notifications indefinitely during a Redis outage.
        if (!redis?.isReady) return;
        await redis.publish(CHANNEL, message);
      })().catch(() => this.logError());
    }
  }

  async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const redis = await this.getRedis?.();
      if (!redis?.isReady) throw new Error('REDIS_NOT_READY');
      const subscriber = redis.duplicate();
      this.subscriber = subscriber;
      subscriber.on('error', () => this.logError());
      await subscriber.connect();
      await subscriber.subscribe(CHANNEL, (raw) => {
        try {
          if (Buffer.byteLength(raw) > 300_000) return;
          const event = JSON.parse(raw);
          if (event.source === this.instanceId) return;
          if (
            event.source === this.instanceId ||
            !Array.isArray(event.userIds) ||
            event.userIds.length > MAX_RECIPIENTS
          )
            return;
          this.deliver([...new Set(event.userIds.filter((id) => typeof id === 'string' && id.length <= 255))]);
        } catch {
          /* Invalid internal hints carry no authority. */
        }
      });
      return true;
    })().catch(() => {
      this.subscriber?.destroy();
      this.subscriber = null;
      this.starting = null;
      this.logError();
      return false;
    });
    return this.starting;
  }

  async close() {
    await this.starting;
    const subscriber = this.subscriber;
    this.subscriber = null;
    this.starting = null;
    this.listeners.clear();
    if (subscriber?.isOpen) await subscriber.quit();
  }
}

export const notificationRealtimeEvents = new NotificationRealtimeEvents({
  getRedis: async () => (await import('./redisClient.js')).default,
});

const pendingTransactions = new WeakMap();

/** Batch hints until the existing promise-based MySQL transaction actually commits.
 * Restore the connection methods on every terminal path, including pool reuse.
 */
export function queueNotificationChange(db, userIds, publish = (ids) => notificationRealtimeEvents.publish(ids)) {
  if (!db || typeof db.commit !== 'function') {
    publish(userIds);
    return;
  }
  let pending = pendingTransactions.get(db);
  if (!pending) {
    pending = new Set();
    pendingTransactions.set(db, pending);
    const descriptors = new Map();
    const restore = () => {
      pendingTransactions.delete(db);
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(db, name, descriptor);
        else delete db[name];
      }
    };
    for (const name of ['commit', 'rollback', 'release', 'destroy']) {
      const original = db[name];
      if (typeof original !== 'function') continue;
      descriptors.set(name, Object.getOwnPropertyDescriptor(db, name));
      if (name === 'commit') {
        db[name] = async function (...args) {
          const result = await original.apply(this, args);
          restore();
          try { publish([...pending]); } catch { /* A hint never changes commit success. */ }
          return result;
        };
      } else if (name === 'rollback') {
        db[name] = async function (...args) {
          try { return await original.apply(this, args); } finally { restore(); }
        };
      } else {
        db[name] = function (...args) {
          restore();
          return original.apply(this, args);
        };
      }
    }
  }
  for (const id of userIds) pending.add(id);
}
