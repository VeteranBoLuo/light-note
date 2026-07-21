import pool from '../db/index.js';

const OPTIONAL_SCHEMA_ERRORS = new Set(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR']);

const DATASETS = Object.freeze([
  {
    key: 'conversations',
    sql: 'SELECT * FROM ai_conversations WHERE subject_user_id = ? ORDER BY create_time, id',
    json: ['scope_json'],
  },
  {
    key: 'messages',
    sql: `SELECT m.* FROM ai_messages m
          INNER JOIN ai_conversations c ON c.id = m.conversation_id
          WHERE c.subject_user_id = ? ORDER BY m.create_time, m.id`,
    json: ['context_refs_json', 'attachment_refs_json', 'activity_json', 'coverage_json', 'model_meta_json'],
  },
  {
    key: 'messageSources',
    sql: `SELECT s.* FROM ai_message_sources s
          INNER JOIN ai_messages m ON m.id = s.message_id
          INNER JOIN ai_conversations c ON c.id = m.conversation_id
          WHERE c.subject_user_id = ? ORDER BY s.id`,
    json: ['target_json', 'coverage_json'],
  },
  {
    key: 'messageEvidence',
    sql: `SELECT e.* FROM ai_message_evidence e
          INNER JOIN ai_messages m ON m.id = e.message_id
          INNER JOIN ai_conversations c ON c.id = m.conversation_id
          WHERE c.subject_user_id = ? ORDER BY e.id`,
    json: ['locator_json'],
  },
  {
    key: 'feedback',
    sql: 'SELECT * FROM ai_feedback WHERE subject_user_id = ? ORDER BY create_time, id',
  },
  {
    key: 'changeSets',
    sql: 'SELECT * FROM ai_change_sets WHERE subject_user_id = ? ORDER BY create_time, id',
    json: ['selection_json', 'retry_json'],
  },
  {
    key: 'changeItems',
    sql: `SELECT i.* FROM ai_change_items i
          INNER JOIN ai_change_sets s ON s.id = i.change_set_id
          WHERE s.subject_user_id = ? ORDER BY i.create_time, i.id`,
    json: ['before_json', 'after_json', 'receipt_json'],
  },
  {
    key: 'memories',
    sql: 'SELECT * FROM ai_memories WHERE subject_user_id = ? ORDER BY create_time, id',
    json: ['scope_json'],
  },
  {
    key: 'productEvents',
    sql: 'SELECT * FROM ai_product_events WHERE subject_user_id = ? ORDER BY create_time, id',
    json: ['dimensions_json'],
  },
  {
    key: 'usageLogs',
    sql: 'SELECT * FROM agent_logs WHERE user_id = ? ORDER BY created_at, id',
    json: ['selected_tools'],
  },
  {
    key: 'quotaUsage',
    sql: "SELECT * FROM ai_token_usage WHERE subject_type = 'user' AND subject_key = ? ORDER BY period_key, id",
  },
]);

function parseJson(value) {
  if (value === null || value === undefined || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// 内部并发控制列不导给用户:租约令牌/过期时间属实现细节,导出应去敏。
const REDACTED_EXPORT_COLUMNS = ['lock_token', 'lock_expires_at'];

function normalizeRows(rows, jsonFields = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const normalized = { ...row };
    for (const column of REDACTED_EXPORT_COLUMNS) delete normalized[column];
    for (const field of jsonFields) {
      if (Object.prototype.hasOwnProperty.call(normalized, field)) normalized[field] = parseJson(normalized[field]);
    }
    return normalized;
  });
}

async function readDataset(database, dataset, userId) {
  try {
    const [rows] = await database.query(dataset.sql, [userId]);
    return { key: dataset.key, rows: normalizeRows(rows, dataset.json), available: true };
  } catch (error) {
    if (OPTIONAL_SCHEMA_ERRORS.has(error?.code)) {
      return { key: dataset.key, rows: [], available: false };
    }
    throw error;
  }
}

/**
 * 导出以当前账号为数据主体的 AI 数据。派生索引、短期 SSE 恢复事件和请求级配额占位不导出，
 * 因为它们不具备可移植性，且会按独立保留期自动清理。
 */
export async function exportAiUserData(userId, database = pool) {
  const subjectUserId = String(userId || '').trim();
  if (!subjectUserId) {
    const error = new Error('AI_EXPORT_USER_REQUIRED');
    error.code = 'AI_EXPORT_USER_REQUIRED';
    throw error;
  }

  const results = await Promise.all(DATASETS.map((dataset) => readDataset(database, dataset, subjectUserId)));
  const data = {};
  const unavailable = [];
  const counts = {};
  for (const result of results) {
    data[result.key] = result.rows;
    counts[result.key] = result.rows.length;
    if (!result.available) unavailable.push(result.key);
  }

  return {
    schemaVersion: 1,
    scope: 'subject_user',
    counts,
    unavailable,
    exclusions: [
      { dataset: 'contentChunks', reason: 'DERIVED_REBUILDABLE_INDEX' },
      { dataset: 'documentExtraction', reason: 'DERIVED_REBUILDABLE_INDEX' },
      { dataset: 'responseEvents', reason: 'EPHEMERAL_STREAM_RECOVERY' },
      { dataset: 'tokenReservations', reason: 'EPHEMERAL_QUOTA_IDEMPOTENCY' },
    ],
    ...data,
  };
}
