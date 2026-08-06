import pool from '../db/index.js';
import { normalizeMarkdownBlockquoteEntities } from '@lightnote/shared';
import {
  resultData,
  snakeCaseKeys,
  mergeExistingProperties,
  insertData,
  generateUUID,
  L,
  reqLang,
} from '../util/common.js';
import { completeGrowthTask } from '../util/growthTaskCompletion.js';
import request from '../http/request.js';
import { validateQueryParams } from '../util/request.js';
import { fetchGitHubApiJson, fetchGitHubTokenSafely, GitHubOAuthError } from '../util/githubOAuth.js';
import { createNotification } from '../util/notification.js';
import { verifyPassword, hashPassword, validatePassword } from '../util/password.js';
import { sendTrackedEmail } from '../util/emailDelivery.js';
import crypto from 'crypto';
import {
  clearAuthCookie,
  issueLoginSession,
  logoutCurrentSession,
  ensureNotVisitor,
  getRequestSid,
} from '../util/auth.js';
import { recordConversionEvent, normalizeConversionSource } from '../util/conversion.js';
import {
  groupUserSessions,
  removeUserSessions,
  createSession,
  listUserSessions,
  removeSession,
} from '../util/sessionStore.js';
import { getClientIp } from '../util/security/requestContext.js';
import { getIpReputation } from '../util/security/services/ipReputation.js';
import { insertResourceTagRelations, RESOURCE_TYPE } from '../util/resourceTags.js';
import { extractOwnedResourceRefs, syncNoteResourceRefs } from '../util/services/noteReferenceService.js';
import {
  adminContextPublicView,
  AdminContextError,
  createAdminContext,
  revokeAdminContext,
} from '../util/adminContextStore.js';
import { recordAdminContextAudit } from '../util/adminContextAudit.js';
import { isSelfTraffic } from '../util/logExclude.js';
import { sanitizeLogUrl, sanitizeSensitivePayload } from '../util/log.js';
import { buildApiLogSystem } from '../util/apiLogSystem.js';
import { recordServerOperation } from '../util/operationLog.js';
import { inspectBookmarkUrl } from '../util/bookmarkUrl.js';
import { exportAiUserData } from '../util/aiUserDataExport.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { MAX_NOTE_TREE_DEPTH } from '../util/noteTreeConstants.js';
import {
  adminCursorScope,
  adminCursorTime,
  decodeAdminListCursor,
  encodeAdminListCursor,
  isAdminCursorRequest,
  normalizeAdminListLimit,
} from '../util/adminListCursor.js';
import { seedNewUserCloudFile, seedNewUserWorkspaceData } from '../util/services/newUserSeedService.js';
import {
  processAccountDeletionRequest,
  requestAccountDeletion,
  sendAccountDeletionCode,
} from '../util/accountDeletion.js';
import {
  completeGitHubOAuthChallenge,
  consumeGitHubOAuthChallenge,
  createGitHubOAuthChallenge,
  failGitHubOAuthChallenge,
  githubOAuthCookieOptions,
  GITHUB_OAUTH_NONCE_COOKIE,
  readGitHubOAuthNonce,
} from '../util/githubOAuthState.js';
let redisClient;
if (process.platform === 'linux') {
  redisClient = (await import('../util/redisClient.js')).default;
}

const isActiveIpBan = (ipReputation) => {
  const bannedUntil = ipReputation?.banned_until ? new Date(ipReputation.banned_until).getTime() : 0;
  return Number(ipReputation?.is_banned || 0) === 1 && bannedUntil > Date.now();
};

// 邮箱作为账号标识时统一去除首尾空白；服务端兜底，避免绕过前端直接写入“看起来相同”的新账号。
const normalizeEmail = (value) => (typeof value === 'string' ? value.trim() : '');
// 列表头像允许保留较清晰的内嵌图，但不允许把数 MB 的原图带入 50 条首屏响应。
const MAX_INLINE_AVATAR_BYTES = 1024 * 1024;

const queryUserInfoById = async (id) => {
  const [result] = await pool.query(
    `
      SELECT 
        u.*,
        COALESCE(b.bookmark_count, 0) AS bookmarkTotal,
        COALESCE(t.tag_count, 0) AS tagTotal,
        COALESCE(n.note_count, 0) AS noteTotal,
        COALESCE(o.opinion_count, 0) AS opinionTotal,
        COALESCE(op.pending_opinion_count, 0) AS pendingOpinionTotal,
        COALESCE(ou.unread_reply_count, 0) AS unreadOpinionReplyTotal,
        COALESCE(f.storage_used, 0) AS storageUsed
      FROM user u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS bookmark_count
        FROM bookmark
        WHERE del_flag = 0
        GROUP BY user_id
      ) b ON u.id = b.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS tag_count
        FROM tag
        WHERE del_flag = 0
        GROUP BY user_id
      ) t ON u.id = t.user_id
      LEFT JOIN (
        SELECT create_by, COUNT(*) AS note_count
        FROM note
        WHERE del_flag = 0
        GROUP BY create_by
      ) n ON u.id = n.create_by
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS opinion_count
        FROM opinion
        WHERE del_flag = 0
        GROUP BY user_id
      ) o ON u.id = o.user_id
      LEFT JOIN (
        SELECT COUNT(*) AS pending_opinion_count
        FROM opinion
        WHERE del_flag = 0 AND status = 'pending'
      ) op ON 1=1
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS unread_reply_count
        FROM opinion
        WHERE del_flag = 0 AND status = 'replied' AND reply_viewed = 0
        GROUP BY user_id
      ) ou ON u.id = ou.user_id
      LEFT JOIN (
        SELECT create_by, ROUND(SUM(file_size) / 1048576, 2) AS storage_used
        FROM files
        WHERE del_flag = 0
        GROUP BY create_by
      ) f ON u.id = f.create_by
      WHERE u.id = ?
    `,
    [id],
  );
  return result[0] || null;
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const safeUser = { ...user };
  safeUser.password = safeUser.password ? '******' : '';
  return safeUser;
};

export const login = async (req, res) => {
  try {
    const { password, rememberMe } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    const ipReputation = await getIpReputation(getClientIp(req));
    const isIpBanned = isActiveIpBan(ipReputation);
    const [result] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
    if (result.length === 0 || !verifyPassword(password, result[0].password)) {
      if (isIpBanned) {
        res.send(resultData(null, 403, 'IP 已处于封禁期，禁止登录'));
        return;
      }
      res.send(
        resultData(
          null,
          401,
          L(
            req,
            '邮箱密码错误或已过期，请重新输入正确信息或者注册新账号',
            'Incorrect or expired email or password. Please re-enter the correct details or register a new account.',
          ),
        ),
      );
      return;
    }
    const isRootLogin = result[0].role === 'root';
    if (isIpBanned && !isRootLogin) {
      res.send(resultData(null, 403, 'IP 已处于封禁期，禁止登录'));
      return;
    }
    if (Number(result[0].del_flag) === 1 && !isRootLogin) {
      // 被封账号「不登录」:不签发登录会话、不设 cookie(否则进 /home 等接口都会报封禁,等于登录了)。
      // 仅创建一个不落 cookie、30 分钟的短期令牌,供封禁页提交申诉时识别身份(前端只在 /user/appeal
      // 请求里用 X-Session-Id 带上)。该令牌命中任何业务接口都会被 accountBanMiddleware 拦成 423,
      // 只有 /user/appeal 白名单可用,所以拿到它也无法访问任何数据。
      const { sid: appealToken } = await createSession({
        userId: result[0].id,
        role: result[0].role || 'visitor',
        maxAgeMs: 30 * 60 * 1000,
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      });
      res.send(
        resultData(
          { appealToken },
          423,
          L(
            req,
            '账号已被封禁，请登录其他账号或联系管理员',
            'This account has been banned. Please sign in with another account or contact an administrator.',
          ),
        ),
      );
      return;
    }
    // 透明升级：老明文密码 → scrypt 哈希
    if (result[0].password_method === 'plain' && result[0].password) {
      const upgradedHash = hashPassword(result[0].password);
      pool
        .query("UPDATE user SET password = ?, password_method = 'scrypt' WHERE id = ?", [upgradedHash, result[0].id])
        .catch((e) => console.warn('[auth] 明文密码透明升级失败 code=%s', stableAgentErrorCode(e))); // 非关键,留痕不阻断
    }
    const sid = await issueLoginSession(req, res, result[0], Boolean(rememberMe));
    const userInfo = await queryUserInfoById(result[0].id);
    res.send(resultData({ ...sanitizeUser(userInfo), sid }));
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常：', 'Bad request: ') + e.message));
  }
};

