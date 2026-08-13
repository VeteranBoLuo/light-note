import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordAdminOperationAudit } from '../util/adminOperationAudit.js';
import {
  ADMIN_WORK_ITEM_POLICY_VERSION,
  enrichAdminWorkItems,
  getAdminWorkItemPolicy,
  summarizeAdminWorkItems,
} from '../util/adminWorkItemPolicy.js';

const DEFAULT_ITEM_LIMIT = 20;
const MAX_ITEM_LIMIT = 60;
const ACTION_CENTER_SOURCES = new Set([
  'opinion',
  'security',
  'community_report',
  'ai_feedback',
  'feature_request',
  'resource_governance',
  'ai_document',
  'bookmark_icon',
  'todo_reminder',
  'account_deletion',
  'email_delivery',
  'file_preview',
  'resource_cleanup',
]);
const ACTION_CENTER_SECTIONS = new Set(['all', 'work', 'jobs']);
const ACTION_CENTER_STATUSES = new Set(['all', 'pending', 'waiting', 'running', 'attention']);
const ACTION_CENTER_SLA_STATES = new Set(['all', 'overdue', 'due_soon', 'within_sla', 'unavailable']);

function itemLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_ITEM_LIMIT, 5), MAX_ITEM_LIMIT);
}

function itemSource(value) {
  const source = String(value || 'all').trim();
  return source === 'all' || !source ? 'all' : ACTION_CENTER_SOURCES.has(source) ? source : null;
}

function enumFilter(value, allowed) {
  const normalized = String(value || 'all').trim();
  return allowed.has(normalized) ? normalized : null;
}

function itemKeyword(value) {
  const keyword = String(value || '').trim();
  return keyword.length <= 120 ? keyword : null;
}

function number(value) {
  return Number(value || 0);
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function maskEmail(value) {
  const email = String(value || '').trim();
  const at = email.indexOf('@');
  if (at <= 0) return '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}${'*'.repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

function newestFirst(left, right) {
  const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0;
  const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0;
  return rightTime - leftTime;
}

async function optionalSource(source, loader) {
  try {
    return { source, data: await loader(), available: true, checkedAt: new Date().toISOString() };
  } catch (error) {
    console.warn('[admin-action-center] source=%s unavailable code=%s', source, stableAgentErrorCode(error));
    return { source, data: null, available: false, checkedAt: new Date().toISOString() };
  }
}

function workResult(source, label, count, critical, items) {
  const enrichedItems = enrichAdminWorkItems(items);
  const sla = summarizeAdminWorkItems(enrichedItems);
  return {
    source,
    label,
    count: number(count),
    critical: number(critical),
    ownerTeam: getAdminWorkItemPolicy(source)?.ownerTeam || null,
    returned: enrichedItems.length,
    sampled: number(count) > enrichedItems.length,
    ...sla,
    items: enrichedItems,
  };
}

function jobResult(source, label, summary, items) {
  const enrichedItems = enrichAdminWorkItems(items);
  const sla = summarizeAdminWorkItems(enrichedItems);
  return {
    source,
    label,
    total: number(summary.total),
    attention: number(summary.attention),
    running: number(summary.running),
    waiting: number(summary.waiting),
    completed24h: number(summary.completed_24h),
    ownerTeam: getAdminWorkItemPolicy(source)?.ownerTeam || null,
    returned: enrichedItems.length,
    sampled: number(summary.attention) + number(summary.running) + number(summary.waiting) > enrichedItems.length,
    ...sla,
    items: enrichedItems,
  };
}

function itemMatchesFilters(item, { status, slaState, keyword }) {
  if (status !== 'all' && item.status !== status) return false;
  if (slaState !== 'all' && item.slaState !== slaState) return false;
  if (!keyword) return true;
  const search = keyword.toLocaleLowerCase();
  return [item.id, item.title, item.ownerLabel, item.ownerTeam, item.errorCode, item.rawStatus, item.relatedId]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(search));
}

function operationalPriorityFirst(left, right) {
  const priority = { overdue: 0, due_soon: 1, within_sla: 2, unavailable: 3 };
  const slaDelta = (priority[left.slaState] ?? 4) - (priority[right.slaState] ?? 4);
  if (slaDelta !== 0) return slaDelta;
  if (left.severity === 'critical' && right.severity !== 'critical') return -1;
  if (right.severity === 'critical' && left.severity !== 'critical') return 1;
  return newestFirst(left, right);
}

async function loadOpinionWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total
         FROM opinion
        WHERE del_flag = 0 AND status = 'pending'`,
    ),
    pool.query(
      `SELECT o.id, o.type, o.user_id, o.create_time, u.alias
         FROM opinion o
         LEFT JOIN user u ON u.id = o.user_id
        WHERE o.del_flag = 0 AND o.status = 'pending'
        ORDER BY o.create_time DESC, o.id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'opinion',
    '用户反馈',
    summaryRows[0]?.total,
    0,
    rows.map((row) => ({
      id: String(row.id),
      source: 'opinion',
      status: 'pending',
      severity: 'normal',
      title: row.type || '用户反馈',
      ownerLabel: row.alias || row.user_id || '',
      userId: row.user_id || null,
      createdAt: row.create_time,
      updatedAt: row.create_time,
      targetUrl: `/admin/userOpinion?opinionId=${encodeURIComponent(row.id)}`,
    })),
  );
}

async function loadSecurityWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(severity = 'critical'), 0) AS critical
         FROM security_events
        WHERE handled_status = 'unhandled' AND severity IN ('high', 'critical')`,
    ),
    pool.query(
      `SELECT event_id, attack_type, severity, threat_score, user_id, request_path, created_at
         FROM security_events
        WHERE handled_status = 'unhandled' AND severity IN ('high', 'critical')
        ORDER BY (severity = 'critical') DESC, threat_score DESC, created_at DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'security',
    '安全复核',
    summaryRows[0]?.total,
    summaryRows[0]?.critical,
    rows.map((row) => ({
      id: String(row.event_id),
      source: 'security',
      status: 'pending',
      severity: row.severity === 'critical' ? 'critical' : 'high',
      title: row.attack_type || '安全事件',
      ownerLabel: row.request_path || '',
      userId: row.user_id || null,
      score: number(row.threat_score),
      createdAt: row.created_at,
      updatedAt: row.created_at,
      targetUrl: `/securityCenter/review?eventId=${encodeURIComponent(row.event_id)}`,
    })),
  );
}

