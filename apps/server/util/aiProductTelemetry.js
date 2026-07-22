import crypto from 'node:crypto';
import pool from '../db/index.js';

export const AI_PRODUCT_EVENTS = Object.freeze([
  'ai_entry_impression',
  'ai_entry_opened',
  'ai_material_added',
  'ai_material_removed',
  'ai_scope_changed',
  'ai_prompt_submitted',
  'ai_first_activity',
  'ai_first_token',
  'ai_completed',
  'ai_stopped',
  'ai_source_opened',
  'ai_source_feedback',
  'ai_result_saved',
  'ai_result_applied',
  'ai_change_previewed',
  'ai_change_edited',
  'ai_change_confirmed',
  'ai_change_succeeded',
  'ai_change_undone',
  'ai_feedback_submitted',
  'ai_closed_while_generating',
  'ai_draft_restored',
  'ai_error_retried',
  'ai_error_recovered',
  'ai_memory_candidate_reviewed',
  'ai_memory_state_changed',
]);

const EVENT_SET = new Set(AI_PRODUCT_EVENTS);
const ENUM_DIMENSIONS = Object.freeze({
  surface: new Set([
    'edge',
    'shortcut',
    'note_detail',
    'note_library',
    'search',
    'bookmark_manage',
    'cloud_space',
    'tag_detail',
    'workspace',
    'conversation',
    'memory',
  ]),
  device: new Set(['desktop', 'tablet', 'mobile', 'unknown']),
  mode: new Set(['ask', 'organize']),
  intent: new Set([
    'ask',
    'find',
    'summarize',
    'compare',
    'organize',
    'extract_todos',
    'find_related',
    'unknown',
  ]),
  materialType: new Set(['note', 'bookmark', 'file', 'tag', 'attachment', 'mixed', 'unknown']),
  scopeMode: new Set(['selected', 'collection', 'all_notes', 'all_resources', 'unknown']),
  lengthBucket: new Set(['0', '1_50', '51_200', '201_500', '501_plus']),
  durationBucket: new Set(['under_1s', '1_3s', '3_10s', '10_30s', '30_120s', '120s_plus']),
  issueType: new Set(['unsupported', 'outdated', 'missing', 'wrong_target', 'other', 'none']),
  outcome: new Set(['success', 'failed', 'stopped', 'cancelled', 'conflict', 'expired', 'recovered']),
  stage: new Set(['idle', 'planning', 'retrieving', 'reading', 'answering', 'saving', 'completed', 'failed']),
  actionType: new Set([
    'save_new',
    'append',
    'merge',
    'apply',
    'undo',
    'confirm',
    'retry',
    'open',
    'accept',
    'pause',
    'resume',
    'edit',
    'delete',
  ]),
  scopeType: new Set(['global', 'conversation', 'resource', 'temporary']),
  memoryType: new Set(['preference', 'stable_fact', 'project', 'temporary_state', 'unknown']),
  memoryState: new Set(['candidate', 'active', 'paused', 'expired', 'deleted']),
});
const ID_DIMENSIONS = new Set([
  'conversationId',
  'requestId',
  'messageId',
  'sourceId',
  'evidenceRef',
  'changeSetId',
  'taskId',
  'memoryId',
  'entryId',
  'errorCode',
]);
const NUMBER_DIMENSIONS = new Set(['materialCount', 'sourceCount', 'failureCount', 'selectedCount', 'itemCount']);
const BOOLEAN_DIMENSIONS = new Set(['retryable', 'restored', 'temporarySession', 'externalWeb']);
const ALLOWED_DIMENSIONS = new Set([
  ...Object.keys(ENUM_DIMENSIONS),
  ...ID_DIMENSIONS,
  ...NUMBER_DIMENSIONS,
  ...BOOLEAN_DIMENSIONS,
]);
const SAFE_ID = /^[A-Za-z0-9._:@/-]+$/;
const DEFAULT_RETENTION_DAYS = 180;
const DEFAULT_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_BATCH_SIZE = 10_000;
const DEFAULT_RETENTION_MAX_BATCHES = 25;
let retentionTimer = null;

