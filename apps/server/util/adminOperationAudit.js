import crypto from 'node:crypto';
import pool from '../db/index.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const OUTCOMES = new Set(['intent', 'succeeded', 'failed', 'denied']);
const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|sql|content|payload|body/iu;

export function maskAuditIp(value) {
  const ip = String(value || '')
    .trim()
    .replace(/^::ffff:/u, '');
  if (!ip) return '';
  const v4 = ip.split('.');
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/u.test(part))) return `${v4[0]}.${v4[1]}.${v4[2]}.0`;
  const v6 = ip.split(':').filter(Boolean);
  return v6.length ? `${v6.slice(0, 4).join(':')}::` : '';
}

function safeMetadataValue(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadataValue(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 500);
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 30)) {
    const key = String(rawKey).slice(0, 64);
    if (!key || SENSITIVE_KEY.test(key)) continue;
    result[key] = safeMetadataValue(rawValue, depth + 1);
  }
  return result;
}

export function sanitizeAuditMetadata(value) {
  const sanitized = safeMetadataValue(value || {});
  const serialized = JSON.stringify(sanitized || {});
  return serialized.length <= 8_000 ? serialized : JSON.stringify({ truncated: true });
}

export async function recordAdminOperationAudit(entry, options = {}) {
  const db = options.db || pool;
  const required = options.required === true;
  if (!entry?.actorUserId || !entry?.action) {
    if (required) throw Object.assign(new Error('审计字段不完整'), { code: 'ADMIN_AUDIT_INVALID' });
    return false;
  }
  try {
    const auditId = crypto.randomUUID();
    await db.query(
      `INSERT INTO admin_operation_audit
       (id, actor_user_id, action, target_type, target_id, outcome, reason, request_id,
        ip_masked, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditId,
        String(entry.actorUserId).slice(0, 255),
        String(entry.action).slice(0, 64),
        entry.targetType ? String(entry.targetType).slice(0, 64) : null,
        entry.targetId ? String(entry.targetId).slice(0, 255) : null,
        OUTCOMES.has(entry.outcome) ? entry.outcome : 'failed',
        String(entry.reason || '').slice(0, 500),
        entry.requestId ? String(entry.requestId).slice(0, 64) : null,
        maskAuditIp(entry.ip),
        sanitizeAuditMetadata(entry.metadata),
      ],
    );
    return auditId;
  } catch (error) {
    console.error('[admin-audit] write failed code=%s', stableAgentErrorCode(error));
    if (required) {
      throw Object.assign(new Error('管理员审计不可用'), {
        code: 'ADMIN_AUDIT_UNAVAILABLE',
        cause: error,
      });
    }
    return false;
  }
}

export const adminOperationAuditInternals = {
  safeMetadataValue,
};
