import pool from '../../../db/index.js';

const CACHE_TTL_MS = 15_000;
const cache = new Map();
export const SECURITY_RESTRICTION_TYPES = new Set(['login_lock', 'write_lock', 'upload_lock', 'ai_lock', 'full_lock']);

export const clearSecurityRestrictionCache = (userId = '') => {
  if (userId) cache.delete(String(userId));
  else cache.clear();
};

export const getActiveSecurityRestrictions = async (userId) => {
  if (!userId) return [];
  const key = String(userId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const [rows] = await pool.query(
      `SELECT id, restriction_type, scope_json, reason, expires_at, created_at
       FROM security_account_restrictions
       WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [key],
    );
    const value = rows.map((row) => {
      let scope = {};
      try {
        scope = typeof row.scope_json === 'object' ? row.scope_json || {} : JSON.parse(row.scope_json || '{}');
      } catch {
        scope = {};
      }
      return { ...row, scope };
    });
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    // 安全限制表不可用时不把普通账号误锁死；初始化错误会由启动日志单独暴露。
    return [];
  }
};

const isUploadPath = (path) => /\/file(?:\/|$)/i.test(path);

export const restrictionBlocksRequest = (restrictions, req) => {
  const path = String(req.path || req.originalUrl || '');
  const method = String(req.method || 'GET').toUpperCase();
  const types = new Set((restrictions || []).map((item) => item.restriction_type));
  if (types.has('full_lock') || types.has('login_lock')) return true;
  if (types.has('write_lock') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (types.has('upload_lock') && isUploadPath(path)) return true;
  // AI 已嵌入多个业务模块，无法由请求路径完整识别。ai_lock 在统一 AI Execution
  // 根执行中按身份失败关闭；这里不能误拦只读的旧会话档案和额度查询。
  return false;
};
