import { randomUUID } from 'node:crypto';
import {
  normalizeNotificationSourceScope,
  notificationSourceQuery,
  MAX_NOTIFICATION_SOURCE_IDS,
} from './notificationSourceScope.js';

const CHANNEL = 'notification:changed:v1';
const MAX_RECIPIENTS = 1000;

// No connections or timers at import time: CLI callers can import notification helpers safely.
export class NotificationRealtimeEvents {
  constructor({ getRedis, getDb, logger = console } = {}) {
    this.getRedis = getRedis;
    this.getDb = getDb;
    this.logger = logger;
    this.instanceId = randomUUID();
    this.listeners = new Map();
    this.subscriber = null;
    this.starting = null;
    this.lastErrorAt = 0;
    this.sourceScopes = new Map();
    this.sourceTimer = null;
    this.flushingSources = false;
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

  logError(code = 'NOTIFICATION_REDIS_UNAVAILABLE') {
    if (Date.now() - this.lastErrorAt < 60_000) return;
    this.lastErrorAt = Date.now();
    this.logger.error('[notification-realtime] code=%s', code);
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

  publishSource(input) {
    const scope = normalizeNotificationSourceScope(input);
    if (!scope) return;
    this.queueSource(scope);
    void (async () => {
      const redis = await this.getRedis?.();
      if (redis?.isReady) await redis.publish(CHANNEL, JSON.stringify({ source: this.instanceId, scope }));
    })().catch(() => this.logError());
  }

  queueSource(scope) {
    // An offline account reconciles on connection; never query its notification history here.
    if (!this.listeners.size) return;
    const key = JSON.stringify([scope.kind, scope.userIds || null]);
    const pending = this.sourceScopes.get(key) || { ...scope, ids: new Set() };
    for (const id of scope.ids) pending.ids.add(id);
    this.sourceScopes.set(key, pending);
    this.scheduleSources();
  }

  scheduleSources() {
    if (this.sourceTimer || this.flushingSources) return;
    this.sourceTimer = setTimeout(() => {
      this.sourceTimer = null;
      void this.flushSources();
    }, 50);
    this.sourceTimer.unref?.();
  }

  async flushSources() {
    if (this.flushingSources) return;
    this.flushingSources = true;
    const scopes = [...this.sourceScopes.values()];
    this.sourceScopes.clear();
    const recipients = new Set();
    try {
      const owners = [...this.listeners.keys()];
      if (!owners.length || !scopes.length) return;
      const db = await this.getDb?.();
      if (!db) return;
      for (const scope of scopes) {
        const sourceIds = [...scope.ids];
        for (let offset = 0; offset < sourceIds.length; offset += MAX_NOTIFICATION_SOURCE_IDS) {
          const query = notificationSourceQuery(
            { ...scope, ids: sourceIds.slice(offset, offset + MAX_NOTIFICATION_SOURCE_IDS) },
            owners,
          );
          if (!query) continue;
          try {
            const [rows] = await db.query(query.sql, query.params);
            for (const row of rows) recipients.add(row.userId);
          } catch {
            // Optional source schemas may be unavailable; retain periodic authoritative reconciliation.
            this.logError('NOTIFICATION_SOURCE_QUERY_FAILED');
          }
        }
      }
      this.deliver([...recipients]);
    } catch {
      this.logError('NOTIFICATION_SOURCE_QUERY_FAILED');
    } finally {
      this.flushingSources = false;
      if (this.sourceScopes.size) this.scheduleSources();
    }
  }

  async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const redis = await this.getRedis?.();
      if (!redis?.isReady) throw new Error('REDIS_NOT_READY');
      const subscriber = redis.duplicate();
      this.subscriber = subscriber;
      let subscribed = false;
      subscriber.on('error', () => this.logError());
      subscriber.on('ready', () => {
        // Pub/Sub does not replay hints lost during a reconnect. Refresh active
        // clients once the bridge recovers, without polling notification history.
        if (subscribed) this.deliver([...this.listeners.keys()]);
      });
      await subscriber.connect();
      await subscriber.subscribe(CHANNEL, (raw) => {
        try {
          if (Buffer.byteLength(raw) > 300_000) return;
          const event = JSON.parse(raw);
          if (event.source === this.instanceId) return;
          if (event.scope) {
            const scope = normalizeNotificationSourceScope(event.scope);
            if (scope) this.queueSource(scope);
            return;
          }
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
      subscribed = true;
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
    clearTimeout(this.sourceTimer);
    this.sourceTimer = null;
    this.sourceScopes.clear();
    if (subscriber?.isOpen) await subscriber.quit();
  }
}

export const notificationRealtimeEvents = new NotificationRealtimeEvents({
  getRedis: async () => (await import('./redisClient.js')).default,
  getDb: async () => (await import('../db/index.js')).default,
});

const pendingTransactions = new WeakMap();

/** Batch hints until the existing promise-based MySQL transaction actually commits.
 * Restore the connection methods on every terminal path, including pool reuse.
 */
function pendingNotificationChanges(db) {
  if (!db || typeof db.commit !== 'function') return null;
  let pending = pendingTransactions.get(db);
  if (!pending) {
    pending = { users: new Set(), scopes: new Map(), publish: null };
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
          try {
            if (pending.users.size)
              (pending.publish || ((ids) => notificationRealtimeEvents.publish(ids)))([...pending.users]);
            for (const scope of pending.scopes.values()) notificationRealtimeEvents.publishSource(scope);
          } catch {
            /* A hint never changes commit success. */
          }
          return result;
        };
      } else if (name === 'rollback') {
        db[name] = async function (...args) {
          try {
            return await original.apply(this, args);
          } finally {
            restore();
          }
        };
      } else {
        db[name] = function (...args) {
          restore();
          return original.apply(this, args);
        };
      }
    }
  }
  return pending;
}

export function queueNotificationChange(db, userIds, publish = (ids) => notificationRealtimeEvents.publish(ids)) {
  const pending = pendingNotificationChanges(db);
  if (!pending) {
    publish(userIds);
    return;
  }
  pending.publish ||= publish;
  for (const id of userIds) pending.users.add(id);
}

export function queueNotificationSourceChange(db, { kind, ids, userIds }) {
  if (!Array.isArray(ids) || !ids.length) return;
  const pending = pendingNotificationChanges(db);
  for (let offset = 0; offset < ids.length; offset += MAX_NOTIFICATION_SOURCE_IDS) {
    const scope = normalizeNotificationSourceScope({
      kind,
      ids: ids.slice(offset, offset + MAX_NOTIFICATION_SOURCE_IDS),
      ...(userIds ? { userIds } : {}),
    });
    if (!scope) continue;
    if (pending) pending.scopes.set(JSON.stringify(scope), scope);
    else notificationRealtimeEvents.publishSource(scope);
  }
}
