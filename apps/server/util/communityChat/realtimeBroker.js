import { randomUUID } from 'node:crypto';
import redisClient from '../redisClient.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createCommunityChatBroadcastEvent, normalizeCommunityChatBroadcastEvent } from './realtimeProtocol.js';

export const COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL = 'community-chat:realtime:v1';

const MAX_REDIS_ENVELOPE_BYTES = 16 * 1024;
const MAX_SEEN_EVENT_IDS = 2048;
const REDIS_ERROR_LOG_THROTTLE_MS = 60_000;

function normalizeInternalMetadata(value = {}) {
  const targetUserId = String(value.targetUserId || '').trim();
  return targetUserId && targetUserId.length <= 255 ? { targetUserId } : {};
}

/**
 * 站内事件先同步投递给当前进程，再尽力发布到 Redis。Redis 失败只能影响跨实例秒级同步，
 * 不能反向影响已经提交的 REST 写事务；客户端仍会用权威历史接口补齐。
 */
export class CommunityChatRealtimeBroker {
  constructor({ redis = redisClient, logger = console, instanceId = randomUUID() } = {}) {
    this.redis = redis;
    this.logger = logger;
    this.instanceId = instanceId;
    this.listeners = new Set();
    this.seenEventIds = new Map();
    this.redisSubscriber = null;
    this.redisBridgePromise = null;
    this.redisBridgeStarted = false;
    this.lastRedisErrorLogAt = 0;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  rememberEvent(eventId) {
    if (!eventId || this.seenEventIds.has(eventId)) return false;
    this.seenEventIds.set(eventId, Date.now());
    if (this.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const overflow = this.seenEventIds.size - MAX_SEEN_EVENT_IDS;
      const iterator = this.seenEventIds.keys();
      for (let index = 0; index < overflow; index += 1) {
        const next = iterator.next();
        if (next.done) break;
        this.seenEventIds.delete(next.value);
      }
    }
    return true;
  }

  deliver(envelope) {
    if (!this.rememberEvent(envelope.event.eventId)) return false;
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch (error) {
        this.logger.error('[community-chat-realtime] 本地事件消费失败 code=%s', stableAgentErrorCode(error));
      }
    }
    return true;
  }

  publish(type, payload, internal = {}) {
    let envelope;
    try {
      envelope = {
        event: createCommunityChatBroadcastEvent(type, payload),
        internal: normalizeInternalMetadata(internal),
      };
    } catch (error) {
      this.logger.error('[community-chat-realtime] 拒绝无效服务端事件 code=%s', stableAgentErrorCode(error));
      return null;
    }

    this.deliver(envelope);
    void this.publishRedis(envelope);
    return envelope.event;
  }

  logRedisError(error, message) {
    const now = Date.now();
    if (now - this.lastRedisErrorLogAt < REDIS_ERROR_LOG_THROTTLE_MS) return;
    this.lastRedisErrorLogAt = now;
    this.logger.error(`${message} code=%s`, stableAgentErrorCode(error));
  }

  async publishRedis(envelope) {
    if (!this.redisBridgeStarted || typeof this.redis?.publish !== 'function') return false;
    if (this.redis.isOpen === false) {
      this.logRedisError(
        Object.assign(new Error('REALTIME_REDIS_NOT_OPEN'), { code: 'REALTIME_REDIS_NOT_OPEN' }),
        '[community-chat-realtime] Redis 尚未连接，客户端将通过 REST 补齐',
      );
      return false;
    }
    const serialized = JSON.stringify({
      sourceInstanceId: this.instanceId,
      event: envelope.event,
      internal: envelope.internal,
    });
    if (Buffer.byteLength(serialized, 'utf8') > MAX_REDIS_ENVELOPE_BYTES) {
      this.logRedisError(
        Object.assign(new Error('REALTIME_REDIS_EVENT_TOO_LARGE'), { code: 'REALTIME_REDIS_EVENT_TOO_LARGE' }),
        '[community-chat-realtime] Redis 事件超过安全上限',
      );
      return false;
    }
    try {
      await this.redis.publish(COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL, serialized);
      return true;
    } catch (error) {
      this.logRedisError(error, '[community-chat-realtime] Redis 发布失败，客户端将通过 REST 补齐');
      return false;
    }
  }

  receiveRedis(raw) {
    try {
      const text = String(raw || '');
      if (!text || Buffer.byteLength(text, 'utf8') > MAX_REDIS_ENVELOPE_BYTES) return false;
      const parsed = JSON.parse(text);
      if (!parsed || parsed.sourceInstanceId === this.instanceId) return false;
      const event = normalizeCommunityChatBroadcastEvent(parsed.event);
      return this.deliver({ event, internal: normalizeInternalMetadata(parsed.internal) });
    } catch (error) {
      this.logRedisError(error, '[community-chat-realtime] 忽略无效 Redis 事件');
      return false;
    }
  }

  startRedisBridge() {
    if (this.redisBridgePromise) return this.redisBridgePromise;
    if (typeof this.redis?.duplicate !== 'function' || typeof this.redis?.publish !== 'function') {
      return Promise.resolve(false);
    }
    this.redisBridgeStarted = true;
    this.redisBridgePromise = (async () => {
      const subscriber = this.redis.duplicate();
      this.redisSubscriber = subscriber;
      subscriber.on?.('error', (error) => {
        this.logRedisError(error, '[community-chat-realtime] Redis 订阅连接异常');
      });
      if (!subscriber.isOpen) await subscriber.connect();
      await subscriber.subscribe(COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL, (message) => this.receiveRedis(message));
      return true;
    })().catch((error) => {
      this.logRedisError(error, '[community-chat-realtime] Redis 跨实例桥接启动失败，保留单实例实时能力');
      return false;
    });
    return this.redisBridgePromise;
  }

  async close() {
    this.listeners.clear();
    this.redisBridgeStarted = false;
    const subscriber = this.redisSubscriber;
    this.redisSubscriber = null;
    this.redisBridgePromise = null;
    if (!subscriber) return;
    try {
      if (subscriber.isOpen) {
        if (subscriber.isReady) await subscriber.unsubscribe(COMMUNITY_CHAT_REALTIME_REDIS_CHANNEL);
        await subscriber.quit();
      } else {
        subscriber.destroy?.();
      }
    } catch (error) {
      subscriber.destroy?.();
      this.logRedisError(error, '[community-chat-realtime] Redis 订阅关闭失败');
    }
  }
}

export const communityChatRealtimeBroker = new CommunityChatRealtimeBroker();

export function publishCommunityChatRealtimeEvent(type, payload, internal = {}) {
  return communityChatRealtimeBroker.publish(type, payload, internal);
}

export const __test__ = {
  MAX_REDIS_ENVELOPE_BYTES,
  MAX_SEEN_EVENT_IDS,
  normalizeInternalMetadata,
};
