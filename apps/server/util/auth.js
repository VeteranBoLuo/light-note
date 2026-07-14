import pool from '../db/index.js';
import { resultData } from './common.js';
import {
  cleanupExpiredSessions,
  cleanupLegacyElevatedVisitorSessions,
  createSession,
  getSession,
  removeSession,
} from './sessionStore.js';
import { recordConversionEvent } from './conversion.js';

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

// 免鉴权的公开接口:带失效 sid 打到这里不算「会话过期」,不设 x-auth-expired 提示头。
// 前缀与后端路由挂载点(baseRouter 的 '/user' + 子路由)一致。改挂载前缀或新增公开接口时须同步。
// 注意:该判断只影响前端「是否弹登录已过期」的提示,不是鉴权边界——session 无效一律降级游客,
// 与本列表无关。匹配放宽是 fail-safe 的(最坏只是本该静默的接口多弹一次提示)。
const AUTH_EXPIRED_SILENT_PATHS = [
  '/user/login',
  '/user/github',
  '/user/registerUser',
  '/user/sendEmail',
  '/user/verifyCode',
];

const shouldMarkAuthExpired = (req) => {
  const path = req.path || req.originalUrl || '';
  // 用 includes 替代 startsWith 兜底:即便将来代理层不再剥离 /api(req.path 变成 /api/user/login),
  // 也能命中静默列表。解除对「代理必须剥离前缀」的隐性依赖。
  // 放宽在这里是安全的:本函数只决定是否设 x-auth-expired 提示头,非鉴权边界(见上方注释)。
  return !AUTH_EXPIRED_SILENT_PATHS.some((item) => path.includes(item));
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
    // 每个请求显式初始化预览上下文，避免下游把普通请求误判为管理员预览。
    req.adminActor = null;
    req.isAdminPreview = false;
    req.isVisitorWorkspace = false;
    req.isVisitorWorkspaceContentWrite = false;

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

    // 权限只信任 user 表中的实时角色。user_sessions.role 仅保留为会话签发时的历史快照，
    // 不能覆盖数据库角色，否则任何能写入/取得高权限 session 的路径都会变成提权入口。
    attachUserToRequest(req, res, user, sid, Number(session.expires_in_seconds || 0));

    // 管理员预览其他用户：保留真实 root 操作者(actor)，再把资源归属身份切换为目标用户(subject)。
    // 后续权限判断可据此区分“谁在操作”和“正在维护谁的数据”，不能只看被切换后的 req.user。
    const previewUserId = req.headers['x-admin-preview-user-id'];
    if (previewUserId && req.user?.role === 'root' && previewUserId !== req.user.id) {
      const actor = { ...req.user };
      const [previewRows] = await pool.query(
        'SELECT id, alias, role, del_flag FROM user WHERE id = ? LIMIT 1',
        [previewUserId],
      );
      if (previewRows[0]) {
        req.adminActor = {
          id: actor.id,
          alias: actor.alias,
          role: actor.role,
          sessionId: actor.sessionId,
        };
        req.isAdminPreview = true;
        req.isVisitorWorkspace = previewRows[0].role === 'visitor';
        req.isVisitorWorkspaceContentWrite =
          req.isVisitorWorkspace && isVisitorWorkspaceContentWrite(req);
        attachUserToRequest(req, res, previewRows[0], actor.sessionId, 0);
        req.user.isBanned = false; // 管理员预览时不触发封禁拦截
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
  '/user/appeal', // 被封禁用户提交申诉(仅此窄接口放行,不开放通用反馈)
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

// 游客展示内容维护的最小写入白名单。
// 只有“真实数据库 root 会话 + 预览目标确为 visitor”时才可能命中；普通游客无法通过伪造请求头进入。
// 云空间、回收站、成长、用户/后台管理、通知、AI 批处理等接口均不在此范围。
const VISITOR_WORKSPACE_CONTENT_WRITE_PATHS = new Set([
  '/bookmark/updateTagSort',
  '/bookmark/addTag',
  '/bookmark/delTag',
  '/bookmark/updateTag',
  '/bookmark/addBookmark',
  '/bookmark/updateBookmark',
  '/bookmark/delBookmark',
  '/bookmark/updateBookmarkSort',
  '/bookmark/toggleBookmarkTop',
  '/common/analyzeImgUrl',
  '/note/uploadImage',
  '/note/updateNote',
  '/note/addNote',
  '/note/delNote',
  '/note/updateNoteSort',
  '/note/addNoteTag',
  '/note/editNoteTag',
  '/note/delNoteTag',
  '/note/updateNoteTags',
  '/note/restoreNoteVersion',
]);

const requestRoutePath = (req) => String(req.originalUrl || req.path || '').split('?')[0];

export const isVisitorWorkspaceContentWrite = (req) => {
  const routePath = requestRoutePath(req);
  return [...VISITOR_WORKSPACE_CONTENT_WRITE_PATHS].some((path) => routePath.endsWith(path));
};

// 游客只读预览守卫：游客（或无身份）执行写操作时，返回 status 'preview' 触发前端注册软引导。
// 注意：必须用 'preview'，不能用 401/403/'visitor'——前端 request.ts 把这些当作会话过期/硬错误，
// 只有 'preview' 才会派发 light-note:preview-blocked 弹注册引导。
// 用法：if (!ensureNotVisitor(req, res)) return; —— 事务函数须放在 pool.getConnection() 之前。
export const ensureNotVisitor = (req, res) => {
  if (req.isAdminPreview) {
    if (
      req.isVisitorWorkspace &&
      req.adminActor?.role === 'root' &&
      isVisitorWorkspaceContentWrite(req)
    ) {
      req.isVisitorWorkspaceContentWrite = true;
      return true;
    }
    res.send(
      resultData(
        null,
        403,
        req.isVisitorWorkspace
          ? '游客维护工作区仅允许编辑书签、笔记和标签。'
          : '管理员用户预览为只读模式，不能修改被预览账号的数据。',
      ),
    );
    return false;
  }
  if (!req.user?.id || req.user.role === 'visitor') {
    recordConversionEvent(req, 'wall_hit', req.path || ''); // 用 req.path(不含 query)避免把 token 等 PII 写进 context
    res.send(resultData(null, 'preview', '预览模式仅支持浏览查看，新建、编辑、删除等操作需要注册。注册后即可拥有你自己的轻笺，免费收藏书签、记笔记、存文件。'));
    return false;
  }
  return true;
};

export const startSessionMaintenance = () => {
  cleanupExpiredSessions().catch((e) => console.error('清理过期登录态失败:', e.message));
  cleanupLegacyElevatedVisitorSessions()
    .then((count) => {
      if (count > 0) console.log(`[session] 已清理 ${count} 个历史游客提权会话`);
    })
    .catch((e) => console.error('清理历史游客提权会话失败:', e.message));
  setInterval(
    () => {
      cleanupExpiredSessions().catch((e) => console.error('清理过期登录态失败:', e.message));
      cleanupLegacyElevatedVisitorSessions().catch((e) =>
        console.error('清理历史游客提权会话失败:', e.message),
      );
    },
    60 * 60 * 1000,
  );
};