// 被封禁用户提交申诉(白名单接口 /user/appeal):服务端强制 type='封禁申诉',只取 content/phone 并限长,
// 复用 opinion(意见反馈)表 → 申诉即反馈的一类,root 在反馈历史里可见并回复。
// 不给通用反馈接口 recordOpinion 开白名单,避免被封用户获得任意写入口(越权)。
export const submitAppeal = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role === 'visitor') {
      return res.send(resultData(null, 403, L(req, '请先登录', 'Please sign in first.')));
    }
    const content = String(req.body?.content || '')
      .trim()
      .slice(0, 500);
    const phone = String(req.body?.phone || '')
      .trim()
      .slice(0, 50);
    if (!content) {
      return res.send(resultData(null, 400, L(req, '请填写申诉内容', 'Please enter your appeal details.')));
    }
    // 防刷:同一用户未处理(pending)的申诉不超过 5 条
    const [pendingRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM opinion WHERE user_id = ? AND type = '封禁申诉' AND status = 'pending' AND del_flag = '0'",
      [userId],
    );
    if (Number(pendingRows[0]?.c || 0) >= 5) {
      return res.send(
        resultData(
          null,
          429,
          L(
            req,
            '已有多条申诉待处理，请耐心等待管理员回复',
            'You already have several pending appeals. Please wait for an administrator to reply.',
          ),
        ),
      );
    }
    const params = insertData({
      userId,
      type: '封禁申诉', // 服务端强制,作为「申诉」类型标记,与普通反馈区分
      content,
      phone,
      status: 'pending',
      replyViewed: 0,
    });
    await pool.query('INSERT INTO opinion SET ?', [params]);
    await recordServerOperation(req, {
      module: '账号安全',
      operation: '提交封禁申诉成功',
    }).catch((error) => console.warn('记录封禁申诉操作失败:', error.message));
    res.send(
      resultData(
        L(req, '申诉已提交，我们会尽快处理', 'Your appeal has been submitted. We will handle it as soon as possible.'),
      ),
    );
  } catch (err) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message));
  }
};

// 注册默认语言优先使用前端 X-Lang，缺失时回退浏览器 Accept-Language。
function detectLangFromReq(req) {
  return reqLang(req);
}

// 注册欢迎通知:全员群发通知只发给存量用户,后期注册的用户收不到历史通知,靠这条兜底给新用户一条起始通知
function buildWelcomeNotification(lang, samplesReady = true) {
  if (lang === 'en-US') {
    return {
      type: 'welcome',
      title: 'Welcome to Light Note 🎉',
      content: samplesReady
        ? 'Great to have you here! A few editable examples are ready to show how bookmarks, notes, files, and tags work together. Open the menu on the left, make them your own, or delete anything you do not need.'
        : 'Great to have you here! Save bookmarks, jot down notes, upload files, and connect them with tags. Open the menu on the left and create your first item whenever you are ready.',
    };
  }
  return {
    type: 'welcome',
    title: '欢迎加入轻笺 🎉',
    content: samplesReady
      ? '很高兴见到你！账号里已经准备了少量可编辑、可删除的示例内容，帮助你了解书签、笔记、文件和标签如何配合使用。点开左侧菜单，把它们改成自己的内容吧。'
      : '很高兴见到你！在这里可以收藏书签、记录笔记、上传文件，并用标签把它们串起来。点开左侧菜单，从第一条内容开始整理吧。',
  };
}

async function initializeNewUserSamples(userId, req) {
  const lang = detectLangFromReq(req);
  let seedResult;
  try {
    seedResult = await seedNewUserWorkspaceData({ userId, lang });
  } catch (error) {
    console.warn('[register] 示例数据初始化失败 code=%s', stableAgentErrorCode(error));
    return false;
  }

  // 云文件包含真实 OBS 对象，异步完成以免网络波动拖慢或阻断注册；对象成功后才写 files 记录。
  void seedNewUserCloudFile({ userId, lang, folderId: seedResult.folderId }).catch((error) =>
    console.warn('[register] 示例云文件初始化失败 code=%s', stableAgentErrorCode(error)),
  );
  return true;
}

export const registerUser = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    // 注册来源(前端透传,仅作转化 context):走白名单归一,非法/脏值降级 unknown
    const signupSource = normalizeConversionSource(req.body?.signupSource);
    if (!email) {
      recordConversionEvent(req, 'signup_failed', 'invalid_email');
      return res.send(resultData(null, 400, L(req, '邮箱不能为空', 'Email is required.')));
    }
    // 检查邮箱是否已存在
    const [existingUser] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
    if (existingUser?.length > 0) {
      // 「账号已存在」是可预期的用户输入错误,不是服务端异常:返回 409(原 500 会污染错误率)。
      // context 只存标准原因码,不拼 source —— 失败原因与来源归因是两个维度,不混在一个字段
      recordConversionEvent(req, 'signup_failed', 'email_exists');
      return res.send(resultData(null, 409, L(req, '账号已存在', 'Account already exists.')));
    }
    // 后端密码校验(前端规则可绕过,后端为准):非空、6-64 位
    const pwdCheck = validatePassword(req.body.password, reqLang(req));
    if (!pwdCheck.ok) {
      recordConversionEvent(req, 'signup_failed', 'weak_password');
      return res.send(resultData(null, 400, pwdCheck.msg));
    }

    // 准备用户数据(字段白名单:绝不接受客户端传入的 role/del_flag/github_id 等,
    // 否则 POST {role:'root'} 就能自助注册成管理员越权提权)
    // 昵称(alias)可选:前端非空则 trim + 限长采用,留空统一用「默认昵称」(仍走字段白名单,不接受 role/del_flag 等越权字段)
    const rawAlias = typeof req.body?.alias === 'string' ? req.body.alias.trim() : '';
    const params = {
      email,
      password: req.body.password,
      role: 'user', // 角色服务端强制写死,不信任客户端
      alias: rawAlias ? rawAlias.slice(0, 20) : L(req, '默认昵称', 'Default Nickname'),
    };
    // homePage 默认 'bookmark'：新用户注册后（及以后登录）直接进入书签工作区。
    // 公开官网固定使用根路径 /，不再作为应用内默认首页选项。
    params.preferences = JSON.stringify({
      theme: 'day',
      noteViewMode: 'card',
      noteSidebarMode: 'directory',
      homePage: 'bookmark',
      lang: detectLangFromReq(req),
    });
    if (params.password) {
      params.password = hashPassword(params.password);
      params.password_method = 'scrypt';
    }

    // 插入新用户。并发双注册竞态兜底:SELECT 预检后两个请求仍可能同时 INSERT,
    // 靠 email 唯一索引报重复(索引见 migrations/20260722_user_email_unique.sql,需线上确认执行)
    const userData = insertData(params);
    try {
      await pool.query('INSERT INTO user SET ?', [userData]);
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        recordConversionEvent(req, 'signup_failed', 'email_exists');
        return res.send(resultData(null, 409, L(req, '账号已存在', 'Account already exists.')));
      }
      throw e;
    }
    const userId = userData.id;

    // 数据库示例在短事务内同步完成，注册响应前即可看到；失败降级为空账号，不反向删除已创建用户。
    const samplesReady = await initializeNewUserSamples(userId, req);

    // 欢迎通知(fire-and-forget:失败绝不影响注册主流程)
    createNotification(userId, buildWelcomeNotification(detectLangFromReq(req), samplesReady)).catch((e) =>
      console.warn('[register] 欢迎通知发送失败 code=%s', stableAgentErrorCode(e)),
    );

    // 记录日志（非关键，失败不影响注册）。注册路由手动写 api_logs，
    // 不经过全局请求日志中间件，因此必须在这里单独应用自有流量白名单。
    if (!isSelfTraffic(req)) {
      try {
        const system = JSON.stringify(
          buildApiLogSystem(req, {
            fingerprint: req.headers['fingerprint'] ?? '未知',
          }),
        );
        // 注册 body 含明文密码,落 api_logs 前必须脱敏(与全局日志中间件同一套规则)
        const requestPayload = JSON.stringify(sanitizeSensitivePayload(req.method === 'GET' ? req.query : req.body));
        const log = {
          userId: userId,
          method: req.method,
          url: sanitizeLogUrl(req.originalUrl),
          req: requestPayload === '{}' ? '' : requestPayload,
          ip: getClientIp(req) || '未知',
          system: system,
          del_flag: 0,
        };
        await pool.query('INSERT INTO api_logs SET ?', [insertData(log)]);
      } catch (err) {
        console.error('[register] 注册日志写入失败 code=%s', stableAgentErrorCode(err));
      }
    }

    // 注册即登录:签发会话,前端直接进入已经准备好少量示例内容的工作区
    const userInfo = await queryUserInfoById(userId);
    const sid = await issueLoginSession(req, res, userInfo, Boolean(req.body.rememberMe));
    recordConversionEvent(req, 'register', signupSource, { userId, visitorType: 'user' });
    res.send(resultData({ ...sanitizeUser(userInfo), sid }));
  } catch (err) {
    console.error('[register] 注册失败 code=%s', stableAgentErrorCode(err));
    recordConversionEvent(req, 'signup_failed', 'server_error'); // 不可预期异常也记失败,便于观察真实注册失败(返回文案不暴露异常对象)
    res.send(resultData(null, 500, L(req, '注册失败，请稍后重试', 'Registration failed. Please try again later.')));
  }
};
export const getUserInfo = async (req, res) => {
  try {
    const requestedId = req.query?.id || req.query?.params?.id;
    const id = req.user?.role === 'root' && requestedId ? requestedId : req.user?.id;
    if (!id) {
      res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
      return;
    }
    const [userRes] = await pool.query('SELECT * FROM user WHERE id = ?', [id]);
    if (!userRes[0]) {
      res.send(resultData(null, 401, L(req, '用户不存在,请重新登录！', 'User not found. Please sign in again.')));
      return;
    }
    // 没有储存ip或者ip地址改变，则更新用户ip相关信息
    const clientIp = getClientIp(req);
    // 管理员预览/游客维护时，请求 IP 属于真实管理员，不能覆盖到被预览账号。
    if (!req.isAdminPreview && clientIp && (userRes[0].ip === null || userRes[0].ip !== clientIp)) {
      const { data } = await request.get(
        `https://restapi.amap.com/v3/ip?ip=${clientIp}&key=${process.env.AMAP_API_KEY}`,
      );
      const location = {
        city: data.city ?? '接口错误，获取失败',
        province: data.province ?? '接口错误，获取失败',
        rectangle: data.rectangle ?? '接口错误，获取失败',
      };
      try {
        await pool.query('update user set location=? , ip=? where id=?', [JSON.stringify(location), clientIp, id]);
      } catch (e) {
        console.error('地理信息配置失败:', e.message);
        // 不发送响应，继续执行获取用户信息
      }
    }
    const result = await queryUserInfoById(id);
    if (!result) {
      res.send(resultData(null, 401, L(req, '用户不存在,请重新登录！', 'User not found. Please sign in again.')));
      return;
    }
    if (Number(result.del_flag) === 1 && result.role !== 'root') {
      res.send(
        resultData(
          null,
          423,
          L(
            req,
            '账号已被封禁，请登录其他账号或联系管理员',
            'This account has been banned. Please sign in with another account or contact an administrator.',
          ),
        ),
      );
      return;
    }
    const safeUser = sanitizeUser(result);
    safeUser.adminPreview = Boolean(req.isAdminPreview);
    safeUser.visitorWorkspace = Boolean(req.isVisitorWorkspace);
    safeUser.adminContext = adminContextPublicView(req.adminContext);
    // 普通游客仍返回 visitor 状态触发只读引导；真实 root 打开的游客维护工作区视为有效管理上下文，
    // 返回 200，避免前端因本机“曾登录过”而误弹登录框。
    if (safeUser.role === 'visitor' && !req.adminContext && !req.isVisitorWorkspace) {
      res.send(resultData(safeUser, 'visitor'));
    } else {
      res.send(resultData(safeUser));
    }
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常', 'Bad request: ') + e)); // 设置状态码为400
  }
};

