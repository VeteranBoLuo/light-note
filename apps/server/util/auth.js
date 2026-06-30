import pool from '../db/index.js';
import { resultData } from './common.js';
import { cleanupExpiredSessions, createSession, getSession, removeSession } from './sessionStore.js';

const COOKIE_NAME = 'sid';
const AUTH_EXPIRED_HEADER = 'X-Auth-Expired';
const AUTH_ROLE_HEADER = 'X-Auth-Role';
const AUTH_EXPIRES_IN_HEADER = 'X-Auth-Expires-In';
const USER_BANNED_HEADER = 'X-User-Banned';
const LOGIN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REMEMBER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const parseCookies = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((cookies, pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return cookies;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
    return cookies;
  }, {});
};

export const getRequestSid = (req) => {
  const cookieSid = parseCookies(req.headers.cookie || '')[COOKIE_NAME] || '';
  if (cookieSid) return cookieSid;
  // 后备：移动端浏览器可能清除 httpOnly cookie，从 X-Session-Id 头读取
  return req.headers['x-session-id'] || '';
};

const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.platform === 'linux',
  sameSite: 'lax',
  path: '/',
  maxAge,
});

export const setAuthCookie = (res, sid, maxAge) => {
  res.cookie(COOKIE_NAME, sid, getCookieOptions(maxAge));
};

export const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, getCookieOptions(0));
};

const markAuthExpired = (res) => {
  res.setHeader(AUTH_EXPIRED_HEADER, '1');
};

const AUTH_EXPIRED_SILENT_PATHS = [
  '/user/login',
  '/user/github',
  '/user/registerUser',
  '/user/sendEmail',
  '/user/verifyCode',
];

const shouldMarkAuthExpired = (req) => {
  const path = req.path || req.originalUrl || '';
  return !AUTH_EXPIRED_SILENT_PATHS.some((item) => path.startsWith(item));
};

export const getSessionMaxAge = (rememberMe) => (rememberMe ? REMEMBER_MAX_AGE_MS : LOGIN_MAX_AGE_MS);

export const issueLoginSession = async (req, res, user, rememberMe = false) => {
  const maxAgeMs = getSessionMaxAge(rememberMe);
  const { sid } = await createSession({
    userId: user.id,
    role: user.role || 'visitor',
    maxAgeMs,
    ip: req.ip || '',
    userAgent: req.headers['user-agent'] || '',
  });
  setAuthCookie(res, sid, maxAgeMs);
  res.removeHeader(AUTH_EXPIRED_HEADER);
  res.setHeader(AUTH_ROLE_HEADER, user.role || 'visitor');
  res.setHeader(AUTH_EXPIRES_IN_HEADER, String(Math.max(1, Math.ceil(maxAgeMs / 1000))));
  return sid;
};

const findVisitorUser = async () => {
  const [rows] = await pool.query(
    `SELECT id, role, del_flag
     FROM user
     WHERE role = ?
     ORDER BY del_flag ASC, create_time ASC
     LIMIT 1`,
    ['visitor'],
  );
  return rows[0] || { id: '', role: 'visitor' };
};

const attachUserToRequest = (req, res, user, sessionId = '', expiresInSeconds = 0) => {
  const role = user.role || 'visitor';
  const isBanned = role !== 'root' && Number(user.del_flag || 0) === 1;
  req.user = {
    id: user.id || '',
    alias: user.alias || '',
    role,
    sessionId,
    isAuthenticated: Boolean(sessionId && user.id && role !== 'visitor'),
    isBanned,
  };
  res.setHeader(AUTH_ROLE_HEADER, req.user.role);
  if (isBanned) {
    res.setHeader(USER_BANNED_HEADER, '1');
  }
  if (req.user.isAuthenticated && expiresInSeconds > 0) {
    res.setHeader(AUTH_EXPIRES_IN_HEADER, String(expiresInSeconds));
  }
  // Compatibility layer for old handlers. New code should use req.user.
  req.headers['x-user-id'] = req.user.id;
  req.headers.role = req.user.role;
};

