import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { recordAdminOperationAudit } from '../util/adminOperationAudit.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

const TRIAGE_STATUSES = new Set(['open', 'investigating', 'actioned', 'dismissed']);
const TRIAGE_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function cleanText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function isSchemaUnavailable(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

export async function updateAdminAiFeedbackTriage(req, res) {
  if (req.user?.role !== 'root' || req.adminContext) {
    return res.send(resultData(null, 403, '仅管理员本人可处理 AI 反馈'));
  }
  const feedbackId = cleanText(req.body?.feedbackId, 36);
  const status = cleanText(req.body?.status, 20);
  const priority = cleanText(req.body?.priority, 16);
  const note = cleanText(req.body?.note, 500);
  if (!feedbackId || !TRIAGE_STATUSES.has(status) || !TRIAGE_PRIORITIES.has(priority)) {
    return res.send(resultData(null, 400, '处理参数无效'));
  }
  if (['actioned', 'dismissed'].includes(status) && note.length < 6) {
    return res.send(resultData(null, 400, '完成或忽略反馈时请填写至少 6 个字符的处理说明'));
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [actors] = await connection.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [
      req.user.id,
    ]);
    if (!actors.length || actors[0].role !== 'root' || Number(actors[0].del_flag || 0) !== 0) {
      await connection.rollback();
      return res.send(resultData(null, 403, '管理员身份已失效'));
    }
    const [feedbackRows] = await connection.query(
      `SELECT f.id
         FROM ai_feedback f
         JOIN ai_conversations c ON c.id = f.conversation_id
        WHERE f.id = ?
          AND c.status IN ('active', 'archived')
          AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
        LIMIT 1 FOR UPDATE`,
      [feedbackId],
    );
    if (!feedbackRows.length) {
      await connection.rollback();
      return res.send(resultData(null, 404, '反馈不存在或原会话已不再保留'));
    }
    await connection.query(
      `INSERT INTO admin_ai_feedback_triage
         (feedback_id, status, priority, note, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), priority=VALUES(priority), note=VALUES(note),
         updated_by=VALUES(updated_by), update_time=CURRENT_TIMESTAMP`,
      [feedbackId, status, priority, note, req.user.id],
    );
    await recordAdminOperationAudit(
      {
        actorUserId: req.user.id,
        action: 'ai_feedback.triage',
        targetType: 'ai_feedback',
        targetId: feedbackId,
        outcome: 'succeeded',
        reason: note || `状态更新为 ${status}`,
        requestId: req.requestId,
        ip: req.ip,
        metadata: { status, priority },
      },
      { db: connection, required: true },
    );
    await connection.commit();
    return res.send(resultData({ feedbackId, status, priority, note }));
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error('[admin-ai-feedback] triage failed code=%s', stableAgentErrorCode(error));
    if (isSchemaUnavailable(error) || error?.code === 'ADMIN_AUDIT_UNAVAILABLE') {
      return res.send(resultData(null, 503, '反馈处理能力尚未完成数据库迁移，未保存任何变更'));
    }
    return res.send(resultData(null, 500, '保存反馈处理状态失败'));
  } finally {
    connection.release();
  }
}

export const adminAiFeedbackHandleInternals = { TRIAGE_STATUSES, TRIAGE_PRIORITIES };