export const me = getUserInfo;

export const startAdminContext = async (req, res) => {
  try {
    const actor = req.user;
    const subjectUserId = String(req.body?.targetUserId || '').trim();
    const mode = String(req.body?.mode || 'readonly').trim();
    const result = await createAdminContext({
      actor,
      actorSessionId: getRequestSid(req),
      subjectUserId,
      mode,
    });
    recordAdminContextAudit({
      contextId: result.context.id,
      actorUserId: actor.id,
      subjectUserId,
      subjectRole: result.context.subjectRole,
      mode,
      capability: 'admin_context.start',
      action: 'start',
      outcome: 'allowed',
      route: req.originalUrl,
      method: req.method,
      resultStatus: 200,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const publicContext = adminContextPublicView(result.context);
    res.send(
      resultData({
        contextToken: result.token,
        ttlSeconds: result.ttlSeconds,
        mode: publicContext.mode,
        target: {
          id: publicContext.subjectUserId,
          alias: publicContext.subjectAlias,
          role: publicContext.subjectRole,
        },
        expiresAt: publicContext.expiresAt,
        capabilities: publicContext.capabilities,
        context: publicContext,
      }),
    );
  } catch (error) {
    const status = error instanceof AdminContextError ? error.status : 500;
    const code = error instanceof AdminContextError ? error.code : 'ADMIN_CONTEXT_START_FAILED';
    if (!(error instanceof AdminContextError)) {
      console.error('[admin-context] 开启失败:', error.message);
    }
    recordAdminContextAudit({
      actorUserId: req.user?.id || null,
      subjectUserId: String(req.body?.targetUserId || '').trim() || null,
      mode: String(req.body?.mode || 'readonly').trim(),
      capability: 'admin_context.start',
      action: 'start_denied',
      outcome: status >= 500 ? 'failed' : 'blocked',
      route: req.originalUrl,
      method: req.method,
      resultStatus: status,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      meta: { code },
    });
    const msg = error instanceof AdminContextError ? error.message : '管理员预览开启失败，请稍后重试。';
    res.status(status).json({ data: { code }, status, msg });
  }
};

export const getAdminContextStatus = async (req, res) => {
  if (!req.adminContext || !req.adminActor) {
    return res.status(401).json({
      data: { code: 'ADMIN_CONTEXT_EXPIRED' },
      status: 401,
      msg: '管理员预览已过期。',
    });
  }
  return res.send(resultData({ context: adminContextPublicView(req.adminContext) }));
};

export const endAdminContext = async (req, res) => {
  if (!req.adminContext || !req.adminActor || !req.adminContextToken) {
    return res.status(401).json({
      data: { code: 'ADMIN_CONTEXT_EXPIRED' },
      status: 401,
      msg: '管理员预览已过期。',
    });
  }
  const context = req.adminContext;
  const actor = req.adminActor;
  await revokeAdminContext(req.adminContextToken);
  recordAdminContextAudit({
    contextId: context.id,
    actorUserId: actor.id,
    subjectUserId: context.subjectUserId,
    subjectRole: context.subjectRole,
    mode: context.mode,
    capability: 'admin_context.end',
    action: 'end',
    outcome: 'allowed',
    route: req.originalUrl,
    method: req.method,
    resultStatus: 200,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return res.send(resultData({ ended: true }));
};
export const getUserList = async (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(
        resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')),
      );
    }
    const cursorMode = isAdminCursorRequest(req.body);
    const legacy = cursorMode ? null : validateQueryParams(req.body);
    const filters = snakeCaseKeys(req.body?.filters || legacy?.filters || {});
    const key = String(filters?.key || '')
      .trim()
      .slice(0, 200);
    const pageSize = cursorMode ? normalizeAdminListLimit(req.body?.limit) : legacy.pageSize;
    const currentPage = cursorMode ? 1 : legacy.currentPage;
    const skip = cursorMode ? 0 : pageSize * (currentPage - 1);
    const requestedSort = req.body?.sort || {};
    const sortField = requestedSort.field === 'lastActiveTime' ? 'lastActiveTime' : 'createTime';
    const sortOrder = String(requestedSort.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sortColumn = sortField === 'lastActiveTime' ? 'u.last_active_time' : 'u.create_time';
    const direction = sortOrder.toUpperCase();
    const operator = sortOrder === 'asc' ? '>' : '<';
    const scope = adminCursorScope('users', [key, sortField, sortOrder]);
    const cursor = cursorMode ? decodeAdminListCursor(req.body?.cursor, scope) : null;
    const cursorFilter = cursor
      ? ` AND (${sortColumn} ${operator} ? OR (${sortColumn} = ? AND u.id ${operator} ?))`
      : '';
    const cursorParams = cursor
      ? [new Date(adminCursorTime(cursor.value)), new Date(adminCursorTime(cursor.value)), cursor.id]
      : [];
    const take = cursorMode ? pageSize + 1 : pageSize;
    // 用户列表头像只用于 30px 左右的缩略展示，不能把历史 Base64 原图带进排序接口。
    // 外部头像地址保留；较大的内嵌头像交给列表使用默认头像，详情接口仍保留完整头像。
    const [rows] = await pool.query(
      `SELECT u.id, u.alias, u.email,
              CASE
                WHEN u.head_picture LIKE 'http://%' OR u.head_picture LIKE 'https://%' THEN u.head_picture
                WHEN OCTET_LENGTH(u.head_picture) <= ${MAX_INLINE_AVATAR_BYTES} THEN u.head_picture
                ELSE NULL
              END AS head_picture,
              u.phone_number, u.role, u.ip,
              u.create_time, u.last_active_time, u.del_flag
       FROM user u
       WHERE u.del_flag = 0
         AND (u.alias LIKE CONCAT('%', ?, '%') OR u.email LIKE CONCAT('%', ?, '%'))${cursorFilter}
       ORDER BY ${sortColumn} ${direction}, u.id ${direction}
       LIMIT ?${cursorMode ? '' : ' OFFSET ?'}`,
      [key, key, ...cursorParams, take, ...(cursorMode ? [] : [skip])],
    );
    const hasMore = cursorMode && rows.length > pageSize;
    const page = cursorMode ? rows.slice(0, pageSize) : rows;
    const ids = page.map((row) => row.id).filter(Boolean);

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(', ');
      const [[bookmarks], [tags], [notes], [files]] = await Promise.all([
        pool.query(
          `SELECT user_id AS userId, COUNT(*) AS total FROM bookmark WHERE del_flag = 0 AND user_id IN (${placeholders}) GROUP BY user_id`,
          ids,
        ),
        pool.query(
          `SELECT user_id AS userId, COUNT(*) AS total FROM tag WHERE del_flag = 0 AND user_id IN (${placeholders}) GROUP BY user_id`,
          ids,
        ),
        pool.query(
          `SELECT create_by AS userId, COUNT(*) AS total FROM note WHERE del_flag = 0 AND create_by IN (${placeholders}) GROUP BY create_by`,
          ids,
        ),
        pool.query(
          `SELECT create_by AS userId, ROUND(SUM(file_size) / 1048576, 2) AS total FROM files WHERE del_flag = 0 AND create_by IN (${placeholders}) GROUP BY create_by`,
          ids,
        ),
      ]);
      const asMap = (values) => new Map(values.map((value) => [value.userId, Number(value.total || 0)]));
      const bookmarkMap = asMap(bookmarks);
      const tagMap = asMap(tags);
      const noteMap = asMap(notes);
      const fileMap = asMap(files);
      page.forEach((row) => {
        row.bookmarkTotal = bookmarkMap.get(row.id) || 0;
        row.tagTotal = tagMap.get(row.id) || 0;
        row.noteTotal = noteMap.get(row.id) || 0;
        row.storageUsed = fileMap.get(row.id) || 0;
      });
    }

    let total;
    if (!cursorMode || !cursor) {
      const [totalRes] = await pool.query(
        "SELECT COUNT(*) AS total FROM user WHERE del_flag = 0 AND (alias LIKE CONCAT('%', ?, '%') OR email LIKE CONCAT('%', ?, '%'))",
        [key, key],
      );
      total = Number(totalRes[0].total || 0);
    }
    const last = page[page.length - 1];
    const cursorValue = last?.[sortField === 'lastActiveTime' ? 'last_active_time' : 'create_time'];
    return res.send(
      resultData({
        items: page,
        total,
        hasMore,
        nextCursor:
          cursorMode && hasMore && last
            ? encodeAdminListCursor(scope, { value: adminCursorTime(cursorValue), id: last.id })
            : null,
      }),
    );
  } catch (e) {
    const status = e?.code === 'ADMIN_LIST_CURSOR_INVALID' ? 400 : 500;
    console.error('[admin-list] 用户列表查询失败 code=%s', stableAgentErrorCode(e));
    return res.send(
      resultData(
        null,
        status,
        status === 400 ? L(req, '查询游标无效', 'Invalid cursor') : L(req, '用户列表查询失败', 'Failed to query users'),
      ),
    );
  }
};

export const saveUserInfo = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const targetId = req.body.id || req.user?.id;
    const isRoot = req.user?.role === 'root';
    const id = isRoot ? targetId : req.user?.id;
    if (!id || (!isRoot && req.body.id && req.body.id !== req.user?.id)) {
      return res.send(
        resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')),
      );
    }
    // 定义允许更新的字段列表
    const selfAllowedFields = ['alias', 'email', 'phone_number', 'location', 'preferences', 'head_picture'];
    const rootAllowedFields = [
      ...selfAllowedFields,
      // 注:不含 password —— 编辑弹框直接改 password 会明文写库、绕过 scrypt,导致该用户登录失败。
      // 改密码请走 configPassword(scrypt 加密),不在此表单改。
      'role',
      'ip',
      'del_flag',
      'github_id',
      'login_type',
    ];
    const allowedFields = isRoot ? rootAllowedFields : selfAllowedFields;
    // 过滤请求体，只保留允许的字段
    const filteredBody = snakeCaseKeys(mergeExistingProperties(req.body, [], ['id']));
    const finalBody = {};
    allowedFields.forEach((field) => {
      if (filteredBody[field] !== undefined) {
        finalBody[field] = filteredBody[field];
      }
    });
    const submittedHeadPicture = typeof finalBody.head_picture === 'string' ? finalBody.head_picture.trim() : '';
    if (
      /^data:image\//i.test(submittedHeadPicture) &&
      Buffer.byteLength(submittedHeadPicture, 'utf8') > MAX_INLINE_AVATAR_BYTES
    ) {
      // 兼容旧客户端编辑昵称时原样带回历史大头像：相同内容视为未变更，不重复写入；新大图直接拒绝。
      const submittedDigest = crypto.createHash('sha256').update(submittedHeadPicture).digest('hex');
      const [[existingAvatar]] = await pool.query('SELECT SHA2(head_picture, 256) AS digest FROM user WHERE id = ?', [
        id,
      ]);
      if (existingAvatar?.digest === submittedDigest) {
        delete finalBody.head_picture;
      } else {
        return res.send(
          resultData(
            null,
            413,
            L(req, '头像图片过大，请压缩后再上传', 'Avatar image is too large. Please compress it before uploading.'),
          ),
        );
      }
    }
    if (!Object.keys(finalBody).length) {
      return res.send(resultData({ affectedRows: 0 }));
    }
    if (typeof finalBody.email === 'string') {
      finalBody.email = normalizeEmail(finalBody.email);
    }
    const [result] = await pool.query('update user set ? where id=?', [finalBody, id]);

    // “完善个人形象”只认真实头像，不把昵称更新与成长任务重复计算。
    // 在响应前等待达成状态写入，确保关闭资料弹窗后立即刷新成长任务时不会读到旧状态；
    // 普通用户达成后仍须在成长任务卡片主动领取经验；root 只收口状态，不进入经验账本。
    const headPicture = typeof finalBody.head_picture === 'string' ? finalBody.head_picture.trim() : '';
    if (headPicture) {
      try {
        await completeGrowthTask(id, 'profile_avatar', { userRole: req.user?.role });
      } catch (error) {
        console.warn('[growth] 头像成长任务状态同步失败 code=%s', stableAgentErrorCode(error));
      }
    }

    return res.send(resultData(result));
  } catch (e) {
    console.error('[user] 保存个人信息失败 code=%s', String(e?.code || 'SAVE_USER_INFO_FAILED'));
    return res.send(resultData(null, 500, L(req, '保存个人信息失败，请稍后重试', 'Failed to save profile')));
  }
};

