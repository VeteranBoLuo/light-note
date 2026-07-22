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
import { getAdminContext, getAdminContextMetadata } from './adminContextStore.js';
import { recordAdminContextAudit } from './adminContextAudit.js';

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
  // SECURE_COOKIE=1/0 显式覆盖;未设置时沿用「linux 即生产」的历史约定(脆弱假设,新环境请显式配置)
  secure: process.env.SECURE_COOKIE != null ? process.env.SECURE_COOKIE === '1' : process.platform === 'linux',
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

const rejectAdminContextWithoutActorSession = (res) => {
  return res.status(401).json({
    data: { code: 'ADMIN_CONTEXT_EXPIRED' },
    status: 401,
    msg: '管理员登录会话已失效，请关闭预览后重新进入。',
  });
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
  '/featureRequest/listPublic',
  '/featureRequest/getPublicDetail',
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
    // 新客户端显式传 X-Device-Id；旧客户端复用已有的稳定日志设备标识，平滑升级。
    // 该值只供会话归并，不能参与身份、权限或设备信任判断。
    deviceId: req.headers['x-device-id'] || req.headers['x-log-device-id'] || '',
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
  const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
  const bodyContextToken = requestPath.endsWith('/user/adminContext/end') ? req.body?.contextToken : '';
  const adminContextToken = String(req.headers['x-admin-context'] || bodyContextToken || '').trim();
  try {
    // 每个请求显式初始化预览上下文，避免下游把普通请求误判为管理员预览。
    req.adminActor = null;
    req.isAdminPreview = false;
    req.isVisitorWorkspace = false;
    req.isVisitorWorkspaceContentWrite = false;
    req.adminContext = null;
    req.adminContextToken = '';
    req.billingUser = null;
    req.resourceUser = null;

    const sid = getRequestSid(req);
    if (!sid) {
      // 请求显式携带管理员上下文时必须 fail closed，不能降级为游客后继续读取共享游客数据。
      if (adminContextToken) return rejectAdminContextWithoutActorSession(res);
      attachUserToRequest(req, res, await findVisitorUser());
      return next();
    }

    const session = await getSession(sid);
    if (!session) {
      if (shouldMarkAuthExpired(req)) {
        markAuthExpired(res);
      }
      clearAuthCookie(res);
      if (adminContextToken) return rejectAdminContextWithoutActorSession(res);
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
      if (adminContextToken) return rejectAdminContextWithoutActorSession(res);
      attachUserToRequest(req, res, await findVisitorUser());
      return next();
    }

    // 权限只信任 user 表中的实时角色。user_sessions.role 仅保留为会话签发时的历史快照，
    // 不能覆盖数据库角色，否则任何能写入/取得高权限 session 的路径都会变成提权入口。
    attachUserToRequest(req, res, user, sid, Number(session.expires_in_seconds || 0));

    if (adminContextToken) {
      const actor = { ...req.user };
      const context = await getAdminContext(adminContextToken);
      if (!context) {
        const metadata = await getAdminContextMetadata(adminContextToken);
        if (metadata?.context) {
          const staleContext = metadata.context;
          const belongsToActor =
            actor.role === 'root' && staleContext.actorUserId === actor.id && staleContext.actorSessionId === sid;
          if (!belongsToActor) {
            recordAdminContextAudit({
              contextId: staleContext.id,
              actorUserId: actor.id,
              subjectUserId: staleContext.subjectUserId,
              subjectRole: staleContext.subjectRole,
              mode: staleContext.mode,
              capability: 'admin_context.access',
              action: 'access_denied',
              outcome: 'blocked',
              route: requestPath,
              method: req.method,
              resultStatus: 403,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              meta: { code: 'ADMIN_CONTEXT_FORBIDDEN' },
            });
            return res.status(403).json({
              data: { code: 'ADMIN_CONTEXT_FORBIDDEN' },
              status: 403,
              msg: '管理员预览令牌与当前登录会话不匹配。',
            });
          }
          if (!metadata.expired) {
            return res.status(503).json({
              data: { code: 'ADMIN_CONTEXT_UNAVAILABLE' },
              status: 503,
              msg: '管理员预览上下文暂时不可用，请稍后重试。',
            });
          }
          recordAdminContextAudit({
            contextId: staleContext.id,
            actorUserId: actor.id,
            subjectUserId: staleContext.subjectUserId,
            subjectRole: staleContext.subjectRole,
            mode: staleContext.mode,
            capability: 'admin_context.access',
            action: 'expired',
            outcome: 'expired',
            route: requestPath,
            method: req.method,
            resultStatus: 401,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
        }
        return res.status(401).json({
          data: { code: 'ADMIN_CONTEXT_EXPIRED' },
          status: 401,
          msg: '管理员预览已过期，请关闭后重新进入。',
        });
      }
      if (actor.role !== 'root' || context.actorUserId !== actor.id || context.actorSessionId !== sid) {
        recordAdminContextAudit({
          contextId: context.id,
          actorUserId: actor.id,
          subjectUserId: context.subjectUserId,
          subjectRole: context.subjectRole,
          mode: context.mode,
          capability: 'admin_context.access',
          action: 'access_denied',
          outcome: 'blocked',
          route: requestPath,
          method: req.method,
          resultStatus: 403,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          meta: { code: 'ADMIN_CONTEXT_FORBIDDEN' },
        });
        return res.status(403).json({
          data: { code: 'ADMIN_CONTEXT_FORBIDDEN' },
          status: 403,
          msg: '管理员预览令牌与当前登录会话不匹配。',
        });
      }
      const [subjectRows] = await pool.query('SELECT id, alias, role, del_flag FROM user WHERE id = ? LIMIT 1', [
        context.subjectUserId,
      ]);
      const subject = subjectRows[0];
      if (!subject || subject.role === 'root') {
        recordAdminContextAudit({
          contextId: context.id,
          actorUserId: actor.id,
          subjectUserId: context.subjectUserId,
          subjectRole: context.subjectRole,
          mode: context.mode,
          capability: 'admin_context.access',
          action: 'access_denied',
          outcome: 'blocked',
          route: requestPath,
          method: req.method,
          resultStatus: 404,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          meta: { code: 'ADMIN_CONTEXT_TARGET_MISSING' },
        });
        return res.status(404).json({
          data: { code: 'ADMIN_CONTEXT_TARGET_MISSING' },
          status: 404,
          msg: '管理员预览目标已不存在或不允许访问。',
        });
      }

      req.adminActor = actor;
      req.adminContext = context;
      req.adminContextToken = adminContextToken;
      req.isAdminPreview = true;
      req.isVisitorWorkspace = subject.role === 'visitor' && context.mode === 'maintain';
      req.billingUser = actor;
      req.resourceUser = { id: subject.id, role: subject.role };
      req.suppressUserRewards = true;
      req.suppressConversionTracking = true;
      attachUserToRequest(req, res, subject, actor.sessionId, 0);
      req.user.isBanned = false;
      return next();
    }

    return next();
  } catch (e) {
    console.error('鉴权中间件异常:', e.message);
    if (adminContextToken) {
      return res.status(503).json({
        data: { code: 'ADMIN_CONTEXT_UNAVAILABLE' },
        status: 503,
        msg: '管理员预览上下文暂时不可用，请稍后重试。',
      });
    }
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

// 游客只读预览守卫：游客（或无身份）执行写操作时，返回 status 'preview' 触发前端注册软引导。
// 注意：必须用 'preview'，不能用 401/403/'visitor'——前端 request.ts 把这些当作会话过期/硬错误，
// 只有 'preview' 才会派发 light-note:preview-blocked 弹注册引导。
// 用法：if (!ensureNotVisitor(req, res)) return; —— 事务函数须放在 pool.getConnection() 之前。
export const ensureNotVisitor = (req, res) => {
  if (req.adminContext) {
    if (req.adminContext.mode === 'maintain' && req.adminCapability?.policy === 'content_write') {
      req.isVisitorWorkspaceContentWrite = req.adminContext.subjectRole === 'visitor';
      return true;
    }
    res.status(403).json({
      data: { code: 'ADMIN_PREVIEW_READONLY' },
      status: 403,
      msg: '管理员当前上下文不允许执行该写操作。',
    });
    return false;
  }
  if (!req.user?.id || req.user.role === 'visitor') {
    recordConversionEvent(req, 'wall_hit', req.path || ''); // 用 req.path(不含 query)避免把 token 等 PII 写进 context
    res.send(
      resultData(
        null,
        'preview',
        '预览模式仅支持浏览查看，新建、编辑、删除等操作需要注册。注册后即可拥有你自己的轻笺，免费收藏书签、记笔记、存文件。',
      ),
    );
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
      cleanupLegacyElevatedVisitorSessions().catch((e) => console.error('清理历史游客提权会话失败:', e.message));
    },
    60 * 60 * 1000,
  );
};
