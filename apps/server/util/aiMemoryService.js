import crypto from 'node:crypto';
import pool from '../db/index.js';
import { resolveAiConversationIdentity } from './aiConversationService.js';

const MEMORY_STATUSES = new Set(['candidate', 'active', 'paused', 'expired']);
const LIVE_MEMORY_STATUSES = new Set(['candidate', 'active', 'paused']);
const MEMORY_SCOPE_TYPES = new Set(['global', 'conversation', 'resource']);
const MEMORY_TYPES = new Set(['preference', 'fact', 'topic', 'workflow', 'temporary_state']);
const RESOURCE_SCOPE_OWNER = {
  bookmark: { table: 'bookmark', ownerField: 'user_id' },
  note: { table: 'note', ownerField: 'create_by' },
  file: { table: 'files', ownerField: 'create_by' },
  tag: { table: 'tag', ownerField: 'user_id' },
};

const CANDIDATE_TTL_DAYS = 3;
const CANDIDATE_TTL_MS = CANDIDATE_TTL_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_TEMPORARY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TEMPORARY_STATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TEMPORARY_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LIVE_MEMORIES_PER_OWNER = 100;
const DEFAULT_PROMPT_CHAR_BUDGET = 6_000;
const MAX_PROMPT_CHAR_BUDGET = 12_000;

const SENSITIVE_CONTENT_PATTERNS = [
  /(?:密码|口令|密钥|验证码|password|passwd|pwd|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|token|secret|otp)\s*(?:是|为|\bis\b|=|:|：)\s*\S{4,}/iu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/iu,
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/u,
  /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{12,})\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /\b(?:https?|redis(?:s)?|mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/iu,
  /(?:cookie|session[ _-]?id|authorization)\s*(?:是|为|=|:|：)\s*\S{6,}/iu,
  /(?:身份证(?:号)?|银行卡(?:号)?|credit[ _-]?card|手机号|手机号码)\s*(?:是|为|=|:|：)\s*[A-Za-z0-9 -]{8,}/iu,
];

// 越权/提权/覆盖系统指令的注入式措辞:直连写入路径也拒绝(此前仅自动候选推断处拦截)。
// 聚焦"企图"短语,不误伤单纯提到"权限/管理员/root"的合法记忆。
const PRIVILEGE_OVERRIDE_PATTERN =
  /(?:忽略(?:掉)?(?:所有|之前|全部)?(?:系统|安全|权限)(?:提示|指令|限制|规则)|绕过(?:权限|安全|限制)|越权|提权|获得?(?:管理员|root)(?:权限|访问)|从现在开始你是(?:管理员|root)|ignore\s+(?:all\s+)?(?:previous|prior|system)\s*(?:prompt|message|instruction)|override\s+(?:policy|permission|security)|bypass\s+(?:permission|security|restriction)|grant\s+(?:me\s+)?admin)/iu;

function memoryError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

