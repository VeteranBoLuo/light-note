import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordAdminOperationAudit } from '../util/adminOperationAudit.js';

const DEFAULT_ITEM_LIMIT = 20;
const MAX_ITEM_LIMIT = 60;
const ACTION_CENTER_SOURCES = new Set([
  'opinion',
  'security',
  'community_report',
  'ai_feedback',
  'ai_document',
  'bookmark_icon',
  'todo_reminder',
  'account_deletion',
  'email_delivery',
]);

function itemLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_ITEM_LIMIT, 5), MAX_ITEM_LIMIT);
}

function itemSource(value) {
  const source = String(value || 'all').trim();
  return source === 'all' || !source ? 'all' : ACTION_CENTER_SOURCES.has(source) ? source : null;
}

function number(value) {
  return Number(value || 0);
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
    return { source, data: await loader(), available: true };
  } catch (error) {
    console.warn('[admin-action-center] source=%s unavailable code=%s', source, stableAgentErrorCode(error));
    return { source, data: null, available: false };
  }
}

function workResult(source, label, count, critical, items) {
  return {
    source,
    label,
    count: number(count),
    critical: number(critical),
    items,
  };
}

function jobResult(source, label, summary, items) {
  return {
    source,
    label,
    total: number(summary.total),
    attention: number(summary.attention),
    running: number(summary.running),
    waiting: number(summary.waiting),
    completed24h: number(summary.completed_24h),
    items,
  };
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
      targetUrl: `/securityCenter/events?eventId=${encodeURIComponent(row.event_id)}`,
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
      `SELECT j.id, j.user_id, j.todo_id, j.channel, j.status, j.retry_count, j.scheduled_at_utc,
              j.lease_until, j.last_error, j.create_time, j.update_time, t.title, u.alias
         FROM todo_reminder_jobs j
         LEFT JOIN todo_items t ON t.id = j.todo_id
         LEFT JOIN user u ON u.id = j.user_id
        WHERE j.status IN ('pending', 'processing', 'failed', 'unknown')
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
      const staleProcessing =
        row.status === 'processing' && row.lease_until && new Date(row.lease_until).getTime() < Date.now();
      const overduePending =
        row.status === 'pending' && new Date(row.scheduled_at_utc).getTime() < Date.now() - 10 * 60_000;
      const attention = ['failed', 'unknown'].includes(row.status) || staleProcessing || overduePending;
      return {
        id: String(row.id),
        source: 'todo_reminder',
        rawStatus: row.status,
        status: attention ? 'attention' : row.status === 'processing' ? 'running' : 'waiting',
        title: row.title || `待办 ${row.todo_id}`,
        ownerLabel: row.alias || row.user_id || '',
        userId: row.user_id || null,
        relatedId: row.todo_id || null,
        channel: row.channel,
        attempts: number(row.retry_count),
        scheduledAt: row.scheduled_at_utc,
        createdAt: row.create_time,
        updatedAt: row.update_time,
        errorCode: row.last_error || null,
        // unknown 代表 SMTP 结果不确定，盲重试可能造成重复邮件，必须保持不可重试。
        canRetry: row.status === 'failed',
      };
    }),
  );
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

export async function getAdminActionCenter(req, res) {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  const limit = itemLimit(req.body?.limit);
  const source = itemSource(req.body?.source);
  if (!source) return res.send(resultData(null, 400, '不支持的待处理来源'));
  try {
    const results = await Promise.all([
      optionalSource('opinion', () => loadOpinionWork(limit)),
      optionalSource('security', () => loadSecurityWork(limit)),
      optionalSource('community_report', () => loadCommunityReportWork(limit)),
      optionalSource('ai_feedback', () => loadAiFeedbackWork(limit)),
      optionalSource('ai_document', () => loadAiDocumentJobs(limit)),
      optionalSource('bookmark_icon', () => loadBookmarkIconJobs(limit)),
      optionalSource('todo_reminder', () => loadTodoReminderJobs(limit)),
      optionalSource('account_deletion', () => loadAccountDeletionJobs(limit)),
      optionalSource('email_delivery', () => loadEmailDeliveryJobs(limit)),
    ]);

    const workSources = results
      .slice(0, 4)
      .filter((entry) => entry.available)
      .map((entry) => entry.data);
    const jobSources = results
      .slice(4)
      .filter((entry) => entry.available)
      .map((entry) => entry.data);
    const selectedWorkSources = source === 'all' ? workSources : workSources.filter((entry) => entry.source === source);
    const selectedJobSources = source === 'all' ? jobSources : jobSources.filter((entry) => entry.source === source);
    const workItems = selectedWorkSources
      .flatMap((entry) => entry.items)
      .sort(newestFirst)
      .slice(0, limit);
    const jobItems = selectedJobSources
      .flatMap((entry) => entry.items)
      .sort(newestFirst)
      .slice(0, limit);
    const unavailableSources = results.filter((entry) => !entry.available).map((entry) => entry.source);

    return res.send(
      resultData({
        generatedAt: new Date().toISOString(),
        unavailableSources,
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

export const adminActionCenterInternals = {
  itemLimit,
  itemSource,
  maskEmail,
  newestFirst,
  requeueJob,
};
