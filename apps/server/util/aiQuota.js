/**
 * AI token 配额闸门。
 *
 * 安全约束：
 * - 默认强制执行；只有显式设置 AI_GATE_ENFORCE=false 才进入观测模式。
 * - 游客同时占用“设备 + 网络”两个日额度桶，客户端轮换 fingerprint 不能无限绕过。
 * - 额度账本只保存 HMAC 后的游客标识，不保存原始 IP、UA 或 fingerprint。
 * - 检查与占位在 MySQL 同一事务内完成，不依赖 Redis；Redis 故障不会让配额失效。
 * - 每次占位都有服务端请求键，结算使用数据库状态机保证跨进程幂等。
 * - 配额存储异常时失败关闭，Provider 不会在无保护状态下继续调用。
 */
import crypto from 'node:crypto';
import net from 'node:net';
import pool from '../db/index.js';
import { levelForExp, rankOf, RANKS } from './growth.js';
import { getClientIp } from './security/requestContext.js';

// 请求前占位（约等于真实 p90 用量）；结束后按真实用量校正。
const RESERVE_TOKENS = 5000;
const DAILY_QUOTA = {
  user: 100_000,
  visitor: 30_000,
};

const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);
const ENFORCE = !DISABLED_VALUES.has(
  String(process.env.AI_GATE_ENFORCE || '')
    .trim()
    .toLowerCase(),
);
const GUEST_NETWORK_QUOTA_MULTIPLIER = (() => {
  const value = Number(process.env.AI_GUEST_NETWORK_QUOTA_MULTIPLIER || 3);
  return Number.isFinite(value) ? Math.min(20, Math.max(1, Math.floor(value))) : 3;
})();
const LOCAL_HASH_SECRET = 'light-note-ai-quota-local-development-only';
const RESERVATION_STATUS = new Set(['pending', 'reserved', 'blocked', 'reconciled']);

function createQuotaError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = status >= 500;
  return error;
}

function isLocalQuotaRuntime() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (['test', 'development'].includes(nodeEnv)) return true;
  return !nodeEnv && process.platform !== 'linux';
}

function quotaHashSecret() {
  const configured = String(process.env.AI_QUOTA_HASH_SECRET || '').trim();
  if (configured) {
    if (!isLocalQuotaRuntime() && Buffer.byteLength(configured, 'utf8') < 32) {
      throw createQuotaError('AI_QUOTA_SECRET_WEAK', 'AI 配额服务暂不可用');
    }
    return configured;
  }
  // 测试和本机开发保留零配置体验。生产部署运行在 Linux；即便误漏 NODE_ENV，也不能回落到公开常量。
  if (isLocalQuotaRuntime()) return LOCAL_HASH_SECRET;
  throw createQuotaError('AI_QUOTA_SECRET_MISSING', 'AI 配额服务暂不可用');
}

function logQuotaFailure(stage) {
  // 只输出稳定错误码；数据库错误消息可能包含主机、SQL 或连接信息，禁止进入日志。
  console.warn(`[aiQuota] ${stage}: AI_QUOTA_STORE_UNAVAILABLE`);
}

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function requestHeader(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name];
  if (direct != null) return Array.isArray(direct) ? direct[0] : direct;
  const matched = Object.entries(headers).find(([key]) => String(key).toLowerCase() === name);
  return Array.isArray(matched?.[1]) ? matched[1][0] : matched?.[1];
}

/**
 * 前端历史上使用 fingerprint，部分客户端使用 x-fingerprint。这里保持统一优先级。
 * 返回值仅用于请求内身份绑定；配额账本会在写入前 HMAC，绝不保存这个原值。
 */
export function resolveFingerprint(req) {
  const raw =
    requestHeader(req, 'x-fingerprint') ??
    requestHeader(req, 'fingerprint') ??
    req?.body?.fingerprint ??
    req?.ip ??
    req?.socket?.remoteAddress ??
    'missing';
  return (
    String(raw || 'missing')
      .trim()
      .slice(0, 128) || 'missing'
  );
}

