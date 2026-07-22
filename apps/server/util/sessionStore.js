import crypto from 'crypto';
import pool from '../db/index.js';
import redisClient from './redisClient.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const CACHE_PREFIX = 'session:';
const CACHE_TTL = 15 * 60; // Redis 缓存 15 分钟
const SESSION_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export const createSessionId = () => crypto.randomBytes(32).toString('hex');

// 浏览器设备标识只用于同一账号下的会话归并，绝不能作为认证或授权依据。
// 数据库只保存不可逆摘要，避免把 localStorage 里的原始标识写入会话表。
export function getSessionDeviceKey(deviceId) {
  const normalized = Array.isArray(deviceId) ? String(deviceId[0] || '').trim() : String(deviceId || '').trim();
  if (!SESSION_DEVICE_ID_PATTERN.test(normalized)) return '';
  return crypto.createHash('sha256').update(`light-note:session-device:v1:${normalized}`).digest('hex');
}

function isDeviceKeySchemaUnavailable(error) {
  return error?.code === 'ER_BAD_FIELD_ERROR';
}

async function clearSessionCache(sids) {
  const keys = [...new Set((sids || []).filter(Boolean).map((sid) => CACHE_PREFIX + sid))];
  if (!keys.length) return;
  try {
    await redisClient.del(keys);
  } catch (error) {
    console.error('[session] 清除 Redis 会话缓存失败 code=%s', stableAgentErrorCode(error));
  }
}