export const deleteUserById = (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(
        resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')),
      );
    }
    pool
      .query('update user set del_flag=1 where id=?', [req.query.id])
      .then(async ([result]) => {
        await removeUserSessions(req.query.id);
        res.send(resultData(result));
      })
      .catch((err) => res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)));
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常：', 'Bad request: ') + e)); // 设置状态码为400
  }
};

export const startGithubOAuth = async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const challenge = await createGitHubOAuthChallenge({
      consentVersion: req.body?.consentVersion,
      flow: req.body?.flow,
      signupSource: req.body?.signupSource,
    });
    res.cookie(GITHUB_OAUTH_NONCE_COOKIE, challenge.nonce, githubOAuthCookieOptions());
    return res.send(
      resultData({
        authorizationUrl: challenge.authorizationUrl,
        expiresIn: challenge.expiresIn,
      }),
    );
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) {
      console.error(
        '[github-oauth] start failed requestId=%s stage=CHALLENGE_CREATE code=%s',
        requestId,
        String(error?.code || 'GITHUB_OAUTH_START_FAILED'),
      );
    }
    return res.send(
      resultData(
        { code: String(error?.code || 'GITHUB_OAUTH_START_FAILED'), requestId },
        status,
        status < 500 ? error.message : L(req, 'GitHub 登录暂不可用，请使用邮箱登录', 'GitHub sign-in is unavailable.'),
      ),
    );
  }
};

export const github = async (req, res) => {
  const { code, state } = req.body || {};
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'CALLBACK_VALIDATE';
  let challengeClaimed = false;
  let challengeCompleted = false;
  if (typeof code !== 'string' || typeof state !== 'string' || !code.trim() || !state.trim()) {
    res.clearCookie(GITHUB_OAUTH_NONCE_COOKIE, githubOAuthCookieOptions(0));
    return res.send(
      resultData(
        { code: 'GITHUB_OAUTH_CALLBACK_INVALID', requestId },
        400,
        L(req, 'GitHub 授权参数不完整，请重新发起登录', 'GitHub authorization data is incomplete.'),
      ),
    );
  }

  try {
    const nonce = readGitHubOAuthNonce(req);
    stage = 'STATE_VALIDATE';
    const consent = await consumeGitHubOAuthChallenge({ state, nonce, code });
    req.body.signupSource = consent.signupSource;

    let user;
    let githubUser = null;
    let tokenRoute = null;
    if (consent.recovered) {
      stage = 'ACCOUNT_RECOVER';
      const [users] = await pool.query('SELECT * FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [consent.userId]);
      user = users[0];
      if (!user) {
        throw new GitHubOAuthError('GITHUB_OAUTH_RECOVERY_USER_MISSING', 'GitHub 登录恢复记录已失效', {
          stage,
          status: 400,
        });
      }
      challengeCompleted = true;
    } else {
      challengeClaimed = true;
      stage = 'TOKEN_EXCHANGE';
      const tokenData = await fetchGitHubToken(code, {
        codeVerifier: consent.codeVerifier,
        redirectUri: consent.redirectUri,
      });
      tokenRoute = tokenData.route;

      stage = 'PROFILE_FETCH';
      const [baseUser, email] = await Promise.all([
        getGitHubUser(tokenData.access_token),
        getGitHubEmail(tokenData.access_token),
      ]);
      const safeEmail = normalizeEmail(email) || `${baseUser.login}@users.noreply.github.com`;
      githubUser = { ...baseUser, email: safeEmail, emailMissing: !email };

      stage = 'ACCOUNT_BIND';
      user = await handleUserDatabaseOperation(githubUser, req);
      try {
        challengeCompleted = await completeGitHubOAuthChallenge({ state, code, userId: user.id });
        if (!challengeCompleted) {
          console.warn(
            '[github-oauth] completion cache missed requestId=%s stage=STATE_COMPLETE code=GITHUB_OAUTH_STATE_COMPLETE_MISSED',
            requestId,
          );
        }
      } catch (error) {
        console.warn(
          '[github-oauth] completion cache failed requestId=%s stage=STATE_COMPLETE code=%s',
          requestId,
          String(error?.code || 'GITHUB_OAUTH_STATE_COMPLETE_FAILED'),
        );
      }
    }

    stage = 'SESSION_ISSUE';
    const sid = await issueLoginSession(req, res, user, true);
    // 成功后保留短时 nonce Cookie 到原 TTL：若响应正文在途中丢失，浏览器可凭 completed 状态恢复本站会话。
    // 新一轮 OAuth 会覆盖该随机 Cookie，Redis 完成记录则会在 5 分钟后先行失效。
    await recordServerOperation(req, {
      module: '账号与隐私',
      operation: `GitHub 跨境授权同意【${consent.consentVersion}/${consent.flow}】`,
      userId: user.id,
    }).catch((error) => console.warn('[github-oauth] consent audit failed code=%s', stableAgentErrorCode(error)));

    console.info(
      '[github-oauth] callback success requestId=%s stage=COMPLETED elapsedMs=%d recovered=%s route=%s routeLatencyMs=%s',
      requestId,
      Date.now() - startedAt,
      consent.recovered ? '1' : '0',
      tokenRoute?.ip || '-',
      tokenRoute?.latencyMs ?? '-',
    );
    return res.send(
      resultData({
        ...{ sid },
        requestId,
        user_info: {
          id: user.id,
          alias: user.alias,
          head_picture: user.head_picture,
          role: user.role ?? 'user',
        },
        requires_email: Boolean(githubUser?.emailMissing),
      }),
    );
  } catch (error) {
    const declaredErrorCode = String(error?.code || '');
    const isOAuthDomainError = declaredErrorCode.startsWith('GITHUB_OAUTH_');
    const errorCode = isOAuthDomainError ? declaredErrorCode : `GITHUB_OAUTH_${stage}_FAILED`;
    if (challengeClaimed && !challengeCompleted) {
      await failGitHubOAuthChallenge({ state, code, errorCode }).catch(() => false);
    }
    const retryableLocalCallback =
      errorCode === 'GITHUB_OAUTH_IN_PROGRESS' || (challengeCompleted && stage === 'SESSION_ISSUE');
    if (!retryableLocalCallback) {
      res.clearCookie(GITHUB_OAUTH_NONCE_COOKIE, githubOAuthCookieOptions(0));
    }
    const status = isOAuthDomainError && Number.isInteger(error?.status) ? error.status : 500;
    const logger = status >= 500 ? console.error : console.warn;
    logger(
      '[github-oauth] callback failed requestId=%s stage=%s code=%s upstreamStatus=%s providerCode=%s elapsedMs=%d',
      requestId,
      String(error?.stage || stage),
      errorCode,
      error?.upstreamStatus ?? '-',
      error?.providerCode || '-',
      Date.now() - startedAt,
    );
    const upstreamUnavailable = ['TOKEN_CONNECT', 'TOKEN_EXCHANGE', 'PROFILE_FETCH'].includes(
      String(error?.stage || stage),
    );
    return res.send(
      resultData(
        { code: errorCode, requestId, retryable: retryableLocalCallback },
        status,
        status < 500 && isOAuthDomainError
          ? error.message
          : upstreamUnavailable
            ? L(req, 'GitHub 网络暂时不稳定，请重新授权或使用邮箱登录', 'GitHub is temporarily unreachable.')
            : L(req, 'GitHub 认证失败，请重新授权或使用邮箱登录', 'GitHub authentication failed.'),
      ),
    );
  }
};

export const logout = async (req, res) => {
  try {
    await logoutCurrentSession(req, res);
    res.send(resultData(null, 200, L(req, '退出成功', 'Signed out successfully.')));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '退出登录失败：', 'Logout failed: ') + e.message));
  }
};