export const authMiddleware = async (req, res, next) => {
  try {
    const sid = getRequestSid(req);
    if (!sid) {
      attachUserToRequest(req, res, await findVisitorUser());
      return next();
    }

    const session = await getSession(sid);
    if (!session) {
      if (shouldMarkAuthExpired(req)) {
        markAuthExpired(res);
      }
      clearAuthCookie(res);
      attachUserToRequest(req, res, await findVisitorUser());
      return next();
    }

    const [rows] = await pool.query(
      `SELECT id, alias, role, del_flag
       FROM user
       WHERE id = ?
       LIMIT 1`,
      [session.user_id],
    );
    const user = rows[0];
    if (!user) {
      if (shouldMarkAuthExpired(req)) {
        markAuthExpired(res);
      }
      await removeSession(sid);
      clearAuthCookie(res);
      attachUserToRequest(req, res, await findVisitorUser());
      return next();
    }

    attachUserToRequest(req, res, user, sid, Number(session.expires_in_seconds || 0));

    // 管理员预览其他用户：当 root 用户携带 X-Admin-Preview-User-Id 请求头时，切换为对应身份
    const previewUserId = req.headers['x-admin-preview-user-id'];
    if (previewUserId && req.user?.role === 'root' && previewUserId !== req.user.id) {
      const [previewRows] = await pool.query(
        'SELECT id, role, del_flag FROM user WHERE id = ? LIMIT 1',
        [previewUserId],
      );
      if (previewRows[0]) {
        attachUserToRequest(req, res, previewRows[0], req.user.sessionId, 0);
        req.user.isBanned = false; // 管理员预览时不触发封禁拦截
        req.isAdminPreview = true; // 标记为预览模式，供日志中间件等下游使用
      }
    }

    return next();
  } catch (e) {
    console.error('鉴权中间件异常:', e.message);
    attachUserToRequest(req, res, await findVisitorUser());
    return next();
  }
};

const ACCOUNT_BAN_ALLOWED_PATHS = [
  '/user/login',
  '/user/logout',
  '/user/github',
  '/user/registerUser',
  '/user/sendEmail',
  '/user/verifyCode',
  '/user/configPassword',
];

export const accountBanMiddleware = (req, res, next) => {
  if (!req.user?.isBanned) {
    return next();
  }
  const path = req.path || req.originalUrl || '';
  if (ACCOUNT_BAN_ALLOWED_PATHS.some((item) => path.startsWith(item))) {
    return next();
  }
  res.setHeader(USER_BANNED_HEADER, '1');
  return res.status(423).json(resultData(null, 423, '账号已被封禁，请登录其他账号或联系管理员'));
};

export const logoutCurrentSession = async (req, res) => {
  const sid = getRequestSid(req) || req.user?.sessionId;
  if (sid) {
    await removeSession(sid);
  }
  clearAuthCookie(res);
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user?.id || !roles.includes(req.user.role)) {
      return res.send(resultData(null, 403, '没有操作权限'));
    }
    return next();
  };
};

// 游客只读预览守卫：游客（或无身份）执行写操作时，返回 status 'preview' 触发前端注册软引导。
// 注意：必须用 'preview'，不能用 401/403/'visitor'——前端 request.ts 把这些当作会话过期/硬错误，
// 只有 'preview' 才会派发 light-note:preview-blocked 弹注册引导。
// 用法：if (!ensureNotVisitor(req, res)) return; —— 事务函数须放在 pool.getConnection() 之前。
export const ensureNotVisitor = (req, res) => {
  if (!req.user?.id || req.user.role === 'visitor') {
    res.send(resultData(null, 'preview', '预览模式仅支持浏览查看，新建、编辑、删除等操作需要注册。注册后即可拥有你自己的轻笺，免费收藏书签、记笔记、存文件。'));
    return false;
  }
  return true;
};

export const startSessionMaintenance = () => {
  cleanupExpiredSessions().catch((e) => console.error('清理过期登录态失败:', e.message));
  setInterval(
    () => cleanupExpiredSessions().catch((e) => console.error('清理过期登录态失败:', e.message)),
    60 * 60 * 1000,
  );
};