function expandIpv6(value) {
  const normalized = String(value || '')
    .replace(/^\[|\]$/g, '')
    .split('%')[0]
    .toLowerCase();
  if (net.isIP(normalized) !== 6) return '';
  const [leftRaw = '', rightRaw = ''] = normalized.split('::');
  const convertPart = (part) => {
    const pieces = part ? part.split(':').filter(Boolean) : [];
    const last = pieces.at(-1);
    if (last && net.isIP(last) === 4) {
      const bytes = last.split('.').map(Number);
      pieces.splice(-1, 1, ((bytes[0] << 8) | bytes[1]).toString(16), ((bytes[2] << 8) | bytes[3]).toString(16));
    }
    return pieces;
  };
  const left = convertPart(leftRaw);
  const right = convertPart(rightRaw);
  const missing = Math.max(0, 8 - left.length - right.length);
  return [...left, ...Array(missing).fill('0'), ...right]
    .slice(0, 8)
    .map((part) => part.padStart(4, '0'))
    .join(':');
}

/**
 * 网络桶只使用 Express 在 trust proxy=1 下解析出的可信 req.ip，不读取客户端可伪造的 XFF 首段。
 * IPv4 归并到 /24，IPv6 归并到 /64，降低同网段地址轮换绕过的空间。
 */
export function resolveNetworkBinding(req) {
  const raw = String(getClientIp(req) || 'unknown').trim();
  if (net.isIP(raw) === 4) {
    const parts = raw.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  const expanded = expandIpv6(raw);
  if (expanded) return `${expanded.split(':').slice(0, 4).join(':')}::/64`;
  return 'unknown';
}

function hashVisitorBinding(kind, value) {
  return `h_${crypto.createHmac('sha256', quotaHashSecret()).update(`v1\0${kind}\0${value}`).digest('hex').slice(0, 48)}`;
}

function resolveSubjects(req, { userId, userRole } = {}) {
  if (userRole === 'visitor' || !userId || userId === 'visitor') {
    return [
      {
        type: 'visitor_device',
        key: hashVisitorBinding('device', resolveFingerprint(req)),
        quota: DAILY_QUOTA.visitor,
      },
      {
        type: 'visitor_network',
        key: hashVisitorBinding('network', resolveNetworkBinding(req)),
        quota: DAILY_QUOTA.visitor * GUEST_NETWORK_QUOTA_MULTIPLIER,
      },
    ];
  }
  return [{ type: 'user', key: String(userId).trim().slice(0, 128), quota: DAILY_QUOTA.user }];
}

// 注册用户按成长等级下发额度；查不到成长记录时用 Lv.1，root 视为满级。
async function userDailyQuota(userId, userRole) {
  let base;
  if (userRole === 'root') {
    base = RANKS[RANKS.length - 1].aiTokenDaily;
  } else {
    try {
      const [rows] = await pool.query('SELECT exp FROM user_growth WHERE user_id = ?', [userId]);
      base = rankOf(levelForExp(Number(rows[0]?.exp || 0))).aiTokenDaily;
    } catch {
      // 回落到最低等级是安全降级，不会意外扩大额度。
      base = RANKS[0].aiTokenDaily;
    }
  }
  let bonus = 0;
  try {
    const [rows] = await pool.query('SELECT bonus_tokens FROM ai_daily_bonus WHERE user_id = ? AND day = ?', [
      userId,
      dayKey(),
    ]);
    bonus = Math.max(0, Number(rows[0]?.bonus_tokens || 0));
  } catch {
    // 加油包表不可用时不发放额外额度，保持失败安全。
  }
  return base + bonus;
}

function sortedSubjects(subjects) {
  return [...subjects].sort((a, b) => `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`));
}

function normalizeStoredSubjects(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: String(item.type || '').slice(0, 24),
      key: String(item.key || '').slice(0, 128),
      quota: Math.max(0, Number(item.quota || 0)),
      used: Math.max(0, Number(item.used || 0)),
    }))
    .filter((item) => item.type && item.key && item.quota > 0);
}