function rejectAdminContextAccountDeletion(req, res) {
  if (!req.adminContext) return false;
  res.status(403).json({
    data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' },
    status: 403,
    msg: '管理员预览或代管状态下不能操作账号注销。',
  });
  return true;
}

function sendAccountDeletionError(req, res, error, fallbackMessage) {
  const code = String(error?.code || '');
  const isExpected = code.startsWith('ACCOUNT_');
  const status = isExpected && Number.isInteger(error?.status) ? error.status : 500;
  const msg = isExpected ? error.message : L(req, fallbackMessage, 'The request failed. Please try again later.');
  if (!isExpected) {
    console.error('[account-deletion] request failed code=%s', stableAgentErrorCode(error));
  }
  return res.send(resultData({ code: code || 'ACCOUNT_DELETION_FAILED' }, status, msg));
}

export const requestAccountDeletionCode = async (req, res) => {
  if (rejectAdminContextAccountDeletion(req, res)) return;
  if (!ensureNotVisitor(req, res)) return;
  try {
    const data = await sendAccountDeletionCode({ userId: req.user.id });
    res.send(resultData(data, 200, L(req, '注销验证码已发送', 'Account deletion code sent.')));
  } catch (error) {
    sendAccountDeletionError(req, res, error, '验证码发送失败，请稍后重试');
  }
};

export const deleteMyAccount = async (req, res) => {
  if (rejectAdminContextAccountDeletion(req, res)) return;
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  try {
    const deletion = await requestAccountDeletion({
      userId,
      code: req.body?.code,
      confirmation: req.body?.confirmation,
    });

    // 账号已在事务内停用；这里尽力清掉所有会话缓存并无条件删除当前 cookie。
    // 即便会话存储短暂故障，鉴权每次仍会重读 user 的 deleted/del_flag 状态，不会恢复业务访问。
    await removeUserSessions(userId).catch((error) =>
      console.error('[account-deletion] session cleanup failed code=%s', stableAgentErrorCode(error)),
    );
    clearAuthCookie(res);
    res.send(
      resultData(
        { requestId: deletion.requestId, cleanupStatus: deletion.status },
        200,
        L(req, '账号已注销，云端数据正在安全清理', 'Your account has been deleted. Cloud data cleanup is in progress.'),
      ),
    );

    void processAccountDeletionRequest(deletion.requestId).catch((error) =>
      console.error('[account-deletion] immediate cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  } catch (error) {
    sendAccountDeletionError(req, res, error, '账号注销失败，请稍后重试');
  }
};

// 设备句柄：对外只暴露设备组键的 SHA-256 前 16 位，不把 session ID 或设备摘要交给页面。
const deviceHandle = (groupKey) => crypto.createHash('sha256').update(String(groupKey)).digest('hex').slice(0, 16);

// 登录设备列表：会话是实现细节，页面只按稳定设备标识聚合；历史无标识会话独立展示，避免错误合并。
export const getMySessions = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
  }
  try {
    const currentSid = getRequestSid(req);
    const rows = await listUserSessions(userId);
    const items = groupUserSessions(rows, currentSid).map((group) => ({
      // groupKey 比“最近活跃的 sid”稳定，设备内任一会话活跃都不会让前端刚拿到的句柄失效。
      id: deviceHandle(group.groupKey),
      ip: group.ip || '',
      userAgent: group.user_agent || '',
      createTime: group.create_time,
      lastActiveTime: group.last_active_time,
      current: group.current,
      sessionCount: group.sessionCount,
    }));
    res.send(resultData(items));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + e.message));
  }
};

// 吊销登录设备：body.id=按设备句柄下线一组 session；body.others=true 下线除本机设备组外所有。
// 只在本人会话集合内匹配，天然限权。
export const revokeSession = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
  }
  try {
    const { id, others } = req.body || {};
    const currentSid = getRequestSid(req);
    const rows = await listUserSessions(userId);
    const deviceGroups = groupUserSessions(rows, currentSid);
    let targets = [];
    let targetDeviceCount = 0;
    if (others) {
      const targetGroups = deviceGroups.filter((group) => !group.current);
      targets = targetGroups.flatMap((group) => group.sids);
      targetDeviceCount = targetGroups.length;
    } else {
      const match = deviceGroups.find((group) => deviceHandle(group.groupKey) === id);
      if (!match) return res.send(resultData(null, 400, L(req, '设备不存在', 'Device not found.')));
      if (match.current)
        return res.send(
          resultData(null, 400, L(req, '不能在此下线当前设备,请用退出登录', 'Use sign out for the current device.')),
        );
      targets = match.sids;
      targetDeviceCount = 1;
    }
    for (const sid of [...new Set(targets)]) await removeSession(sid);
    if (targets.length > 0) {
      await recordServerOperation(req, {
        module: '账号安全',
        operation: others ? `下线其他设备成功【${targetDeviceCount}台】` : '下线单个设备成功',
      }).catch((error) => console.warn('记录会话下线操作失败:', error.message));
    }
    res.send(resultData({ revoked: targetDeviceCount, revokedSessions: [...new Set(targets)].length }));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + e.message));
  }
};

// --- 工具函数 ---
const fetchGitHubToken = async (code, { codeVerifier, redirectUri } = {}) => {
  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !codeVerifier || !redirectUri) {
    throw new GitHubOAuthError('GITHUB_OAUTH_NOT_CONFIGURED', 'GitHub 登录配置不完整', {
      stage: 'TOKEN_EXCHANGE',
      status: 503,
    });
  }
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('code', code);
  params.append('redirect_uri', redirectUri);
  params.append('code_verifier', codeVerifier);

  // 先做无副作用的 HTTPS 选路，再且仅再提交一次授权码，避免响应丢失后换 IP 重放 code。
  return fetchGitHubTokenSafely(params.toString());
};

const getGitHubUser = async (accessToken) => {
  const user = await fetchGitHubApiJson('/user', accessToken, { attempts: 3, timeoutMs: 6500 });
  if (!user?.id || !String(user?.login || '').trim()) {
    throw new GitHubOAuthError('GITHUB_OAUTH_PROFILE_INVALID', 'GitHub 用户信息不完整', {
      stage: 'PROFILE_FETCH',
      status: 503,
    });
  }
  return user;
};

const getGitHubEmail = async (accessToken) => {
  try {
    const emails = await fetchGitHubApiJson('/user/emails', accessToken, { attempts: 2, timeoutMs: 5000 });
    if (!Array.isArray(emails)) return null;
    const primaryEmail = emails.find((email) => email?.primary && email?.verified);
    return normalizeEmail(primaryEmail?.email) || null;
  } catch (error) {
    console.warn(
      '[github-oauth] email fetch degraded code=%s',
      String(error?.code || 'GITHUB_OAUTH_EMAIL_UNAVAILABLE'),
    );
    return null;
  }
};