function text(value, maxLength, fallback = '') {
  const normalized = String(value ?? '').trim();
  return (normalized || fallback).slice(0, maxLength);
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

function jsonValue(value) {
  try {
    return JSON.stringify(value);
  } catch {
    throw memoryError('AI_MEMORY_SCOPE_INVALID', '记忆范围无法序列化');
  }
}

function isAdminIdentity(identity) {
  return (identity?.adminContextMode || 'normal') !== 'normal';
}

function getAdminContextDeadline(identity, now = Date.now()) {
  if (!isAdminIdentity(identity) || identity?.adminContextExpiresAt == null) return null;
  const timestamp = new Date(identity.adminContextExpiresAt).getTime();
  if (!Number.isFinite(timestamp)) {
    throw memoryError('AI_MEMORY_IDENTITY_INVALID', '管理员记忆身份的到期时间无效', 403);
  }
  if (timestamp <= now) {
    throw memoryError('AI_MEMORY_ADMIN_CONTEXT_EXPIRED', '管理员上下文已过期，不能继续访问记忆', 403);
  }
  const databaseSafeTimestamp = Math.floor(timestamp / 1000) * 1000;
  if (databaseSafeTimestamp <= now) {
    throw memoryError('AI_MEMORY_ADMIN_CONTEXT_EXPIRED', '管理员上下文即将过期，请重新进入后再管理记忆', 403);
  }
  return new Date(databaseSafeTimestamp);
}

function assertMemoryIdentity(identity) {
  const actorUserId = String(identity?.actorUserId || '').trim();
  const subjectUserId = String(identity?.subjectUserId || '').trim();
  const mode = identity?.adminContextMode || 'normal';
  if (
    !actorUserId ||
    !subjectUserId ||
    actorUserId.length > 64 ||
    subjectUserId.length > 64 ||
    identity?.actorUserId !== actorUserId ||
    identity?.subjectUserId !== subjectUserId ||
    identity?.actorRole === 'visitor' ||
    !['normal', 'readonly', 'maintain'].includes(mode)
  ) {
    throw memoryError('AI_MEMORY_IDENTITY_INVALID', 'AI 记忆身份上下文无效', 403);
  }
  if (mode === 'normal') {
    if (actorUserId !== subjectUserId || identity?.adminContextId) {
      throw memoryError('AI_MEMORY_IDENTITY_INVALID', '普通记忆身份必须是用户自身', 403);
    }
    return;
  }
  const adminContextId = String(identity?.adminContextId || '').trim();
  if (
    identity?.actorRole !== 'root' ||
    !adminContextId ||
    adminContextId.length > 64 ||
    identity.adminContextId !== adminContextId
  ) {
    throw memoryError('AI_MEMORY_IDENTITY_INVALID', '管理员记忆身份缺少有效上下文', 403);
  }
  getAdminContextDeadline(identity);
}

function assertMemoryWritable(identity) {
  assertMemoryIdentity(identity);
  if ((identity?.adminContextMode || 'normal') === 'readonly') {
    throw memoryError('ADMIN_PREVIEW_READONLY', '管理员当前处于只读预览模式，不能修改 AI 记忆', 403);
  }
}

function ownerWhere(identity, alias = '') {
  assertMemoryIdentity(identity);
  const prefix = alias ? `${alias}.` : '';
  const sql = `${prefix}actor_user_id = ? AND ${prefix}subject_user_id = ? AND ${prefix}admin_context_mode = ? AND ${prefix}admin_context_id <=> ?`;
  return {
    sql,
    params: [
      identity.actorUserId,
      identity.subjectUserId,
      identity.adminContextMode || 'normal',
      isAdminIdentity(identity) ? identity.adminContextId : null,
    ],
  };
}

function boundedInteger(value, fallback, maximum) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

function isExpired(expireAt, now = Date.now()) {
  if (!expireAt) return false;
  const expires = new Date(expireAt).getTime();
  return !Number.isFinite(expires) || expires <= now;
}

function sameExpiry(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function candidateDeadline(row) {
  const updatedAt = new Date(row.update_time || row.create_time || '').getTime();
  if (!Number.isFinite(updatedAt)) return null;
  return new Date(updatedAt + CANDIDATE_TTL_MS);
}

function isCandidateStale(row, now = Date.now()) {
  if (row.status !== 'candidate') return false;
  const deadline = candidateDeadline(row);
  return !deadline || deadline.getTime() <= now;
}

function isEffectivelyExpired(row, now = Date.now()) {
  return row.status === 'expired' || isExpired(row.expire_at, now) || isCandidateStale(row, now);
}

function normalizeMemoryType(value, fallback = 'fact') {
  const memoryType = text(value, 32, fallback);
  if (!MEMORY_TYPES.has(memoryType)) {
    throw memoryError('AI_MEMORY_TYPE_INVALID', '记忆类型不在允许范围内');
  }
  return memoryType;
}

function identifier(value, maxLength, field, { required = false } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    if (required) throw memoryError('AI_MEMORY_ID_INVALID', `${field} 不能为空`);
    return '';
  }
  if (normalized.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw memoryError('AI_MEMORY_ID_INVALID', `${field} 格式无效`);
  }
  return normalized;
}

export function containsSensitiveMemoryContent(value) {
  const content = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '');
  return SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

function normalizeContent(value) {
  const content = String(value ?? '').trim();
  if (!content) throw memoryError('AI_MEMORY_CONTENT_REQUIRED', '记忆内容不能为空');
  if (content.length > 1000) throw memoryError('AI_MEMORY_CONTENT_TOO_LONG', '记忆内容不能超过 1000 个字符');
  if (containsSensitiveMemoryContent(content)) {
    throw memoryError('AI_MEMORY_SENSITIVE_CONTENT', '记忆中疑似包含密码、Token 或其他敏感凭据，已拒绝保存');
  }
  if (PRIVILEGE_OVERRIDE_PATTERN.test(content)) {
    throw memoryError('AI_MEMORY_PRIVILEGE_OVERRIDE', '记忆疑似包含越权/提权或覆盖系统指令的内容，已拒绝保存');
  }
  return content;
}

function canonicalContent(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

function isSafePersistedContent(value) {
  const content = String(value ?? '').trim();
  return Boolean(content && content.length <= 1000 && !containsSensitiveMemoryContent(content));
}

function normalizeScope(scopeTypeValue, scopeValue, fallback = null) {
  const scopeType = text(scopeTypeValue, 32, fallback?.scopeType || 'global');
  if (!MEMORY_SCOPE_TYPES.has(scopeType)) {
    throw memoryError('AI_MEMORY_SCOPE_INVALID', '记忆范围必须是 global、conversation 或 resource');
  }
  const scope = scopeValue === undefined ? fallback?.scope || {} : scopeValue;
  if (scope != null && (typeof scope !== 'object' || Array.isArray(scope))) {
    throw memoryError('AI_MEMORY_SCOPE_INVALID', '记忆范围参数格式无效');
  }
  if (scopeType === 'global') return { scopeType, scope: {} };
  if (scopeType === 'conversation') {
    const conversationId = identifier(scope?.conversationId, 36, 'conversationId', { required: true });
    return { scopeType, scope: { conversationId } };
  }
  const resourceType = text(scope?.resourceType, 32);
  const resourceId = identifier(scope?.resourceId, 128, 'resourceId', { required: true });
  if (!RESOURCE_SCOPE_OWNER[resourceType]) {
    throw memoryError('AI_MEMORY_RESOURCE_REQUIRED', '资源范围记忆必须指定 resourceType 和 resourceId');
  }
  return { scopeType, scope: { resourceType, resourceId } };
}

function scopeKey(scope) {
  return `${scope.scopeType}:${jsonValue(scope.scope)}`;
}

function parseFutureDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw memoryError('AI_MEMORY_EXPIRE_AT_INVALID', '记忆过期时间必须是未来的有效时间');
  }
  return date;
}

function assertTemporaryStateExpiry(memoryType, expireAt) {
  if (memoryType !== 'temporary_state') return expireAt;
  if (!expireAt) {
    throw memoryError('AI_MEMORY_TEMPORARY_STATE_EXPIRY_REQUIRED', '临时状态记忆必须设置过期时间');
  }
  const remaining = new Date(expireAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > MAX_TEMPORARY_STATE_TTL_MS) {
    throw memoryError('AI_MEMORY_TEMPORARY_STATE_TTL_INVALID', '临时状态记忆最长只能保留 30 天');
  }
  return expireAt;
}

