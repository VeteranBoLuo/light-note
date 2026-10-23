import pool from '../db/index.js';
import { resultData } from './agent/data.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
export async function ensureRootRole(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId || req.user.role !== 'root' || req.adminContext) {
      res.send(resultData(null, 403, '无权限操作'));
      return null;
    }
    const [rows] = await pool.query('SELECT role,del_flag FROM user WHERE id=? LIMIT 1', [userId]);
    if (!rows[0] || rows[0].role !== 'root' || Number(rows[0].del_flag || 0) !== 0) {
      res.send(resultData(null, 403, '仅root用户可操作'));
      return null;
    }
    return userId;
  } catch (error) {
    console.error('[root-auth] 身份复核失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '服务器内部错误'));
    return null;
  }
}