export const handleUserDatabaseOperation = async (githubUser, req, { duplicateRetry = true } = {}) => {
  const safeEmail = normalizeEmail(githubUser.email) || `${githubUser.login}@users.noreply.github.com`;
  const githubId = String(githubUser.id);
  const connection = await pool.getConnection();
  let user;
  let createdUserId = '';
  let shouldRetryDuplicate = false;
  try {
    await connection.beginTransaction();
    const [existingByGithub] = await connection.query(`SELECT * FROM user WHERE github_id = ? LIMIT 1 FOR UPDATE`, [
      githubId,
    ]);
    if (existingByGithub.length > 0) {
      user = existingByGithub[0];
      // 兼容清理历史版本曾分配的固定 GitHub 初始密码；仅在用户再次通过 GitHub 证明身份后轮换。
      if (
        user.login_type === 'github' &&
        typeof user.password === 'string' &&
        user.password &&
        verifyPassword('123456', user.password)
      ) {
        const rotatedPassword = hashPassword(crypto.randomBytes(32).toString('base64url'));
        await connection.query(`UPDATE user SET password = ?, password_method = 'scrypt' WHERE id = ?`, [
          rotatedPassword,
          user.id,
        ]);
        user = { ...user, password: rotatedPassword, password_method: 'scrypt' };
      }
    } else {
      const [existingByEmail] = await connection.query(`SELECT * FROM user WHERE email = ? LIMIT 1 FOR UPDATE`, [
        safeEmail,
      ]);
      if (existingByEmail.length > 0) {
        const existingGithubId = String(existingByEmail[0].github_id || '');
        if (existingGithubId && existingGithubId !== githubId) {
          throw new GitHubOAuthError('GITHUB_OAUTH_EMAIL_CONFLICT', '该邮箱已绑定其他 GitHub 账号，请使用邮箱登录', {
            stage: 'ACCOUNT_BIND',
            status: 409,
          });
        }
        await connection.query(
          `UPDATE user SET github_id = ?, login_type = 'github' WHERE id = ? AND (github_id IS NULL OR github_id = ?)`,
          [githubId, existingByEmail[0].id, githubId],
        );
        const [updatedUser] = await connection.query(`SELECT * FROM user WHERE id = ? LIMIT 1`, [
          existingByEmail[0].id,
        ]);
        user = updatedUser[0];
      } else {
        createdUserId = generateUUID();
        // GitHub 账号没有可用于邮箱登录的初始密码，使用不可预测随机值，用户可在登录后主动设置密码。
        const githubHashedPassword = hashPassword(crypto.randomBytes(32).toString('base64url'));
        const defaultPreferences = JSON.stringify({
          theme: 'day',
          noteViewMode: 'card',
          noteSidebarMode: 'directory',
          homePage: 'bookmark',
          lang: detectLangFromReq(req),
        });
        await connection.query(
          `INSERT INTO user
            (id, email, github_id, login_type, head_picture, password, password_method, alias, role, preferences)
           VALUES (?, ?, ?, 'github', ?, ?, 'scrypt', ?, 'user', ?)`,
          [
            createdUserId,
            safeEmail,
            githubId,
            githubUser.avatar_url,
            githubHashedPassword,
            githubUser.login,
            defaultPreferences,
          ],
        );
        const [createdUsers] = await connection.query(`SELECT * FROM user WHERE id = ? LIMIT 1`, [createdUserId]);
        user = createdUsers[0];
      }
    }
    if (!user?.id) {
      throw new GitHubOAuthError('GITHUB_OAUTH_ACCOUNT_RESULT_INVALID', 'GitHub 账号处理结果异常', {
        stage: 'ACCOUNT_BIND',
        status: 500,
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY' && duplicateRetry) {
      shouldRetryDuplicate = true;
    } else {
      throw error;
    }
  } finally {
    connection.release();
  }

  // 先释放当前连接再重试，避免并发唯一键冲突时占着连接等待连接池中的下一条连接。
  if (shouldRetryDuplicate) {
    return handleUserDatabaseOperation(githubUser, req, { duplicateRetry: false });
  }

  if (!createdUserId) return user;

  // 仅 GitHub 首次建号执行；已有 GitHub 账号登录、按邮箱绑定旧账号都不会重复初始化。
  const samplesReady = await initializeNewUserSamples(createdUserId, req);

  // GitHub 首次注册直接持久化头像，补齐“设置头像”成长任务。示例资源仍由种子服务直写，
  // 不经过资源创建奖励钩子，因此不会推进成长任务、每日/每周任务、经验或成就。
  if (String(githubUser.avatar_url || '').trim()) {
    try {
      await completeGrowthTask(createdUserId, 'profile_avatar', { userRole: 'user' });
    } catch (error) {
      console.warn('[growth] GitHub 头像成长任务补全失败 code=%s', stableAgentErrorCode(error));
    }
  }

  // 转化漏斗:GitHub 新注册也要记 register(邮箱注册在 registerUser 已记),否则漏斗「注册成功」恒为 0
  const ghSignupSource = normalizeConversionSource(req.body?.signupSource); // 前端 GithubCallBack 透传的来源(走白名单归一)
  recordConversionEvent(req, 'register', ghSignupSource, { userId: createdUserId, visitorType: 'user' });

  // 欢迎通知(fire-and-forget):GitHub 新注册与邮箱注册对齐
  createNotification(createdUserId, buildWelcomeNotification(detectLangFromReq(req), samplesReady)).catch((e) =>
    console.warn('[register] GitHub 欢迎通知发送失败 code=%s', stableAgentErrorCode(e)),
  );

  return user;
};

// 修改密码或者设置密码configPassword

export const configPassword = async (req, res) => {
  try {
    const id = req.user?.id; // 获取用户ID
    if (!id || req.user?.role === 'visitor') {
      return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
    }
    const { password, type } = req.body;
    const pwdCheck = validatePassword(password, reqLang(req));
    if (!pwdCheck.ok) {
      return res.send(resultData(null, 400, pwdCheck.msg));
    }
    const [oldUser] = await pool.query(`SELECT * FROM user WHERE id = ? LIMIT 1`, [id]);
    if (type === 'update') {
      const { oldPassword } = req.body;
      if (!verifyPassword(oldPassword, oldUser[0].password)) {
        throw new Error('原密码错误');
      }
      if (verifyPassword(password, oldUser[0].password)) {
        throw new Error('新密码不能与原密码相同');
      }
    }
    const hashedPassword = hashPassword(password);
    pool
      .query('update user set password=?, password_method=? where id=?', [hashedPassword, 'scrypt', id])
      .then(async ([result]) => {
        await recordServerOperation(req, {
          module: '账号安全',
          operation: type === 'update' ? '修改密码成功' : '设置密码成功',
        }).catch((error) => console.warn('记录密码操作失败:', error.message));
        await removeUserSessions(id);
        await logoutCurrentSession(req, res);
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, e.message)); // 设置状态码为400
  }
};

// 发送验证码接口
export const sendEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.send(resultData(null, 400, L(req, '邮箱不能为空', 'Email is required.')));
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6位数字验证码

    // 1. 存储验证码到Redis（5分钟过期）
    await redisClient.setEx(`email:code:${email}`, 300, code);

    // 2. 发送邮件
    await sendTrackedEmail({
      emailType: 'verification',
      userId: req.user?.id && req.user.id !== 'visitor' ? req.user.id : null,
      recipient: email,
      subject: '【轻笺】验证邮件',
      businessType: 'account_verification',
      html: `
        <p>您好！</p>
        <p>您的验证码是：<strong style="color:orangered;">${code}</strong></p>
        <p>有效期5分钟，请勿泄露</p>
        <p>如果不是您本人操作，请无视此邮件</p>
      `,
    });
    res.send(resultData(L(req, '验证码发送成功', 'Verification code sent.')));
  } catch (e) {
    // 原样把 SMTP 内部错误(如 QQ 535 Login fail)抛给用户既不友好也泄露实现;
    // 面向用户给稳定文案,真实错误只进服务端日志便于排查。
    console.error('[email-verification] 发送失败 code=%s', stableAgentErrorCode(e));
    res.send(
      resultData(null, 500, L(req, '验证码发送失败,请稍后重试', 'Failed to send the code. Please try again later.')),
    );
  }
};

// 验证验证码接口
export const verifyCode = async (req, res) => {
  try {
    const { code, password } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.send(resultData(null, 400, L(req, '邮箱不能为空', 'Email is required.')));
    }
    const pwdCheck = validatePassword(password, reqLang(req));
    if (!pwdCheck.ok) {
      return res.send(resultData(null, 400, pwdCheck.msg));
    }

    // 1. 从Redis获取存储的验证码
    const storedCode = await redisClient.get(`email:code:${email}`);

    // 2. 验证逻辑
    if (!storedCode) {
      res.send(
        resultData(null, 400, L(req, '验证码已过期或未发送', 'The verification code has expired or was never sent.')),
      );
      return;
    }
    if (storedCode !== code) {
      res.send(resultData(null, 400, L(req, '验证码错误', 'Incorrect verification code.')));
      return;
    }
    // 3. 验证成功后，确认账号存在，再消费验证码并设置新密码
    const [users] = await pool.query('SELECT id FROM user WHERE email = ? LIMIT 1', [email]);
    if (!users.length) {
      return res.send(resultData(null, 404, L(req, '账号不存在', 'Account not found.')));
    }
    await redisClient.del(`email:code:${email}`);
    const hashedPassword = hashPassword(password);
    await pool.query('update user set password=?, password_method=? where email=?', [hashedPassword, 'scrypt', email]);
    await recordServerOperation(req, {
      module: '账号安全',
      operation: '邮箱验证码重置密码成功',
      userId: users[0].id,
    }).catch((error) => console.warn('记录密码重置操作失败:', error.message));
    res.send(resultData(L(req, '重置密码成功', 'Password reset successfully.')));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '验证服务异常:', 'Verification service error: ') + e.message)); // 设置状态码为400
  }
};