function capExpiryToAdminContext(expireAt, identity) {
  const deadline = getAdminContextDeadline(identity);
  if (!deadline) return expireAt;
  if (!expireAt || new Date(expireAt).getTime() > deadline.getTime()) return deadline;
  return new Date(expireAt);
}

function normalizeCreateExpiry(input, memoryType, identity) {
  if (input.temporary !== undefined && typeof input.temporary !== 'boolean') {
    throw memoryError('AI_MEMORY_TEMPORARY_INVALID', 'temporary 必须是布尔值');
  }
  if (memoryType === 'temporary_state' && input.temporary === false) {
    throw memoryError('AI_MEMORY_TEMPORARY_STATE_EXPIRY_REQUIRED', '临时状态记忆不能设为永久记忆');
  }
  if (input.temporary === false && input.expireAt != null) {
    throw memoryError('AI_MEMORY_EXPIRE_AT_INVALID', '永久记忆不能同时设置 expireAt');
  }
  let expireAt = null;
  if (input.expireAt != null) expireAt = parseFutureDate(input.expireAt);
  else if (memoryType === 'temporary_state') expireAt = new Date(Date.now() + DEFAULT_TEMPORARY_STATE_TTL_MS);
  else if (input.temporary === true) expireAt = new Date(Date.now() + DEFAULT_TEMPORARY_TTL_MS);
  assertTemporaryStateExpiry(memoryType, expireAt);
  return capExpiryToAdminContext(expireAt, identity);
}

function normalizeUpdateExpiry(input, currentExpireAt, memoryType, identity) {
  if (input.temporary !== undefined && typeof input.temporary !== 'boolean') {
    throw memoryError('AI_MEMORY_TEMPORARY_INVALID', 'temporary 必须是布尔值');
  }
  if (memoryType === 'temporary_state' && input.temporary === false) {
    throw memoryError('AI_MEMORY_TEMPORARY_STATE_EXPIRY_REQUIRED', '临时状态记忆不能设为永久记忆');
  }
  let expireAt;
  if (input.temporary === false) {
    if (input.expireAt != null) throw memoryError('AI_MEMORY_EXPIRE_AT_INVALID', '永久记忆不能同时设置 expireAt');
    expireAt = null;
  } else if (Object.prototype.hasOwnProperty.call(input, 'expireAt')) {
    if (input.expireAt == null || input.expireAt === '') {
      if (memoryType === 'temporary_state') expireAt = new Date(Date.now() + DEFAULT_TEMPORARY_STATE_TTL_MS);
      else expireAt = input.temporary === true ? new Date(Date.now() + DEFAULT_TEMPORARY_TTL_MS) : null;
    } else {
      expireAt = parseFutureDate(input.expireAt);
    }
  } else if (input.temporary === true) {
    if (memoryType === 'temporary_state') expireAt = new Date(Date.now() + DEFAULT_TEMPORARY_STATE_TTL_MS);
    else {
      expireAt =
        currentExpireAt && !isExpired(currentExpireAt)
          ? new Date(currentExpireAt)
          : new Date(Date.now() + DEFAULT_TEMPORARY_TTL_MS);
    }
  } else if (memoryType === 'temporary_state' && !currentExpireAt) {
    expireAt = new Date(Date.now() + DEFAULT_TEMPORARY_STATE_TTL_MS);
  } else {
    expireAt = currentExpireAt ? new Date(currentExpireAt) : null;
  }
  assertTemporaryStateExpiry(memoryType, expireAt);
  return capExpiryToAdminContext(expireAt, identity);
}

function assertAdminScopePolicy(identity, scope) {
  if (!isAdminIdentity(identity)) return;
  if (scope.scopeType !== 'conversation') {
    throw memoryError(
      'AI_MEMORY_ADMIN_CROSS_CONVERSATION_FORBIDDEN',
      '管理员上下文默认只能管理当前会话范围的记忆',
      403,
    );
  }
}

function normalizeSourceReferences(input, scope) {
  let sourceConversationId = identifier(input.sourceConversationId, 36, 'sourceConversationId') || null;
  const sourceMessageId = identifier(input.sourceMessageId, 36, 'sourceMessageId') || null;
  if (!sourceConversationId && scope.scopeType === 'conversation') {
    sourceConversationId = scope.scope.conversationId;
  }
  if (!sourceConversationId || !sourceMessageId) {
    throw memoryError('AI_MEMORY_SOURCE_REQUIRED', '记忆候选必须关联一条已完成的用户消息及其会话');
  }
  if (scope.scopeType === 'conversation' && sourceConversationId !== scope.scope.conversationId) {
    throw memoryError('AI_MEMORY_SOURCE_SCOPE_MISMATCH', '会话范围记忆必须来源于同一会话');
  }
  return { sourceConversationId, sourceMessageId };
}

async function assertOwnedResource(database, identity, scope) {
  if (scope.scopeType !== 'resource') return;
  const config = RESOURCE_SCOPE_OWNER[scope.scope.resourceType];
  if (!config) throw memoryError('AI_MEMORY_RESOURCE_NOT_FOUND', '关联资源类型不受支持', 404);
  const [rows] = await database.query(
    `SELECT id FROM \`${config.table}\`
     WHERE id = ? AND ${config.ownerField} = ? AND del_flag = 0 LIMIT 1`,
    [scope.scope.resourceId, identity.subjectUserId],
  );
  if (!rows.length) throw memoryError('AI_MEMORY_RESOURCE_NOT_FOUND', '关联资源不存在或无权访问', 404);
}

async function assertOwnedConversationIds(database, identity, conversationIds) {
  const owner = ownerWhere(identity);
  for (const conversationId of new Set(conversationIds.filter(Boolean))) {
    const [rows] = await database.query(
      `SELECT id FROM ai_conversations
       WHERE id = ? AND ${owner.sql} AND status IN ('active', 'archived')
         AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP) LIMIT 1`,
      [conversationId, ...owner.params],
    );
    if (!rows.length) throw memoryError('AI_MEMORY_CONVERSATION_NOT_FOUND', '关联会话不存在或无权访问', 404);
  }
}