async function loadCommunityReportWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query("SELECT COUNT(*) AS total FROM community_chat_reports WHERE status = 'pending'"),
    pool.query(
      `SELECT r.id, r.reporter_id, r.message_id, r.reason_code, r.create_time, r.update_time, u.alias
         FROM community_chat_reports r
         LEFT JOIN user u ON u.id = r.reporter_id
        WHERE r.status = 'pending'
        ORDER BY r.create_time ASC, r.id ASC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'community_report',
    '消息举报',
    summaryRows[0]?.total,
    0,
    rows.map((row) => ({
      id: String(row.id),
      source: 'community_report',
      status: 'pending',
      severity: 'high',
      title: row.reason_code || '社区消息举报',
      ownerLabel: row.alias || row.reporter_id || '',
      userId: row.reporter_id || null,
      relatedId: row.message_id ? String(row.message_id) : null,
      createdAt: row.create_time,
      updatedAt: row.update_time,
      targetUrl: `/admin/communityChatModeration?reportId=${encodeURIComponent(row.id)}`,
    })),
  );
}

async function loadAiFeedbackWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(COALESCE(t.priority, 'normal') = 'urgent'), 0) AS critical
         FROM ai_feedback f
         JOIN ai_conversations c ON c.id = f.conversation_id
         LEFT JOIN admin_ai_feedback_triage t ON t.feedback_id = f.id
        WHERE f.rating = 'unhelpful'
          AND COALESCE(t.status, 'open') IN ('open', 'investigating')
          AND c.status IN ('active', 'archived')
          AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))`,
    ),
    pool.query(
      `SELECT f.id, f.reason, f.actor_user_id, f.create_time, f.update_time,
              COALESCE(t.status, 'open') AS triage_status,
              COALESCE(t.priority, 'normal') AS triage_priority,
              u.alias
         FROM ai_feedback f
         JOIN ai_conversations c ON c.id = f.conversation_id
         LEFT JOIN admin_ai_feedback_triage t ON t.feedback_id = f.id
         LEFT JOIN user u ON u.id = f.actor_user_id
        WHERE f.rating = 'unhelpful'
          AND COALESCE(t.status, 'open') IN ('open', 'investigating')
          AND c.status IN ('active', 'archived')
          AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
        ORDER BY (COALESCE(t.priority, 'normal') = 'urgent') DESC,
                 (COALESCE(t.priority, 'normal') = 'high') DESC,
                 f.update_time DESC, f.id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'ai_feedback',
    'AI 回答反馈',
    summaryRows[0]?.total,
    summaryRows[0]?.critical,
    rows.map((row) => ({
      id: String(row.id),
      source: 'ai_feedback',
      status: 'pending',
      severity: row.triage_priority === 'urgent' ? 'critical' : row.triage_priority === 'high' ? 'high' : 'normal',
      title: row.reason || 'AI 回答点踩',
      ownerLabel: row.alias || row.actor_user_id || '',
      userId: row.actor_user_id || null,
      rawStatus: row.triage_status,
      createdAt: row.create_time,
      updatedAt: row.update_time,
      targetUrl: `/admin/aiFeedback?feedbackId=${encodeURIComponent(row.id)}`,
    })),
  );
}

async function loadFeatureRequestWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(vote_count >= 20), 0) AS critical
         FROM feature_requests
        WHERE del_flag = 0 AND moderation_status = 'pending_review'`,
    ),
    pool.query(
      `SELECT fr.id, fr.title, fr.category, fr.submitter_user_id, fr.vote_count,
              fr.create_time, fr.update_time, u.alias
         FROM feature_requests fr
         LEFT JOIN user u ON u.id = fr.submitter_user_id
        WHERE fr.del_flag = 0 AND fr.moderation_status = 'pending_review'
        ORDER BY (fr.vote_count >= 20) DESC, fr.vote_count DESC, fr.create_time ASC, fr.id ASC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'feature_request',
    '共建审核',
    summaryRows[0]?.total,
    summaryRows[0]?.critical,
    rows.map((row) => ({
      id: String(row.id),
      source: 'feature_request',
      status: 'pending',
      severity: number(row.vote_count) >= 20 ? 'critical' : number(row.vote_count) >= 5 ? 'high' : 'normal',
      title: row.title || row.category || '共建建议',
      ownerLabel: row.alias || row.submitter_user_id || '',
      userId: row.submitter_user_id || null,
      score: number(row.vote_count),
      createdAt: row.create_time,
      updatedAt: row.update_time,
      targetUrl: `/co-build?admin=1&requestId=${encodeURIComponent(row.id)}`,
    })),
  );
}

async function loadResourceGovernanceWork(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(risk_level = 'blocked'), 0) AS critical
         FROM resource_governance_findings
        WHERE state = 'open' AND risk_level IN ('review', 'blocked')`,
    ),
    pool.query(
      `SELECT id, issue_code, resource_type, risk_level, estimated_bytes,
              observation_count, first_seen_at, last_seen_at
         FROM resource_governance_findings
        WHERE state = 'open' AND risk_level IN ('review', 'blocked')
        ORDER BY (risk_level = 'blocked') DESC, first_seen_at ASC, id ASC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return workResult(
    'resource_governance',
    '资源复核',
    summaryRows[0]?.total,
    summaryRows[0]?.critical,
    rows.map((row) => ({
      id: String(row.id),
      source: 'resource_governance',
      status: 'pending',
      severity: row.risk_level === 'blocked' ? 'critical' : 'high',
      title: row.issue_code || '资源治理发现',
      ownerLabel: row.resource_type || '',
      userId: null,
      score: number(row.observation_count),
      estimatedBytes: number(row.estimated_bytes),
      createdAt: row.first_seen_at,
      updatedAt: row.last_seen_at,
      targetUrl: `/admin/resourceGovernance?findingId=${encodeURIComponent(row.id)}`,
    })),
  );
}

async function loadAiDocumentJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'failed' OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS attention,
         COALESCE(SUM(status = 'processing' AND (locked_at IS NULL OR locked_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS running,
         COALESCE(SUM(status = 'queued'), 0) AS waiting,
         COALESCE(SUM(status = 'completed' AND update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
       FROM ai_document_jobs
       WHERE status <> 'completed' OR update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    ),
    pool.query(
      `SELECT j.id, j.source_id, j.status, j.attempts, j.available_at, j.locked_at, j.error_message,
              j.create_time, j.update_time, s.file_name, s.user_id, u.alias
         FROM ai_document_jobs j
         JOIN ai_document_sources s ON s.id = j.source_id
         LEFT JOIN user u ON u.id = s.user_id
        WHERE j.status IN ('queued', 'processing', 'failed')
        ORDER BY (j.status = 'failed') DESC, j.update_time DESC, j.id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'ai_document',
    '文档解析',
    summaryRows[0] || {},
    rows.map((row) => {
      const stale =
        row.status === 'processing' && row.locked_at && Date.now() - new Date(row.locked_at).getTime() > 10 * 60_000;
      return {
        id: String(row.id),
        source: 'ai_document',
        rawStatus: row.status,
        status: row.status === 'failed' || stale ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: row.file_name || `文档 ${row.source_id}`,
        ownerLabel: row.alias || row.user_id || '',
        userId: row.user_id || null,
        attempts: number(row.attempts),
        scheduledAt: row.available_at,
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.error_message ? 'DOCUMENT_PARSE_FAILED' : null,
        canRetry: row.status === 'failed',
      };
    }),
  );
}