// POST /user/exportData —— 一键导出/备份当前用户全部数据（书签/笔记/文件元信息/标签 + 可移植 AI 数据），前端下成 JSON。
// 仅本人数据(游客拦截);文件只导元信息(名称/大小/时间),不含二进制。
class NoteImportPlanError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NoteImportPlanError';
    this.code = code;
  }
}

const normalizeBackupNoteId = (value) => String(value ?? '').trim() || null;

function buildNoteImportPlan(rawNotes = []) {
  const entries = [];
  const explicitIds = new Set();
  for (const [index, note] of (Array.isArray(rawNotes) ? rawNotes : []).entries()) {
    const explicitId = normalizeBackupNoteId(note?.id);
    if (explicitId && explicitIds.has(explicitId)) throw new NoteImportPlanError('NOTE_IMPORT_DUPLICATE_ID');
    if (explicitId) explicitIds.add(explicitId);
    const sourceId = explicitId || `__legacy_note_${index}`;
    const rawParentId = normalizeBackupNoteId(note?.parentId ?? note?.parent_id);
    const sort = Number(note?.sort);
    entries.push({
      sourceId,
      note,
      parentSourceId: rawParentId,
      sort: Number.isInteger(sort) && sort >= 0 ? sort : 0,
      treeDeleteBatchId:
        normalizeBackupNoteId(note?.treeDeleteBatchId ?? note?.tree_delete_batch_id)?.slice(0, 255) || null,
    });
  }

  const bySourceId = new Map(entries.map((entry) => [entry.sourceId, entry]));
  let missingParentCount = 0;
  for (const entry of entries) {
    if (entry.parentSourceId && !bySourceId.has(entry.parentSourceId)) {
      entry.parentSourceId = null;
      entry.missingParent = true;
      missingParentCount += 1;
    }
  }

  const visiting = new Set();
  const visitedDepth = new Map();
  const resolveDepth = (sourceId) => {
    if (visitedDepth.has(sourceId)) return visitedDepth.get(sourceId);
    if (visiting.has(sourceId)) throw new NoteImportPlanError('NOTE_IMPORT_TREE_CYCLE');
    visiting.add(sourceId);
    const entry = bySourceId.get(sourceId);
    const depth = entry?.parentSourceId ? resolveDepth(entry.parentSourceId) + 1 : 1;
    visiting.delete(sourceId);
    if (depth > MAX_NOTE_TREE_DEPTH) throw new NoteImportPlanError('NOTE_IMPORT_TREE_DEPTH_EXCEEDED');
    visitedDepth.set(sourceId, depth);
    return depth;
  };
  for (const entry of entries) resolveDepth(entry.sourceId);
  return { entries, missingParentCount };
}

function resolveMappedNoteParentAssignments({ existingRows, createdEntries, oldToNew }) {
  const parentById = new Map(
    existingRows.map((row) => [
      String(row.id),
      normalizeBackupNoteId(row.parentId ?? row.parent_id),
    ]),
  );
  const assignments = [];
  for (const entry of createdEntries) {
    const mappedParentId = entry.parentSourceId ? oldToNew.get(entry.parentSourceId) || null : null;
    if (mappedParentId === entry.newId) throw new NoteImportPlanError('NOTE_IMPORT_TREE_CYCLE');
    parentById.set(entry.newId, mappedParentId);
    assignments.push({ ...entry, parentId: mappedParentId });
  }

  const depthMemo = new Map();
  const resolveDepth = (noteId, path = new Set()) => {
    if (depthMemo.has(noteId)) return depthMemo.get(noteId);
    if (path.has(noteId)) throw new NoteImportPlanError('NOTE_IMPORT_TREE_CYCLE');
    const nextPath = new Set(path).add(noteId);
    const parentId = parentById.get(noteId);
    const depth = parentId && parentById.has(parentId) ? resolveDepth(parentId, nextPath) + 1 : 1;
    if (depth > MAX_NOTE_TREE_DEPTH) throw new NoteImportPlanError('NOTE_IMPORT_TREE_DEPTH_EXCEEDED');
    depthMemo.set(noteId, depth);
    return depth;
  };
  for (const entry of createdEntries) resolveDepth(entry.newId);
  return assignments;
}

const sendNoteImportPlanError = (req, res, error) => {
  const messages = {
    NOTE_IMPORT_DUPLICATE_ID: ['备份中存在重复的笔记 ID', 'The backup contains duplicate note IDs'],
    NOTE_IMPORT_TREE_CYCLE: ['备份中的笔记目录存在循环关系', 'The backup note tree contains a cycle'],
    NOTE_IMPORT_TREE_DEPTH_EXCEEDED: [
      `备份中的笔记目录超过 ${MAX_NOTE_TREE_DEPTH} 层`,
      `The backup note tree exceeds ${MAX_NOTE_TREE_DEPTH} levels`,
    ],
  };
  const [zh, en] = messages[error?.code] || ['备份中的笔记目录无效', 'The backup note tree is invalid'];
  return res.send(resultData({ errorCode: error?.code || 'NOTE_IMPORT_TREE_INVALID' }, 400, L(req, zh, en)));
};

export const exportData = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const [[acct]] = await pool.query('SELECT alias, email FROM user WHERE id = ?', [userId]);
    const [tags] = await pool.query(
      'SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0 ORDER BY create_time',
      [userId],
    );
    const [bookmarks] = await pool.query(
      'SELECT id, name, url, description, create_time FROM bookmark WHERE user_id = ? AND del_flag = 0 ORDER BY create_time DESC',
      [userId],
    );
    const [notes] = await pool.query(
      `SELECT id, title, content, type, parent_id, sort, tree_delete_batch_id, create_time
         FROM note
        WHERE create_by = ? AND del_flag = 0
        ORDER BY create_time DESC`,
      [userId],
    );
    const [files] = await pool.query(
      'SELECT id, file_name, file_size, create_time FROM files WHERE create_by = ? AND del_flag = 0 ORDER BY create_time DESC',
      [userId],
    );
    // 标签关联 → 按资源附上标签名
    const [rels] = await pool.query(
      `SELECT r.resource_type, r.resource_id, t.name FROM resource_tag_relations r
       JOIN tag t ON t.id = r.tag_id AND t.del_flag = 0 WHERE r.user_id = ?`,
      [userId],
    );
    const tagMap = { bookmark: {}, note: {}, file: {} };
    for (const r of rels) {
      const m = tagMap[r.resource_type];
      if (!m) continue;
      (m[r.resource_id] = m[r.resource_id] || []).push(r.name);
    }
    const attach = (rows, type) => rows.map((x) => ({ ...x, tags: tagMap[type][x.id] || [] }));
    const ai = await exportAiUserData(userId, pool);
    res.send(
      resultData({
        formatVersion: 3,
        backupKind: 'metadata_backup',
        exportedAt: new Date().toISOString(),
        restorePolicy: {
          restorable: ['tags', 'bookmarks', 'notes'],
          exportOnly: ['files', 'ai'],
          excluded: ['fileContents', 'noteImages', 'bookmarkSnapshots', 'credentials', 'sessions', 'temporaryIndexes'],
        },
        account: acct ? { alias: acct.alias, email: acct.email } : null,
        counts: {
          bookmarks: bookmarks.length,
          notes: notes.length,
          files: files.length,
          tags: tags.length,
          aiConversations: ai.counts.conversations,
          aiMessages: ai.counts.messages,
          aiMemories: ai.counts.memories,
        },
        tags,
        bookmarks: attach(bookmarks, 'bookmark'),
        notes: attach(notes, 'note'),
        files: attach(files, 'file'),
        ai,
      }),
    );
  } catch (e) {
    console.error('[user-export] failed code=%s', String(e?.code || 'USER_EXPORT_FAILED'));
    res.send(resultData(null, 500, L(req, '导出失败，请稍后重试', 'Export failed. Please try again later.')));
  }
};

