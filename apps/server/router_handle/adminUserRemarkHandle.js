import pool from '../db/index.js';
import { L, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

export const ADMIN_USER_REMARK_MAX_LENGTH = 80;

export function normalizeAdminUserRemark(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const saveAdminUserRemark = async (req, res) => {
  try {
    // 备注属于当前普通管理会话中的 Root。管理员预览上下文不能读取或改写这份私有数据。
    if (req.user?.role !== 'root' || req.adminContext) {
      return res.send(
        resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')),
      );
    }

    const adminUserId = String(req.user?.id || '').trim();
    const targetUserId = String(req.body?.targetUserId || '').trim();
    const remarkName = normalizeAdminUserRemark(req.body?.remarkName);
    if (!adminUserId || !targetUserId || targetUserId.length > 255) {
      return res.send(resultData(null, 400, L(req, '用户参数无效', 'Invalid user parameter.')));
    }
    if (Array.from(remarkName).length > ADMIN_USER_REMARK_MAX_LENGTH) {
      return res.send(
        resultData(
          null,
          400,
          L(
            req,
            `备注名不能超过 ${ADMIN_USER_REMARK_MAX_LENGTH} 个字符`,
            `The remark name cannot exceed ${ADMIN_USER_REMARK_MAX_LENGTH} characters.`,
          ),
        ),
      );
    }

    const [targets] = await pool.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [targetUserId]);
    if (!targets.length) {
      return res.send(resultData(null, 404, L(req, '用户不存在', 'User not found.')));
    }

    if (!remarkName) {
      await pool.query('DELETE FROM admin_user_remarks WHERE admin_user_id = ? AND target_user_id = ?', [
        adminUserId,
        targetUserId,
      ]);
    } else {
      await pool.query(
        `INSERT INTO admin_user_remarks (admin_user_id, target_user_id, remark_name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE remark_name = VALUES(remark_name), update_time = CURRENT_TIMESTAMP`,
        [adminUserId, targetUserId, remarkName],
      );
    }

    return res.send(resultData({ targetUserId, adminRemark: remarkName }));
  } catch (error) {
    console.error('[admin-user-remark] 保存失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '保存用户备注失败，请稍后重试', 'Failed to save the user remark.')));
  }
};