function reservationKey(ctx, subjects, pk) {
  // requestId 必须由服务端调用方提供；未提供时生成随机键。主体摘要避免不同账号碰撞同一 requestId。
  const requestId = String(ctx?.requestId || crypto.randomUUID())
    .trim()
    .slice(0, 256);
  const scope = sortedSubjects(subjects)
    .map((item) => `${item.type}:${item.key}`)
    .join('|');
  return crypto.createHash('sha256').update(`v1\0${pk}\0${scope}\0${requestId}`).digest('hex');
}

function effectiveStatus(subjects, visitor) {
  if (!visitor) {
    const subject = subjects[0] || { used: 0, quota: DAILY_QUOTA.user };
    return {
      used: Math.max(0, Number(subject.used || 0)),
      quota: Math.max(0, Number(subject.quota || 0)),
      remaining: Math.max(0, Number(subject.quota || 0) - Number(subject.used || 0)),
    };
  }
  const device = subjects.find((item) => item.type === 'visitor_device') || {
    used: 0,
    quota: DAILY_QUOTA.visitor,
  };
  const network = subjects.find((item) => item.type === 'visitor_network') || {
    used: 0,
    quota: DAILY_QUOTA.visitor * GUEST_NETWORK_QUOTA_MULTIPLIER,
  };
  const quota = Number(device.quota || DAILY_QUOTA.visitor);
  const remaining = Math.max(
    0,
    Math.min(
      quota,
      Number(device.quota || 0) - Number(device.used || 0),
      Number(network.quota || 0) - Number(network.used || 0),
    ),
  );
  return { used: Math.max(0, quota - remaining), quota, remaining };
}

/**
 * 同一事务中完成：请求幂等认领 → 所有额度行加锁 → 检查 → 双桶占位。
 * 全局按 type/key 排序加锁，避免相同网络下不同设备并发产生锁顺序死锁。
 */
async function reserveSubjectsAtomic(subjects, pk, quotaReservationKey) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [insertResult] = await connection.query(
      `INSERT IGNORE INTO ai_token_reservations
        (reservation_key, period_key, status, subjects_json, reserved_tokens)
       VALUES (?, ?, 'pending', '[]', ?)`,
      [quotaReservationKey, pk, RESERVE_TOKENS],
    );
    const [reservationRows] = await connection.query(
      `SELECT status, subjects_json, reserved_tokens, actual_tokens
         FROM ai_token_reservations
        WHERE reservation_key = ?
        FOR UPDATE`,
      [quotaReservationKey],
    );
    const reservation = reservationRows[0];
    if (!reservation || !RESERVATION_STATUS.has(String(reservation.status || ''))) {
      throw createQuotaError('AI_QUOTA_RESERVATION_INVALID', 'AI 配额服务暂不可用');
    }
    if (Number(insertResult?.affectedRows || 0) === 0) {
      await connection.commit();
      return {
        duplicate: true,
        status: reservation.status,
        subjects: normalizeStoredSubjects(reservation.subjects_json),
      };
    }

    const lockedSubjects = [];
    for (const subject of sortedSubjects(subjects)) {
      await connection.query(
        `INSERT INTO ai_token_usage
          (subject_type, subject_key, period_type, period_key, tokens_used, call_count)
         VALUES (?, ?, 'day', ?, 0, 0)
         ON DUPLICATE KEY UPDATE tokens_used = tokens_used`,
        [subject.type, subject.key, pk],
      );
      const [rows] = await connection.query(
        `SELECT tokens_used
           FROM ai_token_usage
          WHERE subject_type = ? AND subject_key = ? AND period_type = 'day' AND period_key = ?
          FOR UPDATE`,
        [subject.type, subject.key, pk],
      );
      lockedSubjects.push({ ...subject, used: Math.max(0, Number(rows[0]?.tokens_used || 0)) });
    }

    const blocked = ENFORCE && lockedSubjects.some((item) => item.used + RESERVE_TOKENS > item.quota);
    if (!blocked) {
      for (const subject of lockedSubjects) {
        const [updateResult] = await connection.query(
          `UPDATE ai_token_usage
              SET tokens_used = tokens_used + ?, call_count = call_count + 1
            WHERE subject_type = ? AND subject_key = ? AND period_type = 'day' AND period_key = ?`,
          [RESERVE_TOKENS, subject.type, subject.key, pk],
        );
        if (Number(updateResult?.affectedRows || 0) !== 1) {
          throw createQuotaError('AI_QUOTA_COUNTER_UPDATE_FAILED', 'AI 配额服务暂不可用');
        }
      }
    }
    const [reservationUpdate] = await connection.query(
      `UPDATE ai_token_reservations
          SET status = ?, subjects_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE reservation_key = ?`,
      [blocked ? 'blocked' : 'reserved', JSON.stringify(lockedSubjects), quotaReservationKey],
    );
    if (Number(reservationUpdate?.affectedRows || 0) !== 1) {
      throw createQuotaError('AI_QUOTA_RESERVATION_UPDATE_FAILED', 'AI 配额服务暂不可用');
    }
    await connection.commit();
    return { duplicate: false, blocked, subjects: lockedSubjects };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // 原异常优先；未提交的占位不会形成免费额度。
    }
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeActualTokens(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(parsed)));
}