// POST /user/importData —— 从 exportData 生成的备份 JSON 恢复数据(书签/笔记/标签)。
// 智能去重:标签按名称复用、书签按网址跳过、笔记按标题+内容跳过;数据归当前登录用户、重新生成 id、尽量保留原创建时间。
// 文件(files)备份里只有元信息、无二进制,无法恢复本体,直接跳过。备份 JSON 的键是驼峰(导出经 camelCaseKeys)。
export const importData = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body;
  if (
    !data ||
    typeof data !== 'object' ||
    (!Array.isArray(data.bookmarks) && !Array.isArray(data.notes) && !Array.isArray(data.tags))
  ) {
    return res.send(
      resultData(
        null,
        400,
        L(
          req,
          '文件格式无效,请选择轻笺导出的备份 JSON',
          'Invalid file, please choose a backup JSON exported from LightNote',
        ),
      ),
    );
  }
  let noteImportPlan;
  try {
    noteImportPlan = buildNoteImportPlan(data.notes);
  } catch (error) {
    if (error instanceof NoteImportPlanError) return sendNoteImportPlanError(req, res, error);
    console.error('[user-import] tree preflight failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '导入预检失败，请稍后重试', 'Import preflight failed')));
  }
  const detected = {
    tags: Array.isArray(data.tags) ? data.tags.length : 0,
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0,
    notes: Array.isArray(data.notes) ? data.notes.length : 0,
    files: Array.isArray(data.files) ? data.files.length : 0,
    aiConversations: Number(data.ai?.counts?.conversations || data.counts?.aiConversations || 0),
  };
  const totalRestorable = detected.tags + detected.bookmarks + detected.notes;
  if (totalRestorable > 50000) {
    return res.send(
      resultData(
        { errorCode: 'BACKUP_ITEM_LIMIT_EXCEEDED' },
        413,
        L(
          req,
          '备份中的可恢复记录超过 50000 条，请拆分后重试',
          'The backup contains more than 50,000 restorable items',
        ),
      ),
    );
  }
  const preflight = {
    canImport: true,
    formatVersion: Number(data.formatVersion || 1),
    backupKind: String(data.backupKind || 'legacy_metadata_backup'),
    detected,
    willRestore: {
      tags: detected.tags,
      bookmarks: detected.bookmarks,
      notes: detected.notes,
    },
    exportOnly: {
      files: detected.files,
      aiConversations: detected.aiConversations,
    },
    warnings: [
      ...(detected.files ? ['FILE_CONTENTS_NOT_RESTORABLE'] : []),
      ...(detected.aiConversations ? ['AI_DATA_EXPORT_ONLY'] : []),
      ...(noteImportPlan.missingParentCount ? ['NOTE_TREE_MISSING_PARENT_REROOTED'] : []),
    ],
  };
  if (req.body?.mode === 'preflight') {
    return res.send(resultData(preflight));
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.id;

    // 预加载现有数据用于去重:标签 name→id、书签网址集、笔记「标题+内容」集
    const [tagRows] = await connection.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
    const [bmRows] = await connection.query('SELECT name, url FROM bookmark WHERE user_id = ? AND del_flag = 0', [
      userId,
    ]);
    const [noteRows] = await connection.query(
      'SELECT id, title, content, parent_id FROM note WHERE create_by = ? AND del_flag = 0',
      [userId],
    );
    const normUrl = (u) => inspectBookmarkUrl(u, { allowTextExtraction: false }).canonicalUrl;
    const noteKey = (t, c) => `${t}\u0000${c}`;
    const tagMap = new Map(tagRows.map((r) => [r.name, r.id]));
    const existUrls = new Set(bmRows.map((r) => normUrl(r.url)).filter(Boolean));
    const existNames = new Set(bmRows.map((r) => r.name).filter(Boolean));
    const existNotes = new Set(noteRows.map((r) => noteKey(r.title || '', r.content || '')));
    const existingNoteIdByKey = new Map(
      noteRows.map((row) => [noteKey(row.title || '', row.content || ''), String(row.id)]),
    );

    // 确保标签存在,返回其 id(已有同名复用,否则新建)
    const ensureTag = async (name) => {
      const nm = String(name || '').trim();
      if (!nm) return null;
      if (tagMap.has(nm)) return tagMap.get(nm);
      const payload = insertData({ name: nm, userId });
      await connection.query('INSERT INTO tag SET ?', [payload]);
      tagMap.set(nm, payload.id);
      return payload.id;
    };

    const stat = {
      tags: { added: 0, reused: 0 },
      bookmarks: { added: 0, skipped: 0, invalid: 0 },
      notes: { added: 0, skipped: 0, rerooted: noteImportPlan.missingParentCount },
      files: { skipped: 0 },
    };

    // 1) 独立标签(即便没被任何资源引用也一并恢复)
    for (const t of Array.isArray(data.tags) ? data.tags : []) {
      const nm = String(t?.name || '').trim();
      if (!nm) continue;
      if (tagMap.has(nm)) {
        stat.tags.reused++;
        continue;
      }
      await ensureTag(nm);
      stat.tags.added++;
    }

    // 2) 书签(按网址去重)
    for (const b of Array.isArray(data.bookmarks) ? data.bookmarks : []) {
      const url = normUrl(b?.url);
      const name = String(b?.name || '').trim();
      if (!url) {
        stat.bookmarks.skipped++;
        stat.bookmarks.invalid++;
        continue;
      }
      const bmName = name || url;
      // 与 addBookmark 的产品规则一致:同一用户下「网址」或「书签名」重复都跳过(避免重复收藏 / 同名冲突)
      if ((url && existUrls.has(url)) || (bmName && existNames.has(bmName))) {
        stat.bookmarks.skipped++;
        continue;
      }
      const payload = insertData({
        name: bmName,
        url,
        description: b?.description || '',
        userId,
        ...(b?.createTime ? { createTime: b.createTime } : {}),
      });
      await connection.query('INSERT INTO bookmark SET ?', [payload]);
      if (url) existUrls.add(url);
      if (bmName) existNames.add(bmName);
      stat.bookmarks.added++;
      const tagIds = [];
      for (const tn of Array.isArray(b?.tags) ? b.tags : []) {
        const id = await ensureTag(tn);
        if (id) tagIds.push(id);
      }
      if (tagIds.length) {
        await insertResourceTagRelations(connection, {
          tagIds,
          resourceType: RESOURCE_TYPE.BOOKMARK,
          resourceId: payload.id,
          userId,
          source: 'import',
        });
      }
    }

    // 3) 笔记第一阶段：全部新记录先落在根目录并建立旧 ID → 新 ID 映射。
    // 父关系必须等所有新 ID 已确定后再恢复，否则备份顺序会决定导入结果。
    const oldToNewNoteIds = new Map();
    const createdNoteEntries = [];
    for (const entry of noteImportPlan.entries) {
      const n = entry.note;
      const title = String(n?.title || '').trim();
      const rawContent = n?.content || '';
      const type = n?.type || 'html';
      const content = type === 'markdown' ? normalizeMarkdownBlockquoteEntities(rawContent) : rawContent;
      if (!title && !content) continue;
      const k = noteKey(title, content);
      if (existNotes.has(k)) {
        const existingId = existingNoteIdByKey.get(k);
        if (existingId) oldToNewNoteIds.set(entry.sourceId, existingId);
        stat.notes.skipped++;
        continue;
      }
      const payload = insertData({
        title: title || 'Untitled',
        content,
        type,
        createBy: userId,
        parentId: null,
        sort: entry.sort,
        treeDeleteBatchId: entry.treeDeleteBatchId,
        ...(n?.createTime ? { createTime: n.createTime } : {}),
      });
      await connection.query('INSERT INTO note SET ?', [payload]);
      oldToNewNoteIds.set(entry.sourceId, payload.id);
      createdNoteEntries.push({ ...entry, newId: payload.id });
      // 笔记内联提及(N0):导入的笔记也在同一导入事务内同步引用;旧/越权/不存在的目标由归属校验自然过滤,
      // 不阻断正文导入;解析或同步抛错则整个导入事务回滚(与其它写路径一致)。
      const importedRefs = extractOwnedResourceRefs({ content, type: payload.type });
      if (importedRefs.length) {
        await syncNoteResourceRefs(connection, { userId, noteId: payload.id, refs: importedRefs });
      }
      existNotes.add(k);
      existingNoteIdByKey.set(k, payload.id);
      stat.notes.added++;
      const tagIds = [];
      for (const tn of Array.isArray(n?.tags) ? n.tags : []) {
        const id = await ensureTag(tn);
        if (id) tagIds.push(id);
      }
      if (tagIds.length) {
        await insertResourceTagRelations(connection, {
          tagIds,
          resourceType: RESOURCE_TYPE.NOTE,
          resourceId: payload.id,
          userId,
          source: 'import',
        });
      }
    }

    // 笔记第二阶段：在同一事务内恢复映射后的父关系。缺失父节点已在预检中降到根；
    // 这里再结合账号现有树检查循环和总深度，任何冲突都回滚整个导入。
    const parentAssignments = resolveMappedNoteParentAssignments({
      existingRows: noteRows,
      createdEntries: createdNoteEntries,
      oldToNew: oldToNewNoteIds,
    });
    for (const assignment of parentAssignments) {
      if (!assignment.parentId) continue;
      const [result] = await connection.query(
        `UPDATE note
            SET parent_id = ?, update_time = update_time
          WHERE id = ? AND create_by = ? AND del_flag = 0`,
        [assignment.parentId, assignment.newId, userId],
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        throw new NoteImportPlanError('NOTE_IMPORT_TREE_CONFLICT');
      }
    }

    // 4) 文件:备份无二进制,无法恢复本体,仅计数跳过
    stat.files.skipped = Array.isArray(data.files) ? data.files.length : 0;

    await connection.commit();
    if (stat.notes.added > 0) await invalidatePersonalKnowledgeCache(userId);
    if (!req.suppressUserRewards) {
      const completionJobs = [];
      if (stat.bookmarks.added > 0) {
        completionJobs.push(completeGrowthTask(userId, 'first_bookmark', { userRole: req.user.role }));
      }
      if (stat.notes.added > 0) {
        completionJobs.push(completeGrowthTask(userId, 'first_note', { userRole: req.user.role }));
      }
      Promise.allSettled(completionJobs).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          console.warn('[growth] 账号导入成长任务补全失败');
        }
      });
    }
    res.send(resultData({ ...stat, preflight }));
  } catch (e) {
    await connection.rollback();
    if (e instanceof NoteImportPlanError) return sendNoteImportPlanError(req, res, e);
    console.error('[user-import] failed code=%s', String(e?.code || 'USER_IMPORT_FAILED'));
    res.send(resultData(null, 500, L(req, '导入失败，请稍后重试', 'Import failed. Please try again later.')));
  } finally {
    connection.release();
  }
};
