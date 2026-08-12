import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { listAdminActionDefinitions } from '../util/adminActionRegistry.js';

const DIRECT_AUDIT_ACTION_DEFINITIONS = [
  { action: 'async_job.retry', riskLevel: 'high' },
  { action: 'async_job.dismiss', riskLevel: 'medium' },
  { action: 'ai_feedback.triage', riskLevel: 'medium' },
  { action: 'opinion.reply', riskLevel: 'medium' },
  { action: 'opinion.delete', riskLevel: 'high' },
];
const ACTION_DEFINITIONS = [...listAdminActionDefinitions(), ...DIRECT_AUDIT_ACTION_DEFINITIONS];
const ACTIONS = new Set(['all', ...ACTION_DEFINITIONS.map((item) => item.action)]);
const OUTCOMES = new Set(['all', 'intent', 'succeeded', 'failed', 'denied']);

function safeDate(value, endOfDay = false) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  return `${date} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function getAdminOperationAudits(req, res) {
  if (req.user?.role !== 'root' || req.adminContext) {
    return res.send(resultData(null, 403, '仅管理员本人可查看操作审计'));
  }
  try {
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 20, 1), 100);
    const currentPage = Math.max(Number(req.body?.currentPage) || 1, 1);
    const offset = (currentPage - 1) * pageSize;
    const action = ACTIONS.has(req.body?.action) ? req.body.action : 'all';
    const outcome = OUTCOMES.has(req.body?.outcome) ? req.body.outcome : 'all';
    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 120);
    const startDate = safeDate(req.body?.startDate);
    const endDate = safeDate(req.body?.endDate, true);
    const where = ['1 = 1'];
    const params = [];

    if (action !== 'all') {
      where.push('a.action = ?');
      params.push(action);
    }
    if (outcome !== 'all') {
      where.push('a.outcome = ?');
      params.push(outcome);
    }
    if (keyword) {
      const like = `%${keyword}%`;
      where.push(
        '(a.actor_user_id LIKE ? OR u.alias LIKE ? OR a.target_type LIKE ? OR a.target_id LIKE ? OR a.reason LIKE ? OR a.request_id LIKE ?)',
      );
      params.push(like, like, like, like, like, like);
    }
    if (startDate) {
      where.push('a.create_time >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('a.create_time <= ?');
      params.push(endDate);
    }
    const whereSql = where.join(' AND ');
    const [[rows], [countRows], [summaryRows]] = await Promise.all([
      pool.query(
        `SELECT a.id, a.actor_user_id, u.alias AS actor_alias, a.action, a.target_type, a.target_id,
                a.outcome, a.reason, a.request_id, a.ip_masked, a.metadata, a.create_time
           FROM admin_operation_audit a
           LEFT JOIN user u ON u.id = a.actor_user_id
          WHERE ${whereSql}
          ORDER BY a.create_time DESC, a.id DESC
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total
           FROM admin_operation_audit a
           LEFT JOIN user u ON u.id = a.actor_user_id
          WHERE ${whereSql}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(outcome = 'succeeded'), 0) AS succeeded,
                COALESCE(SUM(outcome = 'failed'), 0) AS failed,
                COALESCE(SUM(outcome = 'denied'), 0) AS denied,
                COALESCE(SUM(outcome = 'intent'), 0) AS intents,
                COALESCE(SUM(outcome IN ('succeeded', 'failed', 'denied')), 0) AS terminals,
                COALESCE(SUM(action = 'async_job.retry'), 0) AS job_retries,
                COALESCE(SUM(action = 'ai_feedback.triage'), 0) AS feedback_triages
           FROM admin_operation_audit
          WHERE create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      ),
    ]);

    return res.send(
      resultData({
        items: rows.map((row) => ({ ...row, metadata: parseMetadata(row.metadata) })),
        total: Number(countRows[0]?.total || 0),
        currentPage,
        pageSize,
        summary7d: summaryRows[0] || {},
        actionCatalog: ACTION_DEFINITIONS,
      }),
    );
  } catch (error) {
    console.error('[admin-audit] list failed code=%s', stableAgentErrorCode(error));
    const missing = error?.code === 'ER_NO_SUCH_TABLE';
    return res.send(resultData(null, missing ? 503 : 500, missing ? '操作审计表尚未迁移' : '操作审计加载失败'));
  }
}

export const adminAuditHandleInternals = {
  safeDate,
  parseMetadata,
};