async function assertOwnedSource(database, identity, scope, sourceConversationId, sourceMessageId) {
  const conversationIds = [sourceConversationId];
  if (scope.scopeType === 'conversation') conversationIds.push(scope.scope.conversationId);
  await assertOwnedConversationIds(database, identity, conversationIds);
  const [rows] = await database.query(
    `SELECT id FROM ai_messages
     WHERE id = ? AND conversation_id = ? AND role = 'user' AND status = 'completed' LIMIT 1`,
    [sourceMessageId, sourceConversationId],
  );
  if (!rows.length) {
    throw memoryError('AI_MEMORY_SOURCE_MESSAGE_INVALID', '记忆来源必须是关联会话中已完成的用户消息', 404);
  }
}

function mapMemory(row) {
  const expireAt = row.expire_at || null;
  const expired = isEffectivelyExpired(row);
  const status = expired ? 'expired' : row.status || 'candidate';
  return {
    id: String(row.id),
    scopeType: row.scope_type || 'global',
    scope: parseJson(row.scope_json, {}),
    memoryType: row.memory_type || 'fact',
    content: row.content || '',
    status,
    temporary: Boolean(expireAt),
    expireAt,
    candidateExpireAt: status === 'candidate' ? candidateDeadline(row) : null,
    expired,
    sourceConversationId: row.source_conversation_id || null,
    sourceMessageId: row.source_message_id || null,
    confirmedAt: row.confirmed_at || null,
    lastUsedAt: row.last_used_at || null,
    createdAt: row.create_time,
    updatedAt: row.update_time,
  };
}

