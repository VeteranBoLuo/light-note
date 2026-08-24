import crypto from 'node:crypto';
import redisClient from '../redisClient.js';

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_FAILURE_WINDOW_SECONDS = 120;
const DEFAULT_OPEN_SECONDS = 60;
const memoryState = new Map();

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function circuitConfig(env = process.env) {
  return {
    failureThreshold: boundedInteger(env.AI_VISION_CIRCUIT_FAILURES, DEFAULT_FAILURE_THRESHOLD, 2, 20),
    failureWindowSeconds: boundedInteger(env.AI_VISION_CIRCUIT_WINDOW_SECONDS, DEFAULT_FAILURE_WINDOW_SECONDS, 30, 600),
    openSeconds: boundedInteger(env.AI_VISION_CIRCUIT_OPEN_SECONDS, DEFAULT_OPEN_SECONDS, 15, 600),
  };
}

function normalizedKey(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || 'deepseek-vision'))
    .digest('hex')
    .slice(0, 24);
}

function keys(identity) {
  const key = normalizedKey(identity);
  return {
    failures: `ai:image-vision:circuit:v1:${key}:failures`,
    open: `ai:image-vision:circuit:v1:${key}:open`,
  };
}

function activeMemory(identity, now) {
  const state = memoryState.get(identity);
  if (!state) return null;
  if (state.openUntil > now) return state;
  if (state.windowUntil <= now) memoryState.delete(identity);
  return null;
}

export function createVisionCircuitBreaker({ cache = redisClient, now = () => Date.now(), env = process.env } = {}) {
  const config = circuitConfig(env);
  return Object.freeze({
    async isOpen(identity) {
      const normalized = String(identity || 'deepseek-vision');
      const local = activeMemory(normalized, now());
      if (local?.openUntil > now()) return { open: true, reason: local.reason || 'AI_PROVIDER_ERROR' };
      try {
        const value = await cache?.get?.(keys(normalized).open);
        return value ? { open: true, reason: String(value).slice(0, 64) } : { open: false, reason: '' };
      } catch {
        return { open: false, reason: '' };
      }
    },

    async recordSuccess(identity) {
      const normalized = String(identity || 'deepseek-vision');
      memoryState.delete(normalized);
      try {
        await cache?.del?.([keys(normalized).failures, keys(normalized).open]);
      } catch {
        // Redis 只负责跨进程共享；当前进程已恢复，不反向影响识别成功。
      }
    },

    async recordFailure(identity, reason = 'AI_PROVIDER_ERROR') {
      const normalized = String(identity || 'deepseek-vision');
      const currentTime = now();
      const previous = memoryState.get(normalized);
      const withinWindow = previous && previous.windowUntil > currentTime;
      const failures = withinWindow ? previous.failures + 1 : 1;
      const openUntil = failures >= config.failureThreshold ? currentTime + config.openSeconds * 1000 : 0;
      memoryState.set(normalized, {
        failures,
        windowUntil: currentTime + config.failureWindowSeconds * 1000,
        openUntil,
        reason: String(reason || 'AI_PROVIDER_ERROR').slice(0, 64),
      });
      try {
        if (typeof cache?.incr === 'function' && typeof cache?.expire === 'function') {
          const redisKeys = keys(normalized);
          const count = Number(await cache.incr(redisKeys.failures));
          if (count === 1) await cache.expire(redisKeys.failures, config.failureWindowSeconds);
          if (count >= config.failureThreshold) {
            await cache.setEx(redisKeys.open, config.openSeconds, String(reason || 'AI_PROVIDER_ERROR').slice(0, 64));
          }
        }
      } catch {
        // 进程内熔断仍然有效。
      }
      return { open: openUntil > currentTime, failures, openUntil };
    },
  });
}

export function clearVisionCircuitBreakerMemory() {
  memoryState.clear();
}

export const visionCircuitBreakerInternals = Object.freeze({ circuitConfig, keys });