async function loadBookmarkIconJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'failed' OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS attention,
         COALESCE(SUM(status = 'processing' AND (locked_at IS NULL OR locked_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS running,
         COALESCE(SUM(status IN ('queued', 'retry_wait')), 0) AS waiting,
         COALESCE(SUM(status IN ('success', 'not_found') AND update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
       FROM bookmark_icon_jobs
       WHERE status IN ('queued', 'processing', 'retry_wait', 'failed')
          OR (status IN ('success', 'not_found') AND update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY))`,
    ),
    pool.query(
      `SELECT j.id, j.batch_id, j.user_id, j.bookmark_id, j.origin_key, j.status, j.attempts,
              j.available_at, j.locked_at, j.error_code, j.create_time, j.update_time, u.alias
         FROM bookmark_icon_jobs j
         LEFT JOIN user u ON u.id = j.user_id
        WHERE j.status IN ('queued', 'processing', 'retry_wait', 'failed')
        ORDER BY (j.status = 'failed') DESC, j.update_time DESC, j.id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'bookmark_icon',
    '书签图标',
    summaryRows[0] || {},
    rows.map((row) => {
      const stale =
        row.status === 'processing' && row.locked_at && Date.now() - new Date(row.locked_at).getTime() > 10 * 60_000;
      return {
        id: String(row.id),
        source: 'bookmark_icon',
        rawStatus: row.status,
        status: row.status === 'failed' || stale ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: row.origin_key || `书签 ${row.bookmark_id}`,
        ownerLabel: row.alias || row.user_id || '',
        userId: row.user_id || null,
        relatedId: row.bookmark_id || null,
        attempts: number(row.attempts),
        scheduledAt: row.available_at,
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.error_code || null,
        canRetry: row.status === 'failed',
      };
    }),
  );
}

async function loadTodoReminderJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status IN ('failed', 'unknown')
           OR (status = 'processing' AND lease_until < UTC_TIMESTAMP())
           OR (status = 'pending' AND scheduled_at_utc < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))), 0) AS attention,
         COALESCE(SUM(status = 'processing' AND (lease_until IS NULL OR lease_until >= UTC_TIMESTAMP())), 0) AS running,
         COALESCE(SUM(status = 'pending'), 0) AS waiting,
         COALESCE(SUM(status = 'sent' AND sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)), 0) AS completed_24h
       FROM todo_reminder_jobs
       WHERE status IN ('pending', 'processing', 'failed', 'unknown')
          OR (status = 'sent' AND sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY))`,
    ),
    pool.query(
      `SELECT j.id, j.user_id, j.todo_id, j.series_id, j.rule_id, j.channel, j.status, j.retry_count,
              CONCAT(DATE_FORMAT(j.scheduled_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z') AS scheduled_at_utc_iso,
              DATE_FORMAT(DATE_ADD(j.scheduled_at_utc, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i:%s')
                AS scheduled_at_beijing,
              DATE_FORMAT(j.scheduled_at_local, '%Y-%m-%d %H:%i:%s') AS scheduled_at_local_text,
              j.timezone, j.lease_until, j.last_error, j.create_time, j.update_time, t.title, u.alias,
              CASE
                WHEN j.status = 'failed' THEN 'delivery_failed'
                WHEN j.status = 'unknown' THEN 'delivery_unknown'
                WHEN j.status = 'processing' AND j.lease_until < UTC_TIMESTAMP() THEN 'lease_expired'
                WHEN j.status = 'pending'
                  AND j.scheduled_at_utc < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) THEN 'overdue'
                ELSE NULL
              END AS attention_reason,
              CASE WHEN j.status = 'pending' THEN (
                SELECT COUNT(*)
                  FROM todo_reminder_jobs grouped
                 WHERE grouped.user_id = j.user_id
                   AND grouped.todo_id = j.todo_id
                   AND (grouped.rule_id <=> j.rule_id)
                   AND grouped.channel = j.channel
                   AND grouped.status = 'pending'
              ) ELSE 1 END AS group_count
         FROM todo_reminder_jobs j
         LEFT JOIN todo_items t ON t.id = j.todo_id
         LEFT JOIN user u ON u.id = j.user_id
        WHERE j.status IN ('pending', 'processing', 'failed', 'unknown')
          AND (j.status <> 'pending' OR j.id = (
            SELECT grouped.id
              FROM todo_reminder_jobs grouped
             WHERE grouped.user_id = j.user_id
               AND grouped.todo_id = j.todo_id
               AND (grouped.rule_id <=> j.rule_id)
               AND grouped.channel = j.channel
               AND grouped.status = 'pending'
             ORDER BY grouped.scheduled_at_utc, grouped.id
             LIMIT 1
          ))
        ORDER BY (j.status IN ('failed', 'unknown')) DESC, j.scheduled_at_utc ASC, j.id ASC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'todo_reminder',
    '待办提醒',
    summaryRows[0] || {},
    rows.map((row) => {
      const attention = Boolean(row.attention_reason);
      return {
        id: String(row.id),
        source: 'todo_reminder',
        rawStatus: row.status,
        status: attention ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: row.title || `待办 ${row.todo_id}`,
        ownerLabel: row.alias || row.user_id || '',
        userId: row.user_id || null,
        relatedId: row.todo_id || null,
        seriesId: row.series_id || null,
        ruleId: row.rule_id || null,
        channel: row.channel,
        attempts: number(row.retry_count),
        scheduledAt: row.scheduled_at_utc_iso,
        scheduledAtUtc: row.scheduled_at_utc_iso,
        scheduledAtBeijing: row.scheduled_at_beijing,
        scheduledAtLocal: row.scheduled_at_local_text,
        timezone: row.timezone || null,
        attentionReason: row.attention_reason || null,
        groupCount: Math.max(1, number(row.group_count)),
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.last_error || null,
        // unknown 代表 SMTP 结果不确定，盲重试可能造成重复邮件，必须保持不可重试。
        canRetry: row.status === 'failed',
      };
    }),
  );
}

function todoReminderDiagnosticState(row) {
  if (row.attention_reason) return 'attention';
  if (row.status === 'processing') return 'running';
  if (row.status === 'pending') return 'waiting';
  if (row.status === 'paused') return 'paused';
  if (row.status === 'sent') return 'sent';
  return 'terminal';
}

function mapTodoReminderDiagnosticJob(row) {
  return {
    id: String(row.id),
    todoId: String(row.todo_id),
    seriesId: row.series_id || null,
    ruleId: row.rule_id || null,
    status: row.status,
    health: todoReminderDiagnosticState(row),
    attentionReason: row.attention_reason || null,
    channel: row.channel,
    attempts: number(row.retry_count),
    scheduledAtUtc: row.scheduled_at_utc_iso || null,
    scheduledAtBeijing: row.scheduled_at_beijing || null,
    scheduledAtLocal: row.scheduled_at_local_text || null,
    timezone: row.timezone || 'Asia/Shanghai',
    originalScheduledAtUtc: row.original_scheduled_at_utc_iso || null,
    stopAtUtc: row.stop_at_utc_iso || null,
    leaseUntilUtc: row.lease_until_utc_iso || null,
    sentAtUtc: row.sent_at_utc_iso || null,
    errorCode: row.last_error || null,
    createdAt: row.create_time || null,
    updatedAt: row.update_time || null,
  };
}

export async function getAdminTodoReminderDiagnostic(req, res) {
  if (!req.user?.id || req.user?.role !== 'root' || req.adminContext) {
    return res.send(resultData(null, 403, '仅管理员本人可查看待办提醒诊断'));
  }
  const id = String(req.body?.id || '').trim();
  if (!id || id.length > 255) return res.send(resultData(null, 400, '缺少有效的提醒任务 ID'));
  try {
    const [rows] = await pool.query(
      `SELECT j.id, j.user_id, j.todo_id, j.series_id, j.rule_id, j.channel, j.status, j.retry_count,
              CONCAT(DATE_FORMAT(j.original_scheduled_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z')
                AS original_scheduled_at_utc_iso,
              CONCAT(DATE_FORMAT(j.scheduled_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z') AS scheduled_at_utc_iso,
              DATE_FORMAT(DATE_ADD(j.scheduled_at_utc, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i:%s')
                AS scheduled_at_beijing,
              DATE_FORMAT(j.scheduled_at_local, '%Y-%m-%d %H:%i:%s') AS scheduled_at_local_text,
              IF(j.stop_at_utc IS NULL, NULL,
                CONCAT(DATE_FORMAT(j.stop_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z')) AS stop_at_utc_iso,
              IF(j.lease_until IS NULL, NULL,
                CONCAT(DATE_FORMAT(j.lease_until, '%Y-%m-%dT%H:%i:%s'), 'Z')) AS lease_until_utc_iso,
              IF(j.sent_at IS NULL, NULL,
                CONCAT(DATE_FORMAT(j.sent_at, '%Y-%m-%dT%H:%i:%s'), 'Z')) AS sent_at_utc_iso,
              j.timezone, j.last_error, j.create_time, j.update_time,
              t.title, t.description, t.priority, COALESCE(NULLIF(u.alias, ''), u.id) AS owner_label,
              r.mode AS rule_mode, r.trigger_type, r.fixed_local_time, r.offset_minutes,
              r.repeat_interval_minutes, r.stop_type, r.max_count, r.schedule_json,
              r.channels AS rule_channels, r.quiet_policy,
              CASE
                WHEN j.status = 'failed' THEN 'delivery_failed'
                WHEN j.status = 'unknown' THEN 'delivery_unknown'
                WHEN j.status = 'processing' AND j.lease_until < UTC_TIMESTAMP() THEN 'lease_expired'
                WHEN j.status = 'pending'
                  AND j.scheduled_at_utc < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) THEN 'overdue'
                ELSE NULL
              END AS attention_reason
         FROM todo_reminder_jobs j
         LEFT JOIN todo_items t ON t.id = j.todo_id AND t.user_id = j.user_id
         LEFT JOIN todo_reminder_rules r ON r.id = j.rule_id
         LEFT JOIN user u ON u.id = j.user_id
        WHERE j.id = ?
        LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return res.send(resultData(null, 404, '提醒任务不存在'));

    const [relatedRows] = await pool.query(
      `SELECT id, todo_id, series_id, rule_id, channel, status, retry_count,
              CONCAT(DATE_FORMAT(original_scheduled_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z')
                AS original_scheduled_at_utc_iso,
              CONCAT(DATE_FORMAT(scheduled_at_utc, '%Y-%m-%dT%H:%i:%s'), 'Z') AS scheduled_at_utc_iso,
              DATE_FORMAT(DATE_ADD(scheduled_at_utc, INTERVAL 8 HOUR), '%Y-%m-%d %H:%i:%s')
                AS scheduled_at_beijing,
              DATE_FORMAT(scheduled_at_local, '%Y-%m-%d %H:%i:%s') AS scheduled_at_local_text,
              timezone, last_error, create_time, update_time,
              CASE
                WHEN status = 'failed' THEN 'delivery_failed'
                WHEN status = 'unknown' THEN 'delivery_unknown'
                WHEN status = 'processing' AND lease_until < UTC_TIMESTAMP() THEN 'lease_expired'
                WHEN status = 'pending'
                  AND scheduled_at_utc < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) THEN 'overdue'
                ELSE NULL
              END AS attention_reason
         FROM todo_reminder_jobs
        WHERE user_id = ? AND todo_id = ? AND (rule_id <=> ?)
        ORDER BY (scheduled_at_utc >= UTC_TIMESTAMP()) DESC,
                 CASE WHEN scheduled_at_utc >= UTC_TIMESTAMP() THEN scheduled_at_utc END ASC,
                 CASE WHEN scheduled_at_utc < UTC_TIMESTAMP() THEN scheduled_at_utc END DESC,
                 id ASC
        LIMIT 12`,
      [row.user_id, row.todo_id, row.rule_id || null],
    );
    const versionedSchedule = parseJson(row.schedule_json, null);
    return res.send(
      resultData({
        timeStandard: { id: 'beijing', label: '北京时间', utcOffset: '+08:00' },
        todo: {
          id: String(row.todo_id),
          title: row.title || `待办 ${row.todo_id}`,
          description: row.description || '',
          priority: number(row.priority),
          ownerLabel: row.owner_label || row.user_id,
        },
        job: mapTodoReminderDiagnosticJob(row),
        rule: row.rule_id
          ? {
              id: String(row.rule_id),
              mode: row.rule_mode,
              triggerType: row.trigger_type,
              fixedLocalTime: row.fixed_local_time ? String(row.fixed_local_time).slice(0, 5) : null,
              offsetMinutes: row.offset_minutes === null ? null : number(row.offset_minutes),
              repeatIntervalMinutes: row.repeat_interval_minutes === null ? null : number(row.repeat_interval_minutes),
              stopType: row.stop_type || null,
              maxCount: row.max_count === null ? null : number(row.max_count),
              channels: parseJson(row.rule_channels, []),
              quietPolicy: row.quiet_policy || 'defer_once',
              schedule: versionedSchedule?.version === 2 ? versionedSchedule.schedule : null,
            }
          : null,
        relatedJobs: relatedRows.map(mapTodoReminderDiagnosticJob),
        generatedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('[admin-action-center] todo reminder diagnostic failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '待办提醒诊断加载失败'));
  }
}

function filePreviewDiagnosticHealth(row) {
  if (row.job_status === 'failed') return 'attention';
  if (row.job_status === 'processing') {
    const lockedAt = row.locked_at ? new Date(row.locked_at).getTime() : Number.NaN;
    if (Number.isFinite(lockedAt) && Date.now() - lockedAt > 10 * 60_000) return 'attention';
    return 'running';
  }
  if (row.job_status === 'queued') return 'waiting';
  if (row.job_status === 'completed') return 'completed';
  return 'terminal';
}

function filePreviewAttentionReason(row) {
  if (row.job_status === 'failed') return 'processing_failed';
  const lockedAt = row.locked_at ? new Date(row.locked_at).getTime() : Number.NaN;
  if (row.job_status === 'processing' && Number.isFinite(lockedAt) && Date.now() - lockedAt > 10 * 60_000) {
    return 'worker_stale';
  }
  if (row.job_status === 'processing') return 'processing';
  if (row.job_status === 'queued') return 'queued';
  if (row.job_status === 'completed') return 'completed';
  return 'terminal';
}

export async function getAdminFilePreviewDiagnostic(req, res) {
  if (!req.user?.id || req.user?.role !== 'root' || req.adminContext) {
    return res.send(resultData(null, 403, '仅管理员本人可查看文件预览诊断'));
  }
  const id = String(req.body?.id || '').trim();
  if (!/^\d{1,20}$/.test(id)) return res.send(resultData(null, 400, '缺少有效的文件预览任务 ID'));
  try {
    const [rows] = await pool.query(
      `SELECT j.id, j.artifact_id, j.status AS job_status, j.attempts, j.available_at,
              j.locked_at, j.error_code AS job_error_code, j.create_time AS job_create_time,
              j.update_time AS job_update_time,
              a.file_id, a.owner_user_id, a.strategy, a.strategy_version, a.format_id,
              a.source_size, a.status AS artifact_status, a.artifact_size, a.entry_count,
              a.total_uncompressed_size, a.contains_encrypted, a.suspicious_expansion,
              a.error_code AS artifact_error_code, a.last_access_at,
              f.file_name, f.file_type, f.file_size,
              COALESCE(NULLIF(u.alias, ''), u.id) AS owner_label
         FROM file_preview_jobs j
         JOIN file_preview_artifacts a ON a.id = j.artifact_id
         LEFT JOIN files f ON f.id = a.file_id
         LEFT JOIN user u ON u.id = a.owner_user_id
        WHERE j.id = ?
        LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return res.send(resultData(null, 404, '文件预览任务不存在'));
    return res.send(
      resultData({
        file: {
          id: String(row.file_id),
          name: row.file_name || `${row.format_id || '文件'} ${row.file_id}`,
          type: row.file_type || '',
          size: number(row.file_size || row.source_size),
          ownerLabel: row.owner_label || row.owner_user_id,
        },
        job: {
          id: String(row.id),
          status: row.job_status,
          health: filePreviewDiagnosticHealth(row),
          attentionReason: filePreviewAttentionReason(row),
          attempts: number(row.attempts),
          availableAt: row.available_at || null,
          lockedAt: row.locked_at || null,
          errorCode: row.job_error_code || row.artifact_error_code || null,
          createdAt: row.job_create_time || null,
          updatedAt: row.job_update_time || null,
        },
        artifact: {
          id: String(row.artifact_id),
          status: row.artifact_status,
          strategy: row.strategy,
          strategyVersion: number(row.strategy_version),
          formatId: row.format_id,
          sourceSize: number(row.source_size),
          artifactSize: number(row.artifact_size),
          entryCount: number(row.entry_count),
          totalUncompressedSize: number(row.total_uncompressed_size),
          containsEncrypted: Boolean(row.contains_encrypted),
          suspiciousExpansion: Boolean(row.suspicious_expansion),
          errorCode: row.artifact_error_code || null,
          lastAccessAt: row.last_access_at || null,
        },
        generatedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('[admin-action-center] file preview diagnostic failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '文件预览诊断加载失败'));
  }
}

async function loadAccountDeletionJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'retry_wait'
           OR (status = 'processing' AND processing_started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE))), 0) AS attention,
         COALESCE(SUM(status = 'processing' AND (processing_started_at IS NULL OR processing_started_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE))), 0) AS running,
         COALESCE(SUM(status = 'pending'), 0) AS waiting,
         COALESCE(SUM(status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
       FROM account_deletion_requests
       WHERE status <> 'completed' OR completed_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    ),
    pool.query(
      `SELECT id, user_id, status, attempts, requested_at, processing_started_at,
              next_retry_at, last_error_code, update_time
         FROM account_deletion_requests
        WHERE status IN ('pending', 'processing', 'retry_wait')
        ORDER BY (status = 'retry_wait') DESC, requested_at ASC, id ASC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'account_deletion',
    '注销清理',
    summaryRows[0] || {},
    rows.map((row) => {
      const stale =
        row.status === 'processing' &&
        row.processing_started_at &&
        Date.now() - new Date(row.processing_started_at).getTime() > 15 * 60_000;
      return {
        id: String(row.id),
        source: 'account_deletion',
        rawStatus: row.status,
        status:
          row.status === 'retry_wait' || stale ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: `注销清理 ${String(row.id).slice(0, 8)}`,
        ownerLabel: String(row.user_id || '').slice(0, 12),
        userId: null,
        attempts: number(row.attempts),
        scheduledAt: row.next_retry_at,
        createdAt: row.requested_at,
        updatedAt: row.update_time,
        errorCode: row.last_error_code || null,
        canRetry: row.status === 'retry_wait',
      };
    }),
  );
}

async function loadEmailDeliveryJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'failed' OR (status = 'sending' AND update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS attention,
         COALESCE(SUM(status = 'sending' AND update_time >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)), 0) AS running,
         0 AS waiting,
         COALESCE(SUM(status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
       FROM email_delivery_logs
       WHERE status IN ('sending', 'failed')
          OR (status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY))`,
    ),
    pool.query(
      `SELECT id, email_type, user_id, recipient_email, subject, business_type, business_id,
              status, attempt_no, error_code, create_time, update_time
         FROM email_delivery_logs
        WHERE status = 'failed' OR (status = 'sending' AND update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
        ORDER BY update_time DESC, id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'email_delivery',
    '邮件投递',
    summaryRows[0] || {},
    rows.map((row) => ({
      id: String(row.id),
      source: 'email_delivery',
      rawStatus: row.status,
      status: 'attention',
      title: row.subject || row.email_type || '邮件投递',
      ownerLabel: maskEmail(row.recipient_email),
      userId: row.user_id || null,
      relatedId: row.business_id || null,
      channel: 'email',
      attempts: number(row.attempt_no),
      scheduledAt: null,
      createdAt: row.create_time,
      updatedAt: row.update_time,
      errorCode: row.status === 'sending' ? 'DELIVERY_RESULT_UNKNOWN' : row.error_code || 'EMAIL_DELIVERY_FAILED',
      // 投递日志不是队列事实；结果不明时重复发送风险更高，只提供诊断入口。
      canRetry: false,
      targetUrl: '/notificationCenter?tab=email',
    })),
  );
}

async function loadFilePreviewJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'failed' OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS attention,
              COALESCE(SUM(status = 'processing' AND (locked_at IS NULL OR locked_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE))), 0) AS running,
              COALESCE(SUM(status = 'queued'), 0) AS waiting,
              COALESCE(SUM(status = 'completed' AND update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
         FROM file_preview_jobs
        WHERE status IN ('queued', 'processing', 'failed')
           OR (status = 'completed' AND update_time >= DATE_SUB(NOW(), INTERVAL 1 DAY))`,
    ),
    pool.query(
      `SELECT j.id, j.status, j.attempts, j.available_at, j.locked_at, j.error_code,
              j.create_time, j.update_time, a.file_id, a.format_id, a.owner_user_id,
              f.file_name, u.alias
         FROM file_preview_jobs j
         JOIN file_preview_artifacts a ON a.id = j.artifact_id
         LEFT JOIN files f ON f.id = a.file_id
         LEFT JOIN user u ON u.id = a.owner_user_id
        WHERE j.status IN ('queued', 'processing', 'failed')
        ORDER BY (j.status = 'failed') DESC, j.update_time DESC, j.id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'file_preview',
    '文件预览',
    summaryRows[0] || {},
    rows.map((row) => {
      const stale =
        row.status === 'processing' && row.locked_at && Date.now() - new Date(row.locked_at).getTime() > 10 * 60_000;
      return {
        id: String(row.id),
        source: 'file_preview',
        rawStatus: row.status,
        status: row.status === 'failed' || stale ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: row.file_name || `${row.format_id || '文件'} ${row.file_id}`,
        ownerLabel: row.alias || row.owner_user_id || '',
        userId: row.owner_user_id || null,
        relatedId: row.file_id ? String(row.file_id) : null,
        attempts: number(row.attempts),
        scheduledAt: row.available_at,
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.error_code || null,
        canRetry: false,
      };
    }),
  );
}

async function loadResourceCleanupJobs(limit) {
  const [[summaryRows], [rows]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'completed_with_errors' OR (status = 'running' AND lease_expires_at < NOW())), 0) AS attention,
              COALESCE(SUM(status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at >= NOW())), 0) AS running,
              COALESCE(SUM(status = 'pending'), 0) AS waiting,
              COALESCE(SUM(status IN ('completed', 'completed_with_errors') AND finished_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)), 0) AS completed_24h
         FROM resource_cleanup_jobs
        WHERE status IN ('pending', 'running', 'completed_with_errors')
           OR (status = 'completed' AND finished_at >= DATE_SUB(NOW(), INTERVAL 1 DAY))`,
    ),
    pool.query(
      `SELECT id, risk_level, status, total, succeeded, skipped, failed,
              lease_expires_at, last_error_code, create_time, update_time
         FROM resource_cleanup_jobs
        WHERE status IN ('pending', 'running', 'completed_with_errors')
        ORDER BY (status = 'completed_with_errors') DESC,
                 (status = 'running' AND lease_expires_at < NOW()) DESC,
                 update_time DESC, id DESC
        LIMIT ?`,
      [limit],
    ),
  ]);
  return jobResult(
    'resource_cleanup',
    '资源清理',
    summaryRows[0] || {},
    rows.map((row) => {
      const stale =
        row.status === 'running' && row.lease_expires_at && new Date(row.lease_expires_at).getTime() < Date.now();
      return {
        id: String(row.id),
        source: 'resource_cleanup',
        rawStatus: row.status,
        status:
          row.status === 'completed_with_errors' || stale
            ? 'attention'
            : row.status === 'running'
              ? 'running'
              : 'waiting',
        title: `资源清理 ${String(row.id).slice(0, 8)}`,
        ownerLabel: `${number(row.succeeded)}/${number(row.total)} 已完成`,
        userId: null,
        attempts: number(row.failed),
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.last_error_code || (number(row.failed) > 0 ? 'CLEANUP_ITEMS_FAILED' : null),
        canRetry: false,
        targetUrl: `/admin/resourceGovernance?jobId=${encodeURIComponent(row.id)}`,
      };
    }),
  );
}

const ACTION_CENTER_LOADERS = Object.freeze({
  opinion: loadOpinionWork,
  security: loadSecurityWork,
  community_report: loadCommunityReportWork,
  ai_feedback: loadAiFeedbackWork,
  feature_request: loadFeatureRequestWork,
  resource_governance: loadResourceGovernanceWork,
  ai_document: loadAiDocumentJobs,
  bookmark_icon: loadBookmarkIconJobs,
  todo_reminder: loadTodoReminderJobs,
  account_deletion: loadAccountDeletionJobs,
  email_delivery: loadEmailDeliveryJobs,
  file_preview: loadFilePreviewJobs,
  resource_cleanup: loadResourceCleanupJobs,
});

function selectedSourceLoaders({ section, source }) {
  return Object.entries(ACTION_CENTER_LOADERS).filter(([sourceKey]) => {
    if (source !== 'all' && source !== sourceKey) return false;
    const policySection = getAdminWorkItemPolicy(sourceKey)?.section;
    return section === 'all' || section === policySection;
  });
}

export async function getAdminActionCenter(req, res) {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  const limit = itemLimit(req.body?.limit);
  const source = itemSource(req.body?.source);
  const section = enumFilter(req.body?.section, ACTION_CENTER_SECTIONS);
  const status = enumFilter(req.body?.status, ACTION_CENTER_STATUSES);
  const slaState = enumFilter(req.body?.slaState, ACTION_CENTER_SLA_STATES);
  const keyword = itemKeyword(req.body?.keyword);
  if (!source) return res.send(resultData(null, 400, '不支持的待处理来源'));
  if (!section || !status || !slaState || keyword === null) {
    return res.send(resultData(null, 400, '待处理筛选条件不合法'));
  }
  try {
    const results = await Promise.all(
      selectedSourceLoaders({ section, source }).map(([sourceKey, loader]) =>
        optionalSource(sourceKey, () => loader(limit)),
      ),
    );

    const workSources = results
      .filter((entry) => getAdminWorkItemPolicy(entry.source)?.section === 'work')
      .filter((entry) => entry.available)
      .map((entry) => entry.data);
    const jobSources = results
      .filter((entry) => getAdminWorkItemPolicy(entry.source)?.section === 'jobs')
      .filter((entry) => entry.available)
      .map((entry) => entry.data);
    const selectedWorkSources =
      section === 'jobs' ? [] : source === 'all' ? workSources : workSources.filter((entry) => entry.source === source);
    const selectedJobSources =
      section === 'work' ? [] : source === 'all' ? jobSources : jobSources.filter((entry) => entry.source === source);
    const filters = { status, slaState, keyword };
    const workItems = selectedWorkSources
      .flatMap((entry) => entry.items)
      .filter((item) => itemMatchesFilters(item, filters))
      .sort(operationalPriorityFirst)
      .slice(0, limit);
    const jobItems = selectedJobSources
      .flatMap((entry) => entry.items)
      .filter((item) => itemMatchesFilters(item, filters))
      .sort(operationalPriorityFirst)
      .slice(0, limit);
    const unavailableSources = results.filter((entry) => !entry.available).map((entry) => entry.source);
    const sourceSummaries = [...workSources, ...jobSources];
    const returnedCount = sourceSummaries.reduce((sum, entry) => sum + entry.returned, 0);
    const slaUnavailable = sourceSummaries.reduce((sum, entry) => sum + entry.slaUnavailable, 0);

    return res.send(
      resultData({
        generatedAt: new Date().toISOString(),
        filters: { section, source, status, slaState, keyword },
        unavailableSources,
        sourceHealth: results.map(({ source: sourceKey, available, checkedAt }) => ({
          source: sourceKey,
          available,
          checkedAt,
        })),
        sla: {
          policyVersion: ADMIN_WORK_ITEM_POLICY_VERSION,
          overdue: sourceSummaries.reduce((sum, entry) => sum + entry.overdue, 0),
          dueSoon: sourceSummaries.reduce((sum, entry) => sum + entry.dueSoon, 0),
          oldestAgeMinutes: sourceSummaries.reduce((oldest, entry) => Math.max(oldest, entry.oldestAgeMinutes), 0),
          returnedCount,
          unavailableCount: slaUnavailable,
          sampled: unavailableSources.length > 0 || sourceSummaries.some((entry) => entry.sampled),
        },
        work: {
          total: workSources.reduce((sum, entry) => sum + entry.count, 0),
          critical: workSources.reduce((sum, entry) => sum + entry.critical, 0),
          sources: workSources.map(({ items, ...summary }) => summary),
          items: workItems,
        },
        jobs: {
          attention: jobSources.reduce((sum, entry) => sum + entry.attention, 0),
          running: jobSources.reduce((sum, entry) => sum + entry.running, 0),
          waiting: jobSources.reduce((sum, entry) => sum + entry.waiting, 0),
          completed24h: jobSources.reduce((sum, entry) => sum + entry.completed24h, 0),
          sources: jobSources.map(({ items, ...summary }) => summary),
          items: jobItems,
        },
      }),
    );
  } catch (error) {
    console.error('[admin-action-center] load failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '待处理中心加载失败'));
  }
}

const RETRYABLE_JOB_SOURCES = new Set(['ai_document', 'bookmark_icon', 'todo_reminder', 'account_deletion']);

function retryError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

async function loadRetryState(connection, source, id) {
  if (source === 'ai_document') {
    const [rows] = await connection.query(
      'SELECT id, source_id, status FROM ai_document_jobs WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    return rows[0] || null;
  }
  if (source === 'bookmark_icon') {
    const [rows] = await connection.query('SELECT id, status FROM bookmark_icon_jobs WHERE id = ? LIMIT 1 FOR UPDATE', [
      id,
    ]);
    return rows[0] || null;
  }
  if (source === 'todo_reminder') {
    const [rows] = await connection.query(
      'SELECT id, status, channel FROM todo_reminder_jobs WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    return rows[0] || null;
  }
  const [rows] = await connection.query(
    'SELECT id, status FROM account_deletion_requests WHERE id = ? LIMIT 1 FOR UPDATE',
    [id],
  );
  return rows[0] || null;
}

async function requeueJob(connection, source, id, state) {
  if (source === 'ai_document') {
    if (state.status !== 'failed') throw retryError('JOB_NOT_RETRYABLE', '只有失败的文档解析任务可以重试', 409);
    await connection.query(
      `UPDATE ai_document_jobs
          SET status = 'queued', attempts = 0, available_at = NOW(), locked_at = NULL,
              locked_by = NULL, error_message = NULL
        WHERE id = ? AND status = 'failed'`,
      [id],
    );
    await connection.query(
      `UPDATE ai_document_sources
          SET status = 'queued', error_code = NULL, error_message = NULL
        WHERE id = ?`,
      [state.source_id],
    );
    return 'queued';
  }
  if (source === 'bookmark_icon') {
    if (state.status !== 'failed') throw retryError('JOB_NOT_RETRYABLE', '只有失败的书签图标任务可以重试', 409);
    await connection.query(
      `UPDATE bookmark_icon_jobs
          SET status = 'queued', attempts = 0, available_at = NOW(), locked_at = NULL,
              locked_by = NULL, error_code = NULL
        WHERE id = ? AND status = 'failed'`,
      [id],
    );
    return 'queued';
  }
  if (source === 'todo_reminder') {
    if (state.status === 'unknown') {
      throw retryError('JOB_RESULT_UNKNOWN', '投递结果未知，自动重试可能造成重复提醒', 409);
    }
    if (state.status !== 'failed') throw retryError('JOB_NOT_RETRYABLE', '只有明确失败的提醒任务可以重试', 409);
    await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = 'pending', retry_count = 0, scheduled_at_utc = UTC_TIMESTAMP(),
              last_error = NULL, lease_token = NULL, lease_until = NULL
        WHERE id = ? AND status = 'failed'`,
      [id],
    );
    return 'pending';
  }
  if (state.status !== 'retry_wait') {
    throw retryError('JOB_NOT_RETRYABLE', '只有等待自动重试的注销清理任务可以提前重试', 409);
  }
  await connection.query(
    `UPDATE account_deletion_requests
        SET next_retry_at = NOW()
      WHERE id = ? AND status = 'retry_wait'`,
    [id],
  );
  return 'retry_wait';
}

export async function retryAdminAsyncJob(req, res) {
  const actorUserId = req.user?.id;
  const source = String(req.body?.source || '').trim();
  const id = String(req.body?.id || '').trim();
  const reason = String(req.body?.reason || '').trim();
  let connection = null;
  let previousStatus = '';
  try {
    if (!actorUserId || req.user?.role !== 'root' || req.adminContext) {
      return res.send(resultData(null, 403, '仅管理员本人可重试后台任务'));
    }
    const [actorRows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [actorUserId]);
    if (!actorRows[0] || actorRows[0].role !== 'root' || Number(actorRows[0].del_flag || 0) !== 0) {
      return res.send(resultData(null, 403, '管理员身份复核失败'));
    }
    if (!RETRYABLE_JOB_SOURCES.has(source) || !id || id.length > 255) {
      return res.send(resultData(null, 400, '不支持的任务来源或任务 ID'));
    }
    if (
      reason.length < 6 ||
      reason.length > 500 ||
      req.body?.confirmed !== true ||
      req.body?.confirmText !== '确认重试任务'
    ) {
      return res.send(resultData(null, 400, '请填写操作原因并确认重试'));
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const state = await loadRetryState(connection, source, id);
    if (!state) throw retryError('JOB_NOT_FOUND', '任务不存在', 404);
    previousStatus = state.status;
    const nextStatus = await requeueJob(connection, source, id, state);
    await recordAdminOperationAudit(
      {
        actorUserId,
        action: 'async_job.retry',
        targetType: source,
        targetId: id,
        outcome: 'succeeded',
        reason,
        requestId: req.requestId,
        affectedRows: 1,
        ip: req.ip,
        metadata: { previousStatus, nextStatus },
      },
      { db: connection, required: true },
    );
    await connection.commit();
    connection.release();
    connection = null;
    return res.send(resultData({ source, id, status: nextStatus }));
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
      connection = null;
    }
    if (actorUserId && source && id) {
      await recordAdminOperationAudit({
        actorUserId,
        action: 'async_job.retry',
        targetType: source,
        targetId: id,
        outcome: error?.status && error.status < 500 ? 'denied' : 'failed',
        reason,
        requestId: req.requestId,
        ip: req.ip,
        metadata: { previousStatus, errorCode: stableAgentErrorCode(error) },
      });
    }
    console.error('[admin-action-center] retry failed source=%s code=%s', source, stableAgentErrorCode(error));
    const status = Number(error?.status || 500);
    return res.send(
      resultData(
        null,
        status,
        error?.code === 'ADMIN_AUDIT_UNAVAILABLE'
          ? '审计服务不可用，任务状态已回滚'
          : status < 500
            ? error.message
            : '任务重试失败',
      ),
    );
  }
}

export async function dismissAdminAsyncJob(req, res) {
  const actorUserId = req.user?.id;
  const source = String(req.body?.source || '').trim();
  const id = String(req.body?.id || '').trim();
  const reason = String(req.body?.reason || '').trim();
  let connection = null;
  try {
    if (!actorUserId || req.user?.role !== 'root' || req.adminContext) {
      return res.send(resultData(null, 403, '仅管理员本人可移除异常任务'));
    }
    const [actorRows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [actorUserId]);
    if (!actorRows[0] || actorRows[0].role !== 'root' || Number(actorRows[0].del_flag || 0) !== 0) {
      return res.send(resultData(null, 403, '管理员身份复核失败'));
    }
    if (source !== 'bookmark_icon' || !id || id.length > 255) {
      return res.send(resultData(null, 400, '该任务不支持从异常列表移除'));
    }
    if (reason.length < 6 || reason.length > 500 || req.body?.confirmed !== true) {
      return res.send(resultData(null, 400, '请填写操作原因并确认移除'));
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, status FROM bookmark_icon_jobs WHERE id = ? LIMIT 1 FOR UPDATE', [
      id,
    ]);
    if (!rows[0]) throw retryError('JOB_NOT_FOUND', '任务不存在', 404);
    if (rows[0].status !== 'failed') throw retryError('JOB_NOT_DISMISSIBLE', '只有失败任务可以移除', 409);
    const [result] = await connection.query(
      `UPDATE bookmark_icon_jobs
          SET status = 'cancelled', locked_at = NULL, locked_by = NULL
        WHERE id = ? AND status = 'failed'`,
      [id],
    );
    await recordAdminOperationAudit(
      {
        actorUserId,
        action: 'async_job.dismiss',
        targetType: source,
        targetId: id,
        outcome: 'succeeded',
        reason,
        requestId: req.requestId,
        affectedRows: Number(result.affectedRows || 0),
        ip: req.ip,
        metadata: { previousStatus: 'failed', nextStatus: 'cancelled' },
      },
      { db: connection, required: true },
    );
    await connection.commit();
    connection.release();
    connection = null;
    return res.send(resultData({ source, id, status: 'cancelled' }));
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    console.error('[admin-action-center] dismiss failed source=%s code=%s', source, stableAgentErrorCode(error));
    const status = Number(error?.status || 500);
    return res.send(resultData(null, status, status < 500 ? error.message : '异常任务移除失败'));
  }
}

export const adminActionCenterInternals = {
  itemLimit,
  itemSource,
  itemKeyword,
  itemMatchesFilters,
  maskEmail,
  newestFirst,
  operationalPriorityFirst,
  requeueJob,
};