async function getOwnedMemoryRow(database, identity, memoryId, lock = false) {
  const owner = ownerWhere(identity);
  const [rows] = await database.query(
    `SELECT * FROM ai_memories
     WHERE id = ? AND ${owner.sql}
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [identifier(memoryId, 36, 'memoryId', { required: true }), ...owner.params],
  );
  return rows[0] || null;
}

async function getAllOwnedMemoryRowsForUpdate(database, identity) {
  const owner = ownerWhere(identity);
  const [rows] = await database.query(
    `SELECT * FROM ai_memories WHERE ${owner.sql} ORDER BY id FOR UPDATE`,
    owner.params,
  );
  return rows;
}

async function lockMemoryOwner(database, identity) {
  const [rows] = await database.query('SELECT id FROM `user` WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE', [
    identity.subjectUserId,
  ]);
  if (!rows.length) throw memoryError('AI_MEMORY_OWNER_NOT_FOUND', '记忆所属用户不存在或不可用', 404);
}

async function markMemoryExpired(database, identity, row) {
  const owner = ownerWhere(identity);
  await database.query(
    `UPDATE ai_memories SET status = 'expired', update_time = CURRENT_TIMESTAMP
     WHERE id = ? AND ${owner.sql} AND status <> 'expired'`,
    [row.id, ...owner.params],
  );
}

async function syncExpiredStatuses(database, identity) {
  const owner = ownerWhere(identity);
  await database.query(
    `UPDATE ai_memories SET status = 'expired', update_time = CURRENT_TIMESTAMP
     WHERE ${owner.sql} AND status IN ('candidate', 'active', 'paused')
       AND (
         (expire_at IS NOT NULL AND expire_at <= CURRENT_TIMESTAMP)
         OR (status = 'candidate' AND update_time <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CANDIDATE_TTL_DAYS} DAY))
       )`,
    owner.params,
  );
}

function normalizeListStatus(value) {
  if (value == null || value === '' || value === 'all') return null;
  if (!MEMORY_STATUSES.has(value)) throw memoryError('AI_MEMORY_STATUS_INVALID', '记忆状态无效');
  return value;
}

function liveOwnedRows(rows, now = Date.now()) {
  return rows.filter((row) => LIVE_MEMORY_STATUSES.has(row.status) && !isEffectivelyExpired(row, now));
}

function persistedScope(row) {
  try {
    return normalizeScope(row.scope_type, parseJson(row.scope_json, {}));
  } catch {
    return null;
  }
}

function assertNoDuplicateMemory(rows, candidate, excludeId = null) {
  const duplicate = liveOwnedRows(rows).find((row) => {
    if (excludeId && String(row.id) === String(excludeId)) return false;
    const scope = persistedScope(row);
    return (
      scope &&
      scopeKey(scope) === scopeKey(candidate.scope) &&
      canonicalContent(row.content) === canonicalContent(candidate.content)
    );
  });
  if (duplicate) {
    throw memoryError('AI_MEMORY_DUPLICATE', '相同范围内已存在内容相同的有效记忆', 409);
  }
}

function assertMemoryCapacity(rows) {
  if (liveOwnedRows(rows).length >= MAX_LIVE_MEMORIES_PER_OWNER) {
    throw memoryError('AI_MEMORY_LIMIT_REACHED', `每个记忆空间最多保留 ${MAX_LIVE_MEMORIES_PER_OWNER} 条有效记忆`, 409);
  }
}

function assertMemoryCapacityForUpdate(rows, row) {
  const rowIsLive = LIVE_MEMORY_STATUSES.has(row.status) && !isEffectivelyExpired(row);
  if (rowIsLive) return;
  assertMemoryCapacity(rows.filter((item) => String(item.id) !== String(row.id)));
}

function normalizeLifecycleAction(input) {
  const actionValue = input.action == null ? '' : String(input.action).trim();
  const statusValue = input.status == null ? '' : String(input.status).trim();
  const statusAction = statusValue === 'paused' ? 'pause' : statusValue === 'active' ? 'resume' : '';
  if (statusValue && !statusAction) {
    throw memoryError('AI_MEMORY_STATUS_TRANSITION_INVALID', 'update 仅支持通过 status 暂停或恢复记忆');
  }
  if (actionValue && !['pause', 'resume'].includes(actionValue)) {
    throw memoryError('AI_MEMORY_ACTION_INVALID', '记忆操作仅支持 pause 或 resume');
  }
  if (actionValue && statusAction && actionValue !== statusAction) {
    throw memoryError('AI_MEMORY_STATUS_TRANSITION_INVALID', 'action 与 status 指定了冲突的状态');
  }
  return actionValue || statusAction || null;
}

export function resolveAiMemoryIdentity(req) {
  const identity = {
    ...resolveAiConversationIdentity(req),
    adminContextExpiresAt: req?.adminContext?.expiresAt || null,
  };
  assertMemoryIdentity(identity);
  return identity;
}

export async function listAiMemories(identity, options = {}, database = pool) {
  assertMemoryIdentity(identity);
  const limit = boundedInteger(options.limit, 50, 100);
  const status = normalizeListStatus(options.status);
  const scopeType = options.scopeType == null || options.scopeType === '' ? null : text(options.scopeType, 32);
  if (scopeType && !MEMORY_SCOPE_TYPES.has(scopeType)) {
    throw memoryError('AI_MEMORY_SCOPE_INVALID', '记忆范围无效');
  }
  if ((identity.adminContextMode || 'normal') !== 'readonly') await syncExpiredStatuses(database, identity);
  const owner = ownerWhere(identity);
  const params = [...owner.params];
  let where = owner.sql;
  if (status) {
    where += ' AND status = ?';
    params.push(status);
    if (status !== 'expired') {
      where += ' AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)';
      if (status === 'candidate') {
        where += ` AND update_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CANDIDATE_TTL_DAYS} DAY)`;
      }
    }
  }
  if (scopeType) {
    where += ' AND scope_type = ?';
    params.push(scopeType);
  }
  if (options.includeExpired === false) {
    where += " AND status <> 'expired' AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)";
    where += ` AND (status <> 'candidate' OR update_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CANDIDATE_TTL_DAYS} DAY))`;
  }
  params.push(limit);
  const [rows] = await database.query(
    `SELECT * FROM ai_memories WHERE ${where} ORDER BY update_time DESC, id DESC LIMIT ?`,
    params,
  );
  return { items: rows.map(mapMemory), total: rows.length };
}

export async function createAiMemoryCandidate(identity, input = {}, database = pool) {
  assertMemoryWritable(identity);
  const content = normalizeContent(input.content);
  const memoryType = normalizeMemoryType(input.memoryType);
  const scope = normalizeScope(input.scopeType, input.scope);
  assertAdminScopePolicy(identity, scope);
  const expireAt = normalizeCreateExpiry(input, memoryType, identity);
  const { sourceConversationId, sourceMessageId } = normalizeSourceReferences(input, scope);
  const id = identifier(input.id, 36, 'id') || crypto.randomUUID();
  const connection = await database.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    await lockMemoryOwner(connection, identity);
    const ownedRows = await getAllOwnedMemoryRowsForUpdate(connection, identity);
    await assertOwnedSource(connection, identity, scope, sourceConversationId, sourceMessageId);
    await assertOwnedResource(connection, identity, scope);
    assertNoDuplicateMemory(ownedRows, { scope, content });
    assertMemoryCapacity(ownedRows);
    assertMemoryIdentity(identity);
    await connection.query(
      `INSERT INTO ai_memories
        (id, actor_user_id, subject_user_id, admin_context_id, admin_context_mode, scope_type, scope_json,
         memory_type, content, source_conversation_id, source_message_id, status, confirmed_at, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', NULL, ?)`,
      [
        id,
        identity.actorUserId,
        identity.subjectUserId,
        identity.adminContextId || null,
        identity.adminContextMode || 'normal',
        scope.scopeType,
        jsonValue(scope.scope),
        memoryType,
        content,
        sourceConversationId,
        sourceMessageId,
        expireAt,
      ],
    );
    const row = await getOwnedMemoryRow(connection, identity, id);
    if (!row) throw memoryError('AI_MEMORY_CREATE_FAILED', '记忆候选创建失败', 500);
    await connection.commit();
    committed = true;
    return mapMemory(row);
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function confirmAiMemory(identity, memoryId, database = pool) {
  assertMemoryWritable(identity);
  const connection = await database.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    const row = await getOwnedMemoryRow(connection, identity, memoryId, true);
    if (!row) throw memoryError('AI_MEMORY_NOT_FOUND', '记忆不存在或无权访问', 404);
    if (isEffectivelyExpired(row)) {
      await markMemoryExpired(connection, identity, row);
      await connection.commit();
      committed = true;
      throw memoryError('AI_MEMORY_EXPIRED', '记忆候选已过期，请更新后重新确认', 409);
    }
    const content = normalizeContent(row.content);
    const memoryType = normalizeMemoryType(row.memory_type);
    const scope = normalizeScope(row.scope_type, parseJson(row.scope_json, {}));
    assertAdminScopePolicy(identity, scope);
    const source = normalizeSourceReferences(
      { sourceConversationId: row.source_conversation_id, sourceMessageId: row.source_message_id },
      scope,
    );
    await assertOwnedSource(connection, identity, scope, source.sourceConversationId, source.sourceMessageId);
    await assertOwnedResource(connection, identity, scope);
    const expireAt = capExpiryToAdminContext(assertTemporaryStateExpiry(memoryType, row.expire_at), identity);
    if (row.status === 'active') {
      if (!row.confirmed_at) {
        throw memoryError('AI_MEMORY_STATE_INVALID', '记忆确认状态异常，请更新后重新确认', 409);
      }
      if (!sameExpiry(row.expire_at, expireAt)) {
        const owner = ownerWhere(identity);
        const [result] = await connection.query(
          `UPDATE ai_memories SET expire_at = ?, update_time = CURRENT_TIMESTAMP
           WHERE id = ? AND ${owner.sql} AND status = 'active'`,
          [expireAt, row.id, ...owner.params],
        );
        if (Number(result?.affectedRows || 0) !== 1) {
          throw memoryError('AI_MEMORY_UPDATE_CONFLICT', '记忆状态已变化，请刷新后重试', 409);
        }
      }
      await connection.commit();
      committed = true;
      return mapMemory({ ...row, expire_at: expireAt });
    }
    if (row.status !== 'candidate') throw memoryError('AI_MEMORY_NOT_CONFIRMABLE', '当前记忆状态不能确认', 409);
    const confirmedAt = new Date();
    const owner = ownerWhere(identity);
    const [result] = await connection.query(
      `UPDATE ai_memories
       SET status = 'active', content = ?, expire_at = ?, confirmed_at = ?, update_time = CURRENT_TIMESTAMP
       WHERE id = ? AND ${owner.sql} AND status = 'candidate'
         AND update_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${CANDIDATE_TTL_DAYS} DAY)
         AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)`,
      [content, expireAt, confirmedAt, row.id, ...owner.params],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      await markMemoryExpired(connection, identity, row);
      await connection.commit();
      committed = true;
      throw memoryError('AI_MEMORY_EXPIRED', '记忆候选已过期，请更新后重新确认', 409);
    }
    await connection.commit();
    committed = true;
    return mapMemory({
      ...row,
      content,
      expire_at: expireAt,
      status: 'active',
      confirmed_at: confirmedAt,
      update_time: confirmedAt,
    });
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAiMemory(identity, memoryId, input = {}, database = pool) {
  assertMemoryWritable(identity);
  const normalizedMemoryId = identifier(memoryId, 36, 'memoryId', { required: true });
  const lifecycleAction = normalizeLifecycleAction(input);
  const semanticKeys = [
    'content',
    'memoryType',
    'scopeType',
    'scope',
    'temporary',
    'expireAt',
    'sourceConversationId',
    'sourceMessageId',
  ];
  const hasSemanticPatch = semanticKeys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (lifecycleAction && hasSemanticPatch) {
    throw memoryError('AI_MEMORY_UPDATE_AMBIGUOUS', '暂停或恢复不能与内容、范围或保留期修改同时提交');
  }

  const connection = await database.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    await lockMemoryOwner(connection, identity);
    const ownedRows = await getAllOwnedMemoryRowsForUpdate(connection, identity);
    const row = ownedRows.find((item) => String(item.id) === normalizedMemoryId);
    if (!row) throw memoryError('AI_MEMORY_NOT_FOUND', '记忆不存在或无权访问', 404);

    if (!lifecycleAction && !hasSemanticPatch) {
      if (isEffectivelyExpired(row)) await markMemoryExpired(connection, identity, row);
      await connection.commit();
      committed = true;
      return mapMemory({ ...row, status: isEffectivelyExpired(row) ? 'expired' : row.status });
    }

    if (lifecycleAction) {
      if (isEffectivelyExpired(row)) {
        await markMemoryExpired(connection, identity, row);
        await connection.commit();
        committed = true;
        throw memoryError('AI_MEMORY_EXPIRED', '记忆已过期，不能暂停或恢复', 409);
      }
      if (lifecycleAction === 'pause') {
        if (row.status === 'paused') {
          await connection.commit();
          committed = true;
          return mapMemory(row);
        }
        if (row.status !== 'active') {
          throw memoryError('AI_MEMORY_STATUS_TRANSITION_INVALID', '只有已激活记忆可以暂停', 409);
        }
        if (!row.confirmed_at) {
          throw memoryError('AI_MEMORY_STATE_INVALID', '未确认的脏状态不能进入 paused', 409);
        }
        const owner = ownerWhere(identity);
        const [result] = await connection.query(
          `UPDATE ai_memories SET status = 'paused', update_time = CURRENT_TIMESTAMP
           WHERE id = ? AND ${owner.sql} AND status = 'active'
             AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)`,
          [row.id, ...owner.params],
        );
        if (Number(result?.affectedRows || 0) !== 1) {
          await markMemoryExpired(connection, identity, row);
          await connection.commit();
          committed = true;
          throw memoryError('AI_MEMORY_EXPIRED', '记忆已过期，不能暂停', 409);
        }
        const updatedAt = new Date();
        await connection.commit();
        committed = true;
        return mapMemory({ ...row, status: 'paused', update_time: updatedAt });
      }

      if (row.status === 'active' && row.confirmed_at) {
        await connection.commit();
        committed = true;
        return mapMemory(row);
      }
      if (row.status !== 'paused' || !row.confirmed_at) {
        throw memoryError('AI_MEMORY_CONFIRM_REQUIRED', '只有已确认并暂停的记忆可以恢复', 409);
      }
      const content = normalizeContent(row.content);
      const memoryType = normalizeMemoryType(row.memory_type);
      const scope = normalizeScope(row.scope_type, parseJson(row.scope_json, {}));
      assertAdminScopePolicy(identity, scope);
      const source = normalizeSourceReferences(
        { sourceConversationId: row.source_conversation_id, sourceMessageId: row.source_message_id },
        scope,
      );
      await assertOwnedSource(connection, identity, scope, source.sourceConversationId, source.sourceMessageId);
      await assertOwnedResource(connection, identity, scope);
      const expireAt = capExpiryToAdminContext(assertTemporaryStateExpiry(memoryType, row.expire_at), identity);
      const owner = ownerWhere(identity);
      const [result] = await connection.query(
        `UPDATE ai_memories SET status = 'active', content = ?, expire_at = ?, update_time = CURRENT_TIMESTAMP
         WHERE id = ? AND ${owner.sql} AND status = 'paused'
           AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)`,
        [content, expireAt, row.id, ...owner.params],
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        await markMemoryExpired(connection, identity, row);
        await connection.commit();
        committed = true;
        throw memoryError('AI_MEMORY_EXPIRED', '记忆已过期，不能恢复', 409);
      }
      const updatedAt = new Date();
      await connection.commit();
      committed = true;
      return mapMemory({ ...row, content, expire_at: expireAt, status: 'active', update_time: updatedAt });
    }

    const currentScope = normalizeScope(row.scope_type, parseJson(row.scope_json, {}));
    const scope =
      input.scopeType !== undefined || input.scope !== undefined
        ? normalizeScope(input.scopeType, input.scope, currentScope)
        : currentScope;
    assertAdminScopePolicy(identity, scope);
    const content = normalizeContent(input.content === undefined ? row.content : input.content);
    const memoryType = normalizeMemoryType(input.memoryType === undefined ? row.memory_type : input.memoryType);
    const expireAt = normalizeUpdateExpiry(input, row.expire_at, memoryType, identity);
    if (expireAt && isExpired(expireAt)) {
      await markMemoryExpired(connection, identity, row);
      await connection.commit();
      committed = true;
      throw memoryError('AI_MEMORY_EXPIRED', '请设置新的未来过期时间后再更新记忆', 409);
    }
    const source = normalizeSourceReferences(
      {
        sourceConversationId: input.sourceConversationId ?? row.source_conversation_id,
        sourceMessageId: input.sourceMessageId ?? row.source_message_id,
      },
      scope,
    );
    await assertOwnedSource(connection, identity, scope, source.sourceConversationId, source.sourceMessageId);
    await assertOwnedResource(connection, identity, scope);
    assertNoDuplicateMemory(ownedRows, { scope, content }, row.id);
    assertMemoryCapacityForUpdate(ownedRows, row);
    const owner = ownerWhere(identity);
    const [result] = await connection.query(
      `UPDATE ai_memories
       SET scope_type = ?, scope_json = ?, memory_type = ?, content = ?, expire_at = ?,
           source_conversation_id = ?, source_message_id = ?,
           status = 'candidate', confirmed_at = NULL, update_time = CURRENT_TIMESTAMP
       WHERE id = ? AND ${owner.sql}`,
      [
        scope.scopeType,
        jsonValue(scope.scope),
        memoryType,
        content,
        expireAt,
        source.sourceConversationId,
        source.sourceMessageId,
        row.id,
        ...owner.params,
      ],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      throw memoryError('AI_MEMORY_UPDATE_CONFLICT', '记忆状态已变化，请刷新后重试', 409);
    }
    const updatedAt = new Date();
    await connection.commit();
    committed = true;
    return mapMemory({
      ...row,
      scope_type: scope.scopeType,
      scope_json: scope.scope,
      memory_type: memoryType,
      content,
      expire_at: expireAt,
      source_conversation_id: source.sourceConversationId,
      source_message_id: source.sourceMessageId,
      status: 'candidate',
      confirmed_at: null,
      update_time: updatedAt,
    });
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteAiMemory(identity, memoryId, database = pool) {
  assertMemoryWritable(identity);
  const normalizedMemoryId = identifier(memoryId, 36, 'memoryId', { required: true });
  const owner = ownerWhere(identity);
  const [result] = await database.query(`DELETE FROM ai_memories WHERE id = ? AND ${owner.sql} LIMIT 1`, [
    normalizedMemoryId,
    ...owner.params,
  ]);
  if (Number(result?.affectedRows || 0) !== 1) {
    throw memoryError('AI_MEMORY_NOT_FOUND', '记忆不存在或无权访问', 404);
  }
  return { id: normalizedMemoryId, deleted: 1 };
}

export async function clearAiMemories(identity, database = pool) {
  assertMemoryWritable(identity);
  const owner = ownerWhere(identity);
  const [result] = await database.query(`DELETE FROM ai_memories WHERE ${owner.sql}`, owner.params);
  return { cleared: Number(result?.affectedRows || 0) };
}

function promptScopeMatches(memory, identity, options) {
  const scopeType = memory.scope_type || 'global';
  const scope = parseJson(memory.scope_json, {});
  const conversationId = identifier(options.conversationId, 36, 'conversationId');
  if (isAdminIdentity(identity)) {
    return (
      scopeType === 'conversation' &&
      conversationId &&
      scope.conversationId === conversationId &&
      memory.source_conversation_id === conversationId
    );
  }
  if (scopeType === 'global') return true;
  if (scopeType === 'conversation') {
    return Boolean(
      conversationId && scope.conversationId === conversationId && memory.source_conversation_id === conversationId,
    );
  }
  if (scopeType === 'resource') {
    return Boolean(
      options.resourceType &&
      options.resourceId &&
      scope.resourceType === text(options.resourceType, 32) &&
      scope.resourceId === identifier(options.resourceId, 128, 'resourceId'),
    );
  }
  return false;
}

function promptScopePriority(row) {
  if (row.scope_type === 'resource') return 0;
  if (row.scope_type === 'conversation') return 1;
  return 2;
}

function safeTemporaryStateForPrompt(row) {
  if (row.memory_type !== 'temporary_state') return true;
  if (!row.expire_at || isExpired(row.expire_at)) return false;
  const baseline = new Date(row.confirmed_at || row.update_time || row.create_time || '').getTime();
  const duration = new Date(row.expire_at).getTime() - baseline;
  return Number.isFinite(duration) && duration > 0 && duration <= MAX_TEMPORARY_STATE_TTL_MS;
}

/**
 * Agent prompt 专用读取：只返回当前精确身份域内、已确认、激活、未过期且来源可信的记忆。
 */
export async function getActiveAiMemoriesForPrompt(identity, options = {}, database = pool) {
  assertMemoryIdentity(identity);
  const limit = boundedInteger(options.limit, 20, 50);
  const charBudget = boundedInteger(options.maxChars, DEFAULT_PROMPT_CHAR_BUDGET, MAX_PROMPT_CHAR_BUDGET);
  const conversationId = identifier(options.conversationId, 36, 'conversationId');
  const resourceType = text(options.resourceType, 32);
  const resourceId = identifier(options.resourceId, 128, 'resourceId');
  if (isAdminIdentity(identity) && !conversationId) return [];
  if ((resourceType && !resourceId) || (!resourceType && resourceId)) {
    throw memoryError('AI_MEMORY_RESOURCE_REQUIRED', 'resourceType 和 resourceId 必须同时提供');
  }
  if (resourceType && !RESOURCE_SCOPE_OWNER[resourceType]) {
    throw memoryError('AI_MEMORY_RESOURCE_REQUIRED', '资源类型不受支持');
  }
  if (conversationId) await assertOwnedConversationIds(database, identity, [conversationId]);
  if (!isAdminIdentity(identity) && resourceType && resourceId) {
    await assertOwnedResource(database, identity, {
      scopeType: 'resource',
      scope: { resourceType, resourceId },
    });
  }

  const scopeParams = [];
  const scopeClauses = [];
  if (!isAdminIdentity(identity)) scopeClauses.push("m.scope_type = 'global'");
  if (conversationId) {
    scopeClauses.push(
      "(m.scope_type = 'conversation' AND JSON_UNQUOTE(JSON_EXTRACT(m.scope_json, '$.conversationId')) = ?)",
    );
    scopeParams.push(conversationId);
  }
  if (!isAdminIdentity(identity) && resourceType && resourceId) {
    scopeClauses.push(
      "(m.scope_type = 'resource' AND JSON_UNQUOTE(JSON_EXTRACT(m.scope_json, '$.resourceType')) = ? " +
        "AND JSON_UNQUOTE(JSON_EXTRACT(m.scope_json, '$.resourceId')) = ?)",
    );
    scopeParams.push(resourceType, resourceId);
  }
  if (!scopeClauses.length) return [];

  const memoryOwner = ownerWhere(identity, 'm');
  const conversationOwner = ownerWhere(identity, 'source_conversation');
  const fetchLimit = MAX_LIVE_MEMORIES_PER_OWNER;
  const [rows] = await database.query(
    `SELECT m.*, source_message.role AS source_role, source_message.status AS source_status
     FROM ai_memories m
     INNER JOIN ai_messages source_message
       ON source_message.id = m.source_message_id AND source_message.conversation_id = m.source_conversation_id
      AND source_message.role = 'user' AND source_message.status = 'completed'
     INNER JOIN ai_conversations source_conversation
       ON source_conversation.id = m.source_conversation_id
      AND source_conversation.status IN ('active', 'archived')
      AND (source_conversation.expire_at IS NULL OR source_conversation.expire_at > CURRENT_TIMESTAMP)
     WHERE ${memoryOwner.sql} AND ${conversationOwner.sql}
       AND m.status = 'active' AND m.confirmed_at IS NOT NULL
       AND m.memory_type IN ('preference', 'fact', 'topic', 'workflow', 'temporary_state')
       AND (m.expire_at IS NULL OR m.expire_at > CURRENT_TIMESTAMP)
       AND (${scopeClauses.join(' OR ')})
     ORDER BY CASE m.scope_type WHEN 'resource' THEN 0 WHEN 'conversation' THEN 1 ELSE 2 END,
              m.update_time DESC, m.id DESC LIMIT ?`,
    [...memoryOwner.params, ...conversationOwner.params, ...scopeParams, fetchLimit],
  );

  const safeRows = rows
    .filter(
      (row) =>
        row.status === 'active' &&
        Boolean(row.confirmed_at) &&
        Boolean(row.source_conversation_id) &&
        Boolean(row.source_message_id) &&
        row.source_role === 'user' &&
        row.source_status === 'completed' &&
        MEMORY_TYPES.has(row.memory_type) &&
        isSafePersistedContent(row.content) &&
        !isEffectivelyExpired(row) &&
        safeTemporaryStateForPrompt(row) &&
        promptScopeMatches(row, identity, { conversationId, resourceType, resourceId }),
    )
    .sort((left, right) => promptScopePriority(left) - promptScopePriority(right));

  const selected = [];
  let usedChars = 0;
  for (const row of safeRows) {
    if (selected.length >= limit) break;
    const contentLength = String(row.content).length;
    if (usedChars + contentLength > charBudget) continue;
    usedChars += contentLength;
    const memory = mapMemory(row);
    selected.push({
      id: memory.id,
      memoryType: memory.memoryType,
      content: memory.content,
      scopeType: memory.scopeType,
      scope: memory.scope,
      temporary: memory.temporary,
      expireAt: memory.expireAt,
      authority: 'user_memory',
      canOverridePolicy: false,
    });
  }
  return selected;
}

export const __testing = {
  CANDIDATE_TTL_MS,
  MAX_LIVE_MEMORIES_PER_OWNER,
  MAX_TEMPORARY_STATE_TTL_MS,
  containsSensitiveMemoryContent,
  isCandidateStale,
  isEffectivelyExpired,
  isExpired,
  mapMemory,
  normalizeScope,
  promptScopeMatches,
};
