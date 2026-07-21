import crypto from 'node:crypto';
import pool from '../db/index.js';
import * as aiQuota from './aiQuota.js';
import { AGENT_SSE_PROTOCOL_VERSION } from './agent/sseLifecycle.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const RESPONSE_EVENT_TTL_SECONDS = 10 * 60;
const MAX_RECOVERY_EVENTS = 500;
// 逐 token 的 delta 与 heartbeat 数量随回答长度线性增长,但客户端恢复只用权威快照(snapshot.answer 整体替换),
// 并不回放这些事件;持久化时剔除它们,只保留结构性事件与末尾终态,避免长回答被事件数上限挡掉而无法恢复。
const RECOVERY_SKIP_EVENT_TYPES = new Set(['delta', 'heartbeat']);
const VALID_ADMIN_MODES = new Set(['normal', 'readonly', 'maintain']);
const RESPONSE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let responseCleanupTimer = null;

function recoveryError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

function identifier(value, field, maxLength = 64) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw recoveryError('AI_RESPONSE_RECOVERY_INVALID_ARGUMENT', `${field} 无效`);
  }
  return normalized;
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    throw recoveryError('AI_RESPONSE_RECOVERY_SERIALIZE_FAILED', '恢复快照无法序列化', 500);
  }
}

function visitorOwnerId(req) {
  return `visitor:${crypto.createHash('sha256').update(aiQuota.resolveFingerprint(req)).digest('hex').slice(0, 40)}`;
}

function assertIdentity(identity) {
  const mode = String(identity?.adminContextMode || 'normal');
  const actorUserId = identifier(identity?.actorUserId, 'actorUserId');
  const subjectUserId = identifier(identity?.subjectUserId, 'subjectUserId');
  if (!VALID_ADMIN_MODES.has(mode)) {
    throw recoveryError('AI_RESPONSE_RECOVERY_IDENTITY_INVALID', '管理员上下文模式无效', 403);
  }
  if (mode === 'normal') {
    if (actorUserId !== subjectUserId || identity?.adminContextId) {
      throw recoveryError('AI_RESPONSE_RECOVERY_IDENTITY_INVALID', '普通上下文必须是用户自身', 403);
    }
    return {
      actorUserId,
      subjectUserId,
      actorRole: String(identity?.actorRole || ''),
      adminContextMode: mode,
      adminContextId: null,
    };
  }
  const adminContextId = identifier(identity?.adminContextId, 'adminContextId');
  if (identity?.actorRole !== 'root') {
    throw recoveryError('AI_RESPONSE_RECOVERY_IDENTITY_INVALID', '管理员上下文身份无效', 403);
  }
  return { actorUserId, subjectUserId, actorRole: 'root', adminContextMode: mode, adminContextId };
}

export function resolveAiResponseRecoveryIdentity(req) {
  const actor = req?.billingUser || req?.user || {};
  const subject = req?.resourceUser || req?.user || {};
  const actorRole = String(actor.role || req?.user?.role || 'visitor');
  const subjectRole = String(subject.role || req?.user?.role || actorRole);
  const adminContextMode = req?.adminContext?.mode || 'normal';
  const isVisitor = subjectRole === 'visitor' && adminContextMode === 'normal';
  const visitorId = isVisitor ? visitorOwnerId(req) : '';
  return assertIdentity({
    actorUserId: visitorId || actor.id || req?.user?.id,
    subjectUserId: visitorId || subject.id || req?.user?.id,
    actorRole,
    adminContextMode,
    adminContextId: req?.adminContext?.id || null,
  });
}

function ownerWhere(identity, alias = '') {
  const resolved = assertIdentity(identity);
  const prefix = alias ? `${alias}.` : '';
  const sql = `${prefix}actor_user_id = ? AND ${prefix}subject_user_id = ? AND ${prefix}admin_context_mode = ? AND ${prefix}admin_context_id <=> ?`;
  const params = [resolved.actorUserId, resolved.subjectUserId, resolved.adminContextMode, resolved.adminContextId];
  return { identity: resolved, sql, params };
}

export async function cleanupExpiredResponseEvents(database = pool, { maxBatches = 20 } = {}) {
  let deleted = 0;
  try {
    const batches = Math.max(1, Math.min(100, Number(maxBatches) || 20));
    for (let index = 0; index < batches; index += 1) {
      const [result] = await database.query(
        'DELETE FROM ai_response_events WHERE expires_at <= CURRENT_TIMESTAMP LIMIT 500',
      );
      const affected = Number(result?.affectedRows || 0);
      deleted += affected;
      if (affected < 500) break;
    }
  } catch (error) {
    // 清理是机会式维护，不应影响当前回答或恢复；真实读写错误仍会在后续查询暴露。
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) throw error;
  }
  return { deleted };
}