async function reconcileReservation(handle, actualTokens, aborted) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT status, period_key, subjects_json, reserved_tokens
         FROM ai_token_reservations
        WHERE reservation_key = ?
        FOR UPDATE`,
      [handle.reservationKey],
    );
    const reservation = rows[0];
    if (!reservation) throw createQuotaError('AI_QUOTA_RESERVATION_MISSING', 'AI 配额结算暂不可用');
    if (reservation.status !== 'reserved') {
      await connection.commit();
      return reservation.status === 'reconciled';
    }
    const subjects = normalizeStoredSubjects(reservation.subjects_json);
    if (!subjects.length) throw createQuotaError('AI_QUOTA_RESERVATION_INVALID', 'AI 配额结算暂不可用');
    const pk = String(reservation.period_key || '');
    if (!/^\d{8}$/.test(pk)) throw createQuotaError('AI_QUOTA_RESERVATION_INVALID', 'AI 配额结算暂不可用');
    const reserved = Math.max(0, Number(reservation.reserved_tokens || handle.reserved || 0));
    const actual = normalizeActualTokens(actualTokens);
    // 主动断开时不得退还占位，避免“断开即免费”；正常结束则校正为 Provider 报告的真实值。
    const delta = aborted ? Math.max(0, actual - reserved) : actual - reserved;
    if (delta !== 0) {
      for (const subject of sortedSubjects(subjects)) {
        const [updateResult] = await connection.query(
          `UPDATE ai_token_usage
            SET tokens_used = GREATEST(0, tokens_used + ?)
            WHERE subject_type = ? AND subject_key = ? AND period_type = 'day' AND period_key = ?`,
          [delta, subject.type, subject.key, pk],
        );
        // 唯一键单行更新只会影响 0 或 1 行;GREATEST(0,...) 把已为 0 的计数继续钳到 0 时无变化→0 行,属合法 no-op,
        // 不应误判为结算失败(否则预留卡在 reserved)。仅 >1(理论不可能)才视为异常。方向保守:宁可少退、不放大额度。
        if (Number(updateResult?.affectedRows || 0) > 1) {
          throw createQuotaError('AI_QUOTA_COUNTER_UPDATE_FAILED', 'AI 配额结算暂不可用');
        }
      }
    }
    const [reservationUpdate] = await connection.query(
      `UPDATE ai_token_reservations
          SET status = 'reconciled', actual_tokens = ?, updated_at = CURRENT_TIMESTAMP
        WHERE reservation_key = ?`,
      [actual, handle.reservationKey],
    );
    if (Number(reservationUpdate?.affectedRows || 0) !== 1) {
      throw createQuotaError('AI_QUOTA_RESERVATION_UPDATE_FAILED', 'AI 配额结算暂不可用');
    }
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // 保留原异常。
    }
    throw error;
  } finally {
    connection.release();
  }
}

/** 请求前检查并占位。配额基础设施异常时抛出稳定 503 错误，调用方不得继续访问 Provider。 */
export async function reserve(req, ctx = {}) {
  try {
    const subjects = resolveSubjects(req, ctx);
    const visitor = subjects.some((item) => item.type.startsWith('visitor_'));
    if (!visitor) subjects[0].quota = await userDailyQuota(ctx.userId, ctx.userRole);
    const pk = dayKey();
    const quotaReservationKey = reservationKey(ctx, subjects, pk);
    const gate = await reserveSubjectsAtomic(subjects, pk, quotaReservationKey);
    const status = effectiveStatus(gate.subjects, visitor);
    if (gate.duplicate) {
      if (gate.status === 'blocked') {
        return { blocked: true, type: visitor ? 'fingerprint' : 'user', ...status, reason: 'quota_exceeded' };
      }
      throw createQuotaError('AI_QUOTA_DUPLICATE_REQUEST', '重复的 AI 请求已被拦截', 409);
    }
    if (gate.blocked) {
      return { blocked: true, type: visitor ? 'fingerprint' : 'user', ...status, reason: 'quota_exceeded' };
    }
    return {
      exempt: false,
      blocked: false,
      type: visitor ? 'fingerprint' : 'user',
      pk,
      reservationKey: quotaReservationKey,
      reserved: RESERVE_TOKENS,
      quota: status.quota,
      used: status.used,
      subjects: gate.subjects,
    };
  } catch (error) {
    if (error?.code === 'AI_QUOTA_DUPLICATE_REQUEST') throw error;
    logQuotaFailure('reserve_failed');
    throw createQuotaError('AI_QUOTA_UNAVAILABLE', 'AI 配额服务暂不可用，请稍后重试');
  }
}

/**
 * 请求结束后幂等结算。失败时保留原占位（失败安全），返回 false 供观测，不把原始错误写入日志。
 */
export async function reconcile(handle, actualTokens, { aborted = false } = {}) {
  if (!handle || handle.exempt || handle.blocked || !handle.reservationKey) return true;
  try {
    return await reconcileReservation(handle, actualTokens, aborted);
  } catch {
    logQuotaFailure('reconcile_deferred');
    return false;
  }
}

async function getDayUsed(type, key, pk) {
  const [rows] = await pool.query(
    `SELECT tokens_used
       FROM ai_token_usage
      WHERE subject_type = ? AND subject_key = ? AND period_type = 'day' AND period_key = ?`,
    [type, key, pk],
  );
  return Math.max(0, Number(rows[0]?.tokens_used || 0));
}

/** 查询当前请求主体的当日额度；异常时明确标记 unavailable，不伪装成豁免。 */
export async function getStatus(req, ctx = {}) {
  try {
    const subjects = resolveSubjects(req, ctx);
    const visitor = subjects.some((item) => item.type.startsWith('visitor_'));
    if (!visitor) subjects[0].quota = await userDailyQuota(ctx.userId, ctx.userRole);
    const pk = dayKey();
    const resolved = await Promise.all(
      subjects.map(async (subject) => ({ ...subject, used: await getDayUsed(subject.type, subject.key, pk) })),
    );
    const status = effectiveStatus(resolved, visitor);
    return {
      exempt: false,
      type: visitor ? 'fingerprint' : 'user',
      ...status,
      enforcing: ENFORCE,
    };
  } catch {
    logQuotaFailure('status_failed');
    return {
      exempt: false,
      unavailable: true,
      error: 'AI_QUOTA_UNAVAILABLE',
      role: ctx?.userRole,
      enforcing: ENFORCE,
    };
  }
}

/** Agent“查我的 AI 额度”工具使用；游客没有请求网络上下文，只返回额度说明。 */
export async function getStatusForUser(userId, userRole) {
  try {
    if (!userId || userId === 'visitor' || userRole === 'visitor') {
      return { guest: true, quota: DAILY_QUOTA.visitor, enforcing: ENFORCE };
    }
    const quota = await userDailyQuota(userId, userRole);
    const used = await getDayUsed('user', String(userId).slice(0, 128), dayKey());
    return { type: 'user', used, quota, remaining: Math.max(0, quota - used), enforcing: ENFORCE };
  } catch {
    logQuotaFailure('user_status_failed');
    return { unavailable: true, error: 'AI_QUOTA_UNAVAILABLE', enforcing: ENFORCE };
  }
}

export function isEnforcing() {
  return ENFORCE;
}