// 是否必须强制独立密钥(失败关闭)。纯函数便于注入 env/platform 测试。
// 生产,或 Linux 非明确本地开发/测试(即便漏配 NODE_ENV)——都视为生产级,禁止回退固定盐,避免可预测 HMAC 被字典枚举。
export function requiresTelemetrySecret(env = process.env.NODE_ENV, platform = process.platform) {
  const normalized = String(env || '').toLowerCase();
  if (normalized === 'production') return true;
  const isExplicitLocal = normalized === 'development' || normalized === 'test';
  return platform === 'linux' && !isExplicitLocal;
}

function telemetryHmacSecret() {
  const configured = String(process.env.AI_TELEMETRY_HMAC_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  if (requiresTelemetrySecret()) {
    const error = new Error('AI_TELEMETRY_HMAC_SECRET_REQUIRED');
    error.code = 'AI_TELEMETRY_HMAC_SECRET_REQUIRED';
    throw error;
  }
  // 仅非 Linux 的本地/测试环境才回退固定盐(数据不外发);生产/Linux 上方已失败关闭。
  return 'light-note-local-ai-telemetry-hmac-only';
}

function telemetryIdentifier(key, value) {
  return `h_${crypto.createHmac('sha256', telemetryHmacSecret()).update(`${key}:${value}`).digest('hex').slice(0, 32)}`;
}

function telemetryErrorFamily(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  if (/RECOVER/u.test(code)) return 'RECOVERY';
  if (/RATE|QUOTA/u.test(code)) return 'RATE_LIMIT';
  if (/ABORT|CANCEL|STOP/u.test(code)) return 'CANCELLED';
  if (/TIMEOUT|DEADLINE/u.test(code)) return 'TIMEOUT';
  if (/NETWORK|ECONN|FETCH|SOCKET/u.test(code)) return 'NETWORK';
  if (/AUTH|FORBIDDEN|UNAUTHORIZED|LOGIN/u.test(code)) return 'AUTH';
  if (/CONFLICT|VERSION|STALE/u.test(code)) return 'CONFLICT';
  if (/INVALID|VALIDATION|ARGUMENT|REQUIRED/u.test(code)) return 'VALIDATION';
  if (/PROVIDER|MODEL|STREAM|GATEWAY|AI_/u.test(code)) return 'AI_RUNTIME';
  return 'UNKNOWN';
}

function telemetryError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = 400;
  return error;
}

function normalizeEventId(value) {
  const id = String(value || '').trim();
  if (!id) return crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw telemetryError('AI_EVENT_ID_INVALID', '事件 ID 格式无效');
  }
  return id;
}

export function normalizeAiProductEvent(input = {}) {
  const eventName = String(input.event || '').trim();
  if (!EVENT_SET.has(eventName)) throw telemetryError('AI_EVENT_UNSUPPORTED', '不支持的 AI 产品事件');
  const raw = input.dimensions ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw telemetryError('AI_EVENT_DIMENSIONS_INVALID', '事件维度必须是对象');
  }
  const dimensions = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_DIMENSIONS.has(key)) {
      throw telemetryError('AI_EVENT_DIMENSION_UNSUPPORTED', `不允许记录事件维度 ${key}`);
    }
    if (value === undefined || value === null || value === '') continue;
    if (ENUM_DIMENSIONS[key]) {
      const normalized = String(value);
      if (!ENUM_DIMENSIONS[key].has(normalized)) {
        throw telemetryError('AI_EVENT_DIMENSION_INVALID', `事件维度 ${key} 的值无效`);
      }
      dimensions[key] = normalized;
      continue;
    }
    if (ID_DIMENSIONS.has(key)) {
      const normalized = String(value).trim();
      if (!normalized || normalized.length > 128 || !SAFE_ID.test(normalized)) {
        throw telemetryError('AI_EVENT_DIMENSION_INVALID', `事件维度 ${key} 的标识无效`);
      }
      dimensions[key] = key === 'errorCode' ? telemetryErrorFamily(normalized) : telemetryIdentifier(key, normalized);
      continue;
    }
    if (NUMBER_DIMENSIONS.has(key)) {
      const normalized = Number(value);
      if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > 100_000) {
        throw telemetryError('AI_EVENT_DIMENSION_INVALID', `事件维度 ${key} 的数量无效`);
      }
      dimensions[key] = normalized;
      continue;
    }
    if (BOOLEAN_DIMENSIONS.has(key)) {
      if (typeof value !== 'boolean')
        throw telemetryError('AI_EVENT_DIMENSION_INVALID', `事件维度 ${key} 必须是布尔值`);
      dimensions[key] = value;
    }
  }
  return { id: normalizeEventId(input.id), eventName, dimensions };
}

