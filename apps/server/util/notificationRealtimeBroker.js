import { randomUUID } from 'node:crypto';
import redisClient from './redisClient.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

export const NOTIFICATION_REALTIME_REDIS_CHANNEL = 'notification:realtime:v1';

const MAX_EVENT_BYTES = 4096;
const MAX_SEEN_EVENT_IDS = 2048;

function normalizeEvent(value = {}) {
  const eventId = String(value.eventId || randomUUID());
  const userId = String(value.userId || '').trim();
  if (!userId || userId.length > 255) throw new Error('NOTIFICATION_REALTIME_USER_INVALID');
  return {
    protocolVersion: 1,
    type: 'notification.changed',
    eventId,
    serverTime: String(value.serverTime || new Date().toISOString()),
    userId,
    reason: String(value.reason || 'changed').slice(0, 32),
  };
}

export class NotificationRealtimeBroker {
  constructor({ redis = redisClient, logger = console, instanceId = randomUUID() } = {}) {
    this.redis = redis;
    this.logger = logger;
    this.instanceId = instanceId;
    this.listeners = new Set();
    this.seenEventIds = new Set();
    this.redisSubscriber = null;
    this.redisBridgePromise = null;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  deliver(event) {
    if (this.seenEventIds.has(event.eventId)) return false;
    this.seenEventIds.add(event.eventId);
    while (this.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      this.seenEventIds.delete(this.seenEventIds.values().next().value);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('[notification-realtime] 本地消费失败 code=%s', stableAgentErrorCode(error));
      }
    }
    return true;
  }

  publish(userId, reason = 'changed') {
    let event;
    try {
      event = normalizeEvent({ userId, reason });
    } catch (error) {
      this.logger.error('[notification-realtime] 拒绝无效事件 code=%s', stableAgentErrorCode(error));
      return null;
    }
    this.deliver(event);
    void this.publishRedis(event);
    return event;
  }

  async publishRedis(event) {
    if (!this.redisBridgePromise || typeof this.redis?.publish !== 'function' || this.redis.isOpen === false) return false;
    const serialized = JSON.stringify({ sourceInstanceId: this.instanceId, event });
    if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_BYTES) return false;
    try {
      await this.redis.publish(NOTIFICATION_REALTIME_REDIS_CHANNEL, serialized);
      return true;
    } catch (error) {
      this.logger.warn('[notification-realtime] Redis 发布失败 code=%s', stableAgentErrorCode(error));
      return false;
    }
  }

  receiveRedis(raw) {
    try {
      const text = String(raw || '');
      if (!text || Buffer.byteLength(text, 'utf8') > MAX_EVENT_BYTES) return false;
      const parsed = JSON.parse(text);
      if (!parsed || parsed.sourceInstanceId === this.instanceId) return false;
      return this.deliver(normalizeEvent(parsed.event));
    } catch {
      return false;
    }
  }

  startRedisBridge() {
    if (this.redisBridgePromise) return this.redisBridgePromise;
    if (typeof this.redis?.duplicate !== 'function' || typeof this.redis?.publish !== 'function') {
      return Promise.resolve(false);
    }
    this.redisBridgePromise = (async () => {
      const subscriber = this.redis.duplicate();
      this.redisSubscriber = subscriber;
      subscriber.on?.('error', (error) => {
        this.logger.warn('[notification-realtime] Redis 订阅异常 code=%s', stableAgentErrorCode(error));
      });
      if (!subscriber.isOpen) await subscriber.connect();
      await subscriber.subscribe(NOTIFICATION_REALTIME_REDIS_CHANNEL, (message) => this.receiveRedis(message));
      return true;
    })().catch((error) => {
      this.logger.warn('[notification-realtime] Redis 桥接未启动 code=%s', stableAgentErrorCode(error));
      return false;
    });
    return this.redisBridgePromise;
  }

  async close() {
    this.listeners.clear();
    const subscriber = this.redisSubscriber;
    this.redisSubscriber = null;
    this.redisBridgePromise = null;
    if (!subscriber) return;
    try {
      if (subscriber.isOpen) {
        if (subscriber.isReady) await subscriber.unsubscribe(NOTIFICATION_REALTIME_REDIS_CHANNEL);
        await subscriber.quit();
      } else {
        subscriber.destroy?.();
      }
    } catch {
      subscriber.destroy?.();
    }
  }
}

export const notificationRealtimeBroker = new NotificationRealtimeBroker();

export function publishUserNotificationChanged(userId, reason = 'changed') {
  return notificationRealtimeBroker.publish(userId, reason);
}

export const __test__ = { MAX_EVENT_BYTES, MAX_SEEN_EVENT_IDS, normalizeEvent };