export async function startAiResponseRecoveryCleanupScheduler({ intervalMs = RESPONSE_CLEANUP_INTERVAL_MS } = {}) {
  if (responseCleanupTimer) return { started: false };
  await cleanupExpiredResponseEvents();
  const safeInterval = Math.max(10 * 60 * 1000, Number(intervalMs) || RESPONSE_CLEANUP_INTERVAL_MS);
  responseCleanupTimer = setInterval(() => {
    cleanupExpiredResponseEvents().catch((error) =>
      console.error('[ai-response-recovery] cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  }, safeInterval);
  responseCleanupTimer.unref?.();
  return { started: true, intervalMs: safeInterval };
}

export function stopAiResponseRecoveryCleanupScheduler() {
  if (responseCleanupTimer) clearInterval(responseCleanupTimer);
  responseCleanupTimer = null;
}

export async function persistAiResponseSnapshot(identity, { snapshot, events }, database = pool) {
  const owner = ownerWhere(identity);
  const requestId = identifier(snapshot?.requestId, 'requestId');
  const terminalStatus = String(snapshot?.status || '');
  if (!['completed', 'failed'].includes(terminalStatus) || !snapshot?.terminal) {
    throw recoveryError('AI_RESPONSE_RECOVERY_NOT_TERMINAL', '只允许保存终态响应快照');
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw recoveryError('AI_RESPONSE_RECOVERY_EVENTS_INVALID', '恢复事件数量无效');
  }
  // 剔除逐 token delta / heartbeat(不用于回放),始终保留末尾终态事件(它携带权威快照)。
  const recoveryEvents = events.filter(
    (event, index) => index === events.length - 1 || !RECOVERY_SKIP_EVENT_TYPES.has(String(event?.event || '')),
  );
  if (recoveryEvents.length > MAX_RECOVERY_EVENTS) {
    throw recoveryError('AI_RESPONSE_RECOVERY_EVENTS_INVALID', '恢复事件数量无效');
  }
  let previousEventId = 0;
  const normalizedEvents = recoveryEvents.map((event, index) => {
    const eventId = Number(event?.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= previousEventId) {
      throw recoveryError('AI_RESPONSE_RECOVERY_EVENT_ID_INVALID', 'SSE eventId 必须严格单调递增');
    }
    previousEventId = eventId;
    const eventType = String(event?.event || '')
      .trim()
      .slice(0, 48);
    if (!eventType) throw recoveryError('AI_RESPONSE_RECOVERY_EVENT_INVALID', '恢复事件类型不能为空');
    const payload = index === recoveryEvents.length - 1 ? { ...event, recoverySnapshot: snapshot } : event;
    return { eventId, eventType, payload };
  });
  if (Number(snapshot.lastEventId) !== previousEventId || Number(snapshot.terminal.eventId) !== previousEventId) {
    throw recoveryError('AI_RESPONSE_RECOVERY_TERMINAL_MISMATCH', '终态快照与事件序列不一致');
  }

  await cleanupExpiredResponseEvents(database);
  const placeholders = normalizedEvents.map(
    () => '(?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))',
  );
  const params = [];
  for (const event of normalizedEvents) {
    params.push(
      requestId,
      owner.identity.actorUserId,
      owner.identity.subjectUserId,
      owner.identity.adminContextMode,
      owner.identity.adminContextId,
      event.eventId,
      event.eventType,
      serializeJson(event.payload),
      RESPONSE_EVENT_TTL_SECONDS,
    );
  }
  await database.query(
    `INSERT INTO ai_response_events
      (request_id, actor_user_id, subject_user_id, admin_context_mode, admin_context_id,
       event_id, event_type, payload_json, expires_at)
     VALUES ${placeholders.join(', ')}`,
    params,
  );
  return {
    requestId,
    eventCount: normalizedEvents.length,
    lastEventId: previousEventId,
    ttlSeconds: RESPONSE_EVENT_TTL_SECONDS,
  };
}

export async function recoverAiResponse(identity, input = {}, database = pool) {
  const owner = ownerWhere(identity);
  const requestId = identifier(input.requestId, 'requestId');
  const lastEventId = input.lastEventId == null || input.lastEventId === '' ? 0 : Number(input.lastEventId);
  if (!Number.isSafeInteger(lastEventId) || lastEventId < 0) {
    throw recoveryError('AI_RESPONSE_RECOVERY_LAST_EVENT_ID_INVALID', 'lastEventId 必须是非负整数');
  }

  await cleanupExpiredResponseEvents(database);
  const [rows] = await database.query(
    `SELECT event_id, event_type, payload_json, expires_at
       FROM ai_response_events
      WHERE ${owner.sql} AND request_id = ? AND expires_at > CURRENT_TIMESTAMP
      ORDER BY event_id ASC
      LIMIT ${MAX_RECOVERY_EVENTS}`,
    [...owner.params, requestId],
  );
  if (!rows.length) {
    throw recoveryError('AI_RESPONSE_RECOVERY_NOT_FOUND', '恢复结果不存在或已过期', 404);
  }

  let snapshot = null;
  const allEvents = rows.map((row) => {
    const stored = parseJson(row.payload_json, {});
    if (stored?.recoverySnapshot) snapshot = stored.recoverySnapshot;
    const { recoverySnapshot: _recoverySnapshot, ...event } = stored || {};
    return {
      ...event,
      event: event.event || row.event_type,
      requestId,
      protocolVersion: event.protocolVersion || AGENT_SSE_PROTOCOL_VERSION,
      eventId: Number(row.event_id),
    };
  });
  if (!snapshot?.terminal) {
    throw recoveryError('AI_RESPONSE_RECOVERY_INCOMPLETE', '恢复结果尚未形成终态', 409);
  }
  const events = allEvents.filter((event) => event.eventId > lastEventId);
  return {
    protocolVersion: snapshot.protocolVersion || AGENT_SSE_PROTOCOL_VERSION,
    requestId,
    recovered: true,
    snapshot,
    events,
    lastEventId: Number(snapshot.lastEventId || allEvents.at(-1)?.eventId || 0),
    expiresAt: rows.at(-1)?.expires_at || null,
  };
}

export const aiResponseRecoveryInternals = {
  RESPONSE_EVENT_TTL_SECONDS,
  assertIdentity,
  ownerWhere,
};