export async function recordAiProductEvent(identity, input = {}, database = pool) {
  if (!identity?.actorUserId || !identity?.subjectUserId) {
    throw telemetryError('AI_EVENT_IDENTITY_REQUIRED', '缺少 AI 事件主体');
  }
  const event = normalizeAiProductEvent(input);
  try {
    const [result] = await database.query(
      `INSERT INTO ai_product_events
      (id, actor_user_id, subject_user_id, admin_context_id, admin_context_mode, event_name, dimensions_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        String(identity.actorUserId),
        String(identity.subjectUserId),
        identity.adminContextId || null,
        identity.adminContextMode || 'normal',
        event.eventName,
        JSON.stringify(event.dimensions),
      ],
    );
    return { id: event.id, accepted: Number(result?.affectedRows || 0) > 0 };
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return { id: event.id, accepted: false };
    throw error;
  }
}

function retentionDays() {
  const raw = process.env.AI_PRODUCT_EVENT_RETENTION_DAYS;
  if (raw == null || String(raw).trim() === '') return DEFAULT_RETENTION_DAYS;
  const configured = Number(raw);
  if (Number.isSafeInteger(configured) && configured >= 30 && configured <= 730) return configured;
  // 显式配了但越界/非法:告警而非静默回落(与 aiArtifactRetention 的"无效配置告警"一致),避免误以为按配置生效。
  console.warn(
    'AI 产品事件保留天数配置无效 code=AI_PRODUCT_EVENT_RETENTION_DAYS_INVALID 回落默认=%d',
    DEFAULT_RETENTION_DAYS,
  );
  return DEFAULT_RETENTION_DAYS;
}

export async function cleanupExpiredAiProductEvents(
  database = pool,
  { batchSize = DEFAULT_RETENTION_BATCH_SIZE, maxBatches = DEFAULT_RETENTION_MAX_BATCHES } = {},
) {
  const safeBatchSize = Math.max(100, Math.min(10_000, Math.trunc(Number(batchSize) || DEFAULT_RETENTION_BATCH_SIZE)));
  const safeMaxBatches = Math.max(1, Math.min(100, Math.trunc(Number(maxBatches) || DEFAULT_RETENTION_MAX_BATCHES)));
  const days = retentionDays();
  let deleted = 0;
  let batches = 0;
  let lastBatchDeleted = 0;
  for (; batches < safeMaxBatches; batches += 1) {
    const [result] = await database.query(
      'DELETE FROM ai_product_events WHERE create_time < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT ?',
      [days, safeBatchSize],
    );
    lastBatchDeleted = Number(result?.affectedRows || 0);
    deleted += lastBatchDeleted;
    if (lastBatchDeleted < safeBatchSize) {
      batches += 1;
      break;
    }
  }
  return {
    deleted,
    retentionDays: days,
    batches,
    backlogRemaining: batches >= safeMaxBatches && lastBatchDeleted === safeBatchSize,
  };
}

export async function startAiProductEventRetentionScheduler({ intervalMs = DEFAULT_RETENTION_INTERVAL_MS } = {}) {
  telemetryHmacSecret();
  if (retentionTimer) return { started: false, retentionDays: retentionDays() };
  const initialCleanup = await cleanupExpiredAiProductEvents();
  if (initialCleanup.backlogRemaining) {
    console.warn('[ai-telemetry] retention backlog remains after bounded cleanup');
  }
  const safeInterval = Math.max(60 * 60 * 1000, Number(intervalMs) || DEFAULT_RETENTION_INTERVAL_MS);
  retentionTimer = setInterval(() => {
    cleanupExpiredAiProductEvents()
      .then((result) => {
        if (result.backlogRemaining) console.warn('[ai-telemetry] retention backlog remains after bounded cleanup');
      })
      .catch((error) =>
        console.error(
          '[ai-telemetry] retention cleanup failed code=%s',
          String(error?.code || 'AI_TELEMETRY_CLEANUP_FAILED'),
        ),
      );
  }, safeInterval);
  retentionTimer.unref?.();
  return { started: true, retentionDays: retentionDays() };
}

export function stopAiProductEventRetentionScheduler() {
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = null;
}
