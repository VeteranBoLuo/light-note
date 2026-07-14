import crypto from 'crypto';
import pool from '../db/index.js';

export async function recordAdminContextAudit(entry) {
  if (!entry?.actorUserId || !entry?.action) return;
  try {
    await pool.query(
      `INSERT INTO admin_context_audit
       (id, context_id, actor_user_id, subject_user_id, mode, action, route, method,
        resource_type, result_status, ip, user_agent, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        entry.contextId || null,
        entry.actorUserId,
        entry.subjectUserId || null,
        entry.mode || null,
        entry.action,
        entry.route || null,
        entry.method || null,
        entry.resourceType || null,
        entry.resultStatus ?? null,
        entry.ip || null,
        entry.userAgent || null,
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch (error) {
    // 审计故障不能中断业务，但必须留下服务端日志供运维发现缺表/连接问题。
    console.error('[admin-context] 审计写入失败:', error.message);
  }
}
export function attachAdminContextRequestAudit(req, res) {
  const context = req.adminContext;
  if (!context || req.adminContextAuditAttached) return;
  req.adminContextAuditAttached = true;
  const startedAt = Date.now();
  res.once('finish', () => {
    recordAdminContextAudit({
      contextId: context.id,
      actorUserId: context.actorUserId,
      subjectUserId: context.subjectUserId,
      mode: context.mode,
      action: 'request',
      route: String(req.originalUrl || req.path || '').split('?')[0],
      method: req.method,
      resourceType: req.adminCapability?.resourceType,
      resultStatus: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      meta: {
        policy: req.adminCapability?.policy || 'missing',
        durationMs: Date.now() - startedAt,
      },
    });
  });
}
