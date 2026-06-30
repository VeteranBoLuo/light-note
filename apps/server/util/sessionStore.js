import crypto from 'crypto';
import pool from '../db/index.js';
import redisClient from './redisClient.js';

const CACHE_PREFIX = 'session:';
const CACHE_TTL = 15 * 60; // Redis 缓存 15 分钟

export const createSessionId = () => crypto.randomBytes(32).toString('hex');

// 滑动过期逻辑（抽出来，MySQL 更新和 Redis 都复用）
function calcSlidingExpiry(session) {
  const SEVEN_DAY_MS = 604800000;
  const expiresAt = new Date(session.expires_at);
  const createTime = new Date(session.create_time);
  const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  if ((expiresAt.getTime() - createTime.getTime()) >= SEVEN_DAY_MS) {
    // 记住我：续 7 天
    return { renewSeconds: 604800, expiresIn: 604800 };
  }
  if (remaining < 86400) {
    // 普通，不足 24h：续 24h
    return { renewSeconds: 86400, expiresIn: 86400 };
  }
  // 剩余充足：只续 last_active_time
  return { renewSeconds: 0, expiresIn: remaining };
}

// 只更新 MySQL 的滑过期（fire-and-forget，缓存命中时不同步等它）
async function renewSessionInDb(sid, renewSeconds) {
  try {
    if (renewSeconds > 0) {
      await pool.query(
        `UPDATE user_sessions
         SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
             last_active_time = NOW()
         WHERE sid = ?`,
        [renewSeconds, sid]
      );
    } else {
      await pool.query(
        'UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ?',
        [sid]
      );
    }
  } catch (e) {
    // 静默忽略
  }
}

export const createSession = async ({ userId, role, maxAgeMs, ip = '', userAgent = '' }) => {
  const sid = createSessionId();
  const maxAgeSeconds = Math.max(1, Math.ceil(maxAgeMs / 1000));
  await pool.query(
    `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
    [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent]
  );
  return { sid };
};

export const getSession = async (sid) => {
  if (!sid) return null;

  const cacheKey = CACHE_PREFIX + sid;

  // 1. 先查 Redis
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const session = JSON.parse(cached);
      const { renewSeconds } = calcSlidingExpiry(session);
      // 异步续 MySQL（不等结果）
      renewSessionInDb(sid, renewSeconds);
      // 续 Redis TTL
      redisClient.expire(cacheKey, CACHE_TTL).catch(() => {});
      // 重新计算 expires_in_seconds（确保返回准确的剩余时间）
      session.expires_in_seconds = Math.max(
        0,
        Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)
      );
      return session;
    }
  } catch (e) {
    // Redis 不可用时回源 MySQL
  }

  // 2. Redis 未命中 → 查 MySQL
  const [rows] = await pool.query(
    `SELECT
       sid,
       user_id,
       role,
       expires_at,
       create_time,
       GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS expires_in_seconds
     FROM user_sessions
     WHERE sid = ? AND expires_at > NOW()
     LIMIT 1`,
    [sid]
  );
  const session = rows[0];
  if (!session) {
    await removeSession(sid);
    return null;
  }

  // 3. 滑动过期 → 更新 MySQL
  const { renewSeconds } = calcSlidingExpiry(session);
  if (renewSeconds > 0) {
    await pool.query(
      `UPDATE user_sessions
       SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
           last_active_time = NOW()
       WHERE sid = ?`,
      [renewSeconds, sid]
    );
    session.expires_in_seconds = renewSeconds;
  } else {
    await pool.query(
      'UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ?',
      [sid]
    );
  }

  // 4. 写 Redis 缓存（TTL 取缓存时间和剩余 session 时间的较小值）
  const cacheTTL = Math.min(CACHE_TTL, session.expires_in_seconds);
  if (cacheTTL > 0) {
    try {
      await redisClient.setEx(cacheKey, cacheTTL, JSON.stringify(session));
    } catch (e) {
      // 写入失败不影响业务
    }
  }

  return session;
};

export const removeSession = async (sid) => {
  if (!sid) return;
  await pool.query('DELETE FROM user_sessions WHERE sid = ?', [sid]);
  redisClient.del(CACHE_PREFIX + sid).catch(() => {});
};

export const removeUserSessions = async (userId) => {
  if (!userId) return;
  const [rows] = await pool.query(
    'SELECT sid FROM user_sessions WHERE user_id = ?',
    [userId]
  );
  await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
  // 清除 Redis 缓存
  const keys = rows.map((r) => CACHE_PREFIX + r.sid);
  if (keys.length > 0) {
    redisClient.del(keys).catch(() => {});
  }
};

export const cleanupExpiredSessions = async () => {
  await pool.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
};
