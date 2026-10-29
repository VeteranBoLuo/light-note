import crypto from 'crypto';
import pool from '../db/index.js';

// 续期与会话活跃时间至多每分钟写一次；有效性仍逐请求以数据库为准。
const SESSION_TOUCH_INTERVAL_SECONDS = 60;
const USER_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const userActivityTouches = new Map();

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

async function createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent }) {
  await pool.query(
    `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
    [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent],
  );
  return { sid };
}

async function createDeviceBoundSession({
  sid,
  userId,
  role,
  maxAgeSeconds,
  ip,
  userAgent,
  deviceKey,
  validateAccount,
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (validateAccount) {
      const [[account]] = await connection.query('SELECT * FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
      await validateAccount(account);
    }
    // 索引 idx_user_sessions_user_device_key 让同一账号同一设备的登录串行化。
    // 历史版本可能已经留下多条同设备会话，所以先整体替换而不是只 UPDATE 第一条。
    const [existingRows] = deviceKey
      ? await connection.query(
          `SELECT sid FROM user_sessions
       WHERE user_id = ? AND device_key = ?
       FOR UPDATE`,
          [userId, deviceKey],
        )
      : [[]];
    if (existingRows.length) {
      await connection.query('DELETE FROM user_sessions WHERE user_id = ? AND device_key = ?', [userId, deviceKey]);
    }
    if (deviceKey)
      await connection.query(
        `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent, device_key)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?, ?)`,
        [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent, deviceKey],
      );
    else
      await connection.query(
        `INSERT INTO user_sessions (sid, user_id, role, expires_at, ip, user_agent)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
        [sid, userId, role || 'visitor', maxAgeSeconds, ip, userAgent],
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
  return { sid };
}

// 滑动过期逻辑
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

export async function touchUserLastActive(userId, now = Date.now()) {
  if (!userId) return false;
  const lastTouch = userActivityTouches.get(userId) || 0;
  if (lastTouch && now - lastTouch < USER_ACTIVITY_TOUCH_INTERVAL_MS) return false;
  userActivityTouches.set(userId, now);
  if (userActivityTouches.size > 5000) {
    const cutoff = now - USER_ACTIVITY_TOUCH_INTERVAL_MS;
    for (const [id, touchedAt] of userActivityTouches) {
      if (touchedAt < cutoff) userActivityTouches.delete(id);
    }
  }
  try {
    await pool.query(
      `UPDATE user SET last_active_time = NOW()
       WHERE id = ? AND (last_active_time IS NULL OR last_active_time < DATE_SUB(NOW(), INTERVAL 5 MINUTE))`,
      [userId],
    );
    return true;
  } catch {
    // 滚动发布期间字段尚未迁移时不能影响认证主链路。
    userActivityTouches.delete(userId);
    return false;
  }
}

export const createSession = async ({
  userId,
  role,
  maxAgeMs,
  ip = '',
  userAgent = '',
  deviceId = '',
  validateAccount,
}) => {
  const sid = createSessionId();
  const maxAgeSeconds = Math.max(1, Math.ceil(maxAgeMs / 1000));
  const deviceKey = getSessionDeviceKey(deviceId);
  if (!deviceKey && !validateAccount) {
    return createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent });
  }

  try {
    return await createDeviceBoundSession({
      sid,
      userId,
      role,
      maxAgeSeconds,
      ip,
      userAgent,
      deviceKey,
      validateAccount,
    });
  } catch (error) {
    // 部署滚动期间若迁移尚未执行，登录仍应可用；迁移完成后自动启用设备归并。
    if (isDeviceKeySchemaUnavailable(error)) {
      if (validateAccount)
        return createDeviceBoundSession({
          sid,
          userId,
          role,
          maxAgeSeconds,
          ip,
          userAgent,
          deviceKey: '',
          validateAccount,
        });
      return createLegacySession({ sid, userId, role, maxAgeSeconds, ip, userAgent });
    }
    throw error;
  }
};

// 会话有效性只以 MySQL 为准，不经过 Redis：认证不因 Redis 断线挂起，也没有需要驱逐的第二事实源。
// 共享锁读会等待未提交的撤销事务，不能凭撤销前的快照放行；续期与 last_active_time 按数据库记录的
// 上次活跃时间节流，避免每个请求都写会话行，多进程之间也无需共享节流状态。
export const getSession = async (sid) => {
  if (!sid) return null;

  const [rows] = await pool.query(
    `SELECT
       sid,
       user_id,
       role,
       expires_at,
       create_time,
       GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS expires_in_seconds,
       (last_active_time IS NULL OR last_active_time < DATE_SUB(NOW(), INTERVAL ? SECOND)) AS touch_due
     FROM user_sessions
     WHERE sid = ? AND expires_at > NOW()
     LIMIT 1
     LOCK IN SHARE MODE`,
    [SESSION_TOUCH_INTERVAL_SECONDS, sid],
  );
  const row = rows[0];
  if (!row) {
    await removeSession(sid);
    return null;
  }
  const { touch_due: touchDue, ...session } = row;
  if (!Number(touchDue)) return session;

  // 写入保留有效期条件：与撤销并发时只更新仍有效的会话，不能复活已删除或过期的记录。
  const { renewSeconds } = calcSlidingExpiry(session);
  if (renewSeconds > 0) {
    await pool.query(
      `UPDATE user_sessions
       SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
           last_active_time = NOW()
       WHERE sid = ? AND expires_at > NOW()`,
      [renewSeconds, sid],
    );
    session.expires_in_seconds = renewSeconds;
  } else {
    await pool.query('UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ? AND expires_at > NOW()', [sid]);
  }
  await touchUserLastActive(session.user_id);
  return session;
};

export const removeSession = async (sid) => {
  if (!sid) return;
  await pool.query('DELETE FROM user_sessions WHERE sid = ?', [sid]);
};

export const removeUserSessions = async (userId) => {
  if (!userId) return;
  await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
};

export const cleanupExpiredSessions = async () => {
  await pool.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
};

// 清理历史 openRoot 遗留的“visitor 用户 + root 会话角色”。
// 鉴权已不再信任 session.role，因此这些会话即使尚未清理也没有 root 权限；此处用于彻底下线旧入口。
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