async function createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent }) {
  await pool.query(
    `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
    [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent],
  );
  return { sid };
}

async function createDeviceBoundSession({ sid, userId, role, maxAgeSeconds, ip, userAgent, deviceKey }) {
  const connection = await pool.getConnection();
  let previousSids = [];
  try {
    await connection.beginTransaction();
    // 索引 idx_user_sessions_user_device_key 让同一账号同一设备的登录串行化。
    // 历史版本可能已经留下多条同设备会话，所以先整体替换而不是只 UPDATE 第一条。
    const [existingRows] = await connection.query(
      `SELECT sid FROM user_sessions
       WHERE user_id = ? AND device_key = ?
       FOR UPDATE`,
      [userId, deviceKey],
    );
    previousSids = existingRows.map((row) => row.sid).filter(Boolean);
    if (previousSids.length) {
      await connection.query('DELETE FROM user_sessions WHERE user_id = ? AND device_key = ?', [userId, deviceKey]);
    }
    await connection.query(
      `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent, device_key)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?, ?)`,
      [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent, deviceKey],
    );
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // 原始数据库异常仍由下方处理，rollback 失败不能覆盖它。
    }
    throw error;
  } finally {
    connection.release();
  }

  // 旧 sid 若仍留在 Redis，会在缓存 TTL 内绕过 MySQL 的删除结果；提交后必须同步驱逐。
  await clearSessionCache(previousSids);
  return { sid };
}

// 滑动过期逻辑（抽出来，MySQL 更新和 Redis 都复用）
function calcSlidingExpiry(session) {
  const SEVEN_DAY_MS = 604800000;
  const expiresAt = new Date(session.expires_at);
  const createTime = new Date(session.create_time);
  const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  if (expiresAt.getTime() - createTime.getTime() >= SEVEN_DAY_MS) {
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
        [renewSeconds, sid],
      );
    } else {
      await pool.query('UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ?', [sid]);
    }
  } catch (e) {
    // 静默忽略
  }
}

export const createSession = async ({ userId, role, maxAgeMs, ip = '', userAgent = '', deviceId = '' }) => {
  const sid = createSessionId();
  const maxAgeSeconds = Math.max(1, Math.ceil(maxAgeMs / 1000));
  const deviceKey = getSessionDeviceKey(deviceId);
  if (!deviceKey) {
    return createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent });
  }

  try {
    return await createDeviceBoundSession({ sid, userId, role, maxAgeSeconds, ip, userAgent, deviceKey });
  } catch (error) {
    // 部署滚动期间若迁移尚未执行，登录仍应可用；迁移完成后自动启用设备归并。
    if (isDeviceKeySchemaUnavailable(error)) {
      return createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent });
    }
    throw error;
  }
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
        Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000),
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
    [sid],
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
      [renewSeconds, sid],
    );
    session.expires_in_seconds = renewSeconds;
  } else {
    await pool.query('UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ?', [sid]);
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
  // await 确保返回前 Redis 缓存已清,避免残留缓存在 TTL 内仍被判为有效会话
  try {
    await redisClient.del(CACHE_PREFIX + sid);
  } catch (e) {
    console.error('[session] 清除 Redis 会话缓存失败 code=%s', stableAgentErrorCode(e));
  }
};

export const removeUserSessions = async (userId) => {
  if (!userId) return;
  const [rows] = await pool.query('SELECT sid FROM user_sessions WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
  // 清除 Redis 缓存
  const keys = rows.map((r) => CACHE_PREFIX + r.sid);
  if (keys.length > 0) {
    // await 确保封号/删号返回前 Redis 缓存已清,关闭最长 CACHE_TTL(15 分钟)的失效延迟窗口
    try {
      await redisClient.del(keys);
    } catch (e) {
      console.error('[session] 清除用户 Redis 会话缓存失败 code=%s', stableAgentErrorCode(e));
    }
  }
};

export const cleanupExpiredSessions = async () => {
  await pool.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
};

// 清理历史 openRoot 遗留的“visitor 用户 + root 会话角色”。
// 鉴权已不再信任 session.role，因此这些会话即使尚未清理也没有 root 权限；此处用于彻底下线旧入口并清除缓存残留。
export const cleanupLegacyElevatedVisitorSessions = async () => {
  const [rows] = await pool.query(
    `SELECT s.sid
     FROM user_sessions s
     INNER JOIN user u ON u.id = s.user_id
     WHERE u.role = ? AND s.role = ?`,
    ['visitor', 'root'],
  );
  const sids = rows.map((row) => row.sid).filter(Boolean);
  if (sids.length === 0) return 0;

  const placeholders = sids.map(() => '?').join(',');
  await pool.query(`DELETE FROM user_sessions WHERE sid IN (${placeholders})`, sids);
  try {
    await redisClient.del(sids.map((sid) => CACHE_PREFIX + sid));
  } catch (e) {
    console.error('[session] 清理历史游客提权缓存失败 code=%s', stableAgentErrorCode(e));
  }
  return sids.length;
};

// 列出某用户当前所有有效会话(供"登录设备/会话管理"展示 + 远程下线)
export const listUserSessions = async (userId) => {
  if (!userId) return [];
  try {
    const [rows] = await pool.query(
      `SELECT sid, ip, user_agent, device_key, create_time, last_active_time, expires_at
       FROM user_sessions
       WHERE user_id = ? AND expires_at > NOW()
       ORDER BY last_active_time DESC`,
      [userId],
    );
    return rows;
  } catch (error) {
    // 新列未迁移时保持旧列表能力；不让设置页因为展示增强而不可用。
    if (!isDeviceKeySchemaUnavailable(error)) throw error;
    const [rows] = await pool.query(
      `SELECT sid, ip, user_agent, create_time, last_active_time, expires_at
       FROM user_sessions
       WHERE user_id = ? AND expires_at > NOW()
       ORDER BY last_active_time DESC`,
      [userId],
    );
    return rows.map((row) => ({ ...row, device_key: '' }));
  }
};

function sessionActivityTime(session) {
  const value = new Date(session?.last_active_time || session?.create_time || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

// 设备列表只按 stable device key 聚合。IP 和 UA 不是可靠设备身份：共享出口、浏览器升级和伪造 UA
// 都可能把远端会话误挂到当前设备，从而让“下线其他设备”漏删。历史无 key 的每条会话独立展示和撤销。
export function groupUserSessions(rows, currentSid = '') {
  const sessions = Array.isArray(rows) ? rows.filter((row) => row?.sid) : [];
  const grouped = new Map();
  for (const session of sessions) {
    const deviceKey = String(session.device_key || '').trim();
    const key = deviceKey ? `device:${deviceKey}` : `session:${session.sid}`;

    const current = session.sid === currentSid;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { representative: session, sids: [session.sid], current });
      continue;
    }
    existing.sids.push(session.sid);
    existing.current ||= current;
    if (sessionActivityTime(session) > sessionActivityTime(existing.representative)) {
      existing.representative = session;
    }
  }

  return [...grouped.entries()]
    .map(([groupKey, group]) => ({
      ...group.representative,
      groupKey,
      sids: group.sids,
      sessionCount: group.sids.length,
      current: group.current,
    }))
    .sort((left, right) => sessionActivityTime(right) - sessionActivityTime(left));
}
